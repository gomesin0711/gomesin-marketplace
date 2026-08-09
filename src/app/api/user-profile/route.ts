import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/user-profile?userId=<id>
// Public — returns a user's public profile (name, company, city, bannerImage, logoImage, createdAt).
// Used by the seller page to display the seller's banner + logo.
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "User ID wajib" }, { status: 400 });
    }
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
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (e: any) {
    console.error("GET /api/user-profile error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
