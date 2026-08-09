"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { useLang, translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
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

  // Produk Terpopuler = Titanium (spotlight)
  const { data: featured } = useQuery({
    queryKey: ["listings", "featured"],
    queryFn: () => fetchJson("/api/listings?packageType=spotlight&limit=8&sort=newest"),
    staleTime: 0,
  });
  const { data: fresh } = useQuery({
    queryKey: ["listings", "fresh"],
    queryFn: () => fetchJson("/api/listings?sort=newest&limit=48"),
    staleTime: 0,
  });
  // Produk Terpopuler = Titanium (spotlight)
  const { data: popular } = useQuery({
    queryKey: ["listings", "popular"],
    queryFn: () => fetchJson("/api/listings?packageType=spotlight&limit=12&sort=popular"),
    staleTime: 0,
  });
  const { data: baru } = useQuery({
    queryKey: ["listings", "baru"],
    queryFn: () => fetchJson("/api/listings?condition=baru&sort=newest&limit=24"),
    staleTime: 0,
  });
  // Produk Terdahsyat = Platinum (highlight)
  const { data: dahsyat } = useQuery({
    queryKey: ["listings", "dahsyat"],
    queryFn: () => fetchJson("/api/listings?packageType=highlight&limit=8&sort=newest"),
    staleTime: 0,
  });
  const { data: jasa } = useQuery({
    queryKey: ["listings", "jasa"],
    queryFn: () => fetchJson("/api/listings?condition=jasa&sort=newest&limit=24"),
    staleTime: 0,
  });
  const { data: searched } = useQuery({
    queryKey: ["listings", "searched"],
    queryFn: () => fetchJson("/api/listings/most-searched?limit=12"),
    staleTime: 0,
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
      {/* BANNER — mesin cetak image + CTA text */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-7xl">
          <div className="relative h-52 w-full overflow-hidden sm:h-64 md:h-80">
            <img
              src="https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2a59f3618c60.jpg"
              alt="Mesin Cetak Industri"
              className="size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
            <div className="absolute inset-0 flex items-center">
              <div className="mx-auto w-full max-w-7xl px-4">
                <div className="max-w-xl">
                  <h1 className="text-xl font-extrabold leading-tight text-white sm:text-3xl md:text-4xl">
                    Bingung Jual mesin baru/bekas dimana?
                  </h1>
                  <p className="mt-2 text-base font-bold text-orange-400 sm:text-xl md:text-2xl">
                    Pasang iklan di gomesin saja!!!
                  </p>
                  <p className="mt-1 text-xs text-white/90 sm:text-sm md:text-base">
                    Ada ribuan Mesin CETAK, Mesin CNC dan Mesin industri lainnya...
                  </p>
                  <Button
                    onClick={goToPost}
                    size="lg"
                    className="mt-4 rounded-full bg-orange-600 px-6 font-bold text-white shadow-lg hover:bg-orange-700"
                  >
                    Pasang Iklan Sekarang
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
