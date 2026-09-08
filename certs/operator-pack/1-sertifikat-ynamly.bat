@echo off
chcp 65001 >nul
title Kerwen - Operator (bir gezek)
cd /d "%~dp0"

:: Main PC bir gezek tayyar. Operator PC-de DIŇE SU faýl - bir gezek Admin.
:: Softan hemişe: https://IP:8443 - Advanced yok, webcam ishleyar.

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Administrator rugsat...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "CER=%~dp0kerwen-https.cer"
if not exist "%CER%" set "CER=%~dp0kerwen-ca.cer"
if not exist "%CER%" (
  echo [YALNYS] kerwen-https.cer yok. Admin USB/papkadan operator-pack berin.
  pause
  exit /b 1
)

echo Root CA goyulyar (LocalMachine) - bir gezek...
certutil -addstore -f Root "%CER%" >nul
if %errorlevel% neq 0 (
  echo [YALNYS] Sertifikat goyulmady.
  pause
  exit /b 1
)
certutil -addstore -f -user Root "%CER%" >nul 2>&1

:: IP OKA.txt / Giris.url-dan oka
set "IP="
set "URL="
if exist "%~dp0Kerwen-Giris.url" (
  for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0Kerwen-Giris.url") do (
    if /I "%%a"=="URL" set "URL=%%b"
  )
)
if defined URL (
  echo.
  echo [OK] Tayyar. Chrome/Edge-i DOLY yapyn, son acyn:
  echo   %URL%
  echo.
  start "" "%URL%"
) else (
  echo.
  echo [OK] Tayyar. Chrome/Edge-i DOLY yapyn, son:
  echo   https://ADMIN_IP:8443/admin/login.html
  echo.
)

echo Softan yene ishlemeli DAL. Webcam + 8443 ishleyar.
echo.
pause
