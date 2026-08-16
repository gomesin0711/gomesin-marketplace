import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

/* ------------------------------------------------------------------ */
/*  Forgot Password — OTP via WhatsApp                                */
/*                                                                    */
/*  Self-contained flow (does NOT touch /api/auth/otp which is used   */
/*  by the register/login email-OTP flow).                            */
/*                                                                    */
/*  POST /api/auth/forgot-password                                    */
/*  Body: { action: "send" | "verify" | "reset", phone, code?, newPassword? } */
/* ------------------------------------------------------------------ */

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Mirrors /api/auth/register/route.ts.
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yzxeinqoryvprhuibtzn.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eGVpbnFvcnl2cHJodWlidHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjA5NTcsImV4cCI6MjEwMjQzNjk1N30.gmDvyEmNGP2PbL_3a8k18pTggRE9zQ3yBrBPQNJjWTI";

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

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

/** All plausible variants of a phone number to match against stored values. */
function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/[^0-9]/g, "");
  const normalized = normalizePhone(phone);
  const withLeading0 = "0" + normalized.slice(2);
  const withPlus = "+" + normalized;
  const set = new Set<string>([normalized, withLeading0, withPlus, digits]);
  return [...set];
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
/*  Find user by phone — Prisma → Supabase                             */
/* ------------------------------------------------------------------ */

async function findUserIdByPhone(phone: string): Promise<string | null> {
  const variants = phoneVariants(phone);

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const user = await db.user.findFirst({
        where: { phone: { in: variants } },
        select: { id: true },
      });
      if (user) return user.id;
    } catch (prismaErr) {
      console.error("[forgot-password] Prisma error:", prismaErr);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("User")
      .select("id,phone")
      .in("phone", variants)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[forgot-password] Supabase lookup error:", error);
    }
    if (data?.id) return data.id;
  } catch (supaErr) {
    console.error("[forgot-password] Supabase fallback error:", supaErr);
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Update password — Prisma → Supabase                                */
/* ------------------------------------------------------------------ */

async function updateUserPassword(userId: string, hashedPassword: string): Promise<boolean> {
  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      await db.user.update({
        where: { id: userId },
        data: { password: hashedPassword, updatedAt: new Date() },
      });
      return true;
    } catch (prismaErr) {
      console.error("[forgot-password] Prisma update error:", prismaErr);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("User")
      .update({ password: hashedPassword, updatedAt: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      console.error("[forgot-password] Supabase update error:", error);
      return false;
    }
    return true;
  } catch (supaErr) {
    console.error("[forgot-password] Supabase update fallback error:", supaErr);
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      phone: rawPhone,
      code,
      newPassword,
    } = body as {
      action?: "send" | "verify" | "reset";
      phone?: string;
      code?: string;
      newPassword?: string;
    };

    if (!action) {
      return NextResponse.json({ error: "Action wajib diisi" }, { status: 400 });
    }
    if (!rawPhone) {
      return NextResponse.json({ error: "Nomor WhatsApp wajib diisi" }, { status: 400 });
    }

    const phone = normalizePhone(rawPhone);

    /* ---------------- ACTION: SEND OTP ---------------- */
    if (action === "send") {
      // Rate limit
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

      // Find user by phone
      const userId = await findUserIdByPhone(rawPhone);
      if (!userId) {
        return NextResponse.json(
          { error: "Nomor WhatsApp tidak terdaftar. Periksa kembali nomor Anda." },
          { status: 404 }
        );
      }

      const otpCode = generateCode();
      otpStore.set(phone, {
        code: otpCode,
        expiresAt: Date.now() + OTP_TTL_MS,
        verified: false,
        createdAt: Date.now(),
      });

      console.log(`[forgot-password] Phone: ${phone}, OTP: ${otpCode}`);

      // Compose WhatsApp message — OTP code FIRST so it's visible in the
      // WhatsApp notification preview without opening the chat.
      const message =
        `*${otpCode}* — Kode OTP mesinKU\n\n` +
        `Kode OTP untuk reset kata sandi Anda.\n\n` +
        `Jangan berikan kode ini kepada siapa pun.\n` +
        `Kode berlaku 5 menit.\n\n` +
        `Jika Anda tidak meminta reset sandi, abaikan pesan ini.`;

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
      console.warn(`[forgot-password] WhatsApp send failed: ${waResult.error}`);
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
        return NextResponse.json({ error: "Kode OTP wajib diisi" }, { status: 400 });
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
        return NextResponse.json({ error: "Kode OTP salah" }, { status: 400 });
      }

      entry.verified = true;
      return NextResponse.json({ success: true, message: "OTP terverifikasi" });
    }

    /* ---------------- ACTION: RESET PASSWORD ---------------- */
    if (action === "reset") {
      if (!newPassword) {
        return NextResponse.json({ error: "Kata sandi baru wajib diisi" }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "Kata sandi baru minimal 6 karakter." },
          { status: 400 }
        );
      }

      const entry = otpStore.get(phone);
      if (!entry || !entry.verified) {
        return NextResponse.json(
          { error: "Verifikasi OTP diperlukan sebelum reset sandi." },
          { status: 403 }
        );
      }

      if (Date.now() > entry.expiresAt) {
        otpStore.delete(phone);
        return NextResponse.json(
          { error: "Sesi kedaluwarsa. Silakan ulangi dari awal." },
          { status: 400 }
        );
      }

      // Re-find the user (in case store was cleared)
      const userId = await findUserIdByPhone(rawPhone);
      if (!userId) {
        return NextResponse.json(
          { error: "User tidak ditemukan." },
          { status: 404 }
        );
      }

      const hashed = hashPassword(newPassword);
      const updated = await updateUserPassword(userId, hashed);

      if (!updated) {
        return NextResponse.json(
          { error: "Gagal memperbarui kata sandi. Silakan coba lagi." },
          { status: 500 }
        );
      }

      // Consume the OTP entry so it can't be reused
      otpStore.delete(phone);

      return NextResponse.json({
        success: true,
        message: "Kata sandi berhasil diubah. Silakan masuk dengan sandi baru.",
      });
    }

    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  } catch (err: any) {
    console.error("[forgot-password] error:", err?.message || err);
    return NextResponse.json(
      { error: "Gagal memproses permintaan." },
      { status: 500 }
    );
  }
}
