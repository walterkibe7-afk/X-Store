import os
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
from faster_whisper import WhisperModel

m = WhisperModel("small", device="cpu", compute_type="int8")
segs, info = m.transcribe(
    "d:/Web Designs/ST/assets/vo/elle-explainer-serein.wav",
    word_timestamps=True, language="en", beam_size=5,
)
segs = list(segs)
print(f"dur={info.duration:.2f}s n={len(segs)}")
for s in segs:
    print(f"{s.start:.2f}-{s.end:.2f}: {s.text.strip()}")
print("WORDS:")
for s in segs:
    for w in (s.words or []):
        print(f"{w.start:.2f} {w.end:.2f} {w.word}")
