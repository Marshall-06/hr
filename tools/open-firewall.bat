@echo off
:: Kerwen — Windows Firewall 8000 we 8443 + Private (Admin)
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-lan-access.ps1" -RegisterTask
