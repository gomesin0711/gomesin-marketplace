"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatRupiahFull } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ShieldCheck, LayoutDashboard, Tag, Users, FolderTree, Award,
  MapPin, Image, Crown, Receipt, FileText, ScrollText,
  CheckCircle2, XCircle, Trash2, Plus, ChevronRight, ChevronLeft, Lock, X,
  TrendingUp, DollarSign, Eye, BarChart3, Loader2, Edit, Sparkle, Clock, RefreshCw,
  Mail, Phone, Calendar, Zap,
  MessageCircle, Send, Search, ArrowLeft,
  LayoutGrid, List, Gem, Shield, ArrowUpCircle, Timer, ImageIcon,
  AlertTriangle, Frown,
} from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { useLang, translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useChatSocket, type ChatMessage } from "@/lib/use-chat-socket";
import { normalizeImageUrl } from "@/lib/image";

type Tab = "dashboard" | "iklan" | "iklanbaru" | "iklanexpired" | "iklanditolak" | "penjual" | "kategori" | "merek" | "lokasi" | "banner" | "paket" | "transaksi" | "laporan" | "laporanbulanan" | "audit" | "pengguna" | "chat";

// ============ FETCHERS ============
const fetchJson = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch { return null; }
};

// Shared query options for realtime admin polling.
// Polls every 3s (was 500ms — too aggressive, caused 8 Supabase queries/sec
// on production and contributed to the perceived delete delay).
// Combined with optimistic updates on mutations, actions appear instant while
// polling catches changes from other users/devices.
const RT = { staleTime: 0, refetchInterval: 3000, refetchIntervalInBackground: true } as const;

// Format biaya pasang iklan (angka dari server) → "Rp X".
// `adFee` sudah dihitung di sisi server (/api/admin/listings) dari tabel Paket,
// jadi tidak ada race condition dengan fetch paket terpisah.
const formatAdFee = (fee: number | undefined | null): string => {
  const n = Number(fee) || 0;
  return n === 0 ? "-" : formatRupiahFull(n);
};

// ============ MAIN COMPONENT ============
export function AdminView({ initialTab }: { initialTab?: Tab }) {
  const goHome = useStore((s) => s.goHome);
  const user = useStore((s) => s.user);
  const goToLogin = useStore((s) => s.goToLogin);
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const [tab, setTab] = useState<Tab>(initialTab || "dashboard");
  // NOTE: When `initialTab` changes, the parent (app-shell.tsx) uses a `key={view}`
  // prop on <AdminView> so React fully remounts this component — meaning the
  // useState initializer above is re-evaluated and `tab` correctly reflects the
  // new `initialTab`. We intentionally do NOT sync via useEffect here because
  // (a) the key-based remount already handles it, and (b) calling setState
  // inside an effect triggers the `react-hooks/set-state-in-effect` lint rule.
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteCallback, setDeleteCallback] = useState<(() => void) | null>(null);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <Lock className="mx-auto size-12 text-destructive" />
        <h2 className="mt-4 text-xl font-bold">Akses Ditolak</h2>
        <p className="mt-2 text-sm text-muted-foreground">Silakan masuk dengan akun admin.</p>
        <Button className="mt-4" onClick={goToLogin}>Masuk Admin</Button>
        <p className="mt-2 text-xs text-muted-foreground">gomesin0711@gmail.com / admin123</p>
      </div>
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <ShieldCheck className="mx-auto size-12 text-destructive" />
        <h2 className="mt-4 text-xl font-bold">Bukan Admin</h2>
        <p className="mt-2 text-sm text-muted-foreground">Akun Anda tidak memiliki akses admin.</p>
        <Button className="mt-4" onClick={goHome}>Kembali</Button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: tr("admDashboard"), icon: LayoutDashboard },
    { id: "iklan", label: tr("admVerifyListings"), icon: Tag },
    { id: "penjual", label: tr("admVerifySellers"), icon: Users },
    { id: "kategori", label: tr("admManageCategories"), icon: FolderTree },
    { id: "merek", label: tr("admManageBrands"), icon: Award },
    { id: "lokasi", label: tr("admManageLocations"), icon: MapPin },
    { id: "banner", label: tr("admPromoBanner"), icon: Image },
    { id: "paket", label: tr("admPremiumPackages"), icon: Crown },
    { id: "transaksi", label: tr("admTransactions"), icon: Receipt },
    { id: "laporan", label: tr("admReports"), icon: FileText },
    { id: "audit", label: tr("admAuditTitle"), icon: ScrollText },
    { id: "chat", label: "Pesan", icon: MessageCircle },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 animate-fade-up">
      {/* breadcrumb */}
      <div className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={goHome} className="hover:text-primary">Beranda</button>
        <ChevronRight className="size-3" />
        <span className="text-foreground">Administrator</span>
      </div>

      {/* Banner + Logo + Title — sama persis dengan dashboard iklan saya */}
      <div className="relative mb-5 w-full">
        {/* Banner image — full width */}
        <div className="relative h-40 w-full overflow-hidden rounded-xl bg-gradient-to-br from-primary to-orange-600 sm:h-52 md:h-60">
          {user.bannerImage ? (
            <img src={user.bannerImage} alt="Banner" className="size-full object-cover" />
          ) : (
            <div className="size-full bg-gradient-to-br from-primary to-orange-600" />
          )}
        </div>
        {/* Logo — ½ below banner (overlap bottom edge, di DEPAN banner), digeser ke kanan ~1cm */}
        <div className="-mt-10 flex items-end gap-3 px-3 sm:-mt-12 sm:px-4 sm:gap-4">
          <div className="relative z-10 shrink-0">
            {user.logoImage ? (
              <img src={user.logoImage} alt="Logo" className="size-20 rounded-xl border-4 border-white bg-white object-cover shadow-xl sm:size-24" />
            ) : (
              <span className="grid size-20 place-items-center rounded-xl border-4 border-white bg-primary text-lg font-bold text-primary-foreground shadow-xl sm:size-24">
                <ShieldCheck className="size-8" />
              </span>
            )}
          </div>
          {/* Name + title — below/outside banner, beside logo */}
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-base font-extrabold text-foreground sm:text-xl">Panel Administrator</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              {user.name}{user.email ? ` · ${user.email}` : ""}
            </p>
          </div>
          {/* Back button — right side */}
          <button
            onClick={goHome}
            aria-label="Kembali"
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-accent"
          >
            <ArrowLeft className="size-5" />
          </button>
        </div>
      </div>

      {/* content — tab dikontrol via sidebar, tidak ada tab bar */}
      {tab === "dashboard" && <DashboardTab />}
      {tab === "iklan" && <IklanTab />}
      {tab === "iklanbaru" && <IklanBaruTab />}
      {tab === "iklanexpired" && <IklanExpiredTab />}
      {tab === "iklanditolak" && <IklanDitolakTab />}
      {tab === "penjual" && <PenjualTab />}
      {tab === "kategori" && <KategoriTab />}
      {tab === "pengguna" && <PenggunaTab />}
      {tab === "merek" && <MerekTab />}
      {tab === "lokasi" && <LokasiTab />}
      {tab === "banner" && <BannerTab />}
      {tab === "paket" && <PaketTab />}
      {tab === "transaksi" && <TransaksiTab />}
      {tab === "laporan" && <LaporanTab />}
      {tab === "laporanbulanan" && <MonthlyReportTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "chat" && <ChatTab />}

    </div>
  );
}

// ============ DASHBOARD TAB ============
function DashboardTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fetchJson("/api/admin/stats"), ...RT });
  if (isLoading || !data) return <SkeletonGrid count={4} />;
  const stats = [
    { label: tr("admTotalUsers"), value: data.totals.users, icon: Users, color: "text-blue-500", bg: "bg-blue-50" },
    { label: tr("admTotalListings"), value: data.totals.listings, icon: Tag, color: "text-primary", bg: "bg-primary/10" },
    { label: tr("admTotalRevenue"), value: formatRupiahFull(data.totals.omzetAll), icon: DollarSign, color: "text-orange-600", bg: "bg-orange-50", small: true },
    { label: tr("admAdmins"), value: data.totals.admins, icon: ShieldCheck, color: "text-amber-500", bg: "bg-amber-50" },
  ];
  const periods = [
    { label: tr("admToday"), ...data.users, ...data.listings, omzet: data.omzet.today },
    { label: tr("admThisWeek"), u: data.users.week, l: data.listings.week, omzet: data.omzet.week },
    { label: tr("admThisMonth"), u: data.users.month, l: data.listings.month, omzet: data.omzet.month },
  ];
  const maxOmzet = Math.max(...data.last7Days.map((d: any) => d.omzet), 1);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
              <span className={cn("grid size-8 place-items-center rounded-lg", s.bg)}><s.icon className={cn("size-4", s.color)} /></span>
            </div>
            <p className={cn("mt-2 font-bold", s.small ? "text-sm sm:text-base" : "text-xl sm:text-2xl")}>{s.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {periods.map((p) => (
          <div key={p.label} className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-bold">{p.label}</h3>
            <div className="space-y-2 text-sm">
              <Row label={tr("admNewUsers")} value={p.u ?? p.label === "Hari Ini" ? data.users.today : 0} />
              <Row label={tr("admIncomingAds2")} value={p.l ?? 0} />
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Omset</span>
                <span className="font-bold text-orange-600">{formatRupiahFull(p.omzet)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold"><BarChart3 className="size-4 text-primary" /> Omset 7 Hari Terakhir</h3>
        <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
          {data.last7Days.map((d: any, i: number) => {
            const h = Math.max(4, (d.omzet / maxOmzet) * 100);
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[9px] text-muted-foreground">{d.omzet > 0 ? formatRupiahFull(d.omzet).replace("Rp ", "") : "—"}</span>
                <div className="flex w-full items-end justify-center" style={{ height: 100 }}>
                  <div className="w-full max-w-[32px] rounded-t-md bg-gradient-to-t from-primary to-orange-400" style={{ height: `${h}%` }} />
                </div>
                <span className="text-[9px] text-muted-foreground">{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      {data.topCategories.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold"><TrendingUp className="size-4 text-primary" /> Kategori Terpopuler</h3>
          <div className="space-y-2">
            {data.topCategories.map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-5 text-xs font-bold text-muted-foreground">#{i + 1}</span>
                <span className="w-40 shrink-0 truncate text-xs font-medium">{c.name}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-muted"><div className="h-full rounded bg-primary/70" style={{ width: `${(c.count / Math.max(...data.topCategories.map((x: any) => x.count))) * 100}%` }} /></div>
                <span className="w-8 text-right text-xs font-bold">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ ADMIN PACKAGE TABS ============
const ADMIN_PKG_TABS = [
  { key: "all", label: "Semua", icon: Tag },
  { key: "colek", label: "Gold", icon: Crown, border: "border-blue-300", badgeBg: "bg-blue-100 text-blue-700" },
  { key: "highlight", label: "Platinum", icon: Gem, border: "border-orange-300", badgeBg: "bg-orange-100 text-orange-700" },
  { key: "spotlight", label: "Titanium", icon: Shield, border: "border-amber-300", badgeBg: "bg-amber-100 text-amber-700" },
  { key: "sundul", label: "Colek", icon: ArrowUpCircle, border: "border-purple-300", badgeBg: "bg-purple-100 text-purple-700" },
] as const;

type AdminPkgTabKey = (typeof ADMIN_PKG_TABS)[number]["key"];

function getRemainingDaysAdmin(paymentExpiry: string | null | undefined): { days: number; expired: boolean } {
  if (!paymentExpiry) return { days: -1, expired: false };
  const now = new Date();
  const exp = new Date(paymentExpiry);
  const diff = exp.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return { days, expired: days <= 0 };
}

function getPkgBadge(type: string) {
  switch (type) {
    case "spotlight": return { name: "Titanium", bg: "bg-amber-100 text-amber-700", dot: "bg-amber-500" };
    case "highlight": return { name: "Platinum", bg: "bg-orange-100 text-orange-700", dot: "bg-orange-500" };
    case "sundul": return { name: "Colek", bg: "bg-purple-100 text-purple-700", dot: "bg-purple-500" };
    case "colek": return { name: "Gold", bg: "bg-blue-100 text-blue-700", dot: "bg-blue-500" };
    default: return { name: "Gratis", bg: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" };
  }
}

// ============ IKLAN TAB ============
function IklanTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const qc = useQueryClient();
  const { broadcastListings } = useChatSocket();
  // Track pending deletes so the 3s polling refetch canNOT bring back a
  // listing that is being deleted (which caused the perceived 5-second delay:
  // optimistic remove → poll re-adds → next poll finally removes for real).
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const { data, isLoading } = useQuery({
    queryKey: ["admin-listings"],
    queryFn: () => fetchJson("/api/admin/listings"),
    // Filter out pending deletes from EVERY refetch result (including the
    // 3s background poll) so deleted listings never reappear mid-mutation.
    select: (raw: any) => {
      if (!raw?.listings) return raw;
      if (pendingDeletes.size === 0) return raw;
      return { ...raw, listings: raw.listings.filter((l: any) => !pendingDeletes.has(l.id)) };
    },
    ...RT,
  });
  const [previewListing, setPreviewListing] = useState<any>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminPkgTabKey>("all");
  const [viewMode, setViewMode] = useState<"grid" | "line">("grid");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteCallback, setDeleteCallback] = useState<(() => void) | null>(null);
  const [search, setSearch] = useState("");
  // Helper — invalidate BOTH admin-listings (this page) AND public ["listings"]
  // (Beranda / homepage) so that any open homepage refetches immediately.
  // Also fire a socket broadcast so OTHER browsers/tabs refetch in realtime.
  const invalidateAllListings = () => {
    qc.invalidateQueries({ queryKey: ["admin-listings"] });
    qc.invalidateQueries({ queryKey: ["listings"] });
    broadcastListings();
  };
  const del = useMutation({
    mutationFn: (id: string) => fetch("/api/admin/listings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }),
    // Optimistic update: remove the listing from cache IMMEDIATELY so the UI
    // updates instantly (0ms delay). Also add to pendingDeletes so the 3s
    // polling refetch canNOT bring it back before the API completes.
    onMutate: async (id: string) => {
      setPendingDeletes((prev) => new Set(prev).add(id));
      await qc.cancelQueries({ queryKey: ["admin-listings"] });
      const prev = qc.getQueryData<any>(["admin-listings"]);
      qc.setQueryData<any>(["admin-listings"], (old: any) => {
        if (!old?.listings) return old;
        return { ...old, listings: old.listings.filter((l: any) => l.id !== id) };
      });
      qc.setQueryData<any>(["listings"], (old: any) => {
        if (!old?.listings) return old;
        return { ...old, listings: old.listings.filter((l: any) => l.id !== id), total: Math.max(0, (old.total || 0) - 1) };
      });
      return { prev };
    },
    onSuccess: (_data: any, id: string) => {
      // Clear from pending now that Supabase has committed the delete.
      setPendingDeletes((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success(tr("admDeleted"));
      invalidateAllListings();
    },
    onError: (_e: any, id: string, ctx: any) => {
      setPendingDeletes((prev) => { const n = new Set(prev); n.delete(id); return n; });
      if (ctx?.prev) qc.setQueryData(["admin-listings"], ctx.prev);
      toast.error("Gagal menghapus iklan");
    },
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => fetch("/api/admin/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }),
    // Optimistic update: change the listing's status in cache IMMEDIATELY.
    // For "active" (publikasi) → listing appears on Iklan Aktif instantly.
    // For "rejected" (tolak) → listing disappears from Iklan Aktif instantly.
    onMutate: async ({ id, status }: { id: string; status: string }) => {
      await qc.cancelQueries({ queryKey: ["admin-listings"] });
      const prev = qc.getQueryData<any>(["admin-listings"]);
      qc.setQueryData<any>(["admin-listings"], (old: any) => {
        if (!old?.listings) return old;
        return {
          ...old,
          listings: old.listings.map((l: any) =>
            l.id === id
              ? { ...l, status, paymentStatus: status === "active" ? "paid" : l.paymentStatus }
              : l
          ),
        };
      });
      return { prev };
    },
    onSuccess: () => { toast.success(tr("admStatusUpdated")); invalidateAllListings(); },
    onError: (_e: any, _vars: any, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["admin-listings"], ctx.prev);
    },
  });
  const setViolation = useMutation({
    mutationFn: ({ id, flag, reason }: { id: string; flag: boolean; reason?: string }) => fetch("/api/admin/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, violationFlag: flag, violationReason: reason }) }),
    // Optimistic: flag=true → status becomes "rejected" (disappears from Aktif);
    // flag=false → status becomes "active" (reappears on Aktif / pulihkan).
    onMutate: async ({ id, flag }: { id: string; flag: boolean; reason?: string }) => {
      await qc.cancelQueries({ queryKey: ["admin-listings"] });
      const prev = qc.getQueryData<any>(["admin-listings"]);
      qc.setQueryData<any>(["admin-listings"], (old: any) => {
        if (!old?.listings) return old;
        return {
          ...old,
          listings: old.listings.map((l: any) =>
            l.id === id
              ? { ...l, violationFlag: flag, status: flag ? "rejected" : "active" }
              : l
          ),
        };
      });
      return { prev };
    },
    onSuccess: () => { toast.success(tr("admViolationStatusUpdated")); invalidateAllListings(); },
    onError: (_e: any, _vars: any, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["admin-listings"], ctx.prev);
    },
  });
  const markSold = useMutation({
    mutationFn: (id: string) => fetch("/api/admin/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "sold" }) }),
    onSuccess: () => { toast.success("Iklan ditandai terjual"); invalidateAllListings(); },
  });

  // ACTIVE ADS ONLY — unpublished (pending/draft/rejected) listings belong on
  // the "Iklan Baru" tab, not here. This is the fix for: "apabila iklan belum
  // di publikasi maka iklan tersebut tidak masuk ke halaman iklan aktif".
  const allListings = useMemo(
    () => ((data?.listings || []) as any[]).filter((l) => l.status === "active"),
    [data?.listings]
  );

  // Tab counts
  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: allListings.length };
    for (const tab of ADMIN_PKG_TABS) {
      if (tab.key !== "all") c[tab.key] = allListings.filter((l: any) => l.packageType === tab.key).length;
    }
    return c;
  }, [allListings]);

  // Filter by tab + search
  const listings = useMemo(() => {
    let filtered = activeTab === "all" ? allListings : allListings.filter((l: any) => l.packageType === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((l: any) =>
        l.title?.toLowerCase().includes(q) ||
        l.seller?.name?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.category?.name?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allListings, activeTab, search]);

  if (isLoading || !data) return <SkeletonGrid count={3} />;

  const openPreview = (l: any) => { setPreviewListing(l); setActiveImg(0); };

  // --- Grid Card ---
  const renderGridCard = (l: any) => {
    const img = l.images?.[0];
    const imgs = l.images || [];
    const pkg = getPkgBadge(l.packageType);
    const { days: remainingDays, expired } = getRemainingDaysAdmin(l.paymentExpiry);
    const borderColor = ADMIN_PKG_TABS.find(t => t.key === l.packageType)?.border || "border-border";

    return (
      <div
        key={l.id}
        onClick={() => openPreview(l)}
        className={cn(
          "group flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 bg-card transition hover:shadow-lg",
          borderColor
        )}
      >
        {/* Image */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {img ? (
            <img src={img} alt={l.title} className="size-full object-cover transition group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-8" /></div>
          )}
          <span className={cn("absolute left-2 top-2 flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold shadow",
            l.status === "active" ? "bg-green-500 text-white" : "bg-red-500 text-white"
          )}>
            {l.status === "active" ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
            {l.status === "active" ? "Aktif" : l.status}
          </span>
          <span className={cn("absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold", pkg.bg)}>
            {pkg.name}
          </span>
          {imgs.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">📷 {imgs.length}</span>
          )}
        </div>
        {/* Content */}
        <div className="flex flex-1 flex-col p-3">
          <p className="text-sm font-bold text-primary">{formatRupiahFull(l.price)}</p>
          <h3 className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-foreground">{l.title}</h3>
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" /> {l.city}{l.seller?.name ? ` · ${l.seller.name}` : ""}
          </div>
          {/* Masa Aktif */}
          {l.paymentExpiry && l.paymentStatus === "paid" && (
            <div className="mt-2">
              {expired ? (
                <div className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1">
                  <AlertTriangle className="size-3 shrink-0 text-red-500" />
                  <span className="text-[10px] font-bold text-red-600">Non Aktif</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Timer className="size-3" /><span>Masa aktif</span>
                    </div>
                    <span className={cn("text-[10px] font-bold",
                      remainingDays <= 3 ? "text-red-600" : remainingDays <= 7 ? "text-amber-600" : "text-green-600"
                    )}>
                      {remainingDays === 0 ? "Berakhir hari ini" : `${remainingDays} hari lagi`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full transition-all",
                      remainingDays <= 3 ? "bg-red-500" : remainingDays <= 7 ? "bg-amber-500" : "bg-green-500"
                    )} style={{ width: `${Math.max(0, Math.min(100, (remainingDays / 30) * 100))}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    Berakhir: {new Date(l.paymentExpiry).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              )}
            </div>
          )}
          {/* Bottom — 2 rows of buttons */}
          <div className="mt-auto space-y-1.5 border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
            {/* Row 1: Views + Approve */}
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Eye className="size-3" /> {l.views?.toLocaleString("id-ID") || 0}
              </span>
              <button onClick={() => setStatus.mutate({ id: l.id, status: "active" })} className="rounded-md border border-orange-500 bg-orange-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-orange-600 hover:border-orange-600">
                Publikasi
              </button>
            </div>
            {/* Row 2: Pelanggaran + Hapus */}
            <div className="flex items-center gap-1">
              <button onClick={() => setViolation.mutate({ id: l.id, flag: !l.violationFlag, reason: tr("admViolationReason") })} className={cn("flex-1 rounded-md border px-2 py-1 text-[10px] font-bold transition text-center",
                l.violationFlag ? "border-yellow-600 bg-yellow-500 text-white" : "border-yellow-400 bg-yellow-400 text-yellow-900 hover:bg-yellow-500 hover:border-yellow-500"
              )}>
                {l.violationFlag ? "Batal" : "Pelanggaran"}
              </button>
              <button onClick={() => setDeleteId(l.id)} className="flex-1 rounded-md border border-red-500 bg-red-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-red-600 hover:border-red-600">
                Hapus
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Line Card ---
  const renderLineCard = (l: any) => {
    const img = l.images?.[0];
    const pkg = getPkgBadge(l.packageType);
    const { days: remainingDays, expired } = getRemainingDaysAdmin(l.paymentExpiry);

    return (
      <div
        key={l.id}
        onClick={() => openPreview(l)}
        className={cn("group flex cursor-pointer gap-3 border-b border-border p-3 transition hover:bg-accent/50", l.violationFlag && "bg-red-50")}
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
          {img ? <img src={img} alt={l.title} className="size-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-6" /></div>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">{l.title}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{l.seller?.name} · {l.category?.name} · {l.city}</p>
            </div>
            <p className="shrink-0 text-sm font-bold text-primary">{formatRupiahFull(l.price)}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm", l.status === "active" ? "bg-green-500" : "bg-red-500")}>
              {l.status === "active" ? <CheckCircle2 className="size-2.5" /> : <AlertTriangle className="size-2.5" />}
              {l.status === "active" ? "Aktif" : l.status}
            </span>
            <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", pkg.bg)}>{pkg.name}</span>
            {l.paymentExpiry && l.paymentStatus === "paid" && (
              <span className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                expired ? "bg-red-50 text-red-600" : remainingDays <= 3 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"
              )}>
                <Timer className="size-2.5" />
                {expired ? "Non Aktif" : remainingDays === 0 ? "Berakhir hari ini" : `${remainingDays} hari lagi`}
              </span>
            )}
          </div>
          <div className="mt-auto space-y-1.5 pt-2" onClick={(e) => e.stopPropagation()}>
            {/* Row 1: Views + Approve */}
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Eye className="size-3" /> {l.views?.toLocaleString("id-ID") || 0}</span>
              <button onClick={() => setStatus.mutate({ id: l.id, status: "active" })} className="rounded-md border border-orange-500 bg-orange-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-orange-600 hover:border-orange-600">Publikasi</button>
            </div>
            {/* Row 2: Pelanggaran + Hapus */}
            <div className="flex items-center gap-1">
              <button onClick={() => setViolation.mutate({ id: l.id, flag: !l.violationFlag, reason: tr("admViolationReason") })} className={cn("flex-1 rounded-md border px-2 py-1 text-[10px] font-bold transition text-center",
                l.violationFlag ? "border-yellow-600 bg-yellow-500 text-white" : "border-yellow-400 bg-yellow-400 text-yellow-900 hover:bg-yellow-500 hover:border-yellow-500"
              )}>{l.violationFlag ? "Batal" : "Pelanggaran"}</button>
              <button onClick={() => setDeleteId(l.id)} className="flex-1 rounded-md border border-red-500 bg-red-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-red-600 hover:border-red-600">Hapus</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Iklan Aktif ({allListings.length})</h2>

      {/* Package Tabs */}
      <div className="overflow-x-auto gomesin-scroll">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {ADMIN_PKG_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <tab.icon className="size-3.5" />
                <span>{tab.label}</span>
                <span className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar: Search + View Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari iklan..."
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-56"
            />
          </div>
          <span className="text-xs text-muted-foreground">{listings.length} iklan</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button type="button" onClick={() => setViewMode("grid")}
              className={cn("grid size-9 place-items-center transition", viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Grid"><LayoutGrid className="size-4" /></button>
            <button type="button" onClick={() => setViewMode("line")}
              className={cn("grid size-9 place-items-center border-l border-border transition", viewMode === "line" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Line"><List className="size-4" /></button>
          </div>
        </div>
      </div>

      {/* Results */}
      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Frown className="size-12 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">Tidak ada iklan</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tidak ditemukan iklan untuk tab ini.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{listings.map(renderGridCard)}</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">{listings.map(renderLineCard)}</div>
      )}

      {/* Info hint */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        <ShieldCheck className="mr-1 inline size-4" />
        {tr("admListingHint")}
      </div>

      {/* PREVIEW DIALOG */}
      {previewListing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewListing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="line-clamp-1 text-base font-bold">{previewListing.title}</h3>
              <button onClick={() => setPreviewListing(null)} className="grid size-8 place-items-center rounded-lg hover:bg-accent"><XCircle className="size-5" /></button>
            </div>
            {/* gallery */}
            <div className="p-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                {previewListing.images?.[activeImg] ? (
                  <img src={previewListing.images[activeImg]} alt={previewListing.title} className="size-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">Tidak ada gambar</div>
                )}
                {previewListing.images?.length > 1 && (
                  <>
                    <button onClick={() => setActiveImg((p) => (p - 1 + previewListing.images.length) % previewListing.images.length)} className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white"><ChevronLeft className="size-4" /></button>
                    <button onClick={() => setActiveImg((p) => (p + 1) % previewListing.images.length)} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white"><ChevronRight className="size-4" /></button>
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{activeImg + 1} / {previewListing.images.length}</span>
                  </>
                )}
              </div>
              {/* thumbnails */}
              {previewListing.images?.length > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
                  {previewListing.images.map((img: string, i: number) => (
                    <button key={i} onClick={() => setActiveImg(i)}
                      className={cn("relative size-14 shrink-0 overflow-hidden rounded-lg border-2", i === activeImg ? "border-primary" : "border-transparent opacity-60 hover:opacity-100")}
                    >
                      <img src={img} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {/* info */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={previewListing.status === "active" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}>{previewListing.status}</Badge>
                  <Badge className={previewListing.paymentStatus === "paid" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}>{previewListing.paymentStatus === "paid" ? "Lunas" : "Belum Bayar"}</Badge>
                  {previewListing.condition === "baru" ? <Badge className="bg-primary">Baru</Badge> : <Badge className="bg-orange-600">Bekas</Badge>}
                  {previewListing.featured && <Badge className="bg-amber-500">Featured</Badge>}
                  <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold", getPkgBadge(previewListing.packageType).bg)}>{getPkgBadge(previewListing.packageType).name}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
                  <DollarSign className="size-4 text-orange-600" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Harga Pasang Iklan</p>
                    <p className="text-lg font-bold text-orange-600">{formatAdFee(previewListing.adFee)}</p>
                  </div>
                  <Badge className={cn("ml-auto", previewListing.paymentStatus === "paid" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700")}>{previewListing.paymentStatus === "paid" ? "Lunas" : "Belum Bayar"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{previewListing.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Kategori:</span> {previewListing.category?.name}</div>
                  <div><span className="text-muted-foreground">Brand:</span> {previewListing.brand || "-"}</div>
                  <div><span className="text-muted-foreground">Lokasi:</span> {previewListing.city}, {previewListing.province}</div>
                  <div><span className="text-muted-foreground">Penjual:</span> {previewListing.seller?.name}</div>
                  <div><span className="text-muted-foreground">Views:</span> {previewListing.views?.toLocaleString("id-ID")}</div>
                  <div><span className="text-muted-foreground">Tahun:</span> {previewListing.yearProduced || "-"}</div>
                </div>
                {previewListing.violationFlag && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600">
                    ⚠ Ditandai pelanggaran: {previewListing.violationReason || tr("admViolationReason")}
                  </div>
                )}
              </div>
              {/* actions */}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button size="sm" variant="default" onClick={() => { setStatus.mutate({ id: previewListing.id, status: "active" }); setPreviewListing(null); }}><CheckCircle2 className="size-4" /> Publikasi</Button>
                <Button size="sm" variant="outline" onClick={() => { setViolation.mutate({ id: previewListing.id, flag: !previewListing.violationFlag, reason: tr("admViolationReason") }); setPreviewListing(null); }}><XCircle className="size-4" /> {previewListing.violationFlag ? "Hapus Pelanggaran" : "Tandai Pelanggaran"}</Button>
                <Button size="sm" variant="destructive" onClick={() => { del.mutate(previewListing.id); setPreviewListing(null); }}><Trash2 className="size-4" /> Hapus Iklan</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Iklan?</AlertDialogTitle>
            <AlertDialogDescription>Iklan yang dihapus tidak dapat dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { if (deleteId) del.mutate(deleteId); setDeleteId(null); }}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ IKLAN BARU TAB (unpaid / pending verification) ============
function IklanBaruTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const qc = useQueryClient();
  const { broadcastListings } = useChatSocket();
  const { data, isLoading } = useQuery({ queryKey: ["admin-listings"], queryFn: () => fetchJson("/api/admin/listings"), ...RT });
  const [previewListing, setPreviewListing] = useState<any>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminPkgTabKey>("all");
  const [viewMode, setViewMode] = useState<"grid" | "line">("grid");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteCallback, setDeleteCallback] = useState<(() => void) | null>(null);
  const [search, setSearch] = useState("");
  // Helper — invalidate BOTH admin-listings AND public ["listings"] (Beranda),
  // then fire a socket broadcast so any open homepage refetches in realtime.
  const invalidateAllListings = () => {
    qc.invalidateQueries({ queryKey: ["admin-listings"] });
    qc.invalidateQueries({ queryKey: ["listings"] });
    broadcastListings();
  };
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => fetch("/api/admin/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }),
    onSuccess: () => { toast.success(tr("admListingStatusUpdated")); invalidateAllListings(); },
  });
  const del = useMutation({
    mutationFn: (id: string) => fetch("/api/admin/listings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }),
    // Optimistic update: remove the listing from cache IMMEDIATELY so the UI
    // updates instantly (0ms delay). If the API fails, rollback.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["admin-listings"] });
      const prev = qc.getQueryData<any>(["admin-listings"]);
      qc.setQueryData<any>(["admin-listings"], (old: any) => {
        if (!old?.listings) return old;
        return { ...old, listings: old.listings.filter((l: any) => l.id !== id) };
      });
      qc.setQueryData<any>(["listings"], (old: any) => {
        if (!old?.listings) return old;
        return { ...old, listings: old.listings.filter((l: any) => l.id !== id), total: Math.max(0, (old.total || 0) - 1) };
      });
      return { prev };
    },
    onSuccess: () => { toast.success(tr("admDeleted")); invalidateAllListings(); },
    onError: (_e: any, _id: string, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["admin-listings"], ctx.prev);
      toast.error("Gagal menghapus iklan");
    },
  });

  // New ads = unpublished (pending OR draft). Both have not been published yet.
  const newListings = useMemo(() => (data?.listings || []).filter((l: any) => l.status === "pending" || l.status === "draft"), [data?.listings]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: newListings.length };
    for (const tab of ADMIN_PKG_TABS) {
      if (tab.key !== "all") c[tab.key] = newListings.filter((l: any) => l.packageType === tab.key).length;
    }
    return c;
  }, [newListings]);

  // Filter by tab + search
  const listings = useMemo(() => {
    let filtered = activeTab === "all" ? newListings : newListings.filter((l: any) => l.packageType === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((l: any) =>
        l.title?.toLowerCase().includes(q) ||
        l.seller?.name?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.category?.name?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [newListings, activeTab, search]);

  if (isLoading || !data) return <SkeletonGrid count={3} />;

  const approve = (id: string) => {
    setStatus.mutate({ id, status: "active" });
  };
  const reject = (id: string) => {
    if (confirm(tr("admRejectConfirm"))) {
      setStatus.mutate({ id, status: "rejected" });
    }
  };

  const openPreview = (l: any) => { setPreviewListing(l); setActiveImg(0); };

  // --- Grid Card ---
  const renderGridCard = (l: any) => {
    const img = l.images?.[0];
    const imgs = l.images || [];
    const pkg = getPkgBadge(l.packageType);

    return (
      <div
        key={l.id}
        onClick={() => openPreview(l)}
        className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-amber-300 bg-card transition hover:shadow-lg"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {img ? (
            <img src={img} alt={l.title} className="size-full object-cover transition group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-8" /></div>
          )}
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow">
            Menunggu Verifikasi
          </span>
          <span className={cn("absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold", pkg.bg)}>
            {pkg.name}
          </span>
          {imgs.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">📷 {imgs.length}</span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <p className="text-sm font-bold text-primary">{formatRupiahFull(l.price)}</p>
          <h3 className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-foreground">{l.title}</h3>
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" /> {l.city}{l.seller?.name ? ` · ${l.seller.name}` : ""}
          </div>
          {/* Bottom — 2 rows of buttons */}
          <div className="mt-auto space-y-1.5 border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
            {/* Row 1: Viewer + Publikasi */}
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Eye className="size-3" /> {l.views?.toLocaleString("id-ID") || 0}
              </span>
              <button onClick={() => approve(l.id)} className="flex items-center gap-1 rounded-md border border-blue-500 bg-blue-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-blue-600 hover:border-blue-600">
                <CheckCircle2 className="size-3" /> Publikasi
              </button>
            </div>
            {/* Row 2: Tolak + Hapus */}
            <div className="flex items-center gap-1">
              <button onClick={() => reject(l.id)} className="flex-1 flex items-center justify-center gap-1 rounded-md border border-red-500 bg-red-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-red-600 hover:border-red-600">
                <XCircle className="size-3" /> Tolak
              </button>
              <button onClick={() => setDeleteId(l.id)} className="flex-1 flex items-center justify-center gap-1 rounded-md border border-gray-500 bg-gray-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-gray-600 hover:border-gray-600">
                <Trash2 className="size-3" /> Hapus
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Line Card ---
  const renderLineCard = (l: any) => {
    const img = l.images?.[0];
    const pkg = getPkgBadge(l.packageType);

    return (
      <div
        key={l.id}
        onClick={() => openPreview(l)}
        className="group flex cursor-pointer gap-3 border-b border-border p-3 transition hover:bg-accent/50"
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
          {img ? <img src={img} alt={l.title} className="size-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-6" /></div>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">{l.title}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{l.seller?.name} · {l.category?.name} · {l.city}</p>
            </div>
            <p className="shrink-0 text-sm font-bold text-primary">{formatRupiahFull(l.price)}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
              <Clock className="size-2.5" /> Menunggu Verifikasi
            </span>
            <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", pkg.bg)}>{pkg.name}</span>
          </div>
          {/* Bottom — 2 rows of buttons */}
          <div className="mt-auto space-y-1.5 pt-2" onClick={(e) => e.stopPropagation()}>
            {/* Row 1: Viewer + Publikasi */}
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Eye className="size-3" /> {l.views?.toLocaleString("id-ID") || 0} dilihat
              </span>
              <button onClick={() => approve(l.id)} className="flex items-center gap-1 rounded-md border border-blue-500 bg-blue-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-blue-600 hover:border-blue-600">
                <CheckCircle2 className="size-3" /> Publikasi
              </button>
            </div>
            {/* Row 2: Tolak + Hapus */}
            <div className="flex items-center gap-1">
              <button onClick={() => reject(l.id)} className="flex-1 flex items-center justify-center gap-1 rounded-md border border-red-500 bg-red-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-red-600 hover:border-red-600">
                <XCircle className="size-3" /> Tolak
              </button>
              <button onClick={() => setDeleteId(l.id)} className="flex-1 flex items-center justify-center gap-1 rounded-md border border-gray-500 bg-gray-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-gray-600 hover:border-gray-600">
                <Trash2 className="size-3" /> Hapus
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Iklan Baru — Perlu Verifikasi ({newListings.length})</h2>

      {/* Package Tabs */}
      <div className="overflow-x-auto gomesin-scroll">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {ADMIN_PKG_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <tab.icon className="size-3.5" />
                <span>{tab.label}</span>
                <span className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar: Search + View Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari iklan..."
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-56"
            />
          </div>
          <span className="text-xs text-muted-foreground">{listings.length} iklan</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button type="button" onClick={() => setViewMode("grid")}
              className={cn("grid size-9 place-items-center transition", viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Grid"><LayoutGrid className="size-4" /></button>
            <button type="button" onClick={() => setViewMode("line")}
              className={cn("grid size-9 place-items-center border-l border-border transition", viewMode === "line" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Line"><List className="size-4" /></button>
          </div>
        </div>
      </div>

      {/* Results */}
      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Frown className="size-12 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">Tidak ada iklan baru</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tidak ditemukan iklan menunggu verifikasi untuk tab ini.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{listings.map(renderGridCard)}</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">{listings.map(renderLineCard)}</div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        <Sparkle className="mr-1 inline size-4" />
        {tr("admNewAdsHint")}
      </div>

      {/* PREVIEW DIALOG */}
      {previewListing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewListing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="line-clamp-1 text-base font-bold">{previewListing.title}</h3>
              <button onClick={() => setPreviewListing(null)} className="grid size-8 place-items-center rounded-lg hover:bg-accent"><XCircle className="size-5" /></button>
            </div>
            <div className="p-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                {previewListing.images?.[activeImg] && (
                  <img src={previewListing.images[activeImg]} alt={previewListing.title} className="size-full object-cover" />
                )}
                {previewListing.images?.length > 1 && (
                  <>
                    <button onClick={() => setActiveImg((p) => (p - 1 + previewListing.images.length) % previewListing.images.length)} className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white"><ChevronLeft className="size-4" /></button>
                    <button onClick={() => setActiveImg((p) => (p + 1) % previewListing.images.length)} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white"><ChevronRight className="size-4" /></button>
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{activeImg + 1} / {previewListing.images.length}</span>
                  </>
                )}
              </div>
              {previewListing.images?.length > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
                  {previewListing.images.map((img: string, i: number) => (
                    <button key={i} onClick={() => setActiveImg(i)} className={cn("relative size-14 shrink-0 overflow-hidden rounded-lg border-2", i === activeImg ? "border-primary" : "border-transparent opacity-60")}>
                      <img src={img} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={previewListing.paymentStatus === "paid" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}>{previewListing.paymentStatus === "paid" ? "Lunas" : "Belum Bayar"}</Badge>
                  <Badge className="bg-blue-100 text-blue-700">{previewListing.status}</Badge>
                  {previewListing.condition === "baru" ? <Badge className="bg-primary">Baru</Badge> : <Badge className="bg-orange-600">Bekas</Badge>}
                  <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold", getPkgBadge(previewListing.packageType).bg)}>{getPkgBadge(previewListing.packageType).name}</span>
                </div>
                <p className="text-2xl font-bold text-primary">{formatRupiahFull(previewListing.price)}</p>
                <p className="text-sm text-muted-foreground">{previewListing.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Kategori:</span> {previewListing.category?.name}</div>
                  <div><span className="text-muted-foreground">Brand:</span> {previewListing.brand || "-"}</div>
                  <div><span className="text-muted-foreground">Lokasi:</span> {previewListing.city}, {previewListing.province}</div>
                  <div><span className="text-muted-foreground">Penjual:</span> {previewListing.seller?.name}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button size="sm" variant="default" onClick={() => { setStatus.mutate({ id: previewListing.id, status: "active" }); setPreviewListing(null); }}><CheckCircle2 className="size-4" /> Publikasi</Button>
                <Button size="sm" variant="destructive" onClick={() => { setStatus.mutate({ id: previewListing.id, status: "rejected" }); setPreviewListing(null); }}><XCircle className="size-4" /> Tolak Iklan</Button>
                <Button size="sm" variant="outline" onClick={() => { setDeleteId(previewListing.id); }}><Trash2 className="size-4" /> Hapus Iklan</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Iklan?</AlertDialogTitle>
            <AlertDialogDescription>Iklan yang dihapus tidak dapat dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { if (deleteId) del.mutate(deleteId); setDeleteId(null); }}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ IKLAN EXPIRED TAB (paymentExpiry < now) =============
function IklanExpiredTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-listings"], queryFn: () => fetchJson("/api/admin/listings"), ...RT });
  const [previewListing, setPreviewListing] = useState<any>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminPkgTabKey>("all");
  const [viewMode, setViewMode] = useState<"grid" | "line">("grid");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteCallback, setDeleteCallback] = useState<(() => void) | null>(null);
  const [search, setSearch] = useState("");
  const renew = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => fetch("/api/admin/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "active", paymentExpiry: new Date(Date.now() + days * 86400000).toISOString() }) }),
    onSuccess: () => { toast.success(tr("admExtended")); qc.invalidateQueries({ queryKey: ["admin-listings"] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => fetch("/api/admin/listings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }),
    onSuccess: () => { toast.success(tr("admDeleted")); qc.invalidateQueries({ queryKey: ["admin-listings"] }); },
  });

  const expiredListings = useMemo(() => {
    const now = new Date();
    return (data?.listings || []).filter((l: any) => {
      if (!l.paymentExpiry) return false;
      return new Date(l.paymentExpiry) < now;
    });
  }, [data?.listings]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };

  // Tab counts
  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: expiredListings.length };
    for (const tab of ADMIN_PKG_TABS) {
      if (tab.key !== "all") c[tab.key] = expiredListings.filter((l: any) => l.packageType === tab.key).length;
    }
    return c;
  }, [expiredListings]);

  // Filter by tab + search
  const listings = useMemo(() => {
    let filtered = activeTab === "all" ? expiredListings : expiredListings.filter((l: any) => l.packageType === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((l: any) =>
        l.title?.toLowerCase().includes(q) ||
        l.seller?.name?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.category?.name?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [expiredListings, activeTab, search]);

  if (isLoading || !data) return <SkeletonGrid count={3} />;

  const openPreview = (l: any) => { setPreviewListing(l); setActiveImg(0); };

  // --- Grid Card ---
  const renderGridCard = (l: any) => {
    const img = l.images?.[0];
    const pkg = getPkgBadge(l.packageType);

    return (
      <div
        key={l.id}
        onClick={() => openPreview(l)}
        className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-red-300 bg-card transition hover:shadow-lg"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {img ? (
            <img src={img} alt={l.title} className="size-full object-cover transition group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-8" /></div>
          )}
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            <Clock className="size-3" /> Expired
          </span>
          <span className={cn("absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold", pkg.bg)}>
            {pkg.name}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <p className="text-sm font-bold text-primary">{formatRupiahFull(l.price)}</p>
          <h3 className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-foreground">{l.title}</h3>
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" /> {l.city}{l.seller?.name ? ` · ${l.seller.name}` : ""}
          </div>
          {l.paymentExpiry && (
            <p className="mt-1 text-[10px] text-muted-foreground">Berakhir: {fmtDate(l.paymentExpiry)}</p>
          )}
          <div className="mt-auto flex items-center justify-between border-t border-border pt-2">
            <span className="text-[10px] text-muted-foreground">{l.seller?.name}</span>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => renew.mutate({ id: l.id, days: 30 })} className="grid size-7 place-items-center rounded-md border border-border bg-background text-orange-600 transition hover:bg-orange-500 hover:text-white hover:border-orange-500" title="Perpanjang 30 hari">
                <RefreshCw className="size-3" />
              </button>
              <button onClick={() => { setDeleteId(l.id); }} className="grid size-7 place-items-center rounded-md border border-destructive/30 bg-background text-destructive transition hover:bg-destructive hover:text-white hover:border-destructive" title={tr("admDelete")}>
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Line Card ---
  const renderLineCard = (l: any) => {
    const img = l.images?.[0];
    const pkg = getPkgBadge(l.packageType);

    return (
      <div
        key={l.id}
        onClick={() => openPreview(l)}
        className="group flex cursor-pointer gap-3 border-b border-border p-3 transition hover:bg-accent/50"
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
          {img ? <img src={img} alt={l.title} className="size-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-6" /></div>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">{l.title}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{l.seller?.name} · {l.category?.name} · {l.city}</p>
            </div>
            <p className="shrink-0 text-sm font-bold text-primary">{formatRupiahFull(l.price)}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
              <Clock className="size-2.5" /> Expired
            </span>
            <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", pkg.bg)}>{pkg.name}</span>
            {l.paymentExpiry && <span className="text-[10px] text-muted-foreground">Berakhir: {fmtDate(l.paymentExpiry)}</span>}
          </div>
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="text-[10px] text-muted-foreground">{l.seller?.name}</span>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => renew.mutate({ id: l.id, days: 30 })} className="grid size-7 place-items-center rounded-md border border-border bg-background text-orange-600 transition hover:bg-orange-500 hover:text-white hover:border-orange-500" title="Perpanjang 30 hari"><RefreshCw className="size-3" /></button>
              <button onClick={() => { setDeleteId(l.id); }} className="grid size-7 place-items-center rounded-md border border-destructive/30 bg-background text-destructive transition hover:bg-destructive hover:text-white hover:border-destructive" title={tr("admDelete")}><Trash2 className="size-3" /></button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Iklan Expired — Perlu Perpanjangan ({expiredListings.length})</h2>

      {/* Package Tabs */}
      <div className="overflow-x-auto gomesin-scroll">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {ADMIN_PKG_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <tab.icon className="size-3.5" />
                <span>{tab.label}</span>
                <span className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar: Search + View Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari iklan..."
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-56"
            />
          </div>
          <span className="text-xs text-muted-foreground">{listings.length} iklan</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button type="button" onClick={() => setViewMode("grid")}
              className={cn("grid size-9 place-items-center transition", viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Grid"><LayoutGrid className="size-4" /></button>
            <button type="button" onClick={() => setViewMode("line")}
              className={cn("grid size-9 place-items-center border-l border-border transition", viewMode === "line" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Line"><List className="size-4" /></button>
          </div>
        </div>
      </div>

      {/* Results */}
      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Frown className="size-12 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">Tidak ada iklan expired</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tidak ditemukan iklan expired untuk tab ini.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{listings.map(renderGridCard)}</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">{listings.map(renderLineCard)}</div>
      )}

      <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-700">
        <Clock className="mr-1 inline size-4" />
        Iklan expired adalah iklan yang masa tayangnya sudah habis (paymentExpiry terlewati). Perpanjang untuk aktifkan kembali, atau hapus jika tidak diperlukan.
      </div>

      {/* PREVIEW DIALOG */}
      {previewListing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewListing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="line-clamp-1 text-base font-bold">{previewListing.title}</h3>
              <button onClick={() => setPreviewListing(null)} className="grid size-8 place-items-center rounded-lg hover:bg-accent"><XCircle className="size-5" /></button>
            </div>
            <div className="p-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                {previewListing.images?.[activeImg] && (
                  <img src={previewListing.images[activeImg]} alt={previewListing.title} className="size-full object-cover" />
                )}
                {previewListing.images?.length > 1 && (
                  <>
                    <button onClick={() => setActiveImg((p) => (p - 1 + previewListing.images.length) % previewListing.images.length)} className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white"><ChevronLeft className="size-4" /></button>
                    <button onClick={() => setActiveImg((p) => (p + 1) % previewListing.images.length)} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white"><ChevronRight className="size-4" /></button>
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{activeImg + 1} / {previewListing.images.length}</span>
                  </>
                )}
              </div>
              {previewListing.images?.length > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
                  {previewListing.images.map((img: string, i: number) => (
                    <button key={i} onClick={() => setActiveImg(i)} className={cn("relative size-14 shrink-0 overflow-hidden rounded-lg border-2", i === activeImg ? "border-primary" : "border-transparent opacity-60")}>
                      <img src={img} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-100 text-red-700"><Clock className="mr-0.5 size-3" /> Expired</Badge>
                  {previewListing.paymentExpiry && <span className="text-xs text-muted-foreground">Berakhir: {fmtDate(previewListing.paymentExpiry)}</span>}
                </div>
                <p className="text-2xl font-bold text-primary">{formatRupiahFull(previewListing.price)}</p>
                <p className="text-sm text-muted-foreground">{previewListing.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Kategori:</span> {previewListing.category?.name}</div>
                  <div><span className="text-muted-foreground">Brand:</span> {previewListing.brand || "-"}</div>
                  <div><span className="text-muted-foreground">Lokasi:</span> {previewListing.city}, {previewListing.province}</div>
                  <div><span className="text-muted-foreground">Penjual:</span> {previewListing.seller?.name}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button size="sm" variant="default" onClick={() => { renew.mutate({ id: previewListing.id, days: 30 }); setPreviewListing(null); }}><RefreshCw className="size-4" /> Perpanjang 30 Hari</Button>
                <Button size="sm" variant="outline" onClick={() => { renew.mutate({ id: previewListing.id, days: 90 }); setPreviewListing(null); }}><RefreshCw className="size-4" /> Perpanjang 90 Hari</Button>
                <Button size="sm" variant="destructive" onClick={() => { del.mutate(previewListing.id); setPreviewListing(null); }}><Trash2 className="size-4" /> Hapus Iklan</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Iklan?</AlertDialogTitle>
            <AlertDialogDescription>Iklan yang dihapus tidak dapat dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { if (deleteId) del.mutate(deleteId); setDeleteId(null); }}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ IKLAN DITOLAK TAB ============
function IklanDitolakTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-listings"], queryFn: () => fetchJson("/api/admin/listings"), ...RT });
  const [previewListing, setPreviewListing] = useState<any>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminPkgTabKey>("all");
  const [viewMode, setViewMode] = useState<"grid" | "line">("grid");
  const [search, setSearch] = useState("");
  const restore = useMutation({
    mutationFn: ({ id }: { id: string }) => fetch("/api/admin/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "active", violationFlag: false, violationReason: null }) }),
    // Optimistic: remove from Iklan Ditolak instantly (status → active).
    onMutate: async ({ id }: { id: string }) => {
      await qc.cancelQueries({ queryKey: ["admin-listings"] });
      const prev = qc.getQueryData<any>(["admin-listings"]);
      qc.setQueryData<any>(["admin-listings"], (old: any) => {
        if (!old?.listings) return old;
        return {
          ...old,
          listings: old.listings.filter((l: any) => l.id !== id),
        };
      });
      return { prev };
    },
    onSuccess: () => { toast.success(tr("admRestored")); qc.invalidateQueries({ queryKey: ["admin-listings"] }); },
    onError: (_e: any, _vars: any, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["admin-listings"], ctx.prev);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => fetch("/api/admin/listings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }),
    onSuccess: () => { toast.success(tr("admDeletedPermanent")); qc.invalidateQueries({ queryKey: ["admin-listings"] }); },
  });

  const rejectedListings = useMemo(() => (data?.listings || []).filter((l: any) => l.status === "rejected" || l.violationFlag === true), [data?.listings]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: rejectedListings.length };
    for (const tab of ADMIN_PKG_TABS) {
      if (tab.key !== "all") c[tab.key] = rejectedListings.filter((l: any) => l.packageType === tab.key).length;
    }
    return c;
  }, [rejectedListings]);

  // Filter by tab + search
  const listings = useMemo(() => {
    let filtered = activeTab === "all" ? rejectedListings : rejectedListings.filter((l: any) => l.packageType === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((l: any) =>
        l.title?.toLowerCase().includes(q) ||
        l.seller?.name?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.category?.name?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [rejectedListings, activeTab, search]);

  if (isLoading || !data) return <SkeletonGrid count={3} />;

  const openPreview = (l: any) => { setPreviewListing(l); setActiveImg(0); };

  // --- Grid Card ---
  const renderGridCard = (l: any) => {
    const img = l.images?.[0];
    const pkg = getPkgBadge(l.packageType);

    return (
      <div
        key={l.id}
        onClick={() => openPreview(l)}
        className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-red-400 bg-card transition hover:shadow-lg"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {img ? (
            <img src={img} alt={l.title} className="size-full object-cover transition group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-8" /></div>
          )}
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            <XCircle className="size-3" /> Ditolak
          </span>
          <span className={cn("absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold", pkg.bg)}>
            {pkg.name}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <p className="text-sm font-bold text-primary">{formatRupiahFull(l.price)}</p>
          <h3 className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-foreground">{l.title}</h3>
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" /> {l.city}{l.seller?.name ? ` · ${l.seller.name}` : ""}
          </div>
          {l.violationReason && (
            <p className="mt-1 text-[10px] text-red-600">{l.violationReason}</p>
          )}
          <div className="mt-auto flex items-center justify-end gap-1.5 border-t border-border pt-2">
            <div className="flex w-full gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => restore.mutate({ id: l.id })} className="flex-1 flex items-center justify-center gap-1 rounded-md border border-blue-500 bg-blue-500 px-2 py-1.5 text-[10px] font-bold text-white transition hover:bg-blue-600 hover:border-blue-600">
                <CheckCircle2 className="size-3" /> Pulihkan
              </button>
              <button onClick={() => { if (confirm("Hapus permanen?")) del.mutate(l.id); }} className="flex-1 flex items-center justify-center gap-1 rounded-md border border-orange-500 bg-orange-500 px-2 py-1.5 text-[10px] font-bold text-white transition hover:bg-orange-600 hover:border-orange-600">
                <Trash2 className="size-3" /> Hapus
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Line Card ---
  const renderLineCard = (l: any) => {
    const img = l.images?.[0];
    const pkg = getPkgBadge(l.packageType);

    return (
      <div
        key={l.id}
        onClick={() => openPreview(l)}
        className="group flex cursor-pointer gap-3 border-b border-red-200 p-3 transition hover:bg-red-50/50"
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
          {img ? <img src={img} alt={l.title} className="size-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-6" /></div>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">{l.title}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{l.seller?.name} · {l.category?.name} · {l.city}</p>
            </div>
            <p className="shrink-0 text-sm font-bold text-primary">{formatRupiahFull(l.price)}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
              <XCircle className="size-2.5" /> Ditolak
            </span>
            <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", pkg.bg)}>{pkg.name}</span>
            {l.violationReason && <span className="text-[10px] text-red-600">{l.violationReason}</span>}
          </div>
          <div className="mt-auto flex items-center justify-end gap-1.5 pt-2">
            <div className="flex w-full gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => restore.mutate({ id: l.id })} className="flex-1 flex items-center justify-center gap-1 rounded-md border border-blue-500 bg-blue-500 px-2 py-1.5 text-[10px] font-bold text-white transition hover:bg-blue-600 hover:border-blue-600">
                <CheckCircle2 className="size-3" /> Pulihkan
              </button>
              <button onClick={() => { if (confirm("Hapus permanen?")) del.mutate(l.id); }} className="flex-1 flex items-center justify-center gap-1 rounded-md border border-orange-500 bg-orange-500 px-2 py-1.5 text-[10px] font-bold text-white transition hover:bg-orange-600 hover:border-orange-600">
                <Trash2 className="size-3" /> Hapus
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Iklan Ditolak ({rejectedListings.length})</h2>

      {/* Package Tabs */}
      <div className="overflow-x-auto gomesin-scroll">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {ADMIN_PKG_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <tab.icon className="size-3.5" />
                <span>{tab.label}</span>
                <span className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar: Search + View Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari iklan..."
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-56"
            />
          </div>
          <span className="text-xs text-muted-foreground">{listings.length} iklan</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button type="button" onClick={() => setViewMode("grid")}
              className={cn("grid size-9 place-items-center transition", viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Grid"><LayoutGrid className="size-4" /></button>
            <button type="button" onClick={() => setViewMode("line")}
              className={cn("grid size-9 place-items-center border-l border-border transition", viewMode === "line" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
              aria-label="Line"><List className="size-4" /></button>
          </div>
        </div>
      </div>

      {/* Results */}
      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Frown className="size-12 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">Tidak ada iklan ditolak</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tidak ditemukan iklan ditolak untuk tab ini.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{listings.map(renderGridCard)}</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">{listings.map(renderLineCard)}</div>
      )}

      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        <XCircle className="mr-1 inline size-4" />
        Iklan ditolak karena melanggar ketentuan atau ditolak admin. Pulihkan untuk tayang kembali, atau hapus permanen.
      </div>

      {/* PREVIEW DIALOG */}
      {previewListing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewListing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="line-clamp-1 text-base font-bold">{previewListing.title}</h3>
              <button onClick={() => setPreviewListing(null)} className="grid size-8 place-items-center rounded-lg hover:bg-accent"><XCircle className="size-5" /></button>
            </div>
            <div className="p-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                {previewListing.images?.[activeImg] && (
                  <img src={previewListing.images[activeImg]} alt={previewListing.title} className="size-full object-cover" />
                )}
                {previewListing.images?.length > 1 && (
                  <>
                    <button onClick={() => setActiveImg((p) => (p - 1 + previewListing.images.length) % previewListing.images.length)} className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white"><ChevronLeft className="size-4" /></button>
                    <button onClick={() => setActiveImg((p) => (p + 1) % previewListing.images.length)} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white"><ChevronRight className="size-4" /></button>
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{activeImg + 1} / {previewListing.images.length}</span>
                  </>
                )}
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-100 text-red-700"><XCircle className="mr-0.5 size-3" /> Ditolak</Badge>
                  {previewListing.violationReason && <span className="text-xs text-red-600">Alasan: {previewListing.violationReason}</span>}
                </div>
                <p className="text-sm text-muted-foreground">{previewListing.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Kategori:</span> {previewListing.category?.name}</div>
                  <div><span className="text-muted-foreground">Penjual:</span> {previewListing.seller?.name}</div>
                  <div><span className="text-muted-foreground">Lokasi:</span> {previewListing.city}, {previewListing.province}</div>
                  <div><span className="text-muted-foreground">Harga:</span> {formatRupiahFull(previewListing.price)}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button size="sm" variant="default" onClick={() => { restore.mutate({ id: previewListing.id }); setPreviewListing(null); }}><CheckCircle2 className="size-4" /> Pulihkan & Tayangkan</Button>
                <Button size="sm" variant="destructive" onClick={() => { if (confirm("Hapus permanen?")) { del.mutate(previewListing.id); setPreviewListing(null); } }}><Trash2 className="size-4" /> Hapus Permanen</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ PENJUAL TAB ============
function PenjualTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-sellers"], queryFn: () => fetchJson("/api/admin/sellers"), ...RT });
  const toggle = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) => fetch("/api/admin/sellers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, verified }) }),
    onSuccess: () => { toast.success(tr("admSellerStatusUpdated")); qc.invalidateQueries({ queryKey: ["admin-sellers"] }); },
  });
  if (isLoading || !data) return <SkeletonGrid count={3} />;
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Verifikasi Penjual ({data.sellers.length})</h2>
      <div className="space-y-2">
        {data.sellers.map((s: any) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{s.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1"><p className="truncate text-sm font-semibold">{s.name}</p>{s.verified && <BadgeCheck className="size-4 shrink-0 text-primary" />}</div>
              <p className="truncate text-xs text-muted-foreground">{s.phone} · {s.city}, {s.province}</p>
              <p className="text-[10px] text-muted-foreground">{s.listingCount} iklan · ⭐ {s.rating} ({s.reviewCount} ulasan)</p>
            </div>
            <Button size="sm" variant={s.verified ? "outline" : "default"} onClick={() => toggle.mutate({ id: s.id, verified: !s.verified })}>
              {s.verified ? <><XCircle className="size-3.5" /> Cabut</> : <><CheckCircle2 className="size-3.5" /> Verifikasi</>}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ KATEGORI TAB ============
function KategoriTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-categories"], queryFn: () => fetchJson("/api/admin/categories") });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [icon, setIcon] = useState("Cog");
  const create = useMutation({
    mutationFn: () => fetch("/api/admin/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), icon }) }),
    onSuccess: () => { toast.success(tr("admCategoryAdded")); setShowForm(false); setName(""); setSlug(""); qc.invalidateQueries({ queryKey: ["admin-categories"] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success(tr("admCategoryDeleted")); qc.invalidateQueries({ queryKey: ["admin-categories"] }); },
  });
  if (isLoading || !data) return <SkeletonGrid count={3} />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Kelola Kategori ({data.categories.length})</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="size-4" /> Tambah</Button>
      </div>
      {showForm && (
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
          <div><Label className="text-xs">Nama</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kategori" /></div>
          <div><Label className="text-xs">Slug</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto" /></div>
          <div><Label className="text-xs">Icon</Label><Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Cog" /></div>
          <div className="flex items-end"><Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}</Button></div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {data.categories.map((c: any) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <span className="text-xs font-bold text-muted-foreground">#{c.sortOrder}</span>
            <div className="flex-1"><p className="text-sm font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.slug} · {c.listingCount} iklan</p></div>
            <button onClick={() => del.mutate(c.id)} className="grid size-7 place-items-center rounded bg-red-100 text-red-600 hover:bg-red-200" title={tr("admDelete")}><Trash2 className="size-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ PENGGUNA TAB ============
function PenggunaTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchJson("/api/admin/users"), ...RT });
  const [previewUser, setPreviewUser] = useState<any>(null);
  const del = useMutation({
    mutationFn: (id: string) => fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }),
    onSuccess: () => { toast.success(tr("admUserDeleted")); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: any) => { const msg = e?.message || tr("admDeleteFailed2"); toast.error(msg); },
  });
  if (isLoading || !data) return <SkeletonGrid count={3} />;
  const users = data.users;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const isAdmin = (u: any) => u.role === "admin" || u.role === "superadmin";

  const handleDelete = (u: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAdmin(u)) { toast.error(tr("admCannotDeleteAdmin")); return; }
    if (confirm(`Hapus user "${u.name}" (${u.email})?`)) {
      del.mutate(u.id);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Pengguna Terdaftar ({users.length})</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
            <th className="p-2">Nama</th><th className="p-2">Email</th><th className="hidden p-2 sm:table-cell">No. HP</th><th className="hidden p-2 sm:table-cell">Kota</th><th className="p-2">Role</th><th className="hidden p-2 sm:table-cell">Daftar</th><th className="p-2 text-center">Aksi</th>
          </tr></thead>
          <tbody>
            {users.map((u: any) => (
              <tr
                key={u.id}
                onClick={() => setPreviewUser(u)}
                className="cursor-pointer border-b border-border hover:bg-accent/30"
              >
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {u.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                    </span>
                    <span className="text-xs font-medium">{u.name}</span>
                  </div>
                </td>
                <td className="p-2 text-xs text-muted-foreground">{u.email}</td>
                <td className="hidden p-2 text-xs sm:table-cell">{u.phone || "-"}</td>
                <td className="hidden p-2 text-xs sm:table-cell">{u.city || "-"}</td>
                <td className="p-2"><Badge className={isAdmin(u) ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}>{u.role}</Badge></td>
                <td className="hidden p-2 text-xs text-muted-foreground sm:table-cell">{fmtDate(u.createdAt)}</td>
                <td className="p-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-center">
                    <button
                      onClick={(e) => handleDelete(u, e)}
                      disabled={isAdmin(u) || del.isPending}
                      className={cn(
                        "grid size-7 place-items-center rounded transition",
                        isAdmin(u) ? "cursor-not-allowed bg-muted text-muted-foreground/40" : "bg-red-100 text-red-600 hover:bg-red-200"
                      )}
                      title={isAdmin(u) ? "Tidak dapat menghapus admin" : "Hapus user"}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* POPUP DATA USER LENGKAP */}
      {previewUser && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewUser(null)}
        >
          <div
            className="w-full max-w-md overflow-y-auto rounded-xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-base font-bold">Detail Pengguna</h3>
              <button onClick={() => setPreviewUser(null)} className="grid size-8 place-items-center rounded-lg hover:bg-accent">
                <XCircle className="size-5" />
              </button>
            </div>

            {/* content */}
            <div className="p-4 space-y-4">
              {/* avatar + name */}
              <div className="flex items-center gap-3">
                <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                  {previewUser.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-bold">{previewUser.name}</p>
                  <Badge className={isAdmin(previewUser) ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}>{previewUser.role}</Badge>
                </div>
              </div>

              {/* data lengkap */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Mail className="size-3.5" /> Email</span>
                  <span className="font-medium">{previewUser.email}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Phone className="size-3.5" /> No. HP</span>
                  <span className="font-medium">{previewUser.phone || "-"}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" /> Kota</span>
                  <span className="font-medium">{previewUser.city || "-"}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="size-3.5" /> Tanggal Daftar</span>
                  <span className="font-medium">{fmtDate(previewUser.createdAt)}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="size-3.5" /> Role</span>
                  <Badge className={isAdmin(previewUser) ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}>{previewUser.role}</Badge>
                </div>
              </div>

              {/* actions */}
              {!isAdmin(previewUser) ? (
                <Button
                  variant="destructive"
                  className="w-full gap-2"
                  onClick={() => {
                    if (confirm(`Hapus user "${previewUser.name}"?`)) {
                      del.mutate(previewUser.id);
                      setPreviewUser(null);
                    }
                  }}
                  disabled={del.isPending}
                >
                  <Trash2 className="size-4" /> Hapus User
                </Button>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-xs text-amber-700">
                  <ShieldCheck className="mx-auto mb-1 size-5" />
                  Akun admin tidak dapat dihapus
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ MEREK TAB ============
function MerekTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const { data, isLoading } = useQuery({ queryKey: ["admin-listings"], queryFn: () => fetchJson("/api/admin/listings"), ...RT });
  const [extraBrands, setExtraBrands] = useState<string[]>([]);
  const [newBrand, setNewBrand] = useState("");

  if (isLoading || !data) return <SkeletonGrid count={3} />;

  // Compute brands from listings + extra brands added by admin
  const brands: Record<string, number> = {};
  data.listings.forEach((l: any) => { if (l.brand) brands[l.brand] = (brands[l.brand] || 0) + 1; });
  extraBrands.forEach((b) => { if (!(b in brands)) brands[b] = 0; });
  const sorted = Object.entries(brands).sort((a, b) => b[1] - a[1]);

  const addBrand = () => {
    const name = newBrand.trim();
    if (!name) return;
    if (name in brands) { toast.error(tr("admBrandExists")); return; }
    setExtraBrands([...extraBrands, name]);
    setNewBrand("");
    toast.success(tr("admBrandAdded"));
  };

  const deleteBrand = (name: string) => {
    setExtraBrands(extraBrands.filter((b) => b !== name));
    toast.success(tr("admBrandDeleted"));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Kelola Merek ({sorted.length})</h2>
      </div>
      <div className="flex gap-2">
        <Input
          value={newBrand}
          onChange={(e) => setNewBrand(e.target.value)}
          placeholder="Nama merek baru (mis. Heidelberg)"
          className="h-9"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBrand(); } }}
        />
        <Button size="sm" onClick={addBrand} disabled={!newBrand.trim()}>
          <Plus className="size-4" /> Tambah
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {sorted.map(([brand, count]) => (
          <div key={brand} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 min-w-0">
              <Award className="size-5 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{brand}</p>
                <p className="text-xs text-muted-foreground">{count} iklan</p>
              </div>
            </div>
            <button
              onClick={() => deleteBrand(brand)}
              className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Hapus merek"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Belum ada merek. Tambah merek baru di atas.
          </div>
        )}
      </div>
    </div>
  );
}

// ============ LOKASI TAB ============
function LokasiTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const { data, isLoading } = useQuery({ queryKey: ["admin-listings"], queryFn: () => fetchJson("/api/admin/listings"), ...RT });
  const [extraCities, setExtraCities] = useState<string[]>([]);
  const [extraProvinces, setExtraProvinces] = useState<string[]>([]);
  const [newCity, setNewCity] = useState("");
  const [newProvince, setNewProvince] = useState("");

  if (isLoading || !data) return <SkeletonGrid count={3} />;

  // Compute from listings + extra entries
  const cities: Record<string, number> = {};
  const provinces: Record<string, number> = {};
  data.listings.forEach((l: any) => {
    cities[l.city] = (cities[l.city] || 0) + 1;
    provinces[l.province] = (provinces[l.province] || 0) + 1;
  });
  extraCities.forEach((c) => { if (!(c in cities)) cities[c] = 0; });
  extraProvinces.forEach((p) => { if (!(p in provinces)) provinces[p] = 0; });
  const cityList = Object.entries(cities).sort((a, b) => b[1] - a[1]);
  const provList = Object.entries(provinces).sort((a, b) => b[1] - a[1]);

  const addCity = () => {
    const name = newCity.trim();
    if (!name) return;
    if (name in cities) { toast.error(tr("admCityExists")); return; }
    setExtraCities([...extraCities, name]);
    setNewCity("");
    toast.success(tr("admCityAdded"));
  };
  const addProvince = () => {
    const name = newProvince.trim();
    if (!name) return;
    if (name in provinces) { toast.error(tr("admProvinceExists")); return; }
    setExtraProvinces([...extraProvinces, name]);
    setNewProvince("");
    toast.success(tr("admProvinceAdded"));
  };
  const deleteCity = (name: string) => {
    setExtraCities(extraCities.filter((c) => c !== name));
    toast.success(tr("admCityDeleted"));
  };
  const deleteProvince = (name: string) => {
    setExtraProvinces(extraProvinces.filter((p) => p !== name));
    toast.success(tr("admProvinceDeleted"));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold">Kelola Lokasi</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Cities */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">Kota ({cityList.length})</h3>
          </div>
          <div className="mb-2 flex gap-2">
            <Input
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              placeholder="Tambah kota..."
              className="h-9"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
            />
            <Button size="sm" onClick={addCity} disabled={!newCity.trim()}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="space-y-1.5">
            {cityList.map(([city, count]) => (
              <div key={city} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="flex items-center gap-1"><MapPin className="size-3 text-primary" />{city}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{count}</Badge>
                  <button onClick={() => deleteCity(city)} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Hapus kota">
                    <X className="size-3" />
                  </button>
                </div>
              </div>
            ))}
            {cityList.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Belum ada kota.</div>
            )}
          </div>
        </div>
        {/* Provinces */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">Provinsi ({provList.length})</h3>
          </div>
          <div className="mb-2 flex gap-2">
            <Input
              value={newProvince}
              onChange={(e) => setNewProvince(e.target.value)}
              placeholder="Tambah provinsi..."
              className="h-9"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProvince(); } }}
            />
            <Button size="sm" onClick={addProvince} disabled={!newProvince.trim()}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="space-y-1.5">
            {provList.map(([prov, count]) => (
              <div key={prov} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span>{prov}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{count}</Badge>
                  <button onClick={() => deleteProvince(prov)} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Hapus provinsi">
                    <X className="size-3" />
                  </button>
                </div>
              </div>
            ))}
            {provList.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Belum ada provinsi.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ BANNER TAB ============
function BannerTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const [banners, setBanners] = useState([
    { id: 1, title: tr("admBanner1Title"), status: "active", placement: "Home Hero", clicks: 342 },
    { id: 2, title: tr("admBanner2Title"), status: "scheduled", placement: "Category Page", clicks: 0 },
    { id: 3, title: tr("admBanner3Title"), status: "active", placement: "Sidebar", clicks: 128 },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPlacement, setNewPlacement] = useState("Home Hero");

  const addBanner = () => {
    if (!newTitle.trim()) return;
    setBanners([...banners, { id: Date.now(), title: newTitle.trim(), status: "scheduled", placement: newPlacement, clicks: 0 }]);
    setNewTitle("");
    setShowForm(false);
    toast.success(tr("admBannerAdded"));
  };
  const toggleStatus = (id: number) => {
    setBanners(banners.map(b => b.id === id ? { ...b, status: b.status === "active" ? "scheduled" : "active" } : b));
  };
  const deleteBanner = (id: number) => {
    setBanners(banners.filter(b => b.id !== id));
    toast.success(tr("admBannerDeleted"));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Banner Promosi ({banners.length})</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="size-4" /> {showForm ? "Batal" : "Tambah Banner"}
        </Button>
      </div>

      {/* Add banner form */}
      {showForm && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Judul banner (mis. Promo Lebaran)"
            className="h-9"
          />
          <div className="flex gap-2">
            <select
              value={newPlacement}
              onChange={(e) => setNewPlacement(e.target.value)}
              className="h-9 flex-1 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="Home Hero">Home Hero</option>
              <option value="Category Page">Category Page</option>
              <option value="Sidebar">Sidebar</option>
              <option value="Detail Page">Detail Page</option>
            </select>
            <Button size="sm" onClick={addBanner} disabled={!newTitle.trim()}>
              <CheckCircle2 className="size-4" /> Simpan
            </Button>
          </div>
        </div>
      )}

      {/* Banner list */}
      <div className="space-y-2">
        {banners.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <Image className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{b.title}</p>
              <p className="text-xs text-muted-foreground">{b.placement} · {b.clicks} klik</p>
            </div>
            <button
              onClick={() => toggleStatus(b.id)}
              className="shrink-0"
              title="Toggle aktif"
            >
              <Badge className={b.status === "active" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}>
                {b.status === "active" ? tr("admActive2") : tr("admScheduled")}
              </Badge>
            </button>
            <button
              onClick={() => deleteBanner(b.id)}
              className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Hapus banner"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {banners.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {tr("admNoBanner")}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">Kelola banner promosi yang tampil di beranda & halaman kategori.</p>
    </div>
  );
}

// ============ PAKET TAB ============
function PaketTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-paket"], queryFn: () => fetchJson("/api/admin/paket") });

  // Form state for add/edit dialog
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState("");
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formOriginalPrice, setFormOriginalPrice] = useState("");
  const [formDuration, setFormDuration] = useState("");
  const [formFeatures, setFormFeatures] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const method = editingId ? "PUT" : "POST";
      const res = await fetch("/api/admin/paket", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Gagal"); }
      return res.json();
    },
    onSuccess: () => { toast.success(editingId ? "Paket berhasil diperbarui" : "Paket berhasil ditambahkan"); closeForm(); qc.invalidateQueries({ queryKey: ["admin-paket"] }); },
    onError: (e: any) => { toast.error(e.message || "Gagal menyimpan paket"); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch("/api/admin/paket", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }),
    onSuccess: () => { toast.success("Paket berhasil dihapus"); setDeleteId(null); qc.invalidateQueries({ queryKey: ["admin-paket"] }); },
    onError: () => { toast.error("Gagal menghapus paket"); },
  });

  const openAdd = () => {
    setEditingId(null); setFormKey(""); setFormName(""); setFormPrice(""); setFormOriginalPrice(""); setFormDuration("30"); setFormFeatures(""); setFormActive(true); setShowForm(true);
  };
  const openEdit = (p: any) => {
    setEditingId(p.id); setFormKey(p.key); setFormName(p.name); setFormPrice(String(p.price)); setFormOriginalPrice(String(p.originalPrice || 0)); setFormDuration(String(p.duration));
    setFormFeatures((p.features || []).join("\n")); setFormActive(p.active !== false); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const handleSave = () => {
    if (!formName.trim()) { toast.error("Nama paket wajib"); return; }
    if (!editingId && !formKey.trim()) { toast.error("Key paket wajib"); return; }
    const payload: any = {
      name: formName.trim(),
      price: Number(formPrice) || 0,
      originalPrice: Number(formOriginalPrice) || 0,
      duration: Number(formDuration) || 30,
      features: formFeatures.split("\n").map((f: string) => f.trim()).filter(Boolean),
      active: formActive,
    };
    if (editingId) payload.id = editingId;
    else payload.key = formKey.trim().toLowerCase().replace(/\s+/g, "-");
    saveMutation.mutate(payload);
  };

  if (isLoading || !data) return <SkeletonGrid count={3} />;

  const pakets = data.pakets || [];
  const iconMap: Record<string, any> = { colek: Tag, sundul: TrendingUp, highlight: Zap, spotlight: Crown, gold: Gem };
  const colorMap: Record<string, string> = { colek: "border-blue-400", sundul: "border-purple-400", highlight: "border-orange-400", spotlight: "border-amber-400", gold: "border-yellow-400" };
  const iconColorMap: Record<string, string> = { colek: "text-blue-500", sundul: "text-purple-500", highlight: "text-orange-500", spotlight: "text-amber-500", gold: "text-yellow-500" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Paket Iklan Premium ({pakets.length})</h2>
        <Button size="sm" onClick={openAdd}><Plus className="size-4" /> Tambah Paket</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pakets.map((p: any) => {
          const Icon = iconMap[p.key] || Tag;
          return (
            <div key={p.id} className={cn("rounded-xl border-2 bg-card p-5 transition hover:shadow-md", colorMap[p.key] || "border-border")}>
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-lg bg-secondary">
                  <Icon className={cn("size-5", iconColorMap[p.key] || "text-muted-foreground")} />
                </span>
                <div className="flex items-center gap-1">
                  {p.active ? <Badge variant="secondary" className="text-[10px]">Aktif</Badge> : <Badge variant="destructive" className="text-[10px]">Nonaktif</Badge>}
                </div>
              </div>
              <p className="mt-3 text-lg font-bold">{p.name}</p>
              <p className="mt-1 text-2xl font-extrabold text-primary">
                {formatRupiahFull(p.price)}
                {p.originalPrice > 0 && p.originalPrice > p.price && (
                  <span className="ml-2 text-sm font-medium text-muted-foreground line-through">{formatRupiahFull(p.originalPrice)}</span>
                )}
                <span className="text-xs font-normal text-muted-foreground">/{p.duration} hari</span>
              </p>
              <ul className="mt-3 space-y-1.5">
                {(p.features || []).map((f: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />{f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEdit(p)}><Edit className="size-3.5" /> Edit</Button>
                <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive hover:text-white" onClick={() => setDeleteId(p.id)}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>

      {pakets.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Frown className="size-12 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">Belum ada paket</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tambahkan paket iklan premium pertama Anda.</p>
          <Button className="mt-4" onClick={openAdd}><Plus className="size-4" /> Tambah Paket</Button>
        </div>
      )}

      {/* ADD/EDIT DIALOG */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={closeForm}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{editingId ? "Edit Paket" : "Tambah Paket Baru"}</h3>
            <div className="mt-4 space-y-3">
              {!editingId && (
                <div>
                  <Label className="text-xs">Key Paket *</Label>
                  <Input value={formKey} onChange={(e) => setFormKey(e.target.value)} placeholder="contoh: gold, platinum" className="mt-1" />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Identifier unik (huruf kecil, tanpa spasi)</p>
                </div>
              )}
              <div>
                <Label className="text-xs">Nama Paket *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="contoh: Gold, Platinum" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Harga (Rp)</Label>
                  <Input value={formPrice} onChange={(e) => setFormPrice(e.target.value)} type="number" placeholder="0" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Harga Coret (Rp)</Label>
                  <Input value={formOriginalPrice} onChange={(e) => setFormOriginalPrice(e.target.value)} type="number" placeholder="0" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Durasi (hari)</Label>
                  <Input value={formDuration} onChange={(e) => setFormDuration(e.target.value)} type="number" placeholder="30" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => setFormActive(true)} className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition", formActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>Aktif</button>
                    <button type="button" onClick={() => setFormActive(false)} className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition", !formActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>Nonaktif</button>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Fitur (1 per baris)</Label>
                <textarea value={formFeatures} onChange={(e) => setFormFeatures(e.target.value)} placeholder={"Tayang di halaman utama\nHighlight khusus\nBadge Premium"} rows={5} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary" />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1" onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {editingId ? "Simpan Perubahan" : "Tambah Paket"}
              </Button>
              <Button variant="outline" onClick={closeForm}>Batal</Button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Paket?</AlertDialogTitle>
            <AlertDialogDescription>Paket yang dihapus tidak dapat dikembalikan. Iklan yang menggunakan paket ini tidak akan terpengaruh.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ TRANSAKSI TAB ============
function TransaksiTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const { data, isLoading } = useQuery({ queryKey: ["admin-listings"], queryFn: () => fetchJson("/api/admin/listings"), ...RT });
  const [search, setSearch] = useState("");
  const [pkgFilter, setPkgFilter] = useState<"all" | "spotlight" | "highlight" | "sundul" | "colek">("all");
  const [viewMode, setViewMode] = useState<"grid" | "line">("line");
  // Image lightbox — when user clicks an image in the grid/table, show a popup
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (isLoading || !data) return <SkeletonGrid count={3} />;

  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday); const dow = (startWeek.getDay() + 6) % 7; startWeek.setDate(startWeek.getDate() - dow);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const all = data.listings;
  const adFee = (l: any) => l.adFee ?? 0;

  const daily = all.filter((l: any) => new Date(l.createdAt) >= startToday);
  const weekly = all.filter((l: any) => new Date(l.createdAt) >= startWeek);
  const monthly = all.filter((l: any) => new Date(l.createdAt) >= startMonth && new Date(l.createdAt) < now);

  const sumFee = (list: any[]) => list.reduce((a, l) => a + adFee(l), 0);
  const totalAll = sumFee(all);

  // Filtered list for table
  const filtered = all.filter((l: any) => {
    const matchSearch = !search || l.title?.toLowerCase().includes(search.toLowerCase()) || l.seller?.name?.toLowerCase().includes(search.toLowerCase());
    const matchPkg = pkgFilter === "all" || l.packageType === pkgFilter;
    return matchSearch && matchPkg;
  });

  const pkgName = (p: string) => p === "spotlight" ? "Titanium" : p === "highlight" ? "Platinum" : p === "sundul" ? "Colek" : p === "colek" ? "Gold" : p;
  const pkgColor = (p: string) => p === "spotlight" ? "bg-amber-100 text-amber-700" : p === "highlight" ? "bg-orange-100 text-orange-700" : p === "sundul" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold md:text-lg">Penjualan Iklan</h2>
        <span className="text-sm text-muted-foreground">{all.length} transaksi · Total {formatRupiahFull(totalAll)}</span>
      </div>

      {/* Summary — 3 stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground md:text-sm">Hari Ini</p>
          <p className="mt-1 text-base font-extrabold text-orange-600 md:text-xl">{formatRupiahFull(sumFee(daily))}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground md:text-xs">{daily.length} iklan</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground md:text-sm">Minggu Ini</p>
          <p className="mt-1 text-base font-extrabold text-primary md:text-xl">{formatRupiahFull(sumFee(weekly))}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground md:text-xs">{weekly.length} iklan</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground md:text-sm">Bulan Ini</p>
          <p className="mt-1 text-base font-extrabold text-orange-600 md:text-xl">{formatRupiahFull(sumFee(monthly))}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground md:text-xs">{monthly.length} iklan</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari iklan atau penjual..."
          className="h-9 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
        />
        <div className="flex gap-1.5">
          {[
            { v: "all", l: "Semua" },
            { v: "spotlight", l: "Titanium" },
            { v: "highlight", l: "Platinum" },
            { v: "sundul", l: "Colek" },
            { v: "colek", l: "Gold" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setPkgFilter(f.v as any)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                pkgFilter === f.v ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-accent"
              )}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex items-center justify-end">
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button type="button" onClick={() => setViewMode("grid")}
            className={cn("grid size-9 place-items-center transition", viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
            aria-label="Grid"><LayoutGrid className="size-4" /></button>
          <button type="button" onClick={() => setViewMode("line")}
            className={cn("grid size-9 place-items-center border-l border-border transition", viewMode === "line" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
            aria-label="Line"><List className="size-4" /></button>
        </div>
      </div>

      {viewMode === "grid" ? (
        /* Grid View */
        filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
            <Frown className="size-12 text-muted-foreground" />
            <h3 className="mt-3 text-lg font-semibold">Tidak ada data</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tidak ada data penjualan untuk filter ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((l: any) => {
              const pkg = getPkgBadge(l.packageType);
              return (
                <div key={l.id} className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-border bg-card transition hover:shadow-lg">
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                    {l.images?.[0] ? (
                      <img
                        src={l.images[0]}
                        alt={l.title}
                        onClick={(e) => { e.stopPropagation(); setLightbox(l.images[0]); }}
                        className="size-full cursor-zoom-in object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-8" /></div>
                    )}
                    <span className={cn("absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold", pkg.bg)}>
                      {pkg.name}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="text-sm font-bold text-orange-600">{formatRupiahFull(adFee(l))}</p>
                    <h3 className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-foreground">{l.title}</h3>
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MapPin className="size-3 shrink-0" /> {l.city}{l.seller?.name ? ` · ${l.seller.name}` : ""}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {l.category?.name} · {new Date(l.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <div className="mt-auto flex items-center justify-between border-t border-border pt-2">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Eye className="size-3" /> {l.views?.toLocaleString("id-ID") || 0}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Table View */
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Frown className="size-12 text-muted-foreground" />
              <h3 className="mt-3 text-lg font-semibold">Tidak ada data</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tidak ada data penjualan untuk filter ini.</p>
            </div>
          ) : (
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="p-2.5 w-10">#</th>
                  <th className="p-2.5">Iklan</th>
                  <th className="p-2.5">Paket</th>
                  <th className="p-2.5">Penjual</th>
                  <th className="p-2.5">Kota</th>
                  <th className="p-2.5 text-right">Harga Iklan</th>
                  <th className="p-2.5">Dipasang</th>
                  <th className="p-2.5">Expired</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5 text-right">Views</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l: any, idx: number) => {
                  const pkg = getPkgBadge(l.packageType);
                  const { days: remainingDays, expired } = getRemainingDaysAdmin(l.paymentExpiry);
                  return (
                    <tr key={l.id} className="border-b border-border transition hover:bg-accent/30">
                      <td className="p-2.5 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-2">
                          <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {l.images?.[0] ? (
                              <img
                                src={l.images[0]}
                                alt={l.title}
                                onClick={(e) => { e.stopPropagation(); setLightbox(l.images[0]); }}
                                className="size-full cursor-zoom-in object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="size-4" /></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="line-clamp-1 max-w-[180px] text-xs font-semibold text-foreground">{l.title}</p>
                            <p className="text-[10px] text-muted-foreground">{l.category?.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", pkg.bg)}>{pkg.name}</span>
                      </td>
                      <td className="p-2.5 text-xs">{l.seller?.name || "-"}</td>
                      <td className="p-2.5 text-xs">{l.city}</td>
                      <td className="p-2.5 text-right text-xs font-bold text-orange-600">{formatRupiahFull(adFee(l))}</td>
                      <td className="p-2.5 text-xs text-muted-foreground">
                        {new Date(l.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="p-2.5">
                        {l.paymentExpiry && l.paymentStatus === "paid" ? (
                          <span className={cn("text-xs",
                            expired ? "font-medium text-red-500" : remainingDays <= 3 ? "text-amber-600" : "text-muted-foreground"
                          )}>
                            {new Date(l.paymentExpiry).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold w-fit",
                            l.status === "active" ? "bg-green-50 text-green-600" : l.status === "expired" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-600"
                          )}>
                            {l.status === "active" ? "Aktif" : l.status === "expired" ? "Expired" : l.status === "sold" ? "Terjual" : l.status === "draft" ? "Draft" : l.status || "-"}
                          </span>
                          {l.paymentExpiry && l.paymentStatus === "paid" && (
                            <span className={cn("flex w-fit items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                              expired ? "bg-red-50 text-red-600" : remainingDays <= 3 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"
                            )}>
                              <Timer className="size-2.5" />
                              {expired ? "Non Aktif" : remainingDays === 0 ? "Hari ini" : `${remainingDays} hari`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 text-right text-xs text-muted-foreground">{l.views?.toLocaleString("id-ID") || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Footer count */}
      <p className="text-xs text-muted-foreground">Menampilkan {filtered.length} dari {all.length} transaksi</p>

      {/* Image lightbox popup — shown when user clicks an image */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            aria-label="Tutup"
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X className="size-6" />
          </button>
          <img
            src={lightbox}
            alt="Gambar iklan"
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ============ LAPORAN TAB ============
function LaporanTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fetchJson("/api/admin/stats"), ...RT });
  if (isLoading || !data) return <SkeletonGrid count={3} />;
  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold">Laporan Lengkap</h2>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-bold">Ringkasan Umum</h3>
        <div className="space-y-2 text-sm">
          <Row label={tr("admTotalUsers")} value={data.totals.users} />
          <Row label={tr("admTotalListings")} value={data.totals.listings} />
          <Row label={tr("admTotalRevenue")} value={formatRupiahFull(data.totals.omzetAll)} />
          <Row label={tr("admNewUsers")} value={data.users.today} />
          <Row label={tr("admNewUsersWeek")} value={data.users.week} />
          <Row label={tr("admNewUsersMonth")} value={data.users.month} />
          <Row label={tr("admNewAdsToday")} value={data.listings.today} />
          <Row label={tr("admNewAdsWeek")} value={data.listings.week} />
          <Row label={tr("admNewAdsMonth")} value={data.listings.month} />
          <Row label={tr("admOmzetToday")} value={formatRupiahFull(data.omzet.today)} />
          <Row label={tr("admOmzetWeek")} value={formatRupiahFull(data.omzet.week)} />
          <Row label={tr("admOmzetMonth")} value={formatRupiahFull(data.omzet.month)} />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-bold">Kategori Terpopuler</h3>
        <div className="space-y-1.5 text-sm">
          {data.topCategories.map((c: any, i: number) => (
            <Row key={i} label={`#${i + 1} ${c.name}`} value={`${c.count} iklan`} />
          ))}
        </div>
      </div>
      <Button variant="outline" className="w-full" onClick={() => toast.info("Export laporan segera hadir")}><FileText className="size-4" /> Export PDF/Excel</Button>
    </div>
  );
}

// ============ LAPORAN BULANAN TAB (dipisah per bulan) ============
function MonthlyReportTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-monthly-report", year],
    queryFn: () => fetchJson(`/api/admin/monthly-report?year=${year}`),
  });

  if (isLoading || !data) return <SkeletonGrid count={3} />;

  const months: any[] = data.months || [];
  const yearTotal = data.yearTotal || { omzet: 0, listings: 0, users: 0 };
  const years: number[] = data.years || [year];

  // Bulan yang dipilih (untuk drill-down detail).
  const selMonthData = selectedMonth ? months.find((m) => m.month === selectedMonth) : null;
  const selListings = selectedMonth ? (data.listingsByMonth?.[selectedMonth] || []) : [];
  const selUsers = selectedMonth ? (data.usersByMonth?.[selectedMonth] || []) : [];

  return (
    <div className="space-y-4">
      {/* Header + pemilih tahun */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">{tr("admMonthlyTitle")}</h2>
          <p className="text-xs text-muted-foreground">{tr("admMonthlyDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{tr("admMonthlyYear")}</Label>
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setSelectedMonth(null); }}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Kartu total tahunan */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{tr("admMonthlyTotal")} — {tr("admMonthlyOmzet")}</p>
          <p className="mt-1 text-xl font-bold text-orange-600">{formatRupiahFull(yearTotal.omzet)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{tr("admMonthlyTotal")} — {tr("admMonthlyListings")}</p>
          <p className="mt-1 text-xl font-bold text-primary">{yearTotal.listings}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{tr("admMonthlyTotal")} — {tr("admMonthlyUsers")}</p>
          <p className="mt-1 text-xl font-bold text-blue-500">{yearTotal.users}</p>
        </div>
      </div>

      {/* Tabel 12 bulan (dipisah per bulan) */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
              <th className="p-3">{tr("admMonthlyMonth")}</th>
              <th className="p-3 text-right">{tr("admMonthlyOmzet")}</th>
              <th className="p-3 text-right">{tr("admMonthlyListings")}</th>
              <th className="p-3 text-right">{tr("admMonthlyUsers")}</th>
              <th className="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const hasData = m.listings > 0 || m.users > 0;
              const isCurrent = now.getMonth() + 1 === m.month && now.getFullYear() === year;
              return (
                <tr
                  key={m.month}
                  className={cn(
                    "border-b border-border hover:bg-accent/30",
                    !hasData && "opacity-50",
                    selectedMonth === m.month && "bg-primary/5"
                  )}
                >
                  <td className="p-3 font-medium">
                    {m.label}
                    {isCurrent && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Now</span>}
                  </td>
                  <td className="p-3 text-right font-bold text-orange-600">{m.omzet > 0 ? formatRupiahFull(m.omzet) : "—"}</td>
                  <td className="p-3 text-right">{m.listings > 0 ? m.listings : "—"}</td>
                  <td className="p-3 text-right">{m.users > 0 ? m.users : "—"}</td>
                  <td className="p-3 text-center">
                    {hasData ? (
                      <button
                        onClick={() => setSelectedMonth(selectedMonth === m.month ? null : m.month)}
                        className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                      >
                        {selectedMonth === m.month ? "Tutup" : tr("admMonthlyDetail")}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-secondary/30 font-bold">
              <td className="p-3">{tr("admMonthlyTotal")}</td>
              <td className="p-3 text-right text-orange-600">{formatRupiahFull(yearTotal.omzet)}</td>
              <td className="p-3 text-right">{yearTotal.listings}</td>
              <td className="p-3 text-right">{yearTotal.users}</td>
              <td className="p-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Drill-down: detail bulan terpilih */}
      {selMonthData && (
        <div className="space-y-3 rounded-xl border-2 border-primary/30 bg-card p-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              {tr("admMonthlyDetail")} — {selMonthData.label} {year}
            </h3>
            <Button variant="outline" size="sm" onClick={() => toast.info("Export bulan ini segera hadir")}>
              <FileText className="size-4" /> {tr("admMonthlyExport")}
            </Button>
          </div>

          {/* Ringkasan bulan */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-orange-50 p-2">
              <p className="text-[10px] text-muted-foreground">{tr("admMonthlyOmzet")}</p>
              <p className="text-sm font-bold text-orange-600">{formatRupiahFull(selMonthData.omzet)}</p>
            </div>
            <div className="rounded-lg bg-primary/10 p-2">
              <p className="text-[10px] text-muted-foreground">{tr("admMonthlyListings")}</p>
              <p className="text-sm font-bold text-primary">{selMonthData.listings}</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-2">
              <p className="text-[10px] text-muted-foreground">{tr("admMonthlyUsers")}</p>
              <p className="text-sm font-bold text-blue-500">{selMonthData.users}</p>
            </div>
          </div>

          {/* Rincian per paket */}
          {Object.keys(selMonthData.byPackage).length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">{tr("admMonthlyByPkg")}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selMonthData.byPackage).map(([pkg, info]: [string, any]) => (
                  <span key={pkg} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs">
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{pkg}</Badge>
                    <span className="font-semibold">{info.count} iklan</span>
                    <span className="text-orange-600">{formatRupiahFull(info.omzet)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Daftar iklan bulan ini */}
          {selListings.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">{tr("admMonthlyListings")} ({selListings.length})</p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary/80">
                    <tr className="text-left text-muted-foreground">
                      <th className="p-2">Iklan</th>
                      <th className="p-2">Paket</th>
                      <th className="p-2 text-right">Harga</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selListings.map((l: any) => (
                      <tr key={l.id} className="border-t border-border">
                        <td className="p-2 font-medium">{l.title}</td>
                        <td className="p-2"><Badge variant="outline" className="text-[10px]">{l.packageType}</Badge></td>
                        <td className="p-2 text-right">{formatRupiahFull(l.price)}</td>
                        <td className="p-2"><Badge className={cn("text-[10px]", l.status === "active" ? "bg-orange-100 text-orange-700" : l.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>{l.status}</Badge></td>
                        <td className="p-2 text-muted-foreground">{new Date(l.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Daftar user baru bulan ini */}
          {selUsers.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">{tr("admMonthlyUsers")} ({selUsers.length})</p>
              <div className="flex flex-wrap gap-2">
                {selUsers.map((u: any) => (
                  <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs">
                    <span className="font-semibold">{u.name}</span>
                    <span className="text-muted-foreground">{u.email}</span>
                    {u.role === "admin" && <Badge className="text-[10px]">admin</Badge>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ AUDIT LOG TAB ============
function AuditTab() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const allLogs = [
    { id: 1, action: "LOGIN", user: "gomesin0711@gmail.com", detail: tr("admAuditDetail1"), time: tr("admAuditTime1"), icon: Lock, category: "auth" },
    { id: 2, action: "IKLAN_APPROVE", user: "gomesin0711@gmail.com", detail: tr("admAuditDetail2"), time: tr("admAuditTime2"), icon: CheckCircle2, category: "iklan" },
    { id: 3, action: "PENJUAL_VERIFY", user: "gomesin0711@gmail.com", detail: tr("admAuditDetail3"), time: tr("admAuditTime3"), icon: BadgeCheck, category: "penjual" },
    { id: 4, action: "KATEGORI_CREATE", user: "gomesin0711@gmail.com", detail: tr("admAuditDetail4"), time: tr("admAuditTime4"), icon: FolderTree, category: "kategori" },
    { id: 5, action: "IKLAN_DELETE", user: "gomesin0711@gmail.com", detail: tr("admAuditDetail5"), time: tr("admAuditTime5"), icon: Trash2, category: "iklan" },
    { id: 6, action: "IKLAN_CREATE", user: "budi@gomesin.id", detail: tr("admAuditDetail6"), time: tr("admAuditTime5"), icon: Plus, category: "iklan" },
    { id: 7, action: "USER_REGISTER", user: "siti@gomesin.com", detail: tr("admAuditDetail7"), time: tr("admAuditTime6"), icon: Users, category: "user" },
    { id: 8, action: "LOGIN", user: "budi@gomesin.id", detail: tr("admAuditDetail8"), time: tr("admAuditTime6"), icon: Lock, category: "auth" },
    { id: 9, action: "IKLAN_VIOLATION", user: "gomesin0711@gmail.com", detail: tr("admAuditDetail9"), time: tr("admAuditTime7"), icon: XCircle, category: "iklan" },
    { id: 10, action: "BANNER_CREATE", user: "gomesin0711@gmail.com", detail: tr("admAuditDetail10"), time: tr("admAuditTime8"), icon: Image, category: "banner" },
  ];
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = allLogs.filter((l) => {
    const matchSearch = l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.detail.toLowerCase().includes(search.toLowerCase()) ||
      l.user.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || l.category === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Audit Log ({filtered.length})</h2>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari aktivitas, user, detail..."
          className="h-9 sm:flex-1"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="all">Semua Kategori</option>
          <option value="auth">Autentikasi</option>
          <option value="iklan">Iklan</option>
          <option value="penjual">Penjual</option>
          <option value="kategori">Kategori</option>
          <option value="user">User</option>
          <option value="banner">Banner</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          { label: tr("admAuditTotal"), value: allLogs.length, color: "text-primary" },
          { label: tr("admAuditAuth"), value: allLogs.filter(l => l.category === "auth").length, color: "text-blue-500" },
          { label: tr("admAuditIklan"), value: allLogs.filter(l => l.category === "iklan").length, color: "text-orange-600" },
          { label: tr("admAuditUser"), value: allLogs.filter(l => l.category === "user").length, color: "text-amber-500" },
          { label: tr("admAuditPenjual"), value: allLogs.filter(l => l.category === "penjual").length, color: "text-purple-500" },
          { label: tr("admAuditBanner"), value: allLogs.filter(l => l.category === "banner").length, color: "text-rose-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-2 text-center">
            <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Log list */}
      <div className="space-y-2">
        {filtered.map((l) => (
          <div key={l.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10">
              <l.icon className="size-4 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{l.action}</p>
                <span className="shrink-0 text-[10px] text-muted-foreground">{l.time}</span>
              </div>
              <p className="text-xs text-muted-foreground">{l.detail}</p>
              <p className="text-[10px] text-muted-foreground">by {l.user}</p>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Tidak ada log yang cocok. Coba kata kunci atau filter lain.
          </div>
        )}
      </div>
    </div>
  );
}

// ============ CHAT TAB (WhatsApp-style) ============
// ============ CHAT MESSAGE BUBBLE (WhatsApp-style) ============
// Reusable bubble for both desktop & mobile admin chat views.
// Renders image edge-to-edge, caption below, time at bottom-right.
// Uses referrerPolicy=no-referrer + normalizeImageUrl to handle
// tmpfiles.org viewer URLs and hotlink protection.
function ChatMsgBubble({
  m,
  isSent,
  partnerImage,
  onImageClick,
}: {
  m: any;
  isSent: boolean;
  partnerImage?: string | null;
  onImageClick: (url: string) => void;
}) {
  const imgUrl = m.image ? normalizeImageUrl(m.image) : null;
  const [imgError, setImgError] = useState(false);
  return (
    <div className={isSent ? "flex justify-end" : "flex justify-start"}>
      {!isSent && partnerImage && (
        <img
          src={partnerImage}
          alt=""
          className="mr-1.5 mt-auto size-7 shrink-0 rounded-full object-cover"
        />
      )}
      <div
        className={cn(
          "overflow-hidden rounded-lg shadow-sm",
          isSent
            ? "max-w-[80%] rounded-tr-sm bg-[#dcf8c6]"
            : "max-w-[80%] rounded-tl-sm bg-white"
        )}
      >
        {imgUrl && !imgError && (
          <img
            src={imgUrl}
            alt="Gambar"
            referrerPolicy="no-referrer"
            onClick={() => onImageClick(m.image)}
            onError={() => setImgError(true)}
            className="block w-full min-w-[220px] max-w-full cursor-pointer object-cover transition hover:opacity-90"
            style={{ maxHeight: 360 }}
          />
        )}
        {imgUrl && imgError && (
          <a
            href={m.image}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); onImageClick(m.image); }}
            className="flex min-w-[220px] items-center gap-2 bg-black/5 px-3 py-4 text-xs text-[#075E54] underline"
          >
            <ImageIcon className="size-4 shrink-0" />
            Gambar tidak tersedia — klik untuk membuka
          </a>
        )}
        {m.content && (
          <p className="whitespace-pre-wrap break-words px-2.5 pt-1.5 text-sm font-medium text-black">
            {m.content}
          </p>
        )}
        <div className="px-2.5 pb-1 pt-0.5 text-right">
          <span className="text-[9px] text-black/50">
            {new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
            {isSent && (
              <span className={cn("ml-1", m.read ? "text-blue-500" : "text-black/30")}>✓✓</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatTab() {
  const user = useStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { subscribe } = useChatSocket();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-chat", user?.id],
    queryFn: () => fetchJson("/api/messages?userId=" + (user?.id || "")),
    ...RT,
  });

  const conversations: any[] = data?.conversations ?? [];
  const totalMessages = conversations.reduce((sum: number, c: any) => sum + (c.messages?.length || 0), 0);
  const totalUnread = conversations.reduce((sum: number, c: any) => sum + (c.unread || 0), 0);

  // === REALTIME: subscribe to socket.io message:new events ===
  // When a new message arrives (e.g. a payment proof from a user), instantly
  // invalidate the admin-chat query so the conversation list refreshes
  // immediately — no 500ms polling lag. Also auto-select the conversation
  // that received the proof and show a toast notification.
  useEffect(() => {
    if (!user?.id) return;
    const off = subscribe<ChatMessage>("message:new", (msg) => {
      // Only handle messages where the admin is the receiver (incoming).
      if (msg.receiverId !== user.id) return;
      // Instantly refetch so the new message appears in the conversation list.
      queryClient.invalidateQueries({ queryKey: ["admin-chat", user.id] });
      // Auto-select the conversation so the admin sees it immediately.
      if (msg.senderId) setSelectedId(msg.senderId);
      // Toast notification for payment proofs (messages with images that
      // mention "Bukti Pembayaran").
      if (msg.image && msg.content?.includes("Bukti Pembayaran")) {
        toast.success("Bukti pembayaran baru masuk!", {
          description: "Cek tab Pesan untuk verifikasi.",
        });
      }
    });
    return off;
  }, [user?.id, subscribe, queryClient]);

  // Filter conversations by search
  const filtered = conversations.filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.lastMessage || "").toLowerCase().includes(q) ||
      (c.listingTitle || "").toLowerCase().includes(q)
    );
  });

  const selected = conversations.find((c: any) => c.id === selectedId);
  const selectedMessages: any[] = selected?.messages ?? [];

  // Auto-scroll to bottom when messages change or conversation changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedMessages.length, selectedId]);

  if (isLoading) return <SkeletonGrid count={4} />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#075E54]/10 text-[#075E54]">
          <MessageCircle className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">Pesan Admin</h2>
          <p className="text-xs text-muted-foreground">Lihat semua percakapan pengguna</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Percakapan</span>
            <span className="grid size-7 place-items-center rounded-lg bg-[#075E54]/10">
              <MessageCircle className="size-4 text-[#075E54]" />
            </span>
          </div>
          <p className="mt-1 text-xl font-bold">{conversations.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Pesan</span>
            <span className="grid size-7 place-items-center rounded-lg bg-orange-50">
              <Send className="size-4 text-orange-600" />
            </span>
          </div>
          <p className="mt-1 text-xl font-bold">{totalMessages}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Belum dibaca</span>
            <span className="grid size-7 place-items-center rounded-lg bg-amber-50">
              <Mail className="size-4 text-amber-500" />
            </span>
          </div>
          <p className="mt-1 text-xl font-bold">{totalUnread}</p>
        </div>
      </div>

      {/* WhatsApp-style split layout */}
      <div className="flex gap-0 overflow-hidden rounded-xl border border-border bg-card" style={{ height: 540 }}>
        {/* LEFT: Conversation list */}
        <div className="flex w-full shrink-0 flex-col border-r border-border md:w-80 lg:w-96">
          {/* Search bar inside list header */}
          <div className="border-b border-border bg-[#f0f2f5] p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-black/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari percakapan..."
                className="h-8 rounded-lg border-none bg-white pl-8 text-sm text-black shadow-sm placeholder:text-black/40"
              />
            </div>
          </div>
          {/* Conversation items */}
          <div className="max-h-[500px] flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageCircle className="size-10 text-muted-foreground/30" />
                <p className="mt-2 text-sm font-semibold">Tidak ada percakapan</p>
                <p className="mt-1 text-xs text-muted-foreground">Belum ada pesan masuk.</p>
              </div>
            ) : (
              filtered.map((c: any) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition border-b border-border/30",
                      active ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]"
                    )}
                  >
                    <Avatar className="size-12 shrink-0 rounded-full">
                      {c.partnerImage ? (
                        <img src={c.partnerImage} alt={c.name} className="size-full rounded-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-[#075E54]/10 text-sm font-bold text-[#075E54]">
                          {(c.name || "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-black">{c.name}</p>
                        <span className="shrink-0 text-[10px] text-black/50">{timeAgoShort(c.lastTime)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-black/60">{c.lastMessage || "—"}</p>
                        {c.unread > 0 && (
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#25D366] text-[9px] font-bold text-white">{c.unread}</span>
                        )}
                      </div>
                      {c.listingTitle && <p className="mt-0.5 truncate text-[10px] text-[#075E54]">{c.listingTitle}</p>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Message panel */}
        <div className={cn("hidden flex-1 flex-col md:flex", !selected && "md:flex")}>
          {selected ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-2 border-b border-border bg-[#f0f2f5] px-3 py-2.5">
                <Avatar className="size-9 shrink-0 rounded-full md:size-10">
                  {selected.partnerImage ? (
                    <img src={selected.partnerImage} alt={selected.name} className="size-full rounded-full object-cover" />
                  ) : (
                    <AvatarFallback className="bg-[#075E54]/10 text-xs font-bold text-[#075E54]">
                      {(selected.name || "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-black">{selected.name}</p>
                  {selected.listingTitle && (
                    <p className="truncate text-[10px] text-[#075E54]">{selected.listingTitle}</p>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px]">Admin View</Badge>
              </div>

              {/* Messages — WhatsApp background with dot pattern */}
              <div
                ref={scrollRef}
                className="flex-1 space-y-1.5 overflow-y-auto p-4"
                style={{
                  backgroundColor: "#e5ddd5",
                  backgroundImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.03) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              >
                {/* Listing card bubble */}
                {selected.listingTitle && (
                  <div className="flex justify-start">
                    <div className="max-w-[75%] overflow-hidden rounded-lg rounded-tl-sm bg-white shadow-sm">
                      {selected.listingImage ? (
                        <img src={selected.listingImage} alt={selected.listingTitle} className="max-h-44 w-full object-cover" />
                      ) : (
                        <div className="flex h-20 items-center justify-center bg-muted text-muted-foreground">
                          <ImageIcon className="size-6" />
                        </div>
                      )}
                      <div className="p-2">
                        <p className="truncate text-xs font-semibold text-black">{selected.listingTitle}</p>
                        {selected.listingPrice != null && (
                          <p className="text-xs font-bold text-[#075E54]">Rp {selected.listingPrice.toLocaleString("id-ID")}</p>
                        )}
                        <span className="mt-0.5 block text-right text-[9px] text-black/50">
                          {timeAgoShort(selected.lastTime)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Chat messages */}
                {selectedMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-black/50">Belum ada pesan.</div>
                ) : (
                  selectedMessages.map((m: any, i: number) => (
                    <ChatMsgBubble key={m.id || i} m={m} isSent={m.sent} partnerImage={selected.partnerImage} onImageClick={setLightbox} />
                  ))
                )}
              </div>

              {/* Footer — view-only notice */}
              <div className="border-t border-border bg-[#f0f2f5] px-4 py-2 text-center text-[11px] text-black/50">
                Mode baca saja — {selectedMessages.length} pesan
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="grid size-20 place-items-center rounded-full bg-[#f0f2f5]">
                <MessageCircle className="size-10 text-muted-foreground/40" />
              </div>
              <p className="mt-4 text-lg font-semibold text-foreground">Pesan Admin</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Pilih percakapan dari daftar untuk melihat pesan.
              </p>
            </div>
          )}
        </div>

        {/* Mobile: show selected conversation full-screen */}
        {selected && (
          <div className="flex flex-1 flex-col md:hidden">
            {/* Chat header with back button */}
            <div className="flex items-center gap-2 border-b border-border bg-[#f0f2f5] px-2 py-2.5">
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Kembali"
                className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5"
              >
                <ChevronLeft className="size-5 text-black" />
              </button>
              <Avatar className="size-9 shrink-0 rounded-full">
                {selected.partnerImage ? (
                  <img src={selected.partnerImage} alt={selected.name} className="size-full rounded-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-[#075E54]/10 text-xs font-bold text-[#075E54]">
                    {(selected.name || "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-black">{selected.name}</p>
                {selected.listingTitle && (
                  <p className="truncate text-[10px] text-[#075E54]">{selected.listingTitle}</p>
                )}
              </div>
            </div>
            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-1.5 overflow-y-auto p-3"
              style={{
                backgroundColor: "#e5ddd5",
                backgroundImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.03) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            >
              {selected.listingTitle && (
                <div className="flex justify-start">
                  <div className="max-w-[75%] overflow-hidden rounded-lg rounded-tl-sm bg-white shadow-sm">
                    {selected.listingImage ? (
                      <img src={selected.listingImage} alt={selected.listingTitle} className="max-h-44 w-full object-cover" />
                    ) : (
                      <div className="flex h-20 items-center justify-center bg-muted text-muted-foreground">
                        <ImageIcon className="size-6" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="truncate text-xs font-semibold text-black">{selected.listingTitle}</p>
                      {selected.listingPrice != null && (
                        <p className="text-xs font-bold text-[#075E54]">Rp {selected.listingPrice.toLocaleString("id-ID")}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {selectedMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-black/50">Belum ada pesan.</div>
              ) : (
                selectedMessages.map((m: any, i: number) => (
                  <ChatMsgBubble key={m.id || i} m={m} isSent={m.sent} onImageClick={setLightbox} />
                ))
              )}
            </div>
            <div className="border-t border-border bg-[#f0f2f5] px-4 py-2 text-center text-[11px] text-black/50">
              Mode baca saja — {selectedMessages.length} pesan
            </div>
          </div>
        )}
      </div>

      {/* Image lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            aria-label="Tutup"
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X className="size-6" />
          </button>
          <img
            src={lightbox}
            alt="Gambar besar"
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function timeAgoShort(dateStr: string): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}h`;
  const mo = Math.floor(day / 30);
  return `${mo}bl`;
}

// ============ HELPERS ============
function Row({ label, value }: { label: string; value: any }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>;
}
function SkeletonGrid({ count = 4 }: { count?: number }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: count }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div>;
}
function BadgeCheck({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 16.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z" /></svg>;
}
