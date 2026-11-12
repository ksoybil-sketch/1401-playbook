"""
Chatterbox (Resemble AI, MIT lisansı) ile Türkçe seslendirme. İnternetsiz,
bilgisayarda çalışır. capture/ses.mjs MOTOR=chatterbox ile çağırır:

  python chatterbox_tts.py isler.json

isler.json: [{"text": "...", "out": "/.../x.wav"}, ...]

Yapay ses modelleri uzun cümlelerde kelime yutabiliyor ya da cümle sonunu
tekrarlayabiliyor. Bu yüzden:
  1. her cümle noktalamadan kısa parçalara bölünür,
  2. her parça üretilince Whisper ile yazıya geri çevrilip metinle
     karşılaştırılır,
  3. tutmazsa yeniden üretilir (en çok DENEME kez), en iyisi seçilir,
  4. parçalar kısa bir duraklamayla birleştirilir.

İsteğe bağlı ortam değişkenleri:
  REF_SES : ses örneği (10-20 sn, tek kişi, gürültüsüz; izni olan biri).
  ABARTI  : 0.3-0.8 arası duygu yoğunluğu (varsayılan 0.5)
  DENEME  : parça başına en çok deneme (varsayılan 4)
"""
import difflib
import json
import os
import re
import subprocess
import sys

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from num2words import num2words

ESIK = 0.88
ARA = 0.28  # parçalar arası duraklama (sn)


def parcala(text: str) -> list[str]:
    parts = [p.strip() for p in re.split(r"(?<=[.?!;:])\s+", text) if p.strip()]
    out: list[str] = []
    for p in parts:
        # Çok kısa parçalar (2 kelime ve altı) bir öncekine eklenir.
        if out and len(p.split()) <= 2:
            out[-1] += " " + p
        else:
            out.append(p)
    return out


def sade(s: str) -> str:
    """Karşılaştırma için: küçük harf, rakamlar yazıyla, boşluk ve noktalama yok."""
    s = re.sub(r"(?<=\d)\.(?=\d{3})", "", s)  # 1.290 -> 1290
    s = re.sub(r"\d+", lambda m: num2words(int(m.group()), lang="tr"), s)
    s = s.lower().replace("i̇", "i").replace("’", "").replace("'", "")
    return re.sub(r"[^a-zçğıöşüâî]", "", s)


def benzerlik(beklenen: str, duyulan: str) -> float:
    return difflib.SequenceMatcher(None, sade(beklenen), sade(duyulan)).ratio()


def main() -> None:
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    if not jobs:
        return
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    try:
        model = ChatterboxMultilingualTTS.from_pretrained(device=dev)
    except Exception as e:
        print(f"{dev} olmadı ({e}); CPU ile devam", file=sys.stderr)
        model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    # Whisper ayrı süreçte (aynı süreçte ses üretimini yavaşlatıyordu).
    dinle_py = os.path.join(os.path.dirname(os.path.abspath(__file__)), "whisper_dinle.py")
    whisper_py = os.path.expanduser("~/.local/share/whisper/.venv/bin/python")
    asr = subprocess.Popen([whisper_py, dinle_py], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, text=True, bufsize=1, env={**os.environ, "HF_HUB_OFFLINE": "1"})
    ref = os.environ.get("REF_SES") or None
    abarti = float(os.environ.get("ABARTI", "0.5"))
    deneme = int(os.environ.get("DENEME", "4"))
    tmp = "/tmp/_cb_parca.wav" if not os.environ.get("TMPDIR") else os.path.join(os.environ["TMPDIR"], "_cb_parca.wav")

    for i, job in enumerate(jobs, 1):
        parcalar = []
        for p in parcala(job["text"]):
            best = (-1.0, None, "")
            for d in range(deneme):
                wav = model.generate(p, language_id="tr", audio_prompt_path=ref, exaggeration=abarti, cfg_weight=0.5)
                ta.save(tmp, wav, model.sr)
                asr.stdin.write(tmp + "\n"); asr.stdin.flush()
                heard = asr.stdout.readline().strip()
                r = benzerlik(p, heard)
                if r > best[0]:
                    best = (r, wav, heard)
                if r >= ESIK:
                    break
            print(f"  %{best[0] * 100:3.0f} ({d + 1} deneme) {p}", flush=True)
            if best[0] < ESIK:
                print(f"     ! duyulan: {best[2]}", flush=True)
            parcalar.append(best[1])
        sessiz = torch.zeros(1, int(model.sr * ARA))
        birlesik = []
        for k, w in enumerate(parcalar):
            if k:
                birlesik.append(sessiz)
            birlesik.append(w.cpu())
        ta.save(job["out"], torch.cat(birlesik, dim=1), model.sr)
        print(f"{i}/{len(jobs)}", flush=True)


if __name__ == "__main__":
    main()
