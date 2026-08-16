#!/usr/bin/env python3
"""
Verify that Banner Promosi 2 on the home page now displays:
  title = "Punya mesin? Ubah jadi cuan."
  desc  = "Pasang iklan mulai Rp 30.000 dan jangkau ribuan pembeli industri se-Indonesia."
  cta   = "Mulai Pasang Iklan"

CRITICAL check: the CTA button must be WHITE (bg-white + text-black) with
black text — NOT orange/green/colored. The banner gradient is
from-orange-600 via-orange-600 to-cyan-600 (orange-to-cyan).

There must be 2 stacked banners: Banner 1 "Promo Spesial Akhir Tahun" (top,
photo bg, amber/orange/rose) and Banner 2 "Punya mesin? Ubah jadi cuan."
(bottom, text-only, orange-to-cyan).
"""
import os
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/banner-cuan-home.png"

EXPECTED_B1_TITLE = "Promo Spesial Akhir Tahun"
EXPECTED_B2_TITLE = "Punya mesin? Ubah jadi cuan."
EXPECTED_B2_DESC = "Pasang iklan mulai Rp 30.000 dan jangkau ribuan pembeli industri se-Indonesia."
EXPECTED_B2_CTA = "Mulai Pasang Iklan"
EXPECTED_B2_GRADIENT = "from-orange-600 via-orange-600 to-cyan-600"

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" -- {detail}" if detail else ""))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1366, "height": 900},
                                      locale="id-ID")
        page = context.new_page()

        page_errors = []
        failed_requests = []

        def on_pageerror(err):
            page_errors.append(str(err))

        def on_response(resp):
            if resp.status >= 400:
                failed_requests.append(f"{resp.status} {resp.url}")

        page.on("pageerror", on_pageerror)
        page.on("response", on_response)

        # Step 1: navigate to home
        response = page.goto(URL, wait_until="networkidle", timeout=45000)
        check("1. Homepage HTTP 200",
              response is not None and response.status == 200,
              f"status={response.status if response else 'no-response'}")

        # Give the client-side fetches (/api/admin/banner + /api/admin/banner-2) time to resolve
        page.wait_for_timeout(2500)

        # Locate AdBanner <section> with space-y-4 (admin-stacked variant)
        section_info = page.evaluate('''() => {
            const secs = Array.from(document.querySelectorAll('section'));
            for (const s of secs) {
                if (!s.className.includes('space-y-4')) continue;
                const bannerDivs = Array.from(s.children).filter(c =>
                    c.tagName === 'DIV' && c.className.includes('bg-gradient-to-r')
                );
                if (bannerDivs.length !== 2) continue;
                const out = [];
                for (const b of bannerDivs) {
                    const r = b.getBoundingClientRect();
                    const imgs = Array.from(b.querySelectorAll('img'));
                    // CTA button is the last <button> inside the banner that contains the ArrowRight icon
                    // For admin banners it has classes bg-white + text-black. We'll just grab all buttons.
                    const buttons = Array.from(b.querySelectorAll('button'));
                    const ctaBtn = buttons.find(btn =>
                        btn.className.includes('bg-white') && btn.className.includes('text-black')
                    );
                    out.push({
                        className: b.className,
                        text: b.innerText,
                        imgCount: imgs.length,
                        top: r.top,
                        bottom: r.bottom,
                        ctaButton: ctaBtn ? {
                            text: ctaBtn.innerText.trim(),
                            className: ctaBtn.className,
                            bgColor: window.getComputedStyle(ctaBtn).backgroundColor,
                            color: window.getComputedStyle(ctaBtn).color,
                        } : null,
                        allButtons: buttons.map(btn => ({
                            text: btn.innerText.trim().slice(0, 40),
                            className: btn.className.slice(0, 200),
                            bgColor: window.getComputedStyle(btn).backgroundColor,
                        })),
                    });
                }
                return {
                    sectionClass: s.className,
                    bannerCount: bannerDivs.length,
                    banners: out,
                };
            }
            return null;
        }''')

        check("2a. AdBanner section with 2 stacked promo banners found",
              section_info is not None and section_info["bannerCount"] == 2,
              f"info={section_info}")

        if not section_info or section_info["bannerCount"] != 2:
            print("FATAL: AdBanner section with 2 banners not found, aborting remaining checks.")
            browser.close()
            sys.exit(1)

        banners = section_info["banners"]
        b1, b2 = banners[0], banners[1]

        # ----- 2 stacked banners, b1 on top, b2 below -----
        check("2b. Banner 1 (top) above Banner 2 (below)",
              b1["top"] < b2["top"],
              f"b1_top={b1['top']}, b2_top={b2['top']}")

        # ----- Banner 1 -----
        check("3a. Banner 1 title 'Promo Spesial Akhir Tahun' visible",
              EXPECTED_B1_TITLE in b1["text"], f"text={b1['text'][:80]!r}")

        # ----- Banner 2 -----
        check("4a. Banner 2 title 'Punya mesin? Ubah jadi cuan.' visible",
              EXPECTED_B2_TITLE in b2["text"], f"text={b2['text'][:120]!r}")
        check("4b. Banner 2 desc visible (exact)",
              EXPECTED_B2_DESC in b2["text"], "")
        check("4c. Banner 2 CTA 'Mulai Pasang Iklan' visible",
              EXPECTED_B2_CTA in b2["text"], "")

        # ----- Banner 2 gradient (orange-to-cyan) -----
        check("4d. Banner 2 has orange-to-cyan gradient classes",
              EXPECTED_B2_GRADIENT.split(" ")[0] in b2["className"]
              and EXPECTED_B2_GRADIENT.split(" ")[1] in b2["className"]
              and EXPECTED_B2_GRADIENT.split(" ")[2] in b2["className"],
              f"className={b2['className']}")

        # ----- Banner 2 is text-only (no <img>) -----
        check("4e. Banner 2 is text-only (0 <img>)",
              b2["imgCount"] == 0, f"imgCount={b2['imgCount']}")

        # ===== CRITICAL: CTA button must be WHITE =====
        cta = b2.get("ctaButton")
        check("5a. Banner 2 CTA button found with 'bg-white' + 'text-black' classes",
              cta is not None,
              f"allButtons={b2['allButtons']}")

        if cta:
            check("5b. CTA button className contains 'bg-white'",
                  "bg-white" in cta["className"], f"className={cta['className']}")
            check("5c. CTA button className contains 'text-black'",
                  "text-black" in cta["className"], f"className={cta['className']}")
            # Computed background-color should be white (rgb(255,255,255)) not orange/green
            check("5d. CTA button computed backgroundColor is white (rgb(255,255,255))",
                  cta["bgColor"] in ("rgb(255, 255, 255)", "rgba(255, 255, 255, 1)"),
                  f"bgColor={cta['bgColor']!r}")
            # Computed color should be black (rgb(0,0,0))
            check("5e. CTA button computed color is black (rgb(0,0,0))",
                  cta["color"] in ("rgb(0, 0, 0)", "rgba(0, 0, 0, 1)"),
                  f"color={cta['color']!r}")
            # CTA button text matches
            check("5f. CTA button text is 'Mulai Pasang Iklan'",
                  EXPECTED_B2_CTA in cta["text"], f"text={cta['text']!r}")

        # ===== Banner 1 CTA should ALSO be white (sanity: not changed) =====
        if b1.get("ctaButton"):
            check("6. Banner 1 CTA button also white (consistency)",
                  "bg-white" in b1["ctaButton"]["className"],
                  f"className={b1['ctaButton']['className'][:120]}")

        # ===== Scroll AdBanner into view + screenshot =====
        page.evaluate('''() => {
            const secs = Array.from(document.querySelectorAll('section'));
            for (const s of secs) {
                if (s.className.includes('space-y-4')) {
                    s.scrollIntoView({block: 'start'});
                    return;
                }
            }
        }''')
        page.wait_for_timeout(600)
        page.screenshot(path=SCREENSHOT, full_page=False)
        size = os.path.getsize(SCREENSHOT) if os.path.exists(SCREENSHOT) else 0
        check(f"7. Screenshot saved: {SCREENSHOT}",
              size > 0, f"size={size} bytes")

        # ===== Runtime errors =====
        check("8a. No pageerror (uncaught JS exceptions)",
              len(page_errors) == 0,
              f"count={len(page_errors)}; first={page_errors[:2]}")

        banner_failures = [f for f in failed_requests
                           if "/api/admin/banner" in f]
        check("8b. No HTTP >=400 on /api/admin/banner or /api/admin/banner-2",
              len(banner_failures) == 0,
              f"failures={banner_failures}")

        browser.close()

    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print("\n==== SUMMARY ====")
    print(f"PASSED: {passed}   FAILED: {failed}")
    if failed:
        print("Failed checks:")
        for name, ok, detail in results:
            if not ok:
                print(f"  - {name}: {detail}")
        sys.exit(1)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
