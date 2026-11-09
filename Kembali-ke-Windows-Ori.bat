@echo off
title Kembali ke Tampilan Windows Original
color 0E
echo ============================================================================
echo   KEMBALI KE TAMPILAN WINDOWS ORIGINAL (MATIKAN WINMAC DESKTOP OS)
echo ============================================================================
echo.

echo [1/2] Menutup aplikasi WinMac Desktop OS yang sedang berjalan...
taskkill /F /IM "WinMac Desktop OS.exe" >nul 2>&1
taskkill /F /IM "WinMac Desktop OS (Admin).exe" >nul 2>&1
taskkill /F /IM "electron.exe" >nul 2>&1

echo [2/2] Menghapus Auto-Start dari Startup Windows (agar saat Restart tetap Windows Ori)...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "WinMacDesktopOS" /f >nul 2>&1
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WinMac Desktop OS.lnk" >nul 2>&1

echo.
echo ============================================================================
echo   SELESAI! Tampilan Anda sudah kembali 100%% ke Windows Original.
echo   (Jika suatu saat ingin memakai tema WinMac lagi, cukup klik 2x
echo    file "WinMac Desktop OS.exe" atau "Pasang-ke-Desktop-dan-Startup.bat")
echo ============================================================================
timeout /t 4
