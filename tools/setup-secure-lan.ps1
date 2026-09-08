# Kerwen - hemishelik IP + sertifikat ynamly (Advanced bolmaz)
# Admin PC-de bir gezek Administrator bilen.
param(
  [switch]$Force,
  [switch]$SkipStaticIp
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

Write-Host "=== Kerwen HTTPS: hemishelik IP + ynamly sertifikat ===" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Admin rugsat gerek..." -ForegroundColor Yellow
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
  if ($Force) { $argList += '-Force' }
  if ($SkipStaticIp) { $argList += '-SkipStaticIp' }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
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
      else { 'Other' }
    $rows += [pscustomobject]@{
      Kind  = $kind
      Cfg   = $c
      Label = "$kind | $($c.InterfaceAlias) | $($c.IPv4Address.IPAddress)"
      Order = if ($kind -eq 'Ethernet') { 0 } elseif ($kind -eq 'Wi-Fi') { 1 } else { 2 }
    }
  }
  @($rows | Sort-Object Order, Label)
}

$adapters = @(Get-KerwenLanAdapters)
if (-not $adapters.Count) {
  throw "Isleyan tor tapylmady. Ethernet (LAN) ya-da Wi-Fi birikdirin."
}

$ethList = @($adapters | Where-Object { $_.Kind -eq 'Ethernet' })
Write-Host ""
Write-Host "Tor sanawy (ilki Ethernet / LAN):" -ForegroundColor Yellow
for ($i = 0; $i -lt $adapters.Count; $i++) {
  Write-Host ("  {0}) {1}" -f ($i + 1), $adapters[$i].Label)
}

# -Force (hemishelik bat): Ethernet bar bolsa awto sayla
if ($Force -and $ethList.Count) {
  $chosen = $ethList[0]
  Write-Host ""
  Write-Host "Awto saylandy (LAN): $($chosen.Label)" -ForegroundColor Green
} else {
  Write-Host ""
  if ($ethList.Count) {
    Write-Host "  Maslahat: 1 = Ethernet / LAN (kabel)" -ForegroundColor DarkGray
  } else {
    Write-Host "  UNS: Ethernet yok - Wi-Fi IP uytgap bilyar" -ForegroundColor DarkYellow
  }
  $defaultPick = '1'
  $pick = Read-Host "Belgisi (1-$($adapters.Count), Enter = $defaultPick / LAN)"
  if ([string]::IsNullOrWhiteSpace($pick)) { $pick = $defaultPick }
  if ($pick -notmatch '^\d+$' -or [int]$pick -lt 1 -or [int]$pick -gt $adapters.Count) {
    throw "Nadogry saylaw."
  }
  $chosen = $adapters[[int]$pick - 1]
  Write-Host "Saylanan: $($chosen.Label)" -ForegroundColor Green
}

$cfg = $chosen.Cfg
if ($chosen.Kind -ne 'Ethernet') {
  Write-Host "[!] Wi-Fi / beyleki tor - IP uytgap bilyar. Mumkin bolsa Ethernet kabel." -ForegroundColor Yellow
}

$ifIndex = $cfg.InterfaceIndex
$alias = $cfg.InterfaceAlias
$currentIp = $cfg.IPv4Address.IPAddress
$prefix = $cfg.IPv4Address.PrefixLength
$gateway = $cfg.IPv4DefaultGateway.NextHop
$dns = @($cfg.DNSServer.ServerAddresses | Where-Object { $_ -and $_ -notmatch ':' })
if (-not $dns.Count) { $dns = @('8.8.8.8', '1.1.1.1') }

Write-Host "Tor:     $alias ($($chosen.Kind))"
Write-Host "IP:      $currentIp /$prefix"
Write-Host "Gateway: $gateway"
Write-Host ""

# --- 1) Hemishelik IP ---
if (-not $SkipStaticIp) {
  $doStatic = $Force
  if (-not $Force) {
    $ans = Read-Host "Bu IP-ni hemishelik (static) edelinmi? ($currentIp)  Y/N"
    $doStatic = $ans -match '^[YyDd]'
  }
  if ($doStatic) {
    Write-Host "Static IP goyulyar..." -ForegroundColor Yellow
    try {
      $iface = Get-NetIPInterface -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
      if ($iface -and $iface.Dhcp -eq 'Enabled') {
        Set-NetIPInterface -InterfaceIndex $ifIndex -Dhcp Disabled -ErrorAction SilentlyContinue
      }
    } catch {}

    Get-NetIPAddress -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -eq $currentIp } |
      ForEach-Object {
        Remove-NetIPAddress -InterfaceIndex $ifIndex -IPAddress $_.IPAddress -Confirm:$false -ErrorAction SilentlyContinue
      }
    Get-NetRoute -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.DestinationPrefix -eq '0.0.0.0/0' } |
      Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue

    New-NetIPAddress -InterfaceIndex $ifIndex -IPAddress $currentIp -PrefixLength $prefix -DefaultGateway $gateway -ErrorAction Stop | Out-Null
    Set-DnsClientServerAddress -InterfaceIndex $ifIndex -ServerAddresses $dns -ErrorAction SilentlyContinue
    Write-Host "[OK] Hemishelik IP: $currentIp" -ForegroundColor Green
  } else {
    Write-Host "[!] Static IP gecirildi - DHCP IP uytgedip bilyar." -ForegroundColor Yellow
  }
}

# --- 2) Sertifikat: diňe leaf (IP). Root CA saklanýar — ynam ýitmez ---
Write-Host "Sertifikat (server) tazelenyar; Root CA saklanyar..." -ForegroundColor Yellow
$env:HTTPS_REGEN = '1'
$env:HTTPS_ENABLED = '1'
$env:KERWEN_LAN_NAME = 'KerwenKadr'
try {
  node -e "require('./src/utils/httpsCert').loadHttpsOptions(); console.log('Sertifikat OK (CA saklandy)')"
} finally {
  Remove-Item Env:HTTPS_REGEN -ErrorAction SilentlyContinue
}

$CaCer = Join-Path $Root 'certs\kerwen-ca.cer'
$LeafCer = Join-Path $Root 'certs\kerwen.cer'
$Cer = if (Test-Path $CaCer) { $CaCer } else { $LeafCer }
if (-not (Test-Path $Cer)) { throw "certs\kerwen-ca.cer yok" }

# --- 3) Bu PC-de Root CA ynamly et (LocalMachine = hemishelik) ---
Write-Host "Root CA Trusted Root-a goyulyar (LocalMachine)..." -ForegroundColor Yellow
certutil -addstore -f -user Root $Cer | Out-Null
certutil -addstore -f Root $Cer | Out-Null
Write-Host "[OK] Root CA ynamly - Advanced gerek dal (IP uytgese-de CA same)" -ForegroundColor Green
Write-Host "     Operatorlar BIR GEZEK: tools\trust-ca-bir-gezek.bat (Admin)" -ForegroundColor DarkGray

# --- 3b) Firewall + Private + Task ---
Write-Host "LAN giris (Firewall + Private)..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot 'ensure-lan-access.ps1') -RegisterTask -Quiet
Write-Host "[OK] Operator LAN: Firewall acyk, Private, Task KerwenLanAccess" -ForegroundColor Green

# --- 4) Operator paketi: HTTPS 8443 + webcam (her PC-de bir gezek CA) ---
$outDir = Join-Path $Root 'certs\operator-pack'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Copy-Item -Force $Cer (Join-Path $outDir 'kerwen-https.cer')
Copy-Item -Force $Cer (Join-Path $outDir 'kerwen-ca.cer')

# 1-sertifikat-ynamly.bat eýýäm operator-pack-da bar bolsa sakla; ýok bolsa ýaz
$opBat = Join-Path $outDir '1-sertifikat-ynamly.bat'
if (-not (Test-Path $opBat)) {
  Copy-Item -Force (Join-Path $Root 'tools\trust-https-operator.bat') $opBat -ErrorAction SilentlyContinue
}

$httpsUrl = "https://${currentIp}:8443/admin/login.html"
$httpUrl = "http://${currentIp}:8000/admin/login.html"

$shortcut = @"
[InternetShortcut]
URL=$httpsUrl
"@
Set-Content -LiteralPath (Join-Path $outDir 'Kerwen-Giris.url') -Value $shortcut -Encoding ascii

$okaLines = @(
  '=== OPERATORLAR (webcam + 8443) ===',
  '',
  'Main PC eýýäm tayyar. Her OPERATOR PC-de BIR GEZEK:',
  '  1) 1-sertifikat-ynamly.bat  -> Run as administrator',
  '  2) Chrome/Edge-i doly yapyn',
  '  3) Softan hemişe şu salgy (sertifikat yene gerek dal):',
  '',
  "     $httpsUrl",
  '',
  'Webcam, anketa, ähli zat şu IP:8443 bilen ishleyar.',
  'Advanced / Proceed ulanmaň - diňe 1-sertifikat bat.',
  '',
  "Admin IP: $currentIp",
  "Zapas HTTP (kamera yok): $httpUrl",
  '',
  'Muhum: certs\kerwen-ca.cer Main-de POZMAN.'
)
Set-Content -LiteralPath (Join-Path $outDir 'OKA.txt') -Value $okaLines -Encoding ASCII
Set-Content -LiteralPath (Join-Path $outDir 'OPERATOR-GIRIS.txt') -Value $okaLines -Encoding ASCII

Write-Host ""
Write-Host "=== TAYYAR ===" -ForegroundColor Green
Write-Host "Main: npm run dev / Kerwen Panel"
Write-Host ""
Write-Host "OPERATORLAR (webcam) - hemişe:" -ForegroundColor Cyan
Write-Host "  $httpsUrl"
Write-Host ""
Write-Host "Her operator PC-de BIR GEZEK:" -ForegroundColor Yellow
Write-Host "  $outDir\1-sertifikat-ynamly.bat  (Run as administrator)"
Write-Host "Soň Advanced yok, webcam ishleyar."
Write-Host ""
if (-not $Force) { pause }
