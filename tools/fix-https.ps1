# Kerwen HTTPS + kamera (bir gezek admin PC-de)
# Root CA hemiselik; IP uytgende dine server sertifikat tazelenyar.
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

Write-Host "=== Kerwen HTTPS duzedis ===" -ForegroundColor Cyan
Write-Host "Proyekt: $Root"

foreach ($port in 8000, 8443) {
  $name = "Kerwen Kadr $port"
  $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
  if (-not $existing) {
    try {
      New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port | Out-Null
      Write-Host "Firewall acyldy: TCP $port" -ForegroundColor Green
    } catch {
      Write-Host ("Firewall ${port}: " + $_.Exception.Message) -ForegroundColor Yellow
      Write-Host "  Admin bilen ishledin: tools\open-firewall.bat" -ForegroundColor Yellow
    }
  } else {
    Enable-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
    Write-Host "Firewall eyyam bar: TCP $port"
  }
}

$env:HTTPS_REGEN = '1'
$env:HTTPS_ENABLED = '1'
try {
  node -e "require('./src/utils/httpsCert').loadHttpsOptions(); console.log('Sertifikat tayyar (Root CA + server)')"
} finally {
  Remove-Item Env:HTTPS_REGEN -ErrorAction SilentlyContinue
}

$CaCer = Join-Path $Root 'certs\kerwen-ca.cer'
$LeafCer = Join-Path $Root 'certs\kerwen.cer'
$Cer = if (Test-Path $CaCer) { $CaCer } else { $LeafCer }
if (-not (Test-Path $Cer)) { throw "certs/kerwen-ca.cer yok - node / PowerShell yalnyslygyny barlan" }

try {
  $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($Cer)
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
  $store.Open('ReadWrite')
  $store.Add($cert)
  $store.Close()
  Write-Host "Root CA Trusted Root-a goyuldy (shu ulanyjy)" -ForegroundColor Green
} catch {
  Write-Host "Trusted Root: $($_.Exception.Message)" -ForegroundColor Yellow
}

$ips = @()
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { $ips += $_.IPAddress }
if (-not $ips.Count) { $ips = @('192.168.1.19') }

Write-Host ""
Write-Host "=== OPERATORLAR UCIN (Advanced bolmaz / Add to Home Screen) ===" -ForegroundColor Green
Write-Host "1) Serweri tazeden basladyn: npm.cmd run dev"
Write-Host "2) Her operator PC-de BIR GEZEK (CA - IP uytgese-de yene gerek dal):"
Write-Host "   - tools\trust-https-operator.bat  (Run as administrator hasy)"
Write-Host "   - yada: http://ADMIN_IP:8000/admin/trust-https.html"
Write-Host "3) Brauzeri doly yapyp yene acyn"
Write-Host "4) Goni (Advanced bolmaz):"
Write-Host "   https://KerwenKadr:8443/admin/login.html"
foreach ($ip in ($ips | Select-Object -Unique)) {
  Write-Host "   https://${ip}:8443/admin/login.html"
}
Write-Host "5) Add to Home Screen - dine ynamly HTTPS-den"
Write-Host ""
Write-Host "Root CA: $Cer"
Write-Host "Trust skript: $(Join-Path $Root 'tools\trust-https-operator.bat')"
Write-Host "Maslahat: PC ady KerwenKadr + durnukly IP (DHCP reservation)"
