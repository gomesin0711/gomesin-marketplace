#!/usr/bin/env python3
"""
Browser verification for mesinKU marketplace UI changes.
Verifies: chat dark mode (black bg), notification badge real-time clearing,
jasa category icon, and static sound file loading.
"""
import asyncio
import json
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
SHOTS = "/home/z/my-project/verify-shots"

# Fake user so the "Pesan" button (and chat panel) renders.
FAKE_USER = {
    "id": "verify-test-user-1",
    "name": "Verify Tester",
    "email": "verify@test.local",
    "phone": "081234567890",
    "city": "Jakarta",
    "company": "Verify Co",
    "address": None,
    "bannerImage": None,
    "logoImage": None,
    "role": "user",
    "createdAt": "2024-01-01T00:00:00.000Z",
}


def log(msg):
    print(f"[verify] {msg}", flush=True)


# Common init script — sets up env but does NOT force view/profilePanel
# (those will be controlled per-test via post-load JS).
INIT_SCRIPT = f"""
try {{
  const store = {{
    state: {{
      view: 'home', slug: null, sellerId: null, profilePanel: null,
      filters: {{}}, favorites: [], favoritesSeenCount: 0, recents: [],
      user: {json.dumps(FAKE_USER)},
    }},
    version: 0,
  }};
  localStorage.setItem('gomesin-store', JSON.stringify(store));
  localStorage.setItem('gomesin-new-listings-seen-at', '0');
  localStorage.setItem('theme', 'light');
  // Suppress PWA install prompt modal.
  localStorage.setItem('gomesin-pwa-dismissed', String(Date.now()));
  localStorage.setItem('gomesin-pwa-installed', '1');
}} catch(e) {{ console.warn('init script failed', e); }}
"""


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        results = {"static_files": {}, "chat_dark": {}, "chat_light": {},
                   "notif": {}, "jasa_icon": {}}

        # ===== 4. Static file checks =====
        log("Checking static files...")
        ctx0 = await browser.new_context(viewport={"width": 1366, "height": 900})
        page0 = await ctx0.new_page()
        for f in ["/sounds/mesinku-chat.wav",
                  "/sounds/iklan-masuk.wav",
                  "/cat-icons/jasa-new.png"]:
            resp = await page0.goto(f"{BASE}{f}")
            status = resp.status if resp else None
            results["static_files"][f] = status
            log(f"  {f} -> HTTP {status}")
        await ctx0.close()

        # ===== 1. Chat page dark mode (black bg) =====
        log("=== Chat dark-mode test ===")
        ctx1 = await browser.new_context(viewport={"width": 1366, "height": 900})
        # Seed the store so the app opens directly to profile/pesan panel
        # (the chat page). This is more reliable than clicking the "Chat"
        # button which has aria-label "Chat" (not "Pesan").
        chat_init = INIT_SCRIPT.replace(
            "view: 'home', slug: null, sellerId: null, profilePanel: null,",
            "view: 'profile', slug: null, sellerId: null, profilePanel: 'pesan',",
        )
        await ctx1.add_init_script(chat_init)
        page = await ctx1.new_page()
        page.set_default_timeout(15000)

        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(2500)

        # Take light-mode initial screenshot of chat panel.
        await page.screenshot(path=f"{SHOTS}/01-chat-initial-light.png")
        log("  Saved 01-chat-initial-light.png")

        # Click dark-mode toggle.
        toggles = page.get_by_role("button", name="Toggle theme")
        nt = await toggles.count()
        log(f"  Theme toggle button(s): {nt}")
        if nt > 0:
            await toggles.first.click()
            await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{SHOTS}/02-chat-darkmode.png")
        log("  Saved 02-chat-darkmode.png")

        # Inspect chat panel background in dark mode.
        bg_info = await page.evaluate(
            """
            () => {
              const candidates = document.querySelectorAll('[class*="dark:bg-black"]');
              const all = [];
              const visible = [];
              candidates.forEach((el) => {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                const item = {
                  cls: el.className.substring(0, 140),
                  bg: cs.backgroundColor,
                  w: Math.round(r.width),
                  h: Math.round(r.height),
                  visible: r.width > 100 && r.height > 100,
                };
                all.push(item);
                if (item.visible) visible.push(item);
              });
              return {
                htmlClass: document.documentElement.className,
                bodyBg: getComputedStyle(document.body).backgroundColor,
                total_count: all.length,
                visible_count: visible.length,
                elements: visible,
              };
            }
            """
        )
        log(f"  HTML class: {bg_info['htmlClass']!r}")
        log(f"  Body bg: {bg_info['bodyBg']!r}")
        log(f"  dark:bg-black elements total={bg_info['total_count']} visible={bg_info['visible_count']}")
        for el in bg_info["elements"][:8]:
            log(f"    bg={el['bg']} {el['w']}x{el['h']} cls={el['cls']!r}")
        results["chat_dark"] = bg_info

        # Toggle back to light mode for comparison screenshot.
        if nt > 0:
            await toggles.first.click()
            await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{SHOTS}/03-chat-lightmode.png")
        log("  Saved 03-chat-lightmode.png")

        bg_info_light = await page.evaluate(
            """
            () => ({
              htmlClass: document.documentElement.className,
              bodyBg: getComputedStyle(document.body).backgroundColor,
              chatPaneBg: (() => {
                const el = document.querySelector('.flex-col.bg-\\[\\\\#F5F7F6\\\\]');
                return el ? getComputedStyle(el).backgroundColor : null;
              })(),
            })
            """
        )
        log(f"  Light HTML class: {bg_info_light['htmlClass']!r}")
        log(f"  Light body bg: {bg_info_light['bodyBg']!r}")
        results["chat_light"] = bg_info_light
        await ctx1.close()

        # ===== 2. Notification badge real-time clearing =====
        log("=== Notification badge test ===")
        ctx2 = await browser.new_context(viewport={"width": 1366, "height": 900})
        await ctx2.add_init_script(INIT_SCRIPT)
        page = await ctx2.new_page()
        page.set_default_timeout(15000)
        await page.goto(BASE, wait_until="domcontentloaded")
        # Wait for react-query fetch of newest listings.
        await page.wait_for_timeout(3500)

        bell = page.get_by_role("button", name="Notifikasi iklan baru")
        bell_count = await bell.count()
        log(f"  Bell button(s): {bell_count}")
        results["notif"]["bell_buttons_found"] = bell_count

        async def read_badge():
            return await page.evaluate(
                """
                () => {
                  const btn = document.querySelector('button[aria-label="Notifikasi iklan baru"]');
                  if (!btn) return {found:false, count:0, badge_text:null, has_badge:false};
                  // Badge is a span with class containing 'absolute' and 'bg-rose-500'
                  const badge = btn.querySelector('span.absolute');
                  return {
                    found: true,
                    count: badge ? (parseInt(badge.textContent.trim(), 10) || 0) : 0,
                    badge_text: badge ? badge.textContent.trim() : null,
                    has_badge: !!badge,
                  };
                }
                """
            )

        badge_before = await read_badge()
        log(f"  Badge BEFORE: {badge_before}")
        results["notif"]["badge_before"] = badge_before
        await page.screenshot(path=f"{SHOTS}/04-notif-before.png")
        log("  Saved 04-notif-before.png")

        # Click bell to open the notifikasi panel (full page).
        if bell_count > 0:
            await bell.first.click()
            await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{SHOTS}/05-notif-panel.png")
        log("  Saved 05-notif-panel.png")

        mark_btn = page.get_by_role("button", name="Tandai semua dibaca")
        mark_count = await mark_btn.count()
        log(f"  'Tandai semua dibaca' button(s): {mark_count}")
        results["notif"]["mark_button_found"] = mark_count

        if mark_count > 0:
            badge_panel_before = await read_badge()
            log(f"  Badge on bell (panel open, before mark): {badge_panel_before}")
            results["notif"]["badge_panel_before"] = badge_panel_before

            # Click "Tandai semua dibaca" — measure badge state immediately.
            await mark_btn.first.click()
            badge_immediate = await read_badge()
            log(f"  Badge IMMEDIATELY after click: {badge_immediate}")
            await page.wait_for_timeout(300)
            badge_300ms = await read_badge()
            log(f"  Badge 300ms after click: {badge_300ms}")
            await page.wait_for_timeout(700)
            badge_1s = await read_badge()
            log(f"  Badge 1s after click: {badge_1s}")
            results["notif"]["badge_immediate"] = badge_immediate
            results["notif"]["badge_after_300ms"] = badge_300ms
            results["notif"]["badge_after_1s"] = badge_1s
            await page.screenshot(path=f"{SHOTS}/06-notif-after.png")
            log("  Saved 06-notif-after.png")
        else:
            log("  No 'Tandai semua dibaca' button — count likely already 0")
            results["notif"]["note"] = "No mark-all button (count already 0)"
        await ctx2.close()

        # ===== 3. Jasa category icon =====
        log("=== Jasa category icon test ===")
        ctx3 = await browser.new_context(viewport={"width": 1366, "height": 900})
        await ctx3.add_init_script(INIT_SCRIPT)
        page = await ctx3.new_page()
        page.set_default_timeout(15000)
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(3500)

        jasa_info = await page.evaluate(
            """
            () => {
              const out = {jasa_text_found:false, jasa_img_src:null,
                           jasa_img_w:null, jasa_img_h:null, all_imgs:[]};
              const allEls = document.querySelectorAll('*');
              for (const el of allEls) {
                if (el.children.length === 0 && el.textContent &&
                    el.textContent.trim().toLowerCase() === 'jasa') {
                  out.jasa_text_found = true;
                  let p = el;
                  for (let i=0; i<6 && p; i++) {
                    const img = p.querySelector('img');
                    if (img) {
                      out.jasa_img_src = img.src;
                      out.jasa_img_w = img.naturalWidth;
                      out.jasa_img_h = img.naturalHeight;
                      out.jasa_img_complete = img.complete;
                      break;
                    }
                    p = p.parentElement;
                  }
                  break;
                }
              }
              document.querySelectorAll('img[src*="/cat-icons/"]').forEach((img) => {
                out.all_imgs.push({src: img.src, w: img.naturalWidth, h: img.naturalHeight});
              });
              return out;
            }
            """
        )
        log(f"  'Jasa' text found: {jasa_info['jasa_text_found']}")
        log(f"  Jasa img src: {jasa_info.get('jasa_img_src')}")
        log(f"  Jasa img size: {jasa_info.get('jasa_img_w')}x{jasa_info.get('jasa_img_h')} complete={jasa_info.get('jasa_img_complete')}")
        log(f"  Total cat-icons on homepage: {len(jasa_info['all_imgs'])}")
        for img in jasa_info["all_imgs"]:
            log(f"    {img['src']}  {img['w']}x{img['h']}")
        results["jasa_icon"] = jasa_info

        # Clip a screenshot of the category nav area.
        cat_box = await page.evaluate(
            """
            () => {
              const imgs = document.querySelectorAll('img[src*="/cat-icons/"]');
              if (!imgs.length) return null;
              let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
              imgs.forEach((img) => {
                const r = img.getBoundingClientRect();
                minX = Math.min(minX, r.left);
                minY = Math.min(minY, r.top);
                maxX = Math.max(maxX, r.right);
                maxY = Math.max(maxY, r.bottom);
              });
              return {x: minX-8, y: minY-8, w: (maxX-minX)+16, h: (maxY-minY)+16};
            }
            """
        )
        if cat_box and cat_box["w"] > 0:
            await page.screenshot(
                path=f"{SHOTS}/07-jasa-icon-area.png",
                clip={"x": cat_box["x"], "y": cat_box["y"],
                      "width": cat_box["w"], "height": cat_box["h"]}
            )
            log(f"  Saved 07-jasa-icon-area.png (clip {cat_box['w']}x{cat_box['h']})")

        # Full-page home screenshot.
        await page.screenshot(path=f"{SHOTS}/08-homepage-full.png")
        log("  Saved 08-homepage-full.png")
        await ctx3.close()

        # Write JSON results.
        with open(f"{SHOTS}/results.json", "w") as f:
            json.dump(results, f, indent=2, default=str)
        log("Wrote results.json")

        await browser.close()
        log("Done.")


if __name__ == "__main__":
    asyncio.run(main())
