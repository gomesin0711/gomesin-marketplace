import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { getPaketMap } from "@/lib/paket";
import { broadcastListingNew, broadcastListingPending } from "@/lib/broadcast";
import { normalizeSupabaseDate } from "@/lib/supabase-helpers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yzxeinqoryvprhuibtzn.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eGVpbnFvcnl2cHJodWlidHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjA5NTcsImV4cCI6MjEwMjQzNjk1N30.gmDvyEmNGP2PbL_3a8k18pTggRE9zQ3yBrBPQNJjWTI";

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Parse a raw Supabase row into the same shape as parseListing(Prisma row).
// Supabase returns columns as-is: price is a string (bigint), images/specs
// are JSON strings, createdAt is an ISO string.
function parseSupabaseListing(row: any) {
  if (!row) return row;
  const seller = row.seller
    ? { ...row.seller, joinedAt: normalizeSupabaseDate(row.seller.joinedAt) }
    : null;
  return {
    ...row,
    price: typeof row.price === "string" ? Number(row.price) : row.price ?? 0,
    images: row.images ? (typeof row.images === "string" ? safeJsonParse(row.images, []) : row.images) : [],
    specs: row.specs ? (typeof row.specs === "string" ? safeJsonParse(row.specs, {}) : row.specs) : {},
    createdAt: normalizeSupabaseDate(row.createdAt),
    paymentExpiry: normalizeSupabaseDate(row.paymentExpiry),
    // Mirror Prisma's parseListing: expose seller.joinedAt at the top level too.
    joinedAt: seller?.joinedAt ?? null,
    category: row.category ?? null,
    seller,
    user: row.user ?? null,
  };
}

function safeJsonParse(s: string, fallback: any) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// GET all listings (admin, include inactive/violation/unpaid)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "";

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const where: any = {};
      if (status) where.status = status;
      const [listings, paketMap] = await Promise.all([
        db.listing.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { category: true, seller: true },
        }),
        getPaketMap(),
      ]);
      const withFee = listings.map((l) => {
        const parsed = parseListing(l);
        const fee = paketMap[parsed.packageType || ""]?.price ?? 0;
        return { ...parsed, adFee: fee };
      });
      return NextResponse.json({ listings: withFee });
    } catch (error) {
      console.error("[admin/listings] Prisma GET error, falling back to Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  // NOTE: Supabase tables in this project have NO foreign-key relationships
  // declared, so the nested .select("*, category(*), seller(*), user(*)")
  // pattern that PostgREST requires FKs for will FAIL with an error and
  // silently return { listings: [] }. That was the root cause of the admin
  // "Iklan Aktif" page showing 0 listings on Vercel even though the beranda
  // (which uses a different code path) had 30+. We now select only "*" and
  // batch-fetch the related Category/Seller/User rows manually by ID.
  try {
    const supabase = await getSupabase();
    let query = supabase
      .from("Listing")
      .select("*")
      .order("createdAt", { ascending: false })
      .limit(100);
    if (status) query = query.eq("status", status);
    const { data: rows, error } = await query;
    if (error) {
      console.error("[admin/listings] Supabase GET error:", error);
      return NextResponse.json({ listings: [] });
    }

    const finalRows: any[] = rows || [];

    // Batch-fetch related rows by their IDs (single round-trip per table).
    const categoryIds = [...new Set(finalRows.map((r: any) => r.categoryId).filter(Boolean))];
    const sellerIds = [...new Set(finalRows.map((r: any) => r.sellerId).filter(Boolean))];
    const userIds = [...new Set(finalRows.map((r: any) => r.userId).filter(Boolean))];

    const [categoriesRes, sellersRes, usersRes] = await Promise.all([
      categoryIds.length
        ? supabase.from("Category").select("*").in("id", categoryIds)
        : Promise.resolve({ data: [], error: null }),
      sellerIds.length
        ? supabase.from("Seller").select("*").in("id", sellerIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase
            .from("User")
            .select("id, name, phone, email, city, logoImage, bannerImage")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const categoryMap = new Map((categoriesRes.data || []).map((c: any) => [c.id, c]));
    const sellerMap = new Map((sellersRes.data || []).map((s: any) => [s.id, s]));
    const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u]));

    const paketMap = await getPaketMap();
    const withFee = finalRows.map((row: any) => {
      const withRelations = {
        ...row,
        category: categoryMap.get(row.categoryId) ?? null,
        seller: sellerMap.get(row.sellerId) ?? null,
        user: userMap.get(row.userId) ?? null,
      };
      const parsed = parseSupabaseListing(withRelations);
      const fee = paketMap[parsed.packageType || ""]?.price ?? 0;
      return { ...parsed, adFee: fee };
    });
    return NextResponse.json({ listings: withFee });
  } catch (error) {
    console.error("[admin/listings] GET error:", error);
    return NextResponse.json({ listings: [] });
  }
}

// PATCH: update status (approve/reject/sold) OR toggle violation
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, violationFlag, violationReason } = body;
    if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });

    const data: any = {};
    if (status) {
      data.status = status;
      // when admin approves (status=active), also set paymentStatus=paid so it shows on beranda
      if (status === "active") data.paymentStatus = "paid";
    }
    if (violationFlag !== undefined) {
      data.violationFlag = violationFlag;
      data.violationReason = violationFlag ? (violationReason || "Melanggar ketentuan") : null;
      // if violation, also set status to rejected
      if (violationFlag) data.status = "rejected";
      else data.status = "active"; // restore when violation cleared
    }

    // Try Prisma (local) first, then Supabase (Vercel)
    if (isDbAvailable()) {
      try {
        await db.listing.update({ where: { id }, data });
        // ── Realtime broadcast ────────────────────────────────────────────
        // When the admin publishes a listing (status=active), fan out a
        // `listing:new` event to ALL connected clients so the homepage's
        // "Iklan Baru" section AND the notification bell update instantly
        // (no polling delay). For other status changes (reject, sold, etc.)
        // we still broadcast `listings:invalidate` so any open homepage
        // refetches its queries.
        try {
          if (status === "active" || (violationFlag === false && !status)) {
            // Fetch the freshly updated listing with relations so clients
            // get the full payload (matching the GET /api/listings shape).
            const fresh = await db.listing.findUnique({
              where: { id },
              include: {
                category: true,
                seller: true,
                user: { select: { id: true, name: true, phone: true, email: true, city: true, logoImage: true, bannerImage: true } },
              },
            });
            if (fresh) {
              broadcastListingNew(parseListing(fresh));
            }
          } else {
            // Reject / sold / etc. — just signal clients to refetch.
            broadcastListingPending({ id, status });
          }
        } catch (bcErr: any) {
          console.warn("[admin/listings] broadcast error:", bcErr?.message);
        }
        return NextResponse.json({ success: true });
      } catch (prismaErr) {
        console.error("[admin/listings] Prisma PATCH error, trying Supabase:", prismaErr);
      }
    }

    const supabase = await getSupabase();
    const { error } = await supabase.from("Listing").update(data).eq("id", id);
    if (error) {
      console.error("[admin/listings] Supabase PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/listings] PATCH error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// DELETE listing
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });

    // Try Prisma (local) first, then Supabase (Vercel)
    if (isDbAvailable()) {
      try {
        await db.listing.delete({ where: { id } });
        return NextResponse.json({ success: true });
      } catch (prismaErr) {
        console.error("[admin/listings] Prisma DELETE error, trying Supabase:", prismaErr);
      }
    }

    const supabase = await getSupabase();
    const { error } = await supabase.from("Listing").delete().eq("id", id);
    if (error) {
      console.error("[admin/listings] Supabase DELETE error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/listings] DELETE error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
