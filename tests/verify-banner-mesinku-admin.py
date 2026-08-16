#!/usr/bin/env python3
"""
Verify the banner text is EDITABLE in the admin "Banner Promosi" menu.

Strategy:
  1. Inject the admin user object into localStorage (gomesin-store) and set
     view="admin-banner" so the BannerTab renders directly on page load.
  2. Verify the BannerTab form is populated with the saved banner text.
  3. Verify inputs are editable (not disabled, accept input).
  4. Verify the live preview updates as the user types.
  5. DO NOT save (preserves the user's banner).

Non-destructive: no PUT /api/admin/banner is sent.
"""
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/banner-mesinku-admin-editor.png"

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
EXPECTED_DESC = ("Pasang iklan di mesinKU saja!!! Ada ribuan Mesin CETAK, "
                 "Mesin CNC dan Mesin industri lainnya...")
EXPECTED_CTA = "Pasang Iklan Sekarang"
EXPECTED_GRADIENT = "from-amber-500 via-orange-500 to-rose-500"

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
        # Wait for the BannerTab form to render + hydrate from /api/admin/banner
        page.wait_for_timeout(2500)

        # Dismiss any blocking onboarding/welcome modal ("Nanti Saja" button)
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

        # Step A: BannerTab heading visible
        heading = page.get_by_text("Banner Promosi Beranda", exact=True)
        check("A. 'Banner Promosi Beranda' heading visible",
              heading.count() >= 1, f"count={heading.count()}")

        # Step B: Form fields populated with saved banner text
        # Title input
        title_input = page.locator("input").filter(has_text="").first
        # Better: locate by the label structure. The title Input is the first
        # <input> after the "Judul Banner *" label.
        title_val = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label, .text-xs'));
            const lbl = labels.find(l => l.textContent.includes('Judul Banner'));
            if (!lbl) return null;
            const wrap = lbl.closest('div');
            const inp = wrap?.querySelector('input');
            return inp ? inp.value : null;
        }''')
        check("B-i. Title input populated with saved banner title",
              title_val == EXPECTED_TITLE, f"value={title_val!r}")

        desc_val = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label, .text-xs'));
            const lbl = labels.find(l => l.textContent.includes('Deskripsi'));
            if (!lbl) return null;
            const wrap = lbl.closest('div');
            const ta = wrap?.querySelector('textarea');
            return ta ? ta.value : null;
        }''')
        check("B-ii. Description textarea populated with saved desc",
              desc_val == EXPECTED_DESC, f"value={desc_val!r}")

        cta_val = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label, .text-xs'));
            const lbl = labels.find(l => l.textContent.includes('Teks Tombol'));
            if (!lbl) return null;
            const wrap = lbl.closest('div');
            const inp = wrap?.querySelector('input');
            return inp ? inp.value : null;
        }''')
        check("B-iii. CTA input populated with 'Pasang Iklan Sekarang'",
              cta_val == EXPECTED_CTA, f"value={cta_val!r}")

        gradient_val = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label, .text-xs'));
            const lbl = labels.find(l => l.textContent.includes('Warna Background'));
            if (!lbl) return null;
            const wrap = lbl.closest('div');
            const sel = wrap?.querySelector('select');
            return sel ? sel.value : null;
        }''')
        check("B-iv. Gradient select set to amber/orange/rose",
              gradient_val == EXPECTED_GRADIENT, f"value={gradient_val!r}")

        # Step C: Active toggle reflects active=true
        active_state = page.evaluate('''() => {
            const sw = document.querySelector('button[role="switch"]');
            if (!sw) return null;
            return {
                checked: sw.getAttribute('aria-checked'),
                cls: sw.className,
            };
        }''')
        check("C. Active toggle shows banner as active (aria-checked=true)",
              active_state and active_state.get("checked") == "true",
              f"state={active_state}")

        # Step D: Inputs are editable (not disabled)
        disabled_check = page.evaluate('''() => {
            const labels = Array.from(document.querySelectorAll('label, .text-xs'));
            function valFor(text, tag) {
                const lbl = labels.find(l => l.textContent.includes(text));
                if (!lbl) return null;
                const wrap = lbl.closest('div');
                return wrap?.querySelector(tag);
            }
            const ti = valFor('Judul Banner', 'input');
            const ta = valFor('Deskripsi', 'textarea');
            const ci = valFor('Teks Tombol', 'input');
            return {
                titleDisabled: ti ? ti.disabled : null,
                descDisabled: ta ? ta.disabled : null,
                ctaDisabled: ci ? ci.disabled : null,
                titleReadonly: ti ? ti.readOnly : null,
                descReadonly: ta ? ta.readOnly : null,
                ctaReadonly: ci ? ci.readOnly : null,
            };
        }''')
        check("D-i. Title input is editable (not disabled, not readonly)",
              disabled_check and not disabled_check["titleDisabled"]
              and not disabled_check["titleReadonly"],
              f"check={disabled_check}")
        check("D-ii. Description textarea is editable",
              disabled_check and not disabled_check["descDisabled"]
              and not disabled_check["descReadonly"],
              f"check={disabled_check}")
        check("D-iii. CTA input is editable",
              disabled_check and not disabled_check["ctaDisabled"]
              and not disabled_check["ctaReadonly"],
              f"check={disabled_check}")

        # Step E: Save button present and enabled
        save_btn = page.get_by_role("button", name="Simpan Banner", exact=False)
        check("E-i. 'Simpan Banner' button present",
              save_btn.count() >= 1, f"count={save_btn.count()}")
        if save_btn.count() >= 1:
            check("E-ii. 'Simpan Banner' button enabled (not disabled)",
                  not save_btn.first.is_disabled(), "")

        # Step F: Live editing test (NON-DESTRUCTIVE — no save)
        # Type a marker into the title input and verify the live preview updates.
        title_input_handle = page.evaluate_handle('''() => {
            const labels = Array.from(document.querySelectorAll('label, .text-xs'));
            const lbl = labels.find(l => l.textContent.includes('Judul Banner'));
            const wrap = lbl.closest('div');
            return wrap.querySelector('input');
        }''')
        ti_el = title_input_handle.as_element()
        check("F-i. Title input element located for editing test",
              ti_el is not None, "")

        if ti_el is not None:
            # Focus, move cursor to end, type a temporary suffix
            ti_el.click()
            ti_el.press("End")
            ti_el.type(" [EDIT TEST]")
            page.wait_for_timeout(300)
            new_val = ti_el.input_value()
            check("F-ii. Typing in title input updates its value",
                  new_val == EXPECTED_TITLE + " [EDIT TEST]",
                  f"value={new_val!r}")

            # Verify the live preview h3 updated
            preview_text = page.evaluate('''() => {
                const previews = Array.from(document.querySelectorAll('h3'));
                const pv = previews.find(h => h.textContent.includes('EDIT TEST'));
                return pv ? pv.textContent.trim() : null;
            }''')
            check("F-iii. Live preview h3 updates reactively as user types",
                  preview_text == EXPECTED_TITLE + " [EDIT TEST]",
                  f"preview={preview_text!r}")

            # Restore original title (clear input, retype) — non-destructive
            ti_el.click()
            ti_el.fill("")
            ti_el.type(EXPECTED_TITLE)
            page.wait_for_timeout(300)
            restored_val = ti_el.input_value()
            check("F-iv. Title input restored to original value (no save)",
                  restored_val == EXPECTED_TITLE,
                  f"value={restored_val!r}")

        # Step G: Screenshot of the admin editor
        page.screenshot(path=SCREENSHOT, full_page=False)
        check(f"G. Admin editor screenshot saved to {SCREENSHOT}", True, "")

        # Runtime error checks
        check("No pageerror (uncaught JS exceptions) during admin load",
              len(page_errors) == 0,
              f"count={len(page_errors)}; first={page_errors[:1]}")
        # The /api/admin/banner GET should be 200
        banner_api_failures = [f for f in failed_requests if "/api/admin/banner" in f]
        check("No HTTP >=400 on /api/admin/banner during admin load",
              len(banner_api_failures) == 0,
              f"failures={banner_api_failures}")

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
