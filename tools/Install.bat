@echo off
chcp 65001 >nul
title Kerwen Install — Panel + awtostart
cd /d "%~dp0"

echo.
echo ========================================
echo   Kerwen Panel + serwer awtostart
echo ========================================
echo.
echo Bu gurnalýar:
echo   - Desktop: Kerwen Panel
echo   - Windows ýakylanda serwer awtomatik
echo   - Her 5 minut: serwer düşse täzelenýär
echo   - PostgreSQL Automatic
echo   - Indi serwer başladylýar
echo.
echo Taze Main PC (baza + hemme zat): [1]
echo Panel + awtostart (hemişe):       [2]
echo Awtostart diňe duzet:             [3]
echo.
choice /C 123 /N /M "Saylan (1/2/3) — köplenç [2]: "
if errorlevel 3 goto FIXAUTO
if errorlevel 2 goto PANEL
if errorlevel 1 goto FULL

:FULL
echo.
echo Doly taze Main PC...
call "%~dp0tools\setup-new-main-pc.bat"
goto END

:PANEL
echo.
echo Panel EXE + awtostart gurnalýar...
REM OneDrive/Cyrillic: Admin TEMP arkaly
set "PS1=%~dp0tools\install-kerwen.ps1"
set "TMPBAT=%TEMP%\kerwen-install-panel.bat"
(
  echo @echo off
  echo cd /d "%~dp0"
  echo powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
  echo if errorlevel 1 pause
) > "%TMPBAT%"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Administrator rugsat (Task + Postgres)...
  powershell -NoProfile -Command "Start-Process -FilePath '%TMPBAT%' -Verb RunAs -Wait"
  goto AFTER_PANEL
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
if errorlevel 1 (
  echo EXE gurnalmady.
  pause
  exit /b 1
)

:AFTER_PANEL
echo.
echo Serwer hemişe awtostart: Startup + Task + Watch (5 min)
echo Desktopdaky «Kerwen Panel» — brauzer üçin.
echo Restart soň 30-60 s — serwer özi başlar, durup galmaz.
goto END

:FIXAUTO
REM Admin TEMP arkaly
set "FIXPS=%~dp0tools\fix-autostart.ps1"
set "TMPFIX=%TEMP%\kerwen-fix-auto.bat"
(
  echo @echo off
  echo powershell -NoProfile -ExecutionPolicy Bypass -File "%FIXPS%"
  echo pause
) > "%TMPFIX%"
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%TMPFIX%' -Verb RunAs -Wait"
  goto END
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%FIXPS%"
goto END

:END
echo.
pause
