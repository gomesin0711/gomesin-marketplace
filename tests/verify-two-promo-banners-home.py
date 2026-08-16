#!/usr/bin/env python3
"""
Verify the home page (http://localhost:3000) now shows TWO stacked editable
promo banners (Banner Promosi 1 with photo + Banner Promosi 2 text-only green)
inside the AdBanner section.

Expected saved configs (confirmed via API):
  Banner 1 (active, photo background):
    title    = "Promo Spesial Akhir Tahun"
    desc     = "Pasang iklan mesin Anda dan dapatkan diskon spesial. Tayang 30 hari hanya Rp 50.000."
    cta      = "Pasang Iklan Premium"
    imageUrl = "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2a59f3618c60.jpg"
    gradient = "from-amber-500 via-orange-500 to-rose-500"

  Banner 2 (active, text-only green gradient):
    title    = "Cari Mesin CNC & Laser Terbaik?"
    desc     = "Ratusan pilihan mesin CNC router, laser cutting, dan bubut dari seller terverifikasi. Harga mulai Rp 15 juta."
    cta      = "Lihat Mesin CNC"
    imageUrl = ""   (empty - text-only)
    gradient = "from-emerald-500 via-green-600 to-teal-600"

The AdBanner component (src/components/gomesin/ad-banner.tsx) renders:
  <section className="mx-auto max-w-7xl space-y-4 px-4 py-4">
    {banner1Active && renderAdminBanner(...)}   <-- Banner 1 (with <img>)
    {banner2Active && renderAdminBanner(...)}   <-- Banner 2 (text-only, decorative circles)
  </section>
"""
import os
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/two-promo-banners-home.png"

EXPECTED_B1_TITLE = "Promo Spesial Akhir Tahun"
EXPECTED_B1_DESC = "Pasang iklan mesin Anda dan dapatkan diskon spesial"
EXPECTED_B1_CTA = "Pasang Iklan Premium"
EXPECTED_B1_IMG_FRAGMENT = "2a59f3618c60"

EXPECTED_B2_TITLE = "Cari Mesin CNC & Laser Terbaik?"
EXPECTED_B2_DESC = "Ratusan pilihan mesin CNC router"
EXPECTED_B2_CTA = "Lihat Mesin CNC"

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

        # ------------------------------------------------------------------
        # Step 2: Locate the AdBanner <section> that contains BOTH promo banners.
        # Per ad-banner.tsx, the section element has classes:
        #   "mx-auto max-w-7xl space-y-4 px-4 py-4"
        # The default rotating-banners section has:
        #   "mx-auto max-w-7xl px-4 py-4"  (NO space-y-4)
        # So we look for a <section> whose className contains "space-y-4".
        # Inside it there should be exactly TWO child divs with class
        #   "relative overflow-hidden rounded-2xl bg-gradient-to-r ... text-white shadow-xl"
        # ------------------------------------------------------------------
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
                    out.push({
                        className: b.className,
                        text: b.innerText,
                        imgCount: imgs.length,
                        imgSrcs: imgs.map(im => im.src || im.getAttribute('src') || ''),
                        top: r.top,
                        bottom: r.bottom,
                        width: r.width,
                        height: r.height,
                        bgImage: window.getComputedStyle(b).backgroundImage,
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

        # ------------------------------------------------------------------
        # Step 2b: Both banners live in the same section (vertical stack)
        # ------------------------------------------------------------------
        check("2b. Both banners in same <section> (stacked vertically)",
              banners[0]["top"] < banners[1]["top"],
              f"b1_top={banners[0]['top']}, b2_top={banners[1]['top']}")

        # Vertical gap between banner1 bottom and banner2 top should be positive (space-y-4 = 1rem)
        gap = banners[1]["top"] - banners[0]["bottom"]
        check("2c. Vertical gap between banner 1 and banner 2 (space-y-4 spacing)",
              gap > 0, f"gap={gap}px")

        # ------------------------------------------------------------------
        # Step 2d: Identify which banner is which by content.
        # Banner 1 = "Promo Spesial Akhir Tahun" (photo bg, amber/orange/rose gradient class)
        # Banner 2 = "Cari Mesin CNC & Laser Terbaik?" (text-only, emerald/green/teal)
        # ------------------------------------------------------------------
        b1 = banners[0]
        b2 = banners[1]

        # ----- Banner Promosi 1 checks -----
        check("3a. Banner 1 (top) title 'Promo Spesial Akhir Tahun' visible",
              EXPECTED_B1_TITLE in b1["text"], f"text_snippet={b1['text'][:80]!r}")
        check("3b. Banner 1 desc visible",
              EXPECTED_B1_DESC in b1["text"], "")
        check("3c. Banner 1 cta 'Pasang Iklan Premium' visible",
              EXPECTED_B1_CTA in b1["text"], "")
        check("3d. Banner 1 has background <img> (photo background present)",
              b1["imgCount"] >= 1, f"imgCount={b1['imgCount']}, srcs={b1['imgSrcs']}")
        check("3e. Banner 1 image src contains saved photo URL fragment",
              any(EXPECTED_B1_IMG_FRAGMENT in s for s in b1["imgSrcs"]),
              f"srcs={b1['imgSrcs']}")
        check("3f. Banner 1 has amber/orange/rose gradient classes",
              "from-amber-500" in b1["className"]
              and "via-orange-500" in b1["className"]
              and "to-rose-500" in b1["className"],
              f"className={b1['className']}")

        # ----- Banner Promosi 2 checks -----
        check("4a. Banner 2 (bottom) title 'Cari Mesin CNC & Laser Terbaik?' visible",
              EXPECTED_B2_TITLE in b2["text"], f"text_snippet={b2['text'][:80]!r}")
        check("4b. Banner 2 desc visible",
              EXPECTED_B2_DESC in b2["text"], "")
        check("4c. Banner 2 cta 'Lihat Mesin CNC' visible",
              EXPECTED_B2_CTA in b2["text"], "")
        check("4d. Banner 2 is text-only (0 <img>)",
              b2["imgCount"] == 0, f"imgCount={b2['imgCount']}")
        check("4e. Banner 2 has emerald/green/teal gradient classes",
              "from-emerald-500" in b2["className"]
              and "via-green-600" in b2["className"]
              and "to-teal-600" in b2["className"],
              f"className={b2['className']}")
        check("4f. Banner 2 computed background-image is linear-gradient (not none)",
              "linear-gradient" in b2["bgImage"], f"bgImage={b2['bgImage'][:80]!r}")

        # ------------------------------------------------------------------
        # Step 5: Confirm Banner 1 is NOT a default rotating banner (no dots indicator
        # and no Chevron arrows). If both admin banners active, default rotating
        # banner is suppressed. Just sanity check that we got the admin variant.
        # ------------------------------------------------------------------
        check("5. Section is the admin-stacked variant (has space-y-4 class)",
              "space-y-4" in section_info["sectionClass"],
              f"sectionClass={section_info['sectionClass']}")

        # ------------------------------------------------------------------
        # Step 6: Take full viewport screenshot showing both banners
        # (Scroll to bring banner section into view if needed.)
        # ------------------------------------------------------------------
        # Scroll the AdBanner section into view
        page.evaluate('''() => {
            const secs = Array.from(document.querySelectorAll('section'));
            for (const s of secs) {
                if (s.className.includes('space-y-4')) {
                    s.scrollIntoView({block: 'start'});
                    return;
                }
            }
        }''')
        page.wait_for_timeout(500)
        page.screenshot(path=SCREENSHOT, full_page=False)
        size = os.path.getsize(SCREENSHOT) if os.path.exists(SCREENSHOT) else 0
        check(f"6. Home page screenshot saved: {SCREENSHOT}",
              size > 0, f"size={size} bytes")

        # ------------------------------------------------------------------
        # Step 7: Runtime errors / failed requests
        # ------------------------------------------------------------------
        check("7a. No pageerror (uncaught JS exceptions)",
              len(page_errors) == 0,
              f"count={len(page_errors)}; first={page_errors[:2]}")

        banner_failures = [f for f in failed_requests
                           if "/api/admin/banner" in f]
        check("7b. No HTTP >=400 on /api/admin/banner or /api/admin/banner-2",
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
