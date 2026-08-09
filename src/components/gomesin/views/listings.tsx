"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore, type ListingFilters } from "@/lib/store";
import { ListingCard, ListingCardSkeleton } from "../listing-card";
import { ListingRow, ListingRowSkeleton } from "../listing-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROVINCES, SORT_OPTIONS, sortLabel } from "@/lib/types";
import { useLang, translations as i18nTranslations, categoryName } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import { formatRupiahFull, timeAgo } from "@/lib/types";
import { SlidersHorizontal, X, Search, MapPin, Frown, LayoutGrid, List, Eye, BadgeCheck, ImageIcon } from "lucide-react";
import { useMemo, useState, useEffect } from "react";


async function fetchListings(filters: ListingFilters, page: number) {
  // Paling Banyak Dicari uses different endpoint
  if ((filters as any).mostSearched) {
    const p = new URLSearchParams();
    p.set("limit", "48");
    p.set("page", String(page));
    const res = await fetch("/api/listings/most-searched?" + p.toString());
    if (!res.ok) throw new Error("fail");
    const d = await res.json();
    return { listings: d.listings ?? [], total: d.listings?.length ?? 0, page: 1, totalPages: 1 };
  }
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.category) p.set("category", filters.category);
  if (filters.condition) p.set("condition", filters.condition);
  if (filters.minPrice) p.set("minPrice", filters.minPrice);
  if (filters.maxPrice) p.set("maxPrice", filters.maxPrice);
  if (filters.province) p.set("province", filters.province);
  if ((filters as any).packageType) p.set("packageType", (filters as any).packageType);
  if ((filters as any).seller) p.set("seller", (filters as any).seller);
  if (filters.sort) p.set("sort", filters.sort);
  p.set("page", String(page));
  p.set("limit", "48");
  const res = await fetch("/api/listings?" + p.toString());
  if (!res.ok) throw new Error("fail");
  return res.json() as Promise<{
    listings: any[];
    total: number;
    page: number;
    totalPages: number;
  }>;
}

async function fetchCategories() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("fail");
  return (await res.json()).categories as Array<{
    id: string;
    name: string;
    slug: string;
    icon: string;
  }>;
}

function FilterPanel({
  filters,
  setFilters,
  cats,
}: {
  filters: ListingFilters;
  setFilters: (f: ListingFilters) => void;
  cats: any[];
}) {
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const priceVal: number[] = useMemo(() => {
    const lo = filters.minPrice ? parseInt(filters.minPrice) : 0;
    const hi = filters.maxPrice ? parseInt(filters.maxPrice) : 2000000000;
    return [lo, hi];
  }, [filters.minPrice, filters.maxPrice]);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-sm font-bold">{tr("adTypeLabel") || "Jenis Iklan"}</h4>
        <RadioGroup
          value={(filters as any).adType || "all"}
          onValueChange={(v) => {
            // Map "Jenis Iklan" selection to API params (packageType / condition / sort)
            const base: any = { ...filters, packageType: undefined, condition: undefined, sort: undefined, adType: v };
            if (v === "all") {
              // no filter
            } else if (v === "terpopuler") {
              base.packageType = "spotlight";
            } else if (v === "terdahsyat") {
              base.packageType = "highlight";
            } else if (v === "dilihat") {
              base.sort = "popular";
            } else if (v === "brandnew") {
              base.condition = "baru";
            } else if (v === "jasa") {
              base.condition = "jasa";
            } else if (v === "sewa") {
              base.condition = "sewa";
            } else if (v === "dicari") {
              base.sort = "popular"; // proxy: most-searched ranked by views+chat
            } else if (v === "terbaru") {
              base.sort = "newest";
            }
            setFilters(base);
          }}
          className="gap-2"
        >
          {[
            ["terpopuler", tr("featured")],
            ["terdahsyat", tr("dahsyatAds")],
            ["dilihat", tr("popular")],
            ["brandnew", tr("baruAds")],
            ["jasa", tr("jasaAds")],
            ["sewa", "Sewa"],
            ["dicari", tr("searchedAds")],
            ["terbaru", tr("fresh")],
          ].map(([v, label]) => (
            <div key={v} className="flex items-center gap-2">
              <RadioGroupItem value={v} id={"adtype-" + v} />
              <Label htmlFor={"adtype-" + v} className="cursor-pointer text-sm font-normal">
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-bold">{tr("priceRange")}</h4>
        <div className="px-1">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={filters.minPrice ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, minPrice: e.target.value || undefined })
              }
              className="h-8 text-xs"
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="number"
              placeholder="Max"
              value={filters.maxPrice ?? ""}
              onChange={(e) =>
                setFilters({ ...filters, maxPrice: e.target.value || undefined })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-bold">{tr("province")}</h4>
        <Select
          value={filters.province || "all"}
          onValueChange={(v) =>
            setFilters({ ...filters, province: v === "all" ? undefined : v })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={tr("allProvinces")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("allProvinces")}</SelectItem>
            {PROVINCES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => setFilters({})}
      >
        {tr("resetFilterBtn")}
      </Button>
    </div>
  );
}

export function ListingsView() {
  const filters = useStore((s) => s.filters);
  const setFiltersStore = useStore((s) => s.setFilters);
  const goToListings = useStore((s) => s.goToListings);
  const goToDetail = useStore((s) => s.goToDetail);
  const [page, setPage] = useState(1);
  const [prevFilters, setPrevFilters] = useState(filters);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  // Reset to page 1 whenever filters change (render-time adjustment, no effect)
  if (filters !== prevFilters) {
    setPrevFilters(filters);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["listings", filters, page],
    queryFn: () => fetchListings(filters, page),
    placeholderData: (prev) => prev,
  });

  // Restore scroll to the clicked listing card when returning from detail page
  useEffect(() => {
    const t = setTimeout(() => {
      const s = useStore.getState();
      if (!s.featuredRestorePending) return;
      if (s.featuredClickedId) {
        const card = document.querySelector(
          `[data-listing-id="${s.featuredClickedId}"]`
        ) as HTMLElement | null;
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.classList.add("ring-4", "ring-primary", "ring-offset-2", "transition-all");
          setTimeout(() => {
            card.classList.remove("ring-4", "ring-primary", "ring-offset-2");
          }, 2000);
        }
      }
      s.setFeaturedRestorePending(false);
    }, 300);
    return () => clearTimeout(t);
  }, [data]);

  const { data: catData } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 0,
  });
  const cats = catData ?? [];

  const setFilters = (f: ListingFilters) => goToListings(f);

  const activeFilterCount = [
    filters.category,
    (filters as any).adType && (filters as any).adType !== "all",
    filters.minPrice,
    filters.maxPrice,
    filters.province,
  ].filter(Boolean).length;

  const listings = data?.listings ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 animate-fade-up">
      {/* breadcrumb / title */}
      <div className="mb-4">
        <h1 className="text-xl font-bold sm:text-2xl">
          {(filters as any).adType === "terpopuler"
            ? tr("featured")
            : (filters as any).adType === "terdahsyat"
            ? tr("dahsyatAds")
            : (filters as any).adType === "dicari"
            ? tr("searchedAds")
            : filters.q
            ? `${tr("searchResult")} "${filters.q}"`
            : filters.category
            ? cats.find((c) => c.slug === filters.category)?.name || tr("allAds")
            : tr("allAds")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {total} {tr("adsFound")}
          {filters.province && (
            <span className="ml-1 inline-flex items-center gap-1">
              {tr("inLocation")} <MapPin className="size-3" /> {filters.province}
            </span>
          )}
        </p>
      </div>

      <div className="flex gap-6">
        {/* sidebar desktop — always visible */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-44 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <SlidersHorizontal className="size-4 text-primary" />
              <h3 className="text-sm font-bold">{tr("filter")}</h3>
              {activeFilterCount > 0 && (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4 gomesin-scroll">
              <FilterPanel filters={filters} setFilters={setFilters} cats={cats} />
            </div>
          </div>
        </aside>

        {/* main */}
        <div className="min-w-0 flex-1">
          {/* toolbar */}
          <div className="mb-4 space-y-3">
            {/* search full width */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Cari nama penjual..."
                value={(filters as any).seller || ""}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  setFilters({ ...filters, seller: v } as any);
                }}
                className="h-9 rounded-full border-border bg-card pl-9 pr-3 text-sm"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              {/* view toggle */}
              <div className="flex overflow-hidden rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Tampilan grid"
                  aria-pressed={viewMode === "grid"}
                  className={cn(
                    "grid size-9 place-items-center transition",
                    viewMode === "grid"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground hover:bg-accent"
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
                    "grid size-9 place-items-center border-l border-border transition",
                    viewMode === "table"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground hover:bg-accent"
                  )}
                >
                  <List className="size-4" />
                </button>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:inline">{tr("sortBy")}</span>
              <Select
                value={filters.sort || "newest"}
                onValueChange={(v) => setFilters({ ...filters, sort: v })}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {sortLabel(o, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* active filter chips */}
          {activeFilterCount > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {filters.category && (
                <Chip
                  label={cats.find((c) => c.slug === filters.category)?.name || filters.category}
                  onClear={() => setFilters({ ...filters, category: undefined })}
                />
              )}
              {(filters as any).adType && (filters as any).adType !== "all" && (
                <Chip
                  label={
                    (filters as any).adType === "terpopuler" ? tr("featured") :
                    (filters as any).adType === "terdahsyat" ? tr("dahsyatAds") :
                    (filters as any).adType === "dilihat" ? tr("popular") :
                    (filters as any).adType === "brandnew" ? tr("baruAds") :
                    (filters as any).adType === "jasa" ? tr("jasaAds") :
                    (filters as any).adType === "sewa" ? "Sewa" :
                    (filters as any).adType === "dicari" ? tr("searchedAds") :
                    (filters as any).adType === "terbaru" ? tr("fresh") :
                    (filters as any).adType
                  }
                  onClear={() => setFilters({ ...filters, adType: undefined, packageType: undefined, condition: undefined, sort: undefined } as any)}
                />
              )}
              {(filters.minPrice || filters.maxPrice) && (
                <Chip
                  label={`${tr("thPrice")} ${filters.minPrice ? filters.minPrice : "0"} - ${filters.maxPrice ? filters.maxPrice : "∞"}`}
                  onClear={() => setFilters({ ...filters, minPrice: undefined, maxPrice: undefined })}
                />
              )}
              {filters.province && (
                <Chip label={filters.province} onClear={() => setFilters({ ...filters, province: undefined })} />
              )}
            </div>
          )}

          {/* results */}
          {isLoading || (isFetching && !data) ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                      <th className="p-2">{tr("thMachine")}</th>
                      <th className="p-2">{tr("thDetail")}</th>
                      <th className="hidden p-2 text-right sm:table-cell">{tr("thPrice")}</th>
                      <th className="p-2 text-right">{tr("thTime")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <ListingRowSkeleton key={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
              <Frown className="size-12 text-muted-foreground" />
              <h3 className="mt-3 text-lg font-semibold">{tr("noResults")}</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {tr("noResultsDesc")}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setFilters({})}>
                <X className="size-4" /> {tr("resetFilter")}
              </Button>
            </div>
          ) : viewMode === "grid" ? (
            <div className={cn(
              "grid gap-3",
              (filters as any).adType === "terpopuler" || (filters as any).adType === "terdahsyat" || (filters as any).adType === "dicari"
                ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            )}>
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
          )}

        </div>
      </div>
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
      {label}
      <button onClick={onClear} className="ml-0.5 rounded-full hover:bg-primary/20">
        <X className="size-3" />
      </button>
    </span>
  );
}
