import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseListing } from "@/lib/types";

// GET listings owned by a specific user or seller (for "My Ads" dashboard & seller page)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const sellerId = searchParams.get("sellerId");

  if (!userId && !sellerId) {
    return NextResponse.json(
      { error: "User ID atau Seller ID wajib diisi." },
      { status: 400 }
    );
  }

  // Try userId first; if none found, fall back to sellerId
  const whereClause: any = userId ? { userId } : { sellerId };
  let listings = await db.listing.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: { category: true, seller: true, user: true },
  });

  // If userId was provided but no listings found, try sellerId as fallback
  if (listings.length === 0 && userId) {
    listings = await db.listing.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: "desc" },
      include: { category: true, seller: true, user: true },
    });
  }

  return NextResponse.json({
    listings: listings.map(parseListing),
    total: listings.length,
  });
}
