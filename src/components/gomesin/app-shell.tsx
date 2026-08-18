"use client";

import { useEffect, useState, useRef } from "react";
import { useStore } from "@/lib/store";
import { apiFetch, clearSessionToken } from "@/lib/session-client";
import { useLang } from "@/lib/i18n";
import { translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { useCall } from "@/lib/use-call";
import { Header } from "./header";
import { Footer } from "./footer";
import { BottomNav } from "./bottom-nav";
import { AdminSidebar } from "./admin-sidebar";
import { CallOverlay } from "./call-overlay";
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
import { PwaInstallButton } from "./pwa-install-button";

const ADMIN_VIEWS = ["admin", "admin-sellers", "admin-categories", "admin-listings", "admin-new-listings", "admin-expired-listings", "admin-rejected-listings", "admin-transactions", "admin-reports", "admin-monthly-report", "admin-users", "admin-paket", "admin-merek", "admin-lokasi", "admin-banner", "admin-audit", "admin-pengaturan"];

export function AppShell() {
  const view = useStore((s) => s.view);
  const user = useStore((s) => s.user);
  const pendingCall = useStore((s) => s.pendingCall);
  const setPendingCall = useStore((s) => s.setPendingCall);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // In-app call hook — mounted globally so incoming calls are detected
  // regardless of which view the user is on. The CallOverlay renders on top
  // of everything (z-[100]) when a call is active.
  const call = useCall();
  // Use refs to avoid re-running the pendingCall effect on every render
  // (the `call` object changes every render, which would cause the effect
  // to fire too often).
  const callRef = useRef(call);
  callRef.current = call;

  // When profile.tsx sets pendingCall (user clicked voice/video call button),
  // trigger startCall() here and clear the pending request.
  useEffect(() => {
    if (pendingCall && callRef.current.callState === "idle") {
      callRef.current.startCall(
        pendingCall.partnerId,
        pendingCall.partnerName,
        pendingCall.partnerImage,
        pendingCall.type
      );
      setPendingCall(null);
    }
  }, [pendingCall, setPendingCall]);

  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  // rehydrate lang store from localStorage on mount (safe in useEffect)
  useEffect(() => {
    import("@/lib/i18n").then(({ useLang }) => {
      useLang.persist.rehydrate();
    });
  }, []);

  // Rehydrate Zustand store (user) from localStorage on mount, then verify
  // the session against the server. If the server says the session is invalid
  // (cookie missing/expired), we clear the local user — this prevents a stale
  // localStorage user from being shown as "logged in" when they're actually
  // not. This is the core of multi-user data isolation: the verified session
  // cookie is the single source of truth for "who am I".
  //
  // MULTI-TAB: We send the per-tab session token (from sessionStorage) as an
  // Authorization header. This lets multiple tabs in the same browser be
  // logged into DIFFERENT accounts — the per-tab token overrides the shared
  // httpOnly cookie on the server side (see getSessionUser in session.ts).
  useEffect(() => {
    // Rehydrate from localStorage first (so the UI doesn't flash a logged-out
    // state if the user is actually still logged in).
    useStore.persist.rehydrate();

    // Verify the session via the server. apiFetch() attaches the per-tab
    // Authorization header if one exists in sessionStorage.
    //
    // CRITICAL: Only clear the local user when the server EXPLICITLY says the
    // session is invalid (HTTP 401). For 5xx errors, 503 (offline SW fallback),
    // or network failures, we KEEP the local user optimistic state so the user
    // stays logged in while offline or during server outages. The session token
    // in sessionStorage + the httpOnly cookie are still valid — only the network
    // is unavailable. Clearing the user here was causing the "login logout on
    // refresh (offline/online mobile)" bug.
    apiFetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        // 401 = server explicitly says "no valid session" → log out.
        // Any other non-ok (403/5xx/503 offline) → keep local user as-is.
        if (r.status === 401) return null;
        if (!r.ok) return undefined; // sentinel: don't touch local user
        return r.json();
      })
      .then((data) => {
        if (data === undefined) return; // server error/offline — keep local user
        if (data?.user) {
          // Session is valid — refresh the local user object with the freshest
          // data from the server (bannerImage, logoImage, etc.).
          useStore.getState().setUser(data.user);
        } else {
          // 401 — session explicitly invalid. Clear the local user + per-tab
          // token so the UI reflects reality. (Don't call full logout() because
          // that would also navigate home; just clear the user state.)
          clearSessionToken();
          useStore.setState({
            user: null,
            favorites: [],
            favoritesSeenCount: 0,
            recents: [],
          });
        }
      })
      .catch(() => {
        // Network error — leave the local user as-is (optimistic).
        // This keeps the user logged in when fully offline (no SW fallback).
      });
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
      {view === "detail" ? (
        <div className="hidden md:contents">
          <Header />
        </div>
      ) : (
        <Header />
      )}
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
              {view === "admin" && <AdminView key={view} />}
              {view === "admin-sellers" && <AdminView key={view} initialTab="penjual" />}
              {view === "admin-categories" && <AdminView key={view} initialTab="kategori" />}
              {view === "admin-listings" && <AdminView key={view} initialTab="iklan" />}
              {view === "admin-new-listings" && <AdminView key={view} initialTab="iklanbaru" />}
              {view === "admin-expired-listings" && <AdminView key={view} initialTab="iklanexpired" />}
              {view === "admin-rejected-listings" && <AdminView key={view} initialTab="iklanditolak" />}
              {view === "admin-transactions" && <AdminView key={view} initialTab="transaksi" />}
              {view === "admin-reports" && <AdminView key={view} initialTab="laporan" />}
              {view === "admin-monthly-report" && <AdminView key={view} initialTab="laporanbulanan" />}
              {view === "admin-users" && <AdminView key={view} initialTab="pengguna" />}
              {view === "admin-paket" && <AdminView key={view} initialTab="paket" />}
              {view === "admin-merek" && <AdminView key={view} initialTab="merek" />}
              {view === "admin-lokasi" && <AdminView key={view} initialTab="lokasi" />}
              {view === "admin-banner" && <AdminView key={view} initialTab="banner" />}
              {view === "admin-audit" && <AdminView key={view} initialTab="audit" />}
              {view === "admin-pengaturan" && <AdminView key={view} initialTab="pengaturan" />}
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
          {isAdminView && !isAdmin && <AdminView key={view} />}
        </main>
      )}
      {/* Hide footer on account/dashboard/admin/detail views for cleaner UX */}
      {!["profile", "dashboard", "favorites", "login", "post", "detail", ...ADMIN_VIEWS].includes(view) && <Footer />}
      {/* Spacer so the fixed bottom nav (mobile) doesn't cover footer content */}
      {view !== "detail" && <div className="h-[4.25rem] shrink-0 md:hidden" aria-hidden="true" />}
      {view !== "detail" && <BottomNav />}
      {/* Persistent floating PWA install button — appears whenever the app
          is installable (beforeinstallprompt captured). Visible on all
          views so the user can always install. */}
      <PwaInstallButton />
      {/* In-app voice/video call overlay — renders on top of everything */}
      <CallOverlay
        callState={call.callState}
        callInfo={call.callInfo}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        isMuted={call.isMuted}
        isVideoOff={call.isVideoOff}
        error={call.error}
        onAccept={call.acceptCall}
        onReject={call.rejectCall}
        onEnd={call.endCall}
        onCancel={call.cancelCall}
        onToggleMute={call.toggleMute}
        onToggleVideo={call.toggleVideo}
      />
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
