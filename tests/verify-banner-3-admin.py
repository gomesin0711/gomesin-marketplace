#!/usr/bin/env python3
"""
Verify the admin "Banner" menu now has FOUR editor sections in order:
  1. Hero Banner (Atas Beranda)
  2. Banner Promosi 1
  3. Banner Promosi 2
  4. Banner 3 (Kecil — di atas Iklan Brand New)

And that the Banner 3 editor is fully populated with the saved config:
  title    = "Mesin Baru Bergaransi Resmi"
  desc     = "Pilihan mesin industri baru bergaransi resmi dari seller terverifikasi"
  cta      = "Lihat Semua"
  link     = "listings"
  gradient = "from-rose-600 via-pink-600 to-fuchsia-600"  (label "Merah Muda")
  active   = true
  imageUrl = ""  (text-only, no photo)

Also verify the live preview is a COMPACT single-row banner with the
WHITE CTA button on the right.

Non-destructive: no PUT is sent.
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000"
SCREENSHOT = "/home/z/my-project/tool-results/banner-3-admin.png"

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

EXPECTED_TITLE = "Mesin Baru Bergaransi Resmi"
EXPECTED_DESC = "Pilihan mesin industri baru bergaransi resmi dari seller terverifikasi"
EXPECTED_CTA = "Lihat Semua"
EXPECTED_GRADIENT = "from-rose-600 via-pink-600 to-fuchsia-600"
EXPECTED_GRADIENT_LABEL = "Merah Muda"

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
        page.on("response",
                lambda r: failed_requests.append(f"{r.status} {r.url}") if r.status >= 400 else None)

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
        # Verify all FOUR section headings exist + are in order
        # ---------------------------------------------------------------
        order_info = page.evaluate('''() => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
            function findH(text) {
                return headings.find(h => (h.textContent || '').trim() === text);
            }
            const hero = findH('Hero Banner (Atas Beranda)');
            const promo1 = findH('Banner Promosi 1');
            const promo2 = findH('Banner Promosi 2');
            const banner3 = findH('Banner 3 (Kecil — di atas Iklan Brand New)');
            function top(h) {
                return h ? h.getBoundingClientRect().top + window.scrollY : null;
            }
            return {
                heroFound: !!hero,
                promo1Found: !!promo1,
                promo2Found: !!promo2,
                banner3Found: !!banner3,
                heroTop: top(hero),
                promo1Top: top(promo1),
                promo2Top: top(promo2),
                banner3Top: top(banner3),
            };
        }''')

        check("A-i. 'Hero Banner (Atas Beranda)' heading visible",
              order_info.get("heroFound"), f"info={order_info}")
        check("A-ii. 'Banner Promosi 1' heading visible",
              order_info.get("promo1Found"), f"info={order_info}")
        check("A-iii. 'Banner Promosi 2' heading visible",
              order_info.get("promo2Found"), f"info={order_info}")
        check("A-iv. 'Banner 3 (Kecil — di atas Iklan Brand New)' heading visible",
              order_info.get("banner3Found"),
              f"info={order_info}")

        if all(order_info.get(k) for k in ("heroFound", "promo1Found", "promo2Found", "banner3Found")):
            check("A-v. Order is Hero -> Promo 1 -> Promo 2 -> Banner 3 (top to bottom)",
                  order_info["heroTop"] < order_info["promo1Top"]
                  < order_info["promo2Top"] < order_info["banner3Top"],
                  f"tops={order_info['heroTop']}, {order_info['promo1Top']}, "
                  f"{order_info['promo2Top']}, {order_info['banner3Top']}")

        # ---------------------------------------------------------------
        # Verify Banner 3 editor form populated
        # ---------------------------------------------------------------
        b3_info = page.evaluate('''(EXPECTED_GRADIENT) => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
            const hh = headings.find(h =>
                (h.textContent || '').trim() === 'Banner 3 (Kecil — di atas Iklan Brand New)');
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
                const lbl = labels.find(l => (l.textContent || '').includes(text));
                if (!lbl) return null;
                const wrap = lbl.closest('div');
                return wrap ? wrap.querySelector(tag) : null;
            }
            // Banner 3 uses Input (single-line) for desc, not textarea
            const titleInp = valFor('Judul Banner', 'input');
            // Desc label is "Deskripsi"
            const descInp = valFor('Deskripsi', 'input');
            const ctaInp = valFor('Teks Tombol', 'input');
            const linkSel = valFor('Tujuan Tombol', 'select');
            const gradSel = valFor('Warna Background', 'select');
            const sw = node.querySelector('button[role="switch"]');
            const saveBtn = Array.from(node.querySelectorAll('button')).find(b =>
                (b.textContent || '').includes('Simpan Banner 3'));

            // Gradient options (verify "Merah Muda" option is present)
            const gradOptions = gradSel ? Array.from(gradSel.options).map(o => ({
                value: o.value, label: o.textContent.trim(),
            })) : [];
            const selectedGradOption = gradSel ? {
                value: gradSel.value,
                label: gradSel.options[gradSel.selectedIndex] ?
                    gradSel.options[gradSel.selectedIndex].textContent.trim() : null,
            } : null;

            // Live preview: the preview banner is a div with bg-gradient-to-r inside this card
            const previewBanners = Array.from(node.querySelectorAll('div')).filter(d =>
                (d.className || '').includes('bg-gradient-to-r'));
            let previewCta = null;
            let previewInfo = null;
            for (const pb of previewBanners) {
                const els = Array.from(pb.querySelectorAll('button, span, a'));
                const whiteEl = els.find(b =>
                    (b.className || '').includes('bg-white')
                    && (b.className || '').includes('text-black'));
                if (whiteEl) {
                    const cs = window.getComputedStyle(whiteEl);
                    previewCta = {
                        tag: whiteEl.tagName,
                        text: whiteEl.innerText.trim(),
                        className: whiteEl.className,
                        bgColor: cs.backgroundColor,
                        color: cs.color,
                    };
                }
                const r = pb.getBoundingClientRect();
                previewInfo = {
                    className: pb.className,
                    height: r.height,
                    width: r.width,
                    hasP4: (pb.className || '').includes('p-4'),
                    hasJustifyBetween: !!pb.querySelector('div.relative.flex.w-full.items-center.justify-between'),
                    innerRowClass: (pb.querySelector('div.relative.flex.w-full') || {}).className || '',
                    hasLineClamp1: !!pb.querySelector('p.line-clamp-1'),
                };
                if (previewCta) break;
            }

            return {
                found: true,
                title: titleInp ? {value: titleInp.value, disabled: titleInp.disabled, readonly: titleInp.readOnly} : null,
                desc: descInp ? {value: descInp.value, disabled: descInp.disabled, readonly: descInp.readOnly} : null,
                cta: ctaInp ? {value: ctaInp.value, disabled: ctaInp.disabled, readonly: ctaInp.readOnly} : null,
                link: linkSel ? {value: linkSel.value} : null,
                gradient: selectedGradOption,
                gradientMatchesExpected: selectedGradOption && selectedGradOption.value === EXPECTED_GRADIENT,
                gradientLabel: selectedGradOption ? selectedGradOption.label : null,
                gradOptions: gradOptions,
                active: sw ? sw.getAttribute('aria-checked') : null,
                saveBtnText: saveBtn ? saveBtn.textContent.trim() : null,
                saveBtnDisabled: saveBtn ? saveBtn.disabled : null,
                previewCta: previewCta,
                previewInfo: previewInfo,
            };
        }''', EXPECTED_GRADIENT)

        check("B-i. Banner 3 editor card found in DOM",
              b3_info and b3_info.get("found"),
              f"info_keys={list(b3_info.keys()) if b3_info else None}")

        if b3_info and b3_info.get("found"):
            # Title field
            check("B-ii. Banner 3 title field = 'Mesin Baru Bergaransi Resmi'",
                  b3_info["title"] and b3_info["title"]["value"] == EXPECTED_TITLE,
                  f"value={b3_info['title']['value'] if b3_info['title'] else None!r}")
            check("B-iii. Banner 3 title field editable (not disabled/readonly)",
                  b3_info["title"] and not b3_info["title"]["disabled"]
                  and not b3_info["title"]["readonly"], "")

            # Desc field (single-line input, not textarea)
            check("B-iv. Banner 3 desc field populated (exact)",
                  b3_info["desc"] and b3_info["desc"]["value"] == EXPECTED_DESC,
                  f"value={b3_info['desc']['value'] if b3_info['desc'] else None!r}")
            check("B-v. Banner 3 desc field editable",
                  b3_info["desc"] and not b3_info["desc"]["disabled"]
                  and not b3_info["desc"]["readonly"], "")
            check("B-vi. Banner 3 desc field is single-line <input> (not <textarea>)",
                  b3_info["desc"] is not None, "desc field is <input>")

            # CTA field
            check("B-vii. Banner 3 cta field = 'Lihat Semua'",
                  b3_info["cta"] and b3_info["cta"]["value"] == EXPECTED_CTA,
                  f"value={b3_info['cta']['value'] if b3_info['cta'] else None!r}")
            check("B-viii. Banner 3 cta field editable",
                  b3_info["cta"] and not b3_info["cta"]["disabled"]
                  and not b3_info["cta"]["readonly"], "")

            # Link selector = "listings"
            check("B-ix. Banner 3 link selector = 'listings' (Daftar Iklan)",
                  b3_info["link"] and b3_info["link"]["value"] == "listings",
                  f"value={b3_info['link']['value'] if b3_info['link'] else None!r}")

            # Gradient selector = "Merah Muda" (rose/pink/fuchsia)
            check("B-x. Banner 3 gradient selector value = rose/pink/fuchsia",
                  b3_info["gradientMatchesExpected"],
                  f"value={b3_info['gradient']['value'] if b3_info['gradient'] else None!r}")
            check("B-xi. Banner 3 gradient selector label = 'Merah Muda'",
                  b3_info["gradientLabel"] == EXPECTED_GRADIENT_LABEL,
                  f"label={b3_info['gradientLabel']!r}")

            # Verify 6 gradient options exist (Merah Muda, Jingga, Hijau, Oranye-Cyan, Biru, Gelap)
            grad_labels = [o["label"] for o in b3_info.get("gradOptions", [])]
            check("B-xii. Banner 3 gradient selector has 6 options",
                  len(grad_labels) == 6,
                  f"labels={grad_labels}")
            for expected_label in ["Merah Muda", "Jingga", "Hijau", "Oranye-Cyan", "Biru", "Gelap"]:
                check(f"B-xiii. Gradient option '{expected_label}' present",
                      expected_label in grad_labels, f"labels={grad_labels}")

            # Active toggle ON
            check("B-xiv. Banner 3 active toggle is ON (aria-checked=true)",
                  b3_info["active"] == "true",
                  f"aria-checked={b3_info['active']}")

            # Save button present + enabled
            check("B-xv. 'Simpan Banner 3' button present",
                  b3_info["saveBtnText"] is not None
                  and "Simpan Banner 3" in (b3_info["saveBtnText"] or ""),
                  f"text={b3_info['saveBtnText']!r}")
            check("B-xvi. 'Simpan Banner 3' button enabled (not disabled)",
                  b3_info["saveBtnDisabled"] is False,
                  f"disabled={b3_info['saveBtnDisabled']}")

            # ===== CRITICAL: Live preview is compact single-row + white CTA =====
            pv = b3_info.get("previewInfo")
            check("B-xvii. Live preview banner found",
                  pv is not None, f"previewInfo={pv}")
            if pv:
                check("B-xviii. Live preview uses 'p-4' (compact padding)",
                      pv["hasP4"], f"className={pv['className']}")
                check("B-xix. Live preview has justify-between inner row (CTA on right)",
                      pv["hasJustifyBetween"],
                      f"innerRowClass={pv['innerRowClass']}")
                check("B-xx. Live preview has line-clamp-1 desc (single-line)",
                      pv["hasLineClamp1"], f"className={pv['className']}")
                check("B-xxi. Live preview is COMPACT (height < 150px)",
                      pv["height"] < 150, f"height={pv['height']}px")

            pc = b3_info.get("previewCta")
            check("B-xxii. Live preview CTA element found (with bg-white + text-black)",
                  pc is not None, f"previewCta={pc}")
            if pc:
                check("B-xxiii. Live preview CTA className contains 'bg-white'",
                      "bg-white" in pc["className"], f"className={pc['className']}")
                check("B-xxiv. Live preview CTA className contains 'text-black'",
                      "text-black" in pc["className"], f"className={pc['className']}")
                check("B-xxv. Live preview CTA computed backgroundColor is white",
                      pc["bgColor"] in ("rgb(255, 255, 255)", "rgba(255, 255, 255, 1)"),
                      f"bgColor={pc['bgColor']!r}")
                check("B-xxvi. Live preview CTA text = 'Lihat Semua'",
                      EXPECTED_CTA in pc["text"], f"text={pc['text']!r}")

        # ---------------------------------------------------------------
        # Screenshot: scroll Banner 3 editor into view
        # ---------------------------------------------------------------
        page.evaluate('''() => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
            const hh = headings.find(h =>
                (h.textContent || '').trim() === 'Banner 3 (Kecil — di atas Iklan Brand New)');
            if (hh) hh.scrollIntoView({block: 'start'});
        }''')
        page.wait_for_timeout(600)
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
        banner3_failures = [f for f in failed_requests if "/api/admin/banner-3" in f]
        check("D-ii. No HTTP >=400 on /api/admin/banner-3",
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
