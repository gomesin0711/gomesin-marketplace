import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

/* ------------------------------------------------------------------ */
/*  Register OTP — WhatsApp OTP for NEW users (before registration)    */
/*                                                                    */
/*  This is SEPARATE from /api/auth/forgot-password (which is for      */
/*  existing users). For registration, the phone is NOT yet in the     */
/*  DB, so we just send + verify the OTP without looking up a user.    */
/*                                                                    */
/*  POST /api/auth/register-otp                                        */
/*  Body: { action: "send" | "verify", phone, code? }                  */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Phone normalization                                                */
/* ------------------------------------------------------------------ */

/** Normalize to digits-only with 62 country code (Indonesia). */
function normalizePhone(phone: string): string {
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  if (!p.startsWith("62") && p.length > 0) p = "62" + p;
  return p;
}

/* ------------------------------------------------------------------ */
/*  In-memory OTP store (works on serverless / Vercel warm starts)     */
/* ------------------------------------------------------------------ */

type OtpEntry = {
  code: string;
  expiresAt: number;
  verified: boolean;
  createdAt: number;
};

const otpStore = new Map<string, OtpEntry>();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 menit
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_MS = 60_000; // 60 detik antar kirim

function generateCode(): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += digits[Math.floor(Math.random() * 10)];
  }
  return code;
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, phone: rawPhone, code } = body as {
      action?: "send" | "verify";
      phone?: string;
      code?: string;
    };

    if (!action) {
      return NextResponse.json({ error: "Action wajib diisi" }, { status: 400 });
    }
    if (!rawPhone) {
      return NextResponse.json(
        { error: "Nomor WhatsApp wajib diisi" },
        { status: 400 }
      );
    }

    // Basic phone validation — must be 9–15 digits.
    const digits = rawPhone.replace(/[^0-9]/g, "");
    if (digits.length < 9 || digits.length > 15) {
      return NextResponse.json(
        { error: "Nomor WhatsApp tidak valid" },
        { status: 400 }
      );
    }

    const phone = normalizePhone(rawPhone);

    /* ---------------- ACTION: SEND OTP ---------------- */
    if (action === "send") {
      // Rate limit (cooldown 60s between sends)
      const existing = otpStore.get(phone);
      if (existing && Date.now() - existing.createdAt < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil(
          (RESEND_COOLDOWN_MS - (Date.now() - existing.createdAt)) / 1000
        );
        return NextResponse.json(
          { error: `Tunggu ${waitSec} detik sebelum mengirim ulang`, waitSec },
          { status: 429 }
        );
      }

      const otpCode = generateCode();
      otpStore.set(phone, {
        code: otpCode,
        expiresAt: Date.now() + OTP_TTL_MS,
        verified: false,
        createdAt: Date.now(),
      });

      console.log(
        `[register-otp] Phone: ${phone}, OTP: ${otpCode}`
      );

      // Compose WhatsApp message
      const message =
        `*mesinKU — KODE VERIFIKASI*\n\n` +
        `Kode OTP untuk pendaftaran akun Anda:\n\n` +
        `*${otpCode}*\n\n` +
        `Jangan berikan kode ini kepada siapa pun.\n` +
        `Kode berlaku 5 menit.\n\n` +
        `Jika Anda tidak meminta kode ini, abaikan pesan ini.`;

      // Try sending via Fonnte (real WhatsApp)
      const waResult = await sendWhatsAppMessage(phone, message);

      if (waResult.success) {
        return NextResponse.json({
          success: true,
          message: `Kode OTP terkirim ke WhatsApp ${phone}`,
          sentViaWhatsapp: true,
        });
      }

      // Fallback: Fonnte failed (no key / device disconnected) → dev mode
      console.warn(
        `[register-otp] WhatsApp send failed: ${waResult.error}`
      );
      return NextResponse.json({
        success: true,
        message: "OTP terkirim (mode dev — Fonnte tidak aktif)",
        sentViaWhatsapp: false,
        _devCode: otpCode,
        _devNote: waResult.error,
      });
    }

    /* ---------------- ACTION: VERIFY OTP ---------------- */
    if (action === "verify") {
      if (!code) {
        return NextResponse.json(
          { error: "Kode OTP wajib diisi" },
          { status: 400 }
        );
      }

      const entry = otpStore.get(phone);
      if (!entry) {
        return NextResponse.json(
          { error: "OTP tidak ditemukan. Silakan kirim ulang." },
          { status: 400 }
        );
      }

      if (Date.now() > entry.expiresAt) {
        otpStore.delete(phone);
        return NextResponse.json(
          { error: "OTP sudah kedaluwarsa. Silakan kirim ulang." },
          { status: 400 }
        );
      }

      if (entry.code !== code) {
        return NextResponse.json(
          { error: "Kode OTP salah" },
          { status: 400 }
        );
      }

      entry.verified = true;
      return NextResponse.json({
        success: true,
        message: "OTP terverifikasi",
        verified: true,
      });
    }

    return NextResponse.json(
      { error: "Action tidak valid" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[register-otp] error:", err?.message || err);
    return NextResponse.json(
      { error: "Gagal memproses permintaan." },
      { status: 500 }
    );
  }
}
