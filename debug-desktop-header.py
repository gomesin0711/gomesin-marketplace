#!/usr/bin/env python3
"""Quick debug: inspect desktop header DOM more thoroughly."""
import json, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000/"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=2)
    page = ctx.new_page()
    page.add_init_script("""
        try {
          localStorage.setItem('gomesin-pwa-installed','1');
          localStorage.setItem('gomesin-pwa-hard-dismissed', String(Date.now()));
          sessionStorage.setItem('gomesin-pwa-session-dismissed','1');
          localStorage.setItem('pwaInstallDismissed','1');
          localStorage.setItem('pwaInstallShown','1');
        } catch(e) {}
    """)
    page.goto(URL, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_selector("article[data-listing-id]", timeout=20000)
    time.sleep(1.5)
    # click first listing
    for art in page.locator("article[data-listing-id]").all()[:5]:
        try:
            if not art.is_visible(timeout=400):
                continue
            box = art.bounding_box()
            if not box or box["width"] < 100:
                continue
            art.click(timeout=3000)
            page.wait_for_selector("div.cursor-zoom-in", timeout=10000)
            break
        except Exception:
            continue
    time.sleep(1.5)

    info = page.evaluate("""
        () => {
          const header = document.querySelector('header, [role="banner"]');
          if (!header) return {header: null};
          const r = header.getBoundingClientRect();
          // List all input elements inside header
          const inputs = Array.from(header.querySelectorAll('input')).map(inp => {
            const ir = inp.getBoundingClientRect();
            return {
              type: inp.type,
              placeholder: inp.placeholder,
              value: inp.value,
              visible: inp.offsetParent !== null,
              rect: {x: Math.round(ir.x), y: Math.round(ir.y),
                     w: Math.round(ir.width), h: Math.round(ir.height)},
              classes: inp.className.slice(0, 200),
            };
          });
          // Look for search box element (form[role=search], form > input, etc.)
          const forms = Array.from(header.querySelectorAll('form')).map(f => {
            const fr = f.getBoundingClientRect();
            return {
              role: f.getAttribute('role'),
              ariaLabel: f.getAttribute('aria-label'),
              rect: {x: Math.round(fr.x), y: Math.round(fr.y),
                     w: Math.round(fr.width), h: Math.round(fr.height)},
            };
          });
          // Logo presence
          const logos = Array.from(header.querySelectorAll('img')).map(img => {
            const ir = img.getBoundingClientRect();
            return {alt: img.alt, src: img.src.slice(0, 80),
                    rect: {x: Math.round(ir.x), y: Math.round(ir.y),
                           w: Math.round(ir.width), h: Math.round(ir.height)}};
          });
          // Brand text spans (BeliMesin)
          const spans = Array.from(header.querySelectorAll('span')).map(s => {
            const t = (s.textContent || '').trim();
            if (!t || t.length > 30) return null;
            const ir = s.getBoundingClientRect();
            if (ir.width === 0) return null;
            return {text: t, rect: {x: Math.round(ir.x), y: Math.round(ir.y),
                                     w: Math.round(ir.width), h: Math.round(ir.height)}};
          }).filter(Boolean);
          // Nav elements
          const navs = Array.from(header.querySelectorAll('nav, [role="navigation"]')).map(n => {
            const nr = n.getBoundingClientRect();
            return {rect: {x: Math.round(nr.x), y: Math.round(nr.y),
                           w: Math.round(nr.width), h: Math.round(nr.height)},
                    visible: n.offsetParent !== null};
          });
          // Also check entire page top for nav (just below header)
          const pageNavs = Array.from(document.querySelectorAll('nav, [role="navigation"]')).map(n => {
            const nr = n.getBoundingClientRect();
            return {rect: {x: Math.round(nr.x), y: Math.round(nr.y),
                           w: Math.round(nr.width), h: Math.round(nr.height)},
                    visible: n.offsetParent !== null};
          });
          return {
            header: {
              rect: {x: Math.round(r.x), y: Math.round(r.y),
                     w: Math.round(r.width), h: Math.round(r.height)},
              classes: header.className.slice(0, 200),
            },
            inputs,
            forms,
            logos,
            spans,
            header_navs: navs,
            page_navs: pageNavs,
          };
        }
    """)
    print(json.dumps(info, indent=2))
    ctx.close()
    browser.close()
