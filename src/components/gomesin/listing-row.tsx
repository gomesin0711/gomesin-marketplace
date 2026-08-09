"use client";

import Image from "next/image";
import { Heart, MapPin, BadgeCheck, Eye, ImageIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatRupiah, formatRupiahFull, timeAgo } from "@/lib/types";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLang, translations as i18nTranslations, categoryName, listingTitle } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { proxyUrl } from "@/lib/image";

export function ListingRow({
  listing,
  extraCells,
  onRowClick,
}: {
  listing: Listing;
  extraCells?: React.ReactNode;
  onRowClick?: (listing: Listing) => void;
}) {
  const goToDetail = useStore((s) => s.goToDetail);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFav = useStore((s) => s.favorites.includes(listing.id));
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  // Package-based promotion styling
  const pkg = listing.packageType || "";
  const isSpotlight = pkg === "spotlight";
  const isHighlight = pkg === "highlight";
  const isSundul = pkg === "sundul";
  const isColek = pkg === "colek";

  const fav = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(listing.id);
    toast.success(isFav ? tr("removedFromFav") : tr("addedToFav"), {
      duration: 1400,
    });
  };

  const img = listing.images?.[0];

  return (
    <tr
      data-listing-id={listing.id}
      onClick={() => {
        const st: any = (useStore as any).getState?.();
        if (st?.setFeaturedClickedId) st.setFeaturedClickedId(listing.id);
        if (st?.setFeaturedRestorePending) st.setFeaturedRestorePending(true);
        onRowClick ? onRowClick(listing) : goToDetail(listing.slug);
      }}
      className={cn(
        "group cursor-pointer border-b border-border transition hover:bg-accent/50",
        isSpotlight && "bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 border-amber-200 dark:border-amber-800",
        isHighlight && "bg-orange-50 dark:bg-orange-950 hover:bg-orange-100 dark:hover:bg-orange-900 border-orange-200 dark:border-orange-800",
        isSundul && "bg-purple-100 dark:bg-purple-950 hover:bg-purple-200 dark:hover:bg-purple-900 border-purple-200 dark:border-purple-800",
        isColek && "bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 border-blue-200 dark:border-blue-800"
      )}
    >
      {/* image */}
      <td className="w-24 p-2 sm:w-32">
        <div className={cn(
          "relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted",
          isSpotlight && "ring-2 ring-amber-400",
          isHighlight && "ring-2 ring-orange-400",
          isSundul && "ring-2 ring-purple-400",
          isColek && "ring-2 ring-blue-400"
        )}>
          {img ? (
            <Image
              src={proxyUrl(img)}
              alt={listingTitle(listing, mounted ? lang : "id")}
              fill
              sizes="120px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-6" />
            </div>
          )}
          <span className={cn(
            "absolute left-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase text-white",
            isSpotlight ? "bg-amber-500" : isHighlight ? "bg-orange-500" : isSundul ? "bg-purple-500" : isColek ? "bg-blue-500" : "bg-primary"
          )}>
            {isSpotlight ? tr("spotlightBadge") : isHighlight ? tr("highlightBadge") : isSundul ? tr("sundulBadge") : isColek ? "Gold" : (listing.condition === "baru" ? tr("baru") : tr("bekas"))}
          </span>
        </div>
      </td>

      {/* title + meta */}
      <td className="p-2 align-top">
        <p className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">
          {listingTitle(listing, mounted ? lang : "id")}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {listing.brand ? `${listing.brand} · ` : ""}
          {categoryName(listing.category.name, mounted ? lang : "id")}
          {listing.yearProduced ? ` · ${listing.yearProduced}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="size-3" /> {listing.city}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Eye className="size-3" /> {listing.views.toLocaleString("id-ID")}
          </span>
          {/* verified badge removed per user request */}
        </div>
      </td>

      {/* price */}
      <td className="hidden p-2 align-top text-right sm:table-cell">
        <div className="font-bold text-primary">{formatRupiahFull(listing.price)}</div>
        {listing.priceType === "negotiable" && (
          <span className="text-[10px] font-medium text-muted-foreground">{tr("nego")}</span>
        )}
      </td>

      {/* time + favorite */}
      <td className="p-2 align-top text-right">
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] text-muted-foreground">{timeAgo(listing.createdAt, mounted ? lang : "id")}</span>
          <button
            onClick={fav}
            aria-label={isFav ? tr("removeFav") : tr("addFav")}
            className="grid size-7 place-items-center rounded-full border border-border bg-background text-foreground transition hover:bg-accent"
          >
            <Heart className={cn("size-3.5", isFav && "fill-rose-500 text-rose-500")} />
          </button>
        </div>
      </td>
      {extraCells}
    </tr>
  );
}

export function ListingRowSkeleton() {
  return (
    <tr className="border-b border-border">
      <td className="w-24 p-2 sm:w-32">
        <div className="aspect-[4/3] w-full animate-pulse rounded-md bg-muted" />
      </td>
      <td className="p-2">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="mt-1.5 h-2.5 w-2/3 animate-pulse rounded bg-muted" />
      </td>
      <td className="hidden p-2 text-right sm:table-cell">
        <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" />
      </td>
      <td className="p-2 text-right">
        <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
      </td>
    </tr>
  );
}

export { formatRupiah };
