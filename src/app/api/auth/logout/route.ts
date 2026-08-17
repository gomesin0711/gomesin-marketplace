import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

// POST /api/auth/logout — clear the session cookie.
// The frontend should call this on logout so the server-side session is
// invalidated. The frontend store (zustand) also clears the local user.
export async function POST() {
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
