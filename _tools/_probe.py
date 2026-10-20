import os, time, http.server, socketserver, threading
from playwright.sync_api import sync_playwright

DIST = r"d:\Web Designs\ST\_tools\elle-motion\dist"
PORT = 8872
handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=DIST, **k)
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

JS = """async (t) => {
  window.__ELLE__.seek(t);
  // Wait 2 paint frames like Playwright's screenshot() does, so we observe
  // the state a captured PNG would actually contain (catches ticker drift).
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return {sel, missing:true};
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {sel, opacity: cs.opacity, transform: cs.transform,
            y: Math.round(r.y), h: Math.round(r.height)};
  };
  return {
    script: document.querySelector('script[type=module]')?.src,
    problem: [pick('#problem .eyebrow'), pick('#problem h2'),
              pick('#problem .pain-grid .pain:nth-child(1)')],
    cta: [pick('#cta .logo'), pick('#cta .eyebrow'), pick('#cta .lead')],
  };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--hide-scrollbars"])
    pg = b.new_page(viewport={"width":1080,"height":1920})
    pg.add_init_script("window.__CAPTURE__ = true")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html?cb={int(time.time()*1000)}", wait_until="load")
    pg.wait_for_function("window.__ELLE__ && window.__ELLE__.ready === true", timeout=20000)
    for t in (9.6, 28.6):
        res = pg.evaluate(JS, t)
        print(f"\n===== t={t}  script={res['script']} =====")
        for grp in ("problem","cta"):
            print(f" [{grp}]")
            for e in res[grp]:
                print("   ", e)
    b.close()
httpd.shutdown()
