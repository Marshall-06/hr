@echo off
cd /d "%~dp0"
echo.
echo Kerwen kod update. Admin gerek DAL.
echo Suratlar we baza galýar.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-code-update.ps1"
echo.
pause
