#!/bin/zsh
# Android uygulamasını (APK) derler ve imzalar.
#
#   npm run apk                  dağıtılacak APK: canlı siteyi açar (playbook-1401.web.app)
#   SUNUCU=demo npm run apk      test APK'sı: demo sitesini açar (playbook-demo-1401.web.app)
#
# Çıktı: apk/1401-campus-<sürüm>.apk (demo için -demo eki). Sürüm
# android/app/build.gradle → versionName.
#
# İmza: android/keystore.properties (git'e girmez) ve 1401-playbook.keystore.
# keystore.properties yoksa APK imzasız çıkar ve telefona kurulamaz.
#
# Gerekenler ev dizininde (sudo/brew yok): Java 21 (~/.local/jdk-21),
# Android SDK (~/.local/android-sdk), Node (~/.local/node).
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME=${JAVA_HOME:-$HOME/.local/jdk-21/Contents/Home}
export ANDROID_HOME=${ANDROID_HOME:-$HOME/.local/android-sdk}
export PATH=$HOME/.local/node/bin:$JAVA_HOME/bin:$PATH

# www: yalnızca yerel "internet yok" sayfası (offline.html) için gerekli;
# uygulamanın kendisi sunucudan gelir.
npm run build >/dev/null
npx cap sync android >/dev/null

VER=$(sed -nE 's/.*versionName "([^"]+)".*/\1/p' android/app/build.gradle)
URL=https://playbook-1401.web.app
OUT=apk/1401-campus-$VER.apk
if [[ "$SUNUCU" == "demo" ]]; then
  URL=https://playbook-demo-1401.web.app
  OUT=apk/1401-campus-$VER-demo.apk
fi
# Yalnızca bu derlemenin kopyası değişir (cap sync her seferinde yeniden yazar).
CFG=android/app/src/main/assets/capacitor.config.json
sed -i '' -E "s#\"url\": \"https://[^\"]+\"#\"url\": \"$URL\"#" $CFG
# Test APK'sında WebView hata ayıklaması açık: emülatörde otomatik deneme
# (Playwright, chrome://inspect) için. Dağıtılan APK'da kapalı kalır.
if [[ "$SUNUCU" == "demo" ]]; then
  node -e "const f=process.argv[1],c=JSON.parse(require('fs').readFileSync(f));c.android={...c.android,webContentsDebuggingEnabled:true};require('fs').writeFileSync(f,JSON.stringify(c,null,2))" $CFG
fi
# "İnternet yok" sayfasının "Yeniden dene"si bu adrese gider.
sed -i '' "s#__APP_URL__#$URL/#" android/app/src/main/assets/public/offline.html
echo "Sunucu: $URL"

(cd android && ./gradlew assembleRelease -q --console=plain)
SRC=android/app/build/outputs/apk/release/app-release.apk
[[ -f "$SRC" ]] || { echo "İmzalı APK oluşmadı (android/keystore.properties var mı?)"; exit 1; }
mkdir -p apk
cp "$SRC" "$OUT"
BT=$(ls -d $ANDROID_HOME/build-tools/* | sort -V | tail -1)
"$BT/apksigner" verify --print-certs "$OUT" | grep -m1 "SHA-256" || true
echo "Hazır: $OUT ($(du -h "$OUT" | cut -f1))"
