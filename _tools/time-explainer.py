"""Silence-split VO into sentence segments, map to known script, save timings JSON.
Fast + deterministic: ground-truth text is known, Whisper small on CPU is too slow.
"""
import json
import numpy as np

VO = "d:/Web Designs/ST/assets/vo/elle-explainer-serein-1.0.wav"
OUT = "d:/Web Designs/ST/assets/vo/elle-explainer-timings.json"

SENTENCES = [
    "Not sure where to start? You're not alone.",
    "Intimate wellness should feel personal, not overwhelming.",
    "Too many choices, awkward packaging, and guesswork get in the way.",
    "So Elle guides you.",
    "Answer five quick questions about your vibe, your focus, and what matters to you.",
    "We match you to what fits, no guesswork.",
    "Everything arrives in plain, discreet packaging, with secure checkout and real support.",
    "Take the Elle Match quiz, find what feels right, and feel good, your way.",
]

import librosa
y, sr = librosa.load(VO, sr=24000, mono=True)
print(f"loaded {len(y)/sr:.2f}s sr={sr}", flush=True)

# speech / silence mask
hop = 512
rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
thr = float(np.max(rms)) * 0.06
speech = rms > thr

# smooth: fill gaps < 0.20s, drop blips < 0.25s
min_gap = int(0.20 * sr / hop)
min_len = int(0.25 * sr / hop)
mask = speech.copy()
# fill short gaps
i = 0
n = len(mask)
while i < n:
    if not mask[i]:
        j = i
        while j < n and not mask[j]:
            j += 1
        if j - i <= min_gap and i > 0 and j < n:
            mask[i:j] = True
        i = j
    else:
        i += 1
# find runs
segs = []
i = 0
while i < n:
    if mask[i]:
        j = i
        while j < n and mask[j]:
            j += 1
        if j - i >= min_len:
            segs.append((float(times[i]), float(times[j - 1])))
        i = j
    else:
        i += 1

print(f"found {len(segs)} segments (expect {len(SENTENCES)})", flush=True)
for k, (s, e) in enumerate(segs):
    print(f"  seg{k}: {s:.2f}-{e:.2f} ({e-s:.2f}s)", flush=True)

# merge/split to match sentence count if needed
# Chatterbox pauses mid-sentence -> merge pairs by EXPECTED sentence durations.
# Expected ~ words per sentence -> proportional target lengths:
# S0:8 S1:9 S2:13 S3:4 S4:17 S5:8 S6:15 S7:17 (total 91)
COUNTS = [8, 9, 13, 4, 17, 8, 15, 17]
TOTAL_WORDS = sum(COUNTS)
VO_END = segs[-1][1]
# allocate each sentence a window proportional to word count, snap cuts to gaps
bounds = []
acc = 0.0
for c in COUNTS:
    acc += c / TOTAL_WORDS * VO_END
    bounds.append(acc)
# for each bound, find nearest inter-segment gap; force strictly increasing cuts
cuts = []
last_cut = -1
for b in bounds[:-1]:
    best = None
    for k in range(last_cut + 1, len(segs) - 1):
        gap_mid = (segs[k][1] + segs[k + 1][0]) / 2
        d = abs(gap_mid - b)
        if best is None or d < best[0]:
            best = (d, k)
    if best is not None and best[1] > last_cut:
        cuts.append(best[1])
        last_cut = best[1]
merged = []
prev = 0
for c in cuts + [len(segs) - 1]:
    merged.append((segs[prev][0], segs[c][1]))
    prev = c + 1
segs = merged
print(f"merged to {len(segs)} sentence windows", flush=True)
for k, (s, e) in enumerate(segs):
    print(f"  S{k}: {s:.2f}-{e:.2f}: {SENTENCES[k][:40]}", flush=True)

items = []
for (s, e), text in zip(segs, SENTENCES):
    words = text.split()
    weights = np.array([max(len(w.strip("?,.-")), 1) for w in words], dtype=float)
    # add per-word articulation floor: min 0.14s per word
    total_w = weights.sum()
    avail = max(e - s, len(words) * 0.14)
    durs = weights / total_w * avail
    # scale to fit if floor pushed beyond
    if durs.sum() > (e - s):
        durs = durs / durs.sum() * (e - s)
    t = s
    witems = []
    for w, d_ in zip(words, durs):
        witems.append({"start": round(float(t), 3), "end": round(float(t + d_), 3), "word": w})
        t += float(d_)
    items.append({"start": round(s, 3), "end": round(e, 3), "text": text, "words": witems})

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"vo": VO, "duration": round(len(y)/sr, 3), "segments": items}, f, indent=1)
print(f"saved {OUT}", flush=True)
