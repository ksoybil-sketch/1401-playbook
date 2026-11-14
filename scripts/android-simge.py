"""
Android simgesini ve açılış görselini tek bir kare PNG'den üretir.

    npm run android:simge                       iOS simgesinden (varsayılan)
    npm run android:simge -- yeni-simge.png     başka bir görselden

Kaynak: en az 512 px, kare, tam dolu (saydam köşesiz) bir görsel. Zemin
rengi görselin köşelerinden okunur; uyarlanabilir simgenin (Android 8+)
arka planı ve açılış görselinin zemini bu renk olur.

Üretilenler (android/app/src/main/res altında):
  mipmap-*/ic_launcher.png             eski Android'ler için kare simge
  mipmap-*/ic_launcher_round.png       yuvarlak simge
  mipmap-*/ic_launcher_foreground.png  uyarlanabilir simgenin ön yüzü
  values/ic_launcher_background.xml    uyarlanabilir simgenin zemin rengi
  drawable*/splash.png                 açılış görseli (Android 11 ve öncesi)

Bağımlılık: Pillow — `uv run --with pillow` ile geçici olarak gelir,
projeye bir şey kurmaz.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
DEFAULT = ROOT / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'

DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
# Uyarlanabilir simge 108 dp; telefonun maskesi ortadaki ~66 dp'yi gösterir.
# Görsel 108 dp'nin bu oranına sığdırılır, kenarlar zemin rengiyle dolar.
FOREGROUND_SCALE = 0.72
SPLASH_ICON = 0.6  # açılış görselinde simgenin kısa kenara oranı

src_path = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else DEFAULT
src = Image.open(src_path).convert('RGBA')
if src.width != src.height:
    sys.exit(f'Görsel kare olmalı ({src.width}x{src.height}).')
if src.width < 512:
    sys.exit(f'Görsel en az 512 px olmalı ({src.width} px).')

# Zemin rengi: dört köşedeki piksellerin ortalaması.
w = src.width
corners = [src.getpixel((x, y)) for x in (2, w - 3) for y in (2, w - 3)]
bg = tuple(round(sum(c[i] for c in corners) / 4) for i in range(3))
hexbg = '#{:02X}{:02X}{:02X}'.format(*bg)


def resized(size: int) -> Image.Image:
    return src.resize((size, size), Image.LANCZOS)


def on_bg(size: int, inner: int) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), bg + (255,))
    off = (size - inner) // 2
    canvas.alpha_composite(resized(inner), (off, off))
    return canvas


def masked(img: Image.Image, shape: str) -> Image.Image:
    size = img.width
    big = size * 4  # yumuşak kenar için büyük çizip küçült
    m = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(m)
    if shape == 'circle':
        d.ellipse((0, 0, big - 1, big - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.18), fill=255)
    out = img.copy()
    out.putalpha(m.resize((size, size), Image.LANCZOS))
    return out


written = 0
for name, k in DENSITIES.items():
    folder = RES / f'mipmap-{name}'
    folder.mkdir(parents=True, exist_ok=True)
    legacy = round(48 * k)
    fg = round(108 * k)
    masked(resized(legacy), 'rounded').save(folder / 'ic_launcher.png')
    masked(resized(legacy), 'circle').save(folder / 'ic_launcher_round.png')
    on_bg(fg, round(fg * FOREGROUND_SCALE)).save(folder / 'ic_launcher_foreground.png')
    written += 3

(RES / 'values/ic_launcher_background.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    f'    <color name="ic_launcher_background">{hexbg}</color>\n</resources>\n'
)

# Açılış görselleri: var olan her splash.png aynı boyutta yeniden çizilir.
for f in sorted(RES.glob('drawable*/splash.png')):
    with Image.open(f) as old:
        sw, sh = old.size
    canvas = Image.new('RGB', (sw, sh), bg)
    icon = round(min(sw, sh) * SPLASH_ICON)
    canvas.paste(resized(icon).convert('RGB'), ((sw - icon) // 2, (sh - icon) // 2))
    canvas.save(f)
    written += 1

print(f'Kaynak: {src_path.relative_to(ROOT) if src_path.is_relative_to(ROOT) else src_path}')
print(f'Zemin rengi: {hexbg} · {written} dosya yazıldı. APK için: npm run apk')
