import { NextRequest, NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/email";
import { db } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  In-memory OTP store (works on serverless / Vercel)                */
/* ------------------------------------------------------------------ */

type OtpEntry = {
  code: string;
  expiresAt: number;
  verified: boolean;
};

const otpStore = new Map<string, OtpEntry>();
const OTP_TTL_MS = 1 * 60 * 1000; // 1 menit
const OTP_LENGTH = 6;

function generateCode(): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += digits[Math.floor(Math.random() * 10)];
  }
  return code;
}

function normalizePhone(phone: string): string {
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  return p;
}

/** Cari email user berdasarkan nomor WhatsApp */
async function findEmailByPhone(phone: string): Promise<string | null> {
  try {
    const user = await db.user.findFirst({ where: { phone } });
    return user?.email ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/auth/otp                                                 */
/*  Body: { phone, action, code?, email? }                            */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone: rawPhone, action, code, email: bodyEmail } = body as {
      phone: string;
      action: "send" | "verify";
      code?: string;
      email?: string;
    };

    if (!rawPhone || !action) {
      return NextResponse.json({ error: "Nomor WhatsApp wajib diisi" }, { status: 400 });
    }

    const phone = normalizePhone(rawPhone);

    if (action === "send") {
      // Rate limit: max 1 OTP per 60 seconds
      const existing = otpStore.get(phone);
      if (existing && Date.now() - (existing.expiresAt - OTP_TTL_MS) < 60_000) {
        const waitSec = Math.ceil(60 - (Date.now() - (existing.expiresAt - OTP_TTL_MS)) / 1000);
        return NextResponse.json({ error: `Tunggu ${waitSec} detik sebelum mengirim ulang`, waitSec });
      }

      // Cari email: dari body (register) atau dari database (login)
      const email = bodyEmail || (await findEmailByPhone(phone));
      if (!email) {
        return NextResponse.json({ error: "Email tidak ditemukan untuk nomor ini" }, { status: 400 });
      }

      const otpCode = generateCode();
      otpStore.set(phone, {
        code: otpCode,
        expiresAt: Date.now() + OTP_TTL_MS,
        verified: false,
      });

      console.log(`[OTP] Phone: ${phone}, Email: ${email}, Code: ${otpCode}`);

      // Kirim OTP via Email saja
      const emailResult = await sendOtpEmail(email, otpCode);
      if (emailResult.success) {
        return NextResponse.json({
          success: true,
          message: `OTP terkirim ke ${email}`,
          sentViaEmail: true,
        });
      }

      // Fallback: email gagal, tampilkan kode di frontend
      console.warn(`[OTP] Email send failed for ${email}: ${emailResult.error}`);
      return NextResponse.json({
        success: true,
        message: "OTP terkirim (mode dev)",
        _devCode: otpCode,
        sentViaEmail: false,
      });
    }

    if (action === "verify") {
      if (!code) {
        return NextResponse.json({ error: "Kode OTP wajib diisi" }, { status: 400 });
      }

      const entry = otpStore.get(phone);
      if (!entry) {
        return NextResponse.json({ error: "OTP tidak ditemukan. Silakan kirim ulang." }, { status: 400 });
      }

      if (Date.now() > entry.expiresAt) {
        otpStore.delete(phone);
        return NextResponse.json({ error: "OTP sudah expired. Silakan kirim ulang." }, { status: 400 });
      }

      if (entry.code !== code) {
        return NextResponse.json({ error: "Kode OTP salah" }, { status: 400 });
      }

      entry.verified = true;
      return NextResponse.json({ success: true, message: "OTP terverifikasi" });
    }

    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Gagal memproses OTP" }, { status: 500 });
  }
}

// Check if a phone number has been verified (used by login/register)
export function isPhoneVerified(phone: string): boolean {
  const normalized = normalizePhone(phone);
  const entry = otpStore.get(normalized);
  return entry?.verified === true;
}

// Mark phone as verified (after successful login/register, keep for session)
export function markPhoneVerified(phone: string) {
  const normalized = normalizePhone(phone);
  const entry = otpStore.get(normalized);
  if (entry) entry.verified = true;
}
