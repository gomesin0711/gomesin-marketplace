"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import {
  Heart,
  Share2,
  MapPin,
  Eye,
  Calendar,
  BadgeCheck,
  Star,
  Phone,
  ChevronLeft,
  ShieldCheck,
  Tag,
  ChevronRight,
  Clock,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  formatRupiahFull,
  timeAgo,
  type Listing,
} from "@/lib/types";
import { ListingCard } from "../listing-card";
import { ChatWidget } from "../chat-widget";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang, translations as i18nTranslations, formatT, categoryName, listingTitle, listingDesc, listingSpecs } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { proxyUrl } from "@/lib/image";

async function fetchDetail(slug: string) {
  const res = await fetch("/api/listings/" + slug);
  if (!res.ok) throw new Error("fail");
  return res.json() as Promise<{ listing: Listing; related: Listing[] }>;
}

export function DetailView() {
  const slug = useStore((s) => s.slug);
  const goBack = useStore((s) => s.goBack);
  const goToListings = useStore((s) => s.goToListings);
  const goToSeller = useStore((s) => s.goToSeller);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFav = useStore((s) => (slug ? false : false));
  const favIds = useStore((s) => s.favorites);
  const [activeImg, setActiveImg] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["listing", slug],
    queryFn: () => fetchDetail(slug!),
    enabled: !!slug,
  });

  const l = data?.listing;
  const related = data?.related;

  // Update OG meta tags dynamically so shared links show ad image
  useEffect(() => {
    if (!l) return;
    const title = listingTitle(l, mounted ? lang : "id");
    const desc = listingDesc(l, mounted ? lang : "id").slice(0, 200);
    const imageUrl = l.images[0] ? proxyUrl(l.images[0]) : "";
    const setMeta = (prop: string, content: string) => {
      let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", prop);
        document.head.appendChild(el);
      }
      el.content = content;
    };
    setMeta("og:title", title);
    setMeta("og:description", desc);
    setMeta("og:image", imageUrl);
    setMeta("og:image:width", "1200");
    setMeta("og:image:height", "630");
    setMeta("og:type", "article");
    setMeta("og:url", window.location.href);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", desc);
    setMeta("twitter:image", imageUrl);
    document.title = `${title} — Gomesin`;
    return () => {
      document.title = "Gomesin — Jual baru/bekas Mesin Cetak, Mesin Industri & Jasa Teknisi Berkualitas";
    };
  }, [l, mounted, lang]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 aspect-[16/9] w-full animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-24 w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="h-64 w-full animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <p className="text-lg font-semibold">{tr("notFound")}</p>
        <Button className="mt-4" onClick={goBack}>
          <ChevronLeft className="size-4" /> {tr("back")}
        </Button>
      </div>
    );
  }

  const fav = favIds.includes(l.id);
  // Use the ad owner's registered phone (from User table) if available,
  // otherwise fall back to seller phone.
  const ownerPhone = (l as any).user?.phone || l.seller.phone || "";
  const waNumber = ownerPhone.replace(/[^0-9]/g, "").replace(/^0/, "62");
  const waText = encodeURIComponent(
    formatT(tr("whatsappMsg"), { name: l.seller.name, title: l.title })
  );

  const share = async () => {
    try {
      const title = listingTitle(l, mounted ? lang : "id");
      const imageUrl = l.images[0] ? proxyUrl(l.images[0]) : undefined;
      if (navigator.share) {
        await navigator.share({
          title,
          text: `${title} — ${formatRupiahFull(l.price)}`,
          url: window.location.href,
          ...(imageUrl ? { files: [] } : {}),
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success(tr("linkCopied"));
      }
    } catch {}
  };

  const specsEntries = Object.entries(listingSpecs(l, mounted ? lang : "id"));

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 animate-fade-up">
      {/* back button + breadcrumb */}
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent"
          aria-label={tr("back")}
        >
          <ChevronLeft className="size-4" /> {tr("back")}
        </button>
        <div className="flex min-w-0 items-center gap-1">
          <button onClick={() => useStore.getState().goHome()} className="hover:text-primary">{tr("home2")}</button>
          <ChevronRight className="size-3 shrink-0" />
          <button onClick={() => goToListings({ category: l.category.slug })} className="hover:text-primary">
            {categoryName(l.category.name, mounted ? lang : "id")}
          </button>
          <ChevronRight className="size-3 shrink-0" />
          <span className="truncate text-foreground">{listingTitle(l, mounted ? lang : "id")}</span>
        </div>
      </div>

      {/* TOP: gallery + title/price card side by side */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* gallery — left */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div
            className="relative aspect-[16/9] w-full overflow-hidden bg-muted"
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchStartX.current === null) return;
              const diff = e.changedTouches[0].clientX - touchStartX.current;
              if (Math.abs(diff) > 40) {
                if (diff < 0) setActiveImg((p) => (p + 1) % l.images.length);
                else setActiveImg((p) => (p - 1 + l.images.length) % l.images.length);
              }
              touchStartX.current = null;
            }}
          >
            {l.images[activeImg] ? (
              <Image
                src={proxyUrl(l.images[activeImg])}
                alt={listingTitle(l, mounted ? lang : "id")}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 1280px"
                className="object-cover"
                unoptimized
              />
            ) : null}

            {/* favorite + share (top-right) */}
            <div className="absolute right-3 top-3 flex gap-2">
              <button
                onClick={() => toggleFavorite(l.id)}
                className="grid size-9 place-items-center rounded-full bg-white/90 shadow backdrop-blur hover:bg-white"
                aria-label={tr("favorite")}
              >
                <Heart className={cn("size-4", fav && "fill-rose-500 text-rose-500")} />
              </button>
              <button
                onClick={share}
                className="grid size-9 place-items-center rounded-full bg-white/90 shadow backdrop-blur hover:bg-white"
                aria-label={tr("share")}
              >
                <Share2 className="size-4" />
              </button>
            </div>

            {/* prev/next arrows (desktop, show if >1 image) */}
            {l.images.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImg((p) => (p - 1 + l.images.length) % l.images.length)}
                  className="absolute left-2 top-1/2 hidden -translate-y-1/2 grid size-9 place-items-center rounded-full bg-white/90 text-foreground shadow backdrop-blur transition hover:bg-white sm:grid"
                  aria-label={tr("photoPrev")}
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  onClick={() => setActiveImg((p) => (p + 1) % l.images.length)}
                  className="absolute right-2 top-1/2 hidden -translate-y-1/2 grid size-9 place-items-center rounded-full bg-white/90 text-foreground shadow backdrop-blur transition hover:bg-white sm:grid"
                  aria-label={tr("photoNext")}
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}

            {/* counter */}
            <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
              {activeImg + 1} / {l.images.length}
            </span>
          </div>
          {l.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto p-2 no-scrollbar">
              {l.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={cn(
                    "relative size-16 shrink-0 overflow-hidden rounded-lg border-2 bg-muted",
                    i === activeImg ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                  )}
                >
                  <Image src={proxyUrl(img)} alt="" fill className="object-cover" unoptimized sizes="64px" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* title + price card — right (with action buttons + seller profile merged in) */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          {/* Status banner for non-active listings */}
          {l.status === "pending" && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Clock className="size-4 shrink-0" />
              <span className="font-semibold">{tr("pendingVerification")}</span>
              <span className="text-amber-700">— Iklan Anda sedang menunggu verifikasi admin dan belum tayang di beranda.</span>
            </div>
          )}
          {l.status === "rejected" && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              <XCircle className="size-4 shrink-0" />
              <span className="font-semibold">{tr("rejected")}</span>
              <span className="text-red-700">— Iklan ini ditolak admin dan tidak tayang.</span>
            </div>
          )}
          {l.violationFlag && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="font-semibold">{tr("violation")}</span>
              <span className="text-red-700">— {l.violationReason || "Iklan ditandai melanggar ketentuan."}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={l.condition === "baru" ? "bg-primary" : l.condition === "jasa" ? "bg-blue-600" : l.condition === "sewa" ? "bg-amber-600" : "bg-orange-600"}>
              {l.condition === "baru" ? tr("baru") : l.condition === "jasa" ? "Jasa" : l.condition === "sewa" ? "Sewa" : tr("bekas")}
            </Badge>
            {l.featured && (
              <Badge className="bg-amber-500">
                <Tag className="mr-1 size-3" /> {tr("featuredBadge")}
              </Badge>
            )}
            {l.brand && <Badge variant="outline">{l.brand}</Badge>}
            {l.yearProduced && <Badge variant="outline">{tr("yearLabel")} {l.yearProduced}</Badge>}
          </div>
          <h1 className="mt-2 text-xl font-bold leading-snug sm:text-2xl">{listingTitle(l, mounted ? lang : "id")}</h1>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-primary sm:text-3xl">
              {formatRupiahFull(l.price)}
            </span>
            {l.priceType === "negotiable" && (
              <Badge variant="secondary" className="text-xs">{tr("nego")}</Badge>
            )}
          </div>
          {/* meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 text-primary" /> {l.city}, {l.province}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" /> {timeAgo(l.createdAt, mounted ? lang : "id")}
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" /> {l.views.toLocaleString("id-ID")} {tr("views")}
            </span>
          </div>

          {/* action buttons (moved from seller sidebar) */}
          <div className="mt-4 space-y-2">
            <Button
              onClick={() => setChatOpen(true)}
              className="w-full gap-2 rounded-full bg-primary font-semibold"
              size="lg"
            >
              {tr("chatSeller")}
            </Button>
            <a
              href={`https://wa.me/${waNumber}?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
            >
              <Phone className="size-4" /> WhatsApp
            </a>
            <Button
              variant="outline"
              className="w-full gap-2 rounded-full"
              size="lg"
              onClick={() => toggleFavorite(l.id)}
            >
              <Heart className={cn("size-4", fav && "fill-rose-500 text-rose-500")} />
              {fav ? tr("saved") : tr("saveAd")}
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 rounded-full"
              size="lg"
              onClick={share}
            >
              <Share2 className="size-4" />
              {tr("share")}
            </Button>
          </div>

          {/* seller profile (moved from seller sidebar) */}
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tr("sellerLabel")}</p>
            <button
              onClick={() => {
                const uid = (l as any).user?.id || l.seller.id;
                if (uid) goToSeller(uid);
              }}
              className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition hover:bg-accent"
            >
              <Avatar className="size-12 overflow-hidden">
                {(l as any).user?.logoImage ? (
                  <img src={proxyUrl((l as any).user.logoImage)} alt={l.seller.name} className="size-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-primary/10 font-bold text-primary">
                    {l.seller.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-bold hover:text-primary">{l.seller.name}</p>
                  {l.seller.verified && <BadgeCheck className="size-4 shrink-0 text-primary" />}
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" /> {l.seller.city}, {l.seller.province}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>

            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-secondary/50 p-3 text-center">
              <div>
                <p className="flex items-center justify-center gap-1 text-sm font-bold text-foreground">
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  {l.seller.rating.toFixed(1)}
                </p>
                <p className="text-[10px] text-muted-foreground">{l.seller.reviewCount} {tr("reviews")}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{tr("verified")}</p>
                <p className="text-[10px] text-muted-foreground">
                  {l.seller.verified ? tr("trustedSeller") : tr("generalSeller")}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="mt-3 w-full gap-2 rounded-full text-xs"
              size="sm"
              onClick={() => {
                const uid = (l as any).user?.id || l.seller.id;
                if (uid) goToSeller(uid);
              }}
            >
              <Tag className="size-3.5" /> {tr("viewSellerListings")}
            </Button>
          </div>
        </div>
      </div>

      {/* MAIN: left description (with specs merged) + right sidebar (phone only) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT */}
        <div className="min-w-0 space-y-4">
          {/* safety tips — yellow block */}
          <div className="rounded-xl border border-yellow-400 bg-yellow-400/70 p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck className="size-5 shrink-0 text-foreground" />
              <div className="text-sm">
                <p className="font-black text-base text-foreground">{tr("safetyTips")}</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs font-bold text-foreground">
                  <li>{tr("safetyTip1")}</li>
                  <li>{tr("safetyTip2")}</li>
                  <li>{tr("safetyTip3")}</li>
                  <li>{tr("safetyTip4")}</li>
                  <li>{tr("safetyTip5")}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* description + specs (merged into one card) */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-2 text-base font-bold">{tr("description")}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {listingDesc(l, mounted ? lang : "id")}
            </p>

            {/* specs (merged with border-top separator) */}
            {specsEntries.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <h2 className="mb-3 text-base font-bold">{tr("specs")}</h2>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <tbody>
                      {specsEntries.map(([k, v], i) => (
                        <tr key={k} className={i % 2 === 0 ? "bg-secondary/40" : ""}>
                          <td className="w-1/3 border-b border-border px-3 py-2 font-medium text-muted-foreground">
                            {k}
                          </td>
                          <td className="border-b border-border px-3 py-2 text-foreground">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — phone number card only */}
        <aside className="space-y-4">
          <div className="sticky top-44 space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{tr("sellerPhone")}</p>
              <p className="mt-1 text-lg font-bold tracking-wide">{ownerPhone}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tr("sellerPhoneNote")}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* related */}
      {related.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">{tr("similarAds")}</h2>
            <Button variant="ghost" size="sm" onClick={() => goToListings({ category: l.category.slug })}>
              {tr("viewAll")} <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {related.map((r) => (
              <ListingCard key={r.id} listing={r} />
            ))}
          </div>
        </section>
      )}

      <ChatWidget listing={l} open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  );
}
