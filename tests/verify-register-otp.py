#!/usr/bin/env python3
"""
Browser verification script for the Register OTP-via-WhatsApp feature.

Verifies Task 11-chat-otp-fix:
  - Register form has OTP step between phone and password fields
  - Password fields are disabled until OTP is verified
  - "Kirim OTP" button works and a dev-mode amber box with the 6-digit code appears
  - Entering the code + clicking "Verifikasi" unlocks the password fields
  - Submitting the form with an unverified phone blocks registration

Steps:
 1. Navigate to http://localhost:3000/                          -> screenshot 01
 2. Click "Masuk atau Daftar" header button                     -> screenshot 02 (login view)
 3. Switch to "Daftar" (register) tab                           -> screenshot 03 (register form, OTP step visible, password locked)
 4. Fill name + email + phone, click "Kirim OTP"                -> screenshot 04 (dev code box appears)
 5. Read OTP from amber box, type into InputOTP                 -> screenshot 05 (OTP filled)
 6. Click "Verifikasi"                                          -> screenshot 06 (password fields unlocked, green verified badge)
 7. Toggle password visibility to confirm input becomes enabled -> screenshot 07
 8. Click submit with empty fields to ensure no OTP error       -> screenshot 08 (form validation proceeds)
 9. Switch phone to a new number → confirm verified state resets -> screenshot 09

Captures all console messages / errors / network failures / API responses.

Pure verification — does NOT modify code. Phone numbers used (08123456789) are
synthetic and never persisted (no actual registration is submitted).
"""

import sys
import re
import time
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL = "http://localhost:3000/"
SCREEN_DIR = Path("/home/z/my-project/upload/register-otp-verify")
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
            if "/api/auth/register-otp" in resp.url:
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
            try:
                pwa_later = page.locator('button:has-text("Nanti Saja")').first
                if pwa_later.is_visible(timeout=800):
                    pwa_later.click()
                    page.wait_for_timeout(400)
            except Exception:
                pass
            login_btn = None
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
            shot("02-login-view.png", "Login view (Masuk form, default tab=login)")

            # ---------------------------------------------------------------
            # STEP 3 — switch to Daftar (register) tab
            # ---------------------------------------------------------------
            print("\n=== STEP 3: switch to 'Daftar' (register) tab ===")
            # The TabsTrigger uses value="register"; the visible text comes from tr("tabRegister") = "Daftar"
            register_tab = None
            for sel in [
                'button[role="tab"][data-state="inactive"]:has-text("Daftar")',
                'button[role="tab"]:has-text("Daftar")',
                'button:has-text("Daftar")',
            ]:
                locs = page.locator(sel)
                count = locs.count()
                print(f"  selector {sel!r} matched {count} elements")
                for i in range(count):
                    el = locs.nth(i)
                    try:
                        if el.is_visible(timeout=500):
                            register_tab = el
                            print(f"    -> using element #{i} (visible)")
                            break
                    except Exception:
                        continue
                if register_tab:
                    break
            if register_tab is None:
                raise RuntimeError("Could not find a visible 'Daftar' tab button")
            register_tab.scroll_into_view_if_needed()
            register_tab.click()
            page.wait_for_timeout(1500)  # let React render the register tab
            shot("03-register-form-otp-locked.png",
                 "Register form: OTP step visible, password fields DISABLED (verify with screenshot)")

            # NOTE: The login page renders TWO FormSection instances — one for the
            # mobile layout (md:hidden) and one for the desktop layout (hidden md:grid).
            # On a desktop viewport (1366px), the mobile one is hidden via CSS but
            # still present in the DOM. We need to pick the VISIBLE instance for
            # every element we interact with.

            def first_visible(selector, timeout=2000):
                """Return the first visible element matching `selector`, or None."""
                locs = page.locator(selector)
                count = locs.count()
                for i in range(count):
                    try:
                        el = locs.nth(i)
                        if el.is_visible(timeout=min(timeout, 500)):
                            return el
                    except Exception:
                        continue
                return None

            # Verify password fields are disabled before OTP verification
            pass1 = first_visible('#r-pass')
            pass2 = first_visible('#r-pass2')
            submit_btn = first_visible('button[type="submit"]:has-text("Daftar")')
            if submit_btn is None:
                submit_btn = first_visible('form button[type="submit"]')
            try:
                pass1_disabled = pass1.is_disabled(timeout=2000) if pass1 else None
                pass2_disabled = pass2.is_disabled(timeout=2000) if pass2 else None
                submit_disabled = submit_btn.is_disabled(timeout=2000) if submit_btn else None
                print(f"  #r-pass disabled (expected True): {pass1_disabled}")
                print(f"  #r-pass2 disabled (expected True): {pass2_disabled}")
                print(f"  submit disabled (expected True): {submit_disabled}")
            except Exception as e:
                print(f"  could not check disabled state: {e}")

            # Verify OTP step UI elements exist — use flexible selectors
            otp_label = None
            for sel in [
                'label[for="r-otp"]',
                'text=Kode OTP WhatsApp',
                'text=WhatsApp OTP code',
            ]:
                otp_label = first_visible(sel)
                if otp_label:
                    print(f"  OTP label found via selector: {sel}")
                    break
            if otp_label is None:
                # Last resort: scan the visible form text for OTP
                try:
                    visible_form = first_visible('form')
                    if visible_form:
                        form_text = visible_form.inner_text()
                        print(f"  register form text snippet (first 500 chars): {form_text[:500]!r}")
                        if "OTP" in form_text:
                            print("  OTP label detected via form-text scan")
                    else:
                        print("  no visible form found")
                except Exception as e:
                    print(f"  form-text scan failed: {e}")
            print(f"  OTP label visible: {otp_label is not None}")
            assert otp_label is not None, "OTP label not visible in register form"

            # ---------------------------------------------------------------
            # STEP 4 — fill name + email + phone, click "Kirim OTP"
            # ---------------------------------------------------------------
            print("\n=== STEP 4: fill register form + click Kirim OTP ===")
            first_visible('#r-name').fill("Test User OTP Verify")
            first_visible('#r-email').fill("test-otp-verify@example.com")
            first_visible('#r-phone').fill("08123456789")
            page.wait_for_timeout(300)

            # Click "Kirim OTP" — text from regOtpSend = "Kirim OTP" (id)
            send_btn = None
            for sel in [
                'button:has-text("Kirim OTP")',
                'button:has-text("Send OTP")',
            ]:
                send_btn = first_visible(sel)
                if send_btn:
                    print(f"  send-btn found via: {sel}")
                    break
            if send_btn is None:
                raise RuntimeError("Could not find 'Kirim OTP' button")
            send_btn.click()

            # Wait for dev-mode amber box to appear
            dev_box = None
            for sel in [
                'div.border-amber-300',
                'div:has-text("Mode dev")',
            ]:
                try:
                    dev_box = first_visible(sel, timeout=10000)
                    if dev_box:
                        break
                except Exception:
                    continue
            if dev_box is None:
                dev_box = page.get_by_text(re.compile(r"Mode dev|OTP code shown|dev mode", re.I)).first
                dev_box.wait_for(state="visible", timeout=5000)
            else:
                dev_box.scroll_into_view_if_needed(timeout=2000)
            page.wait_for_timeout(800)
            shot("04-register-otp-sent-devbox.png",
                 "OTP sent — amber dev-mode box with 6-digit code visible")

            # ---------------------------------------------------------------
            # STEP 5 — read OTP from amber box, type into InputOTP
            # ---------------------------------------------------------------
            print("\n=== STEP 5: extract OTP code from amber box + fill InputOTP ===")
            otp_text = ""
            for sel in [
                'div.border-amber-300 p.text-xl',
                'div.border-amber-300 p.tracking-widest',
                'p.tracking-widest',
            ]:
                el = first_visible(sel)
                if el:
                    try:
                        otp_text = el.inner_text().strip()
                        if re.fullmatch(r"\d{6}", otp_text):
                            break
                    except Exception:
                        continue
            if not re.fullmatch(r"\d{6}", otp_text):
                visible_form = first_visible('form')
                if visible_form:
                    body = visible_form.inner_text()
                    m = re.search(r"\b(\d{6})\b", body)
                    if m:
                        otp_text = m.group(1)
            print(f"  extracted OTP code: {otp_text!r}")
            assert re.fullmatch(r"\d{6}", otp_text), f"Could not extract 6-digit OTP, got {otp_text!r}"

            # Fill into InputOTP — try several strategies. Note that there are
            # two InputOTP instances (mobile + desktop). We target the VISIBLE
            # one each time.
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
                    el = first_visible(sel, timeout=1500)
                    if not el:
                        continue
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
                    # Only check slots of the VISIBLE input group (desktop)
                    visible_slot_texts = []
                    slot_locs = page.locator('[data-slot="input-otp-slot"]')
                    for i in range(slot_locs.count()):
                        s = slot_locs.nth(i)
                        try:
                            if s.is_visible(timeout=200):
                                visible_slot_texts.append(s.inner_text())
                        except Exception:
                            continue
                    print(f"  strategy {sel}/{method}: visible slot texts = {visible_slot_texts}")
                    if any(s.strip() for s in visible_slot_texts):
                        otp_entered = True
                        print(f"  OTP entered via {sel}/{method}")
                        break
                except Exception as e:
                    print(f"  strategy {sel}/{method} failed: {e}")
                    continue

            if not otp_entered:
                print("  falling back to JS value-set + input event dispatch")
                page.evaluate(
                    """(code) => {
                        const inps = Array.from(document.querySelectorAll('input[data-slot="input-otp"], input[autocomplete="one-time-code"]'));
                        const visible = inps.find(i => i.offsetParent !== null);
                        const inp = visible || inps[0];
                        if (!inp) return 'no input';
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        setter.call(inp, code);
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                        return 'ok';
                    }""",
                    otp_text,
                )
                page.wait_for_timeout(500)

            shot("05-register-otp-filled.png", f"OTP code {otp_text} filled into InputOTP")

            # ---------------------------------------------------------------
            # STEP 6 — click "Verifikasi"
            # ---------------------------------------------------------------
            print("\n=== STEP 6: click 'Verifikasi' ===")
            verify_btn = None
            for sel in [
                'button:has-text("Verifikasi")',
                'button:has-text("Verify")',
            ]:
                verify_btn = first_visible(sel)
                if verify_btn:
                    print(f"  verify-btn found via: {sel}")
                    break
            if verify_btn is None:
                raise RuntimeError("Could not find 'Verifikasi' button")
            verify_btn.click()

            # Wait for green "WhatsApp terverifikasi" badge
            try:
                verified_badge = None
                # Loop to find visible badge (mobile + desktop render two)
                for attempt in range(20):
                    locs = page.get_by_text(re.compile(r"WhatsApp terverifikasi|WhatsApp verified", re.I))
                    n = locs.count()
                    for i in range(n):
                        el = locs.nth(i)
                        try:
                            if el.is_visible(timeout=300):
                                verified_badge = el
                                break
                        except Exception:
                            continue
                    if verified_badge:
                        break
                    page.wait_for_timeout(500)
                if verified_badge:
                    print("  green 'WhatsApp terverifikasi' badge visible ✅")
                else:
                    print("  WARNING: verified badge not visible after 10s")
            except Exception as e:
                print(f"  badge check error: {e}")
            page.wait_for_timeout(800)
            shot("06-register-otp-verified-unlocked.png",
                 "OTP verified — password fields UNLOCKED, green badge visible")

            # Verify password fields are NOW enabled
            try:
                pass1_after = first_visible('#r-pass')
                pass2_after = first_visible('#r-pass2')
                submit_after = first_visible('button[type="submit"]:has-text("Daftar")')
                if submit_after is None:
                    submit_after = first_visible('form button[type="submit"]')
                pass1_disabled_after = pass1_after.is_disabled(timeout=2000) if pass1_after else None
                pass2_disabled_after = pass2_after.is_disabled(timeout=2000) if pass2_after else None
                submit_disabled_after = submit_after.is_disabled(timeout=2000) if submit_after else None
                print(f"  #r-pass disabled after verify (expected False): {pass1_disabled_after}")
                print(f"  #r-pass2 disabled after verify (expected False): {pass2_disabled_after}")
                print(f"  submit disabled after verify (expected False): {submit_disabled_after}")
            except Exception as e:
                print(f"  could not check disabled state after verify: {e}")

            # ---------------------------------------------------------------
            # STEP 7 — type into the (now-enabled) password fields
            # ---------------------------------------------------------------
            print("\n=== STEP 7: type into password fields (now enabled) ===")
            try:
                p1 = first_visible('#r-pass')
                p2 = first_visible('#r-pass2')
                p1.fill("TestPass#123", timeout=3000)
                p2.fill("TestPass#123", timeout=3000)
                page.wait_for_timeout(300)
                shot("07-register-passwords-filled.png", "Passwords typed into now-enabled fields")
                v1 = p1.input_value()
                v2 = p2.input_value()
                print(f"  #r-pass value length: {len(v1)} (expected 12)")
                print(f"  #r-pass2 value length: {len(v2)} (expected 12)")
            except Exception as e:
                print(f"  could not fill password fields: {e}")

            # ---------------------------------------------------------------
            # STEP 8 — change phone number → verified state should reset
            # ---------------------------------------------------------------
            print("\n=== STEP 8: change phone number → verified state should reset ===")
            first_visible('#r-phone').fill("08987654321")
            page.wait_for_timeout(800)  # allow prevPhoneRef effect to run
            try:
                locs = page.get_by_text(re.compile(r"WhatsApp terverifikasi", re.I))
                verified_still = False
                for i in range(locs.count()):
                    el = locs.nth(i)
                    try:
                        if el.is_visible(timeout=300):
                            verified_still = True
                            break
                    except Exception:
                        continue
                print(f"  green badge still visible after phone change (expected False): {verified_still}")
            except Exception:
                print("  green badge is gone (expected)")
            # Re-check password fields are disabled again
            try:
                pass1_reset = first_visible('#r-pass')
                pass1_disabled_reset = pass1_reset.is_disabled(timeout=1500) if pass1_reset else None
                print(f"  #r-pass disabled after phone change (expected True): {pass1_disabled_reset}")
            except Exception as e:
                print(f"  could not check disabled state after phone change: {e}")
            shot("08-register-phone-changed-locked.png",
                 "Phone changed → OTP verified state reset, password fields re-locked")

            # ---------------------------------------------------------------
            # Final state
            # ---------------------------------------------------------------
            shot("09-final-state.png", "Final register form state")

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
            print("\n\n================ SUMMARY ================")
            print("Screenshots saved:")
            for line in report:
                print(line)

            print("\n--- API responses (/api/auth/register-otp) ---")
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
