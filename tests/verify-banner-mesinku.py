#!/usr/bin/env python3
"""
Verify the mesinKU admin banner with the user's requested text renders
correctly on the home page (http://localhost:3000).

The home page actually contains TWO banners that share the same text:
  1. A HARDCODED hero banner in home.tsx (has an <img>, NOT admin-controlled).
  2. The AdBanner component (admin-controlled, text-only with gradient).

This verification targets the AdBanner (admin) section specifically — the
one whose inner div has class "bg-gradient-to-r ... from-amber-500 ...".

Saved banner (per task):
  title:    "Bingung Jual mesin baru/bekas dimana?"
  desc:     "Pasang iklan di mesinKU saja!!! Ada ribuan Mesin CETAK, Mesin CNC
             dan Mesin industri lainnya..."
  cta:      "Pasang Iklan Sekarang"
  imageUrl: ""   (empty - text-only banner)
  gradient: "from-amber-500 via-orange-500 to-rose-500"
  active:   true
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/banner-mesinku-viewport.png"
ELEMENT_SCREENSHOT = "/home/z/my-project/tool-results/banner-mesinku-element.png"

EXPECTED_TITLE = "Bingung Jual mesin baru/bekas dimana?"
EXPECTED_DESC_PART_1 = "Pasang iklan di mesinKU saja!!!"
EXPECTED_DESC_KEYWORD_1 = "Mesin CETAK"
EXPECTED_DESC_KEYWORD_2 = "Mesin CNC"
EXPECTED_CTA = "Pasang Iklan Sekarang"

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

        console_errors = []
        page_errors = []
        failed_requests = []

        def on_console(msg):
            if msg.type == "error":
                console_errors.append(msg.text)

        def on_pageerror(err):
            page_errors.append(str(err))

        def on_response(resp):
            if resp.status >= 400:
                failed_requests.append(f"{resp.status} {resp.url}")

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.on("response", on_response)

        # Step 1a/1b: navigate and wait for full load
        response = page.goto(URL, wait_until="networkidle", timeout=45000)
        check("1a/1b. Homepage HTTP 200",
              response is not None and response.status == 200,
              f"status={response.status if response else 'no-response'}")

        # Give the client-side fetch (/api/admin/banner) a moment to resolve
        page.wait_for_timeout(1500)

        # ------------------------------------------------------------------
        # Locate the ADMIN AdBanner section specifically.
        # It is the <section> whose first inner <div> has classes:
        #   "relative overflow-hidden rounded-2xl bg-gradient-to-r p-6 text-white
        #    shadow-xl sm:p-8 from-amber-500 via-orange-500 to-rose-500"
        # i.e. contains bg-gradient-to-r AND from-amber-500.
        # ------------------------------------------------------------------
        section_info = page.evaluate('''() => {
            const secs = Array.from(document.querySelectorAll('section'));
            for (const s of secs) {
                const inner = s.querySelector('div.bg-gradient-to-r.from-amber-500');
                if (inner) {
                    return {
                        sectionIdx: secs.indexOf(s),
                        sectionClass: s.className,
                        innerClass: inner.className,
                        innerHtml: inner.innerText,
                        imgCount: s.querySelectorAll('img').length,
                        rect: inner.getBoundingClientRect(),
                    };
                }
            }
            return null;
        }''')

        check("Admin AdBanner section found (div.bg-gradient-to-r.from-amber-500)",
              section_info is not None,
              f"info={section_info}")

        if section_info is None:
            print("FATAL: admin banner section not found, aborting remaining checks.")
            browser.close()
            sys.exit(1)

        inner_text = section_info["innerHtml"]
        # Step 1c: title visible
        check("1c. Banner title 'Bingung Jual mesin baru/bekas dimana?' visible",
              EXPECTED_TITLE in inner_text, "")
        # Step 1d: description lead visible
        check("1d. Description lead 'Pasang iklan di mesinKU saja!!!' visible",
              EXPECTED_DESC_PART_1 in inner_text, "")
        # Step 1e: description contains Mesin CETAK and Mesin CNC
        check("1e-i. Description contains 'Mesin CETAK'",
              EXPECTED_DESC_KEYWORD_1 in inner_text, "")
        check("1e-ii. Description contains 'Mesin CNC'",
              EXPECTED_DESC_KEYWORD_2 in inner_text, "")
        # Step 1f: CTA button visible
        check("1f. CTA button 'Pasang Iklan Sekarang' visible",
              EXPECTED_CTA in inner_text, "")

        # Step 1g: NO broken image (text-only banner, 0 <img> in banner section)
        check("1g. Text-only banner has 0 <img> (no broken image)",
              section_info["imgCount"] == 0,
              f"img_count={section_info['imgCount']}")

        # Step 1h: gradient background applied (amber/orange/rose)
        cls = section_info["innerClass"]
        check("1h-i. Gradient class 'from-amber-500' present",
              "from-amber-500" in cls, "")
        check("1h-ii. Gradient class 'via-orange-500' present",
              "via-orange-500" in cls, "")
        check("1h-iii. Gradient class 'to-rose-500' present",
              "to-rose-500" in cls, "")
        check("1h-iv. 'bg-gradient-to-r' present",
              "bg-gradient-to-r" in cls, "")

        # Computed background-image must be a linear-gradient (not 'none')
        bg_image = page.evaluate(
            """() => {
                const s = Array.from(document.querySelectorAll('section'))
                    .find(s => s.querySelector('div.bg-gradient-to-r.from-amber-500'));
                if (!s) return null;
                const el = s.querySelector('div.bg-gradient-to-r.from-amber-500');
                return window.getComputedStyle(el).backgroundImage;
            }""")
        check("1h-v. Computed background-image is a linear-gradient (not none)",
              bg_image is not None and "linear-gradient" in bg_image,
              f"bgImage={(bg_image or '')[:90]}")

        # Banner inner div has non-zero size
        rect = section_info["rect"]
        check("Banner inner div visible & non-zero size",
              rect is not None and rect["width"] > 100 and rect["height"] > 50,
              f"w={rect['width'] if rect else None},h={rect['height'] if rect else None}")

        # Step 1i: viewport screenshot
        page.screenshot(path=SCREENSHOT, full_page=False)
        check(f"1i. Viewport screenshot saved to {SCREENSHOT}", True, "")

        # Tight element screenshot of just the admin banner inner div
        try:
            inner_handle = page.query_selector("div.bg-gradient-to-r.from-amber-500")
            if inner_handle:
                inner_handle.screenshot(path=ELEMENT_SCREENSHOT)
                check(f"Element screenshot saved to {ELEMENT_SCREENSHOT}", True, "")
        except Exception as e:
            check("Element screenshot saved", False, f"err={e}")

        # Runtime error checks
        check("No pageerror (uncaught JS exceptions) during load",
              len(page_errors) == 0,
              f"count={len(page_errors)}; first={page_errors[:1]}")
        check("No HTTP >=400 responses during load",
              len(failed_requests) == 0,
              f"count={len(failed_requests)}; first={failed_requests[:3]}")

        browser.close()

    # Summary
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
