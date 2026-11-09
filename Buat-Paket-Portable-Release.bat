@echo off
title WinMac Desktop OS - Compiler ^& Portable Bundler
color 0B
echo ============================================================================
echo   WINMAC DESKTOP OS - COMPILER .EXE ^& PEMBUAT PAKET PORTABLE RELEASE
echo ============================================================================
echo.

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"
set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if exist "%CSC%" (
  echo [1/2] Mengompilasi ulang WinMac Desktop OS.exe ^& WinMac Desktop OS ^(Admin^).exe...
  "%CSC%" /nologo /target:winexe /out:"%APP_DIR%\WinMac Desktop OS.exe" /win32icon:"%APP_DIR%\winmac.ico" "%APP_DIR%\launcher-src\Launcher.cs"
  "%CSC%" /nologo /target:winexe /out:"%APP_DIR%\WinMac Desktop OS (Admin).exe" /win32icon:"%APP_DIR%\winmac.ico" /win32manifest:"%APP_DIR%\launcher-src\admin.manifest" "%APP_DIR%\launcher-src\Launcher.cs"
) else (
  echo [1/2] Compiler .NET ditemukan sudah terkompilasi. Menggunakan file .exe yang ada.
)

echo [2/2] Membuat paket ZIP siap pakai ^(WinMac-Desktop-OS-Release.zip^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$files = @('main.js','index.html','style.css','app.js','package.json','README.md','winmac.ico','WinMac Desktop OS.exe','WinMac Desktop OS (Admin).exe','Pasang-ke-Desktop-dan-Startup.bat','Kembali-ke-Windows-Ori.bat','launcher-src'); " ^
  "Compress-Archive -Path $files -DestinationPath 'WinMac-Desktop-OS-Release.zip' -Force"

echo.
echo ============================================================================
echo   SELESAI!
echo   - WinMac Desktop OS.exe ^& WinMac Desktop OS (Admin).exe siap digunakan.
echo   - Paket WinMac-Desktop-OS-Release.zip siap diunggah ke GitHub Releases!
echo ============================================================================
timeout /t 4
