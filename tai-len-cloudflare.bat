@echo off
chcp 65001 >nul
rem Đưa trang tải VIECUT + file cài lên Cloudflare. Tác giả: Phạm Thành Long (thlong)
rem Chép các file cài (VIECUT-Setup.exe, VIECUT.apk, ...) vào thư mục build\ trước khi chạy.
cd /d "%~dp0"
if not exist build\VIECUT-Setup.exe if not exist build\VIECUT.apk (echo Chưa có file cài trong thư mục build\ & pause & exit /b 1)
echo == Cắt file cài thành phần 20 MB
node tools\pack-cloudflare.js || (pause & exit /b 1)
echo == Đăng nhập Cloudflare (lần đầu sẽ mở trình duyệt) và deploy
call npx -y wrangler@4 deploy
echo.
echo Xong. Trang tải: https://viecut.^<tên-tài-khoản^>.workers.dev/tai-app
pause
