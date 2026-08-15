import { promises as dns } from "dns";
import { isEmailTaken } from "@/lib/auth-fallback";

/* ------------------------------------------------------------------ */
/*  Email validation — verifies that the email's domain actually       */
/*  exists and can receive mail (MX records), so fake emails like      */
/*  "test@fakedomain123.xyz" are rejected before the user can          */
/*  proceed with registration.                                         */
/*                                                                    */
/*  Also blocks disposable/temporary email providers so users can't    */
/*  bypass verification with throwaway addresses.                      */
/* ------------------------------------------------------------------ */

export type EmailCheckResult = {
  /** Input email, normalized (trimmed + lowercased). */
  email: string;
  /** True if the email passes the basic format regex. */
  formatValid: boolean;
  /** True if the domain has valid MX records (can receive email). */
  domainValid: boolean;
  /** True if the domain is a known disposable/temporary email provider. */
  disposable: boolean;
  /** True if the email is already registered (DB + fallback store). */
  exists: boolean;
  /** Overall verdict — the single status the frontend should show. */
  status: "available" | "taken" | "invalidFormat" | "domainInvalid" | "disposable";
  /** Human-readable message (Indonesian) explaining the status. */
  message: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A curated list of common disposable/temporary email domains.
 * Users registering with these domains are blocked — they bypass
 * verification with throwaway addresses that they can't recover later.
 *
 * (Not exhaustive — focused on the most popular services.)
 */
const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "tempmail.net",
  "temp-mail.org",
  "throwawaymail.com",
  "throwaway.email",
  "yopmail.com",
  "yopmail.net",
  "getnada.com",
  "mailnesia.com",
  "trashmail.com",
  "trashmail.net",
  "trashmail.me",
  "fakeinbox.com",
  "sharklasers.com",
  "dispostable.com",
  "mintemail.com",
  "maildrop.cc",
  "mailcatch.com",
  "tempinbox.com",
  "spam4.me",
  "mohmal.com",
  "tempmailo.com",
  "emailondeck.com",
  "tempmailaddress.com",
  "tmpmail.org",
  "tmpmail.net",
  "moakt.com",
  "burnermail.io",
  "inboxbear.com",
  "mailpoof.com",
  "tempr.email",
  "discard.email",
  "mail-temp.com",
  "tempmailo.com",
  "mytemp.email",
  "tempmaildemo.com",
  "fake-mail.com",
  "fake-mail.net",
]);

// Cache MX lookups for 10 minutes to avoid hammering DNS on every keystroke.
// Key = lowercased domain, Value = { valid, expiresAt }.
const MX_CACHE_TTL_MS = 10 * 60 * 1000;
const mxCache = new Map<string, { valid: boolean; expiresAt: number }>();

/**
 * Check whether a domain has valid MX records (i.e. can receive email).
 *
 * Uses Node's built-in `dns.promises.resolveMx` — no external dependencies.
 * Results are cached for 10 minutes to avoid repeated DNS lookups for the
 * same domain (e.g. when the user types character-by-character).
 *
 * Note: per RFC 5321, if a domain has no MX records, mail can still be
 * delivered to its A/AAAA record. However, virtually all legitimate email-
 * providing domains publish MX records, so requiring MX is a strong signal
 * of a real email domain. We therefore treat "no MX" as invalid.
 */
export async function domainHasMx(domain: string): Promise<boolean> {
  const d = domain.toLowerCase().trim();
  if (!d) return false;

  const cached = mxCache.get(d);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.valid;
  }

  try {
    const records = await dns.resolveMx(d);
    const valid = Array.isArray(records) && records.length > 0;
    mxCache.set(d, { valid, expiresAt: Date.now() + MX_CACHE_TTL_MS });
    return valid;
  } catch (err: any) {
    // ENOTFOUND / ENODATA → domain doesn't exist or has no MX records
    // → invalid. Other errors (network) → be permissive (don't block).
    const code = err?.code;
    const invalid = code === "ENOTFOUND" || code === "ENODATA" || code === "ESERVFAIL";
    if (invalid) {
      mxCache.set(d, { valid: false, expiresAt: Date.now() + MX_CACHE_TTL_MS });
      return false;
    }
    // On transient/network errors, don't cache and don't block the user.
    return true;
  }
}

/**
 * Check whether a domain is a known disposable/temporary email provider.
 */
export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase().trim());
}

/**
 * Comprehensive email check — combines format, domain (MX), disposable,
 * and duplicate (already-registered) checks into a single result.
 *
 * This is the single source of truth used by both the real-time
 * /api/auth/check-email endpoint (for inline feedback) and the
 * /api/auth/register route (for the final server-side guard).
 */
export async function checkEmail(email: string): Promise<EmailCheckResult> {
  const emailNorm = (email ?? "").trim().toLowerCase();
  const formatValid = EMAIL_REGEX.test(emailNorm);

  if (!formatValid) {
    return {
      email: emailNorm,
      formatValid: false,
      domainValid: false,
      disposable: false,
      exists: false,
      status: "invalidFormat",
      message: "Format email tidak valid.",
    };
  }

  const domain = emailNorm.split("@")[1] ?? "";

  // 1. Disposable check (fast, in-memory set lookup)
  if (isDisposableDomain(domain)) {
    return {
      email: emailNorm,
      formatValid: true,
      domainValid: true,
      disposable: true,
      exists: false,
      status: "disposable",
      message: "Email sementara (disposable) tidak diperbolehkan. Gunakan email asli.",
    };
  }

  // 2. Domain validity (MX records) — async DNS lookup
  const domainValid = await domainHasMx(domain);
  if (!domainValid) {
    return {
      email: emailNorm,
      formatValid: true,
      domainValid: false,
      disposable: false,
      exists: false,
      status: "domainInvalid",
      message: "Domain email tidak ditemukan atau tidak dapat menerima email. Periksa kembali email Anda.",
    };
  }

  // 3. Duplicate check — searches DB + fallback store
  const exists = await isEmailTaken(emailNorm);
  if (exists) {
    return {
      email: emailNorm,
      formatValid: true,
      domainValid: true,
      disposable: false,
      exists: true,
      status: "taken",
      message: "Email sudah terdaftar. Silakan masuk atau gunakan email lain.",
    };
  }

  return {
    email: emailNorm,
    formatValid: true,
    domainValid: true,
    disposable: false,
    exists: false,
    status: "available",
    message: "Email tersedia dan valid.",
  };
}
