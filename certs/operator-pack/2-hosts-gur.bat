@echo off
chcp 65001 >nul
title Kerwen hosts
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set HOSTS=%SystemRoot%\System32\drivers\etc\hosts
powershell -NoProfile -Command "(Get-Content -LiteralPath '%HOSTS%' -ErrorAction SilentlyContinue) | Where-Object { $_ -notmatch 'KerwenKadr' } | Set-Content -LiteralPath '%HOSTS%' -Encoding ascii"
echo 192.168.2.10	KerwenKadr>> "%HOSTS%"
echo [OK] https://KerwenKadr:8443  we  https://192.168.2.10:8443
pause
