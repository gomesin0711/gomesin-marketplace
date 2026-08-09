import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nyyvmttbwlwqunigkrms.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8";

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
      const user = await db.user.findFirst({ where: { email: emailNorm } });
      if (user) return NextResponse.json({ exists: true });
      // not found in Prisma → fall through to Supabase
    } catch {
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("User")
      .select("id")
      .eq("email", emailNorm)
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
