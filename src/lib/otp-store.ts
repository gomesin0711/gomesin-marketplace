/**
 * Shared in-memory OTP store.
 *
 * WHY THIS FILE EXISTS:
 * Previously the OTP store lived inside `/api/auth/otp/route.ts` and the login
 * route imported `isPhoneVerified` from that route file. In Next.js, each API
 * route is bundled as a SEPARATE module — so the login route got a DIFFERENT
 * `otpStore` Map instance than the one the OTP POST handler writes to. The
 * result: OTP verification succeeded but login always reported "not verified".
 *
 * Moving the store to this shared lib module ensures every importer references
 * the SAME Map instance (in a given server process). This makes phone/WhatsApp
 * login work end-to-end in local dev and on a single long-running server.
 *
 * NOTE: On Vercel serverless, each function invocation is still a separate
 * process, so in-memory OTP won't persist across invocations in production.
 * A persistent store (Redis/Supabase) would be needed for production-grade
 * OTP. The current setup matches the rest of the app's local-dev-first design.
 */

export type OtpEntry = {
  code: string;
  expiresAt: number;
  verified: boolean;
};

/**
 * In Next.js, each API route is compiled into a SEPARATE bundle with its own
 * copy of imported lib modules. A plain `const otpStore = new Map()` would be
 * a different instance in the OTP route's bundle vs the login route's bundle,
 * so verification set in one would never be seen by the other.
 *
 * The fix: store the Map on `globalThis` so all bundles share ONE instance.
 * This is the same pattern Prisma uses for its dev-mode client singleton.
 */
declare global {
  var __mesinkuOtpStore: Map<string, OtpEntry> | undefined;
}

function getStore(): Map<string, OtpEntry> {
  if (typeof globalThis === "undefined") {
    // SSR without globalThis — fall back to a module-local Map (won't be shared,
    // but this path shouldn't be hit in normal Next.js runtime).
    return (getStore as any)._local ?? ((getStore as any)._local = new Map());
  }
  if (!globalThis.__mesinkuOtpStore) {
    globalThis.__mesinkuOtpStore = new Map<string, OtpEntry>();
  }
  return globalThis.__mesinkuOtpStore;
}

/** OTP lifetime in milliseconds (5 minutes — enough time to receive email & type code). */
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_LENGTH = 6;

/** Normalize a phone number to a canonical digits-only form (62-prefixed). */
export function normalizePhone(phone: string): string {
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  return p;
}

/** Generate a random numeric OTP code of the given length. */
export function generateOtpCode(length: number = OTP_LENGTH): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * 10)];
  }
  return code;
}

/** Store an OTP entry for a phone number (overwrites any previous entry). */
export function setOtp(phone: string, code: string, ttlMs: number = OTP_TTL_MS): OtpEntry {
  const normalized = normalizePhone(phone);
  const entry: OtpEntry = {
    code,
    expiresAt: Date.now() + ttlMs,
    verified: false,
  };
  getStore().set(normalized, entry);
  return entry;
}

/** Get the OTP entry for a phone number (or null if none). */
export function getOtp(phone: string): OtpEntry | null {
  const normalized = normalizePhone(phone);
  return getStore().get(normalized) ?? null;
}

/** Delete the OTP entry for a phone number. */
export function deleteOtp(phone: string): void {
  const normalized = normalizePhone(phone);
  getStore().delete(normalized);
}

/** Check whether the last OTP for a phone number has been verified. */
export function isPhoneVerified(phone: string): boolean {
  const normalized = normalizePhone(phone);
  const entry = getStore().get(normalized);
  return entry?.verified === true;
}

/** Mark the OTP entry for a phone number as verified. */
export function markPhoneVerified(phone: string): void {
  const normalized = normalizePhone(phone);
  const entry = getStore().get(normalized);
  if (entry) entry.verified = true;
}

/** Check rate-limit: returns the remaining wait seconds, or 0 if OK to send. */
export function getOtpCooldownSec(phone: string, resendWindowMs: number = 60_000): number {
  const normalized = normalizePhone(phone);
  const existing = getStore().get(normalized);
  if (!existing) return 0;
  const elapsedMs = Date.now() - (existing.expiresAt - OTP_TTL_MS);
  if (elapsedMs < resendWindowMs) {
    return Math.ceil((resendWindowMs - elapsedMs) / 1000);
  }
  return 0;
}

/**
 * Compare two phone numbers for equality, accounting for format differences.
 *
 * WHY THIS EXISTS:
 * Phone numbers in the DB may be stored in various formats:
 *   - "0812-0000-0000"  (local with dashes)
 *   - "0818666711"      (local, 10 digits)
 *   - "6281200000000"   (international, no +)
 *   - "+6281200000000"  (international with +)
 *
 * A naive `slice(-10)` comparison FAILS when the DB phone has exactly 10 digits
 * starting with "0" (e.g. "0818666711"), because:
 *   - DB raw digits:      "0818666711" → slice(-10) = "0818666711"
 *   - Input normalized:   "62818666711" → slice(-10) = "8186667111"
 *   These don't match because the "0" prefix is preserved in one but replaced
 *   with "62" in the other.
 *
 * The fix: normalize BOTH numbers through `normalizePhone()` first (so both are
 * in canonical 62-prefixed form), then compare exact OR by last-10-digits.
 */
export function phonesMatch(dbPhone: string | null, inputPhone: string): boolean {
  if (!dbPhone) return false;
  const dbNorm = normalizePhone(dbPhone);
  const inNorm = normalizePhone(inputPhone);
  if (!dbNorm || !inNorm) return false;
  return dbNorm === inNorm || dbNorm.slice(-10) === inNorm.slice(-10);
}
