"""
Toplu seslendirilmiş bir kaydı cümlelere böler (gemini-toplu.mjs çağırır).

Whisper kaydı kelime zamanlarıyla yazıya çevirir; beklenen cümle metniyle
hizalanır (difflib). İki cümle arasındaki kesim, birinci cümlenin son
kelimesiyle ikincinin ilk kelimesi arasındaki en sessiz ana konur. Her
parçanın başındaki ve sonundaki sessizlik kısaltılır.

  python bol.py parca.json     {"wav": "...", "sentences": [{"text": "...", "out": "...wav"}]}
"""
import difflib
import json
import re
import sys
import wave
from array import array

from faster_whisper import WhisperModel

PAD = 0.12  # kesimden sonra baştaki/sondaki boşluk (sn)


def norm(s: str) -> list[str]:
    s = s.lower().replace("’", "'").replace("i̇", "i")
    s = re.sub(r"'[a-zçğıöşü]+", "", s)  # ek ayrımı: "PIN'ini" → "pin"
    s = re.sub(r"[^\wçğıöşüâî ]", " ", s)
    return s.split()


def main() -> None:
    m = json.load(open(sys.argv[1], encoding="utf-8"))
    with wave.open(m["wav"]) as w:
        rate, width, ch = w.getframerate(), w.getsampwidth(), w.getnchannels()
        raw = w.readframes(w.getnframes())
    assert width == 2 and ch == 1, "16-bit mono WAV bekleniyor"
    pcm = array("h", raw)
    total = len(pcm) / rate

    model = WhisperModel("small", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(m["wav"], language="tr", beam_size=5, word_timestamps=True)
    heard = []  # (kelime, başlangıç, bitiş)
    for sg in segs:
        for wd in sg.words or []:
            for tok in norm(wd.word):
                heard.append((tok, wd.start, wd.end))

    exp = []  # (kelime, cümle no)
    for i, s in enumerate(m["sentences"]):
        for tok in norm(s["text"]):
            exp.append((tok, i))
    sm = difflib.SequenceMatcher(None, [t for t, _ in exp], [t for t, _, _ in heard], autojunk=False)
    match = {}
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            match[a + k] = b + k

    def rms(t0: float, t1: float) -> float:
        a, b = int(t0 * rate), max(int(t0 * rate) + 1, int(t1 * rate))
        seg = pcm[a:b]
        return (sum(x * x for x in seg) / len(seg)) ** 0.5 if seg else 0.0

    def quietest(t0: float, t1: float) -> float:
        """t0–t1 arasında en sessiz 30 ms'nin ortası."""
        if t1 - t0 < 0.06:
            return (t0 + t1) / 2
        best, at, t = None, (t0 + t1) / 2, t0
        while t + 0.03 <= t1:
            e = rms(t, t + 0.03)
            if best is None or e < best:
                best, at = e, t + 0.015
            t += 0.01
        return at

    n = len(m["sentences"])
    idx = {i: [j for j, (_, s) in enumerate(exp) if s == i] for i in range(n)}
    cuts = [0.0]
    for i in range(n - 1):
        last = [match[j] for j in idx[i] if j in match]
        first = [match[j] for j in idx[i + 1] if j in match]
        if not last or not first:
            raise SystemExit(f"Hizalanamadı: cümle {i + 1}/{i + 2} — parça elle kontrol edilmeli")
        e, s = heard[max(last)][2], heard[min(first)][1]
        cuts.append(quietest(min(e, s), max(e, s)) if s > e else (e + s) / 2)
    cuts.append(total)

    # Sessizlik eşiği: kaydın genel seviyesinin küçük bir kesri.
    loud = rms(0, total)
    thr = max(200.0, loud * 0.08)
    for i, s in enumerate(m["sentences"]):
        a, b = cuts[i], cuts[i + 1]
        t = a
        while t < b and rms(t, t + 0.02) < thr:
            t += 0.01
        u = b
        while u > t and rms(u - 0.02, u) < thr:
            u -= 0.01
        a2, b2 = max(a, t - PAD), min(b, u + PAD)
        with wave.open(s["out"], "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(pcm[int(a2 * rate):int(b2 * rate)].tobytes())
        cov = sum(1 for j in idx[i] if j in match) / max(1, len(idx[i]))
        flag = "" if cov >= 0.75 else "  << KONTROL ET"
        print(f"    {i + 1:2d}. {b2 - a2:5.1f} sn · eşleşme %{cov * 100:3.0f}{flag}  {s['text'][:60]}")


if __name__ == "__main__":
    main()
