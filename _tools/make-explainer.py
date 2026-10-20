"""Elle explainer v2 — problem -> guide -> solve. 31.6s Serein VO, DM Sans.
Scenes driven by elle-explainer-timings.json (8 sentences).
Outputs: assets/promo/elle-explainer-9x16.mp4 + elle-explainer-16x9.mp4
Run: python make-explainer.py
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WORKSPACE = Path(__file__).resolve().parent.parent
VO = WORKSPACE / "assets" / "vo" / "elle-explainer-serein.wav"
OUT_DIR = WORKSPACE / "assets" / "promo"
HERO_V = WORKSPACE / "assets" / "hero-mobile.webp"
HERO_H = WORKSPACE / "assets" / "hero-desktop.webp"
F_BOLD = WORKSPACE / "assets" / "promo" / "DMSans-Bold.ttf"
F_REG = WORKSPACE / "assets" / "promo" / "DMSans-Regular.ttf"
FPS = 30
VO_OFFSET = 0.6
TAIL = 1.4

TIM = json.loads((WORKSPACE / "assets" / "vo" / "elle-explainer-timings.json").read_text())
SEGS = TIM["segments"]
VO_DUR = TIM["duration"]
TOTAL = round(VO_OFFSET + VO_DUR + TAIL, 2)
WORDS = []
for s in SEGS:
    for w in s["words"]:
        WORDS.append((w["start"] + VO_OFFSET, w["end"] + VO_OFFSET, w["word"]))
SSTART = [s["start"] + VO_OFFSET for s in SEGS]

INK = (37, 35, 38); GRAY = (88, 80, 94); WHITE = (255, 255, 255)
ACCENT = (78, 101, 114); GOLD = (255, 205, 140)

def font(size, bold=True):
    p = F_BOLD if bold else F_REG
    try:
        return ImageFont.truetype(str(p), size)
    except Exception:
        return ImageFont.load_default()

def ease_out(x):
    x = min(max(x, 0), 1)
    return 1 - (1 - x) ** 3

def cover(img, W, H, zoom=1.0):
    w, h = img.size
    s = max(W / w, H / h) * zoom
    nw, nh = int(w * s), int(h * s)
    r = img.resize((nw, nh), Image.LANCZOS)
    x = (nw - W) // 2; y = (nh - H) // 2
    return r.crop((x, y, x + W, y + H)).convert("RGB")

def vgrad(W, H, top, bot):
    base = Image.new("RGB", (W, H), top)
    d = ImageDraw.Draw(base)
    for y in range(H):
        t = y / max(H - 1, 1)
        d.line([(0, y), (W, y)],
               fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return base

def wrap(d, text, fnt, max_w):
    out, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if d.textlength(t, font=fnt) <= max_w or not cur:
            cur = t
        else:
            out.append(cur); cur = w
    if cur:
        out.append(cur)
    return out

def scene_at(t):
    # 6 scenes mapped to 8 sentences:
    # 0 hook S0-S1, 1 problem S2, 2 pivot S3, 3 quiz S4, 4 match+discreet S5-S6, 5 CTA S7
    if t < SSTART[2]:
        return 0
    if t < SSTART[3]:
        return 1
    if t < SSTART[4]:
        return 2
    if t < SSTART[5]:
        return 3
    if t < SSTART[7]:
        return 4
    return 5
def active_word(t):
    for i, (s, e, w) in enumerate(WORDS):
        if s <= t < e + 0.06:
            return i
    past = [i for i, (s, e, w) in enumerate(WORDS) if s <= t]
    return past[-1] if past else -1


def render_frame(t, W, H, hero_img):
    sc = scene_at(t)
    is_v = H > W
    mx = int(W * 0.08)
    cap_h = int(H * (0.060 if is_v else 0.075))
    cap_top = H - (cap_h + 14)
    f_head = font(int(W * (0.082 if is_v else 0.055)), True)
    f_sub = font(int(W * (0.038 if is_v else 0.024)), False)
    f_cap = font(int(W * (0.042 if is_v else 0.026)), True)
    f_small = font(int(W * (0.030 if is_v else 0.019)), False)
    f_eye = font(int(W * 0.028 if is_v else 0.017), True)
    line_step = int(W * (0.100 if is_v else 0.068))
    if sc == 0:
        base = cover(hero_img, W, H, zoom=1.0 + 0.05 * (t / TOTAL))
        ov = Image.new("L", (W, H), 0)
        od = ImageDraw.Draw(ov)
        top = int(H * 0.30)
        for y in range(top, H):
            a = int(205 * ((y - top) / max(H - top - 1, 1)) ** 1.35)
            od.line([(0, y), (W, y)], fill=a)
        img = Image.composite(Image.new("RGB", (W, H), (22, 20, 25)), base,
                              ov.filter(ImageFilter.GaussianBlur(3)))
    else:
        img = vgrad(W, H, (242, 240, 243), (214, 209, 220))
    d = ImageDraw.Draw(img)
    bw = int(W * min(t / TOTAL, 1.0))
    d.rectangle([0, 0, bw, max(4, H // 300)], fill=INK)
    labels = ["ELLE - INTIMATE WELLNESS", "THE PROBLEM", "ELLE GUIDES YOU",
              "STEP 1 - THE QUIZ", "YOUR MATCH - DISCREET", "ELLE"]
    d.text((mx, int(H * 0.060)), labels[sc], font=f_eye,
           fill=WHITE if sc == 0 else GRAY)
    if sc == 0:
        lines = ["Not sure", "where to start?", "You're not alone."]
        y = int(H * (0.52 if is_v else 0.42))
        for i, ln in enumerate(lines):
            a = ease_out((t - (VO_OFFSET + i * 0.6)) / 0.5)
            if a <= 0:
                y += line_step
                continue
            lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
            ld = ImageDraw.Draw(lay)
            yy = y + int((1 - a) * 40)
            ld.text((mx + 3, yy + 3), ln, font=f_head, fill=(0, 0, 0, 140))
            ld.text((mx, yy), ln, font=f_head,
                    fill=(255, 255, 255, int(255 * a)))
            img = Image.alpha_composite(img.convert("RGBA"), lay).convert("RGB")
            d = ImageDraw.Draw(img)
            y += line_step
        for ln in wrap(d, "Intimate wellness, made personal.", f_sub, W - 2 * mx):
            d.text((mx, y + 6), ln, font=f_sub, fill=(236, 233, 239))
            y += int(W * 0.048)
    elif sc == 1:
        y0 = int(H * 0.105)
        q = wrap(d, "What's getting in the way?", f_head, W - 2 * mx)
        for j, ln in enumerate(q):
            d.text((mx, y0 + j * line_step), ln, font=f_head, fill=INK)
        gy = y0 + len(q) * line_step + int(W * 0.03)
        pains = [("Too many choices", "Endless guessing"),
                 ("Awkward packaging", "No privacy"),
                 ("Guesswork", "Nothing feels right")]
        avail = cap_top - gy - 10
        ch = min(int(H * 0.13), avail // 3 - 14)
        for i, (a1, a2) in enumerate(pains):
            if t < SSTART[2] + i * 0.35:
                continue
            rise = int((1 - ease_out((t - SSTART[2] - i * 0.35) / 0.45)) * 50)
            cy = gy + i * (ch + 14) + rise
            d.rounded_rectangle([mx, cy, W - mx, cy + ch], radius=18, fill=WHITE,
                                outline=(213, 208, 218), width=2)
            d.text((mx + 22, cy + 12), a1, font=f_sub, fill=INK)
            d.text((mx + 22, cy + 12 + int(W * 0.048)), a2, font=f_small, fill=GRAY)
    elif sc == 2:
        y0 = int(H * 0.18)
        a = ease_out((t - SSTART[3]) / 0.5)
        ce = W // 2
        f_big = font(int(W * (0.13 if is_v else 0.085)), True)
        for j, ln in enumerate(["So Elle", "guides you."]):
            bb = d.textbbox((0, 0), ln, font=f_big)
            yy = y0 + j * int(W * (0.15 if is_v else 0.10)) + int((1 - a) * 40)
            d.text((ce - (bb[2] - bb[0]) / 2 - bb[0], yy), ln, font=f_big,
                   fill=ACCENT if j == 1 else INK)
        qy = y0 + int(W * (0.42 if is_v else 0.30))
        steps = ["Answer 5 questions", "Get your match", "Discreet delivery"]
        for i, s in enumerate(steps):
            on = t > SSTART[3] + 0.5 + i * 0.4
            sy = qy + i * int(W * (0.135 if is_v else 0.095))
            d.ellipse([mx, sy, mx + 34, sy + 34], fill=INK if on else WHITE,
                      outline=INK, width=2)
            if on:
                d.text((mx + 12, sy + 3), ">", font=f_small, fill=WHITE)
            d.text((mx + 46, sy + 4), s, font=f_sub, fill=INK if on else GRAY)
    elif sc == 3:
        y0 = int(H * 0.105)
        q = wrap(d, "Five quick questions.", f_head, W - 2 * mx)
        for j, ln in enumerate(q):
            d.text((mx, y0 + j * line_step), ln, font=f_head, fill=INK)
        gy = y0 + line_step + int(W * 0.02)
        qs = [("01", "Your vibe"), ("02", "Your focus"), ("03", "Comfort"),
              ("04", "What matters"), ("05", "Price range")]
        avail = cap_top - gy - 96
        rh = max(int(H * 0.055), min(int(H * 0.075), avail // 5 - 8))
        for i, (num, txt) in enumerate(qs):
            if t < SSTART[4] + i * 0.45:
                continue
            rise = int((1 - ease_out((t - SSTART[4] - i * 0.45) / 0.4)) * 40)
            oy = gy + i * (rh + 8) + rise
            on = t > SSTART[4] + i * 0.45 + 0.35
            d.rounded_rectangle([mx, oy, W - mx, oy + rh], radius=14,
                                fill=(232, 229, 234) if on else WHITE,
                                outline=INK if on else (213, 208, 218),
                                width=2 if on else 1)
            d.text((mx + 18, oy + rh // 2 - 12), num, font=f_small, fill=GRAY)
            d.text((mx + 62, oy + rh // 2 - 12), txt, font=f_sub, fill=INK)
            if on:
                d.ellipse([W - mx - 34, oy + rh // 2 - 10,
                           W - mx - 14, oy + rh // 2 + 10], fill=INK)
        py = gy + 5 * (rh + 8) + 10
        d.rounded_rectangle([mx, py, mx + int(W * 0.52), py + 52],
                            radius=26, fill=INK)
        d.text((mx + 22, py + 13), "1 minute >", font=f_cap, fill=WHITE)
    elif sc == 4:
        y0 = int(H * 0.105)
        q = wrap(d, "Matched. Discreet.", f_head, W - 2 * mx)
        for j, ln in enumerate(q):
            d.text((mx, y0 + j * line_step), ln, font=f_head, fill=INK)
        gy = y0 + line_step + int(W * 0.03)
        d.rounded_rectangle([mx, gy, W - mx, gy + int(H * 0.185)], radius=20,
                            fill=WHITE, outline=(213, 208, 218), width=2)
        d.text((mx + 20, gy + 18), "YOUR MATCH", font=f_eye, fill=ACCENT)
        d.text((mx + 20, gy + 50), "Chosen for you >", font=f_sub, fill=INK)
        d.text((mx + 20, gy + 50 + int(W * 0.058)), "KSh 3,100 - 7,650",
               font=f_small, fill=GRAY)
        by = gy + int(H * 0.185) + 16
        feats = [("Plain box", "No labels outside"),
                 ("Secure checkout", "Private and safe"),
                 ("Real support", "Here to help")]
        for i, (f1, f2) in enumerate(feats):
            if t < SSTART[5] + 0.6 + i * 0.4:
                continue
            rise = int((1 - ease_out((t - SSTART[5] - 0.6 - i * 0.4) / 0.4)) * 36)
            fy = by + i * int(W * (0.135 if is_v else 0.09)) + rise
            d.rounded_rectangle([mx, fy, W - mx,
                                 fy + int(W * (0.115 if is_v else 0.075))],
                                radius=14, fill=(232, 229, 234))
            d.text((mx + 18, fy + 8), f1, font=f_sub, fill=INK)
            d.text((mx + 18, fy + 8 + int(W * 0.048)), f2,
                   font=f_small, fill=GRAY)
    else:
        y0 = int(H * (0.15 if is_v else 0.10))
        ce = W // 2
        f_logo = font(int(W * (0.20 if is_v else 0.11)), True)
        bb = d.textbbox((0, 0), "Elle", font=f_logo)
        d.text((ce - (bb[2] - bb[0]) / 2 - bb[0], y0), "Elle",
               font=f_logo, fill=INK)
        ce2 = "Take the Elle Match quiz."
        b2 = d.textbbox((0, 0), ce2, font=f_sub)
        d.text((ce - (b2[2] - b2[0]) / 2 - b2[0],
                y0 + int(W * (0.22 if is_v else 0.125))), ce2,
               font=f_sub, fill=GRAY)
        sy = y0 + int(W * (0.32 if is_v else 0.20))
        max_sh = cap_top - sy - 140
        sh = max(int(H * 0.16), min(int(H * (0.24 if is_v else 0.30)), max_sh))
        strip = cover(hero_img, W - 2 * mx, sh, zoom=1.05)
        img.paste(strip, (mx, sy))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([mx, sy, W - mx, sy + sh], radius=22,
                            outline=WHITE, width=3)
        by = sy + sh + 22
        d.rounded_rectangle([mx, by, W - mx, by + 64], radius=32, fill=INK)
        ctxt = "Find your match  >"
        b3 = d.textbbox((0, 0), ctxt, font=f_cap)
        d.text((ce - (b3[2] - b3[0]) / 2 - b3[0], by + 15), ctxt,
               font=f_cap, fill=WHITE)
    ai = active_word(t)
    img.paste(Image.new("RGB", (W, cap_h + 14), (22, 20, 25)), (0, cap_top))
    d = ImageDraw.Draw(img)
    if 0 <= ai < len(WORDS):
        txt = WORDS[ai][2]
        bb = d.textbbox((0, 0), txt, font=f_cap)
        d.text((W / 2 - (bb[2] - bb[0]) / 2 - bb[0], cap_top + 6), txt,
               font=f_cap, fill=GOLD)
    if t < 0.4:
        img = Image.blend(Image.new("RGB", img.size, (22, 20, 25)), img, t / 0.4)
    if t > TOTAL - 0.6:
        img = Image.blend(img, Image.new("RGB", img.size, (22, 20, 25)),
                          (t - (TOTAL - 0.6)) / 0.6)
    return img


def build_one(W, H, hero_path, out_path):
    from moviepy import ImageSequenceClip, AudioFileClip, CompositeAudioClip
    import numpy as np
    hero = Image.open(hero_path).convert("RGB")
    n = int(TOTAL * FPS)
    frames = []
    for i in range(n):
        frames.append(np.asarray(render_frame(i / FPS, W, H, hero)))
        if i % 120 == 0:
            print(f"  frame {i}/{n}", flush=True)
    clip = ImageSequenceClip(frames, fps=FPS)
    vo = AudioFileClip(str(VO))
    audio = CompositeAudioClip([vo.with_start(VO_OFFSET)]).with_duration(TOTAL)
    video = clip.with_audio(audio).with_duration(TOTAL)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    video.write_videofile(str(out_path), fps=FPS, codec="libx264",
                          audio_codec="aac", preset="medium",
                          bitrate="6000k", audio_bitrate="160k")


def main():
    print(f"VO {VO} {VO_DUR:.1f}s total {TOTAL}s @{FPS}fps", flush=True)
    print("Building 9:16 ...", flush=True)
    build_one(1080, 1920, HERO_V, OUT_DIR / "elle-explainer-9x16.mp4")
    print("Building 16:9 ...", flush=True)
    build_one(1920, 1080, HERO_H, OUT_DIR / "elle-explainer-16x9.mp4")
    print("DONE")


if __name__ == "__main__":
    main()