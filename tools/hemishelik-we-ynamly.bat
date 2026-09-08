@echo off
chcp 65001 >nul
title Kerwen MAIN - hemishelik IP + HTTPS 8443
cd /d "%~dp0"
echo.
echo MAIN PC (bir gezek, Administrator):
echo  1) Ethernet/LAN IP hemishelik
echo  2) HTTPS 8443 + Root CA
echo  3) Firewall
echo  4) Operator USB papkasy (certs\operator-pack)
echo.
echo Operatorlar: https://IP:8443 + webcam.
echo Olarda BIR GEZEK: 1-sertifikat-ynamly.bat (Admin) - soň meselesiz.
echo (Chrome kanun: her PC-de Root CA bir gezek hokman; Main muny uzakdan edip bilmeyar)
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-secure-lan.ps1" -Force
echo.
echo Operatorlara berin:
echo   certs\operator-pack\
echo   - Kerwen-Giris.url
echo   - 1-sertifikat-ynamly.bat  (her operator PC-de bir gezek Admin)
echo   - kerwen-https.cer
echo.
pause
