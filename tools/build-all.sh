#!/usr/bin/env bash
# Dựng VIECUT: Windows (Setup.exe + bản portable .zip), Linux (.tar.gz), Android (APK đã ký).
# iOS dựng trên Codemagic / GitHub macOS (xem codemagic.yaml).
# Cần (máy Linux): Node 18+, makensis (gói nsis), Java 17+, Android build-tools + android.jar
#   (Ubuntu/Debian: apt install nsis default-jdk-headless android-sdk-build-tools android-sdk-platform-23 apksigner zipalign)
# Dùng: tools/build-all.sh <phiên-bản> <versionCode-android> [địa-chỉ-server]
#   vd: tools/build-all.sh 0.1.0 1 https://viecut.onrender.com
# Khóa ký APK: đặt KS (đường dẫn .keystore), KS_ALIAS, KS_PASS. Không có thì tự tạo ~/viecut-keys/release.keystore
# (GIỮ KỸ file này: bản APK sau phải ký cùng khóa mới cài đè được).
set -euo pipefail
VER=${1:?phiên bản, vd 0.1.0}; CODE=${2:?versionCode Android, vd 1}; SERVER=${3:-}
ROOT=$(cd "$(dirname "$0")/.." && pwd); A="$ROOT/app"; OUT="$ROOT/build"
rm -rf "$OUT"; mkdir -p "$OUT"

echo "== Gắn địa chỉ server: ${SERVER:-'(người dùng tự nhập)'}"
printf "// Tạo bởi tools/build-all.sh\nwindow.VIECUT_SERVER = '%s';\n" "$SERVER" > "$A/www/config.js"

echo "== Phiên bản $VER (Android versionCode $CODE)"
( cd "$A" && npm pkg set version="$VER" >/dev/null )
sed -i "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$CODE\"/; s/android:versionName=\"[^\"]*\"/android:versionName=\"$VER\"/" "$A/android-native/AndroidManifest.xml"

cd "$A"; [ -d node_modules ] || npm install

echo "== Lõi FFmpeg"
FF="$A/vendor/ffmpeg"
if [ ! -f "$FF/win/ffmpeg.exe" ] || [ ! -f "$FF/linux/ffmpeg" ]; then
  T=$(mktemp -d); mkdir -p "$FF/win" "$FF/linux"
  curl -sSL -o "$T/w.zip" https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip
  curl -sSL -o "$T/l.tar.xz" https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz
  mkdir -p "$T/w" "$T/l"; unzip -q "$T/w.zip" -d "$T/w"; tar xJf "$T/l.tar.xz" -C "$T/l"
  cp "$T"/w/*/bin/ffmpeg.exe "$FF/win/"; cp "$T"/l/*/bin/ffmpeg "$FF/linux/"; cp "$T"/w/*/LICENSE.txt "$FF/LICENSE-ffmpeg.txt"; rm -rf "$T"
fi

echo "== Windows"
rm -rf dist
npx electron-builder --win dir --x64 -c.win.signAndEditExecutable=false >/dev/null
( cd dist/win-unpacked && zip -qr9 "$OUT/VIECUT-Windows-portable.zip" . )
makensis -V2 -DVERSION="$VER" -DSRC="$A/dist/win-unpacked" -DOUT="$OUT/VIECUT-Setup.exe" "$ROOT/installer/viecut.nsi"

echo "== Linux"
npx electron-builder --linux dir --x64 >/dev/null
T=$(mktemp -d); cp -r dist/linux-unpacked "$T/VIECUT"
cp "$ROOT/installer/linux/"*.sh "$T/VIECUT/"; cp "$A/build/icon.png" "$T/VIECUT/"
tar -C "$T" -czf "$OUT/VIECUT-Linux.tar.gz" VIECUT; rm -rf "$T"

echo "== Android"
AJAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
BT=${BUILD_TOOLS:-$(ls -d /usr/lib/android-sdk/build-tools/* | tail -1)}
W=$(mktemp -d); N="$A/android-native"
mkdir -p "$W/assets" "$W/classes" "$W/gen"
cp -r "$A/www" "$W/assets/www"
aapt2 compile --dir "$N/res" -o "$W/res.zip"
aapt2 link -o "$W/base.apk" -I "$AJAR" --manifest "$N/AndroidManifest.xml" -A "$W/assets" --java "$W/gen" "$W/res.zip" --auto-add-overlay
if ! javac -nowarn -source 8 -target 8 -bootclasspath "$AJAR" -classpath "$AJAR" -d "$W/classes" \
  $(find "$N/src" "$W/gen" -name '*.java') > "$W/javac.log" 2>&1; then grep -v "^Picked up" "$W/javac.log"; exit 1; fi
"$BT/dx" --dex --output="$W/classes.dex" "$W/classes"
( cd "$W" && cp base.apk unsigned.apk && zip -q -j unsigned.apk classes.dex )
zipalign -f -p 4 "$W/unsigned.apk" "$W/aligned.apk"
KS=${KS:-$HOME/viecut-keys/release.keystore}; KS_ALIAS=${KS_ALIAS:-viecut}; KS_PASS=${KS_PASS:-viecut123}
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -v -keystore "$KS" -alias "$KS_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=Pham Thanh Long, OU=thlong, O=VIECUT, C=VN" >/dev/null 2>&1
  echo "   Đã tạo khóa ký mới: $KS (giữ kỹ!)"
fi
apksigner sign --ks "$KS" --ks-key-alias "$KS_ALIAS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --out "$OUT/VIECUT.apk" "$W/aligned.apk"
apksigner verify "$OUT/VIECUT.apk"
rm -rf "$W"

echo "== Xong:"; ls -la "$OUT"
