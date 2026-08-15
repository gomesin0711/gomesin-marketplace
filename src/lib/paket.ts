import { db } from "@/lib/db";

export type PaketData = {
  key: string;
  name: string;
  price: number;
  duration: number; // days
  features: string[];
  active: boolean;
};

let cache: PaketData[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

export async function getPakets(): Promise<PaketData[]> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;
  try {
    const rows = await db.paket.findMany({ orderBy: { sortOrder: "asc" } });
    cache = rows
      .filter((p) => p.key !== "__site_banner__") // hide promo-banner config row
      .map((p) => ({
        key: p.key,
        name: p.name,
        price: p.price,
        duration: p.duration,
        features: typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []),
        active: p.active,
      }));
  } catch {
    // Fallback: hardcoded default pakets (matches Supabase data)
    cache = [
      { key: "colek", name: "Gold", price: 60000, duration: 30, features: ["Tampil di bagian Premium", "Badge Gold", "Maksimal 5 foto", "Prioritas pencarian"], active: true },
      { key: "sundul", name: "Boost", price: 30000, duration: 10, features: ["Iklan didorong ke posisi teratas", "Badge Boost", "Boost 1x posisi", "Prioritas pencarian"], active: true },
      { key: "highlight", name: "Platinum", price: 50000, duration: 7, features: ["Tampil di bagian Premium", "Badge Platinum", "Maksimal 10 foto", "Prioritas pencarian", "Highlight border"], active: true },
      { key: "spotlight", name: "Titanium", price: 100000, duration: 7, features: ["Tampil di bagian Premium", "Badge Titanium", "Maksimal 15 foto", "Prioritas tertinggi", "Spotlight border", "Dilihat lebih banyak"], active: true },
    ];
  }
  cacheTime = now;
  return cache;
}

export async function getPaketMap(): Promise<Record<string, { price: number; duration: number }>> {
  const pakets = await getPakets();
  const map: Record<string, { price: number; duration: number }> = {};
  for (const p of pakets) {
    map[p.key] = { price: p.price, duration: p.duration };
  }
  return map;
}
