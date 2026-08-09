import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { searchFallbackListings } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ listings: [], categories: [], sellers: [] });
  }

  try {
    // Search users/sellers (name, company, city) — also to find their listings
    const matchingUsers = await db.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    const matchingUserIds = matchingUsers.map((u) => u.id);

    // Search listings (title, description, brand, city, OR seller's company/name)
    // Only active + paid listings
    const listingWhere: any = {
      status: "active",
      paymentStatus: "paid",
      violationFlag: false,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { titleEn: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
      ],
    };
    // If any users match by company/name, also include their listings
    if (matchingUserIds.length > 0) {
      listingWhere.OR.push({ userId: { in: matchingUserIds } });
    }

    const listings = await db.listing.findMany({
      where: listingWhere,
      select: {
        id: true,
        title: true,
        slug: true,
        price: true,
        city: true,
        province: true,
        images: true,
        category: { select: { name: true, slug: true } },
        user: { select: { id: true, name: true, company: true } },
      },
      take: 8,
      orderBy: { views: "desc" },
    });

    const listingsFormatted = listings.map((l) => {
      let firstImage: string | null = null;
      try {
        const imgs = JSON.parse(l.images || "[]");
        if (Array.isArray(imgs) && imgs.length > 0) firstImage = imgs[0];
      } catch {}
      return {
        id: l.id,
        title: l.title,
        slug: l.slug,
        price: Number(l.price),
        city: l.city,
        province: l.province,
        image: firstImage,
        categoryName: l.category.name,
        categorySlug: l.category.slug,
        sellerCompany: l.user?.company || null,
      };
    });

    // Search categories (name)
    const categories = await db.category.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, slug: true, icon: true },
      take: 5,
      orderBy: { sortOrder: "asc" },
    });

    // Search users/sellers (name, company, city)
    const users = await db.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, company: true, city: true, logoImage: true },
      take: 5,
    });

    const sellersFormatted = users.map((u) => ({
      id: u.id,
      name: u.name,
      company: u.company,
      city: u.city,
      logoImage: u.logoImage,
    }));

    return NextResponse.json({
      listings: listingsFormatted,
      categories,
      sellers: sellersFormatted,
    });
  } catch (error) {
    console.error("GET /api/search DB error, falling back to seed data", error);
    return NextResponse.json(searchFallbackListings(q));
  }
}
