@echo off
chcp 65001 >nul
title Kerwen — hemişelik IP
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-static-ip.ps1"
