"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { Header } from "./header";
import { Footer } from "./footer";
import { BottomNav } from "./bottom-nav";
import { AdminSidebar } from "./admin-sidebar";
import { HomeView } from "./views/home";
import { ListingsView } from "./views/listings";
import { DetailView } from "./views/detail";
import { PostAdView } from "./views/post-ad";
import { EditAdView } from "./views/edit-ad";
import { ProfileView } from "./views/profile";
import { LoginView } from "./views/login";
import { UpgradeView } from "./views/upgrade";
import { SellerView } from "./views/seller";
import { AdminView } from "./views/admin";

const ADMIN_VIEWS = ["admin", "admin-sellers", "admin-categories", "admin-listings", "admin-new-listings", "admin-expired-listings", "admin-rejected-listings", "admin-transactions", "admin-reports", "admin-monthly-report", "admin-users", "admin-paket", "admin-merek", "admin-lokasi", "admin-banner", "admin-audit"];

export function AppShell() {
  const view = useStore((s) => s.view);
  const user = useStore((s) => s.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  // rehydrate lang store from localStorage on mount (safe in useEffect)
  useEffect(() => {
    import("@/lib/i18n").then(({ useLang }) => {
      useLang.persist.rehydrate();
    });
  }, []);

  // Rehydrate Zustand store (user) from localStorage on mount, then fetch fresh profile
  useEffect(() => {
    // Rehydrate from localStorage first
    useStore.persist.rehydrate();
    // Then fetch fresh user data from API (ensures banner/logo/latest data)
    const uid = useStore.getState().user?.id;
    if (uid) {
      fetch(`/api/auth/profile?userId=${uid}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.user) {
            useStore.getState().setUser(data.user);
          }
        })
        .catch(() => {});
    }
  }, []);

  // scroll to top on view change
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [view]);

  // Handle browser back button — sync with Zustand store
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // Only handle entries we pushed (gomesin: true)
      if (e.state?.gomesin) {
        useStore.getState()._popBack();
      }
    };
    window.addEventListener("popstate", handlePopState);
    // Replace initial history entry so browser back doesn't leave the app immediately
    window.history.replaceState({ gomesin: true }, "");
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const isAdminView = ADMIN_VIEWS.includes(view);
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const showSidebar = isAdminView && isAdmin;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      {showSidebar ? (
        <div className="flex flex-1">
          <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main className="min-w-0 flex-1">
            {/* mobile sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="sticky top-16 z-20 flex w-full items-center gap-2 border-b border-border bg-card px-4 py-2 text-sm font-medium text-primary md:hidden"
            >
              <ShieldCheck className="size-4" />
              {tr("adminMenu")}
            </button>
            <div className="p-0">
              {view === "admin" && <AdminView />}
              {view === "admin-sellers" && <AdminView initialTab="penjual" />}
              {view === "admin-categories" && <AdminView initialTab="kategori" />}
              {view === "admin-listings" && <AdminView initialTab="iklan" />}
              {view === "admin-new-listings" && <AdminView initialTab="iklanbaru" />}
              {view === "admin-expired-listings" && <AdminView initialTab="iklanexpired" />}
              {view === "admin-rejected-listings" && <AdminView initialTab="iklanditolak" />}
              {view === "admin-transactions" && <AdminView initialTab="transaksi" />}
              {view === "admin-reports" && <AdminView initialTab="laporan" />}
              {view === "admin-monthly-report" && <AdminView initialTab="laporanbulanan" />}
              {view === "admin-users" && <AdminView initialTab="pengguna" />}
              {view === "admin-paket" && <AdminView initialTab="paket" />}
              {view === "admin-merek" && <AdminView initialTab="merek" />}
              {view === "admin-lokasi" && <AdminView initialTab="lokasi" />}
              {view === "admin-banner" && <AdminView initialTab="banner" />}
              {view === "admin-audit" && <AdminView initialTab="audit" />}
            </div>
          </main>
        </div>
      ) : (
        <main className="flex-1">
          {view === "home" && <HomeView />}
          {view === "listings" && <ListingsView />}
          {view === "detail" && <DetailView />}
          {view === "post" && <PostAdView />}
          {view === "edit" && <EditAdView />}
          {view === "profile" && <ProfileView />}
          {view === "login" && <LoginView />}
          {view === "upgrade" && <UpgradeView />}
          {view === "seller" && <SellerView />}
          {/* fallback: if non-admin somehow reaches admin view */}
          {isAdminView && !isAdmin && <AdminView />}
        </main>
      )}
      {/* Hide footer on account/dashboard/admin views for cleaner UX */}
      {!["profile", "dashboard", "favorites", "login", "post", ...ADMIN_VIEWS].includes(view) && <Footer />}
      {/* Spacer so the fixed bottom nav (mobile) doesn't cover footer content */}
      <div className="h-[4.25rem] shrink-0 md:hidden" aria-hidden="true" />
      <BottomNav />
    </div>
  );
}

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}
