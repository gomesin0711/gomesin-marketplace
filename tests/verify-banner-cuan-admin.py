#!/usr/bin/env python3
"""
Verify the admin Banner editor shows Banner Promosi 2 populated with the
saved config:
  title    = "Punya mesin? Ubah jadi cuan."
  desc     = "Pasang iklan mulai Rp 30.000 dan jangkau ribuan pembeli industri se-Indonesia."
  cta      = "Mulai Pasang Iklan"
  link     = "post"
  gradient = "from-orange-600 via-orange-600 to-cyan-600"
  active   = true
  imageUrl = ""  (text-only)

Also verify the live preview CTA button is WHITE (bg-white + text-black),
and that "Simpan Banner 2" button is present and enabled.

Non-destructive: no PUT is sent.
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/banner-cuan-admin.png"

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

        # ---------------------------------------------------------------
        # Verify all THREE section headings exist + are in order
        # ---------------------------------------------------------------
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
        check("A-ii. 'Banner Promosi 1' heading visible",
              order_info.get("promo1Found"), f"info={order_info}")
        check("A-iii. 'Banner Promosi 2' heading visible",
              order_info.get("promo2Found"), f"info={order_info}")

        if order_info.get("heroFound") and order_info.get("promo1Found") and order_info.get("promo2Found"):
            check("A-iv. Order is Hero -> Promo 1 -> Promo 2 (top to bottom)",
                  order_info["heroTop"] < order_info["promo1Top"] < order_info["promo2Top"],
                  f"tops={order_info['heroTop']}, {order_info['promo1Top']}, {order_info['promo2Top']}")

        # ---------------------------------------------------------------
        # Verify Banner Promosi 2 editor form populated
        # Also examine the live preview area for a white CTA button.
        # ---------------------------------------------------------------
        b2_info = page.evaluate('''(EXPECTED_B2_GRADIENT) => {
            const headings = Array.from(document.querySelectorAll('h2, h3, h1'));
            const hh = headings.find(h => h.textContent.trim() === 'Banner Promosi 2');
            if (!hh) return {found: false, reason: 'heading not found'};
            // Walk up to the wrapping card div
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

            // Live preview: look for a div with bg-gradient-to-r (the preview banner)
            // and the white CTA element inside it. Note: the preview CTA is rendered
            // as a <span> (not a <button>) in PromoBanner2Tab, so search both tags.
            const previewBanners = Array.from(node.querySelectorAll('div')).filter(d =>
                d.className && d.className.includes('bg-gradient-to-r'));
            let previewCta = null;
            for (const pb of previewBanners) {
                const els = Array.from(pb.querySelectorAll('button, span'));
                const whiteEl = els.find(b => b.className.includes('bg-white') && b.className.includes('text-black'));
                if (whiteEl) {
                    previewCta = {
                        tag: whiteEl.tagName,
                        text: whiteEl.innerText.trim(),
                        className: whiteEl.className,
                        bgColor: window.getComputedStyle(whiteEl).backgroundColor,
                        color: window.getComputedStyle(whiteEl).color,
                    };
                    break;
                }
            }
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
                previewCta: previewCta,
            };
        }''', EXPECTED_B2_GRADIENT)

        check("B-i. Banner Promosi 2 card found in DOM",
              b2_info and b2_info.get("found"), f"info_keys={list(b2_info.keys()) if b2_info else None}")

        if b2_info and b2_info.get("found"):
            check("B-ii. Banner 2 title field = 'Punya mesin? Ubah jadi cuan.'",
                  b2_info["title"] and b2_info["title"]["value"] == EXPECTED_B2_TITLE,
                  f"value={b2_info['title']['value'] if b2_info['title'] else None!r}")
            check("B-iii. Banner 2 title field editable (not disabled/readonly)",
                  b2_info["title"] and not b2_info["title"]["disabled"]
                  and not b2_info["title"]["readonly"], "")

            check("B-iv. Banner 2 desc field populated (exact)",
                  b2_info["desc"] and b2_info["desc"]["value"] == EXPECTED_B2_DESC,
                  f"value={b2_info['desc']['value'] if b2_info['desc'] else None!r}")
            check("B-v. Banner 2 desc field editable",
                  b2_info["desc"] and not b2_info["desc"]["disabled"]
                  and not b2_info["desc"]["readonly"], "")

            check("B-vi. Banner 2 cta field = 'Mulai Pasang Iklan'",
                  b2_info["cta"] and b2_info["cta"]["value"] == EXPECTED_B2_CTA,
                  f"value={b2_info['cta']['value'] if b2_info['cta'] else None!r}")
            check("B-vii. Banner 2 cta field editable",
                  b2_info["cta"] and not b2_info["cta"]["disabled"]
                  and not b2_info["cta"]["readonly"], "")

            check("B-viii. Banner 2 link selector = 'post' (Pasang Iklan)",
                  b2_info["link"] and b2_info["link"]["value"] == "post",
                  f"value={b2_info['link']['value'] if b2_info['link'] else None!r}")

            check("B-ix. Banner 2 gradient selector = orange-to-cyan",
                  b2_info["gradientMatchesExpected"],
                  f"value={b2_info['gradient']['value'] if b2_info['gradient'] else None!r}")

            check("B-x. Banner 2 active toggle is ON (aria-checked=true)",
                  b2_info["active"] == "true",
                  f"aria-checked={b2_info['active']}")

            check("B-xi. 'Simpan Banner 2' button present",
                  b2_info["saveBtnText"] is not None
                  and "Simpan Banner 2" in (b2_info["saveBtnText"] or ""),
                  f"text={b2_info['saveBtnText']!r}")
            check("B-xii. 'Simpan Banner 2' button enabled (not disabled)",
                  b2_info["saveBtnDisabled"] is False,
                  f"disabled={b2_info['saveBtnDisabled']}")

            # ===== CRITICAL: Live preview CTA button must be WHITE =====
            pc = b2_info.get("previewCta")
            check("B-xiii. Live preview CTA button found (with 'bg-white' class)",
                  pc is not None,
                  f"previewCta={pc}")
            if pc:
                check("B-xiv. Live preview CTA className contains 'bg-white'",
                      "bg-white" in pc["className"], f"className={pc['className']}")
                check("B-xv. Live preview CTA className contains 'text-black'",
                      "text-black" in pc["className"], f"className={pc['className']}")
                check("B-xvi. Live preview CTA computed backgroundColor is white",
                      pc["bgColor"] in ("rgb(255, 255, 255)", "rgba(255, 255, 255, 1)"),
                      f"bgColor={pc['bgColor']!r}")
                check("B-xvii. Live preview CTA text = 'Mulai Pasang Iklan'",
                      EXPECTED_B2_CTA in pc["text"], f"text={pc['text']!r}")

        # ---------------------------------------------------------------
        # Screenshot: scroll to Banner Promosi 2
        # ---------------------------------------------------------------
        page.evaluate('''() => {
            const headings = Array.from(document.querySelectorAll('h2, h3, h1'));
            const hh = headings.find(h => h.textContent.trim() === 'Banner Promosi 2');
            if (hh) hh.scrollIntoView({block: 'start'});
        }''')
        page.wait_for_timeout(500)
        page.screenshot(path=SCREENSHOT, full_page=False)
        size = os.path.getsize(SCREENSHOT) if os.path.exists(SCREENSHOT) else 0
        check(f"C. Admin editor screenshot saved: {SCREENSHOT}",
              size > 0, f"size={size} bytes")

        # ---------------------------------------------------------------
        # Runtime errors
        # ---------------------------------------------------------------
        check("D-i. No pageerror (uncaught JS exceptions)",
              len(page_errors) == 0,
              f"count={len(page_errors)}; first={page_errors[:2]}")

        banner2_failures = [f for f in failed_requests if "/api/admin/banner-2" in f]
        check("D-ii. No HTTP >=400 on /api/admin/banner-2",
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
