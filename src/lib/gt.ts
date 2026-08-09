"use client";

import { useSyncExternalStore } from "react";

// Google Translate helper functions
// These work with the GT widget loaded in layout.tsx

export type GTLang = "id" | "en";

// Read the current language from the googtrans cookie
// Cookie format: googtrans=/id/en  (or /id/id for original)
// IMPORTANT: check ALL googtrans cookies — if ANY is /id/en, treat as English.
export function getGTLang(): GTLang {
  if (typeof document === "undefined") return "id";
  const cookies = document.cookie.split(";");
  for (const c of cookies) {
    const trimmed = c.trim();
    if (trimmed.startsWith("googtrans=")) {
      const value = trimmed.substring("googtrans=".length);
      const match = value.match(/\/[^/]+\/([^;]+)/);
      if (match && match[1] === "en") return "en";
    }
  }
  return "id";
}

// Internal store for GT language (so React can subscribe to changes)
let gtLangStore: GTLang = "id";
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

const emptySubscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

function getSnapshot(): GTLang {
  return gtLangStore;
}

// React hook to use the GT language in components (SSR-safe)
export function useGTLang(): GTLang {
  return useSyncExternalStore(emptySubscribe, getSnapshot, () => "id" as GTLang);
}

// Delete ALL googtrans cookies on every domain/path variant
function clearAllGoogtransCookies() {
  const host = window.location.hostname;
  const parts = host.split(".");
  // Build list of domains to try: "", host, ".host", and parent domains
  const domains: string[] = [""];
  domains.push(host);
  domains.push("." + host);
  // e.g. for a.b.c.example.com → .example.com, .c.example.com, etc.
  for (let i = 1; i < parts.length - 1; i++) {
    const d = "." + parts.slice(i).join(".");
    domains.push(d);
  }
  const paths = ["/", ""];
  for (const d of domains) {
    for (const p of paths) {
      const domainPart = d ? "; domain=" + d : "";
      const pathPart = p ? "; path=" + p : "; path=/";
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT" + pathPart + domainPart;
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + domainPart;
    }
  }
}

// Set the googtrans cookie and reload the page to apply the language change.
// Google Translate modifies the DOM (wraps text in <font> tags), so a reload
// is the most reliable way to switch languages (especially back to original).
export function setGTLang(lang: GTLang) {
  if (typeof document === "undefined") return;

  // STEP 1: Clear ALL existing googtrans cookies (on every domain variant)
  clearAllGoogtransCookies();

  // STEP 2: Set the new cookie
  // For "id": set googtrans=/id/id (translate to itself = no visible translation)
  // For "en": set googtrans=/id/en
  if (lang !== "id") {
    const value = "/id/" + lang;
    const host = window.location.hostname;
    document.cookie = "googtrans=" + value + "; path=/";
    document.cookie = "googtrans=" + value + "; path=/; domain=" + host;
    if (host.includes(".")) {
      document.cookie = "googtrans=" + value + "; path=/; domain=." + host;
    }
  }
  // For "id": leave cookies cleared (no googtrans = original Indonesian)

  // STEP 3: Update internal store immediately so flag updates before reload
  gtLangStore = lang;
  notifyListeners();

  // STEP 4: Reload the page so the cookie takes effect on GT init
  window.location.reload();
}

// Initialize the store from cookie on client side (called once at module load)
function initGTLang() {
  gtLangStore = getGTLang();
  notifyListeners();
}

// Auto-initialize on client side immediately (module load)
if (typeof window !== "undefined") {
  initGTLang();
}
