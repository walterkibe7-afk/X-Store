"""Motion-graphics promo for Elle (X-Store) — vertical 9:16 + landscape 16:9.
Pure local stack: PIL frames + moviepy + faster-whisper VO (serein, 10.44s).
PART 1/2: config, words, helpers. PART 2 appends scenes + build.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WORKSPACE = Path(__file__).resolve().parent.parent
VO = WORKSPACE / "assets" / "vo" / "x-store-vo-15s-serein.wav"
OUT_DIR = WORKSPACE / "assets" / "promo"
HERO_V = WORKSPACE / "assets" / "hero-mobile.webp"
HERO_H = WORKSPACE / "assets" / "hero-desktop.webp"
FPS = 30
VO_OFFSET = 0.5
TAIL = 1.2

WORDS_RAW = [
    (0.00, 0.62, "Pleasure,"), (1.02, 1.62, "Self-care,"),
    (2.04, 2.34, "Wellness,"), (2.80, 3.50, "made personal."),
    (4.08, 4.86, "Curated products,"), (4.86, 5.52, "delivered in"),
    (5.52, 6.38, "discreet packaging."), (6.92, 7.62, "Take the quiz."),
    (7.88, 8.70, "Find your match,"), (9.06, 10.22, "feel good your way."),
]
WORDS = [(s + VO_OFFSET, e + VO_OFFSET, w) for s, e, w in WORDS_RAW]
VO_DUR = 10.44
TOTAL = round(VO_OFFSET + VO_DUR + TAIL, 2)

CREAM = (232, 229, 234); INK = (37, 35, 38); GRAY = (88, 80, 94)
WHITE = (255, 255, 255); ACCENT = (78, 101, 114)

def font(size, bold=True):
    for p in ["C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
              "C:/Windows/Fonts/ArialNova-Bold.ttf" if bold else "C:/Windows/Fonts/ArialNova.ttf"]:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

PRODUCTS = [
    ("Silk Touch", "KSh 7,650", "BEST SELLER", ((231, 226, 236), (150, 140, 160))),
    ("After Dark Oil", "KSh 3,650", "", ((223, 228, 234), (140, 155, 170))),
    ("Midnight Gummies", "KSh 3,100", "NEW", ((226, 222, 231), (130, 125, 145))),
    ("Velvet Mini", "KSh 5,850", "", ((233, 228, 238), (145, 135, 155))),
]

def cover(img, W, H, zoom=1.0):
    w, h = img.size
    s = max(W / w, H / h) * zoom
    nw, nh = int(w * s), int(h * s)
    r = img.resize((nw, nh), Image.LANCZOS)
    x = (nw - W) // 2; y = (nh - H) // 2
    return r.crop((x, y, x + W, y + H)).convert("RGB")

def vgrad(W, H, top, bot):
    img = Image.new("RGB", (W, H), top)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / max(H - 1, 1)
        d.line([(0, y), (W, y)],
               fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return img

def wrap(d, text, fnt, max_w):
    words = text.split(); lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=fnt) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines

def scene_at(t):
    if t < 3.9:
        return 0
    if t < 7.0:
        return 1
    if t < 9.1:
        return 2
    return 3

def active_word(t):
    for i, (s, e, w) in enumerate(WORDS):
        if s <= t < e + 0.08:
            return i
    past = [i for i, (s, e, w) in enumerate(WORDS) if s <= t]
    return past[-1] if past else -1

def ease_out(x):
    x = min(max(x, 0), 1)
    return 1 - (1 - x) ** 3
def render_frame(t, W, H, hero_img):
    sc = scene_at(t)
    is_v = H > W
    mx = int(W * 0.08)
    if sc == 0:
        base = cover(hero_img, W, H, zoom=1.0 + 0.06 * (t / TOTAL))
        ov = Image.new("L", (W, H), 0)
        od = ImageDraw.Draw(ov)
        top = int(H * 0.28)
        for y in range(top, H):
            a = int(205 * ((y - top) / max(H - top - 1, 1)) ** 1.35)
            od.line([(0, y), (W, y)], fill=a)
        ov = ov.filter(ImageFilter.GaussianBlur(3))
        img = Image.composite(Image.new("RGB", (W, H), (22, 20, 25)), base, ov)
    else:
        img = vgrad(W, H, (242, 240, 243), (214, 209, 220))
    d = ImageDraw.Draw(img)
    cap_h = int(H * (0.060 if is_v else 0.075))
    cap_top = H - (cap_h + 14)
    if is_v:
        f_head = font(int(W * 0.088), True)
        f_sub = font(int(W * 0.038), False)
        f_cap = font(int(W * 0.042), True)
        f_small = font(int(W * 0.032), False)
        f_eye = font(int(W * 0.028), True)
    else:
        f_head = font(int(W * 0.060), True)
        f_sub = font(int(W * 0.024), False)
        f_cap = font(int(W * 0.026), True)
        f_small = font(int(W * 0.019), False)
        f_eye = font(int(W * 0.017), True)
    bw = int(W * min(t / TOTAL, 1.0))
    d.rectangle([0, 0, bw, max(4, H // 300)], fill=INK)
    labels = ["ELLE - INTIMATE WELLNESS", "CURATED - DISCREET",
              "FIND YOUR MATCH", "ELLE"]
    d.text((mx, int(H * 0.065)), labels[sc], font=f_eye,
           fill=WHITE if sc == 0 else GRAY)
    if sc == 0:
        head = ["Pleasure.", "Self-care.", "Wellness -", "made personal."]
        y = int(H * (0.50 if is_v else 0.40))
        for i, line in enumerate(head):
            a = ease_out((t - (0.5 + i * 0.7)) / 0.45)
            if a <= 0:
                y += int(W * (0.105 if is_v else 0.075))
                continue
            yy = y + int((1 - a) * 44)
            layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
            ld = ImageDraw.Draw(layer)
            ld.text((mx + 3, yy + 3), line, font=f_head, fill=(0, 0, 0, 140))
            ld.text((mx, yy), line, font=f_head,
                    fill=(255, 255, 255, int(255 * a)))
            img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
            d = ImageDraw.Draw(img)
            y += int(W * (0.105 if is_v else 0.075))
    elif sc == 1:
        y0 = int(H * 0.115)
        head1 = wrap(d, "Curated products,", f_head, W - 2 * mx)
        head2 = wrap(d, "discreet packaging.", f_head, W - 2 * mx)
        yy = y0
        for ln in head1:
            d.text((mx, yy), ln, font=f_head, fill=INK)
            yy += int(W * (0.115 if is_v else 0.080))
        for ln in head2:
            d.text((mx, yy), ln, font=f_head, fill=GRAY)
            yy += int(W * (0.115 if is_v else 0.080))
        gy = yy + int(W * 0.03)
        gw = W - 2 * mx
        avail = cap_top - gy - int(W * 0.02)
        gh = max(int(H * 0.24), min(int(H * 0.34), avail))
        gap = int(W * 0.035)
        cw, chh = (gw - gap) // 2, (gh - gap) // 2
        f_name = font(max(13, int(cw * 0.105)), True)
        for i, (name, price, badge, (c1, c2)) in enumerate(PRODUCTS):
            if t < 3.9 + i * 0.14:
                continue
            cx = mx + (i % 2) * (cw + gap)
            cy = gy + (i // 2) * (chh + gap)
            rise = int((1 - ease_out((t - 3.9 - i * 0.14) / 0.5)) * 60)
            card = vgrad(cw, chh, c1, c2)
            img.paste(card, (cx, cy + rise))
            dd = ImageDraw.Draw(img)
            dd.rounded_rectangle([cx, cy + rise, cx + cw, cy + rise + chh],
                                 radius=14, outline=WHITE, width=2)
            bw2 = int(cw * 0.30)
            bh2 = int(chh * 0.30)
            bx, by = cx + cw // 2, cy + rise + int(chh * 0.28)
            dd.rounded_rectangle([bx - bw2 // 2, by - bh2 // 2,
                                  bx + bw2 // 2, by + bh2 // 2],
                                 radius=bw2 // 2 - 2, fill=(246, 244, 247))
            dd.rectangle([bx - int(bw2 * 0.18), by - bh2 // 2 - int(chh * 0.05),
                          bx + int(bw2 * 0.18), by - bh2 // 2], fill=INK)
            nl = wrap(dd, name, f_name, cw - 20)
            ny = by + bh2 // 2 + 8
            for ln in nl:
                dd.text((cx + 10, ny), ln, font=f_name, fill=INK)
                ny += int(cw * 0.125)
            dd.text((cx + 10, ny + 2), price, font=f_small, fill=GRAY)
            if badge:
                bf = font(max(10, int(cw * 0.075)), True)
                pad = 8
                tw = dd.textlength(badge, font=bf)
                bx1 = cx + cw - tw - pad * 2 - 8
                dd.rounded_rectangle([bx1, cy + rise + 8,
                                      cx + cw - 8, cy + rise + 30],
                                     radius=11, fill=INK)
                dd.text((bx1 + pad, cy + rise + 12), badge, font=bf, fill=WHITE)
    elif sc == 2:
        y0 = int(H * 0.15)
        q1 = wrap(d, "Take the quiz.", f_head, W - 2 * mx)
        q2 = wrap(d, "Find your match.", f_head, W - 2 * mx)
        yy = y0
        for ln in q1:
            d.text((mx, yy), ln, font=f_head, fill=INK)
            yy += int(W * (0.115 if is_v else 0.080))
        for ln in q2:
            d.text((mx, yy), ln, font=f_head, fill=ACCENT)
            yy += int(W * (0.115 if is_v else 0.080))
        qy = yy + int(W * 0.02)
        avail = cap_top - qy - 100
        qh = max(int(H * 0.20), min(int(H * 0.28), avail))
        d.rounded_rectangle([mx, qy, W - mx, qy + qh], radius=24,
                            fill=WHITE, outline=(213, 208, 218), width=2)
        opts = ["Slow evenings", "Gentle starts", "Something new"]
        f_opt = font(int(W * (0.034 if is_v else 0.022)), False)
        for i, o in enumerate(opts):
            rh = int((qh - 40) / 3)
            oy = qy + 18 + i * rh
            on = (i == 0 and t > 7.35) or (i == 1 and t > 7.75)
            d.rounded_rectangle([mx + 18, oy, W - mx - 18, oy + rh - 8], radius=14,
                                fill=(232, 229, 234) if on else (246, 244, 247),
                                outline=INK if on else (213, 208, 218),
                                width=2 if on else 1)
            mark = "(x) " if on else "( ) "
            dd_txt = mark + o
            while d.textlength(dd_txt, font=f_opt) > W - 2 * mx - 70 and len(dd_txt) > 8:
                dd_txt = dd_txt[:-2]
            d.text((mx + 34, oy + 8), dd_txt, font=f_opt, fill=INK)
        py = qy + qh + 18
        ph = 58
        d.rounded_rectangle([mx, py, mx + int(W * 0.58), py + ph],
                            radius=29, fill=INK)
        d.text((mx + 24, py + 14), "Start the quiz  >", font=f_cap, fill=WHITE)
    else:
        y0 = int(H * (0.185 if is_v else 0.12))
        ce = W // 2
        f_logo = font(int(W * (0.22 if is_v else 0.12)), True)
        bb = d.textbbox((0, 0), "Elle", font=f_logo)
        d.text((ce - (bb[2] - bb[0]) / 2 - bb[0], y0), "Elle",
               font=f_logo, fill=INK)
        ce2 = "Intimate wellness, made personal."
        b2 = d.textbbox((0, 0), ce2, font=f_sub)
        d.text((ce - (b2[2] - b2[0]) / 2 - b2[0],
                y0 + int(W * (0.24 if is_v else 0.135))), ce2,
               font=f_sub, fill=GRAY)
        sy = y0 + int(W * (0.36 if is_v else 0.225))
        max_sh = cap_top - sy - 130
        sh = max(int(H * 0.18), min(int(H * (0.26 if is_v else 0.33)), max_sh))
        strip = cover(hero_img, W - 2 * mx, sh, zoom=1.05)
        img.paste(strip, (mx, sy))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([mx, sy, W - mx, sy + sh], radius=24,
                            outline=WHITE, width=3)
        by = sy + sh + 26
        d.rounded_rectangle([mx, by, W - mx, by + 70], radius=35, fill=INK)
        ctxt = "Shop Elle  >"
        b3 = d.textbbox((0, 0), ctxt, font=f_cap)
        d.text((ce - (b3[2] - b3[0]) / 2 - b3[0], by + 17), ctxt,
               font=f_cap, fill=WHITE)
        note = "Discreet packaging - Secure checkout"
        d.text((mx, by + 82), note, font=f_small, fill=GRAY)

    ai = active_word(t)
    img.paste(Image.new("RGB", (W, cap_h + 20), (22, 20, 25)),
              (0, cap_top))
    d = ImageDraw.Draw(img)
    if 0 <= ai < len(WORDS):
        txt = WORDS[ai][2]
        bb = d.textbbox((0, 0), txt, font=f_cap)
        tw = bb[2] - bb[0]
        d.text((W / 2 - tw / 2 - bb[0], cap_top + 8), txt, font=f_cap,
               fill=(255, 205, 140))
    if t < 0.35:
        img = Image.blend(Image.new("RGB", img.size, (22, 20, 25)), img, t / 0.35)
    if t > TOTAL - 0.5:
        img = Image.blend(img, Image.new("RGB", img.size, (22, 20, 25)),
                          (t - (TOTAL - 0.5)) / 0.5)
    return img


def build_one(W, H, hero_path, out_path):
    from moviepy import ImageSequenceClip, AudioFileClip, CompositeAudioClip
    import numpy as np
    hero = Image.open(hero_path).convert("RGB")
    n = int(TOTAL * FPS)
    frames = []
    for i in range(n):
        frames.append(np.asarray(render_frame(i / FPS, W, H, hero)))
        if i % 90 == 0:
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
    print(f"VO {VO} total {TOTAL}s @{FPS}fps", flush=True)
    print("Building 9:16 ...", flush=True)
    build_one(1080, 1920, HERO_V, OUT_DIR / "elle-promo-9x16.mp4")
    print("Building 16:9 ...", flush=True)
    build_one(1920, 1080, HERO_H, OUT_DIR / "elle-promo-16x9.mp4")
    print("DONE:", [str(p) for p in OUT_DIR.glob("*.mp4")])


if __name__ == "__main__":
    main()