@echo off
chcp 65001 >nul
title Kerwen — durnukly adres (KerwenKadr)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-stable-lan.ps1"
