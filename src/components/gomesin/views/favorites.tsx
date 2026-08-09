"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { ListingCard, ListingCardSkeleton } from "../listing-card";
import { Button } from "@/components/ui/button";
import { Heart, ChevronRight, Trash2, LayoutGrid, List } from "lucide-react";
import { ListingRow } from "../listing-row";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { useLang, translations as i18nTranslations, formatT } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";

async function fetchFavs(ids: string[]) {
  const res = await fetch("/api/listings?ids=" + ids.join(",") + "&limit=48");
  if (!res.ok) throw new Error("fail");
  return res.json() as Promise<{ listings: any[] }>;
}

export function FavoritesView() {
  const favIds = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const goToListings = useStore((s) => s.goToListings);
  const goHome = useStore((s) => s.goHome);
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const { data, isLoading } = useQuery({
    queryKey: ["favorites", favIds],
    queryFn: () => fetchFavs(favIds),
    enabled: favIds.length > 0,
  });

  const listings = data?.listings ?? [];
  const [viewMode, setViewMode] = useState<"grid" | "line">("grid");

  // Auto-cleanup: remove favorite IDs that no longer exist (listing deleted)
  const cleanedRef = useRef<string>("");
  useEffect(() => {
    if (!data || favIds.length === 0) return;
    const returnedIds = new Set(listings.map((l) => l.id));
    const staleIds = favIds.filter((id) => !returnedIds.has(id));
    if (staleIds.length > 0) {
      const key = favIds.join(",");
      if (cleanedRef.current !== key) {
        cleanedRef.current = key;
        // remove stale favorites
        staleIds.forEach((id) => toggleFavorite(id));
        toast.info(formatT(tr("staleRemoved"), { count: staleIds.length }));
      }
    }
  }, [data, favIds, listings, toggleFavorite]);

  const clearAll = () => {
    if (favIds.length === 0) return;
    if (confirm(formatT(tr("clearAllConfirm"), { count: favIds.length }))) {
      favIds.forEach((id) => toggleFavorite(id));
      toast.success(tr("clearAllSuccess"));
    }
  };

  // effective count = listings actually returned (valid)
  const validCount = listings.length;
  const hasStale = favIds.length > validCount;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 animate-fade-up">
      <div className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={goHome} className="hover:text-primary">{tr("home2")}</button>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{tr("favCrumb")}</span>
      </div>

      <div className="mb-5 flex items-center gap-2">
        <Heart className="size-6 fill-rose-500 text-rose-500" />
        <h1 className="text-2xl font-bold">{tr("favTitle")}</h1>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-semibold text-muted-foreground">{validCount}</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button type="button" onClick={() => setViewMode("grid")}
              className={cn("grid size-8 place-items-center transition", viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Grid"><LayoutGrid className="size-4" /></button>
            <button type="button" onClick={() => setViewMode("line")}
              className={cn("grid size-8 place-items-center border-l border-border transition", viewMode === "line" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Line"><List className="size-4" /></button>
          </div>
          {validCount > 0 && (
            <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-destructive hover:bg-destructive/5" onClick={clearAll}>
              <Trash2 className="size-4" /> {tr("clearAll")}
            </Button>
          )}
        </div>
      </div>

      {favIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <Heart className="size-14 text-muted-foreground/50" />
          <h3 className="mt-3 text-lg font-semibold">{tr("noFavYet")}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {tr("noFavDesc")}
          </p>
          <Button className="mt-4" onClick={() => goToListings({})}>
            {tr("exploreAds")}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <Heart className="size-14 text-muted-foreground/50" />
          <h3 className="mt-3 text-lg font-semibold">{tr("favGoneTitle")}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {tr("favGoneDesc")}
          </p>
          <Button className="mt-4" onClick={() => goToListings({})}>
            {tr("exploreAds")}
          </Button>
        </div>
      ) : (
        <>
          {hasStale && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              {formatT(tr("staleGone"), { count: favIds.length - validCount })}
            </div>
          )}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                    <th className="p-2">Mesin</th>
                    <th className="p-2">Detail</th>
                    <th className="hidden p-2 text-right sm:table-cell">Harga</th>
                    <th className="p-2 text-right">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => <ListingRow key={l.id} listing={l} />)}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
