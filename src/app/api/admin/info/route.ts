import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/admin/info
// Public endpoint — returns the first admin user's id + name.
// Needed so any logged-in user can route chat messages (e.g. payment proof
// bukti pembayaran) to the admin via the in-app chat / socket.
//
// Only exposes id + name (NO email / phone / password) — safe to share.
export async function GET() {
  try {
    const admin = await db.user.findFirst({
      where: { role: "admin" },
      select: { id: true, name: true },
    });

    if (!admin) {
      return NextResponse.json({ error: "Admin tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ admin });
  } catch (e: any) {
    console.error("GET /api/admin/info error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
