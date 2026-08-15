import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { getPaketMap } from "@/lib/paket";
import { saveImagesToLocal } from "@/lib/save-image";
import { getFallbackListings } from "@/lib/fallback-data";
import type { ListingFilters } from "@/lib/fallback-data";
import { broadcastListingPending } from "@/lib/broadcast";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/admin/listings/route.ts.
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

function safeJsonParse(s: string, fallback: any) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// Parse a raw Supabase row into the same shape as parseListing(Prisma row).
function parseSupabaseListing(row: any) {
  if (!row) return row;
  return {
    ...row,
    price: typeof row.price === "string" ? Number(row.price) : row.price ?? 0,
    images: row.images ? (typeof row.images === "string" ? safeJsonParse(row.images, []) : row.images) : [],
    specs: row.specs ? (typeof row.specs === "string" ? safeJsonParse(row.specs, {}) : row.specs) : {},
    createdAt: row.createdAt ?? null,
    paymentExpiry: row.paymentExpiry ?? null,
    category: row.category ?? null,
    seller: row.seller ?? null,
    user: row.user ?? null,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const category = searchParams.get("category") || "";
  const condition = searchParams.get("condition") || "";
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const province = searchParams.get("province") || "";
  const packageType = searchParams.get("packageType") || "";
  const city = searchParams.get("city")?.trim() || "";
  const sellerName = searchParams.get("seller")?.trim() || "";
  const sort = searchParams.get("sort") || "newest";
  const featuredOnly = searchParams.get("featured") === "1";
  const idsParam = searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : null;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(48, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
  const weekOnly = searchParams.get("week") === "1";

  try {
    const where: Record<string, any> = { status: "active", paymentStatus: "paid", violationFlag: false };
    if (ids && ids.length) {
      where.id = { in: ids };
    }

    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
        { brand: { contains: q } },
        { seller: { name: { contains: q } } },
        { city: { contains: q } },
      ];
    }
    if (category) {
      // Kategori "Jasa Teknisi" (jasa-teknisi) → tampilkan semua iklan jasa
      // (iklan jasa pakai condition="jasa", bukan categoryId jasa-teknisi).
      if (category === "jasa-teknisi") {
        where.condition = "jasa";
      } else {
        where.category = { slug: category };
      }
    }
    if (condition) where.condition = condition;
    if (province) where.province = province;
    if (city) where.city = { contains: city };
    if (sellerName) where.seller = { name: { contains: sellerName } };
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = Math.floor(Number(minPrice));
      if (maxPrice) where.price.lte = Math.floor(Number(maxPrice));
    }
    if (featuredOnly) where.featured = true;
    // Week filter: only listings from the last 7 days
    if (weekOnly) {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      where.createdAt = { gte: weekAgo };
    }
    if (packageType) {
      const pkgList = packageType.split(",").map((p) => p.trim()).filter(Boolean);
      if (pkgList.length === 1) where.packageType = pkgList[0];
      else if (pkgList.length > 1) where.packageType = { in: pkgList };
    }

    const orderBy: Record<string, any> =
      sort === "price-asc"
        ? { price: "asc" }
        : sort === "price-desc"
        ? { price: "desc" }
        : sort === "popular"
        ? { views: "desc" }
        : { createdAt: "desc" };

    const [total, rows] = await Promise.all([
      db.listing.count({ where }),
      db.listing.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { category: true, seller: true, user: { select: { id: true, name: true, phone: true, email: true, city: true, logoImage: true, bannerImage: true } } },
      }),
    ]);

    // Newest ads first — no promo-rank grouping, pure createdAt desc order.
    const listings = rows.map(parseListing);

    return NextResponse.json({
      listings,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/listings Prisma error, trying Supabase:", error);
    // DO NOT return getFallbackListings here anymore — fall through to Supabase
  }

  // --- Path B: Vercel (raw Supabase) ---
  // NOTE: Supabase tables in this project have NO foreign-key relationships
  // declared, so the nested .select("*, category(*)") pattern that PostgREST
  // requires FKs for would FAIL and silently return []. We select only "*" and
  // batch-fetch the related Category/Seller/User rows manually (same pattern
  // as /api/admin/listings/route.ts).
  try {
    const supabase = await getSupabase();

    // Resolve category filter once: either condition="jasa" (for "jasa-teknisi"
    // slug) or categoryId=<resolved id> (looked up by slug). Hoisted so we can
    // re-use the resolved values for the count query below.
    let categoryCondition: string | null = null; // e.g. "jasa"
    let categoryIdFilter: string | null = null;
    if (category) {
      if (category === "jasa-teknisi") {
        categoryCondition = "jasa";
      } else {
        const { data: cat } = await supabase
          .from("Category")
          .select("id")
          .eq("slug", category)
          .limit(1)
          .single();
        if (cat) categoryIdFilter = cat.id;
      }
    }

    // Build Supabase query with the SAME filters as the Prisma where clause:
    // - status = "active"
    // - paymentStatus = "paid"
    // - violationFlag = false
    let query = supabase
      .from("Listing")
      .select("*")
      .eq("status", "active")
      .eq("paymentStatus", "paid")
      .eq("violationFlag", false);

    // Apply filters (mirror the Prisma where clause):
    if (ids && ids.length) query = query.in("id", ids);
    if (q) {
      // Supabase text search: use .or() with ilike for each searchable field.
      // Cannot do cross-table search on seller.name without a join — just
      // search title/description/brand/city (minor edge case skipped).
      query = query.or(
        `title.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%,city.ilike.%${q}%`
      );
    }
    if (categoryCondition) query = query.eq("condition", categoryCondition);
    if (categoryIdFilter) query = query.eq("categoryId", categoryIdFilter);
    if (condition && !categoryCondition) query = query.eq("condition", condition);
    if (province) query = query.eq("province", province);
    if (city) query = query.ilike("city", `%${city}%`);
    if (minPrice) query = query.gte("price", Math.floor(Number(minPrice)));
    if (maxPrice) query = query.lte("price", Math.floor(Number(maxPrice)));
    if (featuredOnly) query = query.eq("featured", true);
    if (weekOnly) {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte("createdAt", weekAgo.toISOString());
    }
    if (packageType) {
      const pkgList = packageType.split(",").map((p) => p.trim()).filter(Boolean);
      if (pkgList.length === 1) query = query.eq("packageType", pkgList[0]);
      else if (pkgList.length > 1) query = query.in("packageType", pkgList);
    }

    // Apply sort (mirror Prisma orderBy)
    if (sort === "price-asc") query = query.order("price", { ascending: true });
    else if (sort === "price-desc") query = query.order("price", { ascending: false });
    else if (sort === "popular") query = query.order("views", { ascending: false });
    else query = query.order("createdAt", { ascending: false });

    // Apply pagination
    query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

    const { data: rows, error } = await query;
    if (error) {
      console.error("[listings] Supabase GET error:", error);
      const filters: ListingFilters = {
        q: q || undefined,
        category: category || undefined,
        condition: condition || undefined,
        province: province || undefined,
        packageType: packageType || undefined,
        sort: sort || undefined,
        page,
        limit,
        ids,
        featured: featuredOnly || undefined,
      };
      return NextResponse.json(getFallbackListings(filters));
    }

    const finalRows: any[] = rows || [];

    // Batch-fetch related rows by their IDs (single round-trip per table).
    const categoryIds = [...new Set(finalRows.map((r: any) => r.categoryId).filter(Boolean))];
    const sellerIds = [...new Set(finalRows.map((r: any) => r.sellerId).filter(Boolean))];
    const userIds = [...new Set(finalRows.map((r: any) => r.userId).filter(Boolean))];

    const [categoriesRes, sellersRes, usersRes] = await Promise.all([
      categoryIds.length
        ? supabase.from("Category").select("*").in("id", categoryIds)
        : Promise.resolve({ data: [], error: null }),
      sellerIds.length
        ? supabase.from("Seller").select("*").in("id", sellerIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase
            .from("User")
            .select("id, name, phone, email, city, logoImage, bannerImage")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const categoryMap = new Map((categoriesRes.data || []).map((c: any) => [c.id, c]));
    const sellerMap = new Map((sellersRes.data || []).map((s: any) => [s.id, s]));
    const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u]));

    const listings = finalRows.map((row: any) => {
      const withRelations = {
        ...row,
        category: categoryMap.get(row.categoryId) ?? null,
        seller: sellerMap.get(row.sellerId) ?? null,
        user: userMap.get(row.userId) ?? null,
      };
      return parseSupabaseListing(withRelations);
    });

    // Get total count via a separate count query (re-apply same filters).
    // Supabase's .range() with .select("*") does not return total count;
    // we use { count: "exact", head: true } to get the count without data.
    let countQuery = supabase
      .from("Listing")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .eq("paymentStatus", "paid")
      .eq("violationFlag", false);
    if (ids && ids.length) countQuery = countQuery.in("id", ids);
    if (categoryCondition) countQuery = countQuery.eq("condition", categoryCondition);
    if (categoryIdFilter) countQuery = countQuery.eq("categoryId", categoryIdFilter);
    if (condition && !categoryCondition) countQuery = countQuery.eq("condition", condition);
    if (province) countQuery = countQuery.eq("province", province);
    if (city) countQuery = countQuery.ilike("city", `%${city}%`);
    if (minPrice) countQuery = countQuery.gte("price", Math.floor(Number(minPrice)));
    if (maxPrice) countQuery = countQuery.lte("price", Math.floor(Number(maxPrice)));
    if (featuredOnly) countQuery = countQuery.eq("featured", true);
    if (weekOnly) {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      countQuery = countQuery.gte("createdAt", weekAgo.toISOString());
    }
    if (packageType) {
      const pkgList = packageType.split(",").map((p) => p.trim()).filter(Boolean);
      if (pkgList.length === 1) countQuery = countQuery.eq("packageType", pkgList[0]);
      else if (pkgList.length > 1) countQuery = countQuery.in("packageType", pkgList);
    }
    if (q)
      countQuery = countQuery.or(
        `title.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%,city.ilike.%${q}%`
      );

    const { count: totalCount } = await countQuery;
    const total = totalCount || listings.length;

    return NextResponse.json({
      listings,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/listings Supabase error, falling back to seed data:", error);
    const filters: ListingFilters = {
      q: q || undefined,
      category: category || undefined,
      condition: condition || undefined,
      province: province || undefined,
      packageType: packageType || undefined,
      sort: sort || undefined,
      page,
      limit,
      ids,
      featured: featuredOnly || undefined,
    };
    return NextResponse.json(getFallbackListings(filters));
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, price, priceType, condition, brand, yearProduced, city, province, categoryId, images, specs, featured, package: pkg, paymentMethod, uniqueCode, userId, userName, userPhone, saveAsDraft } = body;

    // Draft mode ("Simpan Dulu"): only title is required, skip payment verification.
    const isDraft = saveAsDraft === true;
    if (!isDraft && (!title || !description || !price || !categoryId || !city || !province)) {
      return NextResponse.json({ error: "Data tidak lengkap. Mohon lengkapi semua field wajib." }, { status: 400 });
    }
    if (isDraft && !title) {
      return NextResponse.json({ error: "Judul wajib diisi untuk menyimpan dulu." }, { status: 400 });
    }

    // --- Path A: local dev (Prisma + SQLite) ---
    if (isDbAvailable()) {
      try {
        // Fetch the actual user from DB to get their latest name + phone
        // (more reliable than client-sent values which may be stale).
        let dbUser = null;
        if (userId) {
          dbUser = await db.user.findUnique({ where: { id: userId } });
        }
        const finalName = dbUser?.name || userName || "Anda (Pengguna mesinKU)";
        const finalPhone = dbUser?.phone || userPhone || "0812-0000-0000";

        // Find or create a seller record tied to this user.
        // Each user gets their own seller profile so their ads are isolated.
        // Try to find existing seller by matching listings with this userId.
        let seller = null;
        if (userId) {
          const userListings = await db.listing.findFirst({
            where: { userId },
            include: { seller: true },
          });
          if (userListings) {
            seller = userListings.seller;
          }
        }
        if (!seller) {
          seller = await db.seller.create({
            data: {
              name: finalName,
              phone: finalPhone,
              city: city,
              province: province,
              verified: false,
              rating: 5.0,
              reviewCount: 0,
            },
          });
        } else {
          // Update existing seller with latest user info (in case profile changed)
          seller = await db.seller.update({
            where: { id: seller.id },
            data: { name: finalName, phone: finalPhone },
          });
        }

        const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const slug = slugBase + "-" + Math.random().toString(36).slice(2, 7);

        // Package pricing from DB (admin can edit via Paket tab)
        const paketMap = await getPaketMap();
        const pkgKey = pkg || "colek";
        const pkgPrice = paketMap[pkgKey]?.price ?? 0;
        const pkgDays = paketMap[pkgKey]?.duration ?? 30;

        // For draft ("Simpan Dulu"), categoryId may be empty — fallback to first category.
        // Also validate that the provided categoryId actually EXISTS in the DB.
        // This guards against stale localStorage drafts that reference category IDs
        // from a previous database seed (which would cause an FK constraint violation).
        let finalCategoryId = categoryId;
        if (finalCategoryId) {
          const catExists = await db.category.findUnique({ where: { id: finalCategoryId }, select: { id: true } });
          if (!catExists) {
            // Stale/invalid categoryId — discard it so we fall back to the first category.
            finalCategoryId = null;
          }
        }
        if (!finalCategoryId) {
          if (!isDraft) {
            return NextResponse.json(
              { error: "Kategori tidak valid. Silakan pilih kategori kembali di form." },
              { status: 400 }
            );
          }
          const firstCat = await db.category.findFirst({ orderBy: { sortOrder: "asc" } });
          finalCategoryId = firstCat?.id;
        }

        // If payment method provided, mark as pending. Otherwise pending.
        const isPaid = !!paymentMethod;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + pkgDays);

        // Save all images to local filesystem (base64 → file, external URL → download)
        // This ensures images NEVER disappear as long as the listing exists.
        const rawImages: string[] = images || [];
        const localImages = await saveImagesToLocal(rawImages);

        const created = await db.listing.create({
          data: {
            title,
            slug,
            description,
            price: Math.floor(Number(price) || 0),
            priceType: priceType || "fixed",
            condition: condition || "bekas",
            brand: brand || null,
            yearProduced: yearProduced ? parseInt(yearProduced, 10) : null,
            city,
            province,
            images: JSON.stringify(localImages),
            specs: JSON.stringify(specs || {}),
            packageType: pkgKey,
            featured: pkgKey === "spotlight" || pkgKey === "highlight",
            // "Simpan Dulu" → status "draft" (Belum Aktif, tidak tayang, belum perlu bayar).
            // Iklan normal → "pending" (menunggu verifikasi admin sebelum tayang).
            // Admin menyetujui via /api/admin/listings (PATCH status=active) yang juga
            // mengeset paymentStatus=paid agar langsung muncul di beranda.
            status: isDraft ? "draft" : "pending",
            paymentStatus: isDraft ? "unpaid" : (isPaid ? "paid" : "unpaid"),
            paymentExpiry: isPaid ? expiryDate : null,
            // Save the unique 3-digit payment code so that Riwayat Pembayaran can
            // display the total amount the user was asked to pay (pkgPrice + uniqueCode).
            uniqueCode: typeof uniqueCode === "number" && uniqueCode > 0 ? uniqueCode : null,
            categoryId: finalCategoryId,
            sellerId: seller.id,
            userId: userId || null,
          },
          include: { category: true, seller: true, user: { select: { id: true, name: true, phone: true, email: true, city: true, logoImage: true, bannerImage: true } } },
        });

        // ── Realtime broadcast ────────────────────────────────────────────
        // Notify the admin's "Iklan Baru" tab that a new pending listing just
        // landed (so they can review it instantly, no need to wait for the
        // 3-second poll). Drafts are skipped — they're invisible to admin
        // until the user actually submits/pays.
        if (!isDraft) {
          try {
            broadcastListingPending(parseListing(created));
          } catch (bcErr: any) {
            console.warn("[listings] POST broadcast error:", bcErr?.message);
          }
        }

        return NextResponse.json({ listing: parseListing(created) }, { status: 201 });
      } catch (prismaErr) {
        console.error("[listings] POST Prisma error, falling back to Supabase:", prismaErr);
        // fall through to Supabase
      }
    }

    // --- Path B: Vercel (raw Supabase) ---
    const supabase = await getSupabase();

    // Find-or-create the Seller: query by userId (via existing listings) first,
    // then by name+phone, else insert a new row.
    let sellerId: string | null = null;
    if (userId) {
      const { data: existingByUser } = await supabase
        .from("Listing")
        .select("sellerId")
        .eq("userId", userId)
        .limit(1);
      if (existingByUser && existingByUser.length > 0) {
        sellerId = existingByUser[0].sellerId;
      }
    }
    const finalName = userName || "Anda (Pengguna mesinKU)";
    const finalPhone = userPhone || "0812-0000-0000";
    if (!sellerId) {
      const { data: existingByName } = await supabase
        .from("Seller")
        .select("id")
        .eq("name", finalName)
        .eq("phone", finalPhone)
        .limit(1);
      if (existingByName && existingByName.length > 0) {
        sellerId = existingByName[0].id;
      }
    }
    if (!sellerId) {
      const { data: newSeller, error: sellerErr } = await supabase
        .from("Seller")
        .insert({
          // Supabase Seller.id has no default — generate a cuid-compatible id.
          id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
          name: finalName,
          phone: finalPhone,
          city: city || "",
          province: province || "",
          verified: false,
          rating: 5.0,
          reviewCount: 0,
        })
        .select("id")
        .single();
      if (sellerErr || !newSeller) {
        console.error("[listings] Supabase Seller insert error:", sellerErr);
        return NextResponse.json({ error: "Gagal membuat seller: " + (sellerErr?.message || "unknown") }, { status: 500 });
      }
      sellerId = newSeller.id;
    } else {
      // Update existing seller with latest user info
      await supabase
        .from("Seller")
        .update({ name: finalName, phone: finalPhone })
        .eq("id", sellerId);
    }

    // Find-or-create Category: if categoryId provided, validate it exists;
    // else grab the first. Guards against stale localStorage category IDs.
    let finalCategoryId = categoryId;
    if (finalCategoryId) {
      const { data: catExists } = await supabase
        .from("Category")
        .select("id")
        .eq("id", finalCategoryId)
        .limit(1);
      if (!catExists || catExists.length === 0) {
        finalCategoryId = null;
      }
    }
    if (!finalCategoryId) {
      if (!isDraft) {
        return NextResponse.json(
          { error: "Kategori tidak valid. Silakan pilih kategori kembali di form." },
          { status: 400 }
        );
      }
      const { data: firstCat } = await supabase
        .from("Category")
        .select("id")
        .order("sortOrder", { ascending: true })
        .limit(1)
        .single();
      finalCategoryId = firstCat?.id || null;
    }
    if (!finalCategoryId) {
      return NextResponse.json({ error: "Kategori tidak ditemukan." }, { status: 400 });
    }

    const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const slug = slugBase + "-" + Math.random().toString(36).slice(2, 7);

    const paketMap = await getPaketMap();
    const pkgKey = pkg || "colek";
    const pkgPrice = paketMap[pkgKey]?.price ?? 0;
    const pkgDays = paketMap[pkgKey]?.duration ?? 30;

    const isPaid = !!paymentMethod;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + pkgDays);

    // On Vercel we cannot save images to the local filesystem — store the
    // raw images array (already URLs or base64) directly as a JSON string.
    const rawImages: string[] = images || [];

    const insertPayload: Record<string, any> = {
      // Supabase Listing.id has no default — generate a cuid-compatible id.
      id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
      title,
      slug,
      description: description || "",
      price: Math.floor(Number(price) || 0),
      priceType: priceType || "fixed",
      condition: condition || "bekas",
      brand: brand || null,
      yearProduced: yearProduced ? parseInt(yearProduced, 10) : null,
      city: city || "",
      province: province || "",
      images: JSON.stringify(rawImages),
      specs: JSON.stringify(specs || {}),
      packageType: pkgKey,
      featured: pkgKey === "spotlight" || pkgKey === "highlight",
      status: isDraft ? "draft" : "pending",
      paymentStatus: isDraft ? "unpaid" : (isPaid ? "paid" : "unpaid"),
      paymentExpiry: isPaid ? expiryDate.toISOString() : null,
      // Save the unique 3-digit payment code so Riwayat Pembayaran can show pkgPrice + uniqueCode.
      uniqueCode: typeof uniqueCode === "number" && uniqueCode > 0 ? uniqueCode : null,
      categoryId: finalCategoryId,
      sellerId,
      userId: userId || null,
      views: 0,
      violationFlag: false,
    };

    const { data: newRow, error: insertErr } = await supabase
      .from("Listing")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertErr || !newRow) {
      console.error("[listings] Supabase Listing insert error:", insertErr);
      return NextResponse.json({ error: "Gagal membuat iklan: " + (insertErr?.message || "unknown") }, { status: 500 });
    }

    return NextResponse.json({ listing: parseSupabaseListing(newRow) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "Gagal membuat iklan: " + (e?.message || "unknown") }, { status: 500 });
  }
}
