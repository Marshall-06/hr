@echo off
chcp 65001 >nul
title Kerwen - Taze Main APPLY
cd /d "%~dp0"

echo.
echo ========================================
echo   Kerwen TÄZE MAIN PC — doly gurna
echo ========================================
echo.
echo Kod + baza + suratlar + Panel EXE
echo.

REM Cyrillic/OneDrive: Admin RunAs ýykylyşynyň öňüni almak — TEMP-e göçür
set "SRC=%~dp0"
set "TMP=%TEMP%\kerwen-taze-apply"
if exist "%TMP%" rd /s /q "%TMP%" 2>nul
mkdir "%TMP%" 2>nul
xcopy "%SRC%*" "%TMP%\" /E /I /Y /Q >nul
if not exist "%TMP%\apply-full-new-pc.ps1" (
  echo [!] Pack göçürilmedi. USB-den APPLY-TAZE-MAIN.bat işlediň.
  pause
  exit /b 1
)

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Admin rugsat soralar (firewall / awtostart)...
  powershell -NoProfile -Command "Start-Process -FilePath '%TMP%\APPLY-TAZE-MAIN.bat' -Verb RunAs"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%TMP%\apply-full-new-pc.ps1" -PackDir "%SRC%"
echo.
pause
