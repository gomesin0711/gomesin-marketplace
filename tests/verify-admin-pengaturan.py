#!/usr/bin/env python3
"""
Browser verification for Task ID: verify-admin-pengaturan.

Verifies the new "Pengaturan" (Settings) tab in the admin panel of the
mesinKU app running at http://localhost:3000.

Steps:
  1. Login as admin (mesinKU0711@gmail.com / admin123).
  2. Confirm the admin view loads (Panel Administrator heading visible).
  3. Look for the "Pengaturan" sidebar entry (Settings/gear icon).
     - If the sidebar has the entry: click it and continue.
     - If NOT: report the failure and dump the visible sidebar labels.
  4. Verify the Pengaturan tab renders with all 3 sections:
       - Pembayaran (BCA account #, BCA name, QRIS image preview)
       - Kontak & Dukungan (WhatsApp #, email)
       - Notifikasi Suara (Ringtone Chat + Tes Suara, Ringtone Iklan Masuk +
         Tes Suara, sound toggle switch)
       - "Simpan Pengaturan" save button at the bottom
  5. Verify QRIS image preview <img> loads (HTTP 200).
  6. Click one of the "Tes Suara" buttons — verify it doesn't throw a
     pageerror (audio may not actually play in headless mode).
  7. Edit the BCA account number field, click "Simpan Pengaturan",
     verify a success toast appears ("Pengaturan berhasil disimpan").
  8. Capture screenshots.
  9. Capture any browser console errors / pageerror events.
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
    print("=== verify-admin-pengaturan — Browser Verification ===\n")

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
        clicked = click_visible(login_btns)
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
        # Sidebar nav buttons
        sidebar_buttons = page.locator('aside nav button')
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
            time.sleep(1.5)
        else:
            # Fallback: try direct DOM click on any element with text "Pengaturan"
            log("  Pengaturan not in sidebar — trying direct text search ...")
            pengaturan_clicked = click_visible(page.locator('text=Pengaturan').first)
            time.sleep(1.5)
        record("Clicked Pengaturan menu item", pengaturan_clicked)

        # ---------------------------------------------------------------
        # STEP 4 — Verify Pengaturan tab content
        # ---------------------------------------------------------------
        log("[Step 4] Verifying Pengaturan tab content ...")

        # "Pengaturan Situs" heading
        try:
            page.get_by_text("Pengaturan Situs", exact=False).filter(
                visible=True
            ).first.wait_for(state="visible", timeout=8000)
            heading_visible = True
        except PWTimeout:
            heading_visible = False
            log("  WARNING: 'Pengaturan Situs' heading not visible")
        record("Pengaturan tab heading visible ('Pengaturan Situs')", heading_visible)

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

        # BCA inputs exist
        bca_acc = page.locator('input#bcaAccount')
        bca_name = page.locator('input#bcaName')
        record(
            "BCA account # + name inputs present",
            bca_acc.count() > 0 and bca_name.count() > 0,
            f"bcaAccount_count={bca_acc.count()} bcaName_count={bca_name.count()}",
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

        # Sound toggle switch (role="switch")
        toggle = page.locator('button[role="switch"]')
        record(
            "Sound toggle switch present (role=switch)",
            toggle.count() > 0,
            f"toggle_count={toggle.count()}",
        )

        # --- Simpan Pengaturan button ---
        save_btn = page.locator('button', has_text="Simpan Pengaturan")
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
        # Also do an HTTP fetch to verify the file is actually served.
        qris_http = None
        if qris_src:
            try:
                r = page.request.get(f"http://localhost:3000{qris_src.split('?')[0]}")
                qris_http = r.status
            except Exception as e:
                qris_http = f"err: {e}"
        record(
            "QRIS image preview loads (img + HTTP 200)",
            qris_count > 0 and qris_http == 200,
            f"qris_count={qris_count} src={qris_src!r} http={qris_http}",
        )

        # ---------------------------------------------------------------
        # Screenshot before interaction
        # ---------------------------------------------------------------
        try:
            page.screenshot(
                path=str(SCREEN_DIR / "verify-admin-pengaturan.png"),
                full_page=False,
            )
            log("  Screenshot saved: verify-admin-pengaturan.png")
        except Exception as e:
            log(f"  Screenshot failed: {e}")

        # ---------------------------------------------------------------
        # STEP 6 — Click one of the "Tes Suara" buttons (chat ringtone)
        # ---------------------------------------------------------------
        log("[Step 6] Clicking 'Tes Suara' (chat ringtone) ...")
        page_errors_before = len(page_errors)
        try:
            btn = tes_suara_btns.first
            btn.scroll_into_view_if_needed()
            btn.click(timeout=5000)
            time.sleep(1.5)
            tes_clicked = True
        except Exception as e:
            tes_clicked = False
            log(f"  Tes Suara click failed: {e}")
        new_page_errors = page_errors[page_errors_before:]
        record(
            "Clicked Tes Suara button (no new pageerror)",
            tes_clicked and len(new_page_errors) == 0,
            f"tes_clicked={tes_clicked} new_page_errors={new_page_errors}",
        )

        # ---------------------------------------------------------------
        # STEP 7 — Edit BCA account # + click Simpan Pengaturan
        # ---------------------------------------------------------------
        log("[Step 7] Editing BCA account # + saving ...")
        try:
            bca_acc.scroll_into_view_if_needed()
            # Read original value, then change it.
            original = bca_acc.input_value()
            new_val = original + "0" if original and original[-1] != "0" else (original or "8770338221") + "1"
            bca_acc.fill(new_val)
            time.sleep(0.4)
            edited_value = bca_acc.input_value()
            edit_ok = edited_value == new_val
            log(f"  Original: {original!r}  New: {edited_value!r}")
        except Exception as e:
            edit_ok = False
            edited_value = None
            log(f"  Edit failed: {e}")
        record("Edited BCA account # field", edit_ok, f"new_value={edited_value!r}")

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

        time.sleep(1)

        # Screenshot after save (toast may still be visible)
        try:
            page.screenshot(
                path=str(SCREEN_DIR / "verify-admin-pengaturan-after-save.png"),
                full_page=False,
            )
            log("  Screenshot saved: verify-admin-pengaturan-after-save.png")
        except Exception as e:
            log(f"  Screenshot failed: {e}")

        # ---------------------------------------------------------------
        # STEP 8 — console errors / pageerror events
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
