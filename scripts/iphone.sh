#!/bin/zsh
# 1401 Campus'ü kabloyla bağlı iPhone'a kurar (ücretsiz Apple hesabı, kişisel ekip).
#
#   npm run iphone
#
# Ücretsiz hesapta imza 7 gün geçerlidir: uygulama açılmaz olunca telefonu
# Mac'e bağlayıp bu komutu yeniden çalıştırmak yeterli. Uygulama canlı siteyi
# açtığı için içerik ve kod güncellemeleri için yeniden kurmak gerekmez.
set -e
cd "$(dirname "$0")/../ios/App"

# Bağlı (gerçek) iPhone: CoreDevice kimliği ve donanım UDID'si
J=$(mktemp)
xcrun devicectl list devices --json-output "$J" >/dev/null 2>&1 || true
read -r CID UDID NAME <<<"$(python3 - "$J" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1]))
for x in d.get('result', {}).get('devices', []):
    hp = x.get('hardwareProperties', {})
    if hp.get('reality') == 'physical' and hp.get('platform') == 'iOS':
        print(x['identifier'], hp.get('udid', ''), x.get('deviceProperties', {}).get('name', 'iPhone').replace(' ', '_'))
        break
EOF
)"
rm -f "$J"
if [[ -z "$CID" ]]; then
  echo "Bağlı iPhone bulunamadı. Kabloyla bağlayın, kilidini açın ve 'Bu bilgisayara güven'i onaylayın."
  exit 1
fi
echo "iPhone: ${NAME//_/ } ($UDID)"

LOG=$(mktemp)
xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$UDID" -derivedDataPath ../build -allowProvisioningUpdates build >"$LOG" 2>&1 || true
APP=../build/Build/Products/Debug-iphoneos/App.app
if ! grep -q "BUILD SUCCEEDED" "$LOG"; then
  grep -E "error:|errSec" "$LOG" | sort -u | head -5
  if grep -q errSecInternalComponent "$LOG"; then
    echo "İmza anahtarına erişilemedi (Anahtar Zinciri izni). Xcode'da bir kez ▶ ile çalıştırıp çıkan pencerede Mac şifrenizi yazın ve 'Her Zaman İzin Ver' deyin."
  fi
  echo "Derleme olmadı. Ayrıntı: $LOG"; exit 1
fi

xcrun devicectl device install app --device "$CID" "$APP"
xcrun devicectl device process launch --device "$CID" com.coffee1401.playbook || \
  echo "Kuruldu. İlk kurulumda telefonda: Ayarlar → Genel → VPN ve Cihaz Yönetimi → geliştirici uygulaması → Güven."
