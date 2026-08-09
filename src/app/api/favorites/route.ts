import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/favorites?userId=xxx → return list of listing IDs
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ favorites: [] });

  const rows = await db.favorite.findMany({
    where: { userId },
    select: { listingId: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ favorites: rows.map((r) => r.listingId) });
}

// POST /api/favorites { userId, listingId } → add favorite
export async function POST(req: NextRequest) {
  const { userId, listingId } = await req.json();
  if (!userId || !listingId) {
    return NextResponse.json({ error: "userId dan listingId wajib" }, { status: 400 });
  }

  await db.favorite.create({
    data: { userId, listingId },
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/favorites { userId, listingId } → remove favorite
export async function DELETE(req: NextRequest) {
  const { userId, listingId } = await req.json();
  if (!userId || !listingId) {
    return NextResponse.json({ error: "userId dan listingId wajib" }, { status: 400 });
  }

  await db.favorite.deleteMany({
    where: { userId, listingId },
  });

  return NextResponse.json({ success: true });
}
