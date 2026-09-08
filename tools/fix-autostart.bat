@echo off
chcp 65001 >nul
title Kerwen — awtostart duzet (restart son serwer)
cd /d "%~dp0"

echo.
echo Bu skript (taeze main PC / restart son ishlanok bolsa):
echo  1) EXE + kerwen-root.txt taezeden yazýar
echo  2) Startup + Task Scheduler (logon + 2 min)
echo  3) PostgreSQL Service = Automatic + Start
echo.
echo Administrator rugsat peýdaly (Task + Postgres ucin)...
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-autostart.ps1"
echo.
pause
