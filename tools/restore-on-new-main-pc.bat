@echo off
chcp 65001 >nul
title Kerwen - Taze Main PC baza restore
cd /d "%~dp0.."
echo.
echo Taze Main PC-de bazany restore eder we «Bizin yerlesdirenlerimiz» barlayar.
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-on-new-main-pc.ps1"
echo.
pause
