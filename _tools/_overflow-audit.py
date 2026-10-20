"""Audit horizontal overflow on every Elle page at mobile/tablet widths.
Reports which elements extend beyond the viewport so fixes target real bugs.
"""
from playwright.sync_api import sync_playwright
import http.server, socketserver, threading, functools, os, json

PORT = 8391
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

PAGES = ["index.html", "shop.html", "cart.html", "checkout.html", "login.html",
         "signup.html", "product.html", "about.html", "help.html", "quiz.html",
         "account.html", "order-confirmation.html", "privacy.html", "terms.html", "404.html"]

JS = """
() => {
  const vw = document.documentElement.clientWidth;
  const overflows = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') return;
      overflows.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 60) : '',
        id: el.id || '',
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width)
      });
    }
  });
  // Only show the outer-most offenders (skip elements whose parent already overflows identically)
  return { vw, scrollW: document.documentElement.scrollWidth, overflows: overflows.slice(0, 14) };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for page in PAGES:
        for w in (320, 375, 390, 430, 768):
            pg = b.new_page(viewport={"width": w, "height": 900})
            try:
                pg.goto(f"http://127.0.0.1:{PORT}/{page}", wait_until="networkidle", timeout=15000)
            except Exception:
                pg.goto(f"http://127.0.0.1:{PORT}/{page}", timeout=15000)
            pg.wait_for_timeout(700)
            res = pg.evaluate(JS)
            flag = "OVERFLOW" if res["scrollW"] > res["vw"] else "ok"
            print(f"{flag} {page} @{w}px  scrollW={res['scrollW']} vw={res['vw']}")
            if res["scrollW"] > res["vw"]:
                seen = set()
                for o in res["overflows"]:
                    key = (o["tag"], o["cls"], o["id"])
                    if key in seen: continue
                    seen.add(key)
                    print(f"    <{o['tag']} class='{o['cls']}' id='{o['id']}'> L={o['left']} R={o['right']} W={o['w']}")
            pg.close()
    b.close()
httpd.shutdown()
print("AUDIT DONE")
