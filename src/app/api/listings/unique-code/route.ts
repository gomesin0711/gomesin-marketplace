import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/listings/unique-code
// Reserve a GLOBALLY UNIQUE 3-digit payment code (001-999) for a payer.
// The code is reserved atomically in the UniqueCode table and is NEVER
// given to another payer. Expired/unused reservations (older than 24h)
// are released so the code can be reused later.
//
// Body: { userId: string, packageType: string, amount: number, listingId?: string }
// Returns: { uniqueCode: number, amount: number }
export async function POST(req: NextRequest) {
  try {
    const { userId, packageType, amount, listingId } = await req.json();

    if (!userId || !packageType) {
      return NextResponse.json({ error: "userId dan packageType wajib" }, { status: 400 });
    }

    const pkgAmount = typeof amount === "number" && amount > 0 ? amount : 0;
    const now = new Date();
    const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h reservation

    // 1) If this user already has an active (non-expired, unused) reservation
    //    for the same package, return it (idempotent).
    const existing = await db.uniqueCode.findFirst({
      where: {
        userId,
        packageType,
        expiresAt: { gt: now },
        used: false,
      },
      orderBy: { reservedAt: "desc" },
    });
    if (existing) {
      return NextResponse.json({
        uniqueCode: existing.code,
        amount: existing.amount,
        reservationId: existing.id,
      });
    }

    // 2) Release expired reservations so their codes can be reused.
    await db.uniqueCode.deleteMany({
      where: { expiresAt: { lt: now }, used: false },
    });

    // 3) Collect all currently-reserved + used codes (global uniqueness).
    const reserved = await db.uniqueCode.findMany({ select: { code: true } });
    const usedListingCodes = await db.listing.findMany({
      where: { uniqueCode: { not: null } },
      select: { uniqueCode: true },
    });
    const takenSet = new Set<number>([
      ...reserved.map((r) => r.code),
      ...usedListingCodes.map((l) => l.uniqueCode!),
    ]);

    // 4) Find the smallest available code in 1..999.
    let code: number | null = null;
    for (let i = 1; i <= 999; i++) {
      if (!takenSet.has(i)) {
        code = i;
        break;
      }
    }
    if (code === null) {
      return NextResponse.json(
        { error: "Semua kode unik sedang dipakai. Coba lagi nanti." },
        { status: 503 }
      );
    }

    // 5) Atomically reserve the code. The @unique constraint on `code`
    //    guarantees that even under concurrent requests, only one writer
    //    can claim a given code.
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

    return NextResponse.json({
      uniqueCode: reservation.code,
      amount: reservation.amount,
      reservationId: reservation.id,
    });
  } catch (e: any) {
    // Race condition: another request grabbed the same code between our
    // check and insert. Retry once with a different code.
    if (e?.code === "P2002" && e?.meta?.target?.includes("code")) {
      try {
        const now = new Date();
        const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const { userId, packageType, amount, listingId } = await req.json();
        const reserved = await db.uniqueCode.findMany({ select: { code: true } });
        const usedListingCodes = await db.listing.findMany({
          where: { uniqueCode: { not: null } },
          select: { uniqueCode: true },
        });
        const takenSet = new Set<number>([
          ...reserved.map((r) => r.code),
          ...usedListingCodes.map((l) => l.uniqueCode!),
        ]);
        for (let i = 1; i <= 999; i++) {
          if (!takenSet.has(i)) {
            const reservation = await db.uniqueCode.create({
              data: {
                code: i,
                userId,
                packageType,
                listingId: listingId || null,
                amount: typeof amount === "number" ? amount : 0,
                expiresAt: expiry,
              },
            });
            return NextResponse.json({
              uniqueCode: reservation.code,
              amount: reservation.amount,
              reservationId: reservation.id,
            });
          }
        }
      } catch (retryErr) {
        console.error("unique-code retry error:", retryErr);
      }
    }
    console.error("unique-code API error:", e);
    return NextResponse.json({ error: "Gagal generate kode unik" }, { status: 500 });
  }
}
