"use client";

import { useSyncExternalStore } from "react";

// Returns false on SSR and first client render, true after mount.
// Uses useSyncExternalStore to safely detect client-side without setState in render.
const emptySubscribe = () => () => {};

export function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,  // client: true
    () => false  // server: false
  );
}
