# VIECUT – app edit video (Windows · Android · iOS · Linux)

Tác giả: **Phạm Thành Long (thlong)**

App cài trên máy, video dựng và xuất ngay trên máy. Server nhỏ lo tài khoản đăng nhập, lưu dự án, thư viện media và trang tải app, nên đăng nhập trên máy nào cũng mở lại được dự án.

| Thư mục | Nội dung |
|---|---|
| `server/` | Server Node.js: đăng ký/đăng nhập, dự án, media, trang tải `/tai-app` |
| `app/www/` | Giao diện editor dùng chung cho mọi nền tảng |
| `app/electron/` | Vỏ app Windows / Linux (Electron) |
| `app/android-native/` | App Android gốc (WebView), dựng không cần Android Studio |
| `app/ios/` | Project iOS (Capacitor) |
| `installer/` | Bộ cài Windows (NSIS) + script cài Linux |
| `tools/build-all.sh` | Dựng Setup.exe, bản portable, Linux, APK |
| `cloudflare/`, `wrangler.jsonc`, `tai-len-cloudflare.bat` | Trang tải app trên Cloudflare |
| `codemagic.yaml` | Dựng iOS .ipa chưa ký trên Codemagic (miễn phí, không cần Mac) |

## 1. Chạy server
```
cd server
npm install
npm start
```
Trang tải app ở `http://<địa-chỉ>:3000/tai-app`, link cố định `/tai/windows`, `/tai/windows-portable`, `/tai/android`, `/tai/linux`, `/tai/ios`. Chép các file trong `build/` vào `server/downloads/` (hoặc đặt link ngoài qua biến môi trường `DL_WINDOWS`, `DL_ANDROID`, `DL_LINUX`, `DL_IOS`).

Dữ liệu nằm trong `server/data/` (đổi chỗ bằng biến `DATA_DIR`). Đưa lên VPS để dùng ở mọi nơi; host miễn phí kiểu Render sẽ xóa file media mỗi lần khởi động lại.

## 2. Dựng app (máy Linux)
```
sudo apt install nsis default-jdk-headless android-sdk-build-tools android-sdk-platform-23 apksigner zipalign
tools/build-all.sh 0.1.0 1 https://dia-chi-server-cua-ban
```
Tham số: phiên bản, versionCode Android (mỗi bản APK mới tăng lên), địa chỉ server gắn sẵn vào app (bỏ trống = người dùng tự nhập lúc đăng nhập).

Kết quả trong `build/`: `VIECUT-Setup.exe`, `VIECUT-Windows-portable.zip`, `VIECUT-Linux.tar.gz`, `VIECUT.apk`.

**Khóa ký APK:** lần đầu script tự tạo `~/viecut-keys/release.keystore`. Giữ kỹ file này (và mật khẩu): bản APK sau phải ký cùng khóa thì mới cài đè được. Dùng khóa riêng: đặt `KS`, `KS_ALIAS`, `KS_PASS`.

## 3. Trang tải trên Cloudflare
File cài không đưa lên GitHub. Trang tải và file cài nằm trên Cloudflare Workers (gói miễn phí):
1. Chép các file cài vào thư mục `build\` (VIECUT-Setup.exe, VIECUT.apk, VIECUT-Windows-portable.zip, VIECUT-Linux.tar.gz, VIECUT.ipa nếu có).
2. Bấm đúp `tai-len-cloudflare.bat` (cần Node.js). Lần đầu trình duyệt mở trang đăng nhập Cloudflare, bấm Allow.
3. Trang tải: `https://viecut.<tài-khoản>.workers.dev/tai-app`, link cố định `/tai/windows`, `/tai/windows-portable`, `/tai/android`, `/tai/linux`, `/tai/ios`.

Cloudflare chỉ nhận file tối đa 25 MB nên `tools/pack-cloudflare.js` cắt mỗi file thành phần 20 MB; Worker (`cloudflare/worker.js`) ghép lại khi người dùng tải, có hỗ trợ tải tiếp. Mỗi lần có bản mới: chép file mới vào `build\` rồi chạy lại file .bat.

## 4. iOS
Codemagic → thêm kho GitHub → Start new build → workflow **iOS IPA chưa ký** → tải `VIECUT.ipa`. Cài bằng Sideloadly / AltStore với Apple ID phụ (ký lại sau 7 ngày). Đặt biến `SERVER_URL` trong Codemagic để gắn sẵn địa chỉ server.

## Cài đặt cho người dùng
- **Windows:** chạy `VIECUT-Setup.exe` (cài vào thư mục người dùng, không cần quyền admin, có lối tắt Desktop + Start, gỡ trong Cài đặt). SmartScreen: More info → Run anyway.
- **Android:** mở `VIECUT.apk`, cho phép cài từ nguồn không xác định. Video xuất ra lưu vào thư viện, thư mục `Movies/VIECUT`.
- **Linux:** giải nén, chạy `./install.sh` để thêm vào menu.

## Tính năng bản 0.1
Đăng ký (nhập lại mật khẩu) / đăng nhập, dự án tự lưu lên server · khung 9:16, 16:9, 1:1, 4:5 + vùng an toàn TikTok · thư viện video/ảnh/nhạc · timeline 3 track: kéo, cắt mép, tách, nhân đôi, xóa, hoàn tác · thu phóng, vừa khung/lấp đầy, kéo vị trí, âm lượng · chữ Montserrat (đứng, có tiếng Việt), màu trắng/đen/đỏ #C1272C/xanh #152758, viền, nền · xuất video 1080p có âm thanh.
