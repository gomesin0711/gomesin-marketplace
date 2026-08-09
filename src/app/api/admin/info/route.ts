import { NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/admin/info
// Public endpoint — returns the first admin user's id + name.
// Needed so any logged-in user can route chat messages (e.g. payment proof
// bukti pembayaran) to the admin via the in-app chat / socket.
//
// Only exposes id + name (NO email / phone / password) — safe to share.
// On DB error / no admin found, returns { admin: null } with HTTP 200 so the
// frontend doesn't get stuck in an infinite loading skeleton on Vercel.
export async function GET() {
  if (!isDbAvailable()) {
    return NextResponse.json({ admin: null });
  }
  try {
    const admin = await db.user.findFirst({
      where: { role: "admin" },
      select: { id: true, name: true },
    });

    if (!admin) {
      return NextResponse.json({ admin: null });
    }

    return NextResponse.json({ admin });
  } catch (e: any) {
    console.error("GET /api/admin/info error", e);
    return NextResponse.json({ admin: null });
  }
}
