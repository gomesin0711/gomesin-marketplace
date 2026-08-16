/**
 * Shared helpers for Supabase code paths.
 *
 * Supabase returns timestamps WITHOUT a trailing "Z" (e.g. "2026-08-16T04:21:37.378")
 * while Prisma's Date.toISOString() includes it ("2026-08-16T04:21:37.378Z").
 * Normalize so the production JSON matches local JSON byte-for-byte.
 */

export function normalizeSupabaseDate(d: any): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  if (typeof d === "string") {
    // Supabase returns timestamps without Z and may strip trailing zeros
    // from milliseconds (e.g. "2026-08-16T03:23:15.62" instead of
    // "2026-08-16T03:23:15.620Z"). Normalize to match Prisma's toISOString()
    // which always produces 3-digit milliseconds + Z.
    const m = d.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z?)$/);
    if (m) {
      let ms = m[2] || ".000";
      ms = ms.padEnd(4, "0").slice(0, 4); // ".62" -> ".620", ".6" -> ".600"
      return m[1] + ms + "Z";
    }
    return d.endsWith("Z") ? d : d + "Z";
  }
  return d;
}

/** Recursively normalize all date-like string fields in an object. */
export function normalizeSupabaseDates<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    // Only normalize strings that look like ISO timestamps without Z
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(obj) && !obj.endsWith("Z")) {
      return (obj + "Z") as unknown as T;
    }
    return obj;
  }
  if (obj instanceof Date) return obj.toISOString() as unknown as T;
  if (Array.isArray(obj)) {
    return obj.map(normalizeSupabaseDates) as unknown as T;
  }
  if (typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj as any)) {
      out[k] = normalizeSupabaseDates(v);
    }
    return out;
  }
  return obj;
}
