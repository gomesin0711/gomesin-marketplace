#!/usr/bin/env python3
"""
Browser verification for Task ID: verify-admin-pengaturan-2.

Confirms that the previously-missing wiring fixes for the admin "Pengaturan"
(Settings) tab now work end-to-end. Specifically:

  1. Login as admin (mesinKU0711@gmail.com / admin123).
  2. Confirm admin view loads (Panel Administrator heading visible).
  3. Find + click "Pengaturan" in admin sidebar (should be present with a
     Settings/gear icon, at the bottom of the menu list).
  4. Verify the Pengaturan tab renders with all 3 sections and the correct
     default field values:
       - Pembayaran: BCA # = "8770338221", BCA name = "Lina Listiawati",
         QRIS image preview (<img> loads HTTP 200)
       - Kontak & Dukungan: WhatsApp = "6285888082208",
         email = "mesinKU0711@gmail.com"
       - Notifikasi Suara: Ringtone Chat row + "Tes Suara" button,
         Ringtone Iklan Masuk row + "Tes Suara" button,
         sound toggle switch (ON by default)
       - "Batal" + "Simpan Pengaturan" buttons at the bottom
  5. Screenshot of full Pengaturan tab.
  6. Edit BCA account # -> "9999999999", click "Simpan Pengaturan", verify
     the success toast "Pengaturan berhasil disimpan" appears.
  7. Refresh page, navigate back to Pengaturan, verify BCA # persisted as
     "9999999999".
  8. Restore BCA # -> "8770338221", save again.
  9. Capture any browser console errors / pageerror events; tail dev.log
     at the end.
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

# Default values that should come back from /api/admin/settings
EXPECTED_BCA_ACCOUNT = "8770338221"
EXPECTED_BCA_NAME = "Lina Listiawati"
EXPECTED_WHATSAPP = "6285888082208"
EXPECTED_EMAIL = "mesinKU0711@gmail.com"

# Value we set during the save/persistence test
TEST_BCA_ACCOUNT = "9999999999"


def log(msg):
    print(msg, flush=True)


def first_visible(locator):
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
    print("=== verify-admin-pengaturan-2 — Browser Verification ===\n")

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
        # STEP 1 — Load homepage
        # ---------------------------------------------------------------
        log("[Step 1] Loading homepage ...")
        try:
            resp = page.goto(URL, wait_until="domcontentloaded", timeout=30000)
            status = resp.status if resp else None
        except PWTimeout:
            status = None
        record("Homepage loads (HTTP 200)", status == 200, f"status={status}")
        time.sleep(3)

        # ---------------------------------------------------------------
        # STEP 2 — Login as admin
        # ---------------------------------------------------------------
        log("[Step 2] Logging in as admin ...")
        login_btns = page.locator('button[aria-label="Masuk atau Daftar"]')
        click_visible(login_btns)
        try:
            page.locator('input#l-email').filter(visible=True).first.wait_for(
                state="visible", timeout=8000
            )
        except PWTimeout:
            log("  WARNING: login form not visible within 8s")
        time.sleep(0.5)

        # If somehow on the register tab, switch to Masuk.
        if page.locator('input#l-email').filter(visible=True).count() == 0:
            try:
                click_visible(page.get_by_role("tab", name="Masuk"), timeout=3000)
            except Exception:
                pass
            time.sleep(0.5)

        email_input = page.locator('input#l-email').filter(visible=True).first
        pass_input = page.locator('input#l-pass').filter(visible=True).first
        email_input.fill(ADMIN_EMAIL)
        pass_input.fill(ADMIN_PASSWORD)
        time.sleep(0.3)

        submitted = False
        for i in range(page.locator('button[type="submit"]').count()):
            b = page.locator('button[type="submit"]').nth(i)
            try:
                if not b.is_visible():
                    continue
                if "Masuk" in (b.inner_text() or "").strip():
                    b.scroll_into_view_if_needed()
                    b.click(timeout=5000)
                    submitted = True
                    break
            except Exception:
                continue
        record("Submitted login form", submitted)

        # Wait for admin view
        try:
            page.get_by_text("Panel Administrator", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=20000)
            admin_loaded = True
        except PWTimeout:
            admin_loaded = False
            log("  WARNING: admin view not visible within 20s")
        time.sleep(2)
        record("Admin view (Panel Administrator) loaded", admin_loaded)

        # ---------------------------------------------------------------
        # STEP 3 — Find Pengaturan sidebar entry
        # ---------------------------------------------------------------
        log("[Step 3] Looking for 'Pengaturan' sidebar entry ...")
        nav_texts = page.evaluate(
            "() => Array.from(document.querySelectorAll('aside nav button'))"
            ".map(b => (b.innerText || '').trim())"
        )
        log(f"  Sidebar nav items visible: {nav_texts}")

        pengaturan_in_sidebar = "Pengaturan" in nav_texts
        pengaturan_is_last = (
            len(nav_texts) > 0 and nav_texts[-1] == "Pengaturan"
        )
        record(
            "Pengaturan entry exists in admin sidebar",
            pengaturan_in_sidebar,
            f"nav_items={nav_texts}",
        )
        record(
            "Pengaturan is at bottom (last) of sidebar menu list",
            pengaturan_is_last,
            f"last_item={nav_texts[-1] if nav_texts else None!r}",
        )

        # Verify the Settings/gear icon (svg) inside the Pengaturan button
        # We just check that the button has an svg child (icon).
        pengaturan_btn = page.locator('aside nav button', has_text="Pengaturan").first
        has_icon = False
        if pengaturan_btn.count() > 0:
            try:
                has_icon = pengaturan_btn.locator('svg').count() > 0
            except Exception:
                has_icon = False
        record(
            "Pengaturan sidebar item has an icon (Settings/gear)",
            has_icon,
            f"svg_count={pengaturan_btn.locator('svg').count() if pengaturan_btn.count() else 0}",
        )

        pengaturan_clicked = False
        if pengaturan_in_sidebar:
            pengaturan_clicked = click_visible(
                page.locator('aside nav button', has_text="Pengaturan")
            )
            time.sleep(2)
        else:
            log("  Pengaturan not in sidebar — skipping click")
        record("Clicked Pengaturan menu item", pengaturan_clicked)

        # ---------------------------------------------------------------
        # STEP 4 — Verify Pengaturan tab content + default values
        # ---------------------------------------------------------------
        log("[Step 4] Verifying Pengaturan tab content ...")

        # "Pengaturan Situs" heading
        try:
            page.get_by_text("Pengaturan Situs", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=10000)
            heading_visible = True
        except PWTimeout:
            heading_visible = False
            log("  WARNING: 'Pengaturan Situs' heading not visible")
        record("Pengaturan tab heading visible ('Pengaturan Situs')", heading_visible)

        # Verify a Settings/gear icon is next to the heading
        heading_has_icon = False
        try:
            # Look for any heading element containing "Pengaturan Situs" with a sibling/child svg
            heading_locator = page.locator(':text("Pengaturan Situs")').first
            parent = heading_locator.locator('xpath=ancestor::*[self::h1 or self::h2 or self::h3 or self::div][1]')
            heading_has_icon = parent.locator('svg').count() > 0
        except Exception:
            heading_has_icon = False
        record(
            "Pengaturan Situs heading has a Settings icon",
            heading_has_icon,
        )

        body_text = page.evaluate("document.body.innerText || ''")

        # --- Pembayaran section ---
        pembayaran_visible = (
            "Pembayaran" in body_text
            and "Nomor Rekening BCA" in body_text
            and "Nama Pemilik Rekening" in body_text
            and "Gambar QRIS" in body_text
        )
        record(
            "Pembayaran section visible (BCA #, BCA name, QRIS preview label)",
            pembayaran_visible,
        )

        bca_acc = page.locator('input#bcaAccount')
        bca_name = page.locator('input#bcaName')
        record(
            "BCA account # + name inputs present",
            bca_acc.count() > 0 and bca_name.count() > 0,
            f"bcaAccount_count={bca_acc.count()} bcaName_count={bca_name.count()}",
        )

        # Check default values
        bca_acc_value = bca_acc.input_value() if bca_acc.count() else None
        bca_name_value = bca_name.input_value() if bca_name.count() else None
        record(
            f"BCA account # default = {EXPECTED_BCA_ACCOUNT!r}",
            bca_acc_value == EXPECTED_BCA_ACCOUNT,
            f"actual={bca_acc_value!r}",
        )
        record(
            f"BCA name default = {EXPECTED_BCA_NAME!r}",
            bca_name_value == EXPECTED_BCA_NAME,
            f"actual={bca_name_value!r}",
        )

        # --- Kontak & Dukungan section ---
        kontak_visible = (
            "Kontak & Dukungan" in body_text
            and "Nomor WhatsApp" in body_text
            and "Email Dukungan" in body_text
        )
        record(
            "Kontak & Dukungan section visible (WhatsApp + email)",
            kontak_visible,
        )
        wa_input = page.locator('input#whatsappNumber')
        email_input2 = page.locator('input#supportEmail')
        record(
            "WhatsApp + support email inputs present",
            wa_input.count() > 0 and email_input2.count() > 0,
            f"wa_count={wa_input.count()} email_count={email_input2.count()}",
        )

        wa_value = wa_input.input_value() if wa_input.count() else None
        email_value = email_input2.input_value() if email_input2.count() else None
        record(
            f"WhatsApp # default = {EXPECTED_WHATSAPP!r}",
            wa_value == EXPECTED_WHATSAPP,
            f"actual={wa_value!r}",
        )
        record(
            f"Support email default = {EXPECTED_EMAIL!r}",
            email_value == EXPECTED_EMAIL,
            f"actual={email_value!r}",
        )

        # --- Notifikasi Suara section ---
        notif_visible = (
            "Notifikasi Suara" in body_text
            and "Ringtone Chat" in body_text
            and "Ringtone Iklan Masuk" in body_text
            and "Aktifkan Suara Notifikasi" in body_text
        )
        record(
            "Notifikasi Suara section visible (Chat ringtone, Iklan ringtone, toggle)",
            notif_visible,
        )

        # Tes Suara buttons (should be exactly 2)
        tes_suara_btns = page.locator('button', has_text="Tes Suara")
        tes_count = tes_suara_btns.count()
        record(
            "Two 'Tes Suara' buttons present (chat + listing)",
            tes_count >= 2,
            f"tes_suara_count={tes_count}",
        )

        # Sound toggle switch (role="switch") — should be ON by default
        toggle = page.locator('button[role="switch"]').first
        toggle_count = page.locator('button[role="switch"]').count()
        toggle_on = False
        if toggle_count > 0:
            try:
                aria_checked = toggle.get_attribute("aria-checked")
                data_state = toggle.get_attribute("data-state")
                # Common patterns: aria-checked="true" or data-state="checked"
                toggle_on = (
                    aria_checked == "true" or data_state == "checked" or data_state == "on"
                )
            except Exception:
                toggle_on = False
        record(
            "Sound toggle switch present (role=switch)",
            toggle_count > 0,
            f"toggle_count={toggle_count}",
        )
        record(
            "Sound toggle switch is ON by default",
            toggle_on,
            f"aria_checked={toggle.get_attribute('aria-checked') if toggle_count else None!r} "
            f"data_state={toggle.get_attribute('data-state') if toggle_count else None!r}",
        )

        # --- Batal + Simpan Pengaturan buttons ---
        batal_btn = page.locator('button', has_text="Batal")
        save_btn = page.locator('button', has_text="Simpan Pengaturan")
        record(
            "'Batal' button present",
            batal_btn.count() > 0,
            f"batal_count={batal_btn.count()}",
        )
        record(
            "'Simpan Pengaturan' save button present",
            save_btn.count() > 0,
            f"save_btn_count={save_btn.count()}",
        )

        # ---------------------------------------------------------------
        # STEP 5 — Verify QRIS image preview loads (HTTP 200)
        # ---------------------------------------------------------------
        log("[Step 5] Verifying QRIS image preview loads ...")
        qris_imgs = page.locator('img[alt="QRIS mesinKU"]')
        qris_count = qris_imgs.count()
        qris_src = qris_imgs.first.get_attribute("src") if qris_count else None
        qris_http = None
        qris_size_attr = None
        if qris_count:
            try:
                # Check the rendered box size — should be a small thumbnail (not the full image)
                box = qris_imgs.first.bounding_box()
                if box:
                    qris_size_attr = f"{int(box['width'])}x{int(box['height'])}"
            except Exception:
                qris_size_attr = None
        if qris_src:
            try:
                r = page.request.get(f"http://localhost:3000{qris_src.split('?')[0]}")
                qris_http = r.status
            except Exception as e:
                qris_http = f"err: {e}"
        record(
            "QRIS image preview loads (img + HTTP 200)",
            qris_count > 0 and qris_http == 200,
            f"qris_count={qris_count} src={qris_src!r} http={qris_http} rendered_size={qris_size_attr}",
        )

        # ---------------------------------------------------------------
        # STEP 6 — Screenshot of full Pengaturan tab
        # ---------------------------------------------------------------
        log("[Step 6] Capturing full-page screenshot ...")
        try:
            page.screenshot(
                path=str(SCREEN_DIR / "verify-admin-pengaturan-2.png"),
                full_page=True,
            )
            log("  Screenshot saved: verify-admin-pengaturan-2.png")
        except Exception as e:
            log(f"  Screenshot failed: {e}")
        record(
            "Full-page screenshot saved",
            (SCREEN_DIR / "verify-admin-pengaturan-2.png").exists(),
            f"path={SCREEN_DIR / 'verify-admin-pengaturan-2.png'}",
        )

        # ---------------------------------------------------------------
        # STEP 7 — Edit BCA account # -> TEST_BCA_ACCOUNT + save
        # ---------------------------------------------------------------
        log(f"[Step 7] Editing BCA account # -> {TEST_BCA_ACCOUNT!r} and saving ...")
        try:
            bca_acc.scroll_into_view_if_needed()
            bca_acc.fill(TEST_BCA_ACCOUNT)
            time.sleep(0.4)
            edited_value = bca_acc.input_value()
            edit_ok = edited_value == TEST_BCA_ACCOUNT
            log(f"  New BCA account #: {edited_value!r}")
        except Exception as e:
            edit_ok = False
            edited_value = None
            log(f"  Edit failed: {e}")
        record(
            f"Edited BCA account # field -> {TEST_BCA_ACCOUNT!r}",
            edit_ok,
            f"new_value={edited_value!r}",
        )

        # Click Simpan Pengaturan
        save_clicked = False
        try:
            save_btn.last.scroll_into_view_if_needed()
            save_btn.last.click(timeout=5000)
            save_clicked = True
        except Exception as e:
            log(f"  Save click failed: {e}")
        record("Clicked Simpan Pengaturan button", save_clicked)

        # Wait for success toast ("Pengaturan berhasil disimpan")
        toast_seen = False
        try:
            page.get_by_text("Pengaturan berhasil disimpan", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=10000)
            toast_seen = True
        except PWTimeout:
            log("  WARNING: success toast not visible within 10s")
        record(
            "Success toast 'Pengaturan berhasil disimpan' appeared",
            toast_seen,
        )

        # Also check for an error toast (should NOT appear)
        error_toast = False
        try:
            err_loc = page.get_by_text("Gagal menyimpan pengaturan", exact=False).filter(visible=True)
            error_toast = err_loc.count() > 0
        except Exception:
            error_toast = False
        record(
            "No error toast 'Gagal menyimpan pengaturan' appeared",
            not error_toast,
            f"error_toast_visible={error_toast}",
        )

        # Screenshot after save
        try:
            page.screenshot(
                path=str(SCREEN_DIR / "verify-admin-pengaturan-2-after-save.png"),
                full_page=False,
            )
            log("  Screenshot saved: verify-admin-pengaturan-2-after-save.png")
        except Exception as e:
            log(f"  Screenshot failed: {e}")

        time.sleep(1)

        # ---------------------------------------------------------------
        # STEP 8 — Refresh + verify persistence
        # ---------------------------------------------------------------
        log("[Step 8] Refreshing page and verifying persistence ...")
        page.reload(wait_until="domcontentloaded", timeout=30000)
        time.sleep(4)

        # Wait for admin view again
        try:
            page.get_by_text("Panel Administrator", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=20000)
            admin_loaded_after = True
        except PWTimeout:
            admin_loaded_after = False
            log("  WARNING: admin view not visible after refresh")
        record("Admin view re-loaded after refresh", admin_loaded_after)

        # Re-open Pengaturan tab
        nav_texts2 = page.evaluate(
            "() => Array.from(document.querySelectorAll('aside nav button'))"
            ".map(b => (b.innerText || '').trim())"
        )
        pengaturan_in_sidebar2 = "Pengaturan" in nav_texts2
        if pengaturan_in_sidebar2:
            click_visible(page.locator('aside nav button', has_text="Pengaturan"))
            time.sleep(2)

        try:
            page.get_by_text("Pengaturan Situs", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=10000)
            pengaturan_reloaded = True
        except PWTimeout:
            pengaturan_reloaded = False
            log("  WARNING: 'Pengaturan Situs' heading not visible after refresh")
        record("Pengaturan tab re-opened after refresh", pengaturan_reloaded)

        bca_acc2 = page.locator('input#bcaAccount')
        bca_value_after = bca_acc2.input_value() if bca_acc2.count() else None
        record(
            f"BCA account # persisted as {TEST_BCA_ACCOUNT!r} after refresh",
            bca_value_after == TEST_BCA_ACCOUNT,
            f"actual_after_refresh={bca_value_after!r}",
        )

        # ---------------------------------------------------------------
        # STEP 9 — Restore original BCA account # + save again
        # ---------------------------------------------------------------
        log(f"[Step 9] Restoring BCA account # -> {EXPECTED_BCA_ACCOUNT!r} ...")
        try:
            bca_acc2.scroll_into_view_if_needed()
            bca_acc2.fill(EXPECTED_BCA_ACCOUNT)
            time.sleep(0.4)
            restored_value = bca_acc2.input_value()
            restore_ok = restored_value == EXPECTED_BCA_ACCOUNT
        except Exception as e:
            restore_ok = False
            restored_value = None
            log(f"  Restore fill failed: {e}")
        record(
            f"Restored BCA account # field -> {EXPECTED_BCA_ACCOUNT!r}",
            restore_ok,
            f"new_value={restored_value!r}",
        )

        save_btn2 = page.locator('button', has_text="Simpan Pengaturan")
        restore_save_clicked = False
        try:
            save_btn2.last.scroll_into_view_if_needed()
            save_btn2.last.click(timeout=5000)
            restore_save_clicked = True
        except Exception as e:
            log(f"  Restore save click failed: {e}")
        record("Clicked Simpan Pengaturan (restore) button", restore_save_clicked)

        restore_toast = False
        try:
            page.get_by_text("Pengaturan berhasil disimpan", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=10000)
            restore_toast = True
        except PWTimeout:
            log("  WARNING: restore success toast not visible within 10s")
        record(
            "Success toast on restore save appeared",
            restore_toast,
        )

        # Final verify via API to confirm DB state
        try:
            r = page.request.get("http://localhost:3000/api/admin/settings")
            api_data = r.json()
            api_bca = api_data.get("bcaAccount")
        except Exception as e:
            api_bca = f"err: {e}"
        record(
            f"Final /api/admin/settings returns bcaAccount={EXPECTED_BCA_ACCOUNT!r}",
            api_bca == EXPECTED_BCA_ACCOUNT,
            f"actual={api_bca!r}",
        )

        time.sleep(1)

        # ---------------------------------------------------------------
        # STEP 10 — console errors / pageerror events
        # ---------------------------------------------------------------
        log("[Step 10] Checking browser console errors ...")
        error_console = [m for m in console_msgs if m.startswith("error:")]
        relevant_console_errors = [
            m
            for m in error_console
            if "Failed to load resource" not in m
            and "net::ERR" not in m
        ]
        # WebSocket connection failures to chat-service are pre-existing and unrelated
        ws_errors = [
            m for m in console_msgs
            if "websocket" in m.lower() or "XTransformPort=3003" in m or "ws://localhost:3000" in m
        ]
        ok_console = (
            len(relevant_console_errors) == 0 and len(page_errors) == 0
        )
        record(
            "No relevant browser console errors or pageerror events",
            ok_console,
            f"console_errors={len(relevant_console_errors)} "
            f"page_errors={len(page_errors)} "
            f"ws_preexisting={len(ws_errors)}",
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
