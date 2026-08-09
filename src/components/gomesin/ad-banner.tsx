"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Crown, Tag, Zap, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

type Banner = {
  id: number;
  // visual
  gradient: string;
  icon: typeof Crown;
  badge: string;
  badgeId: string;
  badgeEn: string;
  badgeZh: string;
  titleId: string;
  titleEn: string;
  titleZh: string;
  descId: string;
  descEn: string;
  descZh: string;
  ctaId: string;
  ctaEn: string;
  ctaZh: string;
  // action
  action: "post" | "premium" | "listings" | "category";
  categorySlug?: string;
};

const BANNERS: Banner[] = [
  {
    id: 1,
    gradient: "from-amber-500 via-orange-500 to-rose-500",
    icon: Crown,
    badge: "PREMIUM",
    badgeId: "Promo Spesial",
    badgeEn: "Special Promo",
    badgeZh: "特惠促销",
    titleId: "Pasang Iklan Premium, Tayang 30 Hari",
    titleEn: "Post Premium Ad, 30 Days Live",
    titleZh: "发布精选广告，30天在线",
    descId: "Badge Featured, 10 foto, prioritas tampil di beranda. Hanya Rp 50.000.",
    descEn: "Featured badge, 10 photos, priority display on home. Only Rp 50,000.",
    descZh: "精选徽章，10张照片，首页优先展示。仅需 Rp 50.000。",
    ctaId: "Pasang Iklan Premium",
    ctaEn: "Post Premium Ad",
    ctaZh: "发布精选广告",
    action: "post",
  },
  {
    id: 2,
    gradient: "from-orange-600 via-orange-600 to-cyan-600",
    icon: Zap,
    badge: "PREMIUM",
    badgeId: "Mulai Jualan",
    badgeEn: "Start Selling",
    badgeZh: "开始销售",
    titleId: "Punya mesin? Ubah jadi cuan.",
    titleEn: "Have a machine? Turn it into profit.",
    titleZh: "有闲置机械？变现吧。",
    descId: "Pasang iklan mulai Rp 30.000 dan jangkau ribuan pembeli industri se-Indonesia.",
    descEn: "Post ads from Rp 30,000 and reach thousands of industrial buyers across Indonesia.",
    descZh: "仅 Rp 30,000 起发布广告，触达印尼数千工业买家。",
    ctaId: "MULAI PASANG IKLAN",
    ctaEn: "START POSTING",
    ctaZh: "发布广告",
    action: "post",
  },
  {
    id: 3,
    gradient: "from-violet-600 via-purple-600 to-fuchsia-600",
    icon: Tag,
    badge: "DISKON",
    badgeId: "Pencarian Mesin CNC",
    badgeEn: "CNC Machine Search",
    badgeZh: "CNC机械搜索",
    titleId: "Temukan Mesin CNC & Laser Terbaik",
    titleEn: "Find the Best CNC & Laser Machines",
    titleZh: "寻找最佳CNC与激光机械",
    descId: "Ratusan pilihan mesin CNC router, laser cutting, dan bubut dari seller terverifikasi. Harga mulai Rp 15 juta.",
    descEn: "Hundreds of CNC router, laser cutting, and lathe machines from verified sellers. Prices from Rp 15 million.",
    descZh: "数百台CNC路由器、激光切割和车床机械，来自认证卖家。价格从 Rp 1500万起。",
    ctaId: "Lihat Mesin CNC",
    ctaEn: "View CNC Machines",
    ctaZh: "查看CNC机械",
    action: "category",
    categorySlug: "mesin-cnc-laser",
  },
  {
    id: 4,
    gradient: "from-blue-600 via-indigo-600 to-violet-600",
    icon: Sparkles,
    badge: "UNGULAN",
    badgeId: "Alat Berat",
    badgeEn: "Heavy Equipment",
    badgeZh: "重型设备",
    titleId: "Excavator, Forklift & Alat Berat Bekas",
    titleEn: "Excavator, Forklift & Used Heavy Equipment",
    titleZh: "挖掘机、叉车及二手重型设备",
    descId: "Pilih dari koleksi alat berat bekas berkualitas. Survei langsung, harga bersaing, dokumen lengkap.",
    descEn: "Choose from quality used heavy equipment. Direct inspection, competitive prices, complete documents.",
    descZh: "从优质二手重型设备中选择。实地考察，有竞争力的价格，证件齐全。",
    ctaId: "Lihat Alat Berat",
    ctaEn: "View Heavy Equipment",
    ctaZh: "查看重型设备",
    action: "category",
    categorySlug: "alat-berat",
  },
];

export function AdBanner() {
  const { lang, t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const l = mounted ? lang : "id";

  const goToPost = useStore((s) => s.goToPost);
  const goToListings = useStore((s) => s.goToListings);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setActive((p) => (p + 1) % BANNERS.length), []);
  const prev = useCallback(() => setActive((p) => (p - 1 + BANNERS.length) % BANNERS.length), []);

  // auto-rotate every 5s, pause on hover
  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 5000);
    return () => clearInterval(id);
  }, [next, paused]);

  const handleCta = (banner: Banner) => {
    if (banner.action === "post") goToPost();
    else if (banner.action === "category" && banner.categorySlug) {
      goToListings({ category: banner.categorySlug });
    } else {
      goToListings({});
    }
  };

  const current = BANNERS[active];

  return (
    <section
      className="mx-auto max-w-7xl px-4 py-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-gradient-to-r p-6 text-white shadow-xl transition-all duration-500 sm:p-8",
          current.gradient
        )}
      >
        {/* decorative circles */}
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 right-32 size-40 rounded-full bg-white/10" />
        <div className="absolute left-1/3 -top-10 size-24 rounded-full bg-white/5" />

        {/* content */}
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            {/* badge */}
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
                <current.icon className="size-3.5" />
                {current.badge}
              </span>
              <span className="rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                {l === "id" ? current.badgeId : l === "zh" ? current.badgeZh : current.badgeEn}
              </span>
            </div>

            {/* title */}
            <h3 className="text-xl font-extrabold leading-tight drop-shadow-sm sm:text-2xl md:text-3xl">
              {l === "id" ? current.titleId : l === "zh" ? current.titleZh : current.titleEn}
            </h3>

            {/* description */}
            <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-base">
              {l === "id" ? current.descId : l === "zh" ? current.descZh : current.descEn}
            </p>

            {/* CTA button */}
            <button
              onClick={() => handleCta(current)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black shadow-lg transition hover:bg-white/90 hover:gap-3"
            >
              {l === "id" ? current.ctaId : l === "zh" ? current.ctaZh : current.ctaEn}
              <ArrowRight className="size-4 text-black" />
            </button>
          </div>

          {/* big icon (desktop) */}
          <div className="hidden shrink-0 sm:block">
            <div className="grid size-24 place-items-center rounded-2xl bg-white/15 backdrop-blur md:size-28">
              <current.icon className="size-12 md:size-14" />
            </div>
          </div>
        </div>

        {/* navigation arrows (desktop) */}
        <button
          onClick={prev}
          aria-label="Previous banner"
          className="absolute left-2 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30 md:grid"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          onClick={next}
          aria-label="Next banner"
          className="absolute right-2 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30 md:grid"
        >
          <ChevronRight className="size-5" />
        </button>

        {/* dots indicator */}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {BANNERS.map((b, i) => (
            <button
              key={b.id}
              onClick={() => setActive(i)}
              aria-label={`Go to banner ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === active ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/70"
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
