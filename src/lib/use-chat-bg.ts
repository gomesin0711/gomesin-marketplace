"use client";
import { useState } from "react";
import { useTheme } from "next-themes";
import { useMounted } from "@/lib/use-mounted";

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

  // Detect dark mode via next-themes. Compute directly (no useState/useEffect)
  // to avoid the "setState in effect" lint warning and unnecessary re-renders.
  // `mounted` ensures we only read theme after hydration (avoids SSR mismatch).
  const mounted = useMounted();
  const { theme, resolvedTheme } = useTheme();
  // resolvedTheme handles "system" preference; fall back to theme.
  const activeTheme = mounted ? (resolvedTheme || theme) : undefined;
  const isDarkMode = activeTheme === "dark";

  const setBg = (key: string) => {
    setBgKey(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {}
  };

  const preset =
    CHAT_BG_PRESETS.find((p) => p.key === bgKey) || CHAT_BG_PRESETS[0];

  // In dark mode, ALWAYS use pure black background — overrides user preset.
  // This ensures the chat area is black in dark mode regardless of the
  // user's chat-bg preset selection (matching profile.tsx behavior).
  const bgStyle: React.CSSProperties = isDarkMode
    ? { backgroundColor: "#000000" }
    : preset.pattern
    ? {
        backgroundColor: preset.color,
        backgroundImage:
          "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.03) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }
    : { backgroundColor: preset.color };

  // In dark mode, treat the background as "dark" so text renders in white.
  const isDark = isDarkMode || !!preset.dark;

  return { bgKey, setBg, preset, bgStyle, isDark, presets: CHAT_BG_PRESETS };
}
