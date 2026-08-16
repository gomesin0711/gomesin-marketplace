#!/usr/bin/env python3
"""
Browser verification for Task ID: verify-admin-pengaturan-3.

FINAL end-to-end verification that the admin "Pengaturan" (Settings) tab SAVE
now works from the UI, after the auth fix:
  - PUT /api/admin/settings now accepts a `userId` in the body and verifies
    via DB lookup that the user has admin role (replaces the broken
    next-auth session-cookie check).
  - PengaturanTab now sends `user.id` in the save request body.

Steps covered (from the task description):
  1. Navigate to http://localhost:3000
  2. Login as admin (mesinKU0711@gmail.com / admin123)
  3. Open admin panel -> click "Pengaturan" in the sidebar
  4. Verify the tab renders with all 3 sections (Pembayaran, Kontak & Dukungan,
     Notifikasi Suara)
  5. Change the BCA account number to "1234567890"
  6. Click "Simpan Pengaturan"
  7. Verify success toast "Pengaturan berhasil disimpan" appears (green sonner)
  8. Refresh page, navigate back to Pengaturan
  9. Verify BCA account # persisted as "1234567890"
 10. Restore BCA # -> "8770338221" and save again
 11. Verify restore save also shows the success toast
 12. Take a screenshot showing Pengaturan tab + success toast
 13. Tail dev.log to confirm NO 401 / 500 on PUT /api/admin/settings
"""

import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL = "http://localhost:3000/"
SCREEN_DIR = Path("/home/z/my-project/tool-results")
SCREEN_DIR.mkdir(parents=True, exist_ok=True)

ADMIN_EMAIL = "mesinKU0711@gmail.com"
ADMIN_PASSWORD = "admin123"

# Original default value (also the value we restore to at the end).
EXPECTED_BCA_ACCOUNT = "8770338221"
# Test value we set during the save/persistence test.
TEST_BCA_ACCOUNT = "1234567890"

SUCCESS_TOAST_TEXT = "Pengaturan berhasil disimpan"
ERROR_TOAST_TEXT = "Gagal menyimpan pengaturan"


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
    print("=== verify-admin-pengaturan-3 — Final Browser Verification ===\n")

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
        network_puts = []  # track PUT /api/admin/settings responses

        def on_console(m):
            console_msgs.append(f"{m.type}: {m.text}")

        def on_pageerror(err):
            page_errors.append(str(err))

        def on_response(resp):
            try:
                if resp.request.method == "PUT" and "/api/admin/settings" in resp.url:
                    network_puts.append((resp.status, resp.url))
            except Exception:
                pass

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.on("response", on_response)

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
        # STEP 3 — Find + click Pengaturan sidebar entry
        # ---------------------------------------------------------------
        log("[Step 3] Looking for 'Pengaturan' sidebar entry ...")
        nav_texts = page.evaluate(
            "() => Array.from(document.querySelectorAll('aside nav button'))"
            ".map(b => (b.innerText || '').trim())"
        )
        log(f"  Sidebar nav items visible: {nav_texts}")
        pengaturan_in_sidebar = "Pengaturan" in nav_texts
        record(
            "Pengaturan entry exists in admin sidebar",
            pengaturan_in_sidebar,
            f"nav_items={nav_texts}",
        )

        pengaturan_clicked = False
        if pengaturan_in_sidebar:
            pengaturan_clicked = click_visible(
                page.locator('aside nav button', has_text="Pengaturan")
            )
            time.sleep(2)
        record("Clicked Pengaturan menu item", pengaturan_clicked)

        # ---------------------------------------------------------------
        # STEP 4 — Verify Pengaturan tab content (3 sections)
        # ---------------------------------------------------------------
        log("[Step 4] Verifying Pengaturan tab content ...")
        try:
            page.get_by_text("Pengaturan Situs", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=10000)
            heading_visible = True
        except PWTimeout:
            heading_visible = False
            log("  WARNING: 'Pengaturan Situs' heading not visible")
        record("Pengaturan tab heading visible ('Pengaturan Situs')", heading_visible)

        body_text = page.evaluate("document.body.innerText || ''")

        pembayaran_visible = (
            "Pembayaran" in body_text
            and "Nomor Rekening BCA" in body_text
            and "Nama Pemilik Rekening" in body_text
            and "Gambar QRIS" in body_text
        )
        record("Pembayaran section visible", pembayaran_visible)

        kontak_visible = (
            "Kontak & Dukungan" in body_text
            and "Nomor WhatsApp" in body_text
            and "Email Dukungan" in body_text
        )
        record("Kontak & Dukungan section visible", kontak_visible)

        notif_visible = (
            "Notifikasi Suara" in body_text
            and "Ringtone Chat" in body_text
            and "Ringtone Iklan Masuk" in body_text
            and "Aktifkan Suara Notifikasi" in body_text
        )
        record("Notifikasi Suara section visible", notif_visible)

        record(
            "All 3 sections render (Pembayaran, Kontak & Dukungan, Notifikasi Suara)",
            pembayaran_visible and kontak_visible and notif_visible,
        )

        bca_acc = page.locator('input#bcaAccount')
        bca_acc_value = bca_acc.input_value() if bca_acc.count() else None
        record(
            f"BCA account # initial value = {EXPECTED_BCA_ACCOUNT!r}",
            bca_acc_value == EXPECTED_BCA_ACCOUNT,
            f"actual={bca_acc_value!r}",
        )

        save_btn = page.locator('button', has_text="Simpan Pengaturan")
        record(
            "'Simpan Pengaturan' save button present",
            save_btn.count() > 0,
            f"save_btn_count={save_btn.count()}",
        )

        # ---------------------------------------------------------------
        # STEP 5/6/7 — Edit BCA # -> "1234567890", save, capture toast
        # ---------------------------------------------------------------
        log(f"[Step 5] Editing BCA account # -> {TEST_BCA_ACCOUNT!r} ...")
        try:
            bca_acc.scroll_into_view_if_needed()
            bca_acc.fill(TEST_BCA_ACCOUNT)
            time.sleep(0.4)
            edited_value = bca_acc.input_value()
            edit_ok = edited_value == TEST_BCA_ACCOUNT
        except Exception as e:
            edit_ok = False
            edited_value = None
            log(f"  Edit failed: {e}")
        record(
            f"Edited BCA account # field -> {TEST_BCA_ACCOUNT!r}",
            edit_ok,
            f"new_value={edited_value!r}",
        )

        log("[Step 6] Clicking 'Simpan Pengaturan' ...")
        save_clicked = False
        try:
            save_btn.last.scroll_into_view_if_needed()
            save_btn.last.click(timeout=5000)
            save_clicked = True
        except Exception as e:
            log(f"  Save click failed: {e}")
        record("Clicked Simpan Pengaturan button", save_clicked)

        # Poll for success toast (sonner default 4s duration) and grab a
        # screenshot the instant it appears.
        log("[Step 7] Watching for success toast ...")
        toast_seen = False
        toast_screenshot_taken = False
        toast_loc = page.get_by_text(SUCCESS_TOAST_TEXT, exact=False)
        err_loc = page.get_by_text(ERROR_TOAST_TEXT, exact=False)
        deadline = time.time() + 8
        while time.time() < deadline:
            try:
                if toast_loc.count() > 0 and toast_loc.first.is_visible():
                    toast_seen = True
                    # Snapshot immediately while the toast is on screen.
                    try:
                        page.screenshot(
                            path=str(SCREEN_DIR / "verify-admin-pengaturan-3-toast.png"),
                            full_page=False,
                        )
                        toast_screenshot_taken = True
                        log("  Toast screenshot captured.")
                    except Exception as e:
                        log(f"  Toast screenshot failed: {e}")
                    break
                if err_loc.count() > 0 and err_loc.first.is_visible():
                    log("  ERROR toast appeared instead of success!")
                    break
            except Exception:
                pass
            time.sleep(0.15)
        record(
            f"Success toast '{SUCCESS_TOAST_TEXT}' appeared",
            toast_seen,
        )
        record(
            "Toast screenshot captured",
            toast_screenshot_taken,
            f"path={SCREEN_DIR / 'verify-admin-pengaturan-3-toast.png'}",
        )

        # Also wait briefly + capture an "after-save" full-page screenshot.
        time.sleep(1)
        try:
            page.screenshot(
                path=str(SCREEN_DIR / "verify-admin-pengaturan-3-after-save.png"),
                full_page=False,
            )
        except Exception:
            pass

        # ---------------------------------------------------------------
        # STEP 8/9 — Refresh, verify persistence
        # ---------------------------------------------------------------
        log("[Step 8] Refreshing page and verifying persistence ...")
        page.reload(wait_until="domcontentloaded", timeout=30000)
        time.sleep(4)

        try:
            page.get_by_text("Panel Administrator", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=20000)
            admin_loaded_after = True
        except PWTimeout:
            admin_loaded_after = False
            log("  WARNING: admin view not visible after refresh")
        record("Admin view re-loaded after refresh", admin_loaded_after)

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
        # STEP 10/11 — Restore BCA # -> "8770338221", save again
        # ---------------------------------------------------------------
        log(f"[Step 10] Restoring BCA account # -> {EXPECTED_BCA_ACCOUNT!r} ...")
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

        log("[Step 11] Watching for restore success toast ...")
        restore_toast = False
        restore_toast_screenshot = False
        toast_loc2 = page.get_by_text(SUCCESS_TOAST_TEXT, exact=False)
        deadline2 = time.time() + 8
        while time.time() < deadline2:
            try:
                if toast_loc2.count() > 0 and toast_loc2.first.is_visible():
                    restore_toast = True
                    try:
                        page.screenshot(
                            path=str(SCREEN_DIR / "verify-admin-pengaturan-3-restore-toast.png"),
                            full_page=False,
                        )
                        restore_toast_screenshot = True
                    except Exception:
                        pass
                    break
            except Exception:
                pass
            time.sleep(0.15)
        record(
            "Success toast on restore save appeared",
            restore_toast,
        )
        record(
            "Restore toast screenshot captured",
            restore_toast_screenshot,
            f"path={SCREEN_DIR / 'verify-admin-pengaturan-3-restore-toast.png'}",
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

        # ---------------------------------------------------------------
        # STEP 12 — Full-page screenshot of Pengaturan tab
        # ---------------------------------------------------------------
        log("[Step 12] Capturing full-page screenshot of Pengaturan tab ...")
        try:
            page.screenshot(
                path=str(SCREEN_DIR / "verify-admin-pengaturan-3.png"),
                full_page=True,
            )
            log("  Screenshot saved: verify-admin-pengaturan-3.png")
        except Exception as e:
            log(f"  Screenshot failed: {e}")

        # ---------------------------------------------------------------
        # STEP 13 — Console errors + network PUT statuses
        # ---------------------------------------------------------------
        log("[Step 13] Checking browser console + PUT statuses ...")
        error_console = [m for m in console_msgs if m.startswith("error:")]
        relevant_console_errors = [
            m
            for m in error_console
            if "Failed to load resource" not in m
            and "net::ERR" not in m
        ]
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

        # Show the PUT /api/admin/settings statuses seen during the run.
        log(f"  PUT /api/admin/settings responses observed: {network_puts}")
        bad_puts = [s for (s, _) in network_puts if s != 200]
        record(
            "All PUT /api/admin/settings returned HTTP 200",
            len(network_puts) > 0 and len(bad_puts) == 0,
            f"statuses={[s for (s, _) in network_puts]} count={len(network_puts)}",
        )

        browser.close()

    # ---------------------------------------------------------------
    # Tail dev.log for PUT /api/admin/settings entries
    # ---------------------------------------------------------------
    print("\n--- dev.log: last PUT /api/admin/settings entries ---")
    try:
        out = subprocess.run(
            ["tail", "-n", "60", "/home/z/my-project/dev.log"],
            capture_output=True, text=True, timeout=5,
        )
        lines = out.stdout.splitlines()
        put_lines = [l for l in lines if "PUT /api/admin/settings" in l]
        if not put_lines:
            print("  (no PUT /api/admin/settings entries in last 60 lines)")
        for l in put_lines:
            print(f"  {l}")
        # Specifically flag any 401 / 500 on the PUT route.
        bad = [l for l in put_lines if " 401 " in l or " 500 " in l]
        record(
            "dev.log: NO 401 or 500 on PUT /api/admin/settings",
            len(bad) == 0,
            f"bad_lines={bad}",
        )
    except Exception as e:
        log(f"  tail dev.log failed: {e}")

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
