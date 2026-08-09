"use client";

import { Heart, MapPin, ImageIcon, Eye, Sparkles, Zap, User } from "lucide-react";
import Image from "next/image";
import { useStore } from "@/lib/store";
import { formatRupiah, formatRupiahFull, timeAgo } from "@/lib/types";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLang, translations as i18nTranslations, categoryName, listingTitle } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { proxyUrl } from "@/lib/image";

export function ListingCard({ listing, spotlight = false }: { listing: Listing; spotlight?: boolean }) {
  const goToDetail = useStore((s) => s.goToDetail);
  const goToSeller = useStore((s) => s.goToSeller);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFav = useStore((s) => s.favorites.includes(listing.id));
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  // Package-based promotion badges
  const pkg = listing.packageType || "";
  const isSpotlight = pkg === "spotlight";
  const isHighlight = pkg === "highlight";
  const isSundul = pkg === "sundul";
  const isColek = pkg === "colek";

  const images = listing.images || [];

  const fav = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(listing.id);
    toast.success(isFav ? tr("removedFromFav") : tr("addedToFav"), {
      duration: 1400,
    });
  };

  const openSeller = (e: React.MouseEvent) => {
    e.stopPropagation();
    const uid = (listing as any).user?.id;
    if (uid) goToSeller(uid);
  };

  const img = images[0] ? proxyUrl(images[0]) : undefined;

  // Condition badge helper
  const conditionLabel = listing.condition === "baru" ? tr("baru") : listing.condition === "jasa" ? "Jasa" : listing.condition === "sewa" ? "Sewa" : tr("bekas");
  const conditionColor = listing.condition === "baru" ? "bg-orange-600" : listing.condition === "jasa" ? "bg-blue-600" : listing.condition === "sewa" ? "bg-amber-600" : "bg-gray-600";

  return (
    <article
      data-listing-id={listing.id}
      onClick={() => {
        // Save clicked listing id so home can scroll back to this card on return
        const st: any = (useStore as any).getState?.();
        if (st?.setFeaturedClickedId) st.setFeaturedClickedId(listing.id);
        if (st?.setFeaturedRestorePending) st.setFeaturedRestorePending(true);
        goToDetail(listing.slug);
      }}
      className={cn(
        "card-hover group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border transition",
        isSpotlight
          ? "border-amber-400 bg-card ring-2 ring-amber-400/30 shadow-lg"
          : isHighlight
          ? "border-orange-400 bg-card ring-1 ring-orange-400/30 shadow-md"
          : isSundul
          ? "border-purple-500 bg-purple-100 dark:bg-purple-950 ring-2 ring-purple-400/40 shadow-md"
          : isColek
          ? "border-blue-400 bg-card ring-1 ring-blue-400/30 shadow-sm"
          : "border-border bg-card"
      )}
    >
      {/* Image */}

      {isSpotlight ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {img ? (
            <Image
              src={img}
              alt={listingTitle(listing, mounted ? lang : "id")}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 ease-out"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-10" />
            </div>
          )}
          <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
            <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">{tr("spotlightBadge")}</span>
            <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow", conditionColor)}>{conditionLabel}</span>
          </div>
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            <Eye className="size-3" />
            {listing.views?.toLocaleString("id-ID") || 0}
          </span>
          <button
            onClick={fav}
            aria-label={isFav ? tr("removeFav") : tr("addFav")}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-foreground shadow backdrop-blur transition hover:bg-white dark:bg-black/70 dark:hover:bg-black/80"
          >
            <Heart className={cn("size-4", isFav && "fill-rose-500 text-rose-500")} />
          </button>
        </div>
      ) : isHighlight ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {img ? (
            <Image
              src={img}
              alt={listingTitle(listing, mounted ? lang : "id")}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 ease-out"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-10" />
            </div>
          )}
          <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
            <span className="rounded-md bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">{tr("highlightBadge")}</span>
            <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow", conditionColor)}>{conditionLabel}</span>
          </div>
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            <Eye className="size-3" />
            {listing.views?.toLocaleString("id-ID") || 0}
          </span>
          <button
            onClick={fav}
            aria-label={isFav ? tr("removeFav") : tr("addFav")}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-foreground shadow backdrop-blur transition hover:bg-white dark:bg-black/70 dark:hover:bg-black/80"
          >
            <Heart className={cn("size-4", isFav && "fill-rose-500 text-rose-500")} />
          </button>
        </div>
      ) : (
        /* Normal cards (Standard/Sundul): single image */
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          {img ? (
            <Image
              src={img}
              alt={listingTitle(listing, mounted ? lang : "id")}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 ease-out"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-10" />
            </div>
          )}

          {/* top-left badges — promotion badges + condition */}
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {isSundul && (
              <span className="rounded-md bg-purple-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                {tr("sundulBadge")}
              </span>
            )}
            {isColek && (
              <span className="rounded-md bg-blue-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                Gold
              </span>
            )}
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow",
                conditionColor
              )}
            >
              {conditionLabel}
            </span>
          </div>

          {/* favorite */}
          <button
            onClick={fav}
            aria-label={isFav ? tr("removeFav") : tr("addFav")}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-foreground shadow backdrop-blur transition hover:bg-white dark:bg-black/70 dark:hover:bg-black/80"
          >
            <Heart
              className={cn("size-4", isFav && "fill-rose-500 text-rose-500")}
            />
          </button>

          {/* views badge - bottom left of image */}
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            <Eye className="size-3" />
            {listing.views?.toLocaleString("id-ID") || 0}
          </span>
        </div>
      )}

      {/* Spotlight yellow belt — below image */}
      {isSpotlight && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-400 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-950 shadow-sm">
          <Sparkles className="size-3.5" />
          {tr("spotlightBadge")}
        </div>
      )}

      {/* Highlight orange belt — below image */}
      {isHighlight && (
        <div className="flex items-center justify-center gap-1.5 bg-orange-500 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
          <Zap className="size-3.5" />
          {tr("highlightBadge")}
        </div>
      )}

      <div className={cn("flex flex-1 flex-col space-y-1 p-2.5", isSpotlight && "p-3")}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-bold text-primary text-base">
            {formatRupiahFull(listing.price)}
          </p>
          {listing.priceType === "negotiable" && (
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
              {tr("nego")}
            </span>
          )}
        </div>
        <h3 className={cn(
          "line-clamp-2 font-medium leading-snug text-foreground text-sm"
        )}>
          {listingTitle(listing, mounted ? lang : "id")}
        </h3>
        <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{listing.city}</span>
          {listing.yearProduced && (
            <>
              <span>•</span>
              <span className="shrink-0">Th. {listing.yearProduced}</span>
            </>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between pt-0.5 text-xs text-muted-foreground">
          <span>{timeAgo(listing.createdAt, mounted ? lang : "id")}</span>
          <span className="inline-flex items-center gap-0.5">
            {(listing as any).user?.logoImage ? (
              <img src={proxyUrl((listing as any).user.logoImage)} alt="" className="size-3.5 rounded-full object-cover" />
            ) : (
              <User className="size-3.5 text-primary" />
            )}
            {listing.seller.name}
          </span>
        </div>
      </div>
    </article>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-square w-full animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export { formatRupiahFull };
