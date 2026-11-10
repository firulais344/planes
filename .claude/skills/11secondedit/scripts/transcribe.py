#!/usr/bin/env python3
"""Local transcription with word-level timestamps using WhisperX.

Usage: transcribe.py AUDIO OUT_JSON [--model small] [--language es] [--device cpu|cuda]

Writes WhisperX's aligned output: {"language": "...", "segments": [{"start","end","text","words":[{"word","start","end","score"}]}]}
Install: pip install whisperx   (see the skill's README for GPU / Apple Silicon notes)
"""
import argparse
import json
import sys


def ensure_nltk():
    """WhisperX's aligner splits sentences with NLTK's punkt_tab, which a fresh install lacks."""
    try:
        import nltk

        try:
            nltk.data.find("tokenizers/punkt_tab")
        except LookupError:
            print("PROGRESS downloading NLTK sentence tokenizer (one time)", flush=True)
            if not nltk.download("punkt_tab", quiet=True):
                print(
                    "Could not download NLTK's punkt_tab (needed by WhisperX alignment). "
                    "Run once: python -m nltk.downloader punkt_tab",
                    file=sys.stderr,
                )
                sys.exit(4)
    except ImportError:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--batch-size", type=int, default=8)
    args = ap.parse_args()

    try:
        import whisperx  # noqa: WPS433
    except ImportError:
        print("WhisperX is not installed for this Python. Run: pip install whisperx  (or set WHISPERX_PYTHON to a Python that has it)", file=sys.stderr)
        sys.exit(3)

    device = args.device
    if not device:
        try:
            import torch

            device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:  # pragma: no cover
            device = "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    print(f"PROGRESS loading model {args.model} on {device}", flush=True)
    model = whisperx.load_model(args.model, device, compute_type=compute_type, language=args.language or None)
    audio = whisperx.load_audio(args.audio)
    print("PROGRESS transcribing", flush=True)
    result = model.transcribe(audio, batch_size=args.batch_size, language=args.language or None)
    language = result.get("language") or args.language or "en"

    print(f"PROGRESS aligning words ({language})", flush=True)
    ensure_nltk()
    align_model, metadata = whisperx.load_align_model(language_code=language, device=device)
    aligned = whisperx.align(result["segments"], align_model, metadata, audio, device, return_char_alignments=False)

    segments = []
    for seg in aligned["segments"]:
        segments.append(
            {
                "start": seg.get("start"),
                "end": seg.get("end"),
                "text": seg.get("text", "").strip(),
                "words": [
                    {k: w[k] for k in ("word", "start", "end", "score") if k in w}
                    for w in seg.get("words", [])
                ],
            }
        )
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"language": language, "segments": segments}, f, ensure_ascii=False, indent=1)
    print(f"PROGRESS done: {sum(len(s['words']) for s in segments)} words", flush=True)


if __name__ == "__main__":
    main()
