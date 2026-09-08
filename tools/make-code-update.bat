@echo off
chcp 65001 >nul
title Kerwen — kod update pack
cd /d "%~dp0"
echo.
echo Diňe KOD pack taýýarlanýar.
echo Suratlar, baza, .env pack-a girmeýär.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-code-update.ps1"
echo.
pause
