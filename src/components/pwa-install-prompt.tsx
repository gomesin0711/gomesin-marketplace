"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Download } from "lucide-react";
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
 * STORAGE STRATEGY (compact, non-intrusive):
 *   - INSTALLED_KEY (localStorage): Set when the native install dialog is
 *     ACCEPTED. Cleared on every mount if the app is NOT actually running
 *     in standalone mode — so uninstalling the PWA resets the state.
 *   - SOFT_DISMISSED_KEY (localStorage, 1 day): Set when the user clicks
 *     "Nanti" (the X or later button). Persists for 1 day — popup re-shows
 *     on next day's visit. The floating Install FAB still appears when
 *     beforeinstallprompt fires, so users can install on their own terms.
 *   - HARD_DISMISSED_KEY (localStorage, 6h): Set when the user rejects the
 *     NATIVE install dialog (Chrome's own popup). Respects Chrome's 30-day
 *     re-prompt rule.
 *
 * POPUP BEHAVIOR (per user feedback):
 *   - Shows on page refresh / load (after a short 1.5s delay so the page
 *     can paint first — prevents any perceived "mobile broken" issue).
 *   - Does NOT show if app is already installed or running standalone.
 *   - Compact card (max ~340px wide), no full-screen backdrop, does NOT
 *     block page interactions — pointer-events pass through everywhere
 *     except on the card itself.
 */
const INSTALLED_KEY = "gomesin-pwa-installed";
const SOFT_DISMISSED_KEY = "gomesin-pwa-soft-dismissed";
const HARD_DISMISSED_KEY = "gomesin-pwa-hard-dismissed";
const HARD_DISMISS_MS = 6 * 60 * 60 * 1000; // 6 hours — native dialog rejected
const SOFT_DISMISS_MS = 24 * 60 * 60 * 1000; // 1 day — "Nanti" / X click

// Short delay so the page can render first. Prevents the popup from
// appearing before the user sees the content, which on slow mobile
// networks can make the page feel "broken".
const SHOW_DELAY_MS = 1500;

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
 * Clear stale INSTALLED_KEY if not actually in standalone mode.
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
  // Clear stale "installed" flag first.
  clearStaleInstalled();
  if (isInstalled()) return false;
  if (isSoftDismissed()) return false;
  if (isHardDismissed()) return false;
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
  title:      { id: "Install BeliMesin", en: "Install BeliMesin", zh: "\u5b89\u88c5 BeliMesin" },
  desc:       { id: "Akses cepat dari home screen", en: "Quick access from home screen", zh: "\u4ece\u4e3b\u5c4f\u5feb\u901f\u8bbf\u95ee" },
  install:    { id: "Install", en: "Install", zh: "\u5b89\u88c5" },
  installing: { id: "Menginstall...", en: "Installing...", zh: "\u5b89\u88c5\u4e2d..." },
  free:       { id: "GRATIS", en: "FREE", zh: "\u514d\u8d39" },
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
  const { lang } = useLang();

  const platform: Platform = typeof window !== "undefined" ? detectPlatform() : "desktop";

  /*
   * STRATEGY (compact, non-blocking):
   *   1. On mount, clear any stale "installed" flag if not standalone.
   *   2. Show the compact popup after a short SHOW_DELAY_MS (1.5s) so the
   *      page can paint first. This makes the popup "appear on refresh"
   *      as the user requested, without breaking the page on slow mobile
   *      networks.
   *   3. Capture beforeinstallprompt reactively (in the head script +
   *      here) so the Install button can trigger the native dialog when
   *      available.
   *   4. Hard dismissal (native dialog rejected) blocks for 6 hours.
   *      Soft dismissal ("Nanti" / X) blocks for 1 day — popup re-shows
   *      on next day's visit.
   *   5. Never show if already installed or running standalone.
   */
  useEffect(() => {
    // Step 1: clear stale installed flag
    clearStaleInstalled();

    // Don't show if already running as standalone app or genuinely installed
    if (isStandalone() || isInstalled()) return;

    // Step 2: Show popup after a short delay so the page renders first
    const timer = setTimeout(() => {
      if (canShow() && !isStandalone() && !isInstalled()) {
        setShowPopup(true);
      }
    }, SHOW_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Listen for appinstalled
  useEffect(() => {
    const handler = () => {
      try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
      window.__deferredInstallPrompt = null;
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

    // No native prompt available: just close the popup with soft dismissal.
    setShowPopup(false);
    markSoftDismissed();
  }, [platform]);

  // Explicit dismiss ("Nanti" / X) — soft dismissal (1 day)
  const handleDismiss = useCallback(() => {
    setShowPopup(false);
    markSoftDismissed();
  }, []);

  // Don't render if standalone, installed, or hidden
  if (isStandalone() || isInstalled() || !showPopup) return null;

  return (
    /*
     * COMPACT, NON-BLOCKING POPUP
     * ----------------------------
     * No full-screen backdrop. The container is `pointer-events-none`
     * so clicks/taps pass through to the page below. Only the card itself
     * has `pointer-events-auto`. This prevents the popup from blocking
     * page interactions or causing perceived "application error" on
     * mobile devices.
     *
     * Card is anchored to the bottom-center on mobile (small, ~340px max)
     * and bottom-right on desktop. Compact single-row header with app
     * icon + title + close, then a single Install button below.
     */
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 pb-24 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:justify-end sm:pb-0"
      role="dialog"
      aria-label={tr("title", lang)}
    >
      <div className="pointer-events-auto w-full max-w-[340px] animate-in slide-in-from-bottom-4 fade-in duration-300 rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header row: app icon + title + close */}
        <div className="flex items-center gap-3 p-3 pb-2">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-orange-600 shadow">
            <img
              src="/pwa-icon-192.png"
              alt="BeliMesin"
              className="size-9 rounded-lg"
              width={36}
              height={36}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold leading-tight text-foreground">
              {tr("title", lang)}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {tr("desc", lang)}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Tutup"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Action button */}
        <div className="px-3 pb-3">
          <Button
            className="h-10 w-full gap-2 rounded-xl bg-gradient-to-r from-primary to-orange-600 text-sm font-bold text-white shadow"
            onClick={handleInstall}
            disabled={installing}
          >
            <Download className="size-4" />
            {installing ? tr("installing", lang) : tr("install", lang)}
            <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold leading-none">
              {tr("free", lang)}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
