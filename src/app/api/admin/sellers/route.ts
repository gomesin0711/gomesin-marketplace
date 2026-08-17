import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
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

// GET: list all sellers with listing counts
export async function GET(req: NextRequest) {
  const adminCheck = requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;
  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const sellers = await db.seller.findMany({
        orderBy: { joinedAt: "desc" },
      });

      // Count listings per seller separately (Supabase doesn't support nested includes well)
      const listingCounts = await db.listing.groupBy({
        by: ["sellerId"],
        _count: true,
      });
      const countMap: Record<string, number> = {};
      for (const c of listingCounts) {
        countMap[c.sellerId] = (c._count as any)?._all ?? (typeof c._count === 'number' ? c._count : 0);
      }

      return NextResponse.json({
        sellers: sellers.map((s: any) => ({
          ...s,
          joinedAt: s.joinedAt instanceof Date ? s.joinedAt.toISOString() : s.joinedAt,
          listingCount: countMap[s.id] || 0,
        })),
      });
    } catch (error) {
      console.error("[admin/sellers] Prisma GET error, falling back to Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  // NOTE: Supabase tables in this project have NO foreign-key relationships
  // declared, so we cannot use nested .select("*, listing(*)"). Instead we
  // fetch Seller rows and batch-count listings per seller client-side.
  try {
    const supabase = await getSupabase();
    const { data: sellers, error } = await supabase
      .from("Seller")
      .select("*")
      .order("joinedAt", { ascending: false });
    if (error) {
      console.error("[admin/sellers] Supabase GET error:", error);
      return NextResponse.json({ sellers: [] });
    }

    const sellerRows: any[] = sellers || [];

    // Single round-trip: pull every listing's sellerId, count client-side.
    const countMap: Record<string, number> = {};
    if (sellerRows.length > 0) {
      const { data: listingRows, error: lErr } = await supabase
        .from("Listing")
        .select("sellerId");
      if (!lErr && listingRows) {
        for (const row of listingRows) {
          const sid = (row as any)?.sellerId;
          if (sid) countMap[sid] = (countMap[sid] || 0) + 1;
        }
      } else if (lErr) {
        console.error("[admin/sellers] Supabase listing-count error:", lErr);
      }
    }

    return NextResponse.json({
      sellers: sellerRows.map((s: any) => ({
        ...s,
        joinedAt: s.joinedAt ?? null,
        listingCount: countMap[s.id] || 0,
      })),
    });
  } catch (error) {
    console.error("[admin/sellers] GET error:", error);
    return NextResponse.json({ sellers: [] });
  }
}

// PATCH: toggle verified status
export async function PATCH(req: NextRequest) {
  const adminCheck = requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;
  try {
    const { id, verified } = await req.json();
    if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });
    const updated = await db.seller.update({
      where: { id },
      data: { verified: !!verified },
    });
    return NextResponse.json({ seller: updated });
  } catch (error) {
    console.error("[admin/sellers] PATCH error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
