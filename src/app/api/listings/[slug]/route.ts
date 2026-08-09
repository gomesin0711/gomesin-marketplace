import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { getPaketMap } from "@/lib/paket";
import { saveImagesToLocal } from "@/lib/save-image";
import { getFallbackListingBySlug } from "@/lib/fallback-data";

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
    const { title, description, price, priceType, condition, brand, yearProduced, city, province, categoryId, images, specs, package: pkg, paymentMethod, status } = body;

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
    }

    const updated = await db.listing.update({
      where: { id: existing.id },
      data,
      include: { category: true, seller: true, user: true },
    });

    return NextResponse.json({ listing: parseListing(updated) });
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

    const existing = await db.listing.findUnique({ where: { slug } });
    if (!existing) {
      return NextResponse.json({ error: "Iklan tidak ditemukan" }, { status: 404 });
    }

    await db.listing.delete({ where: { id: existing.id } });

    return NextResponse.json({ success: true, id: existing.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gagal menghapus iklan: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
