"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Calendar,
  Phone,
  Mail,
  BadgeCheck,
  Star,
  Package,
  Eye,
  Tag,
  Home,
} from "lucide-react";
import { ListingCard } from "../listing-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang, translations as i18nTranslations } from "@/lib/i18n";
import { timeAgo } from "@/lib/types";
import { useMounted } from "@/lib/use-mounted";
import { proxyUrl } from "@/lib/image";

async function fetchSellerData(userId: string) {
  // Fetch the user's listings (includes seller relation)
  const listingsRes = await fetch(`/api/my-listings?userId=${userId}`);
  if (!listingsRes.ok) throw new Error("fail");
  const listingsData = await listingsRes.json();
  // Also fetch the user's public profile (banner + logo)
  let userProfile: any = null;
  try {
    const profileRes = await fetch(`/api/user-profile?userId=${userId}`);
    if (profileRes.ok) userProfile = (await profileRes.json()).user;
  } catch {}
  return { ...listingsData, userProfile };
}

export function SellerView() {
  const sellerId = useStore((s) => s.sellerId);
  const goBack = useStore((s) => s.goBack);
  const goHome = useStore((s) => s.goHome);
  const goToDetail = useStore((s) => s.goToDetail);
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["seller-listings", sellerId],
    queryFn: () => fetchSellerData(sellerId!),
    enabled: !!sellerId,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mb-6 h-32 w-full animate-pulse rounded-xl bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data || data.listings.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <p className="text-lg font-semibold">{tr("notFound")}</p>
        <p className="mt-1 text-sm text-muted-foreground">Penjual tidak ditemukan atau belum memiliki iklan.</p>
        <Button className="mt-4 bg-orange-500 text-white hover:bg-orange-600" onClick={goBack}>
          <ChevronLeft className="size-4" /> {tr("back")}
        </Button>
      </div>
    );
  }

  const listings = data.listings;
  // Get seller info from the first listing (they all share the same seller)
  const firstListing = listings[0];
  const seller = firstListing.seller;
  const ownerUser = firstListing.user;
  const userProfile = data.userProfile; // banner + logo from /api/user-profile

  // Use user data if available, otherwise seller data
  const displayName = userProfile?.name || ownerUser?.name || seller.name;
  const displayPhone = ownerUser?.phone || seller.phone;
  const displayEmail = ownerUser?.email;
  const displayCity = userProfile?.city || ownerUser?.city || seller.city;
  const displayProvince = seller.province;
  const verified = seller.verified;
  const rating = seller.rating;
  const reviewCount = seller.reviewCount;
  const joinedAt = seller.joinedAt;

  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // Only show active listings
  const activeListings = listings.filter((l: any) => l.status === "active");

  return (
    <div className="animate-fade-up">
      {/* back button + breadcrumb */}
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1 rounded-lg border border-orange-500 bg-orange-500 px-2.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600"
            aria-label={tr("back")}
          >
            <ChevronLeft className="size-4" /> {tr("back")}
          </button>
          <div className="flex min-w-0 items-center gap-1">
            <button onClick={goHome} className="hover:text-primary">{tr("home2")}</button>
            <ChevronRight className="size-3 shrink-0" />
            <span className="truncate text-foreground">{displayName}</span>
          </div>
        </div>
      </div>

      {/* Seller banner — full width, logo ½ overlap bottom edge, name+address BELOW banner */}
      <div className="relative mb-2 w-full">
        {/* Banner image — fixed height, full width */}
        <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary to-orange-600 sm:h-52 md:h-60 lg:h-64">
          <img
            src={proxyUrl(userProfile?.bannerImage) || "/seller-banner-sample.jpg"}
            alt="Banner"
            className="size-full object-cover"
          />
        </div>
        {/* Logo — ½ below banner (overlap bottom edge, di DEPAN banner) */}
        <div className="mx-auto flex max-w-7xl items-end gap-3 px-4 sm:gap-4 sm:px-6">
          <div className="relative z-10 -mt-12 shrink-0 sm:-mt-14">
            {userProfile?.logoImage ? (
              <img
                src={proxyUrl(userProfile.logoImage)}
                alt="Logo"
                className="size-24 rounded-xl border-4 border-white bg-white object-cover shadow-xl sm:size-28"
              />
            ) : (
              <Avatar className="size-24 rounded-xl border-4 border-white bg-primary shadow-xl sm:size-28">
                <AvatarFallback className="bg-primary text-xl font-bold text-primary-foreground sm:text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          {/* Name + badges — below/outside banner, beside logo, diturunkan sedikit */}
          <div className="min-w-0 flex-1 pb-2 pt-4">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-lg font-extrabold leading-tight text-foreground sm:text-2xl">{displayName}</h1>
              {verified && <BadgeCheck className="size-5 shrink-0 text-primary" />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:text-sm">
              <span className="flex items-center gap-0.5">
                <Home className="size-3" /> {userProfile?.address || displayCity}{displayProvince ? `, ${displayProvince}` : ""}
              </span>
              {displayPhone && (
                <span className="flex items-center gap-0.5">
                  <Phone className="size-3" /> {displayPhone}
                </span>
              )}
              {displayEmail && (
                <span className="flex items-center gap-0.5 truncate">
                  <Mail className="size-3" /> {displayEmail}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Info badges row — below banner, outside */}
        <div className="mx-auto mt-2 flex max-w-7xl flex-wrap items-center gap-2 px-4 sm:px-6">
          <span className="flex items-center gap-0.5 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            {rating.toFixed(1)} · {reviewCount} ulasan
          </span>
          {joinedAt && (
            <span className="text-[11px] text-muted-foreground/70">Bergabung {timeAgo(joinedAt, mounted ? lang : "id")}</span>
          )}
          <span className="flex items-center gap-0.5 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            <Package className="size-3" /> {activeListings.length} iklan aktif
          </span>
          {verified && (
            <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <BadgeCheck className="size-3" /> {tr("trustedSeller")}
            </span>
          )}
        </div>
      </div>

      {/* Listings — constrained width */}
      <div className="mx-auto max-w-7xl px-4">

      {/* Listings grid */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Iklan dari {displayName}
            <span className="ml-2 text-sm font-normal text-muted-foreground">({activeListings.length})</span>
          </h2>
        </div>
        {activeListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-12 text-center">
            <Package className="size-12 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-semibold">Belum ada iklan aktif</p>
            <p className="mt-1 text-xs text-muted-foreground">Iklan dari penjual ini akan muncul di sini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {activeListings.map((listing: any) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
