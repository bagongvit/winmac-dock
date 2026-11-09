@echo off
title WinMac Desktop OS - Pemasang Shortcut ^& Auto-Startup
color 0B
echo ============================================================================
echo   WINMAC DESKTOP OS - PEMASANG APLIKASI DESKTOP ^& AUTO-STARTUP WINDOWS
echo ============================================================================
echo.

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

set "EXE_PATH=%APP_DIR%\WinMac Desktop OS.exe"
set "ADMIN_EXE_PATH=%APP_DIR%\WinMac Desktop OS (Admin).exe"
set "ICO_PATH=%APP_DIR%\winmac.ico"

echo [1/3] Membuat Shortcut di Desktop Windows ^& Folder Startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desk = [Environment]::GetFolderPath('Desktop'); " ^
  "$startup = [Environment]::GetFolderPath('Startup'); " ^
  "$s1 = $ws.CreateShortcut((Join-Path $desk 'WinMac Desktop OS.lnk')); " ^
  "$s1.TargetPath = '%EXE_PATH%'; " ^
  "$s1.WorkingDirectory = '%APP_DIR%'; " ^
  "$s1.IconLocation = '%ICO_PATH%,0'; " ^
  "$s1.Description = 'WinMac Desktop OS Suite'; " ^
  "$s1.Save(); " ^
  "$s2 = $ws.CreateShortcut((Join-Path $desk 'WinMac Desktop OS (Run as Admin).lnk')); " ^
  "$s2.TargetPath = '%ADMIN_EXE_PATH%'; " ^
  "$s2.WorkingDirectory = '%APP_DIR%'; " ^
  "$s2.IconLocation = '%ICO_PATH%,0'; " ^
  "$s2.Description = 'WinMac Desktop OS Suite (Administrator)'; " ^
  "$s2.Save(); " ^
  "$s3 = $ws.CreateShortcut((Join-Path $startup 'WinMac Desktop OS.lnk')); " ^
  "$s3.TargetPath = '%EXE_PATH%'; " ^
  "$s3.WorkingDirectory = '%APP_DIR%'; " ^
  "$s3.IconLocation = '%ICO_PATH%,0'; " ^
  "$s3.Description = 'WinMac Desktop OS Auto-Start'; " ^
  "$s3.Save();"

echo [2/3] Mendaftarkan Auto-Start saat Restart PC ke Registry Windows...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "WinMacDesktopOS" /t REG_SZ /d "\"%EXE_PATH%\"" /f >nul 2>&1

echo [3/3] Menjalankan WinMac Desktop OS sekarang (Tanpa CMD)...
start "" "%EXE_PATH%"

echo.
echo ============================================================================
echo   SELESAI!
echo   - Shortcut "WinMac Desktop OS" sudah terpasang di Desktop Anda.
echo   - Shortcut "WinMac Desktop OS (Run as Admin)" siap digunakan.
echo   - Setiap kali PC di-restart, aplikasi otomatis berjalan tanpa CMD!
echo ============================================================================
timeout /t 4
