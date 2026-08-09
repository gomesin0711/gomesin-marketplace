import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fallbackGetUserById, fallbackUpdateUser } from "@/lib/auth-fallback";

// GET /api/auth/profile?userId=<id> — fetch latest user profile
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "User ID wajib" }, { status: 400 });
  }

  // Try SQLite/Prisma first
  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
        company: user.company,
        address: user.address,
        bannerImage: user.bannerImage,
        logoImage: user.logoImage,
        role: user.role,
        createdAt:
          user.createdAt instanceof Date
            ? user.createdAt.toISOString()
            : user.createdAt,
      },
    });
  } catch {
    // SQLite unavailable — use fallback
  }

  const user = await fallbackGetUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json({ user });
}

// PATCH /api/auth/profile — update user profile
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { userId, name, phone, city, company, address, bannerImage, logoImage } = body as {
    userId?: string;
    name?: string;
    phone?: string;
    city?: string;
    company?: string;
    address?: string;
    bannerImage?: string;
    logoImage?: string;
  };

  if (!userId) {
    return NextResponse.json(
      { error: "User ID wajib diisi." },
      { status: 400 }
    );
  }

  const updateData: { name?: string; phone?: string | null; city?: string | null; company?: string | null; address?: string | null; bannerImage?: string | null; logoImage?: string | null } = {};
  if (name && name.trim()) updateData.name = name.trim();
  if (phone !== undefined) updateData.phone = phone?.trim() || null;
  if (city !== undefined) updateData.city = city?.trim() || null;
  if (company !== undefined) updateData.company = company?.trim() || null;
  if (address !== undefined) updateData.address = address?.trim() || null;
  if (bannerImage !== undefined) updateData.bannerImage = bannerImage?.trim() || null;
  if (logoImage !== undefined) updateData.logoImage = logoImage?.trim() || null;

  // Try SQLite/Prisma first
  try {
    const existing = await db.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json(
        { error: "User tidak ditemukan." },
        { status: 404 }
      );
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Sync seller records
    if (updateData.phone !== undefined || updateData.name) {
      const sellerUpdate: { phone?: string | null; name?: string } = {};
      if (updateData.phone !== undefined) sellerUpdate.phone = updateData.phone;
      if (updateData.name) sellerUpdate.name = updateData.name;
      await db.seller.updateMany({
        where: { listings: { some: { userId } } },
        data: sellerUpdate,
      });
    }

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        city: updated.city,
        company: updated.company,
        address: updated.address,
        bannerImage: updated.bannerImage,
        logoImage: updated.logoImage,
        role: updated.role,
        createdAt:
          updated.createdAt instanceof Date
            ? updated.createdAt.toISOString()
            : updated.createdAt,
      },
    });
  } catch {
    // SQLite unavailable — use fallback
  }

  const user = await fallbackUpdateUser(userId, updateData);
  if (!user) {
    return NextResponse.json(
      { error: "User tidak ditemukan." },
      { status: 404 }
    );
  }
  return NextResponse.json({ user });
}
