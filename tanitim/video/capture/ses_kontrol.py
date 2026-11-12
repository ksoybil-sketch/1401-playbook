"""
Seslendirme kontrolü: her ses dosyasını Whisper ile yazıya geri çevirir ve
senaryodaki metinle karşılaştırır. Yapay seslerde atlanan, yutulan ya da
uydurulan kelimeleri dinlemeden yakalamak için.

  python ses_kontrol.py liste.json      [{"text": "...", "alt": "...", "file": "/.../x.wav"}]
Çıktı: her cümle için benzerlik (%) ve fark; %85 altı "KONTROL ET" işaretlenir.
"""
import difflib
import json
import re
import sys

from faster_whisper import WhisperModel


def norm(s: str) -> list[str]:
    s = s.lower().replace("’", "'").replace("i̇", "i")
    s = re.sub(r"[^\wçğıöşüâî' ]", " ", s)
    return s.split()


def main() -> None:
    items = json.load(open(sys.argv[1], encoding="utf-8"))
    model = WhisperModel("small", device="cpu", compute_type="int8")
    bad = 0
    for i, it in enumerate(items, 1):
        segs, _ = model.transcribe(it["file"], language="tr", beam_size=5)
        heard = " ".join(s.text for s in segs).strip()
        b = norm(heard)
        # Sayılar rakamla da yazılabilir: altyazı metni ("alt") ile de karşılaştır.
        ratio = max(difflib.SequenceMatcher(None, norm(t), b).ratio() for t in [it["text"], it.get("alt") or it["text"]])
        flag = "" if ratio >= 0.85 else "  << KONTROL ET"
        if flag:
            bad += 1
        print(f"{i:2d}. %{ratio * 100:3.0f}{flag}")
        if flag:
            print(f"    metin : {it['text']}")
            print(f"    duyulan: {heard}")
    print(f"{len(items)} cümle, {bad} tanesi kontrol gerektiriyor")


if __name__ == "__main__":
    main()
