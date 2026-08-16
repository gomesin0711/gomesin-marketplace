import { NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { getFallbackCategories } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

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

export async function GET() {
  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const categories = await db.category.findMany({
        orderBy: { sortOrder: "asc" },
      });
      const counts = await db.listing.groupBy({
        by: ["categoryId"],
        _count: { _all: true },
        where: { status: "active" },
      });
      const countMap: Record<string, number> = {};
      for (const c of counts) countMap[c.categoryId] = c._count._all;

      const result = categories.map((c) => ({
        ...c,
        listingCount: countMap[c.id] ?? 0,
      }));

      return NextResponse.json({ categories: result }, {
        headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
      });
    } catch (error) {
      console.error("GET /api/categories Prisma error, trying Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    const { data: categories, error: catError } = await supabase
      .from("Category")
      .select("*")
      .order("sortOrder", { ascending: true });
    if (catError) throw new Error(catError.message);

    // Count active listings per category.
    const { data: listings, error: listError } = await supabase
      .from("Listing")
      .select("categoryId")
      .eq("status", "active");
    if (listError) throw new Error(listError.message);

    const countMap: Record<string, number> = {};
    for (const l of listings || []) {
      if (l.categoryId) countMap[l.categoryId] = (countMap[l.categoryId] || 0) + 1;
    }

    const result = (categories || []).map((c: any) => ({
      ...c,
      listingCount: countMap[c.id] ?? 0,
    }));

    return NextResponse.json({ categories: result }, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  } catch (error) {
    console.error("GET /api/categories Supabase error, falling back to seed data:", error);
    return NextResponse.json(getFallbackCategories(), {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }
}
