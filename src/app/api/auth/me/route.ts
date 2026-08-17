import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { fallbackGetUserById } from "@/lib/auth-fallback";

// GET /api/auth/me — return the verified current user from the session cookie.
//
// This is the SINGLE source of truth for "who am I" on the frontend. The
// frontend calls this on app mount to verify the session is still valid
// and to fetch the freshest user object. If the session is missing/invalid
// (e.g. cookie expired, or user cleared cookies), the frontend should treat
// the user as logged out.
//
// The client-supplied `?userId=xxx` query param is IGNORED — the user is
// resolved exclusively from the verified session cookie. This prevents
// account A from reading account B's profile by passing B's userId.
export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const user = await db.user.findUnique({ where: { id: session.id } });
      if (user) {
        return NextResponse.json({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            city: user.city,
            company: user.company,
            address: user.address,
            bannerImage: user.bannerImage,
            logoImage: user.logoImage,
            role: user.role,
            createdAt:
              user.createdAt instanceof Date
                ? user.createdAt.toISOString()
                : user.createdAt,
          },
        });
      }
      // Not found locally → fall through to in-memory fallback
    } catch {
      // fall through
    }
  }

  // --- Path B: in-memory fallback (last resort) ---
  const user = await fallbackGetUserById(session.id);
  if (!user) {
    // Session points to a user that no longer exists — treat as logged out.
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
