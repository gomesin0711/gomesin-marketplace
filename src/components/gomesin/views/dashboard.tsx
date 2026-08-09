"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ListingRow, ListingRowSkeleton } from "../listing-row";
import { formatRupiahFull, timeAgo } from "@/lib/types";
import { useLang, translations as i18nTranslations, categoryName, listingTitle } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  List,
  Tag,
  Eye,
  TrendingUp,
  Plus,
  ChevronRight,
  Frown,
  Trash2,
  Edit,
  BadgeCheck,
  Loader2,
  MapPin,
  ImageIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Search,
  Crown,
  Gem,
  Shield,
  ArrowUpCircle,
  Timer,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Listing = any;

// --- Tab definitions ---
const TABS = [
  { key: "all", label: "Semua", icon: Tag },
  { key: "colek", label: "Iklan Gold", icon: Crown, pkgColor: "bg-blue-100 text-blue-700", ringColor: "ring-blue-400", rowBg: "bg-blue-50 hover:bg-blue-100 border-blue-200", badgeColor: "bg-blue-500" },
  { key: "highlight", label: "Iklan Platinum", icon: Gem, pkgColor: "bg-orange-100 text-orange-700", ringColor: "ring-orange-400", rowBg: "bg-orange-50 hover:bg-orange-100 border-orange-200", badgeColor: "bg-orange-500" },
  { key: "spotlight", label: "Iklan Titanium", icon: Shield, pkgColor: "bg-amber-100 text-amber-700", ringColor: "ring-amber-400", rowBg: "bg-amber-50 hover:bg-amber-100 border-amber-200", badgeColor: "bg-amber-500" },
  { key: "sundul", label: "Iklan Colek", icon: ArrowUpCircle, pkgColor: "bg-purple-100 text-purple-700", ringColor: "ring-purple-400", rowBg: "bg-purple-50 hover:bg-purple-100 border-purple-200", badgeColor: "bg-purple-500" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// --- Helpers ---
function getRemainingDays(paymentExpiry: string | null | undefined): { days: number; expired: boolean } {
  if (!paymentExpiry) return { days: -1, expired: false };
  const now = new Date();
  const exp = new Date(paymentExpiry);
  const diff = exp.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return { days, expired: days <= 0 };
}

function formatRemainingDays(paymentExpiry: string | null | undefined, lang: string): string {
  const { days, expired } = getRemainingDays(paymentExpiry);
  if (days < 0) return "-";
  if (expired) return "Non Aktif";
  if (days === 0) return "Hari ini berakhir";
  if (days === 1) return "1 hari lagi";
  return `${days} hari lagi`;
}

async function fetchListings(userId?: string) {
  const url = userId ? `/api/my-listings?userId=${encodeURIComponent(userId)}` : "/api/my-listings";
  const res = await fetch(url);
  if (!res.ok) throw new Error("fail");
  return res.json() as Promise<{ listings: Listing[]; total: number }>;
}

async function deleteListing(slug: string) {
  const res = await fetch(`/api/listings/${slug}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal menghapus");
  return data;
}

async function toggleSold(slug: string, isSold: boolean) {
  const res = await fetch(`/api/listings/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: isSold ? "active" : "sold" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal mengubah status");
  return data;
}

export function DashboardView() {
  const goToDetail = useStore((s) => s.goToDetail);
  const goToEdit = useStore((s) => s.goToEdit);
  const goToPost = useStore((s) => s.goToPost);
  const goHome = useStore((s) => s.goHome);
  const goToUpgrade = useStore((s) => s.goToUpgrade);
  const user = useStore((s) => s.user);
  const goToLogin = useStore((s) => s.goToLogin);
  const [viewMode, setViewMode] = useState<"grid" | "line">("grid");
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const queryClient = useQueryClient();
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-listings", user?.id],
    queryFn: () => fetchListings(user?.id),
    enabled: !!user?.id,
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteListing,
    onSuccess: () => {
      toast.success(tr("deleteSuccess"));
      setDeleteSlug(null);
      queryClient.invalidateQueries({ queryKey: ["dashboard-listings", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (e: any) => {
      toast.error(e.message || tr("deleteFailed"));
    },
  });

  const soldMutation = useMutation({
    mutationFn: ({ slug, isSold }: { slug: string; isSold: boolean }) => toggleSold(slug, isSold),
    onSuccess: (_, vars) => {
      toast.success(vars.isSold ? "Status terjual dibatalkan" : "Iklan ditandai terjual");
      queryClient.invalidateQueries({ queryKey: ["dashboard-listings", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (e: any) => {
      toast.error(e.message || "Gagal mengubah status");
    },
  });

  // All hook calls must be before any early returns
  const allListings: Listing[] = data?.listings ?? [];
  const total = data?.total ?? 0;

  // Filter by search (wrapped in useMemo)
  const searched = useMemo(() => {
    if (!search.trim()) return allListings;
    const q = search.toLowerCase();
    return allListings.filter((l) => (
      l.title?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q) ||
      l.brand?.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q) ||
      l.category?.name?.toLowerCase().includes(q) ||
      (user?.name || "").toLowerCase().includes(q) ||
      (user?.email || "").toLowerCase().includes(q)
    ));
  }, [allListings, search, user?.name, user?.email]);

  // Filter by tab
  const listings = useMemo(() => {
    if (activeTab === "all") return searched;
    return searched.filter((l) => l.packageType === activeTab);
  }, [searched, activeTab]);

  // Count per tab
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allListings.length };
    for (const tab of TABS) {
      if (tab.key !== "all") {
        counts[tab.key] = allListings.filter((l) => l.packageType === tab.key).length;
      }
    }
    return counts;
  }, [allListings]);

  // Not logged in
  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center animate-fade-up">
        <div className="grid size-16 place-items-center rounded-full bg-primary/10">
          <Frown className="size-8 text-primary" />
        </div>
        <h2 className="mt-4 text-xl font-bold">{tr("loginRequired")}</h2>
        <Button className="mt-4" onClick={goToLogin}>
          {tr("loginRegister")}
        </Button>
      </div>
    );
  }

  const handleDelete = (slug: string) => setDeleteSlug(slug);
  const confirmDelete = () => { if (deleteSlug) deleteMutation.mutate(deleteSlug); };

  // stats
  const totalViews = allListings.reduce((a, l) => a + (l.views || 0), 0);
  const totalValue = allListings.reduce((a, l) => a + (l.price || 0), 0);
  const featuredCount = allListings.filter((l) => l.featured).length;

  const stats = [
    { label: tr("totalAds"), value: total.toLocaleString("id-ID"), icon: Tag, color: "text-primary" },
    { label: tr("totalViews"), value: totalViews.toLocaleString("id-ID"), icon: Eye, color: "text-blue-500" },
    { label: tr("featuredCount"), value: featuredCount, icon: TrendingUp, color: "text-amber-500" },
    { label: tr("assetValue"), value: formatRupiahFull(totalValue), icon: Tag, color: "text-orange-600", small: true },
  ];

  // --- Render grid card ---
  const renderGridCard = (l: Listing) => {
    const img = l.images?.[0];
    const imgs = l.images || [];
    const isExpired = l.status === "active" && !!l.paymentExpiry && new Date(l.paymentExpiry) < new Date();
    const isSold = l.status === "sold";
    const statusInfo = l.status === "sold"
      ? { color: "bg-emerald-600", text: "Terjual", icon: BadgeCheck }
      : l.status === "draft"
      ? { color: "bg-slate-400", text: "Belum Aktif", icon: Clock }
      : l.status === "pending"
      ? { color: "bg-amber-500", text: tr("pendingVerification"), icon: Clock }
      : l.status === "rejected" || l.violationFlag
      ? { color: "bg-red-500", text: l.violationFlag ? tr("violation") : tr("rejected"), icon: AlertTriangle }
      : isExpired
      ? { color: "bg-red-500", text: "Non Aktif", icon: AlertTriangle }
      : { color: "bg-green-500", text: tr("dashActive"), icon: CheckCircle2 };
    const StatusIcon = statusInfo.icon;

    const pkgName =
      l.packageType === "spotlight" ? "Titanium"
      : l.packageType === "highlight" ? "Platinum"
      : l.packageType === "sundul" ? "Colek"
      : l.packageType === "colek" ? "Gold"
      : "";
    const pkgColor =
      l.packageType === "spotlight" ? "bg-amber-100 text-amber-700"
      : l.packageType === "highlight" ? "bg-orange-100 text-orange-700"
      : l.packageType === "sundul" ? "bg-purple-100 text-purple-700"
      : l.packageType === "colek" ? "bg-blue-100 text-blue-700"
      : "";

    const { days: remainingDays, expired } = getRemainingDays(l.paymentExpiry);

    // Line/ring color for package
    const lineColor = l.packageType === "spotlight" ? "border-amber-300"
      : l.packageType === "highlight" ? "border-orange-300"
      : l.packageType === "sundul" ? "border-purple-300"
      : l.packageType === "colek" ? "border-blue-300"
      : "";

    return (
      <div
        key={l.id}
        onClick={() => {
          if (l.status === "draft") goToUpgrade(l.slug);
          else if (l.status === "active" && !l.violationFlag) goToUpgrade(l.slug);
        }}
        className={cn(
          "group flex flex-col overflow-hidden rounded-xl border-2 bg-card transition",
          lineColor || "border-border",
          (l.status === "draft" || (l.status === "active" && !l.violationFlag))
            ? "cursor-pointer hover:shadow-lg"
            : "cursor-not-allowed opacity-80"
        )}
      >
        {/* image */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {img ? (
            <img src={img} alt={l.title} className="size-full object-cover transition group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-8" />
            </div>
          )}
          {/* SOLD overlay */}
          {isSold && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="rotate-[-15deg] scale-125 rounded-lg border-2 border-white/80 bg-emerald-600/90 px-4 py-1.5 text-sm font-extrabold uppercase tracking-wider text-white shadow-lg">
                Terjual
              </span>
            </div>
          )}
          {/* status badge */}
          <span className={cn("absolute left-2 top-2 flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow", statusInfo.color)}>
            <StatusIcon className="size-3" />
            {statusInfo.text}
          </span>
          {/* package badge */}
          {pkgName && (
            <span className={cn("absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold text-white shadow", pkgColor.replace("100", "500").replace("700", ""))}>
              {pkgName}
            </span>
          )}
          {/* photo count */}
          {imgs.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
              📷 {imgs.length}
            </span>
          )}
        </div>

        {/* content */}
        <div className="flex flex-1 flex-col p-3">
          {/* price */}
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-primary">
              {formatRupiahFull(l.price)}
            </p>
            {l.priceType === "negotiable" && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Nego
              </span>
            )}
          </div>
          {/* title */}
          <h3 className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-foreground">
            {listingTitle(l, mounted ? lang : "id")}
          </h3>
          {/* meta */}
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" /> {l.city}, {l.province}
          </div>
          <div className="mt-0.5 flex items-center gap-x-2 text-[10px] text-muted-foreground">
            <span>{l.condition === "baru" ? tr("commonBaru") : tr("commonBekas")}</span>
            {l.brand && <span>· {l.brand}</span>}
            {l.yearProduced && <span>· Th. {l.yearProduced}</span>}
          </div>

          {/* Masa Aktif — remaining days bar */}
          {l.paymentExpiry && l.paymentStatus === "paid" && (
            <div className="mt-2">
              {expired ? (
                <div className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1">
                  <AlertTriangle className="size-3 shrink-0 text-red-500" />
                  <span className="text-[10px] font-bold text-red-600">
                    Non Aktif — Expired {new Date(l.paymentExpiry).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Timer className="size-3" />
                      <span>Masa aktif</span>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold",
                      remainingDays <= 3 ? "text-red-600" : remainingDays <= 7 ? "text-amber-600" : "text-green-600"
                    )}>
                      {remainingDays === 0 ? "Berakhir hari ini" : `${remainingDays} hari lagi`}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        remainingDays <= 3 ? "bg-red-500" : remainingDays <= 7 ? "bg-amber-500" : "bg-green-500"
                      )}
                      style={{ width: `${Math.max(0, Math.min(100, (remainingDays / 30) * 100))}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    Berakhir: {new Date(l.paymentExpiry).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* bottom: views + actions */}
          <div className="mt-auto pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Eye className="size-3" /> {l.views?.toLocaleString("id-ID") || 0}
              </span>
              <div className="flex gap-1">
                {(l.status === "active" || isSold) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); soldMutation.mutate({ slug: l.slug, isSold }); }}
                    disabled={soldMutation.isPending}
                    className={cn(
                      "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition",
                      isSold
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-emerald-300 bg-background text-emerald-700 hover:bg-emerald-50"
                    )}
                  >
                    {soldMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <BadgeCheck className="size-3" />}
                    {isSold ? "Batal" : "Terjual"}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); goToEdit(l.slug); }}
                  className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-semibold text-foreground transition hover:bg-primary hover:text-white hover:border-primary"
                >
                  <Edit className="size-3" /> Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(l.slug); }}
                  className="flex items-center gap-1 rounded-md border border-destructive/30 bg-background px-2 py-1 text-[10px] font-semibold text-destructive transition hover:bg-destructive hover:text-white hover:border-destructive"
                >
                  <Trash2 className="size-3" /> Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Render line/row card ---
  const renderLineCard = (l: Listing) => {
    const img = l.images?.[0];
    const isExpired = l.status === "active" && !!l.paymentExpiry && new Date(l.paymentExpiry) < new Date();
    const isSold = l.status === "sold";
    const statusInfo = l.status === "sold"
      ? { color: "bg-emerald-600", text: "Terjual", icon: BadgeCheck }
      : l.status === "draft"
      ? { color: "bg-slate-400", text: "Belum Aktif", icon: Clock }
      : l.status === "pending"
      ? { color: "bg-amber-500", text: tr("pendingVerification"), icon: Clock }
      : l.status === "rejected" || l.violationFlag
      ? { color: "bg-red-500", text: l.violationFlag ? tr("violation") : tr("rejected"), icon: AlertTriangle }
      : isExpired
      ? { color: "bg-red-500", text: "Non Aktif", icon: AlertTriangle }
      : { color: "bg-green-500", text: tr("dashActive"), icon: CheckCircle2 };
    const StatusIcon = statusInfo.icon;

    const pkgName =
      l.packageType === "spotlight" ? "Titanium"
      : l.packageType === "highlight" ? "Platinum"
      : l.packageType === "sundul" ? "Colek"
      : l.packageType === "colek" ? "Gold"
      : "";
    const pkgColor =
      l.packageType === "spotlight" ? "bg-amber-100 text-amber-700 border-amber-200"
      : l.packageType === "highlight" ? "bg-orange-100 text-orange-700 border-orange-200"
      : l.packageType === "sundul" ? "bg-purple-100 text-purple-700 border-purple-200"
      : l.packageType === "colek" ? "bg-blue-100 text-blue-700 border-blue-200"
      : "bg-secondary text-muted-foreground border-border";

    const { days: remainingDays, expired } = getRemainingDays(l.paymentExpiry);

    return (
      <div
        key={l.id}
        onClick={() => {
          if (l.status === "draft") goToUpgrade(l.slug);
          else if (l.status === "active" && !l.violationFlag) goToUpgrade(l.slug);
        }}
        className={cn(
          "group flex gap-3 border-b border-border p-3 transition hover:bg-accent/50",
          (l.status === "draft" || (l.status === "active" && !l.violationFlag))
            ? "cursor-pointer"
            : "cursor-not-allowed opacity-80"
        )}
      >
        {/* image */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
          {img ? (
            <img src={img} alt={l.title} className="size-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-6" />
            </div>
          )}
          {/* SOLD overlay */}
          {isSold && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
              <span className="rotate-[-15deg] scale-100 rounded border border-white/80 bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                Terjual
              </span>
            </div>
          )}
        </div>

        {/* content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">
                {listingTitle(l, mounted ? lang : "id")}
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {l.brand ? `${l.brand} · ` : ""}{categoryName(l.category?.name || "", mounted ? lang : "id")} · {l.city}
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold text-primary">
              {formatRupiahFull(l.price)}
            </p>
          </div>

          {/* badges row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm", statusInfo.color)}>
              <StatusIcon className="size-2.5" /> {statusInfo.text}
            </span>
            {pkgName && (
              <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", pkgColor)}>
                {pkgName}
              </span>
            )}
            {l.paymentExpiry && l.paymentStatus === "paid" && (
              <span className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                expired ? "bg-red-50 text-red-600" : remainingDays <= 3 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"
              )}>
                <Timer className="size-2.5" />
                {formatRemainingDays(l.paymentExpiry, mounted ? lang : "id")}
              </span>
            )}
          </div>

          {/* bottom row */}
          <div className="mt-auto flex items-center justify-between pt-2">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Eye className="size-3" /> {l.views?.toLocaleString("id-ID") || 0} dilihat
              </span>
              <span>·</span>
              <span>{timeAgo(l.createdAt, mounted ? lang : "id")}</span>
            </div>
            <div className="flex gap-1">
              {(l.status === "active" || isSold) && (
                <button
                  onClick={(e) => { e.stopPropagation(); soldMutation.mutate({ slug: l.slug, isSold }); }}
                  disabled={soldMutation.isPending}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition",
                    isSold
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-emerald-300 bg-background text-emerald-700 hover:bg-emerald-50"
                  )}
                >
                  {soldMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <BadgeCheck className="size-3" />}
                  {isSold ? "Batal" : "Terjual"}
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); goToEdit(l.slug); }}
                className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-semibold text-foreground transition hover:bg-primary hover:text-white hover:border-primary"
              >
                <Edit className="size-3" /> Edit
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(l.slug); }}
                className="flex items-center gap-1 rounded-md border border-destructive/30 bg-background px-2 py-1 text-[10px] font-semibold text-destructive transition hover:bg-destructive hover:text-white hover:border-destructive"
              >
                <Trash2 className="size-3" /> Hapus
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 animate-fade-up">
      {/* Banner */}
      {user && (
        <div className="relative mb-5 -mx-4 md:mx-0 w-[calc(100%+2rem)] md:w-full">
          <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary to-orange-600 sm:h-52 md:h-60">
            <img src={user.bannerImage || "/seller-banner-sample.jpg"} alt="Banner" className="size-full object-cover" />
          </div>
          <div className="-mt-10 flex items-end gap-3 px-3 sm:-mt-12 sm:px-4 sm:gap-4">
            <div className="relative z-10 shrink-0">
              {user.logoImage ? (
                <img src={user.logoImage} alt="Logo" className="size-20 rounded-xl border-4 border-white bg-white object-cover shadow-xl sm:size-24" onError={(e)=>{(e.target as HTMLImageElement).style.display='none';}} />
              ) : (
                <span className="grid size-20 place-items-center rounded-xl border-4 border-white bg-primary text-lg font-bold text-primary-foreground shadow-xl sm:size-24">
                  {(user.name || "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1 pt-4">
              <p className="truncate text-base font-extrabold text-foreground sm:text-xl">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                {user.address || user.city || "-"}{user.phone ? ` · ${user.phone}` : ""}{user.email ? ` · ${user.email}` : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* breadcrumb */}
      <div className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={goHome} className="hover:text-primary">{tr("home2")}</button>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{tr("dashboardCrumb")}</span>
      </div>

      {/* header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tr("dashboardTitle")}</h1>
          <p className="text-sm text-muted-foreground">{tr("dashboardDesc")}</p>
        </div>
        <Button onClick={goToPost} className="gap-2 rounded-full bg-primary font-semibold">
          <Plus className="size-4" /> {tr("postAd2")}
        </Button>
      </div>

      {/* stats cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <span className={cn("text-[11px] font-medium text-muted-foreground sm:text-xs", s.small && "text-[10px]")}>{s.label}</span>
              <s.icon className={cn("size-4", s.color)} />
            </div>
            <p className={cn("mt-1 font-bold", s.small ? "text-xs sm:text-sm" : "text-base sm:text-lg")}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ===== TABS ===== */}
      <div className="mb-4 overflow-x-auto gomesin-scroll">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <tab.icon className="size-3.5" />
                <span>{tab.label}</span>
                <span className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* toolbar: search + view toggle */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari iklan..."
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-56"
            />
          </div>
          <span className="text-xs text-muted-foreground">{listings.length} iklan</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid"
              className={cn(
                "grid size-9 place-items-center transition",
                viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent"
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("line")}
              aria-label="Line"
              className={cn(
                "grid size-9 place-items-center border-l border-border transition",
                viewMode === "line" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent"
              )}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ===== RESULTS ===== */}
      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border-2 border-border bg-card">
                <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
                <div className="space-y-2 p-3">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 border-b border-border p-3">
                <div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-muted sm:h-24 sm:w-24" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Frown className="size-12 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">{tr("noAds")}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{tr("noAdsDesc")}</p>
          <Button className="mt-4 gap-2" onClick={goToPost}>
            <Plus className="size-4" /> {tr("postFirstAd")}
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map(renderGridCard)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {listings.map(renderLineCard)}
        </div>
      )}

      {/* delete confirmation dialog */}
      <AlertDialog open={deleteSlug !== null} onOpenChange={(o) => !o && setDeleteSlug(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("deleteAdTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("deleteAdDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="gap-2 bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {deleteMutation.isPending ? tr("deleting") : tr("deleteBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
