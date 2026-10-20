#!/usr/bin/env python3
"""Capture the Elle motion story (Lenis + GSAP) frame-by-frame and mux the VO.

The page exposes window.__ELLE__.seek(t) driven by a paused GSAP master timeline,
so every frame is deterministic and VO-syncable. We screenshot each 1/fps step,
then assemble with ffmpeg + the (unstretched) Serein VO.

Usage:
  python capture-explainer.py            # smoke: 6 sample frames per aspect
  python capture-explainer.py --full     # full render + ffmpeg mux (9x16 + 16x9)
"""
import os
import sys
import math
import shutil
import subprocess
import http.server
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = r"d:\Web Designs\ST"
MOTION = os.path.join(ROOT, "_tools", "elle-motion")
DIST = os.path.join(MOTION, "dist")
VO = os.path.join(ROOT, "assets", "vo", "elle-explainer-serein-1.0.wav")
OUT = os.path.join(ROOT, "assets", "promo")

FPS = 30
DURATION = 30.0
PORT = 8871

ASPECTS = {
    "9x16": (1080, 1920),
    "16x9": (1920, 1080),
}
# Word-anchored checks: each time validates a pop boundary (absent just before
# its word / present just after) or a scene-complete state.
# 5.84 slide done + card1 NOT yet · 9.50 all 3 cards · 11.10 pivot settled
# 16.50 guide complete · 19.60 match build · 23.60 support chip · 24.50 CTA lead
# 25.90 logo+pill · 29.50 endcard hold
SMOKE_TIMES = [5.84, 9.50, 11.10, 16.50, 19.60, 23.60, 24.50, 25.90, 29.50]


def serve_dist():
    """Serve dist/ over http on a background thread (ES modules need http)."""
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(
        *a, directory=DIST, **k)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def capture_aspect(page, tag, w, h, full, times):
    frames_dir = os.path.join(OUT, f"_frames_{tag}")
    if full and os.path.isdir(frames_dir):
        shutil.rmtree(frames_dir)
    if full:
        os.makedirs(frames_dir, exist_ok=True)

    page.set_viewport_size({"width": w, "height": h})
    # Disable story.js's live Lenis/ticker branch — it would otherwise tween
    # mtl.time back toward the scroll target between seek() and screenshot.
    page.add_init_script("window.__CAPTURE__ = true")
    page.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
    page.wait_for_function("window.__ELLE__ && window.__ELLE__.ready === true", timeout=20000)
    # settle fonts + first paint
    page.evaluate("window.__ELLE__.seek(0)")
    page.wait_for_timeout(150)

    step_times = times
    if full:
        n = int(round(DURATION * FPS))
        step_times = [i / FPS for i in range(n)]

    for idx, t in enumerate(step_times):
        page.evaluate(f"window.__ELLE__.seek({t:.4f})")
        if full:
            path = os.path.join(frames_dir, f"{idx:05d}.png")
            page.screenshot(path=path)
        else:
            path = os.path.join(OUT, f"_story_{tag}_{idx}.png")
            page.screenshot(path=path)
    return len(step_times)


def assemble(tag, w, h):
    frames_dir = os.path.join(OUT, f"_frames_{tag}")
    out_mp4 = os.path.join(OUT, f"elle-motion-{tag}.mp4")
    n = int(round(DURATION * FPS))
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(frames_dir, "%05d.png"),
        "-i", VO,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-r", str(FPS), "-crf", "20", "-preset", "medium",
        "-c:a", "aac", "-b:a", "160k",
        "-t", str(DURATION),
        "-movflags", "+faststart",
        out_mp4,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return out_mp4


def main():
    full = "--full" in sys.argv
    times = SMOKE_TIMES
    httpd = serve_dist()
    print(f"serving {DIST} on :{PORT}  ({'FULL' if full else 'SMOKE'})")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--force-color-profile=srgb",
                                              "--disable-lcd-text",
                                              "--hide-scrollbars"])
            results = {}
            for tag, (w, h) in ASPECTS.items():
                page = browser.new_page(viewport={"width": w, "height": h},
                                        device_scale_factor=1)
                cnt = capture_aspect(page, tag, w, h, full, times)
                results[tag] = cnt
                page.close()
                print(f"  {tag}: {cnt} frames @ {w}x{h}")
            browser.close()
    finally:
        httpd.shutdown()

    if full:
        for tag, (w, h) in ASPECTS.items():
            mp4 = assemble(tag, w, h)
            size_mb = round(os.path.getsize(mp4) / 1e6, 2)
            print(f"  wrote {mp4}  ({size_mb} MB)")


if __name__ == "__main__":
    main()
