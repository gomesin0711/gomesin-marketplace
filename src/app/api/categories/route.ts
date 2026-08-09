import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getFallbackCategories } from "@/lib/fallback-data";

export async function GET() {
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

    return NextResponse.json({ categories: result });
  } catch (error) {
    console.error("GET /api/categories DB error, falling back to seed data", error);
    return NextResponse.json(getFallbackCategories());
  }
}
