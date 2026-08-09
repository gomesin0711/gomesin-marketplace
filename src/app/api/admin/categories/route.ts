import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all categories
export async function GET() {
  const cats = await db.category.findMany({ orderBy: { sortOrder: "asc" } });
  const counts = await db.listing.groupBy({ by: ["categoryId"], _count: true });
  const map: Record<string, number> = {};
  counts.forEach((c: any) => {
    map[c.categoryId] = (c._count as any)?._all ?? (typeof c._count === 'number' ? c._count : 0);
  });
  return NextResponse.json({
    categories: cats.map((c) => ({ ...c, listingCount: map[c.id] ?? 0 })),
  });
}

// POST create category
export async function POST(req: NextRequest) {
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
}
