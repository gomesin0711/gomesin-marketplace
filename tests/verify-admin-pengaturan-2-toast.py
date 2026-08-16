#!/usr/bin/env python3
"""Focused re-test: capture toast text after Pengaturan save attempt."""
import sys, time
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL = "http://localhost:3000/"
ADMIN_EMAIL = "mesinKU0711@gmail.com"
ADMIN_PASSWORD = "admin123"


def click_visible(loc, t=5000):
    try:
        for i in range(loc.count()):
            el = loc.nth(i)
            if el.is_visible():
                el.scroll_into_view_if_needed()
                el.click(timeout=t)
                return True
    except Exception as e:
        print(f"  click fail: {e}")
    return False


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, locale="id-ID")
    ctx.add_init_script(
        "try{localStorage.setItem('gomesin-pwa-dismissed','1');"
        "localStorage.setItem('gomesin-pwa-installed','1');}catch(e){}"
    )
    page = ctx.new_page()

    # Capture all network requests to /api/admin/settings
    api_events = []
    def on_request_finished(req):
        if "/api/admin/settings" in req.url:
            try:
                resp = req.response()
                api_events.append({
                    "method": req.method,
                    "url": req.url,
                    "status": resp.status if resp else None,
                    "body": resp.text() if resp else None,
                })
            except Exception as e:
                api_events.append({"method": req.method, "url": req.url, "err": str(e)})
    page.on("requestfinished", on_request_finished)

    print("[1] Loading homepage ...")
    page.goto(URL, wait_until="domcontentloaded", timeout=30000)
    time.sleep(3)

    print("[2] Logging in ...")
    click_visible(page.locator('button[aria-label="Masuk atau Daftar"]'))
    page.locator('input#l-email').filter(visible=True).first.wait_for(state="visible", timeout=8000)
    time.sleep(0.3)
    page.locator('input#l-email').filter(visible=True).first.fill(ADMIN_EMAIL)
    page.locator('input#l-pass').filter(visible=True).first.fill(ADMIN_PASSWORD)
    time.sleep(0.3)
    for i in range(page.locator('button[type="submit"]').count()):
        b = page.locator('button[type="submit"]').nth(i)
        if b.is_visible() and "Masuk" in (b.inner_text() or "").strip():
            b.click(timeout=5000); break
    page.get_by_text("Panel Administrator", exact=False).filter(visible=True).first.wait_for(state="visible", timeout=20000)
    time.sleep(2)
    print("  Admin view loaded.")

    print("[3] Opening Pengaturan tab ...")
    click_visible(page.locator('aside nav button', has_text="Pengaturan"))
    time.sleep(2)
    page.get_by_text("Pengaturan Situs", exact=False).filter(visible=True).first.wait_for(state="visible", timeout=10000)
    print("  Pengaturan tab open.")

    print("[4] Editing BCA account # -> '9999999999' and clicking Simpan ...")
    bca = page.locator('input#bcaAccount')
    bca.scroll_into_view_if_needed()
    bca.fill("9999999999")
    time.sleep(0.4)
    save = page.locator('button', has_text="Simpan Pengaturan").last
    save.scroll_into_view_if_needed()
    save.click(timeout=5000)

    print("[5] Waiting 5s and capturing all visible toast/notification text ...")
    time.sleep(5)

    # Capture any element that looks like a toast (sonner radix toast, role="status", etc.)
    toast_candidates = page.evaluate("""
        () => {
          const out = [];
          // role=status / role=alert
          for (const sel of ['[role="status"]','[role="alert"]','[data-sonner-toast]','li[data-sonner-toast]','[data-radix-toast-content]','[class*="toast"]','[class*="Toast"]']) {
            document.querySelectorAll(sel).forEach(el => {
              const t = (el.innerText||'').trim();
              if (t) out.push({sel, text: t, visible: el.offsetParent !== null});
            });
          }
          return out;
        }
    """)
    print(f"  Toast candidates found: {toast_candidates}")

    # Also dump full body text snippet (last 600 chars) to see if any toast text is anywhere
    body_tail = page.evaluate("document.body.innerText || ''")[-800:]
    print(f"\n  Body text tail (last 800 chars):\n{body_tail}\n")

    print("[6] API events captured during save:")
    for ev in api_events:
        body = ev.get("body", "")
        if isinstance(body, str) and len(body) > 200:
            body = body[:200] + "..."
        print(f"   {ev.get('method')} {ev.get('url')} status={ev.get('status')} body={body}")

    # Screenshot
    page.screenshot(path="/home/z/my-project/tool-results/verify-admin-pengaturan-2-toast.png", full_page=False)
    print("  Screenshot: /home/z/my-project/tool-results/verify-admin-pengaturan-2-toast.png")

    browser.close()
