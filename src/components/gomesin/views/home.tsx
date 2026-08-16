"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { useLang, translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { useChatSocket } from "@/lib/use-chat-socket";
import { Button } from "@/components/ui/button";
import { ListingCard, ListingCardSkeleton } from "../listing-card";
import { ListingCardCarousel } from "../listing-card-carousel";
import { ListingRow, ListingRowSkeleton } from "../listing-row";
import { AdBanner } from "../ad-banner";
import { CategoryNav } from "../category-nav";
import {
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

type Listing = any;

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fail " + url);
  return res.json();
}

/**
 * useListingsRealtime — keeps the Beranda (homepage) in sync with admin
 * changes (delete / publish / violation toggle) in REALTIME.
 *
 * Two mechanisms work together:
 *
 * 1. Socket.io push (instant, when available): subscribes to BOTH
 *    "listings:invalidate" (admin's broadcastListings() helper) AND
 *    "listing:new" (server-side broadcast from /api/admin/listings PATCH
 *    when admin publishes a listing). When received, ALL ["listings", ...]
 *    queries are invalidated and refetched immediately. This requires the
 *    chat-service mini-service to be running.
 *
 * 2. Polling fallback (60-second interval): every homepage listing query has
 *    refetchInterval: 60000. This is a SAFETY NET for the rare case when
 *    socket.io is not connected (chat-service down, network blocks WebSocket).
 *    The socket.io push is the primary mechanism — polling only runs to catch
 *    missed events, NOT as a primary realtime channel.
 *
 * EGRESS OPTIMIZATION (Supabase quota): polling was 3s (~200K req/day for 100
 * visitors = 30 GB/month) → now 60s (~50 MB/month). 99% reduction.
 *
 * Works for anonymous visitors too — the socket connects without requiring
 * a user:join (it just won't join a user room, which is fine for global
 * listing broadcasts).
 */
function useListingsRealtime() {
  const qc = useQueryClient();
  const { subscribe, connected } = useChatSocket();
  const prevConnectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    // Socket.io push — instant invalidation when the admin broadcasts.
    const off1 = subscribe("listings:invalidate", () => {
      qc.invalidateQueries({ queryKey: ["listings"] });
    });
    // Also subscribe to "listing:new" — emitted server-side by the
    // /api/admin/listings PATCH route when admin publishes a listing.
    // This fires the moment a new ad goes live, so the homepage's "Iklan
    // Baru" section refreshes INSTANTLY (no 3s polling delay).
    const off2 = subscribe("listing:new", () => {
      qc.invalidateQueries({ queryKey: ["listings"] });
    });
    return () => {
      off1();
      off2();
    };
  }, [qc, subscribe]);

  // Refetch on socket RECONNECT — when the socket drops and reconnects,
  // we may have missed `listing:new` / `listings:invalidate` events during
  // the gap. Immediately invalidate all listing queries to catch up.
  // This makes the 60s polling interval safe — even if the socket was down
  // for a while, reconnect triggers an instant refetch.
  useEffect(() => {
    if (prevConnectedRef.current === false && connected === true) {
      qc.invalidateQueries({ queryKey: ["listings"] });
    }
    prevConnectedRef.current = connected;
  }, [connected, qc]);
}

// Query options for homepage listing queries.
// staleTime: 30s → cache results for 30s; avoid refetch on every mount/focus.
// refetchInterval: 60000 → poll every 60s as a SAFETY NET (socket.io is primary).
// refetchIntervalInBackground: false → only poll when the tab is visible.
// refetchOnWindowFocus: true → refetch when user returns to the tab.
//
// EGRESS NOTE: Previous setting was refetchInterval: 3000 (3s). With 7 listing
// queries on the homepage, that was 140 req/min per visitor = ~200K req/day
// for 100 active visitors. At ~5KB per response, that's 1 GB/day = 30 GB/month
// just for homepage polling. The new 60s interval reduces this to ~50 MB/month
// (99% reduction) — Supabase free tier 5GB quota now lasts 100x longer.
const LISTING_QUERY_OPTS = {
  staleTime: 30_000,
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

type ViewMode = "grid" | "table";

function ViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={() => setViewMode("grid")}
        aria-label="Tampilan grid"
        aria-pressed={viewMode === "grid"}
        className={cn(
          "grid size-8 place-items-center transition",
          viewMode === "grid"
            ? "bg-primary text-primary-foreground"
            : "text-foreground hover:bg-accent"
        )}
      >
        <LayoutGrid className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setViewMode("table")}
        aria-label="Tampilan tabel"
        aria-pressed={viewMode === "table"}
        className={cn(
          "grid size-8 place-items-center border-l border-border transition",
          viewMode === "table"
            ? "bg-primary text-primary-foreground"
            : "text-foreground hover:bg-accent"
        )}
      >
        <List className="size-4" />
      </button>
    </div>
  );
}

function ListingSection({
  listings,
  loading,
  viewMode,
  skeletonCount = 8,
}: {
  listings: Listing[];
  loading: boolean;
  viewMode: ViewMode;
  skeletonCount?: number;
}) {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  if (loading) {
    return viewMode === "grid" ? (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    ) : (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
              <th className="p-2">{tr("thMachine")}</th>
              <th className="p-2">{tr("thDetail")}</th>
              <th className="hidden p-2 text-right sm:table-cell">{tr("thPrice")}</th>
              <th className="p-2 text-right">{tr("thTime")}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <ListingRowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (listings.length === 0) return null;
  return viewMode === "grid" ? (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {listings.map((l) => (
        <ListingCard key={l.id} listing={l} />
      ))}
    </div>
  ) : (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
            <th className="p-2">{tr("thMachine")}</th>
            <th className="p-2">{tr("thDetail")}</th>
            <th className="hidden p-2 text-right sm:table-cell">{tr("thPrice")}</th>
            <th className="p-2 text-right">{tr("thTime")}</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <ListingRow key={l.id} listing={l} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Reusable horizontal carousel section with arrows + dots
function CarouselSection({
  listings,
  loading,
  cardWidth = "min(580px, 80vw)",
  compact = false,
}: {
  listings: Listing[];
  loading: boolean;
  cardWidth?: string;
  compact?: boolean;
}) {
  const goToDetail = useStore((s) => s.goToDetail);
  const carouselRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const handleScroll = () => {
    const c = carouselRef.current;
    if (!c || !listings.length) return;
    const cardW = c.children[0]?.getBoundingClientRect().width || 580;
    const gap = 12;
    const idx = Math.round(c.scrollLeft / (cardW + gap));
    setActiveIdx(Math.max(0, Math.min(idx, listings.length - 1)));
  };

  const scrollBy = (dir: "left" | "right") => {
    const c = carouselRef.current;
    if (!c) return;
    const cardW = c.children[0]?.getBoundingClientRect().width || 580;
    const gap = 12;
    c.scrollBy({ left: (cardW + gap) * (dir === "left" ? -1 : 1), behavior: "smooth" });
  };

  const scrollTo = (idx: number) => {
    const c = carouselRef.current;
    if (!c) return;
    const card = c.children[idx] as HTMLElement | undefined;
    if (card) c.scrollLeft = card.offsetLeft - c.offsetLeft;
  };

  // Autoplay disabled per user request — manual navigation only (arrows/dots)

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shrink-0" style={{ width: cardWidth }}>
            <ListingCardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  if (!listings.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
        Belum ada iklan saat ini.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden" onMouseEnter={() => { pausedRef.current = true; }} onMouseLeave={() => { pausedRef.current = false; }}>
      {/* left arrow */}
      <button
        type="button"
        onClick={() => scrollBy("left")}
        disabled={activeIdx === 0}
        aria-label="Previous"
        className="absolute -left-2 top-1/2 z-10 hidden -translate-y-1/2 grid size-10 place-items-center rounded-full bg-background text-foreground shadow-lg ring-1 ring-border transition hover:bg-accent disabled:opacity-40 sm:grid"
      >
        <ChevronLeft className="size-5" />
      </button>
      {/* right arrow */}
      <button
        type="button"
        onClick={() => scrollBy("right")}
        disabled={activeIdx >= listings.length - 1}
        aria-label="Next"
        className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 grid size-10 place-items-center rounded-full bg-background text-foreground shadow-lg ring-1 ring-border transition hover:bg-accent disabled:opacity-40 sm:grid"
      >
        <ChevronRight className="size-5" />
      </button>
      <div
        ref={carouselRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto pb-3 pe-[50vw] no-scrollbar"
      >
        {listings.map((l) => (
          <div
            key={l.id}
            data-listing-id={l.id}
            className="shrink-0"
            style={{ width: cardWidth }}
            onClick={() => {
              const st: any = (useStore as any).getState?.();
              if (st?.setFeaturedClickedId) st.setFeaturedClickedId(l.id);
              if (st?.setFeaturedRestorePending) st.setFeaturedRestorePending(true);
              goToDetail(l.slug);
            }}
          >
            {compact ? <ListingCardCarousel listing={l} /> : <ListingCard listing={l} />}
          </div>
        ))}
      </div>
      {/* dot indicators */}
      {listings.length > 1 && (
        <div className="mt-2 flex justify-center gap-2">
          {listings.map((l, i) => (
            <button
              key={l.id}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={"Go to ad " + (i + 1)}
              className={cn(
                "h-2.5 rounded-full transition-all",
                i === activeIdx ? "w-6 bg-primary" : "w-2.5 bg-muted-foreground/40 hover:bg-muted-foreground/70"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HomeView() {
  const goToListings = useStore((s) => s.goToListings);
  const goToDetail = useStore((s) => s.goToDetail);
  const goToPost = useStore((s) => s.goToPost);
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  // REALTIME — when admin deletes / publishes / updates a listing elsewhere,
  // the socket broadcasts "listings:invalidate" and we refetch all listing
  // queries immediately so this Beranda updates without a manual refresh.
  useListingsRealtime();

  // Produk Terpopuler = Titanium (spotlight)
  const { data: featured } = useQuery({
    queryKey: ["listings", "featured"],
    queryFn: () => fetchJson("/api/listings?packageType=spotlight&limit=8&sort=newest"),
    ...LISTING_QUERY_OPTS,
  });
  const { data: fresh } = useQuery({
    queryKey: ["listings", "fresh"],
    queryFn: () => fetchJson("/api/listings?sort=newest&limit=48"),
    ...LISTING_QUERY_OPTS,
  });
  // Produk Terpopuler = Titanium (spotlight)
  const { data: popular } = useQuery({
    queryKey: ["listings", "popular"],
    queryFn: () => fetchJson("/api/listings?packageType=spotlight&limit=12&sort=popular"),
    ...LISTING_QUERY_OPTS,
  });
  const { data: baru } = useQuery({
    queryKey: ["listings", "baru"],
    queryFn: () => fetchJson("/api/listings?condition=baru&sort=newest&limit=24"),
    ...LISTING_QUERY_OPTS,
  });
  // Produk Terdahsyat = Platinum (highlight)
  const { data: dahsyat } = useQuery({
    queryKey: ["listings", "dahsyat"],
    queryFn: () => fetchJson("/api/listings?packageType=highlight&limit=8&sort=newest"),
    ...LISTING_QUERY_OPTS,
  });
  const { data: jasa } = useQuery({
    queryKey: ["listings", "jasa"],
    queryFn: () => fetchJson("/api/listings?condition=jasa&sort=newest&limit=24"),
    ...LISTING_QUERY_OPTS,
  });
  const { data: searched } = useQuery({
    queryKey: ["listings", "searched"],
    queryFn: () => fetchJson("/api/listings/most-searched?limit=12"),
    ...LISTING_QUERY_OPTS,
  });

  const featuredListings: Listing[] = featured?.listings ?? [];
  const freshListings: Listing[] = fresh?.listings ?? [];
  const popularListings: Listing[] = popular?.listings ?? [];
  const baruListings: Listing[] = baru?.listings ?? [];
  const dahsyatListings: Listing[] = dahsyat?.listings ?? [];
  const jasaListings: Listing[] = jasa?.listings ?? [];
  const searchedListings: Listing[] = searched?.listings ?? [];

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  return (
    <div className="animate-fade-up">
      {/* HERO BANNER — mesin cetak image + CTA text (editable from admin Banner Promosi) */}
      <HeroBanner />

      {/* CATEGORY NAV — moved below banner per user request */}
      <div className="border-b border-border bg-background">
        <CategoryNav />
      </div>

      {/* MAIN CONTENT */}
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
          {/* FEATURED */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">{tr("featured")}</h2>
                <p className="text-sm text-muted-foreground">{tr("featuredDesc")}</p>
              </div>
              <Button variant="default" size="sm" className="gap-1.5 bg-orange-600 text-white hover:bg-orange-700" onClick={() => goToListings({ packageType: "spotlight", adType: "terpopuler" } as any)}>
                {tr("viewAll")} <ChevronRight className="size-4" />
              </Button>
            </div>
            <CarouselSection listings={featuredListings} loading={!featured} cardWidth="min(384px, 60vw)" />
          </section>

          {/* PRODUK TERDAHSYAT */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">{tr("dahsyatAds")}</h2>
                <p className="text-sm text-muted-foreground">{tr("dahsyatAdsDesc")}</p>
              </div>
              <Button variant="default" size="sm" className="gap-1.5 bg-orange-600 text-white hover:bg-orange-700" onClick={() => goToListings({ packageType: "highlight", adType: "terdahsyat" } as any)}>
                {tr("viewAll")} <ChevronRight className="size-4" />
              </Button>
            </div>
            <CarouselSection listings={dahsyatListings} loading={!dahsyat} cardWidth="min(384px, 60vw)" />
          </section>

          {/* AD BANNER 1 */}
          <AdBanner />

          {/* POPULAR — Paling Banyak Dilihat */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">{tr("popular")}</h2>
                <p className="text-sm text-muted-foreground">{tr("popularViewsDesc")}</p>
              </div>
              <div className="flex items-center gap-2">
                <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
              </div>
            </div>
            <ListingSection listings={popularListings} loading={!popular} viewMode={viewMode} skeletonCount={6} />
          </section>

          {/* SELL CTA */}
          <section>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-600 to-orange-700 p-6 text-primary-foreground sm:p-10">
              <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
              <div className="absolute -bottom-12 right-24 size-32 rounded-full bg-white/10" />
              <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-2xl font-extrabold sm:text-3xl">{tr("sellCtaTitle")}</h3>
                  <p className="mt-1 max-w-lg text-sm text-primary-foreground/90">
                    {tr("sellCtaDesc")}
                  </p>
                </div>
                <Button
                  onClick={goToPost}
                  size="lg"
                  className="shrink-0 rounded-full bg-white/15 backdrop-blur px-6 font-bold text-primary shadow hover:bg-white/25"
                >
                  + {tr("sellCtaBtn")}
                </Button>
              </div>
            </div>
          </section>

          {/* BANNER 3 — smaller banner above Brand New (editable from admin) */}
          <SmallBanner />

          {/* BRAND NEW */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">{tr("baruAds")}</h2>
                <p className="text-sm text-muted-foreground">{tr("baruAdsDesc")}</p>
              </div>
            </div>
            {baruListings.length > 0 ? (
              <ListingSection listings={baruListings} loading={!baru} viewMode={viewMode} />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
                Belum ada mesin baru saat ini.
              </div>
            )}
          </section>

          {/* JASA */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">{tr("jasaAds")}</h2>
                <p className="text-sm text-muted-foreground">{tr("jasaAdsDesc")}</p>
              </div>
            </div>
            {jasaListings.length > 0 ? (
              <ListingSection listings={jasaListings} loading={!jasa} viewMode={viewMode} />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
                Belum ada jasa saat ini.
              </div>
            )}
          </section>

          {/* FRESH (Terbaru) */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">{tr("fresh")}</h2>
                <p className="text-sm text-muted-foreground">{tr("freshDesc")}</p>
              </div>
            </div>
            <ListingSection listings={freshListings} loading={!fresh} viewMode={viewMode} />
          </section>
      </div>
    </div>
  );
}

// ============ HERO BANNER (top of home page, editable from admin) ============
type HeroConfig = {
  title: string;
  subtitle: string;
  desc: string;
  cta: string;
  imageUrl: string;
  active: boolean;
};

const DEFAULT_HERO: HeroConfig = {
  title: "Bingung Jual mesin baru/bekas dimana?",
  subtitle: "Pasang iklan di mesinKU saja!!!",
  desc: "Ada ribuan Mesin CETAK, Mesin CNC dan Mesin industri lainnya...",
  cta: "Pasang Iklan Sekarang",
  imageUrl: "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2a59f3618c60.jpg",
  active: true,
};

function HeroBanner() {
  const goToPost = useStore((s) => s.goToPost);

  // Fetch admin-configured hero banner (title/subtitle/desc/cta/imageUrl)
  const { data } = useQuery({
    queryKey: ["hero-banner"],
    queryFn: async () => {
      const res = await fetch("/api/admin/hero-banner");
      if (!res.ok) return { hero: null };
      return res.json();
    },
    staleTime: 60_000,
  });

  const hero: HeroConfig = { ...DEFAULT_HERO, ...(data?.hero || {}) };

  // If admin deactivated the hero banner, don't render it
  if (!hero.active) return null;

  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto max-w-7xl">
        <div className="relative h-52 w-full overflow-hidden sm:h-64 md:h-80">
          {hero.imageUrl ? (
            <img
              src={hero.imageUrl}
              alt="Mesin Cetak Industri"
              className="size-full object-cover"
            />
          ) : (
            <div className="size-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="mx-auto w-full max-w-7xl px-4">
              <div className="max-w-xl">
                {hero.title && (
                  <h1 className="text-xl font-extrabold leading-tight text-white sm:text-3xl md:text-4xl">
                    {hero.title}
                  </h1>
                )}
                {hero.subtitle && (
                  <p className="mt-2 text-base font-bold text-orange-400 sm:text-xl md:text-2xl">
                    {hero.subtitle}
                  </p>
                )}
                {hero.desc && (
                  <p className="mt-1 text-xs text-white/90 sm:text-sm md:text-base">
                    {hero.desc}
                  </p>
                )}
                {hero.cta && (
                  <Button
                    onClick={goToPost}
                    size="lg"
                    className="mt-4 rounded-full bg-orange-600 px-6 font-bold text-white shadow-lg hover:bg-orange-700"
                  >
                    {hero.cta}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============ SMALL BANNER (above Brand New section, editable from admin) ============
type SmallBannerConfig = {
  title: string;
  desc: string;
  cta: string;
  imageUrl: string;
  link: string;
  gradient: string;
  active: boolean;
};

const DEFAULT_SMALL: SmallBannerConfig = {
  title: "",
  desc: "",
  cta: "Lihat Semua",
  imageUrl: "",
  link: "listings",
  gradient: "from-rose-600 via-pink-600 to-fuchsia-600",
  active: false,
};

function SmallBanner() {
  const goToPost = useStore((s) => s.goToPost);
  const goToListings = useStore((s) => s.goToListings);

  const { data } = useQuery({
    queryKey: ["admin-banner-3"],
    queryFn: async () => {
      const res = await fetch("/api/admin/banner-3");
      if (!res.ok) return { banner: null };
      return res.json();
    },
    staleTime: 60_000,
  });

  const b: SmallBannerConfig = { ...DEFAULT_SMALL, ...(data?.banner || {}) };

  if (!b.active || !b.title?.trim()) return null;

  const handleClick = () => {
    if (b.link === "listings") goToListings({});
    else goToPost();
  };

  const hasImage = !!b.imageUrl;

  return (
    <div
      className={cn(
        "relative flex items-center overflow-hidden rounded-xl bg-gradient-to-r p-4 text-white shadow-md sm:p-5",
        b.gradient
      )}
    >
      {hasImage ? (
        <>
          <img
            src={b.imageUrl}
            alt={b.title}
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        </>
      ) : (
        <>
          <div className="absolute -right-8 -top-8 size-28 rounded-full bg-white/10" />
          <div className="absolute -bottom-10 right-16 size-24 rounded-full bg-white/10" />
        </>
      )}

      <div className="relative flex w-full items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold leading-tight drop-shadow-sm sm:text-base md:text-lg">
            {b.title}
          </h3>
          {b.desc && (
            <p className="mt-0.5 line-clamp-1 text-xs text-white/90 sm:text-sm">
              {b.desc}
            </p>
          )}
        </div>
        {b.cta && (
          <button
            onClick={handleClick}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-black shadow transition hover:bg-white/90 sm:text-sm"
          >
            {b.cta}
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
