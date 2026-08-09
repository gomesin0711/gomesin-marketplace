"use client";

import { useState, useEffect } from "react";

// Returns `initialValue` on SSR and first render, then switches to `clientValue` after mount.
// This prevents hydration mismatches while allowing client-only values.
export function useStateSync<T>(initialValue: T, clientValue: T): T {
  const [value, setValue] = useState<T>(initialValue);
  useEffect(() => {
    setValue(clientValue);
  }, [clientValue]);
  return value;
}
