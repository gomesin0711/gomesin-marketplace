/**
 * repro-post-ad.ts
 *
 * Reproduces the "tidak bisa pasang iklan" (cannot post ads) issue on
 * https://gomesin.vercel.app by walking through the actual frontend
 * post-ad wizard flow with Playwright.
 *
 * Captures:
 *   - ALL console messages (log/info/warning/error)
 *   - ALL page errors (uncaught exceptions)
 *   - ALL network requests + responses (with bodies for /api/ calls)
 *   - Toast/dialog text visible to the user
 *   - Screenshots at each major step
 *
 * Flow:
 *   1. Navigate to homepage
 *   2. Click "Pasang Iklan"
 *   3. If login view appears, attempt UI registration (documents OTP barrier),
 *      then fall back to direct /api/auth/register + /api/auth/login +
 *      localStorage injection to continue testing the post-ad wizard.
 *   4. Fill Step 1 (Informasi Dasar) → Next
 *   5. Fill Step 2 (Detail & Deskripsi) → Next
 *   6. Step 3 (Foto Mesin) → use example photos → Next
 *   7. Step 4 (Konfirmasi) → click "Publikasikan"
 *   8. Wait 5s for API call to complete
 *   9. Screenshot + summary
 *
 * Run: bun run scripts/repro-post-ad.ts
 */

import { chromium, type Page, type ConsoleMessage, type Request, type Response } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "https://gomesin.vercel.app";
const SHOTS_DIR = resolve(process.cwd(), "repro-post-ad-shots");
mkdirSync(SHOTS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
//  State collectors
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

// Track the most recent OTP API response so we can read _devCode if present.
let lastOtpSendResponse: any = null;
let lastListingsPostRequest: NetEntry | null = null;
let lastListingsPostResponse: any = null;

async function dismissInstallPrompt(page: Page) {
  // The PWA install prompt ("Install Aplikasi mesinKU") overlays the page and
  // intercepts clicks. Dismiss it by clicking "Nanti Saja" or "Mengerti".
  try {
    const dismiss = page.getByRole("button", { name: /nanti saja|mengerti|tutup|skip|close/i }).first();
    if (await dismiss.count()) {
      await dismiss.click({ timeout: 1500 });
      await wait(400);
      log("Dismissed install/overlay prompt");
    }
  } catch {
    /* no prompt — fine */
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

  // Capture request bodies for /api/ calls (POST/PUT/PATCH)
  page.on("request", async (req: Request) => {
    const url = req.url();
    if (!url.includes("/api/")) return;
    if (["POST", "PUT", "PATCH"].includes(req.method())) {
      let body: string | null = null;
      try {
        const pd = req.postData();
        body = pd ?? null;
      } catch {
        body = null;
      }
      // Stash the body on a side-map keyed by url+method so the response
      // handler can pick it up. (Simple approach: store globally for /api/listings POST.)
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

    const entry: NetEntry = {
      method,
      url,
      status,
      resourceType,
    };

    if (res.request().failure()) {
      entry.failed = true;
      entry.failure = res.request().failure()?.errorText;
    }

    // Capture bodies for /api/ calls
    if (url.includes("/api/")) {
      // Request body
      if (["POST", "PUT", "PATCH"].includes(method)) {
        try {
          entry.requestBody = req.postData() ?? null;
        } catch {
          entry.requestBody = null;
        }
      }
      // Response body
      try {
        const ct = res.headers()["content-type"] || "";
        entry.responseContentType = ct;
        if (ct.includes("json") || ct.includes("text") || ct.includes("javascript")) {
          const text = await res.text();
          // Truncate huge responses
          entry.responseBody = text.length > 4000 ? text.slice(0, 4000) + "…[truncated]" : text;
        }
      } catch {
        entry.responseBody = null;
      }

      // Stash interesting responses for the summary
      if (url.includes("/api/auth/register-otp") && method === "POST" && entry.responseBody) {
        try {
          lastOtpSendResponse = JSON.parse(entry.responseBody);
        } catch {}
      }
      if (url.includes("/api/listings") && method === "POST") {
        lastListingsPostRequest = {
          ...entry,
          // capture request body from the stashed variable
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

  // Capture toast notifications (sonner renders [data-sonner-toast])
  page.on("console", () => {
    /* no-op — toasts are DOM, polled separately below */
  });
}

let pendingListingsBody: string | null = null;

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
    console.log(`[screenshot-failed] ${name}: ${(e as Error).message}`);
  }
  // also dump visible text + buttons to a .txt for debugging
  try {
    const txt = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, a, [role=tab]"))
        .map((b) => (b.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 60);
      const headings = Array.from(document.querySelectorAll("h1,h2,h3,label"))
        .map((h) => (h.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 80);
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

function log(label: string, ...args: any[]) {
  console.log(`[${new Date().toISOString()}] ${label}`, ...args);
}

// ---------------------------------------------------------------------------
//  Helper: small wait helper
// ---------------------------------------------------------------------------
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

const TEST_USER = {
  name: "Test Repro",
  phone: "6281234999001",
  email: "testrepro1@example.com",
  password: "Test1234!",
};

async function run() {
  log("Launching chromium…");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 mesinKU-repro/1.0",
  });
  const page = await context.newPage();
  hookPage(page);

  const summary: Record<string, any> = {
    base: BASE,
    startedAt: new Date().toISOString(),
    steps: [] as string[],
    registration: { attempted: false, viaUi: false, viaApi: false, details: null as any },
    postAdFormOpened: false,
    failedStep: null as string | null,
    errorMessage: null as string | null,
    apiRequestPayload: null as any,
    apiResponse: null as any,
    networkErrors: [] as NetEntry[],
    consoleErrors: [] as ConsoleEntry[],
    pageErrors: [] as ConsoleEntry[],
    screenshotPath: null as string | null,
  };

  try {
    // =====================================================================
    // STEP 1: Navigate to homepage
    // =====================================================================
    log("Navigating to homepage…");
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await wait(3000);
    await snapshot(page, "01-homepage");
    summary.steps.push("navigated-homepage");

    // =====================================================================
    // STEP 2: Click "Pasang Iklan"
    // =====================================================================
    log("Looking for 'Pasang Iklan' button…");
    // The homepage hero CTA says "Pasang Iklan Sekarang" and the sell CTA says "+ Jual Mesin Sekarang" / similar.
    // Try multiple selectors.
    const pasangIklanClicked = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll("button, a")
      ) as HTMLElement[];
      const target = candidates.find((el) => {
        const t = (el.textContent || "").trim().toLowerCase();
        return (
          t.includes("pasang iklan") ||
          t.includes("jual mesin") ||
          t.includes("pasang") ||
          t.includes("jual sekarang")
        );
      });
      if (target) {
        target.click();
        return target.textContent?.trim() || "<unknown>";
      }
      return null;
    });

    if (pasangIklanClicked) {
      log(`Clicked button: "${pasangIklanClicked}"`);
    } else {
      log("Could not find a 'Pasang Iklan' button via text — trying store direct navigation");
    }
    await wait(2500);
    await snapshot(page, "02-after-click-pasang");

    // Dismiss any overlay prompt (PWA install, cookie banner, etc.) before
    // doing anything else.
    await dismissInstallPrompt(page);
    await snapshot(page, "02b-after-dismiss-prompt");

    // =====================================================================
    // STEP 3: Handle login/registration
    // =====================================================================
    // Check if the LOGIN FORM is actually visible (not just the word "Masuk"
    // in the bottom nav). We require the actual login form inputs to be present.
    const onLoginView = await page.evaluate(() => {
      return !!document.querySelector('#l-email, #r-name, #l-pass');
    });

    if (onLoginView) {
      log("Login view detected — attempting UI registration flow…");
      summary.registration.attempted = true;
      summary.registration.viaUi = true;

      // Click the "Daftar" (register) tab
      try {
        const tab = page.getByRole("tab", { name: /^daftar$/i });
        if (await tab.count()) {
          await tab.first().click();
          log("Clicked 'Daftar' tab");
        } else {
          // fallback: click by text
          await page.getByText(/daftar/i, { exact: false }).first().click();
          log("Clicked 'Daftar' text");
        }
        await wait(1000);
      } catch (e) {
        log("Could not click Daftar tab:", (e as Error).message);
      }
      await snapshot(page, "03-register-tab");

      // Fill name, email, phone
      try {
        await page.fill("#r-name", TEST_USER.name);
        await page.fill("#r-email", TEST_USER.email);
        await page.fill("#r-phone", TEST_USER.phone);
        log("Filled name/email/phone");
      } catch (e) {
        log("Failed filling register fields:", (e as Error).message);
      }
      await wait(1500); // let debounced availability checks settle

      // Try to click "Kirim OTP" button
      let otpButtonClicked = false;
      try {
        const btn = page.getByRole("button", { name: /kirim otp/i });
        if (await btn.count()) {
          await btn.first().click();
          otpButtonClicked = true;
          log("Clicked 'Kirim OTP' button");
        } else {
          // Try link-style button (text-based)
          await page
            .getByText(/^kirim otp$/i, { exact: false })
            .first()
            .click();
          otpButtonClicked = true;
          log("Clicked 'Kirim OTP' text");
        }
      } catch (e) {
        log("Could not click Kirim OTP:", (e as Error).message);
      }
      await wait(3000); // wait for OTP API response
      await snapshot(page, "04-after-kirim-otp");

      // Examine the OTP API response — does it include _devCode?
      if (lastOtpSendResponse) {
        log(
          "OTP send response:",
          JSON.stringify({
            success: lastOtpSendResponse.success,
            sentViaWhatsapp: lastOtpSendResponse.sentViaWhatsapp,
            hasDevCode: !!lastOtpSendResponse._devCode,
            devCode: lastOtpSendResponse._devCode || null,
            message: lastOtpSendResponse.message,
            error: lastOtpSendResponse.error,
          })
        );
        summary.registration.details = {
          otpSendResponse: lastOtpSendResponse,
          otpButtonClicked,
        };
      } else {
        log("No /api/auth/register-otp response captured");
        summary.registration.details = { otpButtonClicked, otpResponseCaptured: false };
      }

      // If we got a _devCode, enter it. Otherwise, we cannot complete UI
      // registration (Fonnte sends a real WhatsApp message in production).
      let otpVerifiedViaUi = false;
      if (lastOtpSendResponse?._devCode) {
        log("Got dev code — entering it into InputOTP");
        const code = String(lastOtpSendResponse._devCode);
        // InputOTP uses 6 separate slots — typing into the group fills them
        try {
          const otpInput = page.locator('[role="textbox"], input').first();
          await page.keyboard.type(code, { delay: 50 });
          await wait(500);
          // click verify
          const verifyBtn = page.getByRole("button", { name: /verifikasi/i });
          if (await verifyBtn.count()) {
            await verifyBtn.first().click();
            await wait(2000);
            otpVerifiedViaUi = true;
          }
        } catch (e) {
          log("Failed to enter/verify OTP via UI:", (e as Error).message);
        }
      }

      if (!otpVerifiedViaUi) {
        log(
          "OTP verification cannot be completed via UI in production (Fonnte sends real WA). " +
            "Falling back to direct /api/auth/register + /api/auth/login + localStorage injection."
        );
        summary.registration.viaUi = false;

        // --- Direct API registration (bypasses client-side OTP check) ---
        const regRes = await page.evaluate(async (u) => {
          const r = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: u.name,
              email: u.email,
              password: u.password,
              phone: u.phone,
            }),
          });
          const data = await r.json().catch(() => null);
          return { ok: r.ok, status: r.status, data };
        }, TEST_USER);
        log("Direct register API response:", JSON.stringify(regRes));
        summary.registration.details = {
          ...(summary.registration.details || {}),
          directRegister: regRes,
        };

        let userObj: any = null;
        if (regRes.ok && regRes.data?.user) {
          userObj = regRes.data.user;
        } else {
          // Maybe user already exists from a prior run — try login
          log("Register did not return a user — trying login instead");
          const loginRes = await page.evaluate(async (u) => {
            const r = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: u.email, password: u.password }),
            });
            const data = await r.json().catch(() => null);
            return { ok: r.ok, status: r.status, data };
          }, TEST_USER);
          log("Direct login API response:", JSON.stringify(loginRes));
          summary.registration.details.directLogin = loginRes;
          if (loginRes.ok && loginRes.data?.user) {
            userObj = loginRes.data.user;
          }
        }

        if (userObj) {
          // Inject user into the persisted zustand store ("gomesin-store") and
          // set view="post" so the app navigates straight to the post-ad wizard.
          await page.evaluate((u) => {
            const KEY = "gomesin-store";
            const existing = localStorage.getItem(KEY);
            let parsed: any = {};
            try {
              if (existing) parsed = JSON.parse(existing);
            } catch {}
            parsed.state = parsed.state || {};
            parsed.state.user = u;
            parsed.state.view = "post";
            parsed.state.profilePanel = null;
            parsed.state.history = [];
            localStorage.setItem(KEY, JSON.stringify(parsed));
          }, userObj);
          log("Injected user into localStorage + set view=post. Reloading…");
          summary.registration.viaApi = true;

          // Reload to let the app rehydrate from localStorage
          await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60_000 });
          await wait(3000);
          await snapshot(page, "05-after-login-inject");
        } else {
          log("Could not obtain a user object — cannot continue to post-ad form");
          summary.failedStep = "registration";
          summary.errorMessage = "Could not register or login as test user";
        }
      }
    } else {
      log("Login view NOT detected — assuming already logged in or directly on post-ad");
    }

    // =====================================================================
    // STEP 4: Verify we're on the post-ad form
    // =====================================================================
    await dismissInstallPrompt(page);
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
    await snapshot(page, "06-post-ad-form");

    if (!onPostAd) {
      // Try clicking Pasang Iklan again (in case login redirect went home)
      log("Not on post-ad form — clicking 'Pasang Iklan' again");
      await page.evaluate(() => {
        const cands = Array.from(document.querySelectorAll("button, a")) as HTMLElement[];
        const t = cands.find((el) =>
          (el.textContent || "").toLowerCase().includes("pasang iklan")
        );
        t?.click();
      });
      await wait(2500);
      await dismissInstallPrompt(page);
      await snapshot(page, "06b-post-ad-retry");
    }

    // =====================================================================
    // STEP 5: Fill Step 1 (Informasi Dasar)
    // =====================================================================
    if (summary.postAdFormOpened || (await page.evaluate(() =>
      (document.body.textContent || "").toLowerCase().includes("informasi dasar")
    ))) {
      log("=== STEP 1: Informasi Dasar ===");
      summary.steps.push("step1-informasi-dasar");

      // Title — input with placeholder "Contoh: Mesin Press Hidrolik 100 Ton"
      try {
        await page
          .getByPlaceholder(/contoh: mesin press/i)
          .first()
          .fill("Test Mesin Repro", { timeout: 5000 });
        log("Filled title");
      } catch (e) {
        log("Title placeholder not found — trying generic input fill");
        // The title is the first text Input after the category Select
        const inputs = page.locator('input[type="text"], input:not([type])');
        const count = await inputs.count();
        log(`Found ${count} text inputs`);
        if (count > 0) {
          await inputs.first().fill("Test Mesin Repro", { timeout: 5000 });
        }
      }

      // Category — Radix Select trigger has role="combobox". Click the first one.
      try {
        const catTrigger = page.getByRole("combobox").first();
        await catTrigger.click({ timeout: 5000 });
        await wait(800);
        // Click the first SelectItem in the dropdown
        const firstItem = page.locator('[role="option"]').first();
        await firstItem.click({ timeout: 5000 });
        log("Selected first category");
      } catch (e) {
        log("Category select failed:", (e as Error).message);
      }
      await wait(500);

      // Price — input with placeholder "contoh: 185.000.000"
      try {
        await page
          .getByPlaceholder(/185\.000\.000/i)
          .first()
          .fill("5000000", { timeout: 5000 });
        log("Filled price");
      } catch (e) {
        log("Price placeholder not found:", (e as Error).message);
      }

      // Province — Radix Select. There are multiple comboboxes; province is
      // the 3rd (0=category, 1=condition, 2=year, 3=province, 4=city).
      // We click each combobox and inspect its placeholder via the trigger's text.
      try {
        // Find the combobox whose trigger text matches "Pilih provinsi"
        const provTrigger = page.locator('[role="combobox"]').filter({
          hasText: /pilih provinsi/i,
        }).first();
        await provTrigger.click({ timeout: 5000 });
        await wait(700);
        const dki = page.locator('[role="option"]').filter({ hasText: /dki jakarta/i }).first();
        if (await dki.count()) {
          await dki.click({ timeout: 5000 });
          log("Selected province DKI Jakarta");
        } else {
          await page.locator('[role="option"]').first().click({ timeout: 5000 });
          log("Selected first province");
        }
        await wait(500);
      } catch (e) {
        log("Province select failed:", (e as Error).message);
      }

      // City — Select with placeholder "Pilih kota" / "Pilih provinsi dulu"
      try {
        const cityTrigger = page.locator('[role="combobox"]').filter({
          hasText: /pilih kota|pilih provinsi dulu/i,
        }).first();
        await cityTrigger.click({ timeout: 5000 });
        await wait(700);
        const jakarta = page.locator('[role="option"]').filter({ hasText: /jakarta/i }).first();
        if (await jakarta.count()) {
          await jakarta.click({ timeout: 5000 });
          log("Selected city Jakarta");
        } else {
          await page.locator('[role="option"]').first().click({ timeout: 5000 });
          log("Selected first city");
        }
        await wait(500);
      } catch (e) {
        log("City select failed:", (e as Error).message);
      }

      await snapshot(page, "07-step1-filled");

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

      // Capture any toast that appeared
      const t1 = await captureToasts(page);
      if (t1.length) {
        toasts.push(...t1);
        log("Toasts after step 1:", t1);
        if (!summary.failedStep) {
          summary.failedStep = "step1";
          summary.errorMessage = t1.join(" | ");
        }
      }
      await snapshot(page, "08-after-step1-next");

      // =====================================================================
      // STEP 6: Fill Step 2 (Detail & Deskripsi)
      // =====================================================================
      // Check we actually advanced
      const onStep2 = await page.evaluate(() =>
        (document.body.textContent || "").toLowerCase().includes("detail & deskripsi")
      );
      if (onStep2 || !summary.failedStep) {
        log("=== STEP 2: Detail & Deskripsi ===");
        summary.steps.push("step2-detail-deskripsi");
        await dismissInstallPrompt(page);

        // Description textarea — placeholder "Tuliskan detail spesifikasi…"
        try {
          await page
            .getByPlaceholder(/tuliskan detail spesifikasi/i)
            .first()
            .fill("Test deskripsi mesin", { timeout: 5000 });
          log("Filled description");
        } catch (e) {
          log("Description placeholder not found:", (e as Error).message);
          // fallback: first textarea
          try {
            await page.locator("textarea").first().fill("Test deskripsi mesin", { timeout: 5000 });
          } catch {}
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
          if (!summary.failedStep) {
            summary.failedStep = "step2";
            summary.errorMessage = t2.join(" | ");
          }
        }
        await snapshot(page, "09-after-step2-next");

        // =====================================================================
        // STEP 7: Step 3 (Foto Mesin)
        // =====================================================================
        const onStep3 = await page.evaluate(() =>
          (document.body.textContent || "").toLowerCase().includes("foto mesin")
        );
        if (onStep3 || !summary.failedStep) {
          log("=== STEP 3: Foto Mesin ===");
          summary.steps.push("step3-foto-mesin");
          await dismissInstallPrompt(page);

          // Use example photos — there's a link/button with text "Gunakan contoh"
          // (tr("useExample") in Indonesian).
          try {
            const exampleBtn = page
              .getByText(/gunakan contoh|pakai contoh|use example|contoh/i, { exact: false })
              .first();
            await exampleBtn.click({ timeout: 5000 });
            log("Clicked 'Gunakan contoh' to load placeholder photos");
            await wait(1500);
          } catch (e) {
            log("Use-example button not found:", (e as Error).message);
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
            if (!summary.failedStep) {
              summary.failedStep = "step3";
              summary.errorMessage = t3.join(" | ");
            }
          }
          await snapshot(page, "10-after-step3-next");

          // =====================================================================
          // STEP 8: Step 4 (Konfirmasi) — click submit
          // =====================================================================
          const onStep4 = await page.evaluate(() =>
            (document.body.textContent || "").toLowerCase().includes("konfirmasi")
          );
          if (onStep4 || !summary.failedStep) {
            log("=== STEP 4: Konfirmasi ===");
            summary.steps.push("step4-konfirmasi");
            await dismissInstallPrompt(page);

            await snapshot(page, "11-step4-before-submit");

            // The submit button text is "Publikasikan" (no payment method chosen)
            // or "Bayar & Pasang" (payment method chosen). Default package is
            // "colek" (Gold, Rp 60.000) — a PAID package. With no payment method
            // selected, submit() should fire toast.error("Pilih metode pembayaran
            // untuk paket berbayar") and return WITHOUT calling /api/listings.
            const beforeListingsCalls = netLog.filter(
              (n) => n.url.includes("/api/listings") && n.method === "POST"
            ).length;

            // Helper: poll toasts every 350ms for `totalMs` (captures short-lived toasts).
            const pollToasts = async (totalMs: number): Promise<string[]> => {
              const seen: string[] = [];
              const start = Date.now();
              while (Date.now() - start < totalMs) {
                const cur = await captureToasts(page);
                for (const t of cur) {
                  if (!seen.includes(t)) seen.push(t);
                }
                await wait(350);
              }
              return seen;
            };

            // Helper: detect QRIS payment modal (the FULL-SCREEN overlay, not the
            // payment-method buttons on step 4). The modal uniquely contains the
            // "Kirim & Pasang Iklan" button + "Total Pembayaran" heading +
            // "Scan QRIS untuk membayar" or "Transfer ke rekening di atas".
            const isQrisModalOpen = async (): Promise<boolean> => {
              return await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll("button"));
                const hasKirimPasang = btns.some((b) =>
                  /kirim & pasang iklan/i.test((b.textContent || "").trim())
                );
                const txt = (document.body.textContent || "").toLowerCase();
                const hasScanQris = txt.includes("scan qris untuk membayar");
                const hasTransferToRekening = txt.includes("transfer ke rekening di atas");
                const hasKirimBukti = txt.includes("kirim bukti pembayaran");
                return hasKirimPasang || hasScanQris || hasTransferToRekening || hasKirimBukti;
              });
            };

            // --- ATTEMPT 1: Click "Publikasikan" with NO payment method selected ---
            log("[attempt 1] Clicking 'Publikasikan' with default package + no payment method…");
            try {
              let submitBtn = page.getByRole("button", { name: /publikasikan/i }).last();
              if (!(await submitBtn.count())) {
                submitBtn = page.getByRole("button", { name: /bayar & pasang|pasang iklan/i }).last();
              }
              if (!(await submitBtn.count())) {
                submitBtn = page.locator("button.w-full").last();
              }
              await submitBtn.click({ timeout: 5000 });
              log("[attempt 1] Clicked submit button");
            } catch (e) {
              log("[attempt 1] Clicking submit failed:", (e as Error).message);
              summary.failedStep = "step4-submit";
              summary.errorMessage = (e as Error).message;
            }

            // Poll toasts + modal for 4s (toast auto-dismisses ~4s)
            const attempt1Toasts = await pollToasts(4000);
            if (attempt1Toasts.length) toasts.push(...attempt1Toasts);
            const attempt1Modal = await isQrisModalOpen();
            const attempt1ListingsCalls = netLog.filter(
              (n) => n.url.includes("/api/listings") && n.method === "POST"
            ).length;
            log("[attempt 1] toasts:", attempt1Toasts);
            log("[attempt 1] QRIS modal open?:", attempt1Modal);
            log(
              `[attempt 1] /api/listings POST calls: before=${beforeListingsCalls}, after=${attempt1ListingsCalls}`
            );
            await snapshot(page, "12-after-submit-attempt1");

            // --- ATTEMPT 2: Select a payment method (QRIS GoPay), then click submit ---
            // This should now open the QRIS payment modal (still no /api/listings POST).
            let attempt2Modal = false;
            let attempt2Toasts: string[] = [];
            let attempt2ListingsCalls = attempt1ListingsCalls;
            if (attempt1ListingsCalls === beforeListingsCalls) {
              log("[attempt 2] Selecting 'QRIS GoPay' payment method, then clicking submit…");
              try {
                // Click the QRIS GoPay payment method button (NOT the package button).
                // The payment method buttons are inside the "Pembayaran" section and
                // have labels like "QRIS GoPay\nScan QR dari GoPay / e-wallet".
                const qrisPayBtn = page
                  .getByRole("button")
                  .filter({ hasText: /^QRIS GoPay/i })
                  .first();
                await qrisPayBtn.click({ timeout: 5000 });
                log("[attempt 2] Selected 'QRIS GoPay' payment method");
                await wait(800);

                // Now the submit button text changes to "Bayar & Pasang"
                let submitBtn2 = page.getByRole("button", { name: /bayar & pasang/i }).last();
                if (!(await submitBtn2.count())) {
                  submitBtn2 = page.getByRole("button", { name: /publikasikan/i }).last();
                }
                await submitBtn2.click({ timeout: 5000 });
                log("[attempt 2] Clicked submit button (Bayar & Pasang)");
                await wait(1500);
              } catch (e) {
                log("[attempt 2] failed:", (e as Error).message);
              }

              attempt2Toasts = await pollToasts(3000);
              if (attempt2Toasts.length) toasts.push(...attempt2Toasts);
              attempt2Modal = await isQrisModalOpen();
              attempt2ListingsCalls = netLog.filter(
                (n) => n.url.includes("/api/listings") && n.method === "POST"
              ).length;
              log("[attempt 2] toasts:", attempt2Toasts);
              log("[attempt 2] QRIS modal open?:", attempt2Modal);
              log("[attempt 2] /api/listings POST calls:", attempt2ListingsCalls);
              await snapshot(page, "13-after-submit-attempt2");
            }

            const afterListingsCalls = attempt2ListingsCalls;

            // Determine the failure point
            if (afterListingsCalls === beforeListingsCalls) {
              // No API call to /api/listings was made across both attempts
              summary.failedStep = summary.failedStep || "step4-submit";
              const parts: string[] = [];
              parts.push(
                `NO /api/listings POST was made. The default package 'colek' (Gold) ` +
                  `costs Rp 60.000 and is PAID. There is NO free package option in the UI.`
              );
              if (attempt1Toasts.length) {
                parts.push(
                  `Attempt 1 (no payment method) → toast: "${attempt1Toasts.join(" | ")}"`
                );
              } else {
                parts.push("Attempt 1 (no payment method) → no toast captured");
              }
              if (attempt2Modal) {
                parts.push(
                  "Attempt 2 (QRIS GoPay selected) → QRIS payment modal opened (requires " +
                    "proof upload + admin verification before ad is created)"
                );
              } else if (attempt2Toasts.length) {
                parts.push(
                  `Attempt 2 (QRIS GoPay selected) → toast: "${attempt2Toasts.join(" | ")}"`
                );
              }
              summary.errorMessage = parts.join("\n");
            } else {
              // API call WAS made — capture the result
              summary.failedStep = null;
              summary.errorMessage = null;
            }
          }
        }
      }
    }

    // =====================================================================
    // Final: capture API request/response for /api/listings POST
    // =====================================================================
    if (lastListingsPostRequest) {
      summary.apiRequestPayload = (() => {
        try {
          return lastListingsPostRequest!.requestBody
            ? JSON.parse(lastListingsPostRequest!.requestBody!)
            : lastListingsPostRequest!.requestBody;
        } catch {
          return lastListingsPostRequest!.requestBody;
        }
      })();
      summary.apiResponse = lastListingsPostResponse;
    }

    // Network errors (status >= 400)
    summary.networkErrors = netLog.filter(
      (n) => n.status >= 400 || n.failed
    );

    // Console errors
    summary.consoleErrors = consoleLog.filter((c) => c.kind === "error");
    summary.pageErrors = pageErrors;

    summary.toasts = toasts;
    summary.screenshotPath = SHOTS_DIR;
    summary.endedAt = new Date().toISOString();

    // Print final summary
    console.log("\n" + "=".repeat(80));
    console.log("REPRODUCTION SUMMARY");
    console.log("=".repeat(80));
    console.log(JSON.stringify(summary, null, 2));
    console.log("=".repeat(80));
    console.log(`Screenshots saved to: ${SHOTS_DIR}`);

    // Write summary to file
    writeFileSync(
      resolve(SHOTS_DIR, "summary.json"),
      JSON.stringify(summary, null, 2)
    );
    // Also write full net log
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
