import os, json, re
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
from faster_whisper import WhisperModel

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

m = WhisperModel("small", device="cpu", compute_type="int8")
segs, info = m.transcribe(
    VO, word_timestamps=True, language="en", beam_size=5,
    condition_on_previous_text=False,
)
segs = list(segs)
print(f"dur={info.duration:.2f}s nsegs={len(segs)}", flush=True)
for s in segs:
    print(f"{s.start:.2f}-{s.end:.2f}: {s.text.strip()}", flush=True)

words = []
for s in segs:
    for w in (s.words or []):
        words.append({"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word})
print(f"whisper words: {len(words)}", flush=True)

def norm(t):
    return re.sub(r"[^a-z0-9']+", "", t.lower())

script_words = []
for si, sent in enumerate(SENTENCES):
    for w in sent.split():
        script_words.append((si, w))

nw = [norm(w) for _, w in script_words]
ww = [norm(w["word"]) for w in words]
print(f"script words: {len(nw)}, whisper words: {len(ww)}", flush=True)

INF = 1e9
N, M = len(nw), len(ww)
score = [[INF] * (M + 1) for _ in range(N + 1)]
back = [[None] * (M + 1) for _ in range(N + 1)]
score[0][0] = 0.0
for i in range(1, N + 1):
    score[i][0] = i * 1.6
    back[i][0] = "up"
for j in range(1, M + 1):
    score[0][j] = j * 1.6
    back[0][j] = "left"
for i in range(1, N + 1):
    for j in range(1, M + 1):
        c = 0.0 if nw[i - 1] == ww[j - 1] else 0.9
        d = score[i - 1][j - 1] + c
        u = score[i - 1][j] + 1.6
        l = score[i][j - 1] + 1.6
        best = min(d, u, l)
        score[i][j] = best
        back[i][j] = "diag" if best == d else ("up" if best == u else "left")

pairs = []
i, j = N, M
while i > 0 or j > 0:
    b = back[i][j]
    if b == "diag":
        pairs.append((i - 1, j - 1)); i -= 1; j -= 1
    elif b == "up":
        pairs.append((i - 1, None)); i -= 1
    else:
        pairs.append((None, j - 1)); j -= 1
pairs.reverse()
matched = sum(1 for a, b in pairs if a is not None and b is not None)
print(f"alignment matched {matched}/{N} script words", flush=True)

aligned = [None] * N
for a, b in pairs:
    if a is not None and b is not None:
        aligned[a] = words[b]["start"], words[b]["end"]

def interp(idx):
    prev_i = next((k for k in range(idx - 1, -1, -1) if aligned[k]), None)
    next_i = next((k for k in range(idx + 1, N) if aligned[k]), None)
    if prev_i is None and next_i is None:
        return 0.0, 0.2
    if prev_i is None:
        ns, ne = aligned[next_i]
        gap = next_i - idx
        return round(max(0.0, ns - 0.2 * gap - 0.2), 3), round(max(0.0, ns - 0.2 * gap), 3)
    if next_i is None:
        ps, pe = aligned[prev_i]
        return round(pe + 0.2, 3), round(pe + 0.4, 3)
    ps, pe = aligned[prev_i]
    ns, ne = aligned[next_i]
    frac = (idx - prev_i) / (next_i - prev_i)
    s = pe + (ns - pe) * frac
    return round(s, 3), round(s + 0.18, 3)

for idx in range(N):
    if aligned[idx] is None:
        aligned[idx] = interp(idx)

segments = []
for si, sent in enumerate(SENTENCES):
    ws = []
    for i2, (sidx, wtxt) in enumerate(script_words):
        if sidx != si:
            continue
        s, e = aligned[i2]
        ws.append({"start": round(float(s), 3), "end": round(float(e), 3), "word": wtxt})
    segments.append({"start": ws[0]["start"], "end": ws[-1]["end"], "text": sent, "words": ws})

payload = {"vo": VO, "duration": round(info.duration, 3),
           "source": "faster-whisper small int8 word_timestamps, force-aligned to script",
           "segments": segments}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=1)
print(f"saved {OUT}", flush=True)
for k, seg in enumerate(segments):
    print(f"S{k} {seg['start']:.2f}-{seg['end']:.2f}: {seg['text']}", flush=True)
    print("   ", " ".join(f"{w['word']}[{w['start']:.2f}]" for w in seg["words"]), flush=True)
