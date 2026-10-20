import json, urllib.request, urllib.error

BASE = "http://127.0.0.1:8787"
results = []

def raw(method, path, headers=None, body=None):
    req = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers or {})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

def check(name, cond, detail=""):
    results.append(("PASS" if cond else "FAIL", name, detail))

# --- 1. 404 page ---
code, hdr, body = raw("GET", "/this-page-does-not-exist")
check("unknown path -> 404 status", code == 404, str(code))
check("404 body is the 404 page", b"404" in body and b"doesn't exist" in body,
      body[:120].decode("utf-8", "replace"))
check("404 page has no-cache", hdr.get("Cache-Control", "") == "no-cache", hdr.get("Cache-Control", ""))

# --- 2. unknown API -> JSON 404 ---
code, hdr, body = raw("GET", "/api/does-not-exist")
check("unknown /api -> 404 JSON", code == 404 and b"error" in body,
      f"code={code} body={body[:80]}")
check("unknown /api content-type json", "application/json" in hdr.get("Content-Type", ""), hdr.get("Content-Type", ""))

# --- 3. receipt page ---
code, hdr, body = raw("GET", "/receipt.html")
check("receipt.html loads", code == 200 and b"RECEIPT" in body, str(code))
code, _, body = raw("GET", "/receipt.js")
check("receipt.js loads", code == 200 and b"print-receipt" in body, str(code))
code, _, body = raw("GET", "/order-confirmation.html")
check("confirmation links to receipt", code == 200 and b'receipt.html' in body, str(code))

# --- 4. Expires/Cache-Control on components ---
code, hdr, body = raw("GET", "/style.css", {"Accept-Encoding": "identity"})
check("CSS Cache-Control 30d immutable", hdr.get("Cache-Control", "") == "public, max-age=2592000, immutable", hdr.get("Cache-Control", ""))
code, hdr, _ = raw("GET", "/index.html", {"Accept-Encoding": "identity"})
check("HTML Cache-Control no-cache", hdr.get("Cache-Control", "") == "no-cache", hdr.get("Cache-Control", ""))
code, hdr, _ = raw("GET", "/favicon.ico", {"Accept-Encoding": "identity"})
check("image/favicon Cache-Control set", "max-age=" in hdr.get("Cache-Control", ""), hdr.get("Cache-Control", ""))
code, hdr, _ = raw("GET", "/", {"Accept-Encoding": "identity"})
check("root page Cache-Control no-cache", hdr.get("Cache-Control", "") == "no-cache", hdr.get("Cache-Control", ""))

# --- 5. gzip ---
code, hdr, body = raw("GET", "/style.css", {"Accept-Encoding": "gzip, deflate"})
check("CSS served gzipped", hdr.get("Content-Encoding", "") == "gzip", hdr.get("Content-Encoding", ""))
check("gzip Vary header", "Accept-Encoding" in hdr.get("Vary", ""), hdr.get("Vary", ""))
code, hdr, body = raw("GET", "/index.html", {"Accept-Encoding": "gzip"})
check("HTML served gzipped", hdr.get("Content-Encoding", "") == "gzip", hdr.get("Content-Encoding", ""))
# decompress to prove integrity
import gzip, io
code, hdr, body = raw("GET", "/receipt.js", {"Accept-Encoding": "gzip"})
if hdr.get("Content-Encoding") == "gzip":
    text = gzip.decompress(body).decode("utf-8", "replace")
    check("gzipped JS decompresses intact", "print-receipt" in text, text[:60])
else:
    check("gzipped JS decompresses intact", False, "not gzipped")
code, hdr, _ = raw("GET", "/favicon.ico", {"Accept-Encoding": "gzip"})
check("binary NOT gzipped (already small)", hdr.get("Content-Encoding", "") in ("", None), str(hdr.get("Content-Encoding")))

# --- 6. API cache policy ---
code, hdr, _ = raw("GET", "/api/products", {"Accept-Encoding": "gzip"})
check("GET /api/products public 60s", hdr.get("Cache-Control", "") == "public, max-age=60", hdr.get("Cache-Control", ""))
code, hdr, _ = raw("GET", "/api/health")
check("API health no-store", hdr.get("Cache-Control", "") == "no-store", hdr.get("Cache-Control", ""))

# --- 7. regression: old suite still passes ---
import subprocess, sys
p = subprocess.run([sys.executable, r"_tests\verify_api.py"], capture_output=True, text=True, cwd=r"D:\Web Designs\ST")
last = [l for l in p.stdout.strip().splitlines() if "passed" in l]
check("full regression suite", p.returncode == 0 and last and " 0 failed" in last[0], (last or [p.stdout[-300:] + p.stderr[-300:]])[0])

print("\n===== 404 / RECEIPT / CACHE / GZIP RESULTS =====")
fails = 0
for status, name, detail in results:
    if status == "FAIL":
        fails += 1
    print(f"[{status}] {name}" + (f"  -> {detail}" if status == "FAIL" else ""))
print(f"\n{len(results)-fails}/{len(results)} passed, {fails} failed")
sys.exit(1 if fails else 0)
