@echo off
chcp 65001 >nul
title Kerwen - Taze Main USB pack
cd /d "%~dp0.."
echo.
echo Bu PC-den TÄZE Main PC üçin DOLY pack:
echo   kod + baza + suratlar + poçta + 3x4
echo.
echo Cykyş: tools\_taze-main-usb
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-taze-main-usb.ps1"
echo.
pause
