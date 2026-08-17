import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { fallbackFindUser, fallbackFindUserByPhone } from "@/lib/auth-fallback";
import { isPhoneVerified, normalizePhone, phonesMatch } from "@/lib/otp-store";
import { setSessionCookie, createSessionToken } from "@/lib/session";

// Wrap a successful auth response (login/register) with a session cookie.
// All successful login paths MUST go through this helper so the cookie is set.
// `req` is passed so setSessionCookie can read X-Forwarded-Proto and choose
// SameSite=None+Secure (HTTPS / preview iframe) vs SameSite=Lax (local HTTP).
//
// In addition to the httpOnly cookie, we return the raw session token in the
// JSON body as `sessionToken`. The client stores this in sessionStorage (which
// is per-tab, unlike httpOnly cookies which are shared across all tabs) and
// sends it as an `Authorization: Bearer <token>` header on subsequent API
// requests. This enables multiple tabs in the same browser to be logged into
// DIFFERENT accounts simultaneously — the per-tab header takes priority over
// the shared cookie (see getSessionUser in src/lib/session.ts).
type AuthUser = { id: string; role?: string; [key: string]: unknown };
function authResponse(user: AuthUser, status: number = 200, req?: NextRequest) {
  const token = createSessionToken(user.id, user.role || "user");
  const res = NextResponse.json({ user, sessionToken: token }, { status });
  // Also set the httpOnly cookie (for backward compat + tabs that don't
  // have a per-tab token yet).
  setSessionCookie(res, user.id, user.role || "user", req);
  return res;
}

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
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

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password, phone } = body as {
    email?: string;
    password?: string;
    phone?: string;
  };

  // ===== Phone-based login (WhatsApp OTP) =====
  if (phone) {
    const normalizedPhone = normalizePhone(phone);

    // Verify OTP was completed
    if (!isPhoneVerified(normalizedPhone)) {
      return NextResponse.json(
        { error: "Silakan verifikasi OTP terlebih dahulu." },
        { status: 401 }
      );
    }

    // Try SQLite/Prisma first
    try {
      const users = await db.user.findMany({
        where: { phone: { not: null } },
      });
      const user = users.find((u) => phonesMatch(u.phone, normalizedPhone));

      if (!user) {
        return NextResponse.json(
          { error: "Nomor WhatsApp tidak terdaftar." },
          { status: 404 }
        );
      }

      return authResponse({
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          city: user.city,
          company: user.company,
          address: user.address,
          bannerImage: user.bannerImage,
          logoImage: user.logoImage,
          role: user.role,
          createdAt:
            user.createdAt instanceof Date
              ? user.createdAt.toISOString()
              : user.createdAt,
        }, 200, req);
    } catch {
      // SQLite unavailable — use fallback
    }

    // Fallback: in-memory + /tmp file store
    const result = await fallbackFindUserByPhone(normalizedPhone);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return authResponse(result.user, 200, req);
  }

  // ===== Email + Password login =====
  const emailNorm = (email ?? "").trim().toLowerCase();

  if (!emailNorm || !password) {
    return NextResponse.json(
      { error: "Email dan kata sandi wajib diisi." },
      { status: 400 }
    );
  }

  // Try SQLite/Prisma first
  try {
    // SQLite is case-sensitive by default; use COLLATE NOCASE so that users
    // who registered with a mixed-case email (or legacy seeded accounts) can
    // still log in with the lowercased variant.
    const matches = await db.$queryRaw<Array<{
      id: string; email: string; name: string; password: string;
      phone: string | null; city: string | null; company: string | null;
      address: string | null; bannerImage: string | null; logoImage: string | null;
      role: string; createdAt: string;
    }>>`SELECT * FROM User WHERE email = ${emailNorm} COLLATE NOCASE LIMIT 1`;
    const user = matches && matches.length > 0 ? matches[0] : null;
    if (user && verifyPassword(password, user.password)) {
      return authResponse({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
        company: user.company,
        address: user.address,
        bannerImage: user.bannerImage,
        logoImage: user.logoImage,
        role: user.role,
        createdAt: user.createdAt,
      }, 200, req);
    }
    // If Prisma found no user OR password didn't match, fall through to
    // the Supabase fallback (the user may exist in Supabase but not in
    // the local SQLite — common on Vercel where the two DBs are separate).
  } catch {
    // SQLite unavailable (e.g. Vercel serverless) — try Supabase next
  }

  // --- Supabase fallback (Vercel) ---
  try {
    const supabase = await getSupabase();
    // Case-insensitive email match (ilike). Escape LIKE wildcards.
    const escaped = emailNorm.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const { data: supaUser, error } = await supabase
      .from("User")
      .select("*")
      .ilike("email", escaped)
      .limit(1)
      .maybeSingle();

    if (!error && supaUser) {
      // Verify password against the stored scrypt hash
      if (!verifyPassword(password, supaUser.password || "")) {
        return NextResponse.json(
          { error: "Email atau kata sandi salah." },
          { status: 401 }
        );
      }
      return authResponse({
        id: supaUser.id,
        name: supaUser.name,
        email: supaUser.email,
        phone: supaUser.phone,
        city: supaUser.city,
        company: supaUser.company,
        address: supaUser.address,
        bannerImage: supaUser.bannerImage,
        logoImage: supaUser.logoImage,
        role: supaUser.role,
        createdAt: supaUser.createdAt,
      }, 200, req);
    }
  } catch (supaErr) {
    console.error("[auth/login] Supabase fallback error:", supaErr);
  }

  // Fallback: in-memory + /tmp file store
  const result = await fallbackFindUser(emailNorm, password);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return authResponse(result.user, 200, req);
}
