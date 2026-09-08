@echo off
chcp 65001 >nul
title Kerwen Panel gurna (EXE)
cd /d "%~dp0.."
echo.
echo Desktop Kerwen Panel + awtostart gurnalýar...
echo.
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-kerwen.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-autostart.ps1"
echo.
echo Desktop: Kerwen Panel
echo Restart son serwer awtomatik baslamaly.
pause
