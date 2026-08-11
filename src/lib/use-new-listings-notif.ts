"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { playListingNotificationSound } from "@/lib/notification-sound";

/**
 * Tracks "new listings" notifications for the user.
 *
 * - Polls the latest listings every 60 seconds.
 * - Stores `lastSeenAt` (ISO timestamp) in localStorage.
 * - Returns the count of listings whose `createdAt` is newer than `lastSeenAt`.
 * - `markAllSeen()` updates `lastSeenAt` to "now" — which clears the badge.
 * - Plays the "Iklan baru nih" ringtone when NEW listings are detected
 *   (count increases beyond the previous known count).
 *
 * The list of new listings itself is also returned so the bell dropdown can
 * display them. Once the user opens the dropdown, `markAllSeen()` is called
 * and the badge count drops to 0 (the dropdown content becomes empty on next
 * render — matching the user requirement: "apabila sudah dilihat maka isi
 * notif kosong").
 */

const STORAGE_KEY = "gomesin-new-listings-seen-at";

function getSeenAt(): number {
  if (typeof window === "undefined") return Date.now();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // First-ever visit: seed with "now" so we don't surface every existing ad.
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, String(now));
    return now;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : Date.now();
}

function setSeenAt(ts: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(ts));
}

async function fetchNewest(): Promise<{ listings: any[] }> {
  const res = await fetch("/api/listings?sort=newest&limit=24");
  if (!res.ok) throw new Error("fail");
  return res.json();
}

export function useNewListingsNotif() {
  const [seenAt, setSeenAtState] = useState<number>(() => getSeenAt());

  const { data } = useQuery({
    queryKey: ["new-listings-notif"],
    queryFn: fetchNewest,
    refetchInterval: 60_000, // poll every minute
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // Keep seenAt in sync if it changes in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSeenAtState(getSeenAt());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const allListings = data?.listings ?? [];

  // New listings = createdAt newer than seenAt.
  const newListings = allListings.filter((l: any) => {
    const created = l.createdAt ? new Date(l.createdAt).getTime() : 0;
    return created > seenAt;
  });

  const count = newListings.length;

  // Play the "Iklan baru nih" ringtone when NEW listings appear.
  // We track the previous count in a ref — only play when the count
  // INCREASES (not on first load, and not when it drops to 0 after markAllSeen).
  const prevCountRef = useRef<number>(0);
  // Skip the very first data load so we don't sound off for pre-existing listings.
  const firstLoadRef = useRef<boolean>(true);
  useEffect(() => {
    if (firstLoadRef.current) {
      // First time we get data — seed prevCount without playing sound.
      prevCountRef.current = count;
      firstLoadRef.current = false;
      return;
    }
    if (count > prevCountRef.current) {
      // New listings detected since last poll — play the ringtone.
      playListingNotificationSound();
    }
    prevCountRef.current = count;
  }, [count]);

  const markAllSeen = () => {
    const now = Date.now();
    setSeenAt(now);
    setSeenAtState(now);
  };

  return { count, newListings, markAllSeen, seenAt };
}
