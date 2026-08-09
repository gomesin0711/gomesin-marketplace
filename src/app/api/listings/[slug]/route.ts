import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { getPaketMap } from "@/lib/paket";
import { saveImagesToLocal } from "@/lib/save-image";
import { getFallbackListingBySlug } from "@/lib/fallback-data";

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const listing = await db.listing.findUnique({
      where: { slug },
      include: { category: true, seller: true, user: true },
    });

    if (!listing) {
      return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
    }

    // increment views (non-blocking, fire and forget)
    db.listing.update({ where: { id: listing.id }, data: { views: { increment: 1 } } }).catch(() => {});

    // related: same category, exclude self — parallel with the above fire-and-forget
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
  } catch (error) {
    console.error("GET /api/listings/[slug] DB error, falling back to seed data", error);

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

        const data: any = {};

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
      .select("id")
      .eq("slug", slug)
      .limit(1)
      .single();
    if (findErr || !existingRow) {
      return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
    }

    const data: any = {};

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
    const { slug } = await params;

    // --- Path A: local dev (Prisma + SQLite) ---
    if (isDbAvailable()) {
      try {
        const existing = await db.listing.findUnique({ where: { slug } });
        if (!existing) {
          return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
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
      .select("id")
      .eq("slug", slug)
      .limit(1)
      .single();
    if (findErr || !existingRow) {
      return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
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
