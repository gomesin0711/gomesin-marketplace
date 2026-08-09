// Shared types & helpers for Gomesin
import type { Lang } from "./i18n";
import { translations, formatT } from "./i18n";

export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
};

export type Seller = {
  id: string;
  name: string;
  phone: string;
  avatar: string | null;
  city: string;
  province: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  joinedAt: string;
};

export type Listing = {
  id: string;
  title: string;
  titleEn?: string | null;
  titleZh?: string | null;
  slug: string;
  description: string;
  descEn?: string | null;
  descZh?: string | null;
  price: number;
  priceType: string;
  condition: string;
  brand: string | null;
  yearProduced: number | null;
  city: string;
  province: string;
  images: string[];
  specs: Record<string, string>;
  specsEn?: string | null;
  specsZh?: string | null;
  featured: boolean;
  views: number;
  status: string;
  packageType?: string;
  createdAt: string;
  category: Category;
  seller: Seller;
};

export function formatRupiah(n: number): string {
  const num = typeof n === "bigint" ? Number(n) : n;
  if (num >= 1_000_000_000) {
    const v = num / 1_000_000_000;
    return "Rp " + (Number.isInteger(v) ? v.toString() : v.toFixed(1).replace(/\.0$/, "")) + " M";
  }
  if (num >= 1_000_000) {
    const v = num / 1_000_000;
    return "Rp " + (Number.isInteger(v) ? v.toString() : v.toFixed(1).replace(/\.0$/, "")) + " jt";
  }
  if (num >= 1_000) {
    const v = num / 1_000;
    return "Rp " + (Number.isInteger(v) ? v.toString() : v.toFixed(0)) + " rb";
  }
  return "Rp " + num.toLocaleString("de-DE");
}

export function formatRupiahFull(n: number): string {
  // Format with dot thousands separator: 50012 → "Rp 50.012"
  const num = typeof n === "bigint" ? Number(n) : n;
  return "Rp " + num.toLocaleString("de-DE");
}

export function timeAgo(iso: string, lang: Lang = "id"): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - d);
  const min = Math.floor(diff / 60000);
  const t = translations[lang];
  if (min < 60) return min <= 1 ? t.justNow : formatT(t.minAgo, { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return formatT(t.hrAgo, { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return formatT(t.dayAgo, { n: day });
  const mo = Math.floor(day / 30);
  if (mo < 12) return formatT(t.monthAgo, { n: mo });
  return formatT(t.yearAgo, { n: Math.floor(mo / 12) });
}

export function parseListing(raw: any): Listing {
  if (!raw) return raw;
  return {
    ...raw,
    price: typeof raw.price === "bigint" ? Number(raw.price) : raw.price,
    images: raw.images ? (typeof raw.images === "string" ? JSON.parse(raw.images) : raw.images) : [],
    specs: raw.specs ? (typeof raw.specs === "string" ? JSON.parse(raw.specs) : raw.specs) : {},
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : raw.createdAt,
    joinedAt: raw.seller?.joinedAt instanceof Date ? raw.seller.joinedAt.toISOString() : raw.seller?.joinedAt,
  };
}

export const PROVINCES = [
  "DKI Jakarta",
  "Jawa Barat",
  "Jawa Tengah",
  "Jawa Timur",
  "Banten",
  "DI Yogyakarta",
  "Sumatera Utara",
  "Sumatera Barat",
  "Sumatera Selatan",
  "Riau",
  "Jambi",
  "Lampung",
  "Kalimantan Timur",
  "Kalimantan Barat",
  "Kalimantan Selatan",
  "Sulawesi Selatan",
  "Sulawesi Utara",
  "Bali",
  "NTB",
  "NTT",
];

export const PROVINCE_CITIES: Record<string, string[]> = {
  "DKI Jakarta": ["Jakarta Pusat", "Jakarta Selatan", "Jakarta Barat", "Jakarta Timur", "Jakarta Utara", "Kepulauan Seribu"],
  "Jawa Barat": ["Bandung", "Bekasi", "Bogor", "Cimahi", "Cirebon", "Depok", "Garut", "Karawang", "Sukabumi", "Sumedang", "Tasikmalaya", "Subang", "Purwakarta", "Indramayu", "Majalengka", "Kuningan", "Cianjur", "Pangandaran", "Banjar"],
  "Jawa Tengah": ["Semarang", "Solo", "Surakarta", "Magelang", "Pekalongan", "Tegal", "Salatiga", "Kudus", "Purwokerto", "Cilacap", "Klaten", "Kendal", "Demak", "Brebes", "Wonosobo", "Temanggung", "Batang", "Pemalang", "Jepara", "Blora", "Rembang", "Pat", "Sragen", "Karanganyar", "Boyolali", "Sukoharjo", "Wonogiri"],
  "Jawa Timur": ["Surabaya", "Malang", "Sidoarjo", "Gresik", "Kediri", "Mojokerto", "Pasuruan", "Probolinggo", "Blitar", "Jember", "Banyuwangi", "Tulungagung", "Lumajang", "Bondowoso", "Situbondo", "Nganjuk", "Madiun", "Magetan", "Ponorogo", "Pacitan", "Trenggalek", "Tuban", "Lamongan", "Bojonegoro", "Lamongan"],
  "Banten": ["Tangerang", "Tangerang Selatan", "Serang", "Cilegon", "Pandeglang", "Lebak"],
  "DI Yogyakarta": ["Yogyakarta", "Sleman", "Bantul", "Gunungkidul", "Kulonprogo"],
  "Sumatera Utara": ["Medan", "Binjai", "Pematangsiantar", "Tebing Tinggi", "Deli Serdang", "Langkat", "Simalungun", "Labuhanbatu", "Asahan", "Karo", "Nias"],
  "Sumatera Barat": ["Padang", "Bukittinggi", "Payakumbuh", "Solok", "Pariaman", "Padang Panjang", "Sawahlunto", "Dharmasraya", "Agam", "Tanah Datar", "Pasaman"],
  "Sumatera Selatan": ["Palembang", "Prabumulih", "Lahat", "Muara Enim", "Banyuasin", "Ogan Ilir", "Ogan Komering Ulu", "Musi Rawas"],
  "Riau": ["Pekanbaru", "Dumai", "Bengkalis", "Kampar", "Rokan Hulu", "Rokan Hilir", "Siak", "Indragiri Hulu", "Indragiri Hilir", "Pelalawan"],
  "Jambi": ["Jambi", "Sungai Penuh", "Muaro Jambi", "Batanghari", "Tanjung Jabung Barat", "Tanjung Jabung Timur", "Bungo", "Tebo", "Merangin", "Kerinci"],
  "Lampung": ["Bandar Lampung", "Metro", "Lampung Selatan", "Lampung Tengah", "Lampung Utara", "Lampung Timur", "Lampung Barat", "Tanggamus", "Pesawaran", "Pringsewu", "Way Kanan"],
  "Kalimantan Timur": ["Samarinda", "Balikpapan", "Bontang", "Kutai Kartanegara", "Kutai Barat", "Penajam Paser Utara", "Paser", "Mahakam Ulu"],
  "Kalimantan Barat": ["Pontianak", "Singkawang", "Sambas", "Bengkayang", "Landak", "Mempawah", "Sekadau", "Sanggau", "Kapuas Hulu", "Kayong Utara", "Kubu Raya"],
  "Kalimantan Selatan": ["Banjarmasin", "Banjarbaru", "Banjar", "Tapin", "Hulu Sungai Selatan", "Hulu Sungai Tengah", "Hulu Sungai Utara", "Balangan", "Tabalong", "Tanah Laut", "Kotabaru"],
  "Sulawesi Selatan": ["Makassar", "Parepare", "Palopo", "Gowa", "Takalar", "Jeneponto", "Bantaeng", "Bulukumba", "Selayar", "Bone", "Soppeng", "Wajo", "Sidrap", "Pinrang", "Enrekang", "Tana Toraja", "Luwu", "Luwu Utara", "Luwu Timur"],
  "Sulawesi Utara": ["Manado", "Bitung", "Tomohon", "Kotamobagu", "Minahasa", "Minahasa Selatan", "Minahasa Utara", "Bolaang Mongondow", "Kepulauan Sangihe", "Kepulauan Talaud"],
  "Bali": ["Denpasar", "Badung", "Gianyar", "Tabanan", "Bangli", "Karangasem", "Klungkung", "Buleleng", "Jembrana", "Singaraja", "Ubud"],
  "NTB": ["Mataram", "Bima", "Lombok Barat", "Lombok Tengah", "Lombok Timur", "Lombok Utara", "Sumbawa", "Sumbawa Barat", "Dompu"],
  "NTT": ["Kupang", "Ende", "Maumere", "Ruteng", "Bajawa", "Larantuka", "Waingapu", "Waikabubak", "Atambua", "Flores Timur", "Sumba Timur", "Sumba Barat", "Alor", "Lembata", "Rote Ndao", "Nagekeo", "Manggarai", "Manggarai Barat", "Sikka", "Timor Tengah Selatan", "Timor Tengah Utara", "Belu", "Malaka"],
};

export const SORT_OPTIONS = [
  { value: "newest", labelId: "Terbaru", labelEn: "Newest", labelZh: "最新" },
  { value: "price-asc", labelId: "Harga Termurah", labelEn: "Lowest Price", labelZh: "最低价" },
  { value: "price-desc", labelId: "Harga Tertinggi", labelEn: "Highest Price", labelZh: "最高价" },
  { value: "popular", labelId: "Paling Populer", labelEn: "Most Popular", labelZh: "最受欢迎" },
];

export function sortLabel(opt: { labelId: string; labelEn: string; labelZh?: string }, lang: string): string {
  if (lang === "en") return opt.labelEn;
  if (lang === "zh") return opt.labelZh || opt.labelEn;
  return opt.labelId;
}
