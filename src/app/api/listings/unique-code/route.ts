import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/listings/unique-code
// Generate a RANDOM, GLOBALLY UNIQUE 3-digit payment code (001-999) for a payer.
//
// IMPORTANT (user requirement): The code must be RANDOM (not the smallest
// available) and must CHANGE every time the page is refreshed or the user
// navigates away and comes back. Therefore this endpoint is NOT idempotent —
// every call releases the previous unused reservation for the same
// (userId, packageType) and generates a brand-new random code that is
// different from the previous one (whenever more than one code is available).
//
// Codes that have already been used by a paid listing are never reused
// (they stay in the "taken" set permanently). Unused reservations also expire
// automatically after 24h and are then eligible for reuse.
//
// Body: { userId: string, packageType: string, amount?: number, listingId?: string }
// Returns: { uniqueCode: number, amount: number, reservationId: string }
export async function POST(req: NextRequest) {
  // Parse the body once and reuse it in the retry path (the body stream can
  // only be read a single time).
  let body: { userId?: string; packageType?: string; amount?: number; listingId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body request tidak valid" }, { status: 400 });
  }

  const { userId, packageType, amount, listingId } = body;
  if (!userId || !packageType) {
    return NextResponse.json({ error: "userId dan packageType wajib" }, { status: 400 });
  }

  const pkgAmount = typeof amount === "number" && amount > 0 ? amount : 0;

  try {
    const result = await reserveRandomCode(userId, packageType, pkgAmount, listingId);
    return NextResponse.json(result);
  } catch (e: any) {
    // No available codes left in the pool (all 1-999 are reserved/used).
    if (e?.message === "NO_CODES_AVAILABLE") {
      return NextResponse.json(
        { error: "Semua kode unik sedang dipakai. Coba lagi nanti." },
        { status: 503 }
      );
    }
    // Race condition: another request grabbed the same code between our
    // check and insert (P2002 unique-constraint violation on `code`).
    // Retry once — a new random code will be picked from the updated pool.
    if (e?.code === "P2002" && e?.meta?.target?.includes("code")) {
      try {
        const result = await reserveRandomCode(userId, packageType, pkgAmount, listingId);
        return NextResponse.json(result);
      } catch (retryErr: any) {
        if (retryErr?.message === "NO_CODES_AVAILABLE") {
          return NextResponse.json(
            { error: "Semua kode unik sedang dipakai. Coba lagi nanti." },
            { status: 503 }
          );
        }
        console.error("unique-code retry error:", retryErr);
        return NextResponse.json({ error: "Gagal generate kode unik" }, { status: 500 });
      }
    }
    console.error("unique-code API error:", e);
    return NextResponse.json({ error: "Gagal generate kode unik" }, { status: 500 });
  }
}

/**
 * Core logic: release the previous unused reservation for this
 * (userId, packageType), then pick a RANDOM available code that is
 * DIFFERENT from the previous one (when possible) and reserve it.
 */
async function reserveRandomCode(
  userId: string,
  packageType: string,
  pkgAmount: number,
  listingId?: string
): Promise<{ uniqueCode: number; amount: number; reservationId: string }> {
  const now = new Date();
  const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h reservation

  // 1) Capture the previous code(s) for this user+package so we can avoid
  //    re-picking the same one (guarantees the code visibly changes).
  const previousReservations = await db.uniqueCode.findMany({
    where: { userId, packageType, used: false, expiresAt: { gt: now } },
    select: { code: true },
  });
  const previousCodes = new Set<number>(previousReservations.map((r) => r.code));

  // 2) Release the previous unused reservation(s) for this user+package so
  //    the code goes back into the pool and a NEW code is generated. This
  //    is what makes the code change on every refresh / navigation.
  if (previousReservations.length > 0) {
    await db.uniqueCode.deleteMany({
      where: { userId, packageType, used: false, expiresAt: { gt: now } },
    });
  }

  // 3) Also release expired reservations (any user/package) so their codes
  //    can be reused — keeps the pool from exhausting over time.
  await db.uniqueCode.deleteMany({
    where: { expiresAt: { lt: now }, used: false },
  });

  // 4) Collect all currently-reserved + used-in-listing codes (global uniqueness).
  //    Codes used by paid listings are NEVER reused.
  const reserved = await db.uniqueCode.findMany({ select: { code: true } });
  const usedListingCodes = await db.listing.findMany({
    where: { uniqueCode: { not: null } },
    select: { uniqueCode: true },
  });
  const takenSet = new Set<number>([
    ...reserved.map((r) => r.code),
    ...usedListingCodes.map((l) => l.uniqueCode!),
  ]);

  // 5) Build the list of available codes (1-999 not in the taken set).
  const available: number[] = [];
  for (let i = 1; i <= 999; i++) {
    if (!takenSet.has(i)) available.push(i);
  }
  if (available.length === 0) {
    throw new Error("NO_CODES_AVAILABLE");
  }

  // 6) Prefer a code DIFFERENT from the previous one(s) so the code visibly
  //    changes on refresh. Fall back to the full available list only when
  //    every remaining code equals the previous one (extremely unlikely
  //    with 999 codes).
  let candidates = available;
  if (available.length > 1) {
    const different = available.filter((c) => !previousCodes.has(c));
    if (different.length > 0) candidates = different;
  }

  // 7) Pick a RANDOM code from the candidates (NOT the smallest).
  const code = candidates[Math.floor(Math.random() * candidates.length)];

  // 8) Atomically reserve the code. The @unique constraint on `code`
  //    guarantees uniqueness even under concurrent requests.
  const reservation = await db.uniqueCode.create({
    data: {
      code,
      userId,
      packageType,
      listingId: listingId || null,
      amount: pkgAmount,
      expiresAt: expiry,
    },
  });

  return {
    uniqueCode: reservation.code,
    amount: reservation.amount,
    reservationId: reservation.id,
  };
}
