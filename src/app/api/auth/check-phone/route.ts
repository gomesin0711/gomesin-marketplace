import { NextRequest, NextResponse } from "next/server";
import { isPhoneTaken } from "@/lib/auth-fallback";

/**
 * GET /api/auth/check-phone?phone=0812-xxxx-xxxx
 *
 * Real-time check whether a phone number is already registered.
 * Used by the registration form to give immediate feedback (like /check-email
 * does for emails) before the user clicks "Kirim OTP" or "Daftar".
 *
 * Searches BOTH the SQLite DB (primary) and the fallback in-memory store
 * (secondary — always has the seed admin + any users registered via fallback),
 * so duplicates are detected even after a DB re-seed.
 *
 * Returns: { exists: boolean }
 */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) {
    return NextResponse.json({ error: "Nomor WhatsApp wajib diisi" }, { status: 400 });
  }

  // Basic phone validation — must be 9–15 digits.
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 9 || digits.length > 15) {
    return NextResponse.json({ error: "Nomor WhatsApp tidak valid" }, { status: 400 });
  }

  try {
    const exists = await isPhoneTaken(phone);
    return NextResponse.json({ exists });
  } catch (e) {
    console.error("[check-phone] error:", e);
    // On error, return false so the user isn't blocked — the final
    // /api/auth/register and /api/auth/register-otp routes still enforce
    // uniqueness server-side.
    return NextResponse.json({ exists: false });
  }
}
