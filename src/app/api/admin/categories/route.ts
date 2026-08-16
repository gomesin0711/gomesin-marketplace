import { NextRequest, NextResponse } from "next/server";
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

// GET all categories
export async function GET() {
  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const cats = await db.category.findMany({ orderBy: { sortOrder: "asc" } });
      const counts = await db.listing.groupBy({ by: ["categoryId"], _count: true });
      const map: Record<string, number> = {};
      counts.forEach((c: any) => {
        map[c.categoryId] = (c._count as any)?._all ?? (typeof c._count === 'number' ? c._count : 0);
      });
      return NextResponse.json({
        categories: cats.map((c) => ({ ...c, listingCount: map[c.id] ?? 0 })),
      });
    } catch (error) {
      console.error("[admin/categories] Prisma GET error, falling back to Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  // NOTE: Supabase tables in this project have NO foreign-key relationships
  // declared, so we cannot use nested .select("*, listing(*)"). Instead we
  // fetch Category rows and batch-count listings per category client-side.
  try {
    const supabase = await getSupabase();
    const { data: cats, error } = await supabase
      .from("Category")
      .select("*")
      .order("sortOrder", { ascending: true });
    if (error) {
      console.error("[admin/categories] Supabase GET error:", error);
      return NextResponse.json({ categories: [] });
    }

    const catRows: any[] = cats || [];

    // Single round-trip: pull every listing's categoryId, count client-side.
    const countMap: Record<string, number> = {};
    if (catRows.length > 0) {
      const { data: listingRows, error: lErr } = await supabase
        .from("Listing")
        .select("categoryId");
      if (!lErr && listingRows) {
        for (const row of listingRows) {
          const cid = (row as any)?.categoryId;
          if (cid) countMap[cid] = (countMap[cid] || 0) + 1;
        }
      } else if (lErr) {
        console.error("[admin/categories] Supabase listing-count error:", lErr);
      }
    }

    return NextResponse.json({
      categories: catRows.map((c: any) => ({ ...c, listingCount: countMap[c.id] ?? 0 })),
    });
  } catch (error) {
    console.error("[admin/categories] GET error:", error);
    return NextResponse.json({ categories: [] });
  }
}

// POST create category
export async function POST(req: NextRequest) {
  try {
    const { name, slug, icon, color, sortOrder } = await req.json();
    if (!name || !slug) return NextResponse.json({ error: "Nama & slug wajib" }, { status: 400 });
    // Get max sortOrder manually instead of using aggregate (not implemented in supabase-db)
    const allCats = await db.category.findMany({ orderBy: { sortOrder: "desc" }, take: 1 });
    const maxOrder = allCats[0]?.sortOrder ?? 0;
    const created = await db.category.create({
      data: {
        name,
        slug,
        icon: icon || "Cog",
        color: color || "orange",
        sortOrder: sortOrder ?? maxOrder + 1,
      },
    });
    return NextResponse.json({ category: created }, { status: 201 });
  } catch (error) {
    console.error("[admin/categories] POST error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
