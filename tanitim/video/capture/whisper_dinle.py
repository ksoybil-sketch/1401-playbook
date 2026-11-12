"""
Ses dosyalarını Whisper ile yazıya çevirir (Türkçe). Chatterbox'tan ayrı bir
süreçte çalışır: aynı süreçte yüklü olunca ses üretimini üç kat yavaşlatıyordu.

Satır satır çalışır: stdin'den dosya yolu okur, stdout'a tek satır metin yazar.
"""
import sys

from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=2)
for line in sys.stdin:
    path = line.strip()
    if not path:
        continue
    segs, _ = model.transcribe(path, language="tr", beam_size=5)
    print(" ".join(s.text for s in segs).strip().replace("\n", " "), flush=True)
