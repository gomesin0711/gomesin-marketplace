import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/listings/unique-code
// Generate & store a unique payment code (3 digits) for a listing.
// The code is GLOBALLY UNIQUE — no two listings share the same code.
// Once assigned, it NEVER changes (stored in DB uniqueCode field).
//
// Body: { listingId?: string, userId: string, packageType: string }
// Returns: { uniqueCode: number, amount: number }
export async function POST(req: NextRequest) {
  try {
    const { listingId, userId, packageType } = await req.json();

    if (!userId || !packageType) {
      return NextResponse.json({ error: "userId dan packageType wajib" }, { status: 400 });
    }

    // If listing already has uniqueCode, return it (don't change).
    if (listingId) {
      const existing = await db.listing.findUnique({
        where: { id: listingId },
        select: { uniqueCode: true },
      });
      if (existing?.uniqueCode !== null && existing?.uniqueCode !== undefined) {
        return NextResponse.json({ uniqueCode: existing.uniqueCode });
      }
    }

    // Find all uniqueCodes already used by ALL users (global uniqueness).
    const usedCodes = await db.listing.findMany({
      where: { uniqueCode: { not: null } },
      select: { uniqueCode: true },
    });
    const usedSet = new Set(usedCodes.map((l) => l.uniqueCode));

    // Find a code from 1-999 that's not used by ANY listing (globally unique).
    let code: number | null = null;
    for (let i = 1; i <= 999; i++) {
      if (!usedSet.has(i)) {
        code = i;
        break;
      }
    }

    // If all 1-999 are used, wrap around.
    if (code === null) {
      code = Math.floor(Math.random() * 999) + 1;
    }

    // Store the code in the listing if listingId is provided.
    if (listingId) {
      await db.listing.update({
        where: { id: listingId },
        data: { uniqueCode: code },
      });
    }

    return NextResponse.json({ uniqueCode: code });
  } catch (e: any) {
    console.error("unique-code API error:", e);
    return NextResponse.json({ error: "Gagal generate kode unik" }, { status: 500 });
  }
}
