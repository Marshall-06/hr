@echo off
chcp 65001 >nul
title Kerwen — serwer awtomatik + operator pack
cd /d "%~dp0"
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Administrator rugsat gerek (Task Scheduler ucin)...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo.
echo Bu skript:
echo  - Windows yakylanda Kerwen serweri awtomatik basladyar
echo  - Operatorlar ucin kerwen-kadr hosts + Home Screen .url tayyarlayar
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serwer-awtomatik.ps1"
echo.
pause
