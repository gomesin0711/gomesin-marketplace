"use client";
import { useState } from "react";

export type ChatBgPreset = {
  key: string;
  label: string;
  color: string;
  pattern?: boolean;
  dark?: boolean;
};

export const CHAT_BG_PRESETS: ChatBgPreset[] = [
  { key: "default", label: "Default", color: "#e5ddd5", pattern: true },
  { key: "blue", label: "Biru", color: "#cfe8ff" },
  { key: "teal", label: "Tosca", color: "#d1f0e8" },
  { key: "green", label: "Hijau", color: "#d4ead4" },
  { key: "gray", label: "Abu", color: "#e9e9eb" },
  { key: "lavender", label: "Lavender", color: "#e6e0f0" },
  { key: "pink", label: "Pink", color: "#fce4ec" },
  { key: "cream", label: "Krim", color: "#fff3e0" },
  { key: "dark", label: "Gelap", color: "#1f2c34", dark: true },
  { key: "white", label: "Putih", color: "#ffffff" },
];

const STORAGE_KEY = "mesinku-chat-bg";
const LEGACY_KEY = "gomesin-chat-bg";

function readStoredBg(): string {
  if (typeof window === "undefined") return "default";
  try {
    // Migrate legacy key → new key once, so existing users keep their preference.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_KEY);
    }
    return localStorage.getItem(STORAGE_KEY) || "default";
  } catch {
    return "default";
  }
}

export function useChatBg() {
  // Lazy init: reads localStorage once on the client. SSR returns "default".
  // Safe because bgStyle is only applied to conditionally-rendered containers
  // (chat dialogs / panels), never to initial visible DOM.
  const [bgKey, setBgKey] = useState<string>(readStoredBg);

  const setBg = (key: string) => {
    setBgKey(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {}
  };

  const preset =
    CHAT_BG_PRESETS.find((p) => p.key === bgKey) || CHAT_BG_PRESETS[0];

  const bgStyle: React.CSSProperties = preset.pattern
    ? {
        backgroundColor: preset.color,
        backgroundImage:
          "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.03) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }
    : { backgroundColor: preset.color };

  const isDark = !!preset.dark;

  return { bgKey, setBg, preset, bgStyle, isDark, presets: CHAT_BG_PRESETS };
}
