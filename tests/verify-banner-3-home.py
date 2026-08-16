#!/usr/bin/env python3
"""
Verify Banner 3 (SMALL banner) renders on the home page ABOVE the
"Brand New (Mesin Baru)" section.

Expected banner 3 config (already saved via API):
  title    = "Mesin Baru Bergaransi Resmi"
  desc     = "Pilihan mesin industri baru bergaransi resmi dari seller terverifikasi"
  cta      = "Lihat Semua"
  gradient = "from-rose-600 via-pink-600 to-fuchsia-600"
  link     = "listings"
  imageUrl = "" (text-only, no photo)
  active   = true

CRITICAL checks:
  - Banner 3 renders DIRECTLY ABOVE the Brand New section heading.
  - Banner 3 is SMALLER/more compact than banners 1 & 2:
      * p-4 padding (vs p-6/p-8 on banners 1 & 2)
      * smaller text (text-sm/text-base/text-lg, not text-2xl/text-3xl)
      * single-line description (line-clamp-1)
      * flex-row layout (items-center + justify-between) with CTA on RIGHT
  - CTA button is WHITE (bg-white + text-black, computed bg rgb(255,255,255)).
  - Rose/pink/fuchsia gradient.
"""
import os
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/banner-3-home.png"

EXPECTED_TITLE = "Mesin Baru Bergaransi Resmi"
EXPECTED_DESC = "Pilihan mesin industri baru bergaransi resmi dari seller terverifikasi"
EXPECTED_CTA = "Lihat Semua"
EXPECTED_GRADIENT = "from-rose-600 via-pink-600 to-fuchsia-600"

# Brand New heading text (Indonesian translation of baruAds)
BRAND_NEW_HEADING = "Brand New (Mesin Baru)"

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
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("response",
                lambda r: failed_requests.append(f"{r.status} {r.url}") if r.status >= 400 else None)

        # Step 1: navigate to home
        response = page.goto(URL, wait_until="networkidle", timeout=45000)
        check("1. Homepage HTTP 200",
              response is not None and response.status == 200,
              f"status={response.status if response else 'no-response'}")

        # Give client-side fetches (/api/admin/banner-3 + others) time to resolve
        page.wait_for_timeout(3000)

        # ----------------------------------------------------------------
        # Locate Banner 3 (SmallBanner component) on the page.
        # SmallBanner renders: <div class="...flex items-center ... rounded-xl
        #   bg-gradient-to-r p-4 ... text-white ... from-rose-600 via-pink-600 to-fuchsia-600">
        #     <div class="relative flex w-full items-center justify-between gap-3">
        #       <div><h3>...</h3><p class="line-clamp-1 ...">...</p></div>
        #       <button class="... bg-white ... text-black ...">...</button>
        #     </div>
        #   </div>
        # ----------------------------------------------------------------
        info = page.evaluate('''() => {
            const all = Array.from(document.querySelectorAll('div'));
            // Banner 3 root: has bg-gradient-to-r + from-rose-600 + p-4
            const b3root = all.find(d => {
                const cls = d.className || '';
                return cls.includes('bg-gradient-to-r')
                    && cls.includes('from-rose-600')
                    && cls.includes('via-pink-600')
                    && cls.includes('to-fuchsia-600');
            });
            // Brand New heading (h2 with text matching "Brand New")
            const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
            const brandNew = headings.find(h =>
                (h.textContent || '').includes('Brand New'));
            return {
                b3Found: !!b3root,
                b3: b3root ? {
                    className: b3root.className,
                    text: b3root.innerText,
                    rect: b3root.getBoundingClientRect().toJSON(),
                    // The inner flex row
                    innerRowClass: (b3root.querySelector('div.relative.flex.w-full') || {}).className || '',
                    // h3 title
                    h3: b3root.querySelector('h3') ? {
                        text: b3root.querySelector('h3').innerText,
                        className: b3root.querySelector('h3').className,
                        fontSize: window.getComputedStyle(b3root.querySelector('h3')).fontSize,
                    } : null,
                    // p desc
                    p: b3root.querySelector('p') ? {
                        text: b3root.querySelector('p').innerText,
                        className: b3root.querySelector('p').className,
                        hasLineClamp1: (b3root.querySelector('p').className || '').includes('line-clamp-1'),
                    } : null,
                    // CTA button (white, bg-white + text-black)
                    ctaBtn: (() => {
                        const btns = Array.from(b3root.querySelectorAll('button, a, span'));
                        const white = btns.find(b =>
                            (b.className || '').includes('bg-white')
                            && (b.className || '').includes('text-black'));
                        if (!white) return null;
                        const cs = window.getComputedStyle(white);
                        return {
                            tag: white.tagName,
                            text: white.innerText.trim(),
                            className: white.className,
                            bgColor: cs.backgroundColor,
                            color: cs.color,
                        };
                    })(),
                    imgCount: b3root.querySelectorAll('img').length,
                    padding: window.getComputedStyle(b3root).padding,
                } : null,
                brandNewFound: !!brandNew,
                brandNew: brandNew ? {
                    text: brandNew.textContent.trim(),
                    tag: brandNew.tagName,
                    rect: brandNew.getBoundingClientRect().toJSON(),
                } : null,
            };
        }''')

        check("2a. Banner 3 (rose/pink/fuchsia gradient root) found on page",
              info.get("b3Found"), f"info_keys={list(info.keys())}")

        check("2b. Brand New heading found on page",
              info.get("brandNewFound"),
              f"text={info['brandNew']['text'] if info.get('brandNew') else None!r}")

        if not info.get("b3Found"):
            print("FATAL: Banner 3 not found, aborting remaining checks.")
            browser.close()
            sys.exit(1)

        b3 = info["b3"]

        # ----------------------------------------------------------------
        # Banner 3 content checks
        # ----------------------------------------------------------------
        check("3a. Banner 3 contains title 'Mesin Baru Bergaransi Resmi'",
              EXPECTED_TITLE in b3["text"], f"text={b3['text'][:120]!r}")
        check("3b. Banner 3 contains desc 'Pilihan mesin industri baru bergaransi resmi...'",
              EXPECTED_DESC in b3["text"], f"text={b3['text'][:200]!r}")
        check("3c. Banner 3 contains CTA 'Lihat Semua'",
              EXPECTED_CTA in b3["text"], f"text={b3['text'][:120]!r}")

        # ----------------------------------------------------------------
        # Gradient check (rose/pink/fuchsia)
        # ----------------------------------------------------------------
        cls = b3["className"]
        check("4a. Banner 3 has 'from-rose-600' gradient class",
              "from-rose-600" in cls, f"className={cls}")
        check("4b. Banner 3 has 'via-pink-600' gradient class",
              "via-pink-600" in cls, f"className={cls}")
        check("4c. Banner 3 has 'to-fuchsia-600' gradient class",
              "to-fuchsia-600" in cls, f"className={cls}")

        # ----------------------------------------------------------------
        # COMPACT / SMALLER checks
        # ----------------------------------------------------------------
        # p-4 padding
        check("5a. Banner 3 has 'p-4' class (compact padding)",
              "p-4" in cls, f"className={cls}")
        check("5b. Banner 3 does NOT use p-6 or p-8 (which banners 1 & 2 use)",
              "p-6" not in cls and "p-8" not in cls,
              f"className={cls}")

        # rounded-xl (compact)
        check("5c. Banner 3 uses rounded-xl (compact)",
              "rounded-xl" in cls, f"className={cls}")

        # flex items-center (single row layout)
        check("5d. Banner 3 has flex + items-center (single row)",
              "flex" in cls and "items-center" in cls, f"className={cls}")

        # Inner flex row: items-center + justify-between (CTA on right)
        inner_cls = b3["innerRowClass"]
        check("5e. Inner row has 'justify-between' (CTA on right side)",
              "justify-between" in inner_cls, f"innerRowClass={inner_cls}")
        check("5f. Inner row has 'items-center' (vertically centered)",
              "items-center" in inner_cls, f"innerRowClass={inner_cls}")

        # Title text size — should be smaller (text-sm/text-base/text-lg, NOT text-2xl/text-3xl)
        if b3["h3"]:
            h3_cls = b3["h3"]["className"]
            h3_fs = b3["h3"]["fontSize"]
            check("5g. Banner 3 title h3 uses small text (text-sm/base/lg, not 2xl/3xl/4xl)",
                  any(sz in h3_cls for sz in ["text-sm", "text-base", "text-lg"])
                  and not any(sz in h3_cls for sz in ["text-2xl", "text-3xl", "text-4xl", "text-5xl"]),
                  f"className={h3_cls}, fontSize={h3_fs}")
        else:
            check("5g. Banner 3 title h3 present", False, "h3 not found")

        # Description uses line-clamp-1 (single line)
        if b3["p"]:
            check("5h. Banner 3 desc uses 'line-clamp-1' (single-line description)",
                  b3["p"]["hasLineClamp1"], f"className={b3['p']['className']}")
        else:
            check("5h. Banner 3 desc <p> present", False, "p not found")

        # Text-only (no photo, imageUrl="")
        check("5i. Banner 3 is text-only (0 <img>, no photo)",
              b3["imgCount"] == 0, f"imgCount={b3['imgCount']}")

        # ----------------------------------------------------------------
        # CRITICAL: CTA button is WHITE
        # ----------------------------------------------------------------
        cta = b3["ctaBtn"]
        check("6a. Banner 3 CTA button found (with bg-white + text-black)",
              cta is not None, f"ctaBtn={cta}")
        if cta:
            check("6b. CTA className contains 'bg-white'",
                  "bg-white" in cta["className"], f"className={cta['className']}")
            check("6c. CTA className contains 'text-black'",
                  "text-black" in cta["className"], f"className={cta['className']}")
            check("6d. CTA computed backgroundColor is white (rgb(255,255,255))",
                  cta["bgColor"] in ("rgb(255, 255, 255)", "rgba(255, 255, 255, 1)"),
                  f"bgColor={cta['bgColor']!r}")
            check("6e. CTA computed color is black (rgb(0,0,0))",
                  cta["color"] in ("rgb(0, 0, 0)", "rgba(0, 0, 0, 1)"),
                  f"color={cta['color']!r}")
            check("6f. CTA button text is 'Lihat Semua'",
                  EXPECTED_CTA in cta["text"], f"text={cta['text']!r}")

        # ----------------------------------------------------------------
        # CRITICAL: Banner 3 renders DIRECTLY ABOVE Brand New section heading
        # ----------------------------------------------------------------
        if info.get("brandNewFound"):
            b3_bottom = b3["rect"]["y"] + b3["rect"]["height"]
            bn_top = info["brandNew"]["rect"]["y"]
            check("7a. Banner 3 bottom edge is ABOVE Brand New heading top",
                  b3_bottom <= bn_top + 5,  # 5px tolerance
                  f"b3_bottom={b3_bottom}, brandNew_top={bn_top}")

            # Banner 3 should be IMMEDIATELY above Brand New (gap < 200px to skip any
            # other section). We compute the distance between b3 bottom and brandNew top.
            gap = bn_top - b3_bottom
            check("7b. Banner 3 is immediately above Brand New (gap < 200px)",
                  0 <= gap < 200, f"gap={gap}px")

            # Verify NO section heading appears between Banner 3 and Brand New
            between_check = page.evaluate('''(payload) => {
                const b3_rect = payload.b3_rect, bn_rect = payload.bn_rect;
                const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
                const between = [];
                for (const h of headings) {
                    const r = h.getBoundingClientRect();
                    const top = r.y;
                    // Heading is between Banner 3 bottom and Brand New top
                    if (top > b3_rect.y + b3_rect.height && top < bn_rect.y) {
                        between.push({text: h.textContent.trim().slice(0, 60), tag: h.tagName, top: top});
                    }
                }
                return between;
            }''', {"b3_rect": b3["rect"], "bn_rect": info["brandNew"]["rect"]})
            check("7c. No other section heading between Banner 3 and Brand New",
                  len(between_check) == 0, f"between={between_check}")

            # Also confirm there's NO <section> element between b3 bottom and brandNew top
            # (the SELL CTA is above b3, JASA section is below brandNew)
            section_between = page.evaluate('''(payload) => {
                const b3_rect = payload.b3_rect, bn_rect = payload.bn_rect;
                const secs = Array.from(document.querySelectorAll('section'));
                const between = [];
                for (const s of secs) {
                    const r = s.getBoundingClientRect();
                    if (r.y > b3_rect.y + b3_rect.height && r.y + r.height < bn_rect.y) {
                        between.push({top: r.y, height: r.height});
                    }
                }
                return between;
            }''', {"b3_rect": b3["rect"], "bn_rect": info["brandNew"]["rect"]})
            check("7d. No <section> element between Banner 3 and Brand New heading",
                  len(section_between) == 0, f"sections_between={section_between}")

        # ----------------------------------------------------------------
        # Compare Banner 3 size vs Banner 1 & 2 (sanity: smaller)
        # ----------------------------------------------------------------
        size_compare = page.evaluate('''() => {
            const all = Array.from(document.querySelectorAll('div'));
            // Banner 1 + 2 are inside the AdBanner <section class="...space-y-4...">
            const secs = Array.from(document.querySelectorAll('section'));
            let b1 = null, b2 = null;
            for (const s of secs) {
                if (!s.className.includes('space-y-4')) continue;
                const divs = Array.from(s.children).filter(c =>
                    c.tagName === 'DIV' && c.className.includes('bg-gradient-to-r'));
                if (divs.length >= 2) { b1 = divs[0]; b2 = divs[1]; break; }
            }
            // Banner 3 (rose/pink/fuchsia)
            const b3 = all.find(d => {
                const cls = d.className || '';
                return cls.includes('bg-gradient-to-r')
                    && cls.includes('from-rose-600')
                    && cls.includes('via-pink-600')
                    && cls.includes('to-fuchsia-600');
            });
            function info(el) {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return {
                    height: r.height,
                    width: r.width,
                    padding: window.getComputedStyle(el).padding,
                    hasP6: (el.className || '').includes('p-6'),
                    hasP8: (el.className || '').includes('p-8'),
                    hasP4: (el.className || '').includes('p-4'),
                };
            }
            return {b1: info(b1), b2: info(b2), b3: info(b3)};
        }''')
        check("8a. Banner 1 & 2 found for size comparison",
              size_compare["b1"] is not None and size_compare["b2"] is not None,
              f"b1={size_compare['b1']}, b2={size_compare['b2']}")

        if size_compare["b1"] and size_compare["b3"]:
            check("8b. Banner 3 height < Banner 1 height (smaller)",
                  size_compare["b3"]["height"] < size_compare["b1"]["height"],
                  f"b3_h={size_compare['b3']['height']}, b1_h={size_compare['b1']['height']}")
            check("8c. Banner 1 uses p-6 or p-8 (larger padding than Banner 3's p-4)",
                  size_compare["b1"]["hasP6"] or size_compare["b1"]["hasP8"],
                  f"b1_padding_class={size_compare['b1']}")

        if size_compare["b2"] and size_compare["b3"]:
            check("8d. Banner 3 height < Banner 2 height (smaller)",
                  size_compare["b3"]["height"] < size_compare["b2"]["height"],
                  f"b3_h={size_compare['b3']['height']}, b2_h={size_compare['b2']['height']}")

        # ----------------------------------------------------------------
        # Screenshot: scroll Banner 3 into view
        # ----------------------------------------------------------------
        page.evaluate('''() => {
            const all = Array.from(document.querySelectorAll('div'));
            const b3 = all.find(d => {
                const cls = d.className || '';
                return cls.includes('bg-gradient-to-r')
                    && cls.includes('from-rose-600')
                    && cls.includes('via-pink-600')
                    && cls.includes('to-fuchsia-600');
            });
            if (b3) b3.scrollIntoView({block: 'center'});
        }''')
        page.wait_for_timeout(600)
        page.screenshot(path=SCREENSHOT, full_page=False)
        size = os.path.getsize(SCREENSHOT) if os.path.exists(SCREENSHOT) else 0
        check(f"9. Screenshot saved: {SCREENSHOT}",
              size > 0, f"size={size} bytes")

        # ----------------------------------------------------------------
        # Runtime errors
        # ----------------------------------------------------------------
        check("10a. No pageerror (uncaught JS exceptions)",
              len(page_errors) == 0,
              f"count={len(page_errors)}; first={page_errors[:2]}")
        banner3_failures = [f for f in failed_requests if "/api/admin/banner-3" in f]
        check("10b. No HTTP >=400 on /api/admin/banner-3",
              len(banner3_failures) == 0, f"failures={banner3_failures}")

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
