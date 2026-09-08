@echo off
chcp 65001 >nul
title Kerwen - HTTPS Root CA (bir gezek, hemishelik)
cd /d "%~dp0"

echo.
echo Bu BIR GEZEK Admin bilen ishlenmeli.
echo Root CA LocalMachine-e goyulyar - 15 yyl Advanced bolmaz.
echo (certs\kerwen-ca.cer POZMAN - tazeden doretmek ynamy yitiryar)
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Administrator rugsat gerek...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "CER=%~dp0..\certs\kerwen-ca.cer"
if not exist "%CER%" set "CER=%~dp0..\certs\kerwen-https.cer"
if not exist "%CER%" set "CER=%~dp0kerwen-ca.cer"
if not exist "%CER%" set "CER=%~dp0kerwen-https.cer"
if not exist "%CER%" (
  echo [YALNYS] kerwen-ca.cer tapylmady.
  echo Ilki serweri acyn: npm run dev
  echo.
  pause
  exit /b 1
)

echo Sertifikat: %CER%
echo.

certutil -addstore -f Root "%CER%"
if %errorlevel% neq 0 (
  echo [YALNYS] LocalMachine Trusted Root goyulmady.
  pause
  exit /b 1
)
certutil -addstore -f -user Root "%CER%" >nul 2>&1

echo.
echo [OK] Root CA hemishelik ynamly (LocalMachine + User).
echo.
echo Indi:
echo  1) Chrome / Edge-i DOLY yapyn (tray-den Cyk)
echo  2) Acyn: https://192.168.2.10:8443/admin/login.html
echo     yada oz LAN IP
echo  3) Advanced BOLMALY DAL
echo.
echo Operator PC-lerde hem BIR GEZEK:
echo   certs\operator-pack\1-sertifikat-ynamly.bat  (Run as administrator)
echo.
echo UNUTMAN: "Advanced - Proceed" ynam DAL. Diňe su skript.
echo certs\kerwen-ca.cer / kerwen-ca.pfx POZMAN.
echo.
pause
