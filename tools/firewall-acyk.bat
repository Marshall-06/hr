@echo off
chcp 65001 >nul
title Kerwen — Firewall + Private (operator LAN)
cd /d "%~dp0"
echo.
echo Tor Private + port 8000/8443 + awtomatik Task.
echo Administrator rugsat sorar.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-lan-access.ps1" -RegisterTask
echo.
pause
