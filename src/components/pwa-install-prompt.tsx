"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Download, Smartphone, Monitor, Tablet, Share2, ArrowUpFromLine, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Platform = "ios" | "android" | "desktop";
type Browser = "chrome" | "edge" | "samsung" | "huawei" | "opera" | "firefox" | "safari" | "other";

interface DeferredPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DISMISSED_KEY = "gomesin-pwa-dismissed";
const INSTALLED_KEY = "gomesin-pwa-installed";
const DISMISS_MS = 24 * 60 * 60 * 1000; // 1 day
const SHOW_DELAY_MS = 1000; // 1 second

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    __deferredInstallPrompt: DeferredPrompt | null;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    ("standalone" in navigator && (navigator as unknown as Record<string, boolean>).standalone === true)
  );
}

function canShow(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return true;
    const ts = Number(raw);
    if (isNaN(ts)) return true;
    return Date.now() - ts > DISMISS_MS;
  } catch {
    return true;
  }
}

function markDismissed() {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
}

function isInstalled(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; }
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

function detectBrowser(): Browser {
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/HuaweiBrowser/i.test(ua) || (/HUAWEI/i.test(ua) && /Mobile/i.test(ua))) return "huawei";
  if (/Firefox/i.test(ua)) return "firefox";
  if (/Edg/i.test(ua)) return "edge";
  if (/OPR|Opera/i.test(ua)) return "opera";
  if (/Chrome/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

function isChromium(b: Browser): boolean {
  return ["chrome", "edge", "samsung", "huawei", "opera"].includes(b);
}

/* ------------------------------------------------------------------ */
/*  Translations                                                       */
/* ------------------------------------------------------------------ */

const T: Record<string, Record<string, string>> = {
  popupTitle:    { id: "Install Aplikasi Gomesin", en: "Install Gomesin App", zh: "\u5b89\u88c5 Gomesin \u5e94\u7528" },
  popupDesc:     { id: "Akses marketplace mesin industri terlengkap langsung dari home screen Anda.", en: "Access the largest industrial machinery marketplace directly from your home screen.", zh: "\u4ece\u4e3b\u5c4f\u5e55\u76f4\u63a5\u8bbf\u95ee\u6700\u5927\u7684\u5de5\u4e1a\u673a\u68b0\u5e02\u573a\u3002" },
  install:       { id: "Install Sekarang", en: "Install Now", zh: "\u7acb\u5373\u5b89\u88c5" },
  later:         { id: "Nanti Saja", en: "Not Now", zh: "\u4ee5\u540e\u518d\u8bf4" },
  benefit1:      { id: "Buka langsung dari home screen", en: "Open directly from home screen", zh: "\u4ece\u4e3b\u5c4f\u5e55\u76f4\u63a5\u6253\u5f00" },
  benefit2:      { id: "Tampilan seperti aplikasi native", en: "Native app-like experience", zh: "\u7c7b\u4f3c\u539f\u751f\u5e94\u7528\u4f53\u9a8c" },
  benefit3:      { id: "Notifikasi instan untuk chat & iklan", en: "Instant notifications for chat & ads", zh: "\u804a\u5929\u548c\u5e7f\u544a\u5373\u65f6\u901a\u77e5" },
  iosStep1:      { id: "Tekan tombol", en: "Tap the", zh: "\u70b9\u51fb" },
  iosStep1Icon:  { id: "Share", en: "Share", zh: "\u5206\u4eab" },
  iosStep2:      { id: "di bilah bawah browser", en: "button in the browser bottom bar", zh: "\u6d4f\u89c8\u5668\u5e95\u90e8\u680f\u7684\u6309\u94ae" },
  iosStep3:      { id: 'Lalu pilih "Tambahkan ke Layar Utama"', en: 'Then select "Add to Home Screen"', zh: '\u7136\u540e\u9009\u62e9\u201c\u6dfb\u52a0\u5230\u4e3b\u5c4f\u5e55\u201d' },
  desktopHint:   { id: "Klik ikon install (\u2295) di bilah alamat browser, lalu pilih \"Install\"", en: "Click the install icon in your browser address bar, then select \"Install\"", zh: "\u70b9\u51fb\u6d4f\u89c8\u5668\u5730\u5740\u680f\u4e2d\u7684\u5b89\u88c5\u56fe\u6807\uff0c\u7136\u540e\u9009\u62e9\"\u5b89\u88c5\"" },
  gotIt:        { id: "Mengerti", en: "Got it", zh: "\u660e\u767d\u4e86" },
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
  const mountedRef = useRef(false);

  const platform: Platform = typeof window !== "undefined" ? detectPlatform() : "desktop";
  const browser: Browser = typeof window !== "undefined" ? detectBrowser() : "chrome";
  const chromium = isChromium(browser);

  /* ------ Show popup after 1 second ------ */
  useEffect(() => {
    if (isStandalone() || isInstalled() || !canShow()) return;

    // Check if early-captured prompt exists
    const checkPrompt = () => {
      if (window.__deferredInstallPrompt) {
        setHasNativePrompt(true);
      }
    };

    // Check immediately + poll a few times (SW activates async)
    checkPrompt();
    const poll1 = setTimeout(checkPrompt, 500);
    const poll2 = setTimeout(checkPrompt, 1000);

    // Show popup after delay
    const timer = setTimeout(() => {
      checkPrompt();
      mountedRef.current = true;
      setShowPopup(true);
    }, SHOW_DELAY_MS);

    return () => { clearTimeout(poll1); clearTimeout(poll2); clearTimeout(timer); };
  }, []);

  /* ------ Listen for appinstalled ------ */
  useEffect(() => {
    const handler = () => {
 window.__deferredInstallPrompt = null;
      setHasNativePrompt(false);
      setShowPopup(false);
    };
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  /* ------ handle install button tap ------ */
  const handleInstall = useCallback(async () => {
    // Use early-captured prompt (most reliable)
    const prompt = window.__deferredInstallPrompt;

    if (prompt) {
      setInstalling(true);
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === "accepted") {
          try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
        } else {
          markDismissed();
        }
        window.__deferredInstallPrompt = null;
        setHasNativePrompt(false);
      } catch {
        // User cancelled or error
      }
      setInstalling(false);
      setShowPopup(false);
      return;
    }

    // iOS Safari: open share sheet
    if (platform === "ios" && navigator.share) {
      try {
        await navigator.share({
          title: "Gomesin",
          text: "Marketplace Mesin Industri #1 di Indonesia",
          url: window.location.href,
        });
      } catch {
        // User cancelled
      }
      setShowPopup(false);
      markDismissed();
      return;
    }

    // Desktop/Android without native prompt: just dismiss, instructions already shown
    setShowPopup(false);
    markDismissed();
  }, [platform]);

  /* ------ dismiss ------ */
  const handleDismiss = useCallback(() => {
    setShowPopup(false);
    markDismissed();
  }, []);

  /* ------ don't render if standalone, installed, or hidden ------ */
  if (isStandalone() || isInstalled() || !showPopup) return null;

  /* ------ Instructions ------ */
  const renderInstructions = () => {
    if (platform === "ios") {
      return (
        <div className="mt-4 rounded-xl bg-muted/50 p-3">
          <p className="text-center text-xs font-medium text-muted-foreground">
            {tr("iosStep1", lang)}
            <Share2 className="inline size-3.5 mx-0.5 -mt-0.5" />
            {tr("iosStep1Icon", lang)} {tr("iosStep2", lang)}
          </p>
          <p className="mt-1 text-center text-xs font-semibold text-foreground">
            {tr("iosStep3", lang)}
          </p>
        </div>
      );
    }

    // Chromium desktop/mobile without native install prompt (Edge, Chrome with dismissed prompt, etc.)
    if (chromium && !hasNativePrompt) {
      return (
        <div className="mt-4 rounded-xl bg-primary/5 border border-primary/10 p-3">
          <div className="flex items-start gap-2.5">
            <MonitorSmartphone className="size-5 shrink-0 mt-0.5 text-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {tr("desktopHint", lang)}
            </p>
          </div>
        </div>
      );
    }

    // Non-Chromium desktop
    if (platform === "desktop" && !chromium) {
      return (
        <div className="mt-4 rounded-xl bg-muted/50 p-3">
          <p className="text-center text-xs text-muted-foreground">
            {tr("desktopHint", lang)}
          </p>
        </div>
      );
    }

    return null;
  };

  const platformIcon =
    platform === "ios" ? <Tablet className="size-5" /> :
    platform === "android" ? <Smartphone className="size-5" /> :
    <Monitor className="size-5" />;

  const installBtnLabel = hasNativePrompt
    ? tr("install", lang)
    : (platform === "ios" ? tr("install", lang) : tr("gotIt", lang));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleDismiss}
      />

      {/* Popup Card */}
      <div className="relative w-full max-w-sm animate-in zoom-in-95 fade-in duration-300 slide-in-from-bottom-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Top gradient header */}
          <div className="relative bg-gradient-to-br from-primary to-orange-600 px-6 pb-8 pt-6 text-center">
            <button
              onClick={handleDismiss}
              className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30 transition"
              aria-label="Tutup"
            >
              <X className="size-4" />
            </button>

            <div className="mx-auto mb-3 grid size-20 place-items-center rounded-2xl bg-white shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pwa-icon-192.png" alt="Gomesin" className="size-16 rounded-xl" />
            </div>

            <h2 className="text-lg font-bold text-white">
              {tr("popupTitle", lang)}
            </h2>
            <p className="mt-1 text-xs text-white/80 leading-relaxed">
              {tr("popupDesc", lang)}
            </p>
          </div>

          {/* Benefits */}
          <div className="px-5 pt-5 pb-2">
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <ArrowUpFromLine className="size-4" />
                </div>
                <span className="text-sm text-foreground">{tr("benefit1", lang)}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Smartphone className="size-4" />
                </div>
                <span className="text-sm text-foreground">{tr("benefit2", lang)}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  {platformIcon}
                </div>
                <span className="text-sm text-foreground">{tr("benefit3", lang)}</span>
              </div>
            </div>
          </div>

          {/* Platform instructions */}
          <div className="px-5">
            {renderInstructions()}
          </div>

          {/* Action buttons */}
          <div className="px-5 pt-3 pb-5">
            <Button
              className="w-full h-12 rounded-xl bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90 gap-2 shadow-md"
              onClick={handleInstall}
              disabled={installing}
            >
              <Download className="size-5" />
              {installing ? "Menginstall..." : installBtnLabel}
            </Button>
            <button
              onClick={handleDismiss}
              className="mt-2 w-full py-2.5 text-center text-sm text-muted-foreground hover:text-foreground transition"
            >
              {tr("later", lang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
