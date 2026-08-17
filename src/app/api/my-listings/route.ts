import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { normalizeSupabaseDate } from "@/lib/supabase-helpers";
import { getSessionUser } from "@/lib/session";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/admin/listings/route.ts.
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

function safeJsonParse(s: string, fallback: any) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// Parse a raw Supabase row into the same shape as parseListing(Prisma row).
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

// GET listings owned by a specific user (for "My Ads" dashboard & seller page)
//
// SECURITY:
//   - `?userId=xxx` where xxx === session user's id → PRIVATE dashboard view:
//     returns ALL the user's listings (including drafts, pending, rejected).
//     Requires a valid session.
//   - `?userId=xxx` where xxx !== session user's id (or no session) → PUBLIC
//     seller page view: returns ONLY published listings (status=active,
//     paymentStatus=paid) for that user. No session required — listings are
//     public marketplace content.
//   - `?sellerId=xxx` → same as public userId path (legacy alternative).
//   - Admin override: admins may pass `?userId=other&all=1` to see ALL of
//     another user's listings (including drafts).
//
// This prevents account A from seeing account B's DRAFT/pending listings
// (private data) while still allowing the public seller page to show
// account B's PUBLISHED listings.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedUserId = searchParams.get("userId");
  const sellerId = searchParams.get("sellerId");
  const session = getSessionUser(req);
  const isAdmin = session?.role === "admin";
  const wantsAll = searchParams.get("all") === "1";

  // Resolve the target userId:
  //  - If userId param is given, use it.
  //  - Else if sellerId param is given, treat it as a userId (legacy behavior —
  //    in this codebase, store.sellerId actually stores a User id, not a
  //    Seller id; the original code also matched by userId then fell back to
  //    sellerId, so we preserve that behavior).
  const targetUserId = requestedUserId || sellerId;

  if (!targetUserId) {
    return NextResponse.json(
      { error: "User ID atau Seller ID wajib diisi." },
      { status: 400 }
    );
  }

  // Determine if this is a PRIVATE (dashboard) request or a PUBLIC (seller page)
  // request:
  //  - Session user querying their own id → PRIVATE.
  //  - Admin explicitly requesting all=1 → PRIVATE (admin override).
  //  - Everything else → PUBLIC (only published listings returned).
  const isOwnDashboard = !!session && session.id === targetUserId;
  const isAdminOverride = isAdmin && wantsAll;
  const includeAll = isOwnDashboard || isAdminOverride;

  return _getListingsByUser(targetUserId, includeAll);
}

// Returns listings for a given user.
//   - includeAll=true → return ALL listings (drafts, pending, rejected, etc.)
//     — used by the private dashboard view.
//   - includeAll=false → return ONLY published listings (status=active,
//     paymentStatus=paid, violationFlag=false) — used by the public seller
//     page view.
async function _getListingsByUser(userId: string, includeAll: boolean) {
  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      // Try userId first; if none found, fall back to sellerId
      const where: any = includeAll
        ? { userId }
        : { userId, status: "active", paymentStatus: "paid", violationFlag: false };
      let listings = await db.listing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { category: true, seller: true, user: true },
      });

      // If userId was provided but no listings found, try sellerId as fallback
      // (legacy listings created before the userId field was populated).
      if (listings.length === 0) {
        const fallbackWhere: any = includeAll
          ? { sellerId: userId }
          : { sellerId: userId, status: "active", paymentStatus: "paid", violationFlag: false };
        listings = await db.listing.findMany({
          where: fallbackWhere,
          orderBy: { createdAt: "desc" },
          include: { category: true, seller: true, user: true },
        });
      }

      return NextResponse.json({
        listings: listings.map(parseListing),
        total: listings.length,
      });
    } catch (prismaErr) {
      console.error("[my-listings] Prisma GET error, falling back to Supabase:", prismaErr);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();

    let query = supabase
      .from("Listing")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: false });
    if (!includeAll) {
      query = query
        .eq("status", "active")
        .eq("paymentStatus", "paid")
        .eq("violationFlag", false);
    }
    const { data: rows, error } = await query;

    let finalRows = rows || [];

    // If userId was provided but no listings found, try sellerId as fallback
    if (finalRows.length === 0) {
      let sellerQuery = supabase
        .from("Listing")
        .select("*")
        .eq("sellerId", userId)
        .order("createdAt", { ascending: false });
      if (!includeAll) {
        sellerQuery = sellerQuery
          .eq("status", "active")
          .eq("paymentStatus", "paid")
          .eq("violationFlag", false);
      }
      const { data: sellerRows, error: sellerErr } = await sellerQuery;
      if (!sellerErr) finalRows = sellerRows || [];
    }

    if (error) {
      console.error("[my-listings] Supabase GET error:", error);
    }

    return NextResponse.json({
      listings: finalRows.map(parseSupabaseListing),
      total: finalRows.length,
    });
  } catch (error) {
    console.error("[my-listings] GET error:", error);
    return NextResponse.json({
      listings: [],
      total: 0,
    });
  }
}
