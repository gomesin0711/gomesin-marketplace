import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET: list all sellers with listing counts
export async function GET() {
  if (!isDbAvailable()) {
    return NextResponse.json({ sellers: [] });
  }
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
    console.error("[admin/sellers] GET error:", error);
    return NextResponse.json({ sellers: [] });
  }
}

// PATCH: toggle verified status
export async function PATCH(req: NextRequest) {
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
