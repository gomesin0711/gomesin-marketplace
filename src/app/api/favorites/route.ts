import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// GET /api/favorites — return the CURRENT user's favorited listing IDs.
//
// SECURITY: userId is resolved EXCLUSIVELY from the verified session cookie.
// The `?userId=xxx` query param is IGNORED. This prevents account A from
// reading account B's private wishlist.
export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) {
    return NextResponse.json({ favorites: [] });
  }
  const userId = session.id;

  const rows = await db.favorite.findMany({
    where: { userId },
    select: { listingId: true },
    orderBy: { createdAt: "desc" },
  }).catch(() => []);

  return NextResponse.json({ favorites: rows.map((r) => r.listingId) });
}

// POST /api/favorites — add a favorite for the CURRENT user.
//
// SECURITY: userId is resolved from the verified session cookie; the body's
// `userId` field is IGNORED. This prevents account A from injecting favorites
// into account B's wishlist.
export async function POST(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) {
    return NextResponse.json(
      { error: "Sesi berakhir. Silakan masuk kembali." },
      { status: 401 }
    );
  }
  const userId = session.id;
  const { listingId } = await req.json();
  if (!listingId) {
    return NextResponse.json({ error: "listingId wajib" }, { status: 400 });
  }

  await db.favorite.create({
    data: { userId, listingId },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}

// DELETE /api/favorites — remove a favorite for the CURRENT user.
//
// SECURITY: userId is resolved from the verified session cookie; the body's
// `userId` field is IGNORED. This prevents account A from removing favorites
// from account B's wishlist.
export async function DELETE(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) {
    return NextResponse.json(
      { error: "Sesi berakhir. Silakan masuk kembali." },
      { status: 401 }
    );
  }
  const userId = session.id;
  const { listingId } = await req.json();
  if (!listingId) {
    return NextResponse.json({ error: "listingId wajib" }, { status: 400 });
  }

  await db.favorite.deleteMany({
    where: { userId, listingId },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
