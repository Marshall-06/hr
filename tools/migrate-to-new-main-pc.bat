@echo off
chcp 65001 >nul
title Kerwen - Taze Main PC pack
cd /d "%~dp0"
echo.
echo Bu skript HAZIRKI Main PC-den pack tayyarlayar:
echo  - public\uploads  (programma / Taze anketa SURATLARY)
echo  - certs           (HTTPS)
echo  - data            (pocta, option-list, skan)
echo  - baza dump
echo  - suratlar
echo.
echo Softan pack-y USB bilen TAZE Main PC-a gocuk.
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0migrate-to-new-main-pc.ps1"
echo.
pause
