import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET all categories
export async function GET() {
  if (!isDbAvailable()) {
    return NextResponse.json({ categories: [] });
  }
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
