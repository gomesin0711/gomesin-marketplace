import { NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/admin/listings/route.ts.
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

// GET /api/admin/info
// Public endpoint — returns the first admin user's id + name.
// Needed so any logged-in user can route chat messages (e.g. payment proof
// bukti pembayaran) to the admin via the in-app chat / socket.
//
// Only exposes id + name (NO email / phone / password) — safe to share.
// On DB error / no admin found, returns { admin: null } with HTTP 200 so the
// frontend doesn't get stuck in an infinite loading skeleton on Vercel.
export async function GET() {
  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const admin = await db.user.findFirst({
        where: { role: "admin" },
        select: { id: true, name: true },
      });

      if (!admin) {
        return NextResponse.json({ admin: null });
      }

      return NextResponse.json({ admin });
    } catch (error) {
      console.error("[admin/info] Prisma GET error, falling back to Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  // CRITICAL: this endpoint powers payment-proof chat routing on production.
  // Without it, /api/admin/info returns { admin: null } on Vercel and the
  // frontend cannot route bukti pembayaran images to the admin chat.
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("User")
      .select("id,name")
      .eq("role", "admin")
      .limit(1)
      .single();

    if (error) {
      // .single() throws PGRST116 when no rows match — treat as "no admin".
      console.error("[admin/info] Supabase GET error:", error);
      return NextResponse.json({ admin: null });
    }

    if (!data) {
      return NextResponse.json({ admin: null });
    }

    return NextResponse.json({ admin: { id: data.id, name: data.name } });
  } catch (error) {
    console.error("[admin/info] GET error:", error);
    return NextResponse.json({ admin: null });
  }
}
