import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

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

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
  }
  const emailNorm = email.trim().toLowerCase();

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      // SQLite is case-sensitive by default. Use COLLATE NOCASE so that
      // mixed-case legacy emails (e.g. seeded admin "mesinKU0711@...") are
      // still detected when the user types the lowercased variant.
      const matches = await db.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM User WHERE email = ${emailNorm} COLLATE NOCASE LIMIT 1
      `;
      if (matches && matches.length > 0) return NextResponse.json({ exists: true });
      // not found in Prisma → fall through to Supabase
    } catch {
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    // ilike = case-insensitive LIKE. Escape wildcards so the email is matched
    // literally rather than as a pattern.
    const escaped = emailNorm.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const { data, error } = await supabase
      .from("User")
      .select("id")
      .ilike("email", escaped)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[check-email] Supabase error:", error);
      return NextResponse.json({ exists: false });
    }
    return NextResponse.json({ exists: !!data });
  } catch (e) {
    console.error("[check-email] error:", e);
    return NextResponse.json({ exists: false });
  }
}
