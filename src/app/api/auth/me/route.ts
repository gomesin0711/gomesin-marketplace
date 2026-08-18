import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { fallbackGetUserById } from "@/lib/auth-fallback";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/auth/login/route.ts.
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

// GET /api/auth/me — return the verified current user from the session cookie.
//
// This is the SINGLE source of truth for "who am I" on the frontend. The
// frontend calls this on app mount to verify the session is still valid
// and to fetch the freshest user object. If the session is missing/invalid
// (e.g. cookie expired, or user cleared cookies), the frontend should treat
// the user as logged out.
//
// The client-supplied `?userId=xxx` query param is IGNORED — the user is
// resolved exclusively from the verified session cookie. This prevents
// account A from reading account B's profile by passing B's userId.
//
// === WHY WE CHECK SUPABASE ===
// On Vercel production, Prisma (sqlite provider) cannot connect to the
// PostgreSQL database, and the in-memory fallback is wiped on every
// serverless cold start. Without the Supabase path, EVERY /api/auth/me
// call on Vercel returns 401 → the frontend logs the user out on every
// page refresh. This was the root cause of the "login logout on refresh"
// bug reported on mobile (Vercel production).
export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const user = await db.user.findUnique({ where: { id: session.id } });
      if (user) {
        return NextResponse.json({
          user: {
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
          },
        });
      }
      // Not found locally → fall through to Supabase / in-memory fallback
    } catch {
      // fall through
    }
  }

  // --- Path B: Supabase (Vercel production) ---
  // On Vercel, the in-memory fallback is wiped on cold start, so we MUST
  // check Supabase to find the user. Without this, every refresh on
  // production returns 401 and logs the user out.
  try {
    const supabase = await getSupabase();
    const { data: supaUser, error } = await supabase
      .from("User")
      .select("id, name, email, phone, city, company, address, bannerImage, logoImage, role, createdAt")
      .eq("id", session.id)
      .limit(1)
      .maybeSingle();

    if (!error && supaUser) {
      return NextResponse.json({
        user: {
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
        },
      });
    }
  } catch (supaErr) {
    console.error("[auth/me] Supabase lookup error:", supaErr);
    // fall through to in-memory fallback
  }

  // --- Path C: in-memory fallback (last resort) ---
  const user = await fallbackGetUserById(session.id);
  if (!user) {
    // Session points to a user that no longer exists — treat as logged out.
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
