@echo off
chcp 65001 >nul
title Kerwen — Taze Main PC (hemme funksiya)
cd /d "%~dp0\.."

echo.
echo ========================================
echo   Kerwen — TAEZE MAIN PC GURNASYK
echo ========================================
echo.
echo Ilki Node.js + PostgreSQL gurnaly bolmaly!
echo.
pause

REM OneDrive/Cyrillic: Admin RunAs TEMP arkaly
set "PS1=%~dp0setup-new-main-pc.ps1"
set "TMPBAT=%TEMP%\kerwen-setup-new-pc.bat"
(
  echo @echo off
  echo powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
  echo pause
) > "%TMPBAT%"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Administrator rugsat...
  powershell -NoProfile -Command "Start-Process -FilePath '%TMPBAT%' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
echo.
pause
