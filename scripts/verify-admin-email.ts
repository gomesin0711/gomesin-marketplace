/**
 * verify-admin-email.ts
 *
 * Verifies the admin email change from mesinKU0711@gmail.com -> mesinku711@gmail.com
 * in the running dev server at http://localhost:3000.
 *
 * Verification steps:
 *   1. Home page renders without errors.
 *   2. Footer contact email shows mesinku711@gmail.com (NOT mesinKU0711@gmail.com).
 *   3. Login flow with mesinku711@gmail.com / admin123 succeeds and
 *      the admin panel ("Panel Administrator" heading) loads.
 *   4. Admin access-denied screen hint shows "mesinku711@gmail.com / admin123"
 *      (by attempting to open admin view while logged OUT in a fresh context).
 *   5. Profile/Hubungi Kami support email shows mesinku711@gmail.com.
 *
 * Run: bun run scripts/verify-admin-email.ts
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

const BASE = "http://localhost:3000";
const SHOTS_DIR = resolve(process.cwd(), "verify-admin-email-shots");
mkdirSync(SHOTS_DIR, { recursive: true });

const ADMIN_EMAIL = "mesinku711@gmail.com";
const ADMIN_PASS = "admin123";
const OLD_EMAIL = "mesinKU0711@gmail.com";

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

function attachCollectors(page: Page) {
  page.on("console", (msg: ConsoleMessage) => {
    consoleLog.push({
      kind: msg.type() as ConsoleEntry["kind"],
      text: msg.text(),
      url: msg.location().url,
      line: msg.location().lineNumber,
      col: msg.location().columnNumber,
    });
  });
  page.on("pageerror", (err: Error) => {
    pageErrors.push({
      kind: "pageerror",
      text: err.message,
      url: err.stack?.split("\n")[1] ?? "",
    });
  });
  page.on("request", (req: Request) => {
    if (req.url().includes("/api/") || req.url().includes("auth")) {
      let body: string | null = null;
      try {
        const pd = req.postData();
        if (pd) body = pd;
      } catch {
        body = null;
      }
      netLog.push({
        method: req.method(),
        url: req.url(),
        status: 0,
        resourceType: req.resourceType(),
        requestBody: body,
      });
    }
  });
  page.on("response", async (res: Response) => {
    const url = res.url();
    if (!url.includes("/api/") && !url.includes("auth")) return;
    // find the matching request entry
    const matching = [...netLog].reverse().find((n) => n.url === url && n.status === 0);
    if (matching) {
      matching.status = res.status();
      matching.responseContentType = res.headers()["content-type"] ?? null;
      try {
        const body = await res.text();
        matching.responseBody = body.length > 4000 ? body.slice(0, 4000) + "…[truncated]" : body;
      } catch {
        matching.responseBody = null;
      }
    }
  });
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

async function saveShot(page: Page, name: string) {
  const p = resolve(SHOTS_DIR, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 ${name}`);
}

async function fullBodyText(page: Page): Promise<string> {
  return await page.evaluate(() => document.body.innerText ?? "");
}

// ---------------------------------------------------------------------------
//  Verification — context 1: login + footer + admin panel
// ---------------------------------------------------------------------------

async function verifyMainFlow() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  attachCollectors(page);

  const result: Record<string, unknown> = {
    baseUrl: BASE,
    startedAt: new Date().toISOString(),
  };

  // ---------- Step 1: open home page ----------
  console.log("\n=== Step 1: open home page ===");
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    // Wait for the page title to settle (Next.js dev may show "(0)" in dev)
    await page.waitForTimeout(1500);
    const title = await page.title();
    const bodyText = await fullBodyText(page);
    const homeRenders = !!title && bodyText.length > 100;
    result.homePage = {
      ok: homeRenders,
      title,
      bodyTextLength: bodyText.length,
    };
    console.log("  title:", title);
    console.log("  bodyText length:", bodyText.length);
    await saveShot(page, "01-home.png");
  } catch (e) {
    result.homePage = { ok: false, error: String(e) };
  }

  // ---------- Step 2: footer email ----------
  console.log("\n=== Step 2: footer email ===");
  try {
    // First, dismiss any modal that intercepts clicks (e.g. PWA install prompt).
    const dismissModal = async () => {
      const candidates = ["Nanti Saja", "Mengerti", "Tutup", "Close"];
      for (const txt of candidates) {
        const btn = page.locator(`button:has-text("${txt}")`).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          console.log(`  dismissed modal via "${txt}"`);
          await page.waitForTimeout(400);
        }
      }
    };
    await dismissModal();

    // Scroll to the bottom of the page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    // Take a shot of the footer
    await saveShot(page, "02-footer.png");

    // Find the footer's contact email
    const footerEmail = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      if (!footer) return { found: false, text: null };
      const text = footer.textContent ?? "";
      return { found: true, text };
    });
    const footerHasNew = (footerEmail.text ?? "").includes(ADMIN_EMAIL);
    const footerHasOld = (footerEmail.text ?? "").includes(OLD_EMAIL);
    result.footerEmail = {
      found: footerEmail.found,
      hasNew: footerHasNew,
      hasOld: footerHasOld,
      sample: (footerEmail.text ?? "").slice(0, 400),
    };
    console.log("  footer found:", footerEmail.found);
    console.log("  has mesinku711@gmail.com :", footerHasNew);
    console.log("  has mesinKU0711@gmail.com (OLD):", footerHasOld);
  } catch (e) {
    result.footerEmail = { error: String(e) };
  }

  // ---------- Step 3: login flow ----------
  console.log("\n=== Step 3: login flow ===");
  try {
    // Scroll back to top, find the header login button
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Dismiss PWA install prompt if present.
    const dismissModal = async () => {
      const candidates = ["Nanti Saja", "Mengerti", "Tutup", "Close"];
      for (const txt of candidates) {
        const btn = page.locator(`button:has-text("${txt}")`).first();
        if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          console.log(`  dismissed modal via "${txt}"`);
          await page.waitForTimeout(400);
        }
      }
    };
    await dismissModal();

    // Click the "Masuk atau Daftar" header button.
    // There are two instances (mobile size-8 icon button + desktop button with text).
    // At 1366px only the desktop button is visible. Use `.filter({ visible: true })`.
    const loginBtns = page.getByLabel("Masuk atau Daftar");
    const visibleLoginBtns = loginBtns.filter({ visible: true });
    const visibleCount = await visibleLoginBtns.count();
    console.log("  visible 'Masuk atau Daftar' buttons:", visibleCount);
    const loginBtn = visibleCount > 0 ? visibleLoginBtns.last() : loginBtns.last();
    await loginBtn.click({ timeout: 10_000, force: true });
    await page.waitForTimeout(1200);
    await saveShot(page, "03-after-click-login.png");

    // Make sure we are on the "Masuk" tab (login tab, not register).
    // The login tab trigger is a tab button with text "Masuk" / value="login".
    // Try clicking the "Masuk" tab if a Tabs component renders.
    const masukTab = page.locator('[role="tab"]:has-text("Masuk")').first();
    if (await masukTab.isVisible().catch(() => false)) {
      await masukTab.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await saveShot(page, "04-login-tab.png");

    // The login form is rendered twice (mobile + desktop). Use .last() (desktop visible at 1366px).
    const emailInput = page.locator('#l-email').last();
    const passInput = page.locator('#l-pass').last();
    await emailInput.waitFor({ state: "visible", timeout: 10_000 });
    await emailInput.fill(ADMIN_EMAIL);
    await passInput.fill(ADMIN_PASS);
    await saveShot(page, "05-login-filled.png");

    // Submit
    const submitBtn = page.locator('button[type="submit"]').last();
    await submitBtn.click({ timeout: 10_000 });

    // Wait for either the admin panel heading, or the success state, or a toast.
    // After admin login the app calls goToAdmin() after 1100ms (see login.tsx line ~322-329).
    try {
      await page.waitForSelector('h1:has-text("Panel Administrator")', { timeout: 25_000 });
      result.adminPanelLoaded = true;
    } catch {
      result.adminPanelLoaded = false;
    }

    // After admin panel loads, capture additional state
    const url = page.url();
    const bodyText = await fullBodyText(page);
    const adminHeadingVisible = await page.locator('h1:has-text("Panel Administrator")').isVisible().catch(() => false);

    await saveShot(page, "06-after-login.png");

    // Look for old email anywhere in the visible body text
    const bodyHasOldEmail = bodyText.includes(OLD_EMAIL);
    const bodyHasNewEmail = bodyText.includes(ADMIN_EMAIL);

    result.login = {
      adminPanelHeadingVisible: adminHeadingVisible,
      adminPanelLoaded: result.adminPanelLoaded,
      bodyHasOldEmail,
      bodyHasNewEmail,
      url,
    };
    console.log("  admin panel heading visible:", adminHeadingVisible);
    console.log("  admin panel loaded (selector):", result.adminPanelLoaded);
    console.log("  body contains OLD email:", bodyHasOldEmail);
    console.log("  body contains NEW email:", bodyHasNewEmail);
    console.log("  url:", url);
  } catch (e) {
    result.login = { error: String(e) };
    console.log("  login error:", String(e));
  }

  // ---------- Step 5: profile / Hubungi Kami support email ----------
  console.log("\n=== Step 5: profile support email ===");
  try {
    // Dismiss any modal that may have popped up.
    const dismissModal = async () => {
      const candidates = ["Nanti Saja", "Mengerti", "Tutup", "Close"];
      for (const txt of candidates) {
        const btn = page.locator(`button:has-text("${txt}")`).first();
        if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          console.log(`  dismissed modal via "${txt}"`);
          await page.waitForTimeout(400);
        }
      }
    };
    await dismissModal();

    // Navigate to the profile view via the Zustand store's goToProfile().
    // This is more reliable than clicking the bottom-nav button (which is
    // `md:hidden` — invisible at our 1366px desktop viewport).
    await page.evaluate(() => {
      try {
        for (const key of Object.keys(window as any)) {
          if (key.toLowerCase().includes("gomesin")) {
            const s = (window as any)[key];
            if (s && typeof s.getState === "function") {
              const st = s.getState();
              if (typeof st.goToProfile === "function") {
                st.goToProfile();
                return true;
              }
            }
          }
        }
      } catch {}
      return false;
    });
    await page.waitForTimeout(1500);
    await saveShot(page, "07-profile-default.png");

    // Navigate to the "pengaturan" panel — has the "Tentang mesinKU" / "Email Dukungan" card.
    await page.evaluate(() => {
      try {
        for (const key of Object.keys(window as any)) {
          if (key.toLowerCase().includes("gomesin")) {
            const s = (window as any)[key];
            if (s && typeof s.getState === "function") {
              const st = s.getState();
              if (typeof st.goToProfilePanel === "function") {
                st.goToProfilePanel("pengaturan");
                return true;
              }
            }
          }
        }
      } catch {}
      return false;
    });
    await page.waitForTimeout(1200);
    await saveShot(page, "08-profile-pengaturan.png");

    // Scrape "Email Dukungan" row
    const pengaturanInfo = await page.evaluate(() => {
      const text = document.body.innerText ?? "";
      const idx = text.indexOf("Email Dukungan");
      let line: string | null = null;
      if (idx >= 0) {
        line = text.slice(idx, idx + 200).split("\n").slice(0, 4).join(" | ");
      }
      return {
        hasEmailDukungan: idx >= 0,
        line,
      };
    });

    // Navigate to "bantuan" panel — has the "Hubungi Kami" card with mailto link.
    await page.evaluate(() => {
      try {
        for (const key of Object.keys(window as any)) {
          if (key.toLowerCase().includes("gomesin")) {
            const s = (window as any)[key];
            if (s && typeof s.getState === "function") {
              const st = s.getState();
              if (typeof st.goToProfilePanel === "function") {
                st.goToProfilePanel("bantuan");
                return true;
              }
            }
          }
        }
      } catch {}
      return false;
    });
    await page.waitForTimeout(1200);
    await saveShot(page, "09-profile-bantuan.png");

    // Scrape "Hubungi Kami" card + mailto
    const bantuanInfo = await page.evaluate(() => {
      const text = document.body.innerText ?? "";
      const idx = text.indexOf("Hubungi Kami");
      let block: string | null = null;
      if (idx >= 0) {
        block = text.slice(idx, idx + 500).split("\n").slice(0, 8).join(" | ");
      }
      // Also check the mailto link href
      const mailto = document.querySelector('a[href^="mailto:mesinku711"]') ||
                     document.querySelector('a[href^="mailto:mesinKU0711"]');
      const href = mailto ? (mailto as HTMLAnchorElement).href : null;
      return {
        hasHubungiKami: idx >= 0,
        block,
        mailtoHref: href,
      };
    });

    const profileHasNew =
      (pengaturanInfo.line ?? "").includes(ADMIN_EMAIL) ||
      (bantuanInfo.block ?? "").includes(ADMIN_EMAIL) ||
      (bantuanInfo.mailtoHref ?? "").includes(ADMIN_EMAIL);
    const profileHasOld =
      (pengaturanInfo.line ?? "").includes(OLD_EMAIL) ||
      (bantuanInfo.block ?? "").includes(OLD_EMAIL) ||
      (bantuanInfo.mailtoHref ?? "").includes(OLD_EMAIL);

    result.profileEmail = {
      pengaturanInfo,
      bantuanInfo,
      hasNew: profileHasNew,
      hasOld: profileHasOld,
    };
    console.log("  Email Dukungan row found:", pengaturanInfo.hasEmailDukungan);
    console.log("  Email Dukungan line    :", pengaturanInfo.line);
    console.log("  Hubungi Kami card found:", bantuanInfo.hasHubungiKami);
    console.log("  Hubungi Kami block     :", bantuanInfo.block);
    console.log("  mailto href            :", bantuanInfo.mailtoHref);
    console.log("  has NEW email          :", profileHasNew);
    console.log("  has OLD email          :", profileHasOld);
  } catch (e) {
    result.profileEmail = { error: String(e) };
    console.log("  profile email error:", String(e));
  }

  // Final results
  result.finishedAt = new Date().toISOString();
  result.consoleErrors = consoleLog.filter((c) => c.kind === "error");
  result.pageErrors = pageErrors;
  result.netErrors = netLog.filter((n) => n.status >= 400 || n.failed);
  result.toasts = toasts;
  result.netLog = netLog;

  writeFileSync(resolve(SHOTS_DIR, "summary.json"), JSON.stringify(result, null, 2));
  writeFileSync(resolve(SHOTS_DIR, "console.json"), JSON.stringify(consoleLog, null, 2));
  writeFileSync(resolve(SHOTS_DIR, "netlog.json"), JSON.stringify(netLog, null, 2));

  await browser.close();
  return result;
}

// ---------------------------------------------------------------------------
//  Verification — context 2: admin access-denied hint
// ---------------------------------------------------------------------------

async function verifyAccessDeniedHint() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();

  console.log("\n=== Step 4: admin access-denied hint ===");
  // Force the admin view via URL state. The app-shell uses ?view=admin or a Zustand store.
  // We try both: visit the admin view directly.
  try {
    // The store key is "gomesin-store". Try setting it to view=admin before page load.
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Try clicking the admin nav button if present (usually hidden; only visible to admins).
    // Otherwise, set the store state via JS.
    const wentToAdmin = await page.evaluate(() => {
      try {
        // @ts-ignore
        const store = (window as any).__gomesinStore ?? (window as any).gomesinStore;
        // Zustand stores expose getState/setState. We try a few common keys.
        const candidates = (window as any);
        for (const key of Object.keys(candidates)) {
          if (key.toLowerCase().includes("gomesin")) {
            const s = candidates[key];
            if (s && typeof s.getState === "function" && typeof s.getState().goToAdmin === "function") {
              s.getState().goToAdmin();
              return true;
            }
          }
        }
        return false;
      } catch {
        return false;
      }
    });

    if (!wentToAdmin) {
      // Try setting localStorage / sessionStorage with a `view=admin` flag.
      // Some apps persist the store as JSON in localStorage under "gomesin-store".
      await page.evaluate(() => {
        try {
          const raw = localStorage.getItem("gomesin-store");
          if (raw) {
            const obj = JSON.parse(raw);
            obj.state = obj.state ?? {};
            obj.state.view = "admin";
            localStorage.setItem("gomesin-store", JSON.stringify(obj));
          } else {
            localStorage.setItem(
              "gomesin-store",
              JSON.stringify({
                state: { view: "admin" },
                version: 0,
              })
            );
          }
        } catch {}
      });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    await saveShot(page, "09-admin-access-denied.png");

    // Look for the "Akses Ditolak" heading and the hint paragraph
    const deniedInfo = await page.evaluate(() => {
      const text = document.body.innerText ?? "";
      const aksesIdx = text.indexOf("Akses Ditolak");
      let aksesBlock: string | null = null;
      if (aksesIdx >= 0) {
        aksesBlock = text.slice(aksesIdx, aksesIdx + 400);
      }
      // Search for the literal hint
      const hint = "mesinku711@gmail.com / admin123";
      const oldHint = "mesinKU0711@gmail.com / admin123";
      return {
        hasAksesDitolak: aksesIdx >= 0,
        aksesBlock,
        hasNewHint: text.includes(hint),
        hasOldHint: text.includes(oldHint),
      };
    });

    await saveShot(page, "10-admin-denied-zoom.png");
    console.log("  has Akses Ditolak heading:", deniedInfo.hasAksesDitolak);
    console.log("  aksesBlock:", deniedInfo.aksesBlock);
    console.log("  has NEW hint (mesinku711@gmail.com / admin123):", deniedInfo.hasNewHint);
    console.log("  has OLD hint (mesinKU0711@gmail.com / admin123):", deniedInfo.hasOldHint);

    writeFileSync(
      resolve(SHOTS_DIR, "access-denied.json"),
      JSON.stringify(deniedInfo, null, 2)
    );

    await browser.close();
    return deniedInfo;
  } catch (e) {
    console.log("  access-denied error:", String(e));
    await browser.close();
    return { error: String(e) };
  }
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

(async () => {
  console.log("=== verify-admin-email.ts ===");
  console.log("BASE:", BASE);
  console.log("SHOTS_DIR:", SHOTS_DIR);

  const main = await verifyMainFlow();
  const denied = await verifyAccessDeniedHint();

  console.log("\n=== FINAL SUMMARY ===");
  console.log(JSON.stringify({ main, denied }, null, 2));
})();
