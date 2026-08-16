#!/usr/bin/env python3
"""
Verify the "Hero Banner (Atas Beranda)" editor section appears at the TOP of
the admin "Banner Promosi" tab, and that the form fields are populated with
the saved hero banner config.

Strategy:
  1. Inject the admin user object into localStorage (gomesin-store) and set
     view="admin-banner" so the BannerTab renders directly on page load.
  2. The BannerTab renders <HeroBannerTab /> FIRST (above the existing promo
     BannerTab form). Verify the heading "Hero Banner (Atas Beranda)" is
     present and is the FIRST section in the tab.
  3. Verify form fields are populated: Judul (H1), Sub-judul, Deskripsi,
     Teks Tombol (CTA), Foto Background preview, active toggle.
  4. Verify the "Simpan Hero Banner" button is present.
  5. Non-destructive: no PUT is sent.
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/hero-banner-admin.png"

ADMIN_USER = {
    "id": "cmsv4ru2c0000q71dpo8ynqqi",
    "name": "Admin mesinKU",
    "email": "mesinKU0711@gmail.com",
    "phone": "085888082208",
    "city": "Jakarta",
    "company": None,
    "address": None,
    "bannerImage": None,
    "logoImage": None,
    "role": "admin",
    "createdAt": "2026-08-16T01:33:04.116Z",
}

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
        # Inject admin user + admin-banner view into localStorage before page load
        store_state = {
            "state": {
                "view": "admin-banner",
                "slug": None,
                "sellerId": None,
                "profilePanel": None,
                "filters": {},
                "favorites": [],
                "favoritesSeenCount": 0,
                "recents": [],
                "user": ADMIN_USER,
            },
            "version": 0,
        }
        context.add_init_script(
            f"localStorage.setItem('gomesin-store', {json.dumps(json.dumps(store_state))});"
        )
        page = context.new_page()

        page_errors = []
        failed_requests = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("response", lambda r: failed_requests.append(f"{r.status} {r.url}") if r.status >= 400 else None)

        page.goto(URL, wait_until="networkidle", timeout=45000)
        # Wait for the BannerTab form to render + hydrate from /api/admin/hero-banner
        page.wait_for_timeout(3000)

        # Dismiss onboarding modal ("Nanti Saja") if present
        try:
            nanti = page.get_by_role("button", name="Nanti Saja", exact=True)
            if nanti.count() > 0:
                nanti.first.click(timeout=2000)
                page.wait_for_timeout(500)
        except Exception:
            pass
        # Also try clicking any visible close button in a z-[100] overlay
        try:
            page.evaluate('''() => {
                const overlay = document.querySelector('div.fixed.inset-0.z-\\\\[100\\\\]');
                if (!overlay) return;
                const close = overlay.querySelector('button[aria-label="Close"], button[aria-label="close"], svg.lucide-x');
                if (close) close.click();
            }''')
        except Exception:
            pass
        page.wait_for_timeout(500)

        # ----- Step A: Verify the "Hero Banner (Atas Beranda)" heading is visible -----
        hero_heading = page.get_by_text("Hero Banner (Atas Beranda)", exact=True)
        check("A. 'Hero Banner (Atas Beranda)' heading visible",
              hero_heading.count() >= 1, f"count={hero_heading.count()}")

        # ----- Step B: Verify HeroBannerTab is the FIRST section in the Banner tab -----
        # The BannerTab renders:
        #   <div className="space-y-6">
        #     <HeroBannerTab />         <-- FIRST
        #     <div className="space-y-4">  <-- Banner Promosi Beranda (existing)
        #       <h2>Banner Promosi Beranda</h2>
        order_info = page.evaluate('''() => {
            const heroHeading = Array.from(document.querySelectorAll('h2, h3, h1'))
                .find(h => h.textContent.trim() === 'Hero Banner (Atas Beranda)');
            const promoHeading = Array.from(document.querySelectorAll('h2, h3, h1'))
                .find(h => h.textContent.trim() === 'Banner Promosi Beranda');
            if (!heroHeading || !promoHeading) return {found: false, heroTop: heroHeading ? heroHeading.getBoundingClientRect().top : null,
                                                       promoTop: promoHeading ? promoHeading.getBoundingClientRect().top : null};
            const heroRect = heroHeading.getBoundingClientRect();
            const promoRect = promoHeading.getBoundingClientRect();
            return {
                found: true,
                heroTop: heroRect.top,
                promoTop: promoRect.top,
                heroBeforePromo: heroRect.top < promoRect.top,
            };
        }''')
        check("B. 'Hero Banner (Atas Beranda)' appears BEFORE 'Banner Promosi Beranda'",
              order_info and order_info.get("found") and order_info.get("heroBeforePromo"),
              f"info={order_info}")

        # ----- Step C: Verify form fields populated with saved values -----

        # C-i: Judul (H1) input
        title_val = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label'));
            // The HeroBannerTab uses label text "Judul (H1) *"
            const lbl = labels.find(l => l.textContent.includes('Judul (H1)'));
            if (!lbl) return null;
            const wrap = lbl.closest('div');
            const inp = wrap?.querySelector('input');
            return inp ? inp.value : null;
        }''')
        check("C-i. Judul (H1) input populated with saved title",
              title_val == EXPECTED_TITLE, f"value={title_val!r}")

        # C-ii: Sub-judul input
        subtitle_val = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const lbl = labels.find(l => l.textContent.includes('Sub-judul'));
            if (!lbl) return null;
            const wrap = lbl.closest('div');
            const inp = wrap?.querySelector('input');
            return inp ? inp.value : null;
        }''')
        check("C-ii. Sub-judul input populated with saved subtitle",
              subtitle_val == EXPECTED_SUBTITLE, f"value={subtitle_val!r}")

        # C-iii: Deskripsi textarea
        desc_val = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label'));
            // We need the Deskripsi textarea that is INSIDE the HeroBannerTab.
            // The HeroBannerTab is the first child div with border-primary/30.
            // Find all "Deskripsi" labels; pick the FIRST one (it's in HeroBannerTab since HeroBannerTab renders first).
            const deskLabels = labels.filter(l => l.textContent.trim() === 'Deskripsi' || l.textContent.includes('Deskripsi'));
            if (deskLabels.length === 0) return null;
            // The first "Deskripsi" label belongs to the HeroBannerTab
            const lbl = deskLabels[0];
            const wrap = lbl.closest('div');
            const ta = wrap?.querySelector('textarea');
            return ta ? ta.value : null;
        }''')
        check("C-iii. Deskripsi textarea populated with saved desc",
              desc_val == EXPECTED_DESC, f"value={desc_val!r}")

        # C-iv: Teks Tombol (CTA) input
        cta_val = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const lbl = labels.find(l => l.textContent.includes('Teks Tombol'));
            if (!lbl) return null;
            const wrap = lbl.closest('div');
            const inp = wrap?.querySelector('input');
            return inp ? inp.value : null;
        }''')
        check("C-iv. Teks Tombol (CTA) input populated with 'Pasang Iklan Sekarang'",
              cta_val == EXPECTED_CTA, f"value={cta_val!r}")

        # C-v: Foto Background preview - the img src inside the HeroBannerTab
        # should contain the saved image URL.
        # Locate the HeroBannerTab container by finding its heading
        # "Hero Banner (Atas Beranda)" and walking up to the outer card div.
        img_info = page.evaluate('''() => {
            const headings = Array.from(document.querySelectorAll('h2, h3, h1'));
            const hh = headings.find(h => h.textContent.trim() === 'Hero Banner (Atas Beranda)');
            if (!hh) return {found: false, reason: 'heading not found'};
            // Walk up until we find the wrapping card div with class containing "rounded-xl" and "border-2"
            let node = hh;
            for (let i = 0; i < 6; i++) {
                node = node.parentElement;
                if (!node) break;
                const cls = node.className || '';
                if (cls.includes('border-2') && cls.includes('rounded-xl')) break;
            }
            if (!node) return {found: false, reason: 'card div not found'};
            const imgs = node.querySelectorAll('img');
            const results = [];
            for (const img of imgs) {
                results.push({
                    src: img.src || img.getAttribute('src'),
                    alt: img.alt,
                    width: img.getBoundingClientRect().width,
                    height: img.getBoundingClientRect().height,
                });
            }
            return {found: true, imgs: results};
        }''')
        has_hero_img = (img_info and img_info.get("found")
                        and any("2a59f3618c60" in (i.get("src") or "")
                                for i in img_info.get("imgs", [])))
        check("C-v. Foto Background preview shows saved image URL",
              has_hero_img, f"imgs={img_info}")

        # ----- Step D: Active toggle reflects active=true (first switch in HeroBannerTab) -----
        active_info = page.evaluate('''() => {
            const headings = Array.from(document.querySelectorAll('h2, h3, h1'));
            const hh = headings.find(h => h.textContent.trim() === 'Hero Banner (Atas Beranda)');
            if (!hh) return {found: false, reason: 'heading not found'};
            let node = hh;
            for (let i = 0; i < 6; i++) {
                node = node.parentElement;
                if (!node) break;
                const cls = node.className || '';
                if (cls.includes('border-2') && cls.includes('rounded-xl')) break;
            }
            if (!node) return {found: false, reason: 'card div not found'};
            const sw = node.querySelector('button[role="switch"]');
            if (!sw) return {found: true, switch: false};
            return {
                found: true,
                switch: true,
                checked: sw.getAttribute('aria-checked'),
            };
        }''')
        check("D. Active toggle shows hero banner as active (aria-checked=true)",
              active_info and active_info.get("switch")
              and active_info.get("checked") == "true",
              f"info={active_info}")

        # ----- Step E: 'Simpan Hero Banner' button present -----
        save_btn = page.get_by_role("button", name="Simpan Hero Banner", exact=False)
        check("E-i. 'Simpan Hero Banner' button present",
              save_btn.count() >= 1, f"count={save_btn.count()}")
        if save_btn.count() >= 1:
            check("E-ii. 'Simpan Hero Banner' button enabled (not disabled)",
                  not save_btn.first.is_disabled(), "")

        # ----- Step F: Inputs are editable (not disabled / not readonly) -----
        editable_check = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label'));
            function valFor(text, tag) {
                const lbl = labels.find(l => l.textContent.includes(text));
                if (!lbl) return null;
                const wrap = lbl.closest('div');
                return wrap?.querySelector(tag);
            }
            const ti = valFor('Judul (H1)', 'input');
            const si = valFor('Sub-judul', 'input');
            const ta = valFor('Deskripsi', 'textarea');
            const ci = valFor('Teks Tombol', 'input');
            return {
                title: ti ? {disabled: ti.disabled, readonly: ti.readOnly} : null,
                subtitle: si ? {disabled: si.disabled, readonly: si.readOnly} : null,
                desc: ta ? {disabled: ta.disabled, readonly: ta.readOnly} : null,
                cta: ci ? {disabled: ci.disabled, readonly: ci.readOnly} : null,
            };
        }''')
        check("F-i. Judul input is editable",
              editable_check and editable_check["title"]
              and not editable_check["title"]["disabled"]
              and not editable_check["title"]["readonly"],
              f"check={editable_check}")
        check("F-ii. Sub-judul input is editable",
              editable_check and editable_check["subtitle"]
              and not editable_check["subtitle"]["disabled"]
              and not editable_check["subtitle"]["readonly"],
              f"check={editable_check}")
        check("F-iii. Deskripsi textarea is editable",
              editable_check and editable_check["desc"]
              and not editable_check["desc"]["disabled"]
              and not editable_check["desc"]["readonly"],
              f"check={editable_check}")
        check("F-iv. Teks Tombol input is editable",
              editable_check and editable_check["cta"]
              and not editable_check["cta"]["disabled"]
              and not editable_check["cta"]["readonly"],
              f"check={editable_check}")

        # ----- Step G: Take screenshot of admin editor -----
        # Scroll to top so the Hero Banner editor is visible
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        page.screenshot(path=SCREENSHOT, full_page=False)
        size = os.path.getsize(SCREENSHOT) if os.path.exists(SCREENSHOT) else 0
        check(f"G. Admin editor screenshot saved: {SCREENSHOT}",
              size > 0, f"size={size} bytes")

        # ----- Step H: Runtime errors -----
        check("H-i. No pageerror (uncaught JS exceptions)",
              len(page_errors) == 0,
              f"count={len(page_errors)}; first={page_errors[:2]}")

        hero_api_failures = [f for f in failed_requests if "/api/admin/hero-banner" in f]
        check("H-ii. No HTTP >=400 on /api/admin/hero-banner",
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
