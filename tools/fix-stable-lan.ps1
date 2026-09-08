# Kerwen — durnukly LAN adres (IP uytgese-de bir at)
# Admin PC-de bir gezek (Administrator bilen) ishledin.
$ErrorActionPreference = 'Stop'

$DesiredName = 'KerwenKadr'
if ($env:KERWEN_LAN_NAME) { $DesiredName = ($env:KERWEN_LAN_NAME -split '[,;\s]+')[0].Trim() }

Write-Host "=== Kerwen durnukly adres ===" -ForegroundColor Cyan
Write-Host "Maksat: operatorlar hemişe https://${DesiredName}:8443 ulansyn (IP yazman)."
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Admin rugsat gerek — yene basylýar..." -ForegroundColor Yellow
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath
  )
  exit
}

$current = $env:COMPUTERNAME
Write-Host "Häzirki PC ady: $current"

if ($current -ne $DesiredName) {
  Write-Host "PC ady üýtgedilýär: $current → $DesiredName" -ForegroundColor Yellow
  Rename-Computer -NewName $DesiredName -Force
  Write-Host "[OK] At bellendi. Windows täzeden açylandan soň işleýär." -ForegroundColor Green
  $needReboot = $true
} else {
  Write-Host "[OK] PC ady eýýäm $DesiredName" -ForegroundColor Green
  $needReboot = $false
}

# Localhost hosts — KerwenKadr → 127.0.0.1 (admin PC synagy)
$hosts = "$env:WINDIR\System32\drivers\etc\hosts"
$line = "127.0.0.1`t$DesiredName"
$hostsText = Get-Content -LiteralPath $hosts -ErrorAction SilentlyContinue -Raw
if ($hostsText -notmatch [regex]::Escape($DesiredName)) {
  Add-Content -LiteralPath $hosts -Value "`r`n$line" -Encoding ascii
  Write-Host "[OK] hosts: $line" -ForegroundColor Green
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root
$env:HTTPS_REGEN = '1'
$env:HTTPS_ENABLED = '1'
$env:KERWEN_LAN_NAME = $DesiredName
try {
  node -e "require('./src/utils/httpsCert').loadHttpsOptions(); console.log('Sertifikat tazelendi')"
} finally {
  Remove-Item Env:HTTPS_REGEN -ErrorAction SilentlyContinue
}

# Root CA - su PC-de ynamly et (IP uytgese-de yene gerek dal)
$CaCer = Join-Path $Root 'certs\kerwen-ca.cer'
$LeafCer = Join-Path $Root 'certs\kerwen.cer'
$Cer = if (Test-Path $CaCer) { $CaCer } else { $LeafCer }
if (Test-Path $Cer) {
  certutil -addstore -user Root $Cer | Out-Null
  certutil -addstore Root $Cer | Out-Null
  Write-Host "[OK] Root CA Trusted Root-a goyuldy" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== OPERATORLAR UCIN (IP yazman) ===" -ForegroundColor Green
Write-Host "  https://${DesiredName}:8443/admin/login.html"
Write-Host ""
Write-Host "Şertler:"
Write-Host "  1) Admin we operatorlar bir Wi‑Fi / tor-da bolsun"
Write-Host "  2) Operator PC-de bir gezek: tools\trust-https-operator.bat"
Write-Host "  3) Brauzerde Advanced gerek bolmaz (trust-dan soň)"
Write-Host ""
Write-Host "IP üýtgände-de at şol galýar (Windows ady bilen çözülýär)."
Write-Host "Hasam durnukly: router-da DHCP Reservation ýa-da Windows-da Static IP."
Write-Host ""

if ($needReboot) {
  $ans = Read-Host "Indi Windows-y täzeden açmalymy? (Y/N)"
  if ($ans -match '^[YyДд]') {
    Restart-Computer -Force
  } else {
    Write-Host "Täzeden açandan soň https://${DesiredName}:8443 işleýär."
  }
} else {
  Write-Host "Serweri täzeläň: npm run dev"
  pause
}
