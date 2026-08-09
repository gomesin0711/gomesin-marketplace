import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fallbackGetUserById, fallbackUpdateUser } from "@/lib/auth-fallback";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
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

// GET /api/auth/profile?userId=<id> — fetch latest user profile
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "User ID wajib" }, { status: 400 });
  }

  // Try SQLite/Prisma first
  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (user) {
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
    }
    // If Prisma found no user, fall through to the Supabase fallback.
  } catch {
    // SQLite unavailable — try Supabase next
  }

  // --- Supabase fallback (Vercel) ---
  try {
    const supabase = await getSupabase();
    const { data: supaUser, error } = await supabase
      .from("User")
      .select("*")
      .eq("id", userId)
      .single();
    if (!error && supaUser) {
      return NextResponse.json({
        user: {
          id: supaUser.id,
          name: supaUser.name,
          email: supaUser.email,
          phone: supaUser.phone,
          city: supaUser.city,
          company: supaUser.company,
          address: supaUser.address,
          bannerImage: supaUser.bannerImage,
          logoImage: supaUser.logoImage,
          role: supaUser.role,
          createdAt: supaUser.createdAt,
        },
      });
    }
  } catch (supaErr) {
    console.error("[auth/profile] Supabase GET fallback error:", supaErr);
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
    // SQLite unavailable — try Supabase next
  }

  // --- Supabase fallback (Vercel) ---
  try {
    const supabase = await getSupabase();
    // Build Supabase update payload (only non-undefined fields)
    const supaUpdate: Record<string, any> = {};
    if (updateData.name !== undefined) supaUpdate.name = updateData.name;
    if (updateData.phone !== undefined) supaUpdate.phone = updateData.phone;
    if (updateData.city !== undefined) supaUpdate.city = updateData.city;
    if (updateData.company !== undefined) supaUpdate.company = updateData.company;
    if (updateData.address !== undefined) supaUpdate.address = updateData.address;
    if (updateData.bannerImage !== undefined) supaUpdate.bannerImage = updateData.bannerImage;
    if (updateData.logoImage !== undefined) supaUpdate.logoImage = updateData.logoImage;

    if (Object.keys(supaUpdate).length > 0) {
      const { data: updated, error: updErr } = await supabase
        .from("User")
        .update(supaUpdate)
        .eq("id", userId)
        .select("*")
        .single();
      if (!updErr && updated) {
        // Sync seller records (best-effort — Supabase tables have no FK)
        if (supaUpdate.phone !== undefined || supaUpdate.name !== undefined) {
          const sellerUpd: Record<string, any> = {};
          if (supaUpdate.phone !== undefined) sellerUpd.phone = supaUpdate.phone;
          if (supaUpdate.name !== undefined) sellerUpd.name = supaUpdate.name;
          // Find seller ids via Listing.userId, then update each seller
          const { data: sellerRows } = await supabase
            .from("Listing")
            .select("sellerId")
            .eq("userId", userId)
            .limit(50);
          if (sellerRows && sellerRows.length > 0) {
            const sellerIds = [...new Set(sellerRows.map((r: any) => r.sellerId).filter(Boolean))];
            for (const sid of sellerIds) {
              await supabase.from("Seller").update(sellerUpd).eq("id", sid);
            }
          }
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
            createdAt: updated.createdAt,
          },
        });
      }
    }
  } catch (supaErr) {
    console.error("[auth/profile] Supabase PATCH fallback error:", supaErr);
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
