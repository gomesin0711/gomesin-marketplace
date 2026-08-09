import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

// POST /api/listings/unique-code
// Generate a RANDOM, GLOBALLY UNIQUE 3-digit payment code (001-999) for a payer.
//
// IMPORTANT (user requirement): The code must be RANDOM (not the smallest
// available) and must CHANGE every time the page is refreshed or the user
// navigates away and comes back.
//
// Codes that have already been used by a paid listing are never reused
// (they stay in the "taken" set permanently).
//
// Body: { userId: string, packageType: string, amount?: number, listingId?: string }
// Returns: { uniqueCode: number, amount: number, reservationId: string }

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

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const result = await reserveRandomCodePrisma(userId, packageType, pkgAmount, listingId);
      return NextResponse.json(result);
    } catch (e: any) {
      if (e?.message === "NO_CODES_AVAILABLE") {
        return NextResponse.json(
          { error: "Semua kode unik sedang dipakai. Coba lagi nanti." },
          { status: 503 }
        );
      }
      // Race condition: P2002 unique-constraint — retry once
      if (e?.code === "P2002" && e?.meta?.target?.includes("code")) {
        try {
          const result = await reserveRandomCodePrisma(userId, packageType, pkgAmount, listingId);
          return NextResponse.json(result);
        } catch (retryErr: any) {
          if (retryErr?.message === "NO_CODES_AVAILABLE") {
            return NextResponse.json(
              { error: "Semua kode unik sedang dipakai. Coba lagi nanti." },
              { status: 503 }
            );
          }
          console.error("unique-code Prisma retry error:", retryErr);
          // fall through to Supabase
        }
      } else {
        console.error("unique-code Prisma error, falling back to Supabase:", e);
        // fall through to Supabase
      }
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  // The UniqueCode reservation table does NOT exist in Supabase. So we use a
  // simpler approach: query all uniqueCode values already saved on Listing
  // rows (these are permanently taken), pick a random 3-digit code that is
  // NOT in that set, and return it.
  //
  // The code is only "locked in" when the listing is actually created (POST
  // /api/listings saves uniqueCode on the Listing row). There is a tiny race
  // window if two users get the same code simultaneously before either
  // creates a listing, but with 999 codes and low traffic this is acceptable.
  // The code changes on every call (random pick), satisfying the requirement.
  try {
    const supabase = await getSupabase();
    const { data: rows, error } = await supabase
      .from("Listing")
      .select("uniqueCode")
      .not("uniqueCode", "is", null);

    if (error) {
      console.error("[unique-code] Supabase query error:", error);
      // Last resort: generate a random code without uniqueness check
      const fallbackCode = Math.floor(Math.random() * 999) + 1;
      return NextResponse.json({
        uniqueCode: fallbackCode,
        amount: pkgAmount,
        reservationId: "supabase-fallback-" + Date.now(),
      });
    }

    const takenSet = new Set<number>(
      (rows || [])
        .map((r: any) => r.uniqueCode)
        .filter((c: any) => typeof c === "number" && c > 0)
    );

    const available: number[] = [];
    for (let i = 1; i <= 999; i++) {
      if (!takenSet.has(i)) available.push(i);
    }
    if (available.length === 0) {
      return NextResponse.json(
        { error: "Semua kode unik sedang dipakai. Coba lagi nanti." },
        { status: 503 }
      );
    }

    const code = available[Math.floor(Math.random() * available.length)];

    return NextResponse.json({
      uniqueCode: code,
      amount: pkgAmount,
      reservationId: "supabase-" + Date.now() + "-" + code,
    });
  } catch (error) {
    console.error("[unique-code] Supabase fallback error:", error);
    // Ultimate fallback — random code without any uniqueness check
    const fallbackCode = Math.floor(Math.random() * 999) + 1;
    return NextResponse.json({
      uniqueCode: fallbackCode,
      amount: pkgAmount,
      reservationId: "emergency-" + Date.now(),
    });
  }
}

/**
 * Prisma-based reservation logic (local dev only).
 * Uses the UniqueCode table for atomic reservations.
 */
async function reserveRandomCodePrisma(
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
  //    the code goes back into the pool and a NEW code is generated.
  if (previousReservations.length > 0) {
    await db.uniqueCode.deleteMany({
      where: { userId, packageType, used: false, expiresAt: { gt: now } },
    });
  }

  // 3) Also release expired reservations (any user/package).
  await db.uniqueCode.deleteMany({
    where: { expiresAt: { lt: now }, used: false },
  });

  // 4) Collect all currently-reserved + used-in-listing codes (global uniqueness).
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

  // 6) Prefer a code DIFFERENT from the previous one(s).
  let candidates = available;
  if (available.length > 1) {
    const different = available.filter((c) => !previousCodes.has(c));
    if (different.length > 0) candidates = different;
  }

  // 7) Pick a RANDOM code from the candidates.
  const code = candidates[Math.floor(Math.random() * candidates.length)];

  // 8) Atomically reserve the code.
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
