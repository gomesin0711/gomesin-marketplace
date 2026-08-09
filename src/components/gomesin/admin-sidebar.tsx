"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import {
  LayoutDashboard,
  Tag,
  Users,
  FolderTree,
  Receipt,
  FileText,
  ShieldCheck,
  X,
  Lock,
  Award,
  MapPin,
  Image as ImageIcon,
  Crown,
  ScrollText,
  Sparkle,
  Clock,
  XCircle,
  Calendar,
  MessageCircle,
} from "lucide-react";

const ADMIN_MENU = [
  { view: "admin" as const, labelKey: "adminDashboard", icon: LayoutDashboard },
  { view: "admin-new-listings" as const, labelKey: "adminNewListings", icon: Sparkle },
  { view: "admin-listings" as const, labelKey: "adminActiveListings", icon: Tag },
  { view: "admin-expired-listings" as const, labelKey: "adminExpiredListings", icon: Clock },
  { view: "admin-rejected-listings" as const, labelKey: "adminRejectedListings", icon: XCircle },
  { view: "admin-categories" as const, labelKey: "adminManageCategories", icon: FolderTree },
  { view: "admin-transactions" as const, labelKey: "adminTransactions", icon: Receipt },
  { view: "admin-reports" as const, labelKey: "adminReports", icon: FileText },
  { view: "admin-monthly-report" as const, labelKey: "adminMonthlyReport", icon: Calendar },
  { view: "admin-users" as const, labelKey: "adminUsers", icon: Users },
  { view: "admin-paket" as const, labelKey: "adminPackages", icon: Crown },
];

// sub menu items (open via tab state in AdminView)
const ADMIN_SUB_MENU = [
  { tab: "merek", labelKey: "adminManageBrands", icon: Award },
  { tab: "lokasi", labelKey: "adminManageLocations", icon: MapPin },
  { tab: "banner", labelKey: "adminBanners", icon: ImageIcon },
  { tab: "audit", labelKey: "adminAuditLog", icon: ScrollText },
];

export function AdminSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const view = useStore((s) => s.view);
  const goHome = useStore((s) => s.goHome);
  const goToAdmin = useStore((s) => s.goToAdmin);
  const goToAdminSub = useStore((s) => s.goToAdminSub);
  const user = useStore((s) => s.user);

  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  // Fetch listings untuk hitung jumlah per status
  const { data: listingsData } = useQuery({
    queryKey: ["admin-listings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/listings");
      if (!res.ok) throw new Error("fail");
      return res.json();
    },
    staleTime: 0,
  });

  const allListings = listingsData?.listings ?? [];
  const counts: Record<string, number> = {
    "admin-new-listings": allListings.filter((l: any) => l.status === "pending").length,
    "admin-listings": allListings.filter((l: any) => l.status === "active" && !l.violationFlag).length,
    "admin-expired-listings": allListings.filter((l: any) => {
      if (!l.paymentExpiry) return false;
      return new Date(l.paymentExpiry) < new Date();
    }).length,
    "admin-rejected-listings": allListings.filter((l: any) => l.status === "rejected" || l.violationFlag === true).length,
  };

  if (!isAdmin) return null;

  const handleNav = (v: typeof ADMIN_MENU[number]["view"]) => {
    if (v === "admin") goToAdmin();
    else goToAdminSub(v);
    onClose();
  };

  return (
    <>
      {/* mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-border bg-card transition-transform duration-300 md:sticky md:top-16 md:z-30 md:h-[calc(100vh-4rem)] md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* mobile header */}
        <div className="flex items-center justify-between border-b border-border p-4 md:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <span className="font-bold">{tr("adminPanel")}</span>
          </div>
          <button onClick={onClose} aria-label="Tutup sidebar">
            <X className="size-5" />
          </button>
        </div>

        {/* desktop header */}
        <div className="hidden border-b border-border p-4 md:block">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <p className="text-sm font-bold">{tr("adminPanel")}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{user?.role}</p>
            </div>
          </div>
        </div>

        {/* menu */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {ADMIN_MENU.map((item) => {
            const active = view === item.view;
            const count = counts[item.view];
            return (
              <button
                key={item.view}
                onClick={() => handleNav(item.view)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {tr(item.labelKey)}
                {count !== undefined && count > 0 && (
                  <span className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold",
                    active ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {/* divider */}
          <div className="my-2 border-t border-border" />

          {/* sub menu (navigasi via tab state) */}
          {ADMIN_SUB_MENU.map((item) => (
            <button
              key={item.tab}
              onClick={() => { goToAdminSub(`admin-${item.tab}` as any); onClose(); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <item.icon className="size-4 shrink-0" />
              {tr(item.labelKey)}
            </button>
          ))}
        </nav>

        {/* footer */}
        <div className="border-t border-border p-3">
          <button
            onClick={() => { goHome(); onClose(); }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Lock className="size-4 shrink-0" />
            {tr("adminExit")}
          </button>
        </div>
      </aside>
    </>
  );
}
