# Admin PC — hemişelik IP (DHCP üýtgetmez)
# Operatorlar soň hemişe https://ŞOL_IP:8443 ulanýar.
$ErrorActionPreference = 'Stop'

Write-Host "=== Kerwen hemişelik IP ===" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $PSCommandPath)
  exit
}

function Get-KerwenLanAdapters {
  $all = @(Get-NetIPConfiguration | Where-Object {
    $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' -and
    $_.IPv4Address.IPAddress -notlike '127.*' -and
    $_.IPv4Address.IPAddress -notlike '169.254.*'
  })
  $rows = @()
  foreach ($c in $all) {
    $n = "$($c.InterfaceAlias) $($c.NetAdapter.Name) $($c.NetAdapter.InterfaceDescription)"
    if ($n -match 'Virtual|vEthernet|Hyper-V|PdaNet|WSL|Bluetooth|VPN|TAP|Tunnel') { continue }
    $media = ''
    try { $media = [string]$c.NetAdapter.MediaType } catch { }
    $kind = if ($media -match '802\.11|Native 802\.11' -or $n -match 'Wi-?Fi|WLAN|Wireless|802\.11') { 'Wi-Fi' }
      elseif ($media -eq '802.3' -or $n -match '(?i)^Ethernet|\bEthernet\b|\bLAN\b|Kabel|Realtek.*GbE|Intel\(R\).*Ethernet') { 'Ethernet' }
      else { 'Beýleki' }
    $rows += [pscustomobject]@{
      Kind = $kind
      Cfg  = $c
      Label = "$kind | $($c.InterfaceAlias) | $($c.IPv4Address.IPAddress)"
      Order = if ($kind -eq 'Ethernet') { 0 } elseif ($kind -eq 'Wi-Fi') { 1 } else { 2 }
    }
  }
  @($rows | Sort-Object Order, Label)
}

$adapters = @(Get-KerwenLanAdapters)
if (-not $adapters.Count) {
  throw "Işleýän tor tapylmady. Ethernet (LAN) ýa-da Wi-Fi birikdiriň we täzeden işlediň."
}

$ethList = @($adapters | Where-Object { $_.Kind -eq 'Ethernet' })
Write-Host ""
Write-Host "Tor sanawy (ilki Ethernet / LAN):" -ForegroundColor Yellow
for ($i = 0; $i -lt $adapters.Count; $i++) {
  Write-Host ("  {0}) {1}" -f ($i + 1), $adapters[$i].Label)
}
Write-Host ""
if ($ethList.Count) {
  Write-Host "  Maslahat: 1 = Ethernet / LAN" -ForegroundColor DarkGray
}
$defaultPick = '1'
$pick = Read-Host "Belgisi (1-$($adapters.Count), Enter = $defaultPick / LAN)"
if ([string]::IsNullOrWhiteSpace($pick)) { $pick = $defaultPick }
if ($pick -notmatch '^\d+$' -or [int]$pick -lt 1 -or [int]$pick -gt $adapters.Count) {
  throw "Nädogry saýlaw."
}
$chosen = $adapters[[int]$pick - 1]
$cfg = $chosen.Cfg
Write-Host "Saýlanan: $($chosen.Label)" -ForegroundColor Green
if ($chosen.Kind -ne 'Ethernet') {
  Write-Host "[!] Wi-Fi — IP üýtgäp bilýär. Mümkin bolsa Ethernet kabel." -ForegroundColor Yellow
}

$ifIndex = $cfg.InterfaceIndex
$alias = $cfg.InterfaceAlias
$currentIp = $cfg.IPv4Address.IPAddress
$prefix = $cfg.IPv4Address.PrefixLength
$gateway = $cfg.IPv4DefaultGateway.NextHop
$dns = @($cfg.DNSServer.ServerAddresses | Where-Object { $_ -and $_ -notmatch ':' })

Write-Host "Tor:      $alias ($($chosen.Kind))"
Write-Host "Häzirki:  $currentIp /$prefix"
Write-Host "Gateway:  $gateway"
Write-Host "DNS:      $($dns -join ', ')"
Write-Host ""
Write-Host "Maslahat: şol IP-ni hemişelik ediň (DHCP üýtgetmez)."
$ans = Read-Host "Hemişelik IP edilsinmi? ($currentIp)  Y/N"
if ($ans -notmatch '^[YyДд]') {
  Write-Host "Ýatyryldy. Operatorlar üçin häzirki IP: https://${currentIp}:8443/admin/login.html"
  pause
  exit 0
}

# DHCP aýyr, static goý
try {
  $dhcp = Get-NetIPInterface -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
  if ($dhcp -and $dhcp.Dhcp -eq 'Enabled') {
    Set-NetIPInterface -InterfaceIndex $ifIndex -Dhcp Disabled
  }
} catch { }

Get-NetIPAddress -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -eq $currentIp } |
  ForEach-Object {
    Remove-NetIPAddress -InterfaceIndex $ifIndex -IPAddress $_.IPAddress -Confirm:$false -ErrorAction SilentlyContinue
  }
Get-NetRoute -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.DestinationPrefix -eq '0.0.0.0/0' } |
  Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue

New-NetIPAddress -InterfaceIndex $ifIndex -IPAddress $currentIp -PrefixLength $prefix -DefaultGateway $gateway | Out-Null
if ($dns.Count) {
  Set-DnsClientServerAddress -InterfaceIndex $ifIndex -ServerAddresses $dns
}

Write-Host "[OK] Hemişelik IP: $currentIp" -ForegroundColor Green

# Firewall + Private + awtomatik Task
& (Join-Path $PSScriptRoot 'ensure-lan-access.ps1') -RegisterTask -Quiet
Write-Host "[OK] Operator LAN açyk (Firewall + Private Task)" -ForegroundColor Green

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

# Sertifikat täzele
$env:HTTPS_REGEN = '1'
$env:HTTPS_ENABLED = '1'
try {
  node -e "require('./src/utils/httpsCert').loadHttpsOptions(); console.log('Sertifikat OK')"
} finally {
  Remove-Item Env:HTTPS_REGEN -ErrorAction SilentlyContinue
}

# Operator üçin hosts + shortcut faýllary
$outDir = Join-Path $Root 'certs\operator-pack'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$hostsBat = @"
@echo off
chcp 65001 >nul
title Kerwen — hosts (bir gezek)
echo KerwenKadr -> $currentIp
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Admin rugsat gerek...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set HOSTS=%SystemRoot%\System32\drivers\etc\hosts
findstr /i /c:"KerwenKadr" "%HOSTS%" >nul 2>&1 && (
  powershell -NoProfile -Command "(Get-Content -LiteralPath '%HOSTS%') | Where-Object { `$_ -notmatch 'KerwenKadr' } | Set-Content -LiteralPath '%HOSTS%' -Encoding ascii"
)
echo $currentIp	KerwenKadr>> "%HOSTS%"
echo [OK] Indi brauzerde: https://KerwenKadr:8443/admin/login.html
echo Yada goni IP: https://${currentIp}:8443/admin/login.html
echo Brauzeri doly yapyp acyn.
pause
"@
Set-Content -LiteralPath (Join-Path $outDir '1-hosts-gur.bat') -Value $hostsBat -Encoding ascii

$trustSrc = Join-Path $Root 'tools\trust-https-operator.bat'
if (Test-Path $trustSrc) { Copy-Item -Force $trustSrc (Join-Path $outDir '2-sertifikat-ynamly.bat') }
$caCer = Join-Path $Root 'certs\kerwen-ca.cer'
$leafCer = Join-Path $Root 'certs\kerwen.cer'
$cer = if (Test-Path $caCer) { $caCer } else { $leafCer }
if (Test-Path $cer) { Copy-Item -Force $cer (Join-Path $outDir 'kerwen-https.cer') }

$urlIp = "https://${currentIp}:8443/admin/login.html"
$urlName = "https://KerwenKadr:8443/admin/login.html"
$shortcut = @"
[InternetShortcut]
URL=$urlIp
"@
Set-Content -LiteralPath (Join-Path $outDir 'Kerwen-Giriş-IP.url') -Value $shortcut -Encoding ascii

$readme = @"
OPERATOR PC (bir gezek):
1) 2-sertifikat-ynamly.bat — Advanced/Proceed bolmaz
2) 1-hosts-gur.bat — KerwenKadr adyny IP-a baglaýar
3) Brauzeri ýapyp açyň
4) Giriş: $urlName
   ýa-da: $urlIp

IP üýtgände admin täzeden tools\set-static-ip.ps1 / bu paketi täzelär.
"@
Set-Content -LiteralPath (Join-Path $outDir 'OKA-MENI.txt') -Value $readme -Encoding utf8

Write-Host ""
Write-Host "=== OPERATORLAR UCIN ===" -ForegroundColor Green
Write-Host "Goni (iň ygtybarly): $urlIp"
Write-Host "At bilen (hosts-dan soň): $urlName"
Write-Host "USB / paýlaşyk: $outDir"
Write-Host ""
Write-Host "Serwer: npm run dev"
pause
