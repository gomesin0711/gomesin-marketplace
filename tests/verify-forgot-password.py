#!/usr/bin/env python3
"""
Browser verification script for the "Lupa Sandi" (Forgot Password) feature.

Steps:
 1. Navigate to http://localhost:3000/  (home page)            -> screenshot 01
 2. Click "Masuk" / "Masuk atau Daftar" button in header      -> screenshot 02 (login view)
 3. Click "Lupa sandi?" link                                   -> screenshot 03 (dialog step 1 - phone)
 4. Enter phone 0818666711, click "Kirim Kode OTP"            -> screenshot 04 (dialog step 2 - OTP + dev box)
 5. Read OTP from yellow dev box, type into OTP input         -> screenshot 05 (OTP filled)
 6. Click "Verifikasi"                                         -> screenshot 06 (dialog step 3 - Sandi Baru)
 7. Enter new password testpass123 in both fields             -> screenshot 07 (passwords filled)
 8. Click "Reset Sandi"                                       -> screenshot 08 (success / done step)
 9. Click "Kembali ke Masuk" to close dialog                  -> screenshot 09 (dialog closed)

Captures all console messages / errors / network failures along the way.

This script does NOT modify any code. It is a pure browser verification.
"""

import sys
import re
import time
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL = "http://localhost:3000/"
SCREEN_DIR = Path("/home/z/my-project/upload/forgot-password-verify")
SCREEN_DIR.mkdir(parents=True, exist_ok=True)

console_msgs = []
page_errors = []
failed_requests = []
api_responses = []


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(
            viewport={"width": 1366, "height": 900},
            locale="id-ID",
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        )
        # Suppress the PWA install popup by pre-seeding localStorage flags so
        # PwaInstallPrompt.canShow() returns false on first load.
        context.add_init_script(
            """
            try {
              localStorage.setItem('gomesin-pwa-dismissed', String(Date.now()));
              localStorage.setItem('gomesin-pwa-installed', '1');
            } catch (e) {}
            """
        )
        page = context.new_page()

        # ---- listeners ----
        def on_console(msg):
            console_msgs.append({"type": msg.type, "text": msg.text})

        def on_pageerror(err):
            page_errors.append({"name": err.name, "message": err.message, "stack": err.stack})

        def on_request_failed(req):
            failed_requests.append(
                {"url": req.url, "method": req.method, "failure": req.failure}
            )

        def on_response(resp):
            if "/api/auth/forgot-password" in resp.url:
                try:
                    body = resp.json()
                except Exception:
                    body = None
                api_responses.append(
                    {
                        "url": resp.url,
                        "status": resp.status,
                        "method": resp.request.method,
                        "body": body,
                    }
                )

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.on("requestfailed", on_request_failed)
        page.on("response", on_response)

        report = []

        def shot(name, label):
            path = SCREEN_DIR / name
            page.screenshot(path=str(path), full_page=False)
            report.append(f"  - {name}: {label}")
            print(f"[shot] {name} -> {label}")

        try:
            # ---------------------------------------------------------------
            # STEP 1 — Home page
            # ---------------------------------------------------------------
            print("\n=== STEP 1: navigate to home ===")
            page.goto(URL, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(1500)  # allow hydration / client store
            # Defensive: dismiss PWA popup if it still managed to show up
            try:
                pwa_later = page.locator('button:has-text("Nanti Saja")').first
                if pwa_later.is_visible(timeout=1500):
                    pwa_later.click()
                    page.wait_for_timeout(500)
                    print("  dismissed leftover PWA popup")
            except Exception:
                pass
            shot("01-home.png", "Home page (initial load)")

            # ---------------------------------------------------------------
            # STEP 2 — open login view
            # ---------------------------------------------------------------
            print("\n=== STEP 2: open login view ===")
            # Defensive: dismiss any popup right before clicking
            try:
                pwa_later = page.locator('button:has-text("Nanti Saja")').first
                if pwa_later.is_visible(timeout=800):
                    pwa_later.click()
                    page.wait_for_timeout(400)
            except Exception:
                pass
            login_btn = None
            # Try aria-label first (works on all viewports)
            for selector in [
                'button[aria-label="Masuk atau Daftar"]',
                'button[aria-label="Masuk"]',
                'button[aria-label="Akun"]',
                'header button:has-text("Masuk")',
                'button:has-text("Masuk")',
            ]:
                try:
                    el = page.locator(selector).first
                    if el.is_visible(timeout=2000):
                        login_btn = el
                        print(f"  found login button via: {selector}")
                        break
                except Exception:
                    continue
            if login_btn is None:
                # fallback: dump all buttons in header
                btns = page.locator("header button").all()
                print("  header buttons:")
                for b in btns:
                    try:
                        print(f"    - aria={b.get_attribute('aria-label')!r} text={b.inner_text()!r}")
                    except Exception:
                        pass
                raise RuntimeError("Could not find login button")
            login_btn.click()
            page.wait_for_timeout(1500)
            shot("02-login-view.png", "Login view (Masuk form)")

            # ---------------------------------------------------------------
            # STEP 3 — click "Lupa sandi?"
            # ---------------------------------------------------------------
            print("\n=== STEP 3: click 'Lupa sandi?' ===")
            # Two instances exist (mobile md:hidden + desktop hidden md:grid layouts).
            # Pick the visible one.
            fp_link = None
            for sel in [
                'button:has-text("Lupa sandi?")',
                'button:has-text("Forgot password?")',
            ]:
                locs = page.locator(sel)
                count = locs.count()
                print(f"  selector {sel!r} matched {count} elements")
                for i in range(count):
                    el = locs.nth(i)
                    try:
                        if el.is_visible(timeout=500):
                            fp_link = el
                            print(f"    -> using element #{i} (visible)")
                            break
                    except Exception:
                        continue
                if fp_link:
                    break
            if fp_link is None:
                raise RuntimeError("Could not find a visible 'Lupa sandi?' button")
            fp_link.scroll_into_view_if_needed()
            fp_link.click()
            page.wait_for_timeout(800)
            shot("03-forgot-dialog-step1-phone.png", "Forgot-password dialog STEP 1 — phone input")

            # Verify dialog open
            dialog = page.locator('[role="dialog"]').first
            dialog.wait_for(state="visible", timeout=5000)
            # check the step indicator
            step_indicators = page.locator('[role="dialog"] span').all_inner_texts()
            print(f"  step indicator texts: {step_indicators}")

            # Verify "Kirim Kode OTP" button visible
            send_btn = page.locator('button:has-text("Kirim Kode OTP")').first
            assert send_btn.is_visible(), "Kirim Kode OTP button not visible in step 1"

            # ---------------------------------------------------------------
            # STEP 4 — enter phone, send OTP
            # ---------------------------------------------------------------
            print("\n=== STEP 4: enter phone 0818666711 + send OTP ===")
            phone_input = page.locator('#fp-phone').first
            phone_input.wait_for(state="visible", timeout=5000)
            phone_input.fill("0818666711")
            page.wait_for_timeout(300)
            send_btn.click()

            # Wait for OTP step to appear (dev code box)
            dev_box = page.locator('div.border-amber-300, div:has-text("Mode dev")').first
            try:
                dev_box.wait_for(state="visible", timeout=10000)
            except PWTimeout:
                # Try a looser selector
                dev_box = page.get_by_text(re.compile(r"Mode dev|OTP code shown|dev mode", re.I)).first
                dev_box.wait_for(state="visible", timeout=5000)
            page.wait_for_timeout(800)
            shot("04-forgot-dialog-step2-otp.png", "Forgot-password dialog STEP 2 — OTP entry + dev code box")

            # Extract the OTP code (6 digits) from the amber box
            # The code is in a <p class="...text-2xl font-black tracking-widest...">
            otp_text = ""
            for sel in [
                'p.text-2xl',
                'div.border-amber-300 p.text-2xl',
                'div:has-text("Mode dev") p.text-2xl',
            ]:
                try:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=1500):
                        otp_text = el.inner_text().strip()
                        if re.fullmatch(r"\d{6}", otp_text):
                            break
                except Exception:
                    continue
            if not re.fullmatch(r"\d{6}", otp_text):
                # last resort: scan all text in dialog
                body = page.locator('[role="dialog"]').inner_text()
                m = re.search(r"\b(\d{6})\b", body)
                if m:
                    otp_text = m.group(1)
            print(f"  extracted OTP code: {otp_text!r}")
            assert re.fullmatch(r"\d{6}", otp_text), f"Could not extract 6-digit OTP, got {otp_text!r}"

            # ---------------------------------------------------------------
            # STEP 5 — type OTP into input-otp
            # ---------------------------------------------------------------
            print("\n=== STEP 5: type OTP into InputOTP ===")
            # Inspect the OTP input structure for debugging
            try:
                otp_html = page.locator('[data-slot="input-otp"]').first.evaluate(
                    "el => el.outerHTML.substring(0, 400)"
                )
                print(f"  OTP element outerHTML: {otp_html}")
            except Exception as e:
                print(f"  could not read OTP element: {e}")

            # input-otp renders a real <input> element. Try several strategies.
            otp_entered = False
            otp_strategies = [
                ('input[data-slot="input-otp"]', "fill"),
                ('input[autocomplete="one-time-code"]', "fill"),
                ('input[inputmode="numeric"]', "fill"),
                ('[data-slot="input-otp"] input', "fill"),
                ('input[data-slot="input-otp"]', "press_sequentially"),
                ('input[autocomplete="one-time-code"]', "press_sequentially"),
            ]
            for sel, method in otp_strategies:
                try:
                    el = page.locator(sel).first
                    if not el.is_visible(timeout=1000):
                        # try to scroll / force
                        try:
                            el.scroll_into_view_if_needed(timeout=1000)
                        except Exception:
                            pass
                    if method == "fill":
                        el.fill(otp_text, timeout=3000)
                    else:
                        el.click(timeout=2000)
                        el.press_sequentially(otp_text, delay=80, timeout=5000)
                    page.wait_for_timeout(500)
                    # Verify it took: check otp state via React? Just check slots have chars
                    slots = page.locator('[data-slot="input-otp-slot"]').all_inner_texts()
                    print(f"  strategy {sel}/{method}: slot texts = {slots}")
                    if any(s.strip() for s in slots):
                        otp_entered = True
                        print(f"  OTP entered via {sel}/{method}")
                        break
                except Exception as e:
                    print(f"  strategy {sel}/{method} failed: {e}")
                    continue

            if not otp_entered:
                # Last resort: dispatch events via evaluate
                print("  falling back to JS value-set + input event dispatch")
                page.evaluate(
                    """(code) => {
                        const inp = document.querySelector('input[data-slot="input-otp"]')
                                  || document.querySelector('input[autocomplete="one-time-code"]')
                                  || document.querySelector('[data-slot="input-otp"] input');
                        if (!inp) return 'no input';
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        setter.call(inp, code);
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                        return 'ok';
                    }""",
                    otp_text,
                )
                page.wait_for_timeout(500)
                slots = page.locator('[data-slot="input-otp-slot"]').all_inner_texts()
                print(f"  JS fallback slot texts: {slots}")

            shot("05-forgot-dialog-step2-otp-filled.png", f"OTP filled with {otp_text}")

            # Verify "Verifikasi" button is now enabled
            verify_btn = page.locator('button:has-text("Verifikasi")').first
            assert verify_btn.is_visible(), "Verifikasi button not visible"

            # ---------------------------------------------------------------
            # STEP 6 — click Verifikasi
            # ---------------------------------------------------------------
            print("\n=== STEP 6: click 'Verifikasi' ===")
            verify_btn.click()
            # Wait for step 3 — look for "Sandi Baru" reset button or new password label
            reset_btn = page.locator('button:has-text("Reset Sandi")').first
            try:
                reset_btn.wait_for(state="visible", timeout=10000)
            except PWTimeout:
                # Maybe language is EN
                reset_btn = page.locator('button:has-text("Reset Password")').first
                reset_btn.wait_for(state="visible", timeout=5000)
            page.wait_for_timeout(800)
            shot("06-forgot-dialog-step3-reset.png", "Forgot-password dialog STEP 3 — Sandi Baru (new password)")

            # ---------------------------------------------------------------
            # STEP 7 — enter new password
            # ---------------------------------------------------------------
            print("\n=== STEP 7: enter new password testpass123 ===")
            page.locator('#fp-pass').fill("testpass123")
            page.locator('#fp-pass2').fill("testpass123")
            page.wait_for_timeout(300)
            shot("07-forgot-dialog-step3-passwords-filled.png", "New passwords filled")

            # ---------------------------------------------------------------
            # STEP 8 — click Reset Sandi
            # ---------------------------------------------------------------
            print("\n=== STEP 8: click 'Reset Sandi' ===")
            reset_btn.click()
            # Wait for success state — "Kembali ke Masuk" button (done step)
            back_btn = page.locator('button:has-text("Kembali ke Masuk")').first
            try:
                back_btn.wait_for(state="visible", timeout=12000)
            except PWTimeout:
                back_btn = page.locator('button:has-text("Back to Login")').first
                back_btn.wait_for(state="visible", timeout=5000)
            page.wait_for_timeout(800)
            shot("08-forgot-dialog-step4-done.png", "Forgot-password dialog STEP 4 — success / done")

            # Check for CheckCircle2 icon presence (lucide renders svg.lucide-check-circle-2)
            try:
                check_icon = page.locator('svg[class*="check-circle"], svg[class*="circle-check"]').first
                has_check = check_icon.is_visible(timeout=2000)
                print(f"  CheckCircle2 success icon visible: {has_check}")
            except Exception as e:
                print(f"  CheckCircle2 success icon check error: {e}")

            # Stronger signal: in "done" step, the step indicator (1 — 2 — 3) is hidden.
            try:
                step_ind_visible = page.locator('[role="dialog"] span:has-text("1")').first.is_visible(timeout=500)
                print(f"  step indicator visible in done step (should be False): {step_ind_visible}")
            except Exception:
                print("  step indicator check skipped")

            # Strongest signal: the success message text in DialogDescription
            try:
                done_desc = page.locator('[role="dialog"] [data-slot="dialog-description"], [role="dialog"] p').all_inner_texts()
                print(f"  done-step texts in dialog: {done_desc}")
            except Exception:
                pass

            # ---------------------------------------------------------------
            # STEP 9 — close dialog
            # ---------------------------------------------------------------
            print("\n=== STEP 9: click 'Kembali ke Masuk' to close ===")
            back_btn.click()
            page.wait_for_timeout(1000)
            shot("09-dialog-closed.png", "Dialog closed — back to login view")

            # Confirm dialog is no longer visible
            try:
                dialog_gone = not page.locator('[role="dialog"]').first.is_visible(timeout=2000)
            except Exception:
                dialog_gone = True
            print(f"  dialog closed: {dialog_gone}")

            # ---------------------------------------------------------------
            # Final: bonus screenshot of the dev server OTP log line
            # ---------------------------------------------------------------
            shot("10-final-state.png", "Final state — login view after closing dialog")

        except Exception as e:
            print("\n!!! EXCEPTION during verification !!!")
            traceback.print_exc()
            try:
                page.screenshot(path=str(SCREEN_DIR / "ERROR.png"))
                print(f"  saved error screenshot -> ERROR.png")
            except Exception:
                pass
            raise
        finally:
            # ---- summary ----
            print("\n\n================ SUMMARY ================")
            print("Screenshots saved:")
            for line in report:
                print(line)

            print("\n--- API responses (/api/auth/forgot-password) ---")
            for r in api_responses:
                print(f"  [{r['method']}] {r['status']}  body={r['body']}")

            print("\n--- Console messages ---")
            for m in console_msgs:
                print(f"  [{m['type']}] {m['text']}")

            print("\n--- Page errors (JS exceptions) ---")
            if not page_errors:
                print("  (none)")
            for e in page_errors:
                print(f"  {e['name']}: {e['message']}")
                if e['stack']:
                    print(f"    stack: {e['stack'][:500]}")

            print("\n--- Failed network requests ---")
            if not failed_requests:
                print("  (none)")
            for r in failed_requests:
                print(f"  [{r['method']}] {r['url']}  failure={r['failure']}")

            browser.close()


if __name__ == "__main__":
    main()
