@echo off
chcp 65001 >nul
title Kerwen — Kamera / HTTPS (8443)
cd /d "%~dp0.."

echo.
echo === Kerwen webkamera / port 8443 ===
echo.

:: Firewall (Admin)
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Firewall acmak ucin Admin rugsat gerek...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="Kerwen Kadr 8000" >nul 2>&1
netsh advfirewall firewall delete rule name="Kerwen Kadr 8443" >nul 2>&1
netsh advfirewall firewall add rule name="Kerwen Kadr 8000" dir=in action=allow protocol=TCP localport=8000 >nul
netsh advfirewall firewall add rule name="Kerwen Kadr 8443" dir=in action=allow protocol=TCP localport=8443 >nul
echo [OK] Firewall: 8000 we 8443 acyldy.
echo.

echo Su PC-nin IP-leri (operatorlar suny ulanmaly):
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=*" %%b in ("%%a") do echo   https://%%b:8443/admin/login.html
)
echo.
echo MUHIM:
echo  1) Operator PC-de localhost YAZMAN — Admin IP yazyn
echo  2) Advanced bolmaz yaly: tools\trust-https-operator.bat  (bir gezek)
echo     yada: http://ADMIN_IP:8000/admin/trust-https.html
echo  3) Brauzeri doly yapyp yene acyn, son https://ADMIN_IP:8443
echo  4) Serwer islemeli: npm run dev  (HTTPS_ENABLED=1)
echo.
echo Admin PC-de synag: https://localhost:8443/admin/login.html
echo.
pause
