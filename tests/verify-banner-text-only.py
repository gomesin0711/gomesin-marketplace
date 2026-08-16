#!/usr/bin/env python3
"""
Browser verification for Task ID: banner-text-verify.

Verifies that the TEXT-ONLY admin banner (no imageUrl) renders correctly on the
home page of the Next.js app at http://localhost:3000.

Test banner was saved via the API with:
  - title:    "Promo Akhir Tahun - Mesin Diskon 20%"
  - desc:     "Pasang iklan mesin Anda sekarang dan dapatkan diskon spesial akhir tahun. Tayang 30 hari hanya Rp 50.000."
  - cta:      "Pasang Iklan Sekarang"
  - imageUrl: "" (empty -> text-only mode)
  - gradient: "from-amber-500 via-orange-500 to-rose-500"
  - active:   true

The AdBanner component (src/components/gomesin/ad-banner.tsx) renders the admin
banner when `adminBanner?.active && adminBanner.title?.trim()` is truthy, and
switches between image mode and text-only mode based on `hasImage = !!imageUrl`.

Steps:
  1. Navigate to http://localhost:3000
  2. Wait for page to fully load (networkidle + AdBanner fetch /api/admin/banner)
  3. Look for the banner text "Promo Akhir Tahun - Mesin Diskon 20%"
  4. Confirm the banner displays with a gradient background (orange/rose)
     and NO broken image (no <img> inside the admin banner section)
  5. Capture a screenshot
"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL = "http://localhost:3000/"
SCREEN_DIR = Path("/home/z/my-project/tool-results")
SCREEN_DIR.mkdir(parents=True, exist_ok=True)

EXPECTED_TITLE = "Promo Akhir Tahun - Mesin Diskon 20%"
EXPECTED_DESC = "Pasang iklan mesin Anda sekarang dan dapatkan diskon spesial akhir tahun. Tayang 30 hari hanya Rp 50.000."
EXPECTED_CTA = "Pasang Iklan Sekarang"
EXPECTED_GRADIENT = "from-amber-500 via-orange-500 to-rose-500"

# Track console messages and page errors
console_msgs = []
page_errors = []
failed_requests = []


def log(msg):
    print(msg, flush=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1366, "height": 900},
            locale="id-ID",
        )
        page = context.new_page()

        # Wire up event listeners
        def on_console(msg):
            console_msgs.append({"type": msg.type, "text": msg.text})

        def on_pageerror(err):
            page_errors.append(str(err))

        def on_response(response):
            if response.status >= 400:
                failed_requests.append({
                    "url": response.url,
                    "status": response.status,
                })

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.on("response", on_response)

        results = []  # list of (name, passed, detail)

        def check(name, cond, detail=""):
            status = "PASS" if cond else "FAIL"
            results.append((name, cond, detail))
            log(f"  [{status}] {name}" + (f" -- {detail}" if detail else ""))

        # ---------------------------------------------------------------
        # Step 1+2: Navigate to home page and wait for full load
        # ---------------------------------------------------------------
        log("\n=== Step 1-2: Navigate to home page ===")
        try:
            response = page.goto(URL, wait_until="networkidle", timeout=30000)
            check("Homepage loads (HTTP 200)", response is not None and response.status == 200,
                  f"status={response.status if response else 'None'}")
        except PWTimeout:
            check("Homepage loads (HTTP 200)", False, "networkidle timeout")
            # Fallback: try DOMContentLoaded
            try:
                page.goto(URL, wait_until="domcontentloaded", timeout=15000)
            except Exception:
                pass

        # Wait a bit more for client-side fetch of /api/admin/banner to settle
        # The AdBanner component uses useEffect to fetch /api/admin/banner, so
        # the banner DOM only appears after that fetch resolves.
        # Try waiting for the title text to appear first (best signal that the
        # banner has rendered), with a fallback sleep.
        try:
            page.wait_for_selector(f"text={EXPECTED_TITLE}", timeout=10000)
            log("  [info] banner title appeared in DOM")
        except PWTimeout:
            log("  [note] banner title not found within 10s; will sleep 2s and continue")

        # Give React a moment to render
        page.wait_for_timeout(1500)


        # ---------------------------------------------------------------
        # Step 3: Look for the banner text
        # ---------------------------------------------------------------
        log("\n=== Step 3: Look for banner text ===")
        title_locator = page.get_by_text(EXPECTED_TITLE, exact=False)
        title_count = title_locator.count()
        check(f"Banner title visible: '{EXPECTED_TITLE}'", title_count > 0,
              f"matches={title_count}")

        desc_locator = page.get_by_text(EXPECTED_DESC, exact=False)
        desc_count = desc_locator.count()
        check(f"Banner description visible", desc_count > 0,
              f"matches={desc_count}")

        cta_locator = page.get_by_text(EXPECTED_CTA, exact=False)
        cta_count = cta_locator.count()
        check(f"Banner CTA visible: '{EXPECTED_CTA}'", cta_count > 0,
              f"matches={cta_count}")

        # ---------------------------------------------------------------
        # Step 4: Confirm gradient background + no broken image
        # ---------------------------------------------------------------
        log("\n=== Step 4: Confirm gradient + no broken image ===")

        # Find the banner section by locating the title's nearest section ancestor
        banner_section = None
        if title_count > 0:
            # Walk up from the title element to find the wrapping <section>
            try:
                title_el = title_locator.first
                # Evaluate up the DOM tree to find a <section> ancestor
                banner_section_handle = page.evaluate_handle(
                    """(el) => {
                        let cur = el;
                        while (cur && cur.tagName !== 'SECTION') {
                            cur = cur.parentElement;
                            if (!cur) break;
                        }
                        return cur;
                    }""",
                    title_el.element_handle(),
                )
                if banner_section_handle:
                    banner_section = banner_section_handle.as_element()
            except Exception as e:
                log(f"  [note] failed to walk up to section: {e}")

        if banner_section:
            # 4a. Check the gradient classes are on the inner div
            inner_div_class = page.evaluate(
                """(section) => {
                    const inner = section.querySelector('div');
                    return inner ? inner.className : '';
                }""",
                banner_section,
            )
            check(
                f"Gradient class '{EXPECTED_GRADIENT}' present on inner div",
                EXPECTED_GRADIENT in (inner_div_class or ""),
                f"found class snippet: {inner_div_class[:200] if inner_div_class else '(empty)'}",
            )
            check(
                "Background uses bg-gradient-to-r",
                "bg-gradient-to-r" in (inner_div_class or ""),
                "",
            )

            # 4b. Compute the actual rendered background color of the inner div
            # The gradient should resolve to an orange/rose color (the leftmost
            # stop is amber-500 = #f59e0b, and the gradient-to-r means the
            # leftmost ~0% position is the amber color).
            bg_color = page.evaluate(
                """(section) => {
                    const inner = section.querySelector('div');
                    if (!inner) return null;
                    const style = window.getComputedStyle(inner);
                    return {
                        backgroundColor: style.backgroundColor,
                        backgroundImage: style.backgroundImage,
                    };
                }""",
                banner_section,
            )
            log(f"  [info] rendered bg color: {bg_color.get('backgroundColor') if bg_color else 'None'}")
            log(f"  [info] rendered bg image:  {(bg_color.get('backgroundImage') or '')[:200] if bg_color else 'None'}")
            check(
                "Computed background-image is a gradient (linear-gradient present)",
                bg_color and "gradient" in (bg_color.get("backgroundImage") or "").lower(),
                f"backgroundImage={(bg_color or {}).get('backgroundImage', '')[:160]}",
            )

            # 4c. Check there is NO <img> inside the banner section
            # (text-only mode renders decorative circles, not an <img>)
            img_count = page.evaluate(
                """(section) => section.querySelectorAll('img').length""",
                banner_section,
            )
            check(
                "Banner has NO <img> (text-only, no broken image)",
                img_count == 0,
                f"img_count={img_count}",
            )

            # 4d. Check for decorative circles (text-only mode indicator)
            deco_circle_count = page.evaluate(
                """(section) => {
                    const divs = section.querySelectorAll('div.absolute, div[class*="absolute"]');
                    let count = 0;
                    divs.forEach(d => {
                        const cs = window.getComputedStyle(d);
                        if (cs.borderRadius && cs.borderRadius.includes('%') === false
                            && parseFloat(cs.borderRadius) > 0
                            && d.className && d.className.includes('rounded-full')
                            && d.className.includes('bg-white')) {
                            count++;
                        }
                    });
                    return count;
                }""",
                banner_section,
            )
            check(
                "Text-only decorative circles present (rounded-full bg-white/*)",
                deco_circle_count >= 1,
                f"decorative_circle_count={deco_circle_count}",
            )

            # 4e. Check the "Promo" badge with Sparkles icon is present
            promo_badge = page.evaluate(
                """(section) => {
                    const spans = section.querySelectorAll('span');
                    for (const s of spans) {
                        if (s.textContent && s.textContent.trim().toLowerCase() === 'promo') {
                            return true;
                        }
                    }
                    return false;
                }""",
                banner_section,
            )
            check("'Promo' badge present", promo_badge, "")

            # 4f. Compute the bounding box of the banner section so we can
            # confirm it actually takes up visible space on the page
            bbox = banner_section.bounding_box()
            if bbox:
                check(
                    "Banner section has non-zero size",
                    bbox["width"] > 100 and bbox["height"] > 50,
                    f"width={bbox['width']:.0f}px height={bbox['height']:.0f}px",
                )
            else:
                check("Banner section has non-zero size", False, "bounding_box=None")

            # 4g. Check that the section is actually visible (not display:none etc.)
            is_visible = banner_section.is_visible()
            check("Banner section is visible", is_visible, "")
        else:
            check("Found banner <section> ancestor", False, "no section ancestor found")

        # ---------------------------------------------------------------
        # Step 5: Take screenshots
        # ---------------------------------------------------------------
        log("\n=== Step 5: Take screenshots ===")
        fullshot = SCREEN_DIR / "verify-banner-text-only-full.png"
        page.screenshot(path=str(fullshot), full_page=True)
        log(f"  Saved full-page screenshot: {fullshot} ({fullshot.stat().st_size} bytes)")

        # Viewport-only screenshot of the top of the page (banner should be near top)
        viewshot = SCREEN_DIR / "verify-banner-text-only-viewport.png"
        page.screenshot(path=str(viewshot), full_page=False)
        log(f"  Saved viewport screenshot: {viewshot} ({viewshot.stat().st_size} bytes)")

        # Element screenshot of the banner section
        if banner_section:
            try:
                elemshot = SCREEN_DIR / "verify-banner-text-only-element.png"
                banner_section.screenshot(path=str(elemshot))
                log(f"  Saved banner-element screenshot: {elemshot} ({elemshot.stat().st_size} bytes)")
            except Exception as e:
                log(f"  [note] element screenshot failed: {e}")

        # ---------------------------------------------------------------
        # Step 6: Report console errors / page errors / failed requests
        # ---------------------------------------------------------------
        log("\n=== Step 6: Console / page errors ===")
        page_error_count = len(page_errors)
        console_errors = [m for m in console_msgs if m["type"] == "error"]
        console_warnings = [m for m in console_msgs if m["type"] == "warning"]
        log(f"  pageerror events: {page_error_count}")
        log(f"  console.error messages: {len(console_errors)}")
        log(f"  console.warning messages: {len(console_warnings)}")
        log(f"  HTTP >=400 responses: {len(failed_requests)}")

        if page_errors:
            log("  --- pageerror details ---")
            for e in page_errors[:10]:
                log(f"    {e[:300]}")
        if console_errors:
            log("  --- console.error details ---")
            for m in console_errors[:15]:
                log(f"    {m['text'][:300]}")
        if failed_requests:
            log("  --- failed request details ---")
            for r in failed_requests[:10]:
                log(f"    {r['status']} {r['url']}")

        # Check for any banner-image-specific 404s
        banner_404s = [r for r in failed_requests if "banner" in r["url"].lower()]
        check("No banner-related failed requests", len(banner_404s) == 0,
              f"banner_404_count={len(banner_404s)}")

        # ---------------------------------------------------------------
        # Summary
        # ---------------------------------------------------------------
        log("\n=== SUMMARY ===")
        total = len(results)
        passed = sum(1 for _, c, _ in results if c)
        failed = total - passed
        for name, cond, detail in results:
            status = "PASS" if cond else "FAIL"
            log(f"  [{status}] {name}" + (f" -- {detail}" if detail else ""))
        log(f"\nTotal: {total}, Passed: {passed}, Failed: {failed}")

        browser.close()

        # Exit non-zero if any critical check failed
        sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
