/**
 * verify-post-ad-free.ts
 *
 * Verifies the post-ad free flow on production (https://gomesin.vercel.app)
 * after the "tidak bisa pasang iklan" fix.
 *
 * The fix shipped:
 *   1. Added a GRATIS (free) paket (price=0) to local SQLite + production Supabase.
 *   2. Fixed `isRealPaket` filter to exclude ALL `__site_*` rows (was only
 *      excluding `__site_banner__`).
 *   3. Updated post-ad.tsx:
 *        - "gratis" added to pkgKeys array (first position)
 *        - default selectedPackage changed "colek" -> "gratis"
 *        - Gift icon + emerald color + "GRATIS" badge for free tier
 *        - Price displays "GRATIS" not "Rp. 0"
 *        - Grid changed from lg:grid-cols-4 to sm:grid-cols-3 lg:grid-cols-5
 *   4. Submit logic already handled price===0 (skips payment, calls doSubmit).
 *
 * This script walks the wizard end-to-end as a real user and verifies:
 *   - Login with testfree@example.com / Test1234! succeeds
 *   - Pasang Iklan button opens the post-ad form
 *   - All 4 wizard steps complete
 *   - GRATIS package is visible + selected by default
 *   - Price shows "GRATIS" not "Rp. 0"
 *   - Submit fires POST /api/listings and gets a success response
 *   - Success redirect to "Iklan Saya" or success toast appears
 *
 * Captures: ALL console msgs, network requests, page errors, screenshots.
 *
 * Run: bun run scripts/verify-post-ad-free.ts
 */

import {
  chromium,
  type Page,
  type ConsoleMessage,
  type Request,
  type Response,
} from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "https://gomesin.vercel.app";
const SHOTS_DIR = resolve(process.cwd(), "verify-post-ad-free-shots");
mkdirSync(SHOTS_DIR, { recursive: true });

const TEST_USER = {
  email: "testfree@example.com",
  password: "Test1234!",
};

// ---------------------------------------------------------------------------
//  Collectors
// ---------------------------------------------------------------------------

type ConsoleEntry = {
  kind: "log" | "info" | "warning" | "error" | "debug" | "pageerror";
  text: string;
  url?: string;
  line?: number;
  col?: number;
};

type NetEntry = {
  method: string;
  url: string;
  status: number;
  resourceType: string;
  failed?: boolean;
  failure?: string;
  requestBody?: string | null;
  responseBody?: string | null;
  responseContentType?: string | null;
};

const consoleLog: ConsoleEntry[] = [];
const pageErrors: ConsoleEntry[] = [];
const netLog: NetEntry[] = [];
const toasts: string[] = [];

let pendingListingsBody: string | null = null;
let lastListingsPostRequest: NetEntry | null = null;
let lastListingsPostResponse: any = null;
let lastLoginResponse: any = null;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(label: string, ...args: any[]) {
  console.log(`[${new Date().toISOString()}] ${label}`, ...args);
}

async function dismissInstallPrompt(page: Page) {
  try {
    const dismiss = page
      .getByRole("button", { name: /nanti saja|mengerti|tutup|skip|close|lanjutkan/i })
      .first();
    if (await dismiss.count()) {
      await dismiss.click({ timeout: 1500 });
      await wait(400);
      log("Dismissed overlay prompt");
    }
  } catch {
    /* no prompt */
  }
}

function hookPage(page: Page) {
  page.on("console", (msg: ConsoleMessage) => {
    consoleLog.push({
      kind: msg.type() as ConsoleEntry["kind"],
      text: msg.text(),
      url: msg.location()?.url,
      line: msg.location()?.lineNumber,
      col: msg.location()?.columnNumber,
    });
  });

  page.on("pageerror", (err: Error) => {
    pageErrors.push({
      kind: "pageerror",
      text: `${err.name}: ${err.message}\n${err.stack ?? ""}`,
    });
  });

  page.on("request", async (req: Request) => {
    const url = req.url();
    if (!url.includes("/api/")) return;
    if (["POST", "PUT", "PATCH"].includes(req.method())) {
      let body: string | null = null;
      try {
        body = req.postData() ?? null;
      } catch {
        body = null;
      }
      if (url.includes("/api/listings") && req.method() === "POST") {
        pendingListingsBody = body;
      }
    }
  });

  page.on("response", async (res: Response) => {
    const req = res.request();
    const url = res.url();
    const method = req.method();
    const status = res.status();
    const resourceType = req.resourceType();

    const entry: NetEntry = { method, url, status, resourceType };

    if (req.failure()) {
      entry.failed = true;
      entry.failure = req.failure()?.errorText;
    }

    if (url.includes("/api/")) {
      if (["POST", "PUT", "PATCH"].includes(method)) {
        try {
          entry.requestBody = req.postData() ?? null;
        } catch {
          entry.requestBody = null;
        }
      }
      try {
        const ct = res.headers()["content-type"] || "";
        entry.responseContentType = ct;
        if (
          ct.includes("json") ||
          ct.includes("text") ||
          ct.includes("javascript")
        ) {
          const text = await res.text();
          entry.responseBody =
            text.length > 4000 ? text.slice(0, 4000) + "…[truncated]" : text;
        }
      } catch {
        entry.responseBody = null;
      }

      if (
        url.includes("/api/auth/login") &&
        method === "POST" &&
        entry.responseBody
      ) {
        try {
          lastLoginResponse = JSON.parse(entry.responseBody);
        } catch {}
      }

      if (url.includes("/api/listings") && method === "POST") {
        lastListingsPostRequest = {
          ...entry,
          requestBody: pendingListingsBody,
        };
        if (entry.responseBody) {
          try {
            lastListingsPostResponse = JSON.parse(entry.responseBody);
          } catch {
            lastListingsPostResponse = entry.responseBody;
          }
        }
      }
    }

    netLog.push(entry);
  });
}

async function captureToasts(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const nodes = document.querySelectorAll(
      '[data-sonner-toast], [role="status"], [role="alert"]'
    );
    const out: string[] = [];
    nodes.forEach((n) => {
      const txt = (n.textContent || "").trim();
      if (txt) out.push(txt);
    });
    return out;
  });
}

async function snapshot(page: Page, name: string) {
  const path = resolve(SHOTS_DIR, `${name}.png`);
  try {
    await page.screenshot({ path, fullPage: true });
  } catch (e) {
    log(`[screenshot-failed] ${name}: ${(e as Error).message}`);
  }
  try {
    const txt = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll("button, a, [role=tab]")
      )
        .map((b) => (b.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 80);
      const headings = Array.from(
        document.querySelectorAll("h1,h2,h3,label")
      )
        .map((h) => (h.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 100);
      return {
        url: location.href,
        title: document.title,
        buttons,
        headings,
      };
    });
    writeFileSync(
      resolve(SHOTS_DIR, `${name}.txt`),
      JSON.stringify(txt, null, 2)
    );
  } catch {}
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

const summary: Record<string, any> = {
  base: BASE,
  startedAt: new Date().toISOString(),
  steps: [] as string[],
  loginSucceeded: false,
  postAdFormOpened: false,
  gratisPackageVisible: false,
  gratisSelectedByDefault: false,
  priceShowsGRATIS: false,
  submitSucceeded: false,
  listingsPostMade: false,
  listingsPostStatus: null as number | null,
  listingsResponse: null as any,
  listingsRequestPayload: null as any,
  successIndicator: null as string | null,
  networkErrors: [] as NetEntry[],
  consoleErrors: [] as ConsoleEntry[],
  pageErrors: [] as ConsoleEntry[],
  toasts: [] as string[],
  screenshotPath: SHOTS_DIR,
  failedStep: null as string | null,
  errorMessage: null as string | null,
  endedAt: null as string | null,
};

async function run() {
  log("Launching chromium (headless, 1280x900)…");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 mesinKU-verify-post-ad-free/1.0",
  });
  const page = await context.newPage();
  hookPage(page);

  try {
    // ===================================================================
    // STEP 1: Navigate to homepage
    // ===================================================================
    log("Navigating to homepage…");
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await wait(3000);
    await dismissInstallPrompt(page);
    await snapshot(page, "01-homepage");
    summary.steps.push("navigated-homepage");

    // ===================================================================
    // STEP 2: Open login form
    // ===================================================================
    log("Opening login form…");
    // If the user is already logged in from a previous run, we'll detect
    // that and skip the login step. Otherwise click the "Masuk" / Login button.
    const alreadyLoggedIn = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("gomesin-store");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!(parsed?.state?.user?.id);
      } catch {
        return false;
      }
    });
    if (alreadyLoggedIn) {
      log("Already logged in (localStorage has user) — skipping login");
      summary.loginSucceeded = true;
      summary.steps.push("login-already-logged-in");
    } else {
      // Click the "Masuk" / Login button (bottom-nav aria-label="Masuk" or
      // header link with text "Masuk")
      const loginClicked = await page.evaluate(() => {
        const cands = Array.from(
          document.querySelectorAll("button, a")
        ) as HTMLElement[];
        const t = cands.find((el) => {
          const txt = (el.textContent || "").trim().toLowerCase();
          const aria = (el.getAttribute("aria-label") || "").toLowerCase();
          return txt === "masuk" || aria === "masuk" || txt === "login";
        });
        if (t) {
          t.click();
          return t.textContent?.trim() || t.getAttribute("aria-label") || "<unknown>";
        }
        return null;
      });
      log(`Login button clicked: ${loginClicked}`);
      await wait(1500);
      await dismissInstallPrompt(page);
      await snapshot(page, "02-login-form");

      // Fill the email/password login form (id="l-email" + id="l-pass").
      // NOTE: The login view renders the form TWICE — once in the mobile
      // layout (md:hidden) and once in the desktop layout (hidden md:grid).
      // At 1280px viewport, only the desktop (last) instance is visible.
      // Use .last() to target the visible desktop instance.
      const emailField = page.locator("#l-email").last();
      const passField = page.locator("#l-pass").last();
      if ((await emailField.count()) && (await passField.count())) {
        await emailField.fill(TEST_USER.email, { timeout: 5000 });
        await passField.fill(TEST_USER.password, { timeout: 5000 });
        log("Filled email + password");
        await wait(500);

        // Click the submit button (type="submit", "Masuk" label).
        // Both mobile + desktop forms render a submit button — pick visible one.
        const submitBtn = page.locator('button[type="submit"]').last();
        if (await submitBtn.count()) {
          await submitBtn.click({ timeout: 5000 });
          log("Clicked login submit button");
        } else {
          // fallback: any button with "Masuk" / "Login" text
          await page
            .getByRole("button", { name: /^masuk$|^login$/i })
            .first()
            .click({ timeout: 5000 });
          log("Clicked login button (text fallback)");
        }
        await wait(3500); // allow login API + redirect to home
        await dismissInstallPrompt(page);
        await snapshot(page, "03-after-login");

        // Check login state via localStorage
        const nowLoggedIn = await page.evaluate(() => {
          try {
            const raw = localStorage.getItem("gomesin-store");
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            return !!(parsed?.state?.user?.id);
          } catch {
            return false;
          }
        });
        summary.loginSucceeded = nowLoggedIn;
        if (nowLoggedIn) {
          summary.steps.push("login-success");
          log(`✅ Login succeeded (user present in localStorage)`);
          if (lastLoginResponse) {
            log(
              "Login API response:",
              JSON.stringify({
                ok: !!lastLoginResponse.user,
                hasUser: !!lastLoginResponse.user,
                userName: lastLoginResponse.user?.name,
                userEmail: lastLoginResponse.user?.email,
              })
            );
          }
        } else {
          summary.steps.push("login-failed");
          summary.failedStep = "login";
          summary.errorMessage = "Login did not persist a user in localStorage";
          log(`❌ Login failed — see screenshots / network log`);
        }
      } else {
        log("Login form fields (#l-email / #l-pass) NOT found");
        summary.failedStep = "login-form-not-found";
        summary.errorMessage =
          "Login form fields (#l-email / #l-pass) NOT found";
      }
    }

    // ===================================================================
    // STEP 3: Click "Pasang Iklan" button (bottom-nav aria-label="Pasang Iklan")
    // ===================================================================
    if (summary.loginSucceeded) {
      log("Looking for 'Pasang Iklan' button…");
      // First make sure we're on the home view (login redirects to home)
      // The bottom-nav has aria-label="Pasang Iklan" on the elevated Jual button.
      let pasangIklanClicked = false;
      try {
        const btn = page
          .getByRole("button", { name: /^pasang iklan$/i })
          .first();
        if (await btn.count()) {
          await btn.click({ timeout: 5000 });
          pasangIklanClicked = true;
          log("Clicked 'Pasang Iklan' via aria-label");
        }
      } catch (e) {
        log("aria-label click failed:", (e as Error).message);
      }

      if (!pasangIklanClicked) {
        // fallback: text-based search
        const clicked = await page.evaluate(() => {
          const cands = Array.from(
            document.querySelectorAll("button, a")
          ) as HTMLElement[];
          const t = cands.find((el) => {
            const txt = (el.textContent || "").trim().toLowerCase();
            const aria = (el.getAttribute("aria-label") || "").toLowerCase();
            return (
              txt === "pasang iklan" ||
              aria === "pasang iklan" ||
              txt.includes("pasang iklan sekarang") ||
              txt.includes("jual mesin") ||
              txt.includes("jual sekarang")
            );
          });
          if (t) {
            t.click();
            return t.textContent?.trim() || t.getAttribute("aria-label") || "<unknown>";
          }
          return null;
        });
        log(`'Pasang Iklan' clicked (fallback): ${clicked}`);
        pasangIklanClicked = !!clicked;
      }
      await wait(2500);
      await dismissInstallPrompt(page);
      await snapshot(page, "04-after-click-pasang-iklan");

      // =================================================================
      // STEP 4: Verify we're on the post-ad wizard
      // =================================================================
      const onPostAd = await page.evaluate(() => {
        const txt = (document.body.textContent || "").toLowerCase();
        return (
          txt.includes("pasang iklan") &&
          (txt.includes("informasi dasar") ||
            txt.includes("step 1") ||
            txt.includes("kategori") ||
            txt.includes("detail & deskripsi") ||
            txt.includes("konfirmasi"))
        );
      });
      summary.postAdFormOpened = onPostAd;
      log(`On post-ad form? ${onPostAd}`);
      await snapshot(page, "05-post-ad-form");

      if (onPostAd) {
        summary.steps.push("post-ad-form-opened");

        // =============================================================
        // STEP 5: Fill Step 1 (Informasi Dasar)
        // =============================================================
        log("=== STEP 1: Informasi Dasar ===");
        summary.steps.push("step1-informasi-dasar");

        // Title — input with placeholder "Contoh: Mesin Press Hidrolik 100 Ton"
        try {
          await page
            .getByPlaceholder(/contoh: mesin press/i)
            .first()
            .fill("Jual Mesin CNC murah", { timeout: 5000 });
          log("Filled title");
        } catch (e) {
          log("Title placeholder not found — trying generic input fill");
          const inputs = page.locator('input[type="text"], input:not([type])');
          const count = await inputs.count();
          log(`Found ${count} text inputs`);
          if (count > 0) {
            await inputs.first().fill("Jual Mesin CNC murah", { timeout: 5000 });
          }
        }

        // Category — Radix Select trigger has role="combobox". Click the first.
        try {
          const catTrigger = page.getByRole("combobox").first();
          await catTrigger.click({ timeout: 5000 });
          await wait(800);
          const firstItem = page.locator('[role="option"]').first();
          await firstItem.click({ timeout: 5000 });
          log("Selected first category");
        } catch (e) {
          log("Category select failed:", (e as Error).message);
        }
        await wait(500);

        // Description (Step 1 in some builds, Step 2 in others) — textarea
        // with placeholder "Tuliskan detail spesifikasi…"
        try {
          await page
            .getByPlaceholder(/tuliskan detail spesifikasi/i)
            .first()
            .fill("Mesin CNC kondisi baik siap pakai", { timeout: 5000 });
          log("Filled description (Step 1 location)");
        } catch (e) {
          log("Description placeholder not found in Step 1 (may be Step 2)");
        }

        // Price — input with placeholder "contoh: 185.000.000"
        try {
          await page
            .getByPlaceholder(/185\.000\.000/i)
            .first()
            .fill("15000000", { timeout: 5000 });
          log("Filled price (15.000.000)");
        } catch (e) {
          log("Price placeholder not found:", (e as Error).message);
          // fallback: input with placeholder containing "harga" / "price"
          try {
            await page
              .getByPlaceholder(/harga|price/i)
              .first()
              .fill("15000000", { timeout: 5000 });
            log("Filled price (fallback placeholder)");
          } catch {}
        }

        // Province — Radix Select whose trigger has text "Pilih provinsi"
        try {
          const provTrigger = page
            .locator('[role="combobox"]')
            .filter({ hasText: /pilih provinsi/i })
            .first();
          await provTrigger.click({ timeout: 5000 });
          await wait(700);
          const dki = page
            .locator('[role="option"]')
            .filter({ hasText: /dki jakarta/i })
            .first();
          if (await dki.count()) {
            await dki.click({ timeout: 5000 });
            log("Selected province DKI Jakarta");
          } else {
            await page.locator('[role="option"]').first().click({ timeout: 5000 });
            log("Selected first province (DKI Jakarta not found)");
          }
          await wait(500);
        } catch (e) {
          log("Province select failed:", (e as Error).message);
        }

        // City — Select whose trigger has text "Pilih kota" / "Pilih provinsi dulu"
        try {
          const cityTrigger = page
            .locator('[role="combobox"]')
            .filter({ hasText: /pilih kota|pilih provinsi dulu/i })
            .first();
          await cityTrigger.click({ timeout: 5000 });
          await wait(700);
          const jakarta = page
            .locator('[role="option"]')
            .filter({ hasText: /jakarta/i })
            .first();
          if (await jakarta.count()) {
            await jakarta.click({ timeout: 5000 });
            log("Selected city Jakarta");
          } else {
            await page.locator('[role="option"]').first().click({ timeout: 5000 });
            log("Selected first city (Jakarta not found)");
          }
          await wait(500);
        } catch (e) {
          log("City select failed:", (e as Error).message);
        }

        await snapshot(page, "06-step1-filled");

        // Click "Lanjut" button (bottom sticky)
        try {
          const lanjutBtn = page.getByRole("button", { name: /lanjut/i }).last();
          await lanjutBtn.click({ timeout: 5000 });
          log("Clicked 'Lanjut' (step 1 → 2)");
          await wait(2000);
        } catch (e) {
          log("Clicking Lanjut failed:", (e as Error).message);
          summary.failedStep = "step1-next";
          summary.errorMessage = (e as Error).message;
        }

        const t1 = await captureToasts(page);
        if (t1.length) {
          toasts.push(...t1);
          log("Toasts after step 1:", t1);
        }
        await snapshot(page, "07-after-step1-next");

        // =============================================================
        // STEP 6: Step 2 (Detail & Deskripsi)
        // =============================================================
        const onStep2 = await page.evaluate(() =>
          (document.body.textContent || "").toLowerCase().includes("detail & deskripsi")
        );
        if (onStep2 || !summary.failedStep) {
          log("=== STEP 2: Detail & Deskripsi ===");
          summary.steps.push("step2-detail-deskripsi");
          await dismissInstallPrompt(page);

          // Description textarea (might be here if not in Step 1)
          try {
            const descField = page
              .getByPlaceholder(/tuliskan detail spesifikasi/i)
              .first();
            if (await descField.count()) {
              await descField.fill("Mesin CNC kondisi baik siap pakai", { timeout: 5000 });
              log("Filled description (Step 2)");
            }
          } catch (e) {
            log("Description placeholder not found in Step 2:", (e as Error).message);
          }
          await wait(500);

          // Click Lanjut
          try {
            const lanjutBtn = page.getByRole("button", { name: /lanjut/i }).last();
            await lanjutBtn.click({ timeout: 5000 });
            log("Clicked 'Lanjut' (step 2 → 3)");
            await wait(2000);
          } catch (e) {
            log("Clicking Lanjut (step2) failed:", (e as Error).message);
            summary.failedStep = "step2-next";
            summary.errorMessage = (e as Error).message;
          }

          const t2 = await captureToasts(page);
          if (t2.length) {
            toasts.push(...t2);
            log("Toasts after step 2:", t2);
          }
          await snapshot(page, "08-after-step2-next");

          // =========================================================
          // STEP 7: Step 3 (Foto Mesin) — skip photos, use placeholder
          // =========================================================
          const onStep3 = await page.evaluate(() =>
            (document.body.textContent || "").toLowerCase().includes("foto mesin")
          );
          if (onStep3 || !summary.failedStep) {
            log("=== STEP 3: Foto Mesin ===");
            summary.steps.push("step3-foto-mesin");
            await dismissInstallPrompt(page);

            // Try "Gunakan contoh" if present; otherwise skip photos
            try {
              const exampleBtn = page
                .getByText(/gunakan contoh|pakai contoh|use example|contoh/i, {
                  exact: false,
                })
                .first();
              if (await exampleBtn.count()) {
                await exampleBtn.click({ timeout: 5000 });
                log("Clicked 'Gunakan contoh' for placeholder photos");
                await wait(1500);
              } else {
                log("No 'Gunakan contoh' button — skipping photos (placeholder.jpg used by submit)");
              }
            } catch (e) {
              log("Use-example button click failed:", (e as Error).message);
            }

            // Click Lanjut
            try {
              const lanjutBtn = page.getByRole("button", { name: /lanjut/i }).last();
              await lanjutBtn.click({ timeout: 5000 });
              log("Clicked 'Lanjut' (step 3 → 4)");
              await wait(2000);
            } catch (e) {
              log("Clicking Lanjut (step3) failed:", (e as Error).message);
              summary.failedStep = "step3-next";
              summary.errorMessage = (e as Error).message;
            }

            const t3 = await captureToasts(page);
            if (t3.length) {
              toasts.push(...t3);
              log("Toasts after step 3:", t3);
            }
            await snapshot(page, "09-after-step3-next");

            // =====================================================
            // STEP 8: Step 4 (Konfirmasi) — verify GRATIS + submit
            // =====================================================
            const onStep4 = await page.evaluate(() =>
              (document.body.textContent || "").toLowerCase().includes("konfirmasi")
            );
            if (onStep4 || !summary.failedStep) {
              log("=== STEP 4: Konfirmasi ===");
              summary.steps.push("step4-konfirmasi");
              await dismissInstallPrompt(page);

              // --- Verify GRATIS package is visible ---
              const gratisInfo = await page.evaluate(() => {
                const txt = (document.body.textContent || "");
                // NOTE: The package button text concatenates badge + name +
                // price ("Gratis" + "Gratis" + "GRATIS" + "/30hari"). So we
                // search case-sensitively for the uppercase "GRATIS" (the
                // price-display text), NOT with \b which fails because the
                // preceding "Gratis" name is also a word char.
                const hasGratisWord = /GRATIS/.test(txt);
                // "Rp. 0" / "Rp 0" anywhere (case-insensitive) — should be
                // absent because price===0 renders as "GRATIS".
                const hasRp0 = /Rp\.?\s*0(?!\d)/i.test(txt);
                // Find all package buttons in the "Pilih Paket Iklan" grid
                // They're <button> inside a grid containing "Pilih Paket Iklan"
                const h3 = Array.from(document.querySelectorAll("h3")).find(
                  (h) => (h.textContent || "").toLowerCase().includes("pilih paket iklan")
                );
                let pkgButtons: HTMLElement[] = [];
                if (h3) {
                  const container = h3.parentElement;
                  if (container) {
                    pkgButtons = Array.from(container.querySelectorAll("button"));
                  }
                }
                const pkgs = pkgButtons.map((b) => {
                  // For each package button, find the price <p> element — it
                  // contains either "GRATIS" (free) or "Rp X.XXX" (paid).
                  // The price <p> has class "text-primary" + "font-extrabold"
                  // and comes AFTER the name <p> ("mt-2 text-xs font-bold").
                  // We match case-SENSITIVE "GRATIS" (uppercase) so we don't
                  // match the package name "Gratis" (capitalized).
                  const priceP = Array.from(b.querySelectorAll("p")).find((p) =>
                    /GRATIS|^Rp\b/.test((p.textContent || "").trim())
                  );
                  const priceText = priceP ? (priceP.textContent || "").trim() : "";
                  return {
                    text: (b.textContent || "").trim().slice(0, 200),
                    priceText: priceText.slice(0, 80),
                    showsGratis: /GRATIS/.test(priceText),
                    showsRp0: /Rp\.?\s*0(?!\d)/.test(priceText),
                    // Selected if border-green-500 ring-2 ring-green-400 OR
                    // has the green-check indicator span.
                    selected:
                      /ring-2\s+ring-green-400/.test(b.className) ||
                      !!b.querySelector('span.rounded-full.bg-green-500'),
                    hasGiftIcon:
                      !!b.querySelector('svg.lucide-gift') ||
                      // Tailwind path-based fallback (the icon's class won't
                      // include "gift" — we just check for any svg in the
                      // icon slot which is a Gift for gratis per pkgIconMap).
                      false,
                    isGratisBadge: !!b.querySelector('span.bg-emerald-500'),
                  };
                });
                const selectedIdx = pkgs.findIndex((p) => p.selected);
                return {
                  hasGratisWord,
                  hasRp0,
                  pkgCount: pkgs.length,
                  pkgs,
                  selectedIdx,
                  selectedPkgText:
                    selectedIdx >= 0 ? pkgs[selectedIdx]?.text : null,
                  selectedPkgPrice:
                    selectedIdx >= 0 ? pkgs[selectedIdx]?.priceText : null,
                };
              });
              log("GRATIS info:", JSON.stringify(gratisInfo, null, 2));
              summary.gratisPackageVisible =
                gratisInfo.hasGratisWord && gratisInfo.pkgCount >= 4;
              // The GRATIS badge should be on the first package button
              const gratisPkg = gratisInfo.pkgs[0];
              summary.gratisSelectedByDefault =
                gratisInfo.selectedIdx === 0 && !!(gratisPkg?.isGratisBadge);
              // Price shows "GRATIS" (not "Rp. 0") — check the price <p> of the
              // first (gratis) package directly.
              summary.priceShowsGRATIS =
                !!(gratisPkg?.showsGratis) && !(gratisPkg?.showsRp0);

              await snapshot(page, "10-step4-package-picker");

              // Also dump the package picker section as a separate
              // (potentially full-page) screenshot for clarity.
              try {
                const pickerLocator = page
                  .locator("h3:has-text('Pilih Paket Iklan')")
                  .locator("xpath=..");
                if (await pickerLocator.count()) {
                  await pickerLocator.screenshot({
                    path: resolve(SHOTS_DIR, "11-package-picker-zoom.png"),
                  });
                  log("Saved zoomed-in package picker screenshot");
                }
              } catch (e) {
                log("Zoomed screenshot failed:", (e as Error).message);
              }

              // --- Submit ---
              log("Clicking submit ('Publikasikan') button…");
              const beforeListingsCalls = netLog.filter(
                (n) => n.url.includes("/api/listings") && n.method === "POST"
              ).length;

              let submitBtn = page
                .getByRole("button", { name: /publikasikan/i })
                .last();
              if (!(await submitBtn.count())) {
                submitBtn = page
                  .getByRole("button", { name: /bayar & pasang|pasang iklan/i })
                  .last();
              }
              if (!(await submitBtn.count())) {
                submitBtn = page.locator("button.w-full").last();
              }
              try {
                await submitBtn.click({ timeout: 5000 });
                log("Clicked submit button");
              } catch (e) {
                log("Submit click failed:", (e as Error).message);
                summary.failedStep = "step4-submit-click";
                summary.errorMessage = (e as Error).message;
              }

              // Wait 5s for the API call (per task instructions)
              log("Waiting 5s for POST /api/listings…");
              await wait(5000);

              // Poll toasts during the wait
              const polledToasts = await (async () => {
                const seen: string[] = [];
                const start = Date.now();
                while (Date.now() - start < 4000) {
                  const cur = await captureToasts(page);
                  for (const t of cur) {
                    if (!seen.includes(t)) seen.push(t);
                  }
                  await wait(400);
                }
                return seen;
              })();
              if (polledToasts.length) toasts.push(...polledToasts);

              await snapshot(page, "12-after-submit");

              // --- Verify POST /api/listings ---
              const afterListingsCalls = netLog.filter(
                (n) => n.url.includes("/api/listings") && n.method === "POST"
              ).length;
              summary.listingsPostMade = afterListingsCalls > beforeListingsCalls;
              if (lastListingsPostRequest) {
                summary.listingsPostStatus = lastListingsPostRequest.status;
                summary.listingsResponse = lastListingsPostResponse;
                try {
                  summary.listingsRequestPayload = lastListingsPostRequest.requestBody
                    ? JSON.parse(lastListingsPostRequest.requestBody)
                    : lastListingsPostRequest.requestBody;
                } catch {
                  summary.listingsRequestPayload =
                    lastListingsPostRequest.requestBody;
                }
                log(
                  "POST /api/listings status:",
                  lastListingsPostRequest.status
                );
                log(
                  "POST /api/listings response:",
                  JSON.stringify(lastListingsPostResponse, null, 2)
                );
              }

              // --- Verify success: success screen / redirect to Iklan Saya / toast ---
              const successState = await page.evaluate(() => {
                const txt = (document.body.textContent || "").toLowerCase();
                // After successful submit, mutation.onSuccess calls
                // goToProfilePanel("iklan-saya") → view becomes "profile" with
                // profilePanel="iklan-saya".
                const onIklanSayaPanel =
                  txt.includes("iklan saya") &&
                  (txt.includes("aktif") ||
                    txt.includes("menunggu") ||
                    txt.includes("verifikasi") ||
                    txt.includes("draft") ||
                    txt.includes("tidak ada iklan") ||
                    txt.includes("tambah iklan"));
                // Or the success screen: "Iklan Terkirim untuk Verifikasi!"
                const hasSuccessScreen = txt.includes("iklan terkirim");
                return { onIklanSayaPanel, hasSuccessScreen };
              });
              log("Success state:", JSON.stringify(successState));

              const successToast = toasts.find((t) =>
                /iklan terkirim|berhasil.*pasang|pasang.*berhasil/i.test(t)
              );
              summary.successIndicator = successToast
                ? `toast: "${successToast}"`
                : successState.hasSuccessScreen
                  ? "success-screen: 'Iklan Terkirim untuk Verifikasi!'"
                  : successState.onIklanSayaPanel
                    ? "redirected-to-iklan-saya-panel"
                    : null;

              summary.submitSucceeded =
                summary.listingsPostMade &&
                summary.listingsPostStatus !== null &&
                summary.listingsPostStatus >= 200 &&
                summary.listingsPostStatus < 300 &&
                (!!summary.successIndicator ||
                  !!lastListingsPostResponse?.id ||
                  !!lastListingsPostResponse?.slug);

              log(`✅ Submit succeeded? ${summary.submitSucceeded}`);
              log(`   - listingsPostMade: ${summary.listingsPostMade}`);
              log(`   - status: ${summary.listingsPostStatus}`);
              log(`   - successIndicator: ${summary.successIndicator}`);
            }
          }
        }
      }
    }

    // ===================================================================
    // Final aggregation
    // ===================================================================
    summary.networkErrors = netLog.filter(
      (n) => n.status >= 400 || n.failed
    );
    summary.consoleErrors = consoleLog.filter((c) => c.kind === "error");
    summary.pageErrors = pageErrors;
    summary.toasts = toasts;
    summary.endedAt = new Date().toISOString();

    // Print summary
    console.log("\n" + "=".repeat(80));
    console.log("VERIFY-POST-AD-FREE SUMMARY");
    console.log("=".repeat(80));
    console.log(JSON.stringify(summary, null, 2));
    console.log("=".repeat(80));
    console.log(`Screenshots saved to: ${SHOTS_DIR}`);

    writeFileSync(
      resolve(SHOTS_DIR, "summary.json"),
      JSON.stringify(summary, null, 2)
    );
    writeFileSync(
      resolve(SHOTS_DIR, "netlog.json"),
      JSON.stringify(netLog, null, 2)
    );
    writeFileSync(
      resolve(SHOTS_DIR, "console.json"),
      JSON.stringify(consoleLog, null, 2)
    );
  } catch (err: any) {
    log("FATAL:", err?.message, err?.stack);
    summary.failedStep = summary.failedStep || "fatal";
    summary.errorMessage = err?.message;
    summary.endedAt = new Date().toISOString();
    try {
      await snapshot(page, "fatal");
    } catch {}
    writeFileSync(
      resolve(SHOTS_DIR, "summary.json"),
      JSON.stringify(summary, null, 2)
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
