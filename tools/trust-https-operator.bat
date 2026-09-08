@echo off
chcp 65001 >nul
title Kerwen — HTTPS ynamly (bir gezek)
cd /d "%~dp0.."

echo.
echo === Kerwen HTTPS: Advanced / Proceed bolmaz yaly ===
echo.
echo Bu BIR GEZEK ishlenmeli.
echo Son reboot / Add to Home Screen-de goni acylyar.
echo.

set "CER=%~dp0..\certs\kerwen-ca.cer"
if not exist "%CER%" set "CER=%~dp0..\certs\kerwen.cer"
if not exist "%CER%" set "CER=%~dp0kerwen-ca.cer"
if not exist "%CER%" set "CER=%~dp0kerwen.cer"
if not exist "%CER%" (
  echo [YALNYS] kerwen-ca.cer / kerwen.cer tapylmady.
  echo Admin PC-den:
  echo   http://ADMIN_IP:8000/kerwen-https.cer
  echo yada: certs\kerwen-ca.cer
  echo.
  pause
  exit /b 1
)

echo Sertifikat (Root CA): %CER%
echo.

:: Current user Trusted Root
certutil -addstore -user Root "%CER%" >nul 2>&1
if %errorlevel% equ 0 (
  echo [OK] Trusted Root — bu ulanyjy (Chrome / Edge / Add to Home Screen)
) else (
  echo [!] Ulanyjy store yalnyslyk — Admin bilen synanyan...
)

:: LocalMachine (Administrator)
net session >nul 2>&1
if %errorlevel% equ 0 (
  certutil -addstore Root "%CER%" >nul 2>&1
  if %errorlevel% equ 0 (
    echo [OK] Trusted Root — LocalMachine (ahli ulanyjylar)
  )
) else (
  echo.
  echo *** MUHUM ***
  echo Ahli PC / reboot ucin: sag basyn → "Run as administrator"
  echo.
)

echo.
echo Indi:
echo  1) Chrome / Edge-i DOLY yapyn (tray-den hem Cyk)
echo  2) Acyn: https://KerwenKadr:8443/admin/login.html
echo     yada: https://ADMIN_IP:8443/admin/login.html
echo  3) Yesil galkansyz / Advanced bolmaly DAL
echo  4) Son: brauzer menyu → Install / Add to Home screen
echo.
echo UNUTMAN: "Advanced → Proceed" ynam DAL — diňe bu skript ynamly edyar.
echo IP uytgese-de CA saklanýar — skripti yene ishlemeli däl.
echo.
pause
