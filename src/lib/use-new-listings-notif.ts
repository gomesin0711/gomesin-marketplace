"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * Tracks "new listings" notifications for the user.
 *
 * - Polls the latest listings every 60 seconds.
 * - Stores `lastSeenAt` (ISO timestamp) in localStorage.
 * - Returns the count of listings whose `createdAt` is newer than `lastSeenAt`.
 * - `markAllSeen()` updates `lastSeenAt` to "now" — which clears the badge.
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

  const markAllSeen = () => {
    const now = Date.now();
    setSeenAt(now);
    setSeenAtState(now);
  };

  return { count, newListings, markAllSeen, seenAt };
}
