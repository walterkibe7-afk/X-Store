"""
Generate the X-store voiceover with the LOCAL Chatterbox Turbo model.

Mirrors the proven invocation used elsewhere on this machine
(C:\\Users\\Administrator\\voices\\viking\\say.py and
D:\\BibleSleep\\tts_chatterbox.py): load ChatterboxTurboTTS on CPU, clone the
voice from a reference clip, synthesize the script text and save a WAV.

Usage:
    python make-vo.py [script.txt] [output.wav] [voice]

Defaults:
    script = <workspace>\\assets\\vo\\x-store-vo-script.txt
    output = <workspace>\\assets\\vo\\x-store-vo-15s.wav
    voice  = historian
"""
import sys
import time
from pathlib import Path

# d:\Web Designs\ST  (this file lives in <workspace>\_tools)
WORKSPACE = Path(__file__).resolve().parent.parent

# Zero-shot reference clips: voice name -> reference wav.
# Kept in sync with the registry in D:\BibleSleep\tts_chatterbox.py.
# Pitch (median F0) measured per clip: female voices sit at >= ~180 Hz.
VOICE_REGISTRY = {
    # --- female ---
    "lauren": r"C:\Users\Administrator\voices\lauren_ref.wav",           # 209 Hz
    "serein": r"C:\Users\Administrator\voices\serein_ref.wav",           # 221 Hz
    "cynthia": r"D:\BibleSleep\voices\cynthia\reference.wav",            # 223 Hz
    "yoruba": r"C:\Users\Administrator\voices\yoruba_clone\reference.wav",  # 218 Hz
    "mwalimu": r"D:\BibleSleep\voices\mwalimu\reference.wav",            # 237 Hz
    "ololade": r"C:\Users\Administrator\voices\ololade_ref.wav",         # 176 Hz
    # --- male ---
    "historian": r"C:\Users\Administrator\voices\historian\reference.wav",
    "viking": r"C:\Users\Administrator\voices\viking\reference.wav",
    "kibe": r"C:\Users\Administrator\voices\kibe\reference.wav",
    "terry": r"C:\Users\Administrator\voices\northern_terry\reference.wav",
    "steve": r"C:\Users\Administrator\voices\steve_ref.wav",
}


class _NoWatermark:
    """Disable Chatterbox's perceptual watermarker (matches BibleSleep)."""

    def apply_watermark(self, wav, sample_rate=None):
        return wav


def main():
    script = Path(sys.argv[1]) if len(sys.argv) > 1 else WORKSPACE / "assets" / "vo" / "x-store-vo-script.txt"
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else WORKSPACE / "assets" / "vo" / "x-store-vo-15s.wav"
    voice = sys.argv[3] if len(sys.argv) > 3 else "historian"

    ref = VOICE_REGISTRY.get(voice, voice)
    if not Path(ref).exists():
        raise SystemExit(f"Reference clip not found for voice '{voice}': {ref}")

    text = " ".join(Path(script).read_text(encoding="utf-8").split())
    if not text:
        raise SystemExit(f"Script is empty: {script}")

    print(f"Voice     : {voice}")
    print(f"Reference : {ref}")
    print(f"Script    : {script}")
    print(f"Words     : {len(text.split())}")
    print(f"Text      : {text}", flush=True)

    import torchaudio as ta
    from chatterbox.tts_turbo import ChatterboxTurboTTS

    t0 = time.time()
    model = ChatterboxTurboTTS.from_pretrained(device="cpu")
    model.watermarker = _NoWatermark()
    print(f"Model     : loaded in {time.time() - t0:.1f}s", flush=True)

    t1 = time.time()
    wav = model.generate(text, audio_prompt_path=ref)
    gen = time.time() - t1

    if wav.dim() == 1:
        wav = wav.unsqueeze(0)

    output.parent.mkdir(parents=True, exist_ok=True)
    ta.save(str(output), wav, model.sr)

    dur = wav.shape[-1] / model.sr
    print(f"Generated : {dur:.2f}s audio in {gen:.1f}s (RTF {gen / max(dur, 0.1):.2f}x)")
    print(f"Saved     : {output}")


if __name__ == "__main__":
    main()
