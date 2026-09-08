# Restart son serwer ishlemese - bir gezek Administrator bilen.
# Install-kerwen + Postgres Automatic + Task Scheduler.

$ErrorActionPreference = 'Continue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Write-Host '=== Kerwen awtostart duzedis ===' -ForegroundColor Cyan
Write-Host ("Proyekt: {0}" -f $ProjectRoot)
Write-Host ''

& (Join-Path $PSScriptRoot 'install-kerwen.ps1')
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
  Write-Host ("Install sowsz (kod {0})" -f $LASTEXITCODE) -ForegroundColor Red
}

Write-Host ''
Write-Host '=== PostgreSQL ===' -ForegroundColor Cyan
$pg = @(Get-Service -Name '*postgres*','*pgsql*' -ErrorAction SilentlyContinue)
if ($pg.Count -eq 0) {
  Write-Host 'PostgreSQL Service YOK - https://www.postgresql.org gurnalyn!' -ForegroundColor Red
} else {
  foreach ($s in $pg) {
    try {
      Set-Service -Name $s.Name -StartupType Automatic -ErrorAction Stop
      Write-Host ("  {0}: Automatic" -f $s.Name) -ForegroundColor Green
    } catch {
      Write-Host ("  {0}: Automatic edilmedi - {1}" -f $s.Name, $_.Exception.Message) -ForegroundColor Yellow
    }
    $fresh = Get-Service -Name $s.Name
    if ($fresh.Status -ne 'Running') {
      try {
        Start-Service -Name $s.Name -ErrorAction Stop
        Write-Host ("  {0}: started" -f $s.Name) -ForegroundColor Green
      } catch {
        Write-Host ("  {0}: start sowsz - {1}" -f $s.Name, $_.Exception.Message) -ForegroundColor Red
      }
    } else {
      Write-Host ("  {0}: Running" -f $s.Name) -ForegroundColor Green
    }
  }
}

if ($ProjectRoot -match 'OneDrive') {
  Write-Host ''
  Write-Host 'UNS: proyekt OneDrive-da!' -ForegroundColor Yellow
  Write-Host '  Explorer-de kerwen_kadr papkasyna sag basyn ->'
  Write-Host '  Always keep on this device / Always available offline'
  Write-Host '  Bolmasa Windows yakylanda fayllar heniz yok bolup, serwer baslamaz.'
}

Write-Host ''
Write-Host '=== Hazirki serwer synagy ===' -ForegroundColor Cyan
$brand = 'Kerwen'
$envFile = Join-Path $ProjectRoot '.env'
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
    if ($line -match '^\s*BRAND_SHORT\s*=\s*(.+)$') {
      $v = $Matches[1].Trim().Trim('"').Trim("'")
      if ($v) { $brand = $v }
    }
  }
}
$safe = ($brand -replace '[^A-Za-z0-9]', '')
if (-not $safe) { $safe = 'Agency' }
$exe = Join-Path $env:LOCALAPPDATA ("{0}Kadr\{0}.exe" -f $safe)
if (Test-Path -LiteralPath $exe) {
  Write-Host ("Basladylyar: {0} --autostart" -f $exe)
  Start-Process -FilePath $exe -ArgumentList '--autostart' -WorkingDirectory (Split-Path $exe)
  Start-Sleep -Seconds 10
  $listen = netstat -ano | Select-String ':8000\s+.*LISTENING'
  if ($listen) {
    Write-Host 'OK - port 8000 dinleyar. http://localhost:8000/admin/login.html' -ForegroundColor Green
  } else {
    Write-Host 'Port 8000 heniz yok - 30-60 s garasyn yada launcher.log okany:' -ForegroundColor Yellow
    Write-Host ('  ' + (Join-Path $env:LOCALAPPDATA ("{0}Kadr\launcher.log" -f $safe)))
  }
} else {
  Write-Host ("EXE tapylmady: {0}" -f $exe) -ForegroundColor Red
}

Write-Host ''
Write-Host 'Indi kompyuteri restart edin — serwer adatça 10–40 s içinde başlar.' -ForegroundColor Cyan
Write-Host 'Islemese Desktopdaky Panel-e basyn; yene sowsz bolsa launcher.log iberin.'
