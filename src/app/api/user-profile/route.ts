import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/user-profile?userId=<id>
// Public — returns a user's public profile (name, company, city, bannerImage, logoImage, createdAt).
// Used by the seller page to display the seller's banner + logo.
//
// FALLBACK: if the `userId` doesn't match any User row, we try the Seller
// table next. This is needed because many legacy listings were seeded with
// only a `sellerId` (no `userId`) — when the user clicks "View seller's ads"
// on such a listing, `goToSeller(seller.id)` is called and the seller page
// fetches `/api/user-profile?userId=<sellerId>`. Without this fallback, that
// request returns 404 and the seller page shows no banner/logo.
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "User ID wajib" }, { status: 400 });
    }

    // (1) Try User table first.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        company: true,
        address: true,
        city: true,
        bannerImage: true,
        logoImage: true,
        createdAt: true,
      },
    });
    if (user) {
      return NextResponse.json({ user });
    }

    // (2) Fallback to Seller table. Map Seller fields to the User shape so
    // the seller page can render without special-casing.
    const seller = await db.seller.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        avatar: true,
        city: true,
        province: true,
        verified: true,
        rating: true,
        reviewCount: true,
        joinedAt: true,
      },
    });
    if (seller) {
      return NextResponse.json({
        user: {
          id: seller.id,
          name: seller.name,
          company: null,           // Seller table has no company field
          address: null,
          city: seller.city,
          bannerImage: null,       // Seller table has no bannerImage
          logoImage: seller.avatar, // map avatar → logoImage
          createdAt: seller.joinedAt,
          // Extra seller-only fields (used by seller page for verified badge, rating, etc.)
          phone: seller.phone,
          province: seller.province,
          verified: seller.verified,
          rating: seller.rating,
          reviewCount: seller.reviewCount,
        },
      });
    }

    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
  } catch (e: any) {
    console.error("GET /api/user-profile error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
