import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaketMap } from "@/lib/paket";

export async function GET() {
  const now = new Date();

  // period boundaries
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  // week starts Monday
  const dow = (startOfWeek.getDay() + 6) % 7; // 0 = Monday
  startOfWeek.setDate(startOfWeek.getDate() - dow);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // total counts
  const [totalUsers, totalListings, totalAdmins] = await Promise.all([
    db.user.count(),
    db.listing.count(),
    db.user.count({ where: { role: "admin" } }),
  ]);

  // new users per period
  const [usersToday, usersWeek, usersMonth] = await Promise.all([
    db.user.count({ where: { createdAt: { gte: startOfToday } } }),
    db.user.count({ where: { createdAt: { gte: startOfWeek } } }),
    db.user.count({ where: { createdAt: { gte: startOfMonth } } }),
  ]);

  // new listings per period
  const [listingsToday, listingsWeek, listingsMonth] = await Promise.all([
    db.listing.count({ where: { createdAt: { gte: startOfToday } } }),
    db.listing.count({ where: { createdAt: { gte: startOfWeek } } }),
    db.listing.count({ where: { createdAt: { gte: startOfMonth } } }),
  ]);

  // omzet = total biaya pasang iklan (ad posting fees).
  // Harga diambil dari tabel Paket di DB (key: colek/sundul/highlight/spotlight),
  // BUKAN hardcoded berdasarkan nama paket lama (premium/bisnis) yang tidak ada
  // di DB — itu menyebabkan omzet selalu 0.
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

  // listings per category (top categories)
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

  // daily omzet for last 7 days (for chart) — based on ad posting fees
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
    totals: {
      users: totalUsers,
      listings: totalListings,
      admins: totalAdmins,
      omzetAll,
    },
    users: { today: usersToday, week: usersWeek, month: usersMonth },
    listings: { today: listingsToday, week: listingsWeek, month: listingsMonth },
    omzet: {
      today: omzetToday,
      week: omzetWeek,
      month: omzetMonth,
      all: omzetAll,
    },
    topCategories,
    last7Days,
  });
}
