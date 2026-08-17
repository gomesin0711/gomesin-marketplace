import { createHmac, timingSafeEqual } from "node:crypto";
// IMPORTANT: NextResponse must be a RUNTIME import (not `import type`) because
// requireAdmin() below calls NextResponse.json(...) at runtime. A type-only
// import (`import type { NextResponse }`) compiles fine but throws
// `ReferenceError: NextResponse is not defined` when the code path executes.
// NextRequest is kept as type-only since we only use it for parameter typing.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// session.ts — Server-side session management via HMAC-signed httpOnly cookie.
//
// WHY: The previous architecture had NO server-side session. The frontend
// stored `user.id` in localStorage and passed it as `?userId=xxx` to every
// data API endpoint. Anyone who knew (or guessed) another user's ID could
// read & write that user's data — messages, favorites, profile, listings.
//
// This module fixes that by issuing an httpOnly, HMAC-signed cookie on
// successful login/register. All data endpoints then call `getSessionUser(req)`
// to resolve the *verified* current user, ignoring any client-supplied
// `userId` query/body param (unless the session user is an admin override).
//
// The token format is:  base64url(JSON({id, role, exp}))  +  "."  +  hex(sig)
// — a compact, URL-safe token. It is NOT a JWT (we don't need the overhead),
// but follows the same "payload.signature" pattern.
// ─────────────────────────────────────────────────────────────────────────────

const COOKIE_NAME = "mesinku_session";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecret(): string {
  // Prefer an explicit env var so production can rotate it.
  // Fall back to a stable derived value for local dev (so cookies survive
  // server restarts within the same dev database).
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && envSecret.length >= 16) return envSecret;

  // Derive a stable secret from the database URL — this is dev-only and
  // not cryptographically ideal, but it's far better than a hard-coded
  // constant. Production MUST set SESSION_SECRET.
  const dbUrl = process.env.DATABASE_URL || "mesinku-dev-fallback-secret";
  return "mesinku:" + dbUrl;
}

type SessionPayload = {
  id: string;
  role: string;
  exp: number; // epoch seconds
};

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function b64urlDecode(s: string): string | null {
  try {
    return Buffer.from(s, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/** Issue a session token for the given user id + role. */
export function createSessionToken(id: string, role: string = "user"): string {
  const payload: SessionPayload = {
    id,
    role,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const payloadStr = b64urlEncode(JSON.stringify(payload));
  const sig = sign(payloadStr);
  return `${payloadStr}.${sig}`;
}

/** Verify a session token; returns the payload or null if invalid/expired. */
function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === token.length - 1) return null;

  const payloadStr = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = sign(payloadStr);

  // Constant-time signature comparison to prevent timing attacks.
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  const decoded = b64urlDecode(payloadStr);
  if (!decoded) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!payload.id || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expired
  return payload;
}

/** Parse the raw Cookie header into a { name: value } map. */
function parseCookies(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

export type SessionUser = { id: string; role: string };

/**
 * Resolve the verified session user from a Next.js Request.
 * Returns null if there is no session or the token is invalid/expired.
 */
export function getSessionUser(req: NextRequest): SessionUser | null {
  const cookieHeader = req.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return { id: payload.id, role: payload.role };
}

/**
 * Require an admin session. Returns one of:
 *   - { ok: true, user: SessionUser }  — caller is an admin, proceed.
 *   - { ok: false, response: NextResponse }  — caller is not authorized;
 *     the route handler should `return result.response`.
 *
 * Usage:
 *   const check = requireAdmin(req);
 *   if (!check.ok) return check.response;
 *   // ... check.user.id is the verified admin id
 */
export function requireAdmin(req: NextRequest):
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse } {
  const session = getSessionUser(req);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sesi berakhir. Silakan masuk kembali." },
        { status: 401 }
      ),
    };
  }
  if (session.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Akses ditolak: halaman ini hanya untuk admin." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, user: session };
}

/**
 * Set the session cookie on a NextResponse (login/register success).
 * The cookie is httpOnly (no JS access), SameSite=Lax, and Secure in
 * production. TTL = 7 days.
 */
export function setSessionCookie(
  res: NextResponse,
  id: string,
  role: string = "user"
): void {
  const token = createSessionToken(id, role);
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
}

/** Clear the session cookie on a NextResponse (logout). */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Verify the session cookie from a raw `cookie` HTTP header string
 * (used by the chat-service mini-service which doesn't use Next.js).
 */
export function getSessionUserFromCookieHeader(
  cookieHeader: string | null | undefined
): SessionUser | null {
  const cookies = parseCookies(cookieHeader || null);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return { id: payload.id, role: payload.role };
}

export { COOKIE_NAME };
