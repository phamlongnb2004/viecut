; Trình cài đặt VIECUT cho Windows (không cần quyền quản trị)
; makensis -DVERSION=0.1.0 -DSRC=<thư mục win-unpacked> -DOUT=<file Setup.exe> viecut.nsi
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"

Name "VIECUT ${VERSION}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\VIECUT"
RequestExecutionLevel user
BrandingText "VIECUT ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "VIECUT"
VIAddVersionKey "CompanyName" "Phạm Thành Long (thlong)"
VIAddVersionKey "FileDescription" "Trình cài đặt VIECUT"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "© 2026 Phạm Thành Long (thlong)"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\VIECUT.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Mở VIECUT"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Vietnamese"

!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VIECUT"

Section "VIECUT"
  ; đóng app đang mở để cài đè
  nsExec::Exec 'taskkill /F /IM VIECUT.exe'
  Sleep 500
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources"
  File /r "${SRC}\*.*"
  File "icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\VIECUT.lnk" "$INSTDIR\VIECUT.exe" "" "$INSTDIR\icon.ico"
  CreateDirectory "$SMPROGRAMS\VIECUT"
  CreateShortcut "$SMPROGRAMS\VIECUT\VIECUT.lnk" "$INSTDIR\VIECUT.exe" "" "$INSTDIR\icon.ico"
  CreateShortcut "$SMPROGRAMS\VIECUT\Gỡ VIECUT.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "VIECUT"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "Phạm Thành Long (thlong)"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM VIECUT.exe'
  Sleep 500
  Delete "$DESKTOP\VIECUT.lnk"
  RMDir /r "$SMPROGRAMS\VIECUT"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNKEY}"
SectionEnd
