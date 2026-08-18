"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Download, Smartphone, Monitor, Tablet, Share2, Star, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Platform = "ios" | "android" | "desktop";

interface DeferredPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __deferredInstallPrompt: DeferredPrompt | null;
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/*
 * STORAGE STRATEGY (User-friendly):
 *   - INSTALLED_KEY (localStorage): Set when the native install dialog is
 *     ACCEPTED. Cleared on every mount if the app is NOT actually running
 *     in standalone mode — so uninstalling the PWA resets the state.
 *   - SOFT_DISMISSED_KEY (localStorage, 7 days): Set when the user clicks
 *     "Nanti Saja" or "Mengerti". Persists for 7 days so the user is NOT
 *     bombarded with the popup on every visit. The floating Install FAB
 *     (PwaInstallButton) still appears when beforeinstallprompt fires,
 *     so users can install on their own terms.
 *   - HARD_DISMISSED_KEY (localStorage, 6h): Only set when the user
 *     rejects the NATIVE install dialog (Chrome's own popup). This
 *     respects Chrome's 30-day re-prompt rule.
 *   - FIRST_VISIT_KEY (localStorage): Set on first ever visit. The auto
 *     popup is NOT shown on the very first visit — only on subsequent
 *     visits. This prevents the "page won't load" complaint from new
 *     mobile users.
 */
const INSTALLED_KEY = "gomesin-pwa-installed";
const SOFT_DISMISSED_KEY = "gomesin-pwa-soft-dismissed";
const HARD_DISMISSED_KEY = "gomesin-pwa-hard-dismissed";
const FIRST_VISIT_KEY = "gomesin-pwa-first-visit-seen";
const HARD_DISMISS_MS = 6 * 60 * 60 * 1000; // 6 hours — native dialog rejected
const SOFT_DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — "Nanti saja"

// Auto-show delay. Long enough for the user to see the page content and
// start interacting. Short enough to catch them while still on the site.
const SHOW_DELAY_MS = 12000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    // iOS Safari standalone flag
    ("standalone" in navigator && (navigator as unknown as Record<string, boolean>).standalone === true)
  );
}

/*
 * CRITICAL FIX: Clear stale INSTALLED_KEY if not actually in standalone mode.
 * If the flag is "1" but we're browsing in a regular tab, the app was
 * uninstalled (or the flag was set by a test). Clear it so the popup can
 * show again. This is the #1 reason the popup "never appears" on mobile.
 */
function clearStaleInstalled(): void {
  try {
    if (localStorage.getItem(INSTALLED_KEY) === "1" && !isStandalone()) {
      localStorage.removeItem(INSTALLED_KEY);
    }
  } catch {
    /* ignore */
  }
}

function isInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

/*
 * Mark first visit so we NEVER auto-show on the very first visit. The
 * floating Install FAB still appears if beforeinstallprompt fires, so
 * interested users can install immediately. The auto-popup only shows
 * on subsequent visits (returning users) — this prevents the "mobile
 * page won't load" complaint from new visitors.
 */
function isFirstVisit(): boolean {
  try {
    if (!localStorage.getItem(FIRST_VISIT_KEY)) {
      localStorage.setItem(FIRST_VISIT_KEY, "1");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isSoftDismissed(): boolean {
  try {
    const raw = localStorage.getItem(SOFT_DISMISSED_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (isNaN(ts)) return false;
    return Date.now() - ts < SOFT_DISMISS_MS;
  } catch {
    return false;
  }
}

function markSoftDismissed(): void {
  try {
    localStorage.setItem(SOFT_DISMISSED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function isHardDismissed(): boolean {
  try {
    const raw = localStorage.getItem(HARD_DISMISSED_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (isNaN(ts)) return false;
    return Date.now() - ts < HARD_DISMISS_MS;
  } catch {
    return false;
  }
}

function markHardDismissed(): void {
  try {
    localStorage.setItem(HARD_DISMISSED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function canShow(): boolean {
  // Clear stale "installed" flag first — if the app isn't actually running
  // standalone, any previous "installed" mark is stale.
  clearStaleInstalled();
  if (isInstalled()) return false;
  if (isSoftDismissed()) return false;
  if (isHardDismissed()) return false;
  // Never auto-show on the very first visit — let the user see the content
  // first. Returning visits (next day, etc.) are fair game.
  if (isFirstVisit()) return false;
  return true;
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/* ------------------------------------------------------------------ */
/*  Translations                                                       */
/* ------------------------------------------------------------------ */

const T: Record<string, Record<string, string>> = {
  title:        { id: "Install BeliMesin", en: "Install BeliMesin", zh: "\u5b89\u88c5 BeliMesin" },
  subtitle:     { id: "Marketplace Mesin Industri #1", en: "#1 Industrial Machinery Marketplace", zh: "#1 \u5de5\u4e1a\u673a\u68b0\u5e02\u573a" },
  desc:         { id: "Akses marketplace mesin industri terlengkap langsung dari home screen Anda.", en: "Access the largest industrial machinery marketplace directly from your home screen.", zh: "\u4ece\u4e3b\u5c4f\u5e55\u76f4\u63a5\u8bbf\u95ee\u6700\u5927\u7684\u5de5\u4e1a\u673a\u68b0\u5e02\u573a\u3002" },
  install:      { id: "Install", en: "Install", zh: "\u5b89\u88c5" },
  installing:   { id: "Menginstall...", en: "Installing...", zh: "\u5b89\u88c5\u4e2d..." },
  later:        { id: "Nanti saja", en: "Not now", zh: "\u4ee5\u540e\u518d\u8bf4" },
  feature1:     { id: "Buka langsung dari home screen", en: "Open from home screen", zh: "\u4ece\u4e3b\u5c4f\u5e55\u6253\u5f00" },
  feature2:     { id: "Notifikasi instan chat & iklan", en: "Instant chat & ad notifications", zh: "\u5373\u65f6\u804a\u5929\u548c\u5e7f\u544a\u901a\u77e5" },
  feature3:     { id: "Tampilan full-screen tanpa browser", en: "Full-screen, no browser UI", zh: "\u5168\u5c4f\uff0c\u65e0\u6d4f\u89c8\u5668\u754c\u9762" },
  rating:       { id: "4.9", en: "4.9", zh: "4.9" },
  ratingText:   { id: "Ribuan pengguna aktif", en: "Thousands of active users", zh: "\u6570\u5343\u6d3b\u8dc3\u7528\u6237" },
  free:         { id: "GRATIS", en: "FREE", zh: "\u514d\u8d39" },
  iosStep1:     { id: "Tekan tombol Share", en: "Tap the Share button", zh: "\u70b9\u51fb\u5206\u4eab\u6309\u94ae" },
  iosStep2:     { id: 'Lalu pilih "Tambahkan ke Layar Utama"', en: 'Then select "Add to Home Screen"', zh: '\u7136\u540e\u9009\u62e9\u201c\u6dfb\u52a0\u5230\u4e3b\u5c4f\u5e55\u201d' },
  desktopHint:  { id: "Klik ikon install di address bar browser Anda", en: "Click the install icon in your browser address bar", zh: "\u70b9\u51fb\u6d4f\u89c8\u5668\u5730\u5740\u680f\u7684\u5b89\u88c5\u56fe\u6807" },
};

function tr(key: string, lang: string): string {
  return T[key]?.[lang] ?? T[key]?.["id"] ?? key;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PwaInstallPrompt() {
  const [showPopup, setShowPopup] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [hasNativePrompt, setHasNativePrompt] = useState(false);
  const { lang } = useLang();

  const platform: Platform = typeof window !== "undefined" ? detectPlatform() : "desktop";

  /*
   * STRATEGY (Play Store-like):
   *   1. On mount, clear any stale "installed" flag if not standalone.
   *   2. Auto-show the popup after SHOW_DELAY_MS on ALL platforms —
   *      this is the primary trigger. Works even if beforeinstallprompt
   *      never fires (iOS Safari, or Chrome before engagement heuristic).
   *   3. Listen for beforeinstallprompt reactively — when it fires,
   *      upgrade the button from "Install" to "Install" (now triggers
   *      native dialog) and re-show the popup if it was session-dismissed.
   *   4. Hard dismissal (native dialog rejected) blocks for 6 hours.
   *      Session dismissal ("Nanti saja" / "Mengerti") blocks until the
   *      browser is closed — next visit, popup shows again.
   */
  useEffect(() => {
    // Step 1: clear stale installed flag
    clearStaleInstalled();

    // Don't show if already running as standalone app or genuinely installed
    if (isStandalone() || isInstalled()) return;

    // Step 2: Check if the early <head> script already captured the prompt.
    // Deferred via microtask to avoid cascading renders from inside the effect.
    if (window.__deferredInstallPrompt) {
      Promise.resolve().then(() => setHasNativePrompt(true));
    }

    // Step 3: Real-time listener for beforeinstallprompt
    const handleBIP = () => {
      setHasNativePrompt(true);
      // Clear soft dismissal — we now have a real native prompt to offer.
      // The floating FAB (PwaInstallButton) will handle the install trigger,
      // so we don't force the popup open here.
      try { localStorage.removeItem(SOFT_DISMISSED_KEY); } catch {}
    };
    window.addEventListener("beforeinstallprompt", handleBIP);

    // Step 4: Auto-show on timer
    const timer = setTimeout(() => {
      if (canShow() && !isStandalone() && !isInstalled()) {
        setShowPopup(true);
      }
    }, SHOW_DELAY_MS);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBIP);
      clearTimeout(timer);
    };
  }, []);

  // Listen for appinstalled
  useEffect(() => {
    const handler = () => {
      try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
      window.__deferredInstallPrompt = null;
      setHasNativePrompt(false);
      setShowPopup(false);
    };
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  // Handle install button tap
  const handleInstall = useCallback(async () => {
    const prompt = window.__deferredInstallPrompt;

    if (prompt) {
      // Chromium: trigger native install dialog
      setInstalling(true);
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === "accepted") {
          try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
        } else {
          // User rejected the NATIVE dialog — hard dismiss (6h)
          markHardDismissed();
        }
        window.__deferredInstallPrompt = null;
        setHasNativePrompt(false);
      } catch {
        // Error — don't dismiss, let user retry
      }
      setInstalling(false);
      setShowPopup(false);
      return;
    }

    // iOS Safari: open share sheet (contains "Add to Home Screen")
    if (platform === "ios" && typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "BeliMesin",
          text: "Marketplace Mesin Industri #1 di Indonesia",
          url: window.location.href,
        });
      } catch {
        // User cancelled share sheet
      }
      setShowPopup(false);
      markSoftDismissed();
      return;
    }

    // No native prompt available (desktop without beforeinstallprompt, or
    // iOS without share API): just close the popup with soft dismissal.
    setShowPopup(false);
    markSoftDismissed();
  }, [platform]);

  // Explicit dismiss ("Nanti saja") — soft dismissal (7 days)
  const handleDismiss = useCallback(() => {
    setShowPopup(false);
    markSoftDismissed();
  }, []);

  // Don't render if standalone, installed, or hidden
  if (isStandalone() || isInstalled() || !showPopup) return null;

  const platformIcon =
    platform === "ios" ? <Tablet className="size-4" /> :
    platform === "android" ? <Smartphone className="size-4" /> :
    <Monitor className="size-4" />;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleDismiss}
      />

      {/* Popup Card — Play Store-like bottom sheet on mobile, centered card on desktop */}
      <div className="relative w-full max-w-sm animate-in slide-in-from-bottom-8 fade-in duration-300 sm:zoom-in-95 sm:slide-in-from-bottom-4">
        <div className="overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-2xl">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm hover:bg-black/40 transition"
            aria-label="Tutup"
          >
            <X className="size-4" />
          </button>

          {/* Top gradient header with app icon — like Play Store hero */}
          <div className="relative bg-gradient-to-br from-primary via-orange-600 to-amber-600 px-5 pb-6 pt-7">
            <div className="flex items-center gap-4">
              {/* App icon */}
              <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-white shadow-xl ring-2 ring-white/40">
                <img src="/pwa-icon-192.png" alt="BeliMesin" className="size-16 rounded-xl" />
              </div>
              {/* App name + rating — like Play Store */}
              <div className="min-w-0 flex-1 text-white">
                <h2 className="truncate text-xl font-bold leading-tight">
                  {tr("title", lang)}
                </h2>
                <p className="text-xs text-white/80">
                  {tr("subtitle", lang)}
                </p>
                {/* Rating row */}
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className="size-3 fill-yellow-300 text-yellow-300" />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-white">
                    {tr("rating", lang)}
                  </span>
                  <span className="text-[10px] text-white/70">· {tr("ratingText", lang)}</span>
                </div>
              </div>
            </div>
            {/* FREE badge */}
            <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
              <Zap className="size-3" />
              {tr("free", lang)}
            </div>
          </div>

          {/* Description + features */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {tr("desc", lang)}
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Smartphone className="size-3.5" />
                </div>
                <span className="text-sm text-foreground">{tr("feature1", lang)}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-3.5" />
                </div>
                <span className="text-sm text-foreground">{tr("feature2", lang)}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  {platformIcon}
                </div>
                <span className="text-sm text-foreground">{tr("feature3", lang)}</span>
              </div>
            </div>
          </div>

          {/* iOS instructions (only on iOS without native prompt) */}
          {platform === "ios" && !hasNativePrompt && (
            <div className="mx-5 mt-2 mb-1 rounded-xl bg-muted/60 p-3">
              <p className="text-center text-xs font-medium text-muted-foreground">
                {tr("iosStep1", lang)} <Share2 className="inline size-3.5 mx-0.5 -mt-0.5" />
              </p>
              <p className="mt-1 text-center text-xs font-semibold text-foreground">
                {tr("iosStep2", lang)}
              </p>
            </div>
          )}

          {/* Desktop hint without native prompt */}
          {platform === "desktop" && !hasNativePrompt && (
            <div className="mx-5 mt-2 mb-1 rounded-xl bg-muted/60 p-3">
              <p className="text-center text-xs text-muted-foreground">
                {tr("desktopHint", lang)}
              </p>
            </div>
          )}

          {/* Action buttons — Play Store style */}
          <div className="px-5 pt-3 pb-5">
            <Button
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-primary to-orange-600 text-base font-bold text-white shadow-lg hover:opacity-90 gap-2"
              onClick={handleInstall}
              disabled={installing}
            >
              <Download className="size-5" />
              {installing ? tr("installing", lang) : tr("install", lang)}
            </Button>
            <button
              onClick={handleDismiss}
              className="mt-2 w-full py-2.5 text-center text-sm font-medium text-muted-foreground hover:text-foreground transition"
            >
              {tr("later", lang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
