/**
 * verify-prod.ts
 *
 * Verifies that the production deployment at https://gomesin.vercel.app
 * no longer emits the "Unexpected token '<', \"<!DOCTYPE\"... is not valid JSON"
 * error caused by socket.io trying to parse HTML (the Next.js homepage) as
 * the socket.io protocol on Vercel (where the chat-service mini-service
 * does not run).
 *
 * What this script does:
 *  1. Launches headless Chromium.
 *  2. Attaches console + pageerror + request + response + requestfailed listeners.
 *  3. Navigates to the homepage, waits 10s after load.
 *  4. Navigates to the admin/login area, waits 10s after load.
 *  5. Takes a homepage screenshot.
 *  6. Prints a structured report to stdout AND writes results.json.
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE = "https://gomesin.vercel.app";
const SHOTS_DIR = resolve(process.cwd(), "verify-prod-shots");
mkdirSync(SHOTS_DIR, { recursive: true });

type ConsoleEntry = {
  kind: "log" | "info" | "warning" | "error" | "pageerror";
  text: string;
  url?: string;
  location?: { url: string; lineNumber: number; columnNumber: number };
};

type NetEntry = {
  method: string;
  url: string;
  status: number;
  resourceType: string;
  failed?: boolean;
  failure?: string;
};

const JSON_TOKEN_ERROR_PATTERNS = [
  /Unexpected token/,
  /is not valid JSON/i,
  /<!DOCTYPE/i,
  /JSON\.parse/i,
  /Failed to fetch.*XTransformPort/i,
  /socket\.io/i,
];

function matchesJsonTokenError(text: string): boolean {
  return JSON_TOKEN_ERROR_PATTERNS.some((re) => re.test(text));
}

function isXTransformPort(url: string): boolean {
  return /[?&]XTransformPort=3003\b/i.test(url);
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  });

  // Block favicon noise (optional). We keep it enabled to surface any 404s.
  const consoleEntries: ConsoleEntry[] = [];
  const netEntries: NetEntry[] = [];

  const page = await context.newPage();

  page.on("console", (msg) => {
    const type = msg.type() as ConsoleEntry["kind"];
    const text = msg.text();
    consoleEntries.push({
      kind: type,
      text,
      location: msg.location(),
    });
  });

  page.on("pageerror", (err) => {
    consoleEntries.push({
      kind: "pageerror",
      text: err.message,
      url: page.url(),
    });
  });

  page.on("request", (req) => {
    const url = req.url();
    if (isXTransformPort(url)) {
      netEntries.push({
        method: req.method(),
        url,
        status: -1,
        resourceType: req.resourceType(),
        failed: false,
      });
    }
  });

  page.on("response", (res) => {
    const url = res.url();
    const status = res.status();
    // Track all >=400 responses + all XTransformPort requests.
    if (status >= 400 || isXTransformPort(url)) {
      netEntries.push({
        method: res.request().method(),
        url,
        status,
        resourceType: res.request().resourceType(),
        failed: status >= 400,
      });
    }
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    const failure = req.failure()?.errorText;
    netEntries.push({
      method: req.method(),
      url,
      status: -1,
      resourceType: req.resourceType(),
      failed: true,
      failure,
    });
  });

  // ---------------------------------------------------------------------
  // 1) Homepage
  // ---------------------------------------------------------------------
  console.log("\n=== Step 1: Homepage ===");
  const homeStart = Date.now();
  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
  } catch (e: any) {
    console.log("  [warn] goto networkidle failed/timeout:", e.message);
  }
  // Wait an additional 10s after load to capture deferred socket.io attempts.
  await page.waitForTimeout(10000);
  console.log(`  Homepage visited in ${Date.now() - homeStart}ms`);

  // Take homepage screenshot.
  const homeShot = resolve(SHOTS_DIR, "01-homepage.png");
  await page.screenshot({ path: homeShot, fullPage: true });
  console.log("  Screenshot:", homeShot);

  // ---------------------------------------------------------------------
  // 2) Admin / login area
  // ---------------------------------------------------------------------
  console.log("\n=== Step 2: Admin/Login ===");
  const adminStart = Date.now();
  const adminUrl = BASE + "/?view=admin";
  try {
    await page.goto(adminUrl, { waitUntil: "networkidle", timeout: 60000 });
  } catch (e: any) {
    console.log("  [warn] goto admin networkidle failed/timeout:", e.message);
  }
  await page.waitForTimeout(10000);
  console.log(`  Admin visited in ${Date.now() - adminStart}ms`);

  const adminShot = resolve(SHOTS_DIR, "02-admin.png");
  await page.screenshot({ path: adminShot, fullPage: true });
  console.log("  Screenshot:", adminShot);

  // Also try the explicit login route just to be safe.
  console.log("\n=== Step 3: Login route ===");
  const loginStart = Date.now();
  try {
    await page.goto(BASE + "/?view=login", { waitUntil: "networkidle", timeout: 60000 });
  } catch (e: any) {
    console.log("  [warn] goto login networkidle failed/timeout:", e.message);
  }
  await page.waitForTimeout(10000);
  console.log(`  Login visited in ${Date.now() - loginStart}ms`);

  const loginShot = resolve(SHOTS_DIR, "03-login.png");
  await page.screenshot({ path: loginShot, fullPage: true });
  console.log("  Screenshot:", loginShot);

  await browser.close();

  // ---------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------
  const errors = consoleEntries.filter((e) => e.kind === "error" || e.kind === "pageerror");
  const warnings = consoleEntries.filter((e) => e.kind === "warning");
  const logs = consoleEntries.filter((e) => e.kind === "log" || e.kind === "info");

  const jsonTokenErrors = errors.filter((e) => matchesJsonTokenError(e.text));
  const xtransformRequests = netEntries.filter((e) => isXTransformPort(e.url));
  const failedRequests = netEntries.filter((e) => e.failed && e.status >= 400);

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE,
    consoleCounts: {
      logs: logs.length,
      warnings: warnings.length,
      errors: errors.length,
      jsonTokenErrors: jsonTokenErrors.length,
    },
    jsonTokenErrorAppeared: jsonTokenErrors.length > 0,
    allErrors: errors.map((e) => ({
      kind: e.kind,
      text: e.text,
      location: e.location,
      url: e.url,
    })),
    warnings: warnings.map((e) => ({ text: e.text, location: e.location })),
    xtransformRequestsMade: xtransformRequests.length,
    xtransformRequests: xtransformRequests,
    failedRequests: failedRequests,
    screenshots: {
      homepage: homeShot,
      admin: adminShot,
      login: loginShot,
    },
    verdict:
      jsonTokenErrors.length === 0 && xtransformRequests.length === 0
        ? "PASS — JSON parse error fixed, no socket.io attempt to /?XTransformPort=3003"
        : "FAIL — JSON parse error or socket.io attempt still present",
  };

  const resultsPath = resolve(SHOTS_DIR, "results.json");
  writeFileSync(resultsPath, JSON.stringify(report, null, 2));
  console.log("\n=== Report written ===");
  console.log(resultsPath);
  console.log("\n=== Summary ===");
  console.log(JSON.stringify(report.consoleCounts, null, 2));
  console.log("jsonTokenErrorAppeared:", report.jsonTokenErrorAppeared);
  console.log("xtransformRequestsMade:", report.xtransformRequestsMade);
  console.log("failedRequests:", failedRequests.length);
  console.log("verdict:", report.verdict);

  if (errors.length) {
    console.log("\n--- ALL CONSOLE ERRORS ---");
    for (const e of errors) {
      console.log(`[${e.kind}] ${e.text}`);
      if (e.location) {
        console.log(`    at ${e.location.url}:${e.location.lineNumber}:${e.location.columnNumber}`);
      }
    }
  }
  if (xtransformRequests.length) {
    console.log("\n--- XTransformPort REQUESTS (should be NONE) ---");
    for (const r of xtransformRequests) {
      console.log(`  ${r.method} ${r.url} -> status=${r.status} ${r.failure ?? ""}`);
    }
  }
  if (failedRequests.length) {
    console.log("\n--- FAILED NETWORK REQUESTS (status >= 400) ---");
    for (const r of failedRequests) {
      console.log(`  ${r.method} ${r.url} -> status=${r.status} ${r.failure ?? ""}`);
    }
  }
}

run().catch((err) => {
  console.error("verify-prod.ts crashed:", err);
  process.exit(1);
});
