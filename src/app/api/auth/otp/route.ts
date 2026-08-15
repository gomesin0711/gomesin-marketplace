import { NextRequest, NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/email";
import { db } from "@/lib/db";
import { getAuthStore } from "@/lib/auth-fallback";
import {
  normalizePhone,
  generateOtpCode,
  setOtp,
  getOtp,
  deleteOtp,
  isPhoneVerified,
  markPhoneVerified,
  phonesMatch,
  OTP_TTL_MS,
  OTP_LENGTH,
  getOtpCooldownSec,
} from "@/lib/otp-store";

/* ------------------------------------------------------------------ */
/*  In-memory OTP store now lives in @/lib/otp-store so that the      */
/*  login route can read verification status from the SAME Map.       */
/*  (Previously the store was module-local here, which caused a       */
/*  separate instance in the login bundle → login always saw          */
/*  "not verified".)                                                   */
/* ------------------------------------------------------------------ */

/** Cari email user berdasarkan nomor WhatsApp.
 *  Phone numbers in the DB may be stored in various formats (with dashes,
 *  with/without country code). We use `phonesMatch()` which normalizes BOTH
 *  numbers before comparing — see otp-store.ts for why naive slice(-10) fails.
 *
 *  We check TWO sources:
 *  1. Prisma/SQLite (primary) — works locally and has registered users.
 *  2. Fallback in-memory store (secondary) — always has the seed admin and
 *     any users registered via the fallback path. This ensures WA login
 *     still works even if the SQLite DB is wiped/re-seeded.
 */
async function findEmailByPhone(phone: string): Promise<string | null> {
  // 1. Try Prisma/SQLite first
  try {
    const users = await db.user.findMany({ where: { phone: { not: null } } });
    const user = users.find((u) => phonesMatch(u.phone, phone));
    if (user?.email) return user.email;
  } catch {
    // SQLite unavailable — continue to fallback
  }

  // 2. Fallback: in-memory + /tmp file store (always has seed admin)
  try {
    const store = await getAuthStore();
    for (const u of store.values()) {
      if (u.phone && phonesMatch(u.phone, phone)) {
        return u.email;
      }
    }
  } catch {
    // Fallback store unavailable
  }

  return null;
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
      const waitSec = getOtpCooldownSec(phone);
      if (waitSec > 0) {
        return NextResponse.json(
          { error: `Tunggu ${waitSec} detik sebelum mengirim ulang`, waitSec },
          { status: 429 }
        );
      }

      // Cari email: dari body (register) atau dari database (login)
      const email = bodyEmail || (await findEmailByPhone(phone));
      if (!email) {
        return NextResponse.json({ error: "Email tidak ditemukan untuk nomor ini" }, { status: 400 });
      }

      const otpCode = generateOtpCode(OTP_LENGTH);
      setOtp(phone, otpCode);

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

      const entry = getOtp(phone);
      if (!entry) {
        return NextResponse.json({ error: "OTP tidak ditemukan. Silakan kirim ulang." }, { status: 400 });
      }

      if (Date.now() > entry.expiresAt) {
        deleteOtp(phone);
        return NextResponse.json({ error: "OTP sudah expired. Silakan kirim ulang." }, { status: 400 });
      }

      if (entry.code !== code) {
        return NextResponse.json({ error: "Kode OTP salah" }, { status: 400 });
      }

      markPhoneVerified(phone);
      return NextResponse.json({ success: true, message: "OTP terverifikasi" });
    }

    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Gagal memproses OTP" }, { status: 500 });
  }
}

// Re-export for backward compatibility (login route imports from here).
export { isPhoneVerified, markPhoneVerified } from "@/lib/otp-store";
