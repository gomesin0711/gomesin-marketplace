#!/usr/bin/env python3
"""
Verify the HERO banner at the TOP of the home page renders with the
admin-configured text (title / subtitle / desc / cta / imageUrl).

Target: src/components/gomesin/views/home.tsx -> HeroBanner component.
The HeroBanner fetches GET /api/admin/hero-banner and renders:
  - <h1> with hero.title  (white, extrabold)
  - <p>  with hero.subtitle (orange-400, bold)
  - <p>  with hero.desc  (small, white/90)
  - <button> with hero.cta (orange-600)
  - <img src=hero.imageUrl> as the background photo (object-cover)

This is the BANNER AT THE TOP of the home page (y=0..320px), NOT the
mid-page AdBanner (which is a separate gradient promo banner).
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/hero-banner-home.png"

EXPECTED_TITLE = "Bingung Jual mesin baru/bekas dimana?"
EXPECTED_SUBTITLE = "Pasang iklan di mesinKU saja!!!"
EXPECTED_DESC = "Ada ribuan Mesin CETAK, Mesin CNC dan Mesin industri lainnya..."
EXPECTED_CTA = "Pasang Iklan Sekarang"
EXPECTED_IMAGE_URL = "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2a59f3618c60.jpg"

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
        page.on("response", lambda r: failed_requests.append(f"{r.status} {r.url}") if r.status >= 400 else None)

        # Step 0: navigate to home page
        resp = page.goto(URL, wait_until="networkidle", timeout=45000)
        check("0. Homepage loads HTTP 200",
              resp is not None and resp.status == 200,
              f"status={resp.status if resp else 'no response'}")

        # Wait for client-side React hydration + hero-banner fetch
        page.wait_for_timeout(2500)

        # Dismiss onboarding modal ("Nanti Saja") if present
        try:
            nanti = page.get_by_role("button", name="Nanti Saja", exact=True)
            if nanti.count() > 0:
                nanti.first.click(timeout=2000)
                page.wait_for_timeout(500)
        except Exception:
            pass

        # The HeroBanner section is at the TOP of the home page.
        # It renders an <h1> (unique on the page; the rest are h2/h3).
        h1 = page.locator("h1").first
        h1_count = page.locator("h1").count()
        check("1a. Hero banner h1 present at top of home page",
              h1_count >= 1, f"h1_count={h1_count}")

        h1_text = h1.inner_text().strip() if h1_count >= 1 else ""
        check("1b. Hero banner h1 contains exact title",
              h1_text == EXPECTED_TITLE,
              f"text={h1_text!r}")

        # Step 1c: orange-colored p element contains subtitle
        # The HeroBanner renders <p className="... text-orange-400 ...">{subtitle}</p>
        subtitle_info = page.evaluate('''() => {
            const ps = Array.from(document.querySelectorAll('p'));
            for (const p of ps) {
                const cls = p.className || '';
                if (cls.includes('text-orange-400') || cls.includes('text-orange-500')) {
                    // exclude ones inside admin banners or far down the page
                    const rect = p.getBoundingClientRect();
                    if (rect.top < 600) {
                        return {text: p.textContent.trim(), cls: cls, top: rect.top};
                    }
                }
            }
            return null;
        }''')
        check("1c. Orange-colored p contains subtitle",
              subtitle_info is not None and subtitle_info["text"] == EXPECTED_SUBTITLE,
              f"info={subtitle_info}")

        # Step 1d: smaller p element contains desc
        # The HeroBanner renders <p className="... text-xs ... text-white/90 ...">{desc}</p>
        # within ~600px from top
        desc_info = page.evaluate('''() => {
            const ps = Array.from(document.querySelectorAll('p'));
            for (const p of ps) {
                const cls = p.className || '';
                const rect = p.getBoundingClientRect();
                // hero desc is text-xs or text-sm, near top of page
                if ((cls.includes('text-xs') || cls.includes('text-sm'))
                    && cls.includes('text-white')
                    && rect.top < 600
                    && p.textContent.includes('Mesin CETAK')) {
                    return {text: p.textContent.trim(), top: rect.top, cls: cls};
                }
            }
            return null;
        }''')
        check("1d. Smaller p contains description",
              desc_info is not None and EXPECTED_DESC in (desc_info["text"] if desc_info else ""),
              f"info={desc_info}")

        # Step 1e: button contains CTA
        # The HeroBanner renders <button>...{cta}...</button> with class bg-orange-600
        cta_info = page.evaluate('''() => {
            const btns = Array.from(document.querySelectorAll('button'));
            for (const b of btns) {
                const cls = b.className || '';
                const rect = b.getBoundingClientRect();
                if (cls.includes('bg-orange-600') && rect.top < 600) {
                    return {text: b.textContent.trim(), top: rect.top, cls: cls};
                }
            }
            // fallback: any button near top of page containing the CTA text
            for (const b of btns) {
                const rect = b.getBoundingClientRect();
                if (rect.top < 600 && b.textContent.trim() === 'Pasang Iklan Sekarang') {
                    return {text: b.textContent.trim(), top: rect.top, cls: b.className};
                }
            }
            return null;
        }''')
        check("1e. Button contains CTA text",
              cta_info is not None and cta_info["text"] == EXPECTED_CTA,
              f"info={cta_info}")

        # Step 1f: verify background image is present (img src contains mesin cetak URL)
        img_info = page.evaluate(f'''() => {{
            const imgs = Array.from(document.querySelectorAll('img'));
            for (const img of imgs) {{
                const src = img.src || img.getAttribute('src') || '';
                const rect = img.getBoundingClientRect();
                if (src.includes('2a59f3618c60') || src.includes('image-search-mcp')) {{
                    return {{src: src, top: rect.top, width: rect.width, height: rect.height,
                             alt: img.alt}};
                }}
            }}
            return null;
        }}''')
        check("1f. Background img src contains mesin cetak URL",
              img_info is not None and "2a59f3618c60" in (img_info["src"] if img_info else ""),
              f"info={img_info}")

        # Also verify the hero img is at the TOP of the page (top < 400)
        if img_info:
            check("1g. Hero banner img is at top of page (top < 400)",
                  img_info["top"] < 400,
                  f"top={img_info['top']}")

        # Verify the hero section as a whole is the FIRST section on the page
        first_section_info = page.evaluate('''() => {
            const secs = Array.from(document.querySelectorAll('section'));
            if (secs.length === 0) return null;
            const s = secs[0];
            const rect = s.getBoundingClientRect();
            const h1 = s.querySelector('h1');
            const img = s.querySelector('img');
            return {
                top: rect.top,
                height: rect.height,
                hasH1: !!h1,
                h1Text: h1 ? h1.textContent.trim() : null,
                hasImg: !!img,
                imgSrc: img ? (img.src || img.getAttribute('src')) : null,
            };
        }''')
        check("1h. First <section> on page is the HeroBanner (has h1 + img)",
              first_section_info is not None and first_section_info["hasH1"]
              and first_section_info["hasImg"]
              and first_section_info["h1Text"] == EXPECTED_TITLE,
              f"info={first_section_info}")

        # Take viewport screenshot (top of page = hero banner)
        page.screenshot(path=SCREENSHOT, full_page=False)
        import os
        size = os.path.getsize(SCREENSHOT) if os.path.exists(SCREENSHOT) else 0
        check(f"Screenshot saved: {SCREENSHOT}", size > 0, f"size={size} bytes")

        # Runtime error checks
        check("No pageerror (uncaught JS exceptions)",
              len(page_errors) == 0,
              f"count={len(page_errors)}; first={page_errors[:2]}")

        hero_api_failures = [f for f in failed_requests if "/api/admin/hero-banner" in f]
        check("No HTTP >=400 on /api/admin/hero-banner",
              len(hero_api_failures) == 0,
              f"failures={hero_api_failures}")

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
