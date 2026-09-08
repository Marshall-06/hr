# Kerwen - New Main PC full setup
# Node + PostgreSQL + npm + DB + EXE/autostart + firewall + HTTPS
# Run as Administrator.

param(
  [switch]$SkipDbRestore,
  [switch]$SkipHttps,
  [switch]$SkipStart
)

$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root
$env:KERWEN_MIGRATE_QUIET = '1'
$env:KERWEN_SETUP_QUIET = '1'

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Kerwen - Taze Main PC gurnasyk' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ("Proyekt: {0}" -f $Root)
Write-Host ''

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Host '[!] Administrator rugsat gerek - taze Admin bilen acylyar...' -ForegroundColor Yellow
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  if ($SkipDbRestore) { $arg += ' -SkipDbRestore' }
  if ($SkipHttps) { $arg += ' -SkipHttps' }
  if ($SkipStart) { $arg += ' -SkipStart' }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $arg
  exit 0
}

function Find-PgTool {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $found = Get-ChildItem -Path 'C:\Program Files\PostgreSQL' -Filter "$Name.exe" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq 'bin' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($found) { return $found.FullName }
  foreach ($ver in 18,17,16,15,14,13) {
    $p = "C:\Program Files\PostgreSQL\$ver\bin\$Name.exe"
    if (Test-Path -LiteralPath $p) { return $p }
  }
  return $null
}

function Get-DotEnv {
  param([string]$Key)
  $f = Join-Path $Root '.env'
  if (-not (Test-Path -LiteralPath $f)) { return $null }
  foreach ($line in Get-Content -LiteralPath $f -Encoding UTF8) {
    if ($line -match ('^\s*' + [regex]::Escape($Key) + '\s*=\s*(.*)$')) {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

function Set-DotEnv {
  param([string]$Key, [string]$Value)
  $f = Join-Path $Root '.env'
  if (-not (Test-Path -LiteralPath $f)) { return }
  $lines = Get-Content -LiteralPath $f -Encoding UTF8
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match ('^\s*' + [regex]::Escape($Key) + '\s*=')) {
      $found = $true
      ('{0}={1}' -f $Key, $Value)
    } else {
      $line
    }
  }
  if (-not $found) { $out += ('{0}={1}' -f $Key, $Value) }
  Set-Content -LiteralPath $f -Value $out -Encoding UTF8
}

function Merge-DotEnvFromPack {
  $packEnv = Join-Path $Root 'tools\_migrate-pack\.env'
  if (-not (Test-Path -LiteralPath $packEnv)) { return }
  $keys = @(
    'MAIL_ENABLED','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM','SMTP_SECURE',
    'COMPANY_NAME','COMPANY_DIRECTOR','COMPANY_DIRECTOR_SHORT','COMPANY_EMAIL','COMPANY_PHONE',
    'COMPANY_ADDRESS','COMPANY_BANK','HTTPS_ENABLED','HTTPS_PORT','KERWEN_LAN_NAME',
    'JWT_SECRET','JWT_EXPIRES_IN','PUBLIC_SITE_KEY'
  )
  foreach ($k in $keys) {
    $cur = Get-DotEnv -Key $k
    if ($cur) { continue }
    $fromPack = $null
    foreach ($line in Get-Content -LiteralPath $packEnv -Encoding UTF8) {
      if ($line -match ('^\s*' + [regex]::Escape($k) + '\s*=\s*(.*)$')) {
        $fromPack = $Matches[1].Trim()
        break
      }
    }
    if ($fromPack) {
      Set-DotEnv -Key $k -Value $fromPack
      Write-Host ("   [fix] {0} migrate-pack-dan" -f $k) -ForegroundColor Yellow
    }
  }
}

function Test-PgPort {
  param([int]$Port, [string]$User, [string]$Pass, [string]$HostName = '127.0.0.1')
  $psql = Find-PgTool -Name 'psql'
  if (-not $psql) { return $false }
  if ($Pass) { $env:PGPASSWORD = $Pass } else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  $r = & $psql -h $HostName -p $Port -U $User -d postgres -tAc 'SELECT 1' 2>$null
  return (($LASTEXITCODE -eq 0) -and (("$r").Trim() -eq '1'))
}

# --- 0) OneDrive ---
if ($Root -match 'OneDrive') {
  Write-Host '0) OneDrive: papkany Always keep on this device edin!' -ForegroundColor Yellow
  Write-Host '   Explorer -> kerwen_kadr -> sag bas -> Always keep on this device' -ForegroundColor Yellow
  Write-Host ''
}

# --- 1) Node.js ---
Write-Host '1) Node.js...' -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $nodeCmd -or -not $npmCmd) {
  Write-Host '   [!] Node.js yok. https://nodejs.org (LTS) gurnan, son bu bat-y taze isledin.' -ForegroundColor Red
  pause
  exit 1
}
$nodeVer = (& node -v 2>$null)
Write-Host ("   [ok] {0} ({1})" -f $nodeCmd.Source, $nodeVer) -ForegroundColor Green

# --- 2) PostgreSQL ---
Write-Host '2) PostgreSQL...' -ForegroundColor Yellow
$pgSvc = @(Get-Service -Name '*postgres*','*pgsql*' -ErrorAction SilentlyContinue)
if ($pgSvc.Count -eq 0) {
  Write-Host '   [!] PostgreSQL Service yok. https://www.postgresql.org gurnan.' -ForegroundColor Red
  Write-Host '   Port: 5433 (ýa-da 5432). Paroly ýatda saklaň — .env DB_PASSWORD bilen deň bolmaly.' -ForegroundColor Yellow
  Write-Host '   Gurnanson bu bat-y taze isledin.' -ForegroundColor Red
  pause
  exit 1
}
foreach ($s in $pgSvc) {
  try { Set-Service -Name $s.Name -StartupType Automatic -ErrorAction SilentlyContinue } catch {}
  if ($s.Status -ne 'Running') {
    try {
      Start-Service -Name $s.Name -ErrorAction Stop
      Write-Host ("   [ok] {0} started" -f $s.Name) -ForegroundColor Green
    } catch {
      Write-Host ("   [!] {0} start bolmady: {1}" -f $s.Name, $_.Exception.Message) -ForegroundColor Red
    }
  } else {
    Write-Host ("   [ok] {0} Running" -f $s.Name) -ForegroundColor Green
  }
}

# --- 3) .env ---
Write-Host '3) .env...' -ForegroundColor Yellow
$envFile = Join-Path $Root '.env'
$packEnv = Join-Path $Root 'tools\_migrate-pack\.env'
$exampleEnv = Join-Path $Root '.env.example'
if (-not (Test-Path -LiteralPath $envFile)) {
  if (Test-Path -LiteralPath $packEnv) {
    Copy-Item -LiteralPath $packEnv -Destination $envFile -Force
    Write-Host '   [ok] .env migrate-pack-dan gocurildi' -ForegroundColor Green
  } elseif (Test-Path -LiteralPath $exampleEnv) {
    Copy-Item -LiteralPath $exampleEnv -Destination $envFile -Force
    Write-Host '   [ok] .env.example -> .env (DB_PASSWORD barlan!)' -ForegroundColor Yellow
  } else {
    Write-Host '   [!] .env yok' -ForegroundColor Red
    pause
    exit 1
  }
} else {
  Write-Host '   [ok] .env bar' -ForegroundColor Green
  Merge-DotEnvFromPack
}
$smtpPass = Get-DotEnv -Key 'SMTP_PASS'
if ($smtpPass) { Set-DotEnv -Key 'MAIL_ENABLED' -Value '1' }
Set-DotEnv -Key 'HTTPS_ENABLED' -Value '1'

$dbUser = Get-DotEnv -Key 'DB_USER'
if (-not $dbUser) { $dbUser = 'postgres' }
$dbPass = Get-DotEnv -Key 'DB_PASSWORD'
if (-not $dbPass) { $dbPass = 'postgres' }
$dbPort = Get-DotEnv -Key 'DB_PORT'
# Täze PostgreSQL köplenç 5432 (köne pack 5433 ýalňyşlyk berýärdi)
if (-not $dbPort) { $dbPort = '5432' }
$dbName = Get-DotEnv -Key 'DB_NAME'
if (-not $dbName) { $dbName = 'kerwen_kadr' }
$dbHost = Get-DotEnv -Key 'DB_HOST'
if (-not $dbHost) { $dbHost = '127.0.0.1' }
if ($dbHost -eq 'localhost') { $dbHost = '127.0.0.1' }

$psqlPath = Find-PgTool -Name 'psql'
if ($psqlPath) {
  Write-Host ("   psql: {0}" -f $psqlPath) -ForegroundColor DarkGray
} else {
  Write-Host '   [!] psql PATH-da ýok — PostgreSQL bin papkasyny gözleýärin...' -ForegroundColor Yellow
}
$okPort = $null
# Işleýän porty tap — ýalňyş .env porty saklama
foreach ($p in @([int]$dbPort, 5432, 5433, 5434, 5435) | Select-Object -Unique) {
  if (Test-PgPort -Port $p -User $dbUser -Pass $dbPass -HostName $dbHost) {
    $okPort = $p
    break
  }
}
if ($null -eq $okPort) {
  Write-Host ("   [!] PostgreSQL baglanmady: {0}@{1}:{2}" -f $dbUser, $dbHost, $dbPort) -ForegroundColor Red
  Write-Host '   .env: DB_PASSWORD = PostgreSQL gurnama paroly (port awto 5432/5433)' -ForegroundColor Yellow
  $fix = Read-Host 'Paroly täze ýazyň (Enter = dowam)'
  if ($fix) {
    Set-DotEnv -Key 'DB_PASSWORD' -Value $fix
    $dbPass = $fix
    foreach ($p in @(5432, 5433, 5434, 5435, [int]$dbPort) | Select-Object -Unique) {
      if (Test-PgPort -Port $p -User $dbUser -Pass $dbPass -HostName $dbHost) {
        $okPort = $p
        break
      }
    }
  }
}
if ($null -eq $okPort) {
  Write-Host '   [!] Işleýän DB port ýok — restore soň ýalňyş berer. PostgreSQL we paroly barlaň.' -ForegroundColor Red
  $okPort = 5432
}
Set-DotEnv -Key 'DB_HOST' -Value '127.0.0.1'
Set-DotEnv -Key 'DB_PORT' -Value ("$okPort")
$dbPort = ("$okPort")
Write-Host ("   [ok] DB {0} @ 127.0.0.1:{1}" -f $dbName, $dbPort) -ForegroundColor Green

# --- 4) migrate-pack ---
Write-Host '4) migrate-pack (uploads / certs / suratlar)...' -ForegroundColor Yellow
$pack = Join-Path $Root 'tools\_migrate-pack'
if (Test-Path -LiteralPath $pack) {
  $pairs = @(
    @('public\uploads', 'public\uploads'),
    @('certs', 'certs'),
    @('data', 'data'),
    @('suratlar', 'suratlar'),
    @('templates', 'templates'),
    @('db', 'db')
  )
  foreach ($pair in $pairs) {
    $src = Join-Path $pack $pair[0]
    $dst = Join-Path $Root $pair[1]
    if (-not (Test-Path -LiteralPath $src)) { continue }
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host ("   [ok] {0}" -f $pair[0]) -ForegroundColor Green
  }
} else {
  Write-Host '   [skip] tools\_migrate-pack yok (kone PC-de migrate-to-new-main-pc.bat isledin)' -ForegroundColor DarkGray
}

# Skan papka — täze PC ýoly
$suratlar = Join-Path $Root 'suratlar'
New-Item -ItemType Directory -Force -Path $suratlar | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'data') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'public\uploads') | Out-Null
$scanCfg = Join-Path $Root 'data\scan-folder.json'
$scanObj = @{ folderPath = 'suratlar'; updatedAt = (Get-Date).ToUniversalTime().ToString('o') }
$scanObj | ConvertTo-Json | Set-Content -LiteralPath $scanCfg -Encoding UTF8
Write-Host '   [ok] scan-folder -> suratlar (taze PC yoly)' -ForegroundColor Green

# 3x4: köne PC ýoly pozylýar → şu Desktop; pack-daky suratlar göçürilýär
$desk = [Environment]::GetFolderPath('Desktop')
if (-not $desk) { $desk = Join-Path $env:USERPROFILE 'Desktop' }
$kiciDest = Join-Path $desk 'anketa_kici_suratlar'
New-Item -ItemType Directory -Force -Path $kiciDest | Out-Null
$kiciSources = @(
  (Join-Path $pack 'anketa_kici_suratlar'),
  (Join-Path $Root 'data\anketa_kici_suratlar')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
foreach ($ks in $kiciSources) {
  try {
    Copy-Item -Path (Join-Path $ks '*') -Destination $kiciDest -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host ("   [ok] 3x4 suratlar -> {0}" -f $kiciDest) -ForegroundColor Green
  } catch {}
}
$kiciCfg = Join-Path $Root 'data\kici-suratlar-folder.json'
@{ folderPath = $kiciDest; updatedAt = (Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath $kiciCfg -Encoding UTF8
Write-Host '   [ok] kici-suratlar-folder -> Desktop (kone Users\edovr ýoly pozuldy)' -ForegroundColor Green

# --- 5) npm install ---
Write-Host '5) npm install...' -ForegroundColor Yellow
if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules\express'))) {
  npm install --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) {
    Write-Host '   [!] npm install sowsz' -ForegroundColor Red
    pause
    exit 1
  }
} else {
  Write-Host '   [ok] node_modules bar' -ForegroundColor Green
}

# --- 6) DB restore ---
Write-Host '6) Baza...' -ForegroundColor Yellow
if (-not $SkipDbRestore) {
  $dumpCandidates = @(
    (Join-Path $Root 'db\kerwen_dump.sql'),
    (Join-Path $Root 'tools\_migrate-pack\db\kerwen_dump.sql')
  )
  $dump = $dumpCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($dump) {
    Write-Host ("   Dump: {0}" -f $dump) -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'restore-on-new-main-pc.ps1') -DumpPath $dump
  } else {
    Write-Host '   Dump yok - dine db:sync (bos baza)' -ForegroundColor Yellow
    npm run db:sync
    npm run db:fee-payments
    npm run db:seed 2>$null
  }
} else {
  Write-Host '   Restore gecirildi (-SkipDbRestore)' -ForegroundColor DarkGray
  npm run db:sync
  npm run db:fee-payments
}

# --- 7) Desktop EXE + autostart + firewall ---
Write-Host '7) Panel EXE + awtostart + firewall...' -ForegroundColor Yellow
try {
  & (Join-Path $PSScriptRoot 'install-kerwen.ps1')
} catch {
  Write-Host ("   [!] Panel EXE: {0}" -f $_.Exception.Message) -ForegroundColor Red
  Write-Host '   Dowam: serwer npm start bilen işlär. Soň: tools\install-kerwen.ps1 täzeden.' -ForegroundColor Yellow
}
try {
  & (Join-Path $PSScriptRoot 'fix-autostart.ps1')
} catch {
  Write-Host ("   awtostart: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

# --- 8) HTTPS / LAN ---
if (-not $SkipHttps) {
  Write-Host '8) HTTPS + LAN firewall...' -ForegroundColor Yellow
  try {
    & (Join-Path $PSScriptRoot 'ensure-lan-access.ps1') -RegisterTask -Quiet
  } catch {
    Write-Host ("   LAN: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
  }
  try {
    $pfx = Join-Path $Root 'certs\kerwen.pfx'
    if (-not (Test-Path -LiteralPath $pfx)) {
      & (Join-Path $PSScriptRoot 'setup-secure-lan.ps1') -Force
    } else {
      Write-Host '   [ok] certs bar - zerur bolsa tools\hemishelik-we-ynamly.bat' -ForegroundColor Green
    }
  } catch {
    Write-Host ("   HTTPS: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
    Write-Host '   Son: tools\hemishelik-we-ynamly.bat (Admin)' -ForegroundColor Yellow
  }
} else {
  Write-Host '8) HTTPS gecirildi' -ForegroundColor DarkGray
}

# --- 9) Stats + funksiya barlagy ---
Write-Host '9) Maglumat + funksiya barlagy...' -ForegroundColor Yellow
try {
  node (Join-Path $Root 'tools\check-placed-stats.js')
} catch {
  Write-Host ("   {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}
try {
  node (Join-Path $Root 'tools\verify-new-main-pc.js')
} catch {
  Write-Host ("   verify: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

# --- 10) Start server ---
if (-not $SkipStart) {
  Write-Host '10) Serwer basladylýar...' -ForegroundColor Yellow
  $brand = Get-DotEnv -Key 'BRAND_SHORT'
  if (-not $brand) { $brand = 'Kerwen' }
  $safe = ($brand -replace '[^A-Za-z0-9]', '')
  if (-not $safe) { $safe = 'Agency' }
  $exe = Join-Path $env:LOCALAPPDATA ("{0}Kadr\{0}.exe" -f $safe)
  if (Test-Path -LiteralPath $exe) {
    Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
    Start-Sleep -Seconds 8
  } else {
    Start-Process -FilePath 'node' -ArgumentList '--max-old-space-size=4096','src/server.js' -WorkingDirectory $Root -WindowStyle Minimized
    Start-Sleep -Seconds 5
  }
  $listen = netstat -ano 2>$null | Select-String ':8000\s+.*LISTENING'
  if ($listen) {
    Write-Host '   [ok] http://localhost:8000/admin/login.html' -ForegroundColor Green
    Start-Process 'http://localhost:8000/admin/login.html'
  } else {
    Write-Host '   [!] Port 8000 heniz yok - 30 s garasyp Desktopdaky Panel-e basyn' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  GURNALDY - taze Main PC tayyar' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host '1) Desktop: Kerwen Panel'
Write-Host '2) Windows yakylanda serwer awtomatik'
Write-Host '3) Operatorlar: tools\hemishelik-we-ynamly.bat'
Write-Host '4) Funksiya barlagy: node tools\verify-new-main-pc.js'
Write-Host '5) Islemese: tools\fix-autostart.bat (Admin)'
Write-Host ''
if ($Root -match 'OneDrive') {
  Write-Host 'MOHUM: OneDrive -> Always keep on this device' -ForegroundColor Yellow
}
Write-Host ''
pause
