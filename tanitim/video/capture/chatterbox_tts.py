"""
Chatterbox (Resemble AI, MIT lisansı) ile Türkçe seslendirme. İnternetsiz,
bilgisayarda çalışır. capture/ses.mjs MOTOR=chatterbox ile çağırır:

  python chatterbox_tts.py isler.json

isler.json: [{"text": "...", "out": "/.../x.wav"}, ...]
İsteğe bağlı ortam değişkenleri:
  REF_SES   : ses örneği (10-20 sn, tek kişi, gürültüsüz). Verilirse o sesle konuşur.
  ABARTI    : 0.3-0.8 arası duygu yoğunluğu (varsayılan 0.5)
"""
import json
import os
import sys

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS


def device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def main() -> None:
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    if not jobs:
        return
    dev = device()
    try:
        model = ChatterboxMultilingualTTS.from_pretrained(device=dev)
    except Exception as e:  # MPS bazı sürümlerde sorun çıkarabiliyor
        print(f"{dev} olmadı ({e}); CPU ile devam", file=sys.stderr)
        model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    ref = os.environ.get("REF_SES") or None
    exaggeration = float(os.environ.get("ABARTI", "0.5"))
    for i, job in enumerate(jobs, 1):
        wav = model.generate(job["text"], language_id="tr", audio_prompt_path=ref,
                             exaggeration=exaggeration, cfg_weight=0.5)
        ta.save(job["out"], wav, model.sr)
        print(f"{i}/{len(jobs)}", flush=True)


if __name__ == "__main__":
    main()
