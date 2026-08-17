import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { getPaketMap } from "@/lib/paket";
import { saveImagesToLocal } from "@/lib/save-image";
import { getFallbackListingBySlug } from "@/lib/fallback-data";
import { normalizeSupabaseDate } from "@/lib/supabase-helpers";
import { getSessionUser } from "@/lib/session";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/admin/listings/route.ts.
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yzxeinqoryvprhuibtzn.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eGVpbnFvcnl2cHJodWlidHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjA5NTcsImV4cCI6MjEwMjQzNjk1N30.gmDvyEmNGP2PbL_3a8k18pTggRE9zQ3yBrBPQNJjWTI";

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
  const seller = row.seller
    ? { ...row.seller, joinedAt: normalizeSupabaseDate(row.seller.joinedAt) }
    : null;
  return {
    ...row,
    price: typeof row.price === "string" ? Number(row.price) : row.price ?? 0,
    images: row.images ? (typeof row.images === "string" ? safeJsonParse(row.images, []) : row.images) : [],
    specs: row.specs ? (typeof row.specs === "string" ? safeJsonParse(row.specs, {}) : row.specs) : {},
    createdAt: normalizeSupabaseDate(row.createdAt),
    paymentExpiry: normalizeSupabaseDate(row.paymentExpiry),
    // Mirror Prisma's parseListing: expose seller.joinedAt at the top level too.
    joinedAt: seller?.joinedAt ?? null,
    category: row.category ?? null,
    seller,
    user: row.user ?? null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const listing = await db.listing.findUnique({
        where: { slug },
        include: { category: true, seller: true, user: true },
      });

      if (listing) {
        // increment views (non-blocking, fire and forget)
        db.listing.update({ where: { id: listing.id }, data: { views: { increment: 1 } } }).catch(() => {});

        // related: same category, exclude self
        const [related] = await Promise.all([
          db.listing.findMany({
            where: {
              status: "active",
              categoryId: listing.categoryId,
              id: { not: listing.id },
            },
            orderBy: { createdAt: "desc" },
            take: 6,
            include: { category: true, seller: true, user: true },
          }),
        ]);

        return NextResponse.json({
          listing: parseListing(listing),
          related: related.map(parseListing),
        });
      }
      // not found in Prisma → fall through to Supabase
    } catch (error) {
      console.error("GET /api/listings/[slug] Prisma error, falling back to Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();

    // Fetch the listing by slug (no FK joins — Supabase tables have no relationships declared)
    const { data: row, error: findErr } = await supabase
      .from("Listing")
      .select("*")
      .eq("slug", slug)
      .limit(1)
      .single();

    if (findErr || !row) {
      // Not in Supabase either → last resort: try static seed-data.json (legacy listings)
      const fallback = getFallbackListingBySlug(slug);
      if (fallback) return NextResponse.json(fallback);
      return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
    }

    // Increment views (non-blocking, fire and forget)
    supabase
      .from("Listing")
      .update({ views: (row.views ?? 0) + 1 })
      .eq("id", row.id)
      .then(() => {}, () => {});

    // Batch-fetch related Category / Seller / User by ID (same pattern as /api/listings GET)
    const [catRes, sellerRes, userRes, relatedRes] = await Promise.all([
      row.categoryId
        ? supabase.from("Category").select("*").eq("id", row.categoryId).limit(1).single()
        : Promise.resolve({ data: null, error: null }),
      row.sellerId
        ? supabase.from("Seller").select("*").eq("id", row.sellerId).limit(1).single()
        : Promise.resolve({ data: null, error: null }),
      row.userId
        ? supabase.from("User").select("*").eq("id", row.userId).limit(1).single()
        : Promise.resolve({ data: null, error: null }),
      // related listings: same category, exclude self, active only — fetch top 6 raw rows
      row.categoryId
        ? supabase
            .from("Listing")
            .select("*")
            .eq("status", "active")
            .eq("categoryId", row.categoryId)
            .neq("id", row.id)
            .order("createdAt", { ascending: false })
            .limit(6)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const category = catRes?.data ?? null;
    const seller = sellerRes?.data ?? null;
    const user = userRes?.data ?? null;

    const listing = parseSupabaseListing({ ...row, category, seller, user });

    // For related listings, batch-fetch their Category/Seller/User in one pass
    const relatedRows = (relatedRes?.data as any[]) ?? [];
    let related: any[] = [];
    if (relatedRows.length > 0) {
      const catIds = [...new Set(relatedRows.map((r) => r.categoryId).filter(Boolean))];
      const sellerIds = [...new Set(relatedRows.map((r) => r.sellerId).filter(Boolean))];
      const userIds = [...new Set(relatedRows.map((r) => r.userId).filter(Boolean))];

      const [relatedCats, relatedSellers, relatedUsers] = await Promise.all([
        catIds.length
          ? supabase.from("Category").select("*").in("id", catIds)
          : Promise.resolve({ data: [], error: null }),
        sellerIds.length
          ? supabase.from("Seller").select("*").in("id", sellerIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length
          ? supabase.from("User").select("*").in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const catMap = new Map(((relatedCats?.data as any[]) ?? []).map((c) => [c.id, c]));
      const sellerMap = new Map(((relatedSellers?.data as any[]) ?? []).map((s) => [s.id, s]));
      const userMap = new Map(((relatedUsers?.data as any[]) ?? []).map((u) => [u.id, u]));

      related = relatedRows.map((r) =>
        parseSupabaseListing({
          ...r,
          category: r.categoryId ? catMap.get(r.categoryId) ?? null : null,
          seller: r.sellerId ? sellerMap.get(r.sellerId) ?? null : null,
          user: r.userId ? userMap.get(r.userId) ?? null : null,
        })
      );
    }

    return NextResponse.json({ listing, related }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error("GET /api/listings/[slug] Supabase error, falling back to seed data:", error);

    const fallback = getFallbackListingBySlug(slug);
    if (!fallback) {
      return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json(fallback);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // SECURITY: Only the listing's owner (or an admin) may edit it.
    const session = getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "Anda harus masuk untuk mengubah iklan." },
        { status: 401 }
      );
    }

    const { slug } = await params;
    const body = await req.json();
    const { title, description, price, priceType, condition, brand, yearProduced, city, province, categoryId, images, specs, package: pkg, paymentMethod, uniqueCode, status } = body;

    // --- Path A: local dev (Prisma + SQLite) ---
    if (isDbAvailable()) {
      try {
        const existing = await db.listing.findUnique({ where: { slug } });
        if (!existing) {
          return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
        }

        // Ownership check: only the listing's owner (or an admin) may edit it.
        const isAdmin = session.role === "admin";
        if (!isAdmin && existing.userId !== session.id) {
          return NextResponse.json(
            { error: "Akses ditolak: Anda bukan pemilik iklan ini." },
            { status: 403 }
          );
        }

        const data: any = {};

        // Boost/upgrade HANYA untuk iklan yang sudah aktif.
        // Jika iklan belum aktif (draft, pending, rejected, expired, sold, dilanggar),
        // tolak permintaan upgrade paket.
        if (pkg) {
          const isExpiredPkg = existing.status === "active" && !!existing.paymentExpiry && new Date(existing.paymentExpiry) < new Date();
          if (existing.status !== "active" || existing.violationFlag || isExpiredPkg) {
            const reason = existing.status === "draft" ? "Iklan belum aktif"
              : existing.status === "pending" ? "Iklan masih menunggu verifikasi"
              : existing.status === "rejected" ? "Iklan ditolak"
              : existing.status === "sold" ? "Iklan sudah terjual"
              : existing.violationFlag ? "Iklan ditandai melanggar"
              : isExpiredPkg ? "Masa aktif iklan sudah berakhir"
              : "Iklan tidak aktif";
            return NextResponse.json({ error: `Boost/upgrade paket hanya tersedia untuk iklan yang sudah aktif. ${reason}.` }, { status: 400 });
          }
        }

        // Status change (e.g. mark as sold / un-sold)
        if (status !== undefined && !pkg) {
          if (!['active', 'sold', 'draft', 'pending', 'rejected'].includes(status)) {
            return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 });
          }
          data.status = status;
        }

        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (price !== undefined) data.price = Math.floor(Number(price));
        if (priceType !== undefined) data.priceType = priceType;
        if (condition !== undefined) data.condition = condition;
        if (brand !== undefined) data.brand = brand || null;
        if (yearProduced !== undefined) data.yearProduced = yearProduced ? parseInt(yearProduced, 10) : null;
        if (city !== undefined) data.city = city;
        if (province !== undefined) data.province = province;
        if (categoryId !== undefined) data.categoryId = categoryId;
        if (images !== undefined) {
          // Save any new base64/external images to local filesystem
          const localImages = await saveImagesToLocal(images);
          data.images = JSON.stringify(localImages);
        }
        if (specs !== undefined) data.specs = JSON.stringify(specs);

        // Package activation: when `package` is provided, recompute packageType,
        // featured, status, paymentStatus, and paymentExpiry based on package pricing from DB.
        if (pkg) {
          const paketMap = await getPaketMap();
          const pkgKey = pkg;
          const pkgPrice = paketMap[pkgKey]?.price ?? 0;
          const pkgDays = paketMap[pkgKey]?.duration ?? 30;
          const isPaid = pkgKey === "simpan" || (pkgPrice > 0 && !!paymentMethod);
          data.packageType = pkgKey;
          data.featured = pkgKey === "spotlight" || pkgKey === "highlight";
          // Republish/edit SELALU kembali ke 'pending' — harus diverifikasi ulang admin
          // agar penjual tidak bisa mengakali dengan pasang iklan bersih lalu edit
          // menambah konten melanggar setelah diverifikasi.
          data.status = "pending";
          data.paymentStatus = pkgKey === "simpan" ? "unpaid" : (isPaid ? "paid" : "unpaid");
          if (isPaid && pkgDays > 0) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + pkgDays);
            data.paymentExpiry = expiryDate;
          } else {
            data.paymentExpiry = null;
          }
          // Save the unique 3-digit payment code (from /api/listings/unique-code)
          // so Riwayat Pembayaran can show pkgPrice + uniqueCode as the total paid.
          if (typeof uniqueCode === "number" && uniqueCode > 0) {
            data.uniqueCode = uniqueCode;
          }
        }

        const updated = await db.listing.update({
          where: { id: existing.id },
          data,
          include: { category: true, seller: true, user: true },
        });

        return NextResponse.json({ listing: parseListing(updated) });
      } catch (prismaErr) {
        console.error("[listings/[slug]] PATCH Prisma error, falling back to Supabase:", prismaErr);
        // fall through to Supabase
      }
    }

    // --- Path B: Vercel (raw Supabase) ---
    const supabase = await getSupabase();

    const { data: existingRow, error: findErr } = await supabase
      .from("Listing")
      .select("id, userId")
      .eq("slug", slug)
      .limit(1)
      .single();
    if (findErr || !existingRow) {
      return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
    }

    // Ownership check (Supabase path).
    const isAdmin = session.role === "admin";
    if (!isAdmin && existingRow.userId !== session.id) {
      return NextResponse.json(
        { error: "Akses ditolak: Anda bukan pemilik iklan ini." },
        { status: 403 }
      );
    }

    const data: any = {};

    // Boost/upgrade HANYA untuk iklan yang sudah aktif (safety net di sisi server - Supabase).
    if (pkg) {
      // Ambil status listing dari Supabase untuk validasi
      const { data: pkgCheckRow, error: pkgCheckErr } = await supabase
        .from("Listing")
        .select("status, paymentExpiry, violationFlag")
        .eq("slug", slug)
        .limit(1)
        .single();
      if (pkgCheckErr || !pkgCheckRow) {
        return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
      }
      const isExpiredPkg = pkgCheckRow.status === "active" && !!pkgCheckRow.paymentExpiry && new Date(pkgCheckRow.paymentExpiry) < new Date();
      if (pkgCheckRow.status !== "active" || pkgCheckRow.violationFlag || isExpiredPkg) {
        const reason = pkgCheckRow.status === "draft" ? "Iklan belum aktif"
          : pkgCheckRow.status === "pending" ? "Iklan masih menunggu verifikasi"
          : pkgCheckRow.status === "rejected" ? "Iklan ditolak"
          : pkgCheckRow.status === "sold" ? "Iklan sudah terjual"
          : pkgCheckRow.violationFlag ? "Iklan ditandai melanggar"
          : isExpiredPkg ? "Masa aktif iklan sudah berakhir"
          : "Iklan tidak aktif";
        return NextResponse.json({ error: `Boost/upgrade paket hanya tersedia untuk iklan yang sudah aktif. ${reason}.` }, { status: 400 });
      }
    }

    // Status change (e.g. mark as sold / un-sold)
    if (status !== undefined && !pkg) {
      if (!['active', 'sold', 'draft', 'pending', 'rejected'].includes(status)) {
        return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 });
      }
      data.status = status;
    }

    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = Math.floor(Number(price));
    if (priceType !== undefined) data.priceType = priceType;
    if (condition !== undefined) data.condition = condition;
    if (brand !== undefined) data.brand = brand || null;
    if (yearProduced !== undefined) data.yearProduced = yearProduced ? parseInt(yearProduced, 10) : null;
    if (city !== undefined) data.city = city;
    if (province !== undefined) data.province = province;
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (images !== undefined) {
      // On Vercel we cannot save images to the local filesystem — store the
      // raw images array (already URLs or base64) directly as a JSON string.
      data.images = JSON.stringify(images || []);
    }
    if (specs !== undefined) data.specs = JSON.stringify(specs);

    // Package activation: when `package` is provided, recompute packageType,
    // featured, status, paymentStatus, and paymentExpiry based on package pricing from DB.
    if (pkg) {
      const paketMap = await getPaketMap();
      const pkgKey = pkg;
      const pkgPrice = paketMap[pkgKey]?.price ?? 0;
      const pkgDays = paketMap[pkgKey]?.duration ?? 30;
      const isPaid = pkgKey === "simpan" || (pkgPrice > 0 && !!paymentMethod);
      data.packageType = pkgKey;
      data.featured = pkgKey === "spotlight" || pkgKey === "highlight";
      data.status = "pending";
      data.paymentStatus = pkgKey === "simpan" ? "unpaid" : (isPaid ? "paid" : "unpaid");
      if (isPaid && pkgDays > 0) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + pkgDays);
        data.paymentExpiry = expiryDate.toISOString();
      } else {
        data.paymentExpiry = null;
      }
      // IMPORTANT: persist uniqueCode on the Supabase path so Riwayat Pembayaran
      // shows the correct pkgPrice + uniqueCode total.
      if (typeof uniqueCode === "number" && uniqueCode > 0) {
        data.uniqueCode = uniqueCode;
      }
    }

    const { data: updatedRow, error: updateErr } = await supabase
      .from("Listing")
      .update(data)
      .eq("id", existingRow.id)
      .select("*")
      .single();

    if (updateErr || !updatedRow) {
      console.error("[listings/[slug]] Supabase PATCH error:", updateErr);
      return NextResponse.json({ error: "Gagal mengupdate iklan: " + (updateErr?.message || "unknown") }, { status: 500 });
    }

    return NextResponse.json({ listing: parseSupabaseListing(updatedRow) });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gagal mengupdate iklan: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // SECURITY: Only the listing's owner (or an admin) may delete it.
    const session = getSessionUser(_req);
    if (!session) {
      return NextResponse.json(
        { error: "Anda harus masuk untuk menghapus iklan." },
        { status: 401 }
      );
    }

    const { slug } = await params;

    // --- Path A: local dev (Prisma + SQLite) ---
    if (isDbAvailable()) {
      try {
        const existing = await db.listing.findUnique({ where: { slug } });
        if (!existing) {
          return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
        }

        // Ownership check.
        const isAdmin = session.role === "admin";
        if (!isAdmin && existing.userId !== session.id) {
          return NextResponse.json(
            { error: "Akses ditolak: Anda bukan pemilik iklan ini." },
            { status: 403 }
          );
        }

        await db.listing.delete({ where: { id: existing.id } });

        return NextResponse.json({ success: true, id: existing.id });
      } catch (prismaErr) {
        console.error("[listings/[slug]] DELETE Prisma error, falling back to Supabase:", prismaErr);
        // fall through to Supabase
      }
    }

    // --- Path B: Vercel (raw Supabase) ---
    const supabase = await getSupabase();

    const { data: existingRow, error: findErr } = await supabase
      .from("Listing")
      .select("id, userId")
      .eq("slug", slug)
      .limit(1)
      .single();
    if (findErr || !existingRow) {
      return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
    }

    // Ownership check (Supabase path).
    const isAdmin = session.role === "admin";
    if (!isAdmin && existingRow.userId !== session.id) {
      return NextResponse.json(
        { error: "Akses ditolak: Anda bukan pemilik iklan ini." },
        { status: 403 }
      );
    }

    const { error: deleteErr } = await supabase
      .from("Listing")
      .delete()
      .eq("id", existingRow.id);

    if (deleteErr) {
      console.error("[listings/[slug]] Supabase DELETE error:", deleteErr);
      return NextResponse.json({ error: "Gagal menghapus iklan: " + (deleteErr?.message || "unknown") }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: existingRow.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gagal menghapus iklan: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
