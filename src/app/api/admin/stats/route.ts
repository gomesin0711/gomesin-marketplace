import { NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { getPaketMap } from "@/lib/paket";

export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nyyvmttbwlwqunigkrms.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8";

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Default empty stats payload
function emptyStats() {
  return {
    totals: { users: 0, listings: 0, admins: 0, omzetAll: 0 },
    users: { today: 0, week: 0, month: 0 },
    listings: { today: 0, week: 0, month: 0 },
    omzet: { today: 0, week: 0, month: 0, all: 0 },
    topCategories: [] as { name: string; count: number }[],
    last7Days: [] as { date: string; label: string; omzet: number; count: number }[],
  };
}

export async function GET() {
  if (!isDbAvailable()) {
    // Try Supabase directly (Vercel)
    return getStatsFromSupabase();
  }

  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    const dow = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - dow);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, totalListings, totalAdmins] = await Promise.all([
      db.user.count(),
      db.listing.count(),
      db.user.count({ where: { role: "admin" } }),
    ]);

    const [usersToday, usersWeek, usersMonth] = await Promise.all([
      db.user.count({ where: { createdAt: { gte: startOfToday } } }),
      db.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      db.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    const [listingsToday, listingsWeek, listingsMonth] = await Promise.all([
      db.listing.count({ where: { createdAt: { gte: startOfToday } } }),
      db.listing.count({ where: { createdAt: { gte: startOfWeek } } }),
      db.listing.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    const paketMap = await getPaketMap();
    const adFee = (pkg: string) => paketMap[pkg]?.price ?? 0;

    const [omzetListingsToday, omzetListingsWeek, omzetListingsMonth, allListingsForOmzet] = await Promise.all([
      db.listing.findMany({ where: { createdAt: { gte: startOfToday } }, select: { packageType: true } }),
      db.listing.findMany({ where: { createdAt: { gte: startOfWeek } }, select: { packageType: true } }),
      db.listing.findMany({ where: { createdAt: { gte: startOfMonth } }, select: { packageType: true } }),
      db.listing.findMany({ select: { packageType: true } }),
    ]);

    const omzetToday = omzetListingsToday.reduce((sum, l) => sum + adFee(l.packageType), 0);
    const omzetWeek = omzetListingsWeek.reduce((sum, l) => sum + adFee(l.packageType), 0);
    const omzetMonth = omzetListingsMonth.reduce((sum, l) => sum + adFee(l.packageType), 0);
    const omzetAll = allListingsForOmzet.reduce((sum, l) => sum + adFee(l.packageType), 0);

    const allCategoryCounts = await db.listing.groupBy({
      by: ["categoryId"],
      _count: true,
    });
    const categoryCounts = [...allCategoryCounts]
      .sort((a, b) => ((b._count as any)?._all ?? 0) - ((a._count as any)?._all ?? 0))
      .slice(0, 6);
    const catIds = categoryCounts.map((c) => c.categoryId);
    const cats = await db.category.findMany({ where: { id: { in: catIds } } });
    const catMap: Record<string, string> = {};
    cats.forEach((c) => (catMap[c.id] = c.name));
    const topCategories = categoryCounts.map((c) => ({
      name: catMap[c.categoryId] || "—",
      count: (c._count as any)?._all ?? (typeof c._count === 'number' ? c._count : 0),
    }));

    const last7Days: { date: string; label: string; omzet: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dStart = new Date(startOfToday);
      dStart.setDate(dStart.getDate() - i);
      const dEnd = new Date(dStart);
      dEnd.setDate(dEnd.getDate() + 1);
      const dayListings = await db.listing.findMany({
        where: { createdAt: { gte: dStart, lt: dEnd } },
        select: { packageType: true },
      });
      const label = dStart.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
      last7Days.push({
        date: dStart.toISOString().slice(0, 10),
        label,
        omzet: dayListings.reduce((sum, l) => sum + adFee(l.packageType), 0),
        count: dayListings.length,
      });
    }

    return NextResponse.json({
      totals: { users: totalUsers, listings: totalListings, admins: totalAdmins, omzetAll },
      users: { today: usersToday, week: usersWeek, month: usersMonth },
      listings: { today: listingsToday, week: listingsWeek, month: listingsMonth },
      omzet: { today: omzetToday, week: omzetWeek, month: omzetMonth, all: omzetAll },
      topCategories,
      last7Days,
    }, {
      // Admin-only, private cache 10s. Was polled every 3s = 20 req/min = 28K/day.
      // With 30s polling + 10s private cache, requests drop to ~2/min = 3K/day.
      headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
    });
  } catch (error) {
    console.error("[admin/stats] Prisma error, trying Supabase:", error);
    return getStatsFromSupabase();
  }
}

// ---------------------------------------------------------------------------
// Supabase fallback — used on Vercel where Prisma (sqlite) can't connect.
// Fetches raw rows and computes stats in JS.
// ---------------------------------------------------------------------------
async function getStatsFromSupabase() {
  try {
    const supabase = await getSupabase();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    const dow = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - dow);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const isoToday = startOfToday.toISOString();
    const isoWeek = startOfWeek.toISOString();
    const isoMonth = startOfMonth.toISOString();

    // Fetch all users and listings (we need createdAt + packageType + role + categoryId)
    const [usersRes, listingsRes, catsRes] = await Promise.all([
      supabase.from("User").select("id,role,createdAt"),
      supabase.from("Listing").select("id,packageType,categoryId,createdAt"),
      supabase.from("Category").select("id,name"),
    ]);

    if (usersRes.error || listingsRes.error) {
      console.error("[admin/stats] Supabase error:", usersRes.error, listingsRes.error);
      return NextResponse.json(emptyStats());
    }

    const users: any[] = usersRes.data || [];
    const listings: any[] = listingsRes.data || [];
    const cats: any[] = catsRes.data || [];
    const catMap: Record<string, string> = {};
    cats.forEach((c: any) => (catMap[c.id] = c.name));

    const paketMap = await getPaketMap();
    const adFee = (pkg: string) => paketMap[pkg]?.price ?? 0;

    const parseDate = (d: any) => (d ? new Date(d) : new Date(0));

    const totalUsers = users.length;
    const totalListings = listings.length;
    const totalAdmins = users.filter((u) => u.role === "admin").length;

    const usersToday = users.filter((u) => parseDate(u.createdAt) >= startOfToday).length;
    const usersWeek = users.filter((u) => parseDate(u.createdAt) >= startOfWeek).length;
    const usersMonth = users.filter((u) => parseDate(u.createdAt) >= startOfMonth).length;

    const listingsToday = listings.filter((l) => parseDate(l.createdAt) >= startOfToday).length;
    const listingsWeek = listings.filter((l) => parseDate(l.createdAt) >= startOfWeek).length;
    const listingsMonth = listings.filter((l) => parseDate(l.createdAt) >= startOfMonth).length;

    const omzetToday = listings.filter((l) => parseDate(l.createdAt) >= startOfToday).reduce((s, l) => s + adFee(l.packageType), 0);
    const omzetWeek = listings.filter((l) => parseDate(l.createdAt) >= startOfWeek).reduce((s, l) => s + adFee(l.packageType), 0);
    const omzetMonth = listings.filter((l) => parseDate(l.createdAt) >= startOfMonth).reduce((s, l) => s + adFee(l.packageType), 0);
    const omzetAll = listings.reduce((s, l) => s + adFee(l.packageType), 0);

    // Top categories
    const catCounts: Record<string, number> = {};
    listings.forEach((l) => {
      if (l.categoryId) catCounts[l.categoryId] = (catCounts[l.categoryId] || 0) + 1;
    });
    const topCategories = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, count]) => ({ name: catMap[id] || "—", count }));

    // Last 7 days
    const last7Days: { date: string; label: string; omzet: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dStart = new Date(startOfToday);
      dStart.setDate(dStart.getDate() - i);
      const dEnd = new Date(dStart);
      dEnd.setDate(dEnd.getDate() + 1);
      const dayListings = listings.filter((l) => {
        const d = parseDate(l.createdAt);
        return d >= dStart && d < dEnd;
      });
      const label = dStart.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
      last7Days.push({
        date: dStart.toISOString().slice(0, 10),
        label,
        omzet: dayListings.reduce((s, l) => s + adFee(l.packageType), 0),
        count: dayListings.length,
      });
    }

    return NextResponse.json({
      totals: { users: totalUsers, listings: totalListings, admins: totalAdmins, omzetAll },
      users: { today: usersToday, week: usersWeek, month: usersMonth },
      listings: { today: listingsToday, week: listingsWeek, month: listingsMonth },
      omzet: { today: omzetToday, week: omzetWeek, month: omzetMonth, all: omzetAll },
      topCategories,
      last7Days,
    }, {
      headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
    });
  } catch (error) {
    console.error("[admin/stats] Supabase fallback error:", error);
    return NextResponse.json(emptyStats());
  }
}
