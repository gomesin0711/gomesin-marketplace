import { NextRequest, NextResponse } from "next/server";
import { checkEmail } from "@/lib/email-validate";

/* ------------------------------------------------------------------ */
/*  GET /api/auth/check-email?email=foo@bar.com                       */
/*                                                                    */
/*  Real-time check used by the registration form to give immediate   */
/*  feedback as the user types. Performs FOUR checks:                 */
/*                                                                    */
/*    1. Format  — must match the basic email regex                   */
/*    2. Domain  — the domain must have valid MX records (can         */
/*                 receive email). Fake domains like                  */
/*                 "test@fakedomain123.xyz" are rejected here.        */
/*    3. Disposable — blocks known temporary-email providers          */
/*                    (mailinator, guerrillamail, etc.)               */
/*    4. Exists  — already registered in DB or fallback store         */
/*                                                                    */
/*  Returns a single `status` field the frontend maps to its UI:      */
/*    "available" | "taken" | "invalidFormat" | "domainInvalid" |     */
/*    "disposable"                                                    */
/*                                                                    */
/*  Backward compat: `exists` boolean is still returned so any old    */
/*  caller keeps working.                                             */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
  }

  try {
    const result = await checkEmail(email);
    return NextResponse.json({
      // The single status the frontend uses for its UI state machine.
      status: result.status,
      // Backward-compatible boolean (old frontend code checked `.exists`).
      exists: result.exists,
      // Granular flags (useful for debugging / future UI).
      formatValid: result.formatValid,
      domainValid: result.domainValid,
      disposable: result.disposable,
      // Human-readable message (Indonesian).
      message: result.message,
    });
  } catch (e) {
    console.error("[check-email] error:", e);
    // On unexpected error, return a permissive result so the user isn't
    // blocked — the final /api/auth/register route still validates
    // server-side.
    return NextResponse.json({
      status: "available",
      exists: false,
      formatValid: true,
      domainValid: true,
      disposable: false,
      message: "Email tersedia.",
    });
  }
}
