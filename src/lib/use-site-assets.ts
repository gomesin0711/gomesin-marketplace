"use client";

import { useQuery } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// useSiteAssets — fetches site-wide asset URLs + versions from
// /api/admin/settings. Used by components that display the QRIS image (and
// could be used for other admin-editable assets in the future).
//
// The admin can upload new QRIS / ringtone files via the admin panel. The
// upload endpoint writes the file to public/ and updates the corresponding
// *Url and *Version settings. Components then invalidate the "admin-settings"
// query to refetch and re-render with the new URL+cache-bust.
//
// Returns an object with cache-busted URLs ready to use in <img src> / <audio>.
// ---------------------------------------------------------------------------

type SiteAssets = {
  qrisImageUrl: string;
  chatSoundUrl: string;
  listingSoundUrl: string;
  // Raw settings (for the admin panel form)
  raw: Record<string, string>;
};

const DEFAULTS: Record<string, string> = {
  qrisImageUrl: "/qris-mesinKU.jpeg",
  qrisImageVersion: "2",
  chatSoundUrl: "/sounds/mesinku-chat.wav",
  chatSoundVersion: "8",
  listingSoundUrl: "/sounds/iklan-masuk.wav",
  listingSoundVersion: "3",
};

/** Build a cache-busted URL: "<path>?v=<version>" */
function cacheBust(url: string, version: string | undefined): string {
  if (!url) return url;
  const cleanUrl = url.split("?")[0];
  return `${cleanUrl}?v=${version || "1"}`;
}

export function useSiteAssets() {
  const { data, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    staleTime: 0,
  });

  const settings = { ...DEFAULTS, ...(data || {}) };

  const assets: SiteAssets = {
    qrisImageUrl: cacheBust(settings.qrisImageUrl, settings.qrisImageVersion),
    chatSoundUrl: cacheBust(settings.chatSoundUrl, settings.chatSoundVersion),
    listingSoundUrl: cacheBust(settings.listingSoundUrl, settings.listingSoundVersion),
    raw: settings,
  };

  return { ...assets, isLoading };
}
