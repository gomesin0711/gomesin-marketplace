"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Persistent Floating Install Button                                 */
/* ------------------------------------------------------------------ */
/*
 * WHY THIS EXISTS:
 *   On mobile Chrome, the `beforeinstallprompt` event fires UNPREDICTABLY
 *   — it requires the SW to be active AND Chrome's engagement heuristic
 *   to be satisfied, which can take 30+ seconds or require scrolling.
 *   The auto-popup (pwa-install-prompt.tsx) often shows "Mengerti" because
 *   the prompt hasn't arrived yet, and once dismissed the user has no way
 *   to install.
 *
 *   This FAB solves that: it appears the MOMENT `beforeinstallprompt` is
 *   captured (whenever that is) and stays visible until the user installs
 *   or dismisses it. Tapping it triggers the native install dialog
 *   immediately — no timing dependency.
 *
 *   The button is positioned bottom-right, above the bottom nav (mobile)
 *   and bottom-right on desktop.
 */

interface DeferredPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __deferredInstallPrompt: DeferredPrompt | null;
  }
}

const FAB_DISMISSED_KEY = "gomesin-pwa-fab-dismissed";
const FAB_DISMISS_MS = 30 * 60 * 1000; // 30 min — re-show after a while
const INSTALLED_KEY = "gomesin-pwa-installed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    ("standalone" in navigator && (navigator as unknown as Record<string, boolean>).standalone === true)
  );
}

function isInstalled(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; }
}

function fabCanShow(): boolean {
  try {
    const raw = localStorage.getItem(FAB_DISMISSED_KEY);
    if (!raw) return true;
    const ts = Number(raw);
    if (isNaN(ts)) return true;
    return Date.now() - ts > FAB_DISMISS_MS;
  } catch { return true; }
}

function fabMarkDismissed() {
  try { localStorage.setItem(FAB_DISMISSED_KEY, String(Date.now())); } catch {}
}

export function PwaInstallButton() {
  const [hasPrompt, setHasPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [visible, setVisible] = useState(false);

  /* ------ Detect existing captured prompt + listen for new ones ------ */
  useEffect(() => {
    if (isStandalone() || isInstalled()) return;

    const checkAndShow = () => {
      if (window.__deferredInstallPrompt && fabCanShow()) {
        setHasPrompt(true);
        setVisible(true);
      }
    };

    // Check immediately (prompt may have been captured before mount)
    checkAndShow();

    // Real-time listener
    const handleBIP = () => {
      setHasPrompt(true);
      // Clear FAB dismissal when a fresh prompt arrives
      try { localStorage.removeItem(FAB_DISMISSED_KEY); } catch {}
      if (fabCanShow()) setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handleBIP);

    // Poll a few times in the first 60s — mobile Chrome can fire the event
    // late (after SW activation + engagement heuristic). This catches it.
    const polls = [2000, 5000, 10000, 20000, 35000, 60000].map((ms) =>
      setTimeout(checkAndShow, ms)
    );

    // Hide on appinstalled
    const handleInstalled = () => {
      setHasPrompt(false);
      setVisible(false);
    };
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBIP);
      window.removeEventListener("appinstalled", handleInstalled);
      polls.forEach(clearTimeout);
    };
  }, []);

  /* ------ Trigger native install dialog ------ */
  const handleInstall = useCallback(async () => {
    const prompt = window.__deferredInstallPrompt;
    if (!prompt) return;

    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
        setVisible(false);
      } else {
        // User dismissed native dialog — hide FAB for a while
        fabMarkDismissed();
        setVisible(false);
      }
      window.__deferredInstallPrompt = null;
      setHasPrompt(false);
    } catch {
      // Error — keep the FAB so user can retry
    }
    setInstalling(false);
  }, []);

  /* ------ Dismiss FAB (X button) ------ */
  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    fabMarkDismissed();
    setVisible(false);
  }, []);

  if (!visible || !hasPrompt || isStandalone() || isInstalled()) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      disabled={installing}
      aria-label="Install aplikasi mesinKU"
      className="group fixed right-4 bottom-20 z-[90] flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-orange-600 px-4 py-3 text-sm font-bold text-white shadow-xl shadow-primary/30 transition-all hover:scale-105 hover:shadow-2xl active:scale-95 md:bottom-6 md:px-5 md:py-3.5"
    >
      {/* Pulsing ring to draw attention */}
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-primary/40" aria-hidden="true" />

      {installing ? (
        <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        <Download className="size-5" />
      )}
      <span className="hidden sm:inline">
        {installing ? "Menginstall..." : "Install Aplikasi"}
      </span>
      <span className="sm:hidden">
        {installing ? "..." : "Install"}
      </span>

      {/* Dismiss X — stops propagation so it doesn't trigger install */}
      <span
        role="button"
        tabIndex={0}
        onClick={handleDismiss}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDismiss(e as any); } }}
        className="ml-1 grid size-5 place-items-center rounded-full bg-white/20 hover:bg-white/40 transition"
        aria-label="Tutup"
      >
        <X className="size-3.5" />
      </span>
    </button>
  );
}
