#!/usr/bin/env python3
"""
Browser verification script for Task 13-chat-view:
Verify that clicking "Chat Penjual" on the listing detail page now navigates
to a full-page chat view (NOT a modal Dialog).

Steps:
 1. Home page loads (HTTP 200, no console errors)                    -> 01-home
 2. Click a listing card -> detail view                              -> 02-detail
 3. Click "Chat Penjual" button                                      -> 03-chat-page
 4. Verify chat page contents (header, listing card, input, quick
    replies, site header visible, footer NOT visible, not a modal)   -> 04-chat-page-annotated
 5. Test sending a message (logged in -> message appears, or
    not-logged-in -> toast prompting login)                          -> 05-send
 6. Click back arrow in chat header -> returns to detail             -> 06-back-to-detail
 7. Resize to mobile (375x812), repeat steps 1-4                     -> 07-mobile-home, 08-mobile-detail, 09-mobile-chat

Captures all console messages / page errors / failed network requests.

Pure verification — does NOT modify code.
"""

import json
import sys
import time
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL = "http://localhost:3000/"
SCREEN_DIR = Path("/home/z/my-project/upload/chat-view-verify")
SCREEN_DIR.mkdir(parents=True, exist_ok=True)

console_msgs = []
page_errors = []
failed_requests = []
api_responses = []

# ---- helpers ----
def first_visible(page, selectors, timeout=4000):
    """Return the first visible locator among the candidate selectors."""
    last_err = None
    for sel in selectors:
        locs = page.locator(sel)
        try:
            count = locs.count()
        except Exception as e:
            last_err = e
            continue
        for i in range(count):
            el = locs.nth(i)
            try:
                if el.is_visible(timeout=timeout):
                    return el
            except Exception as e:
                last_err = e
                continue
    return None


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(
            viewport={"width": 1366, "height": 900},
            locale="id-ID",
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        )
        # Pre-seed localStorage to suppress the PWA install prompt on first load.
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
            # capture listing fetch + message sends
            if "/api/listings/" in resp.url or "/api/messages" in resp.url or "/api/chat" in resp.url:
                try:
                    body_text = resp.text()
                except Exception:
                    body_text = None
                api_responses.append(
                    {
                        "url": resp.url,
                        "status": resp.status,
                        "method": resp.request.method,
                        "body_preview": (body_text[:300] if body_text else None),
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

        results = {}

        try:
            # ---------------------------------------------------------------
            # STEP 1 — Home page
            # ---------------------------------------------------------------
            print("\n=== STEP 1: navigate to home ===")
            resp = page.goto(URL, wait_until="networkidle", timeout=45000)
            http_status = resp.status if resp else None
            print(f"  HTTP status: {http_status}")
            results["home_http_status"] = http_status
            page.wait_for_timeout(1500)  # hydration / store rehydrate

            # Defensive: dismiss PWA popup if it still managed to show up
            try:
                pwa_later = page.locator('button:has-text("Nanti Saja")').first
                if pwa_later.is_visible(timeout=1500):
                    pwa_later.click()
                    page.wait_for_timeout(400)
                    print("  dismissed leftover PWA popup")
            except Exception:
                pass
            shot("01-home.png", "Home page (initial load)")
            results["home_loaded"] = http_status == 200

            # ---------------------------------------------------------------
            # STEP 2 — Click a listing card to enter detail view
            # ---------------------------------------------------------------
            print("\n=== STEP 2: click a listing card -> detail view ===")
            # ListingCard renders as <article> with role=article? Actually just <article>.
            # Try to find article elements that are visible (not skeletons).
            articles = page.locator("article")
            n = articles.count()
            print(f"  found {n} <article> elements on home page")
            clicked = False
            for i in range(n):
                el = articles.nth(i)
                try:
                    if el.is_visible(timeout=1000):
                        # capture title text for verification later
                        title_text = ""
                        try:
                            # Prefer a heading-like selector inside the card
                            t = el.locator("h3, h2, p.font-semibold, p.text-sm.font-semibold").first
                            if t.is_visible(timeout=500):
                                title_text = (t.inner_text() or "").strip()
                        except Exception:
                            pass
                        el.click()
                        clicked = True
                        results["home_listing_title"] = title_text
                        print(f"  clicked article #{i} title={title_text!r}")
                        break
                except Exception:
                    continue
            if not clicked:
                raise RuntimeError("Could not click any listing card on home page")
            page.wait_for_timeout(1500)
            # confirm detail view rendered — wait for "Chat Penjual" button
            try:
                page.wait_for_selector('button:has-text("Chat Penjual")', timeout=10000)
                print("  detail view rendered (Chat Penjual button visible)")
                results["detail_loaded"] = True
            except PWTimeout:
                results["detail_loaded"] = False
                print("  WARNING: Chat Penjual button NOT visible after clicking listing")
            shot("02-detail.png", "Listing detail view")

            # ---------------------------------------------------------------
            # STEP 3 — Click "Chat Penjual"
            # ---------------------------------------------------------------
            print("\n=== STEP 3: click 'Chat Penjual' button ===")
            chat_btn = first_visible(
                page,
                [
                    'button:has-text("Chat Penjual")',
                    'button:has-text("Chat Seller")',
                    'button:has-text("联系卖家")',
                ],
            )
            if chat_btn is None:
                raise RuntimeError("Could not find visible 'Chat Penjual' button")
            # Confirm it's the primary (orange) button — get its bg color
            try:
                bg = chat_btn.evaluate(
                    "el => window.getComputedStyle(el).backgroundColor"
                )
                cls = chat_btn.get_attribute("class") or ""
                print(f"  button bg={bg} class~primary={'bg-primary' in cls}")
                results["chat_btn_bg"] = bg
                results["chat_btn_has_primary_class"] = "bg-primary" in cls
            except Exception:
                pass
            chat_btn.click()
            page.wait_for_timeout(2000)
            # The chat view fetches the listing via /api/listings/[slug]; wait for the
            # chat header (with primary bg) to appear.
            try:
                page.wait_for_selector('button[aria-label="Kembali"]', timeout=12000)
                print("  chat header back button visible — chat view loaded")
                results["chat_loaded"] = True
            except PWTimeout:
                results["chat_loaded"] = False
                print("  WARNING: chat header back button NOT visible after click")
            shot("03-chat-page.png", "Full-page chat view (after clicking Chat Penjual)")

            # ---------------------------------------------------------------
            # STEP 4 — Verify chat page contents
            # ---------------------------------------------------------------
            print("\n=== STEP 4: verify chat page contents ===")
            # 4a. URL is still "/" (SPA, no real route change)
            current_url = page.url
            print(f"  current URL: {current_url}")
            results["chat_url_is_root"] = current_url.rstrip("/").endswith(":3000") or current_url.endswith("/") or "/listings/" not in current_url
            # the SPA keeps URL at root, no /chat or /listings/...
            results["chat_url_exact_root"] = current_url in ("http://localhost:3000/", "http://localhost:3000")

            # 4b. NOT a modal — Radix Dialog renders a DialogContent inside a portal
            # with role="dialog". Verify there's no role="dialog" element visible.
            try:
                dialog_count = page.locator('[role="dialog"]').count()
                dialog_visible_count = 0
                for i in range(dialog_count):
                    el = page.locator('[role="dialog"]').nth(i)
                    try:
                        if el.is_visible(timeout=300):
                            dialog_visible_count += 1
                    except Exception:
                        pass
                print(f"  role=dialog elements total={dialog_count} visible={dialog_visible_count}")
                results["chat_is_not_modal"] = dialog_visible_count == 0
            except Exception as e:
                print(f"  dialog check error: {e}")
                results["chat_is_not_modal"] = None

            # 4c. Full-page chat visible — check the outer container has the
            # h-[calc(100dvh-...)] class.
            try:
                container_count = page.locator(
                    'div.h-\\[calc\\(100dvh-8\\.25rem\\)\\], div.h-\\[calc\\(100dvh-4rem\\)\\]'
                ).count()
                # The same class also appears in loading state but we're past loading.
                print(f"  full-height chat containers found: {container_count}")
                results["chat_full_page_container"] = container_count > 0
            except Exception:
                results["chat_full_page_container"] = None

            # 4d. Chat header has primary background (orange) + seller name
            try:
                # Use evaluate to fetch the header div + seller name in one go
                info = page.evaluate(
                    """() => {
                      const back = document.querySelector('button[aria-label="Kembali"]');
                      if (!back) return null;
                      const header = back.parentElement;
                      if (!header) return null;
                      const bg = window.getComputedStyle(header).backgroundColor;
                      const cls = header.className || '';
                      // Find the seller-name span: span with class containing 'truncate' AND 'font-semibold'
                      let name = '';
                      const spans = Array.from(header.querySelectorAll('span'));
                      for (const s of spans) {
                        if (s.className && s.className.includes('truncate') && s.className.includes('font-semibold')) {
                          name = (s.textContent || '').trim();
                          break;
                        }
                      }
                      // Settings/Popover button presence
                      const settingsBtn = header.querySelector('button[aria-label="Pengaturan chat"]');
                      return { bg, cls, name, hasSettings: !!settingsBtn };
                    }"""
                )
                if info:
                    header_bg = info.get("bg")
                    header_classes = info.get("cls", "")
                    seller_name = info.get("name", "")
                    print(f"  chat header bg={header_bg} seller={seller_name!r} hasPrimaryClass={'bg-primary' in header_classes} hasSettings={info.get('hasSettings')}")
                    results["chat_header_bg"] = header_bg
                    results["chat_header_has_primary_class"] = "bg-primary" in header_classes
                    results["chat_seller_name"] = seller_name
                    results["chat_header_has_settings_btn"] = info.get("hasSettings")
                else:
                    print("  chat header not found via evaluate")
                    results["chat_header_bg"] = None
                    results["chat_seller_name"] = ""
            except Exception as e:
                print(f"  chat header check error: {e}")
                results["chat_header_bg"] = None
                results["chat_seller_name"] = ""

            # 4e. Listing card below header — listing title, price, location
            try:
                # The listing card has the listing title (line-clamp-2 text-sm font-semibold).
                # The price has text-primary bold formatting; location has MapPin icon.
                listing_card_title = ""
                listing_card_price = ""
                listing_card_loc = ""
                # Try to find within ChatInner's listing card div (has border-b border-border bg-card p-2.5
                # and is NOT the messages area). Just find the line-clamp-2 element under a div with border-b.
                # Actually just take the first .line-clamp-2 element inside the chat view.
                t_loc = page.locator("p.line-clamp-2.text-sm.font-semibold").first
                if t_loc.is_visible(timeout=800):
                    listing_card_title = (t_loc.inner_text() or "").strip()
                # Price: p.text-sm.font-bold.text-primary
                p_loc = page.locator("p.text-sm.font-bold.text-primary").first
                if p_loc.is_visible(timeout=800):
                    listing_card_price = (p_loc.inner_text() or "").strip()
                # Location: any text near a MapPin icon — easier: any element with text containing ', ' that has a small size-2.5 svg sibling.
                # Just take all small muted text in the listing card area.
                print(f"  chat listing card title={listing_card_title!r} price={listing_card_price!r}")
                results["chat_listing_card_title"] = listing_card_title
                results["chat_listing_card_price"] = listing_card_price
                results["chat_listing_card_visible"] = bool(listing_card_title or listing_card_price)
            except Exception as e:
                print(f"  listing card check error: {e}")
                results["chat_listing_card_visible"] = False

            # 4f. Message input + send button visible at bottom
            # NOTE: there are multiple input[type=text] on the page (header search bar
            # appears in BOTH mobile and desktop header instances, plus the chat input).
            # The chat input has placeholder "Tulis pesan..." (id translation). Target it
            # specifically so we don't accidentally pick up the search input.
            try:
                chat_input = page.locator(
                    'input[placeholder="Tulis pesan..."], input[placeholder="Type a message..."], input[placeholder="输入消息..."]'
                ).first
                input_visible = False
                try:
                    input_visible = chat_input.is_visible(timeout=2000)
                except Exception:
                    input_visible = False
                # Send button: chat form's submit button. The chat form has class
                # "flex shrink-0 items-center gap-1.5 border-t border-border bg-card p-2.5".
                send_visible = False
                try:
                    send_btn = page.locator(
                        'form.flex.shrink-0 button[type="submit"]'
                    ).first
                    send_visible = send_btn.is_visible(timeout=2000)
                except Exception:
                    pass
                print(f"  message input visible={input_visible} send button visible={send_visible}")
                results["chat_input_visible"] = input_visible
                results["chat_send_button_visible"] = send_visible
            except Exception as e:
                print(f"  input check error: {e}")
                results["chat_input_visible"] = False
                results["chat_send_button_visible"] = False

            # 4g. Quick reply chips — only shown if messages.length === 0 && loadedHistory && !blocked.
            # For a fresh chat (no prior conversation), they should appear.
            try:
                quick_texts = ["Apakah masih tersedia?", "Bisa nego harga?", "Bisa COD / survei?", "Bisa dikirim luar kota?"]
                quick_found = []
                for q in quick_texts:
                    el = page.locator(f'button:has-text("{q}")').first
                    try:
                        if el.is_visible(timeout=400):
                            quick_found.append(q)
                    except Exception:
                        pass
                print(f"  quick reply chips visible: {quick_found}")
                results["chat_quick_replies"] = quick_found
            except Exception as e:
                print(f"  quick reply check error: {e}")
                results["chat_quick_replies"] = []

            # 4h. Site Header (sticky top) visible at top of page
            try:
                site_header = page.locator("header").first
                site_header_visible = site_header.is_visible(timeout=800) if site_header else False
                site_header_top = None
                if site_header_visible:
                    site_header_top = site_header.bounding_box()["y"]
                print(f"  site <header> visible={site_header_visible} top={site_header_top}")
                results["site_header_visible"] = site_header_visible
            except Exception as e:
                print(f"  site header check error: {e}")
                results["site_header_visible"] = False

            # 4i. Footer NOT visible (chat view is in the hide-footer list)
            try:
                footer = page.locator("footer").first
                footer_visible = False
                if footer.count() > 0:
                    try:
                        footer_visible = footer.is_visible(timeout=600)
                    except Exception:
                        footer_visible = False
                # Even if is_visible() returns True, double check it's not just present at the bottom (offscreen).
                if footer_visible:
                    try:
                        box = footer.bounding_box()
                        # If footer is below the viewport bottom, treat as not-visible.
                        if box and box["y"] >= 900:
                            footer_visible = False
                            print(f"  footer is below viewport (y={box['y']}), treated as hidden")
                    except Exception:
                        pass
                print(f"  site <footer> visible={footer_visible}")
                results["site_footer_visible"] = footer_visible
            except Exception as e:
                print(f"  footer check error: {e}")
                results["site_footer_visible"] = None

            shot("04-chat-page-annotated.png", "Chat page after verification of contents")

            # ---------------------------------------------------------------
            # STEP 5 — Test sending a message
            # ---------------------------------------------------------------
            print("\n=== STEP 5: test sending a message ===")
            # Check localStorage for a logged-in user.
            try:
                store_raw = page.evaluate("localStorage.getItem('gomesin-store')")
                print(f"  gomesin-store raw (truncated): {(store_raw or '')[:200]!r}")
                store = json.loads(store_raw) if store_raw else {}
                state = store.get("state", store)
                current_user = state.get("user")
                print(f"  current user: {current_user!r}")
                results["logged_in"] = bool(current_user)
            except Exception as e:
                print(f"  localStorage check error: {e}")
                results["logged_in"] = False
                current_user = None

            # Try to type a message and click send
            try:
                input_el = page.locator(
                    'input[placeholder="Tulis pesan..."], input[placeholder="Type a message..."], input[placeholder="输入消息..."]'
                ).first
                if not input_el.is_visible(timeout=2000):
                    print("  chat input not visible, skipping send test")
                else:
                    msg = "Halo, ini pesan uji otomatis dari browser verify"
                    input_el.fill(msg)
                    page.wait_for_timeout(300)
                    # Click the submit button (Send icon) within the chat form
                    send_btn = page.locator(
                        'form.flex.shrink-0 button[type="submit"]'
                    ).first
                    if send_btn.is_visible(timeout=2000):
                        send_btn.click()
                        page.wait_for_timeout(2000)
                        print("  clicked send button")
                        # Either the message appears in the messages area (logged in),
                        # or a toast appears prompting login.
                        # Check for toast (sonner)
                        toast_texts = []
                        try:
                            toasts = page.locator('[data-sonner-toast]')
                            tc = toasts.count()
                            for i in range(tc):
                                try:
                                    toast_texts.append(toasts.nth(i).inner_text().strip())
                                except Exception:
                                    pass
                        except Exception:
                            pass
                        print(f"  toasts after send: {toast_texts}")
                        results["send_toast"] = toast_texts
                        # Also check if the message bubble with our text appears
                        try:
                            bubble = page.locator(f'div:has-text("{msg}")').first
                            results["send_bubble_visible"] = bubble.is_visible(timeout=1000) if bubble else False
                        except Exception:
                            results["send_bubble_visible"] = False
                    else:
                        print("  send button not visible, skipping click")
            except Exception as e:
                print(f"  send test error: {e}")
            shot("05-send.png", "After clicking Send (toast or message bubble)")

            # ---------------------------------------------------------------
            # STEP 6 — Click back arrow -> returns to detail view
            # ---------------------------------------------------------------
            print("\n=== STEP 6: click back arrow -> returns to detail ===")
            back_btn = page.locator('button[aria-label="Kembali"]').first
            if not back_btn.is_visible(timeout=1000):
                print("  back button not visible, aborting step 6")
                results["back_works"] = False
            else:
                # Wait for the login-prompt toast to auto-dismiss (sonner ~4s) so it
                # doesn't intercept the back-button click. Try clicking the toast's
                # CLOSE button (X icon, last button) — NOT the action button ("Masuk").
                try:
                    toast = page.locator('[data-sonner-toast]').first
                    if toast.is_visible(timeout=500):
                        # The close button is the one with aria-label="Close toast"
                        close_btn = page.locator('[data-sonner-toast] button[aria-label="Close toast"]').first
                        if close_btn.is_visible(timeout=500):
                            close_btn.click()
                            page.wait_for_timeout(500)
                            print("  dismissed toast via close button")
                        else:
                            # Just wait for auto-dismiss
                            page.wait_for_timeout(4500)
                            print("  waited for toast to auto-dismiss")
                except Exception as e:
                    print(f"  toast dismiss skipped: {e}")
                # Click back button — use force=True as a fallback in case a
                # remaining toast overlay is intercepting the click.
                try:
                    back_btn.click(timeout=5000)
                except Exception as e:
                    print(f"  normal click failed, retrying with force=True: {e}")
                    try:
                        back_btn.click(force=True, timeout=5000)
                    except Exception as e2:
                        # Last resort: dispatch a JS click
                        print(f"  force click failed, using JS click: {e2}")
                        back_btn.evaluate("el => el.click()")
                page.wait_for_timeout(2500)
                # Verify detail view is back: wait for Chat Penjual button to become visible.
                # Use wait_for(state="visible") which actually polls until visible.
                try:
                    detail_back = page.locator('button:has-text("Chat Penjual")').first
                    detail_back.wait_for(state="visible", timeout=10000)
                    detail_visible = True
                except Exception as e:
                    detail_visible = False
                    print(f"  detail view wait_for failed: {e}")
                # Also check the store state via localStorage
                try:
                    store_raw = page.evaluate("localStorage.getItem('gomesin-store')")
                    store = json.loads(store_raw) if store_raw else {}
                    state = store.get("state", store)
                    view_now = state.get("view")
                    print(f"  store view after back: {view_now!r}")
                    results["back_view_state"] = view_now
                    if view_now == "detail":
                        detail_visible = True
                except Exception as e:
                    print(f"  store check error: {e}")
                print(f"  detail view visible after back: {detail_visible}")
                results["back_works"] = detail_visible
            shot("06-back-to-detail.png", "After clicking back arrow (should be detail view)")

            # ---------------------------------------------------------------
            # STEP 7 — Mobile viewport (375x812), repeat steps 1-4
            # ---------------------------------------------------------------
            print("\n=== STEP 7: mobile viewport (375x812) ===")
            page.set_viewport_size({"width": 375, "height": 812})
            page.goto(URL, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(1500)
            try:
                pwa_later = page.locator('button:has-text("Nanti Saja")').first
                if pwa_later.is_visible(timeout=1000):
                    pwa_later.click()
                    page.wait_for_timeout(300)
            except Exception:
                pass
            shot("07-mobile-home.png", "Mobile home page (375x812)")

            # click listing card
            articles = page.locator("article")
            n = articles.count()
            print(f"  mobile: found {n} articles")
            mobile_clicked = False
            for i in range(n):
                el = articles.nth(i)
                try:
                    if el.is_visible(timeout=500):
                        el.click()
                        mobile_clicked = True
                        break
                except Exception:
                    continue
            if not mobile_clicked:
                print("  mobile: could not click listing card")
                results["mobile_detail_loaded"] = False
            else:
                page.wait_for_timeout(1500)
                try:
                    page.wait_for_selector('button:has-text("Chat Penjual")', timeout=10000)
                    results["mobile_detail_loaded"] = True
                except PWTimeout:
                    results["mobile_detail_loaded"] = False
            shot("08-mobile-detail.png", "Mobile detail view")

            # click Chat Penjual on mobile
            chat_btn_m = first_visible(
                page,
                [
                    'button:has-text("Chat Penjual")',
                    'button:has-text("Chat Seller")',
                ],
            )
            if chat_btn_m is None:
                print("  mobile: could not find Chat Penjual button")
                results["mobile_chat_loaded"] = False
            else:
                chat_btn_m.click()
                page.wait_for_timeout(2000)
                try:
                    page.wait_for_selector('button[aria-label="Kembali"]', timeout=12000)
                    results["mobile_chat_loaded"] = True
                except PWTimeout:
                    results["mobile_chat_loaded"] = False
            shot("09-mobile-chat.png", "Mobile chat page")

            # Mobile-specific checks: no horizontal scroll, input accessible above bottom nav
            if results.get("mobile_chat_loaded"):
                try:
                    h_scroll = page.evaluate(
                        "() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2"
                    )
                    print(f"  mobile horizontal scroll present: {h_scroll}")
                    results["mobile_horizontal_scroll"] = h_scroll
                except Exception:
                    results["mobile_horizontal_scroll"] = None
                # Investigate mobile layout — measure positions of header, chat container, input, bottom nav
                try:
                    layout = page.evaluate(
                        """() => {
                          const out = {};
                          const header = document.querySelector('header');
                          if (header) {
                            const b = header.getBoundingClientRect();
                            out.header = { y: b.y, h: b.height, bottom: b.bottom };
                          }
                          // Find chat container: div with class containing 'h-[calc(100dvh'
                          const containers = Array.from(document.querySelectorAll('div'));
                          const chatContainer = containers.find(d => (d.className || '').includes('h-[calc(100dvh'));
                          if (chatContainer) {
                            const b = chatContainer.getBoundingClientRect();
                            out.chatContainer = { y: b.y, h: b.height, bottom: b.bottom, cls: chatContainer.className };
                          }
                          // Find chat input by placeholder
                          const inp = document.querySelector('input[placeholder="Tulis pesan..."]') || document.querySelector('input[placeholder="Type a message..."]');
                          if (inp) {
                            const b = inp.getBoundingClientRect();
                            out.input = { y: b.y, h: b.height, bottom: b.bottom };
                          }
                          // Find BottomNav (a <nav> with role=navigation or just <nav>)
                          const nav = document.querySelector('nav');
                          if (nav) {
                            const b = nav.getBoundingClientRect();
                            out.bottomNav = { y: b.y, h: b.height, bottom: b.bottom, position: window.getComputedStyle(nav).position };
                          }
                          // Viewport
                          out.viewport = { w: window.innerWidth, h: window.innerHeight };
                          return out;
                        }"""
                    )
                    print(f"  mobile layout: {json.dumps(layout, indent=2)}")
                    results["mobile_layout"] = layout
                except Exception as e:
                    print(f"  mobile layout check error: {e}")
                # input visible & above bottom nav
                try:
                    input_el = page.locator(
                        'input[placeholder="Tulis pesan..."], input[placeholder="Type a message..."], input[placeholder="输入消息..."]'
                    ).first
                    input_box = None
                    if input_el.is_visible(timeout=2000):
                        input_box = input_el.bounding_box()
                    print(f"  mobile input box: {input_box}")
                    # Input is accessible if it's within the viewport (y + height <= viewport height) and y > 0.
                    results["mobile_input_accessible"] = (
                        input_box is not None
                        and input_box["y"] + input_box["height"] <= 812
                        and input_box["y"] > 0
                    )
                except Exception as e:
                    print(f"  mobile input check error: {e}")
                    results["mobile_input_accessible"] = False
                # Header visible at top
                try:
                    site_header = page.locator("header").first
                    results["mobile_site_header_visible"] = (
                        site_header.is_visible(timeout=600) if site_header else False
                    )
                except Exception:
                    results["mobile_site_header_visible"] = False
                # Footer hidden on chat
                try:
                    footer = page.locator("footer").first
                    results["mobile_site_footer_visible"] = (
                        footer.is_visible(timeout=400) if footer.count() > 0 else False
                    )
                except Exception:
                    results["mobile_site_footer_visible"] = None
                # Scroll the chat input into view to confirm it's reachable
                try:
                    input_el = page.locator(
                        'input[placeholder="Tulis pesan..."], input[placeholder="Type a message..."], input[placeholder="输入消息..."]'
                    ).first
                    input_el.scroll_into_view_if_needed(timeout=3000)
                    page.wait_for_timeout(400)
                    in_view = page.evaluate(
                        """() => {
                          const inp = document.querySelector('input[placeholder="Tulis pesan..."]') || document.querySelector('input[placeholder="Type a message..."]');
                          if (!inp) return false;
                          const r = inp.getBoundingClientRect();
                          return r.top >= 0 && r.bottom <= window.innerHeight;
                        }"""
                    )
                    print(f"  mobile input in viewport after scroll_into_view: {in_view}")
                    results["mobile_input_reachable_by_scroll"] = in_view
                except Exception as e:
                    print(f"  mobile input scroll check error: {e}")
                    results["mobile_input_reachable_by_scroll"] = None
                # Take a FULL-PAGE mobile screenshot to show the entire chat layout
                try:
                    page.screenshot(
                        path=str(SCREEN_DIR / "10-mobile-chat-fullpage.png"),
                        full_page=True,
                    )
                    report.append("  - 10-mobile-chat-fullpage.png: Mobile chat page (full-page, showing entire layout)")
                    print("[shot] 10-mobile-chat-fullpage.png -> Mobile chat page (full-page)")
                except Exception as e:
                    print(f"  full-page mobile screenshot error: {e}")

            # ---------------------------------------------------------------
            # Done — print summary
            # ---------------------------------------------------------------
            print("\n=== SUMMARY ===")
            for k, v in results.items():
                print(f"  {k}: {v!r}")
            print("\n=== CONSOLE MESSAGES ===")
            for m in console_msgs:
                print(f"  [{m['type']}] {m['text']}")
            print("\n=== PAGE ERRORS ===")
            for e in page_errors:
                print(f"  {e.get('name')}: {e.get('message')}")
            print("\n=== FAILED REQUESTS ===")
            for r in failed_requests:
                print(f"  {r['method']} {r['url']} -- {r['failure']}")
            print("\n=== CAPTURED API RESPONSES ===")
            for r in api_responses:
                print(f"  {r['method']} {r['url']} -> {r['status']} {(r.get('body_preview') or '')[:200]!r}")

            print("\n=== SCREENSHOTS ===")
            for line in report:
                print(line)

            # Save a JSON report
            (SCREEN_DIR / "report.json").write_text(
                json.dumps(
                    {
                        "results": results,
                        "console_msgs": console_msgs,
                        "page_errors": page_errors,
                        "failed_requests": failed_requests,
                        "api_responses": api_responses,
                    },
                    indent=2,
                    default=str,
                )
            )
            print(f"\nReport JSON saved to {SCREEN_DIR / 'report.json'}")

        except Exception as e:
            print("\n=== EXCEPTION ===")
            traceback.print_exc()
            try:
                page.screenshot(path=str(SCREEN_DIR / "ERROR.png"))
                print(f"Error screenshot saved to {SCREEN_DIR / 'ERROR.png'}")
            except Exception:
                pass
            sys.exit(1)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
