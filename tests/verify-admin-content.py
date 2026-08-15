#!/usr/bin/env python3
"""
Browser verification for Task ID: admin-content-sync.

Verifies the local mesinKU admin account now has the SAME content as the
production gomesin admin account — checked end-to-end through the actual
browser UI (no API shortcuts for the user-visible assertions):

  1. Home page renders cleanly (no error boundary).
  2. PWA install prompt is suppressed (pre-seed localStorage).
  3. Login flow works through the actual UI form:
        - click header login button
        - (default tab = "Masuk" already)
        - fill email + password
        - click "Masuk"
        - header now shows avatar / "Akun Saya" instead of "Masuk atau Daftar"
  4. Profile overview shows the synced phone 085888082208
     (NOT the old placeholder 0812-0000-0000) — under "Nomor Telepon" card
     in the overview header.
  5. Admin view + Pengaturan panel both render the synced banner + logo
     images (base64 JPEG data URIs, not placeholders).
  6. Pengaturan → "No. HP" row contains 085888082208.
  7. Profile → "Iklan Saya" panel shows 2 listings: "Tes" + "Test Draft
     Invalid Cat".
  8. Capture screenshots of the profile + listings views.
  9. Capture any browser console errors / pageerror events.

NOTE on navigation: the app is a SPA using a zustand store (localStorage key
"gomesin-store") — there is NO URL routing. After login as an admin, the app
auto-redirects to the "admin" view (which has its own header showing the
banner+logo images). To reach the user "profile" view (where Iklan Saya +
No. HP live), we click the "Kembali" (back) button in the admin view to
return home, then click the "Akun Saya" avatar button in the home header.
"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL = "http://localhost:3000/"
SCREEN_DIR = Path("/home/z/my-project/tool-results")
SCREEN_DIR.mkdir(parents=True, exist_ok=True)

ADMIN_EMAIL = "mesinKU0711@gmail.com"
ADMIN_PASSWORD = "admin123"

EXPECTED_PHONE = "085888082208"
OLD_PLACEHOLDER_PHONE = "0812-0000-0000"
EXPECTED_LISTING_TITLES = ["Tes", "Test Draft Invalid Cat"]


def log(msg):
    print(msg, flush=True)


def first_visible(locator):
    """Return the first visible element of a Playwright locator, or None."""
    try:
        for i in range(locator.count()):
            el = locator.nth(i)
            try:
                if el.is_visible():
                    return el
            except Exception:
                continue
    except Exception:
        return None
    return None


def click_visible(locator, timeout=5000):
    """Click the first visible element matching `locator`."""
    el = first_visible(locator)
    if el is None:
        return False
    try:
        el.scroll_into_view_if_needed()
        el.click(timeout=timeout)
        return True
    except Exception as e:
        log(f"  click failed: {e}")
        return False


def main():
    print("=== admin-content-sync — Browser Verification ===\n")

    results = []

    def record(check, ok, detail=""):
        results.append((check, bool(ok), detail))
        flag = "PASS" if ok else "FAIL"
        log(f"[{flag}] {check} — {detail}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = browser.new_context(
            viewport={"width": 1366, "height": 900},
            locale="id-ID",
        )
        # Pre-seed localStorage so the PWA install prompt doesn't appear.
        ctx.add_init_script(
            "try {"
            "  localStorage.setItem('gomesin-pwa-dismissed', '1');"
            "  localStorage.setItem('gomesin-pwa-installed', '1');"
            "} catch(e) {}"
        )

        page = ctx.new_page()

        console_msgs = []
        page_errors = []

        def on_console(m):
            console_msgs.append(f"{m.type}: {m.text}")

        def on_pageerror(err):
            page_errors.append(str(err))

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)

        # ---------------------------------------------------------------
        # CHECK 1 — homepage loads cleanly
        # ---------------------------------------------------------------
        log("[Check 1] Loading homepage at http://localhost:3000/ ...")
        try:
            resp = page.goto(URL, wait_until="networkidle", timeout=30000)
            status = resp.status if resp else None
        except PWTimeout:
            status = None
        title = page.title()
        body_text = page.evaluate("document.body.innerText || ''")
        error_indicators = [
            "application error",
            "Something went wrong",
            "Application error",
            "Unhandled Runtime Error",
        ]
        has_error_boundary = any(s in body_text for s in error_indicators)
        blank_screen = len(body_text.strip()) < 200
        ok1 = status == 200 and not has_error_boundary and not blank_screen
        record(
            "Homepage loads cleanly (HTTP 200, no error boundary, not blank)",
            ok1,
            f"status={status} title={title!r} body_len={len(body_text)} "
            f"error_boundary={has_error_boundary}",
        )

        # Wait for app hydration + initial data fetch.
        time.sleep(2)

        # ---------------------------------------------------------------
        # CHECK 2 — PWA install prompt not blocking (pre-seeded)
        # ---------------------------------------------------------------
        pwa_dismissed = page.evaluate(
            "localStorage.getItem('gomesin-pwa-dismissed')"
        )
        pwa_installed = page.evaluate(
            "localStorage.getItem('gomesin-pwa-installed')"
        )
        pwa_dialog_count = page.locator(
            "[role='dialog']:has-text('Pasang')"
        ).count()
        ok2 = (
            pwa_dismissed == "1"
            and pwa_installed == "1"
            and pwa_dialog_count == 0
        )
        record(
            "PWA install prompt suppressed",
            ok2,
            f"pwa-dismissed={pwa_dismissed!r} pwa-installed={pwa_installed!r} "
            f"pwa_dialog_count={pwa_dialog_count}",
        )

        # ---------------------------------------------------------------
        # CHECK 3 — click the header login button + fill the form + submit
        # ---------------------------------------------------------------
        log("[Check 3] Clicking header login button ...")
        login_btns = page.locator('button[aria-label="Masuk atau Daftar"]')
        clicked = click_visible(login_btns)
        record("Click header 'Masuk atau Daftar' button", clicked)

        # Wait for login form to appear (input#l-email).
        try:
            page.locator('input#l-email').filter(visible=True).first.wait_for(
                state="visible", timeout=8000
            )
        except PWTimeout:
            log("  WARNING: login form input#l-email not visible within 8s")
        time.sleep(0.5)

        # If somehow on the "register" tab, switch to "Masuk".
        login_form_visible = (
            page.locator('input#l-email').filter(visible=True).count() > 0
        )
        if not login_form_visible:
            log("  Login form not visible — clicking 'Masuk' tab ...")
            try:
                masuk_tab = page.get_by_role("tab", name="Masuk")
                click_visible(masuk_tab, timeout=3000)
            except Exception:
                pass
            time.sleep(0.5)
            login_form_visible = (
                page.locator('input#l-email').filter(visible=True).count() > 0
            )
        record(
            "Login form visible (Masuk tab active)",
            login_form_visible,
            f"l-email visible count="
            f"{page.locator('input#l-email').filter(visible=True).count()}",
        )

        # Fill the email + password using the VISIBLE instance only.
        log("  Filling email + password ...")
        email_input = page.locator('input#l-email').filter(visible=True).first
        pass_input = page.locator('input#l-pass').filter(visible=True).first
        email_input.fill(ADMIN_EMAIL)
        pass_input.fill(ADMIN_PASSWORD)
        time.sleep(0.3)

        # Verify the email + password were typed correctly.
        typed_email = email_input.input_value()
        typed_pass = pass_input.input_value()
        record(
            "Filled email + password (visible form)",
            typed_email == ADMIN_EMAIL and typed_pass == ADMIN_PASSWORD,
            f"email={typed_email!r} pass_len={len(typed_pass)}",
        )

        # Click the visible submit button ("Masuk").
        log("  Clicking 'Masuk' submit button ...")
        # All visible submit buttons; pick the one whose text contains "Masuk".
        submit_btns = page.locator('button[type="submit"]')
        submitted = False
        for i in range(submit_btns.count()):
            b = submit_btns.nth(i)
            try:
                if not b.is_visible():
                    continue
                txt = (b.inner_text() or "").strip()
                if "Masuk" in txt:
                    b.scroll_into_view_if_needed()
                    b.click(timeout=5000)
                    submitted = True
                    break
            except Exception:
                continue
        record("Click visible 'Masuk' submit button", submitted)

        # Wait for the admin view to render — it has the
        # "Panel Administrator" heading + the "Kembali" button.
        log("  Waiting for admin view (Panel Administrator) to render ...")
        admin_view_loaded = False
        try:
            page.get_by_text("Panel Administrator", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=15000)
            admin_view_loaded = True
        except PWTimeout:
            log("  WARNING: admin view 'Panel Administrator' not visible within 15s")
        time.sleep(1)

        # Confirm the admin's name + email are rendered in the admin view
        # header (proves the user object is set in the store).
        body_text = page.evaluate("document.body.innerText || ''")
        admin_name_in_body = "Admin mesinKU" in body_text
        admin_email_in_body = ADMIN_EMAIL in body_text
        record(
            "Login succeeded (admin view loaded with user.name + user.email)",
            admin_view_loaded and admin_name_in_body and admin_email_in_body,
            f"admin_view_loaded={admin_view_loaded} "
            f"name_in_body={admin_name_in_body} "
            f"email_in_body={admin_email_in_body}",
        )

        # ---------------------------------------------------------------
        # CHECK 4 — admin view renders the synced banner + logo images
        # (admin.tsx:136-151)
        # ---------------------------------------------------------------
        log("[Check 4] Verifying admin view banner + logo images ...")
        banner_imgs = page.locator('img[alt="Banner"]')
        logo_imgs = page.locator('img[alt="Logo"]')
        banner_src = None
        logo_src = None
        for i in range(banner_imgs.count()):
            el = banner_imgs.nth(i)
            try:
                if el.is_visible():
                    src = el.get_attribute("src") or ""
                    if src.startswith("data:image"):
                        banner_src = src
                        break
            except Exception:
                continue
        for i in range(logo_imgs.count()):
            el = logo_imgs.nth(i)
            try:
                if el.is_visible():
                    src = el.get_attribute("src") or ""
                    if src.startswith("data:image"):
                        logo_src = src
                        break
            except Exception:
                continue
        banner_ok = bool(banner_src) and banner_src.startswith(
            "data:image/jpeg;base64,"
        )
        logo_ok = bool(logo_src) and logo_src.startswith("data:image/")
        record(
            "Admin view → Banner image is a base64 JPEG (not placeholder)",
            banner_ok,
            f"banner_src_prefix={banner_src[:48]!r}..."
            if banner_src
            else "banner_src=None",
        )
        record(
            "Admin view → Logo image is a base64 image (not placeholder)",
            logo_ok,
            f"logo_src_prefix={logo_src[:48]!r}..."
            if logo_src
            else "logo_src=None",
        )

        # ---------------------------------------------------------------
        # CHECK 5 — click "Kembali" → home → header shows avatar
        # ---------------------------------------------------------------
        log("[Check 5] Clicking 'Kembali' to return to home view ...")
        kembali_clicked = click_visible(
            page.locator('button[aria-label="Kembali"]')
        )
        record("Click 'Kembali' (admin → home)", kembali_clicked)
        time.sleep(2)

        # Header should now show the avatar button (with aria-label "Akun"
        # on desktop or "Akun Saya" on mobile) instead of "Masuk atau
        # Daftar". We accept either aria-label on desktop.
        akun_saya_visible_count = (
            page.locator('button[aria-label="Akun Saya"]')
            .filter(visible=True)
            .count()
        )
        akun_visible_count = (
            page.locator('button[aria-label="Akun"]')
            .filter(visible=True)
            .count()
        )
        masuk_btn_visible_count = (
            page.locator('button[aria-label="Masuk atau Daftar"]')
            .filter(visible=True)
            .count()
        )
        avatar_visible = (
            akun_saya_visible_count + akun_visible_count
        ) >= 1
        record(
            "Header switched to avatar (Akun/Akun Saya) — not 'Masuk atau Daftar'",
            avatar_visible and masuk_btn_visible_count == 0,
            f"akun_saya_visible={akun_saya_visible_count} "
            f"akun_visible={akun_visible_count} "
            f"masuk_btn_visible={masuk_btn_visible_count}",
        )

        # ---------------------------------------------------------------
        # CHECK 6 — click avatar → profile overview; verify phone
        # ---------------------------------------------------------------
        log("[Check 6] Clicking header avatar to open profile overview ...")
        akun_clicked = False
        # Try "Akun Saya" first (mobile aria-label), then "Akun" (desktop).
        for aria in ("Akun Saya", "Akun"):
            if click_visible(page.locator(f'button[aria-label="{aria}"]')):
                akun_clicked = True
                break
        record("Click avatar button (home → profile)", akun_clicked)
        # Wait for the orange greeting header ("Halo,") to appear.
        try:
            page.get_by_text("Halo,", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=8000)
        except PWTimeout:
            log("  WARNING: profile greeting not visible within 8s")
        time.sleep(1.5)

        # The profile overview shows the phone in the "Nomor Telepon"
        # contact card AND in the overview stats.
        body_text = page.evaluate("document.body.innerText || ''")
        phone_in_overview = EXPECTED_PHONE in body_text
        old_phone_in_overview = OLD_PLACEHOLDER_PHONE in body_text
        ok_phone = phone_in_overview and not old_phone_in_overview
        record(
            "Profile overview shows synced phone 085888082208 "
            "(NOT the old 0812-0000-0000 placeholder)",
            ok_phone,
            f"phone_in_body={phone_in_overview} "
            f"old_phone_in_body={old_phone_in_overview}",
        )

        # ---------------------------------------------------------------
        # CHECK 7 — navigate to "Pengaturan" panel; verify banner + logo
        # images and "No. HP" row.
        # ---------------------------------------------------------------
        log("[Check 7] Navigating to 'Pengaturan' panel ...")
        pengaturan_clicked = click_visible(
            page.locator('text=Pengaturan')
        )
        time.sleep(1.5)

        # Wait for "Banner & Logo Perusahaan" heading.
        try:
            page.get_by_text(
                "Banner & Logo Perusahaan", exact=False
            ).filter(visible=True).first.wait_for(
                state="visible", timeout=8000
            )
        except PWTimeout:
            log("  WARNING: 'Banner & Logo Perusahaan' heading not visible")

        # Inspect banner & logo <img> elements inside Pengaturan.
        banner_imgs = page.locator('img[alt="Banner"]')
        logo_imgs = page.locator('img[alt="Logo"]')
        pengaturan_banner_src = None
        pengaturan_logo_src = None
        for i in range(banner_imgs.count()):
            el = banner_imgs.nth(i)
            try:
                if el.is_visible():
                    src = el.get_attribute("src") or ""
                    if src.startswith("data:image"):
                        pengaturan_banner_src = src
                        break
            except Exception:
                continue
        for i in range(logo_imgs.count()):
            el = logo_imgs.nth(i)
            try:
                if el.is_visible():
                    src = el.get_attribute("src") or ""
                    if src.startswith("data:image"):
                        pengaturan_logo_src = src
                        break
            except Exception:
                continue
        pengaturan_banner_ok = bool(pengaturan_banner_src) and (
            pengaturan_banner_src.startswith("data:image/jpeg;base64,")
        )
        pengaturan_logo_ok = bool(pengaturan_logo_src) and (
            pengaturan_logo_src.startswith("data:image/")
        )
        record(
            "Pengaturan → Banner image is a base64 JPEG (not 'Belum ada banner')",
            pengaturan_banner_ok,
            f"banner_src_prefix={pengaturan_banner_src[:48]!r}..."
            if pengaturan_banner_src
            else "banner_src=None",
        )
        record(
            "Pengaturan → Logo image is a base64 image (not empty placeholder)",
            pengaturan_logo_ok,
            f"logo_src_prefix={pengaturan_logo_src[:48]!r}..."
            if pengaturan_logo_src
            else "logo_src=None",
        )

        # Check the "No. HP" row in the Profil sub-section.
        body_text = page.evaluate("document.body.innerText || ''")
        no_hp_row_has_phone = (
            "No. HP" in body_text and EXPECTED_PHONE in body_text
        )
        old_phone_still_present = OLD_PLACEHOLDER_PHONE in body_text
        record(
            "Pengaturan → 'No. HP' row shows synced phone 085888082208",
            no_hp_row_has_phone and not old_phone_still_present,
            f"no_hp+phone_in_body={no_hp_row_has_phone} "
            f"old_phone_still_present={old_phone_still_present}",
        )

        # Screenshot the profile / Pengaturan view.
        try:
            page.screenshot(
                path=str(SCREEN_DIR / "verify-admin-profile.png"),
                full_page=False,
            )
            log("  Screenshot saved: verify-admin-profile.png")
        except Exception as e:
            log(f"  Screenshot failed: {e}")

        # ---------------------------------------------------------------
        # CHECK 8 — navigate to "Iklan Saya" panel; verify 2 listings
        # ---------------------------------------------------------------
        log("[Check 8] Navigating to 'Iklan Saya' panel ...")
        iklan_clicked = click_visible(page.locator('text=Iklan Saya'))
        time.sleep(2.5)

        # Count visible <h3> elements within listing cards (each card has
        # exactly one <h3> with the listing title). Also collect the text
        # of those <h3> elements to assert both expected titles are present.
        h3_texts = page.evaluate(
            "() => Array.from(document.querySelectorAll('h3'))"
            ".map(h => (h.innerText || '').trim())"
            ".filter(t => t.length > 0)"
        )
        # Exact-match check (avoid "Tes" being a prefix of "Test Draft...").
        titles_found_exact = [
            t for t in EXPECTED_LISTING_TITLES if t in h3_texts
        ]
        body_text = page.evaluate("document.body.innerText || ''")
        empty_state = "Belum ada iklan" in body_text
        # Also fetch the count from the API (server-side ground truth) —
        # this is just a sanity cross-check, the UI assertion is above.
        ok_iklan = (
            iklan_clicked
            and not empty_state
            and len(titles_found_exact) == 2
        )
        record(
            "Iklan Saya panel shows 2 listings ('Tes' + 'Test Draft "
            "Invalid Cat')",
            ok_iklan,
            f"iklan_clicked={iklan_clicked} empty_state={empty_state} "
            f"titles_found_exact={titles_found_exact} "
            f"h3_count={len(h3_texts)}",
        )

        # Screenshot the listings view.
        try:
            page.screenshot(
                path=str(SCREEN_DIR / "verify-admin-listings.png"),
                full_page=False,
            )
            log("  Screenshot saved: verify-admin-listings.png")
        except Exception as e:
            log(f"  Screenshot failed: {e}")

        # ---------------------------------------------------------------
        # CHECK 9 — console errors / pageerror events
        # ---------------------------------------------------------------
        error_console = [m for m in console_msgs if m.startswith("error:")]
        relevant_console_errors = [
            m
            for m in error_console
            if "Failed to load resource" not in m
            and "net::ERR" not in m
        ]
        ok_console = (
            len(relevant_console_errors) == 0 and len(page_errors) == 0
        )
        record(
            "No browser console errors or pageerror events during the run",
            ok_console,
            f"console_errors={len(relevant_console_errors)} "
            f"page_errors={len(page_errors)}",
        )
        if relevant_console_errors:
            for m in relevant_console_errors[:10]:
                log(f"  console: {m}")
        if page_errors:
            for m in page_errors[:10]:
                log(f"  pageerror: {m}")

        browser.close()

    # ---------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------
    print("\n=== Summary ===")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    for check, ok, detail in results:
        flag = "PASS" if ok else "FAIL"
        print(f"  [{flag}] {check}")
        if not ok:
            print(f"        detail: {detail}")
    print(f"\n{passed}/{len(results)} checks passed, {failed} failed.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
