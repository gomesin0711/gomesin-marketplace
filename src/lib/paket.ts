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
      { key: "gold", name: "Gold", price: 30000, duration: 30, features: ["Iklan tampil 30 hari", "Badge Gold", "1x Sundul"], active: true },
      { key: "colek", name: "Colek", price: 50000, duration: 30, features: ["Iklan tampil 30 hari", "Badge Colek", "3x Sundul"], active: true },
      { key: "highlight", name: "Platinum", price: 100000, duration: 30, features: ["Iklan tampil 30 hari", "Badge Platinum", "Carousel Terdahsyat"], active: true },
      { key: "spotlight", name: "Titanium", price: 200000, duration: 30, features: ["Iklan tampil 30 hari", "Badge Titanium", "Carousel Terpopuler", "Prioritas Pencarian"], active: true },
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
