#!/usr/bin/env python3
"""
Verify the admin "Banner" tab now contains THREE editor sections in order:
  1. "Hero Banner (Atas Beranda)"
  2. "Banner Promosi 1"   (renamed from "Banner Promosi Beranda")
  3. "Banner Promosi 2"   (newly added second editable promo banner)

Also verify the Banner Promosi 2 editor is populated with the saved config:
  title    = "Cari Mesin CNC & Laser Terbaik?"
  desc     = "Ratusan pilihan mesin CNC router, laser cutting, dan bubut dari seller terverifikasi. Harga mulai Rp 15 juta."
  cta      = "Lihat Mesin CNC"
  link     = "listings"
  gradient = "from-emerald-500 via-green-600 to-teal-600"   (label "Hijau")
  active   = true
  imageUrl = ""   (text-only)

And that the editor is fully editable (inputs not disabled/readonly, save
button enabled). Non-destructive — no PUT is sent.
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/two-promo-banners-admin.png"

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

EXPECTED_B2_TITLE = "Cari Mesin CNC & Laser Terbaik?"
EXPECTED_B2_DESC = "Ratusan pilihan mesin CNC router, laser cutting, dan bubut dari seller terverifikasi. Harga mulai Rp 15 juta."
EXPECTED_B2_CTA = "Lihat Mesin CNC"
EXPECTED_B2_GRADIENT = "from-emerald-500 via-green-600 to-teal-600"

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
        page.wait_for_timeout(800)

        # ------------------------------------------------------------------
        # Step A: Verify all THREE section headings exist + are in order
        # Hero Banner (Atas Beranda)  -> top
        # Banner Promosi 1            -> middle
        # Banner Promosi 2            -> bottom
        # ------------------------------------------------------------------
        order_info = page.evaluate('''() => {
            const headings = Array.from(document.querySelectorAll('h2, h3, h1'));
            const hero = headings.find(h => h.textContent.trim() === 'Hero Banner (Atas Beranda)');
            const promo1 = headings.find(h => h.textContent.trim() === 'Banner Promosi 1');
            const promo2 = headings.find(h => h.textContent.trim() === 'Banner Promosi 2');
            return {
                heroFound: !!hero,
                promo1Found: !!promo1,
                promo2Found: !!promo2,
                heroTop: hero ? hero.getBoundingClientRect().top + window.scrollY : null,
                promo1Top: promo1 ? promo1.getBoundingClientRect().top + window.scrollY : null,
                promo2Top: promo2 ? promo2.getBoundingClientRect().top + window.scrollY : null,
            };
        }''')
        check("A-i. 'Hero Banner (Atas Beranda)' heading visible",
              order_info.get("heroFound"), f"info={order_info}")
        check("A-ii. 'Banner Promosi 1' heading visible (renamed from 'Banner Promosi Beranda')",
              order_info.get("promo1Found"), f"info={order_info}")
        check("A-iii. 'Banner Promosi 2' heading visible",
              order_info.get("promo2Found"), f"info={order_info}")

        if order_info.get("heroFound") and order_info.get("promo1Found") and order_info.get("promo2Found"):
            check("A-iv. Order is Hero -> Promo 1 -> Promo 2 (top to bottom)",
                  order_info["heroTop"] < order_info["promo1Top"] < order_info["promo2Top"],
                  f"heroTop={order_info['heroTop']}, promo1Top={order_info['promo1Top']}, promo2Top={order_info['promo2Top']}")

        # Also verify the OLD name 'Banner Promosi Beranda' is GONE (renamed)
        old_heading_count = page.evaluate('''() => {
            const headings = Array.from(document.querySelectorAll('h2, h3, h1'));
            return headings.filter(h => h.textContent.trim() === 'Banner Promosi Beranda').length;
        }''')
        check("A-v. Old 'Banner Promosi Beranda' heading renamed (no longer present)",
              old_heading_count == 0, f"old_heading_count={old_heading_count}")

        # ------------------------------------------------------------------
        # Step B: Verify the Banner Promosi 2 editor form is populated
        # The PromoBanner2Tab card is the wrapping div with class
        #   "space-y-3 rounded-xl border border-border bg-card p-4"
        # We locate it by walking up from the "Banner Promosi 2" h2 heading.
        # ------------------------------------------------------------------
        b2_info = page.evaluate('''(EXPECTED_B2_GRADIENT) => {
            const headings = Array.from(document.querySelectorAll('h2, h3, h1'));
            const hh = headings.find(h => h.textContent.trim() === 'Banner Promosi 2');
            if (!hh) return {found: false, reason: 'heading not found'};
            // Walk up to the wrapping card div with class containing 'border' + 'rounded-xl'
            let node = hh;
            for (let i = 0; i < 8; i++) {
                node = node.parentElement;
                if (!node) break;
                const cls = node.className || '';
                if (cls.includes('rounded-xl') && cls.includes('border')) break;
            }
            if (!node) return {found: false, reason: 'card div not found'};
            const labels = Array.from(node.querySelectorAll('label'));
            function valFor(text, tag) {
                const lbl = labels.find(l => l.textContent.includes(text));
                if (!lbl) return null;
                const wrap = lbl.closest('div');
                return wrap ? wrap.querySelector(tag) : null;
            }
            const titleInp = valFor('Judul Banner', 'input');
            const descTa = valFor('Deskripsi', 'textarea');
            const ctaInp = valFor('Teks Tombol', 'input');
            const linkSel = valFor('Tujuan Tombol', 'select');
            const gradSel = valFor('Warna Background', 'select');
            const sw = node.querySelector('button[role="switch"]');
            const saveBtn = Array.from(node.querySelectorAll('button')).find(b =>
                b.textContent.includes('Simpan Banner 2'));
            return {
                found: true,
                title: titleInp ? {value: titleInp.value, disabled: titleInp.disabled, readonly: titleInp.readOnly} : null,
                desc: descTa ? {value: descTa.value, disabled: descTa.disabled, readonly: descTa.readOnly} : null,
                cta: ctaInp ? {value: ctaInp.value, disabled: ctaInp.disabled, readonly: ctaInp.readOnly} : null,
                link: linkSel ? {value: linkSel.value} : null,
                gradient: gradSel ? {value: gradSel.value} : null,
                gradientMatchesExpected: gradSel ? gradSel.value === EXPECTED_B2_GRADIENT : false,
                active: sw ? sw.getAttribute('aria-checked') : null,
                saveBtnText: saveBtn ? saveBtn.textContent.trim() : null,
                saveBtnDisabled: saveBtn ? saveBtn.disabled : null,
            };
        }''', EXPECTED_B2_GRADIENT)

        check("B-i. Banner Promosi 2 card found in DOM",
              b2_info and b2_info.get("found"), f"info={b2_info}")

        if b2_info and b2_info.get("found"):
            # Title
            check("B-ii. Banner 2 title field populated with 'Cari Mesin CNC & Laser Terbaik?'",
                  b2_info["title"] and b2_info["title"]["value"] == EXPECTED_B2_TITLE,
                  f"value={b2_info['title']['value'] if b2_info['title'] else None!r}")
            check("B-iii. Banner 2 title field is editable (not disabled/readonly)",
                  b2_info["title"] and not b2_info["title"]["disabled"]
                  and not b2_info["title"]["readonly"], "")

            # Desc
            check("B-iv. Banner 2 desc field populated with saved description",
                  b2_info["desc"] and EXPECTED_B2_DESC in b2_info["desc"]["value"],
                  f"value={b2_info['desc']['value'] if b2_info['desc'] else None!r}")
            check("B-v. Banner 2 desc field is editable",
                  b2_info["desc"] and not b2_info["desc"]["disabled"]
                  and not b2_info["desc"]["readonly"], "")

            # CTA
            check("B-vi. Banner 2 cta field populated with 'Lihat Mesin CNC'",
                  b2_info["cta"] and b2_info["cta"]["value"] == EXPECTED_B2_CTA,
                  f"value={b2_info['cta']['value'] if b2_info['cta'] else None!r}")
            check("B-vii. Banner 2 cta field is editable",
                  b2_info["cta"] and not b2_info["cta"]["disabled"]
                  and not b2_info["cta"]["readonly"], "")

            # Link selector — saved value is "listings"
            check("B-viii. Banner 2 link selector shows 'listings' (Daftar Iklan)",
                  b2_info["link"] and b2_info["link"]["value"] == "listings",
                  f"value={b2_info['link']['value'] if b2_info['link'] else None!r}")

            # Gradient selector
            check("B-ix. Banner 2 gradient selector shows emerald/green/teal (green)",
                  b2_info["gradientMatchesExpected"],
                  f"value={b2_info['gradient']['value'] if b2_info['gradient'] else None!r}")

            # Active toggle
            check("B-x. Banner 2 active toggle is ON (aria-checked=true)",
                  b2_info["active"] == "true",
                  f"aria-checked={b2_info['active']}")

            # Save button
            check("B-xi. 'Simpan Banner 2' button present",
                  b2_info["saveBtnText"] is not None
                  and "Simpan Banner 2" in (b2_info["saveBtnText"] or ""),
                  f"text={b2_info['saveBtnText']!r}")
            check("B-xii. 'Simpan Banner 2' button enabled (not disabled)",
                  b2_info["saveBtnDisabled"] is False,
                  f"disabled={b2_info['saveBtnDisabled']}")

        # ------------------------------------------------------------------
        # Step C: Verify the Banner Promosi 1 editor (renamed)
        # Just confirm heading text is "Banner Promosi 1" and a "Simpan Banner"
        # button exists (the original BannerTab form).
        # ------------------------------------------------------------------
        b1_info = page.evaluate('''() => {
            const headings = Array.from(document.querySelectorAll('h2, h3, h1'));
            const hh = headings.find(h => h.textContent.trim() === 'Banner Promosi 1');
            if (!hh) return {found: false};
            // Walk up to the wrapping card div
            let node = hh;
            for (let i = 0; i < 8; i++) {
                node = node.parentElement;
                if (!node) break;
                const cls = node.className || '';
                if (cls.includes('space-y-4')) break;
            }
            if (!node) return {found: false};
            const saveBtn = Array.from(node.querySelectorAll('button')).find(b =>
                b.textContent.includes('Simpan Banner') && !b.textContent.includes('Banner 2') && !b.textContent.includes('Hero'));
            return {
                found: true,
                saveBtnText: saveBtn ? saveBtn.textContent.trim() : null,
            };
        }''')
        check("C-i. Banner Promosi 1 section found (heading renamed from 'Banner Promosi Beranda')",
              b1_info and b1_info.get("found"), f"info={b1_info}")
        check("C-ii. Banner Promosi 1 has 'Simpan Banner' save button (not Hero/Banner 2)",
              b1_info and b1_info.get("saveBtnText")
              and "Simpan Banner" in b1_info["saveBtnText"],
              f"text={b1_info['saveBtnText'] if b1_info else None!r}")

        # ------------------------------------------------------------------
        # Step D: Take screenshot of admin editor
        # Scroll to Banner Promosi 2 so the screenshot shows the new section.
        # ------------------------------------------------------------------
        page.evaluate('''() => {
            const headings = Array.from(document.querySelectorAll('h2, h3, h1'));
            const hh = headings.find(h => h.textContent.trim() === 'Banner Promosi 2');
            if (hh) hh.scrollIntoView({block: 'start'});
        }''')
        page.wait_for_timeout(400)
        page.screenshot(path=SCREENSHOT, full_page=False)
        size = os.path.getsize(SCREENSHOT) if os.path.exists(SCREENSHOT) else 0
        check(f"D. Admin editor screenshot saved: {SCREENSHOT}",
              size > 0, f"size={size} bytes")

        # ------------------------------------------------------------------
        # Step E: Runtime errors / failed requests
        # ------------------------------------------------------------------
        check("E-i. No pageerror (uncaught JS exceptions)",
              len(page_errors) == 0,
              f"count={len(page_errors)}; first={page_errors[:2]}")

        banner2_failures = [f for f in failed_requests if "/api/admin/banner-2" in f]
        check("E-ii. No HTTP >=400 on /api/admin/banner-2",
              len(banner2_failures) == 0,
              f"failures={banner2_failures}")

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
