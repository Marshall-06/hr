# Serwer PC: Windows ýakylanda Kerwen awtomatik başlasyn (Task Scheduler — Startup-dan ygtybarlyrak)
# Operator pack: kerwen-kadr aty + Home Screen .url
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$InstallDir = Join-Path $env:LOCALAPPDATA 'KerwenKadr'
$Exe = Join-Path $InstallDir 'Kerwen.exe'
if (-not (Test-Path $Exe)) {
  $Exe = Get-ChildItem (Join-Path $env:LOCALAPPDATA '*Kadr') -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ChildItem $_.FullName -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1 } |
    Where-Object { $_ } | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Exe -or -not (Test-Path $Exe)) {
  Write-Host "Ilki tools\Install.bat / install-kerwen.ps1 işlediň (EXE gurnalmaly)." -ForegroundColor Yellow
  throw "Kerwen.exe tapylmady"
}

$taskName = 'KerwenKadrServer'
$action = New-ScheduledTaskAction -Execute $Exe -Argument '--autostart --silent' -WorkingDirectory (Split-Path $Exe)
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "[OK] Task Scheduler: $taskName (Windows girilende serwer başlaýar)" -ForegroundColor Green

# Häzirki IP — ilki Ethernet / LAN, ýok bolsa Wi-Fi
$lanAll = @(Get-NetIPConfiguration | Where-Object {
  $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' -and
  $_.IPv4Address.IPAddress -notlike '127.*' -and
  $_.IPv4Address.IPAddress -notlike '169.254.*'
})
$pickLan = {
  param($preferEth)
  $lanAll | Where-Object {
    $n = "$($_.InterfaceAlias) $($_.NetAdapter.Name) $($_.NetAdapter.InterfaceDescription)"
    if ($n -match 'Virtual|vEthernet|Hyper-V|PdaNet|WSL|Bluetooth|VPN|TAP|Tunnel') { return $false }
    $media = ''
    try { $media = [string]$_.NetAdapter.MediaType } catch { }
    $isWifi = ($media -match '802\.11' -or $n -match 'Wi-?Fi|WLAN|Wireless|802\.11')
    $isEth = (-not $isWifi) -and ($media -eq '802.3' -or $n -match '(?i)\bEthernet\b|\bLAN\b|Kabel')
    if ($preferEth) { return $isEth }
    return $isWifi
  } | Select-Object -First 1
}
$cfg = & $pickLan $true
if (-not $cfg) { $cfg = & $pickLan $false }
$ip = if ($cfg) { $cfg.IPv4Address.IPAddress } else { '192.168.1.16' }

$outDir = Join-Path $Root 'certs\operator-pack'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$hostsBat = @"
@echo off
chcp 65001 >nul
title Kerwen — kerwen-kadr hosts
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set HOSTS=%SystemRoot%\System32\drivers\etc\hosts
powershell -NoProfile -Command "(Get-Content -LiteralPath '%HOSTS%' -ErrorAction SilentlyContinue) | Where-Object { `$_ -notmatch 'kerwen-kadr|KerwenKadr' } | Set-Content -LiteralPath '%HOSTS%' -Encoding ascii"
echo $ip	kerwen-kadr>> "%HOSTS%"
echo $ip	KerwenKadr>> "%HOSTS%"
echo [OK] https://kerwen-kadr:8443/admin/login.html
echo     https://${ip}:8443/admin/login.html
echo Brauzeri DOLY yapyň we açyň.
pause
"@
Set-Content -LiteralPath (Join-Path $outDir '1-hosts-kerwen-kadr.bat') -Value $hostsBat -Encoding ascii

$urlName = "https://kerwen-kadr:8443/admin/login.html"
$urlIp = "https://${ip}:8443/admin/login.html"
@"
[InternetShortcut]
URL=$urlName
"@ | Set-Content -LiteralPath (Join-Path $outDir 'Kerwen-Giriş.url') -Encoding ascii

@"
[InternetShortcut]
URL=$urlIp
"@ | Set-Content -LiteralPath (Join-Path $outDir 'Kerwen-Giriş-IP.url') -Encoding ascii

$trust = Join-Path $Root 'tools\trust-https-operator.bat'
if (Test-Path $trust) { Copy-Item -Force $trust (Join-Path $outDir '2-sertifikat-ynamly.bat') }
$caCer = Join-Path $Root 'certs\kerwen-ca.cer'
$leafCer = Join-Path $Root 'certs\kerwen.cer'
$cer = if (Test-Path $caCer) { $caCer } else { $leafCer }
if (Test-Path $cer) { Copy-Item -Force $cer (Join-Path $outDir 'kerwen-https.cer') }

@"
SERWER PC (bir gezek):
- tools\Install.bat
- tools\serwer-awtomatik.bat   (bu skript)
- Hemişelik IP: $ip
- Firewall: tools\firewall-acyk.bat

OPERATOR PC (bir gezek):
1) 1-hosts-kerwen-kadr.bat   (Administrator)
2) 2-sertifikat-ynamly.bat   (islege)
3) Brauzeri ýapyp açyň
4) Açyň: $urlName
5) Add to Home Screen / Pin — URL kerwen-kadr bolsun

Ähli operatorlar şol Wi-Fi-de bolmaly. Serwer PC işläp durmaly.
"@ | Set-Content -LiteralPath (Join-Path $outDir 'OKA-MENI.txt') -Encoding utf8

Write-Host ""
Write-Host "Operator pack: $outDir" -ForegroundColor Green
Write-Host "At:  $urlName"
Write-Host "IP:  $urlIp"
Write-Host ""
Write-Host "Sertifikat üçin serweri bir gezek HTTPS_REGEN=1 bilen täzeläň ýa-da npm run dev gaýtadan başlatyň."
if (-not $Force) { pause }
