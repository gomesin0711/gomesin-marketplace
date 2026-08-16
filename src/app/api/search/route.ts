import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { searchFallbackListings } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nyyvmttbwlwqunigkrms.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8";

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ listings: [], categories: [], sellers: [] });
  }

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
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
      if (matchingUserIds.length > 0) {
        listingWhere.OR.push({ userId: { in: matchingUserIds } });
      }

      const listings = await db.listing.findMany({
        where: listingWhere,
        select: {
          id: true, title: true, slug: true, price: true, city: true, province: true, images: true,
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
          id: l.id, title: l.title, slug: l.slug, price: Number(l.price),
          city: l.city, province: l.province, image: firstImage,
          categoryName: l.category.name, categorySlug: l.category.slug,
          sellerCompany: l.user?.company || null,
        };
      });

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
        id: u.id, name: u.name, company: u.company, city: u.city, logoImage: u.logoImage,
      }));

      return NextResponse.json({
        listings: listingsFormatted,
        categories,
        sellers: sellersFormatted,
      });
    } catch (error) {
      console.error("GET /api/search Prisma error, trying Supabase:", error);
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    const ilike = `%${q}%`;

    // Search listings by title/description/brand/city.
    const { data: listings, error: listError } = await supabase
      .from("Listing")
      .select("id,title,slug,price,city,province,images,categoryId,userId")
      .eq("status", "active")
      .eq("paymentStatus", "paid")
      .eq("violationFlag", false)
      .or(`title.ilike.${ilike},description.ilike.${ilike},brand.ilike.${ilike},city.ilike.${ilike}`)
      .order("views", { ascending: false })
      .limit(8);
    if (listError) throw new Error(listError.message);

    // Batch-fetch categories + users for the matched listings.
    const catIds = [...new Set((listings || []).map((l: any) => l.categoryId).filter(Boolean))];
    const userIds = [...new Set((listings || []).map((l: any) => l.userId).filter(Boolean))];

    const [catsRes, usersRes] = await Promise.all([
      catIds.length
        ? supabase.from("Category").select("id,name,slug").in("id", catIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("User").select("id,name,company").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const catMap = new Map((catsRes.data || []).map((c: any) => [c.id, c]));
    const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u]));

    const listingsFormatted = (listings || []).map((l: any) => {
      let firstImage: string | null = null;
      try {
        const imgs = typeof l.images === "string" ? JSON.parse(l.images || "[]") : (l.images || []);
        if (Array.isArray(imgs) && imgs.length > 0) firstImage = imgs[0];
      } catch {}
      const cat = catMap.get(l.categoryId);
      const u = userMap.get(l.userId);
      return {
        id: l.id, title: l.title, slug: l.slug,
        price: typeof l.price === "string" ? Number(l.price) : l.price ?? 0,
        city: l.city, province: l.province, image: firstImage,
        categoryName: cat?.name || "", categorySlug: cat?.slug || "",
        sellerCompany: u?.company || null,
      };
    });

    // Search categories.
    const { data: categories } = await supabase
      .from("Category")
      .select("id,name,slug,icon")
      .or(`name.ilike.${ilike},slug.ilike.${ilike}`)
      .order("sortOrder", { ascending: true })
      .limit(5);

    // Search users/sellers.
    const { data: users } = await supabase
      .from("User")
      .select("id,name,company,city,logoImage")
      .or(`name.ilike.${ilike},company.ilike.${ilike},city.ilike.${ilike}`)
      .limit(5);

    const sellersFormatted = (users || []).map((u: any) => ({
      id: u.id, name: u.name, company: u.company, city: u.city, logoImage: u.logoImage,
    }));

    return NextResponse.json({
      listings: listingsFormatted,
      categories: categories || [],
      sellers: sellersFormatted,
    });
  } catch (error) {
    console.error("GET /api/search Supabase error, falling back to seed data:", error);
    return NextResponse.json(searchFallbackListings(q));
  }
}
