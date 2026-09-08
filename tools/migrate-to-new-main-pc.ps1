# Kerwen - migrate pack for NEW Main PC
# Output: tools\_migrate-pack\  (or -OutDir)

param(
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

if (-not $OutDir) {
  $OutDir = Join-Path $Root 'tools\_migrate-pack'
}

Write-Host '=== Kerwen migrate pack ===' -ForegroundColor Cyan
Write-Host ("Proyekt: {0}" -f $Root)
Write-Host ("Cyky:    {0}" -f $OutDir)
Write-Host ''

if (Test-Path $OutDir) {
  Write-Host 'Kone pack pozulyar...' -ForegroundColor Yellow
  Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OutDir 'db') | Out-Null

function Copy-IfExists($src, $dst) {
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Host ("  [skip] {0}" -f $src) -ForegroundColor DarkGray
    return
  }
  if (Test-Path -LiteralPath $dst) {
    Remove-Item -LiteralPath $dst -Recurse -Force -ErrorAction SilentlyContinue
  }
  $parent = Split-Path $dst -Parent
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  if (Test-Path -LiteralPath $src -PathType Container) {
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
  } else {
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
  Write-Host ("  [ok] {0}" -f $src) -ForegroundColor Green
}

Write-Host '1) Programma suratlary (uploads)...' -ForegroundColor Yellow
Copy-IfExists (Join-Path $Root 'public\uploads') (Join-Path $OutDir 'public\uploads')

Write-Host '2) HTTPS certs...' -ForegroundColor Yellow
Copy-IfExists (Join-Path $Root 'certs\kerwen-ca.cer') (Join-Path $OutDir 'certs\kerwen-ca.cer')
Copy-IfExists (Join-Path $Root 'certs\kerwen-ca.pfx') (Join-Path $OutDir 'certs\kerwen-ca.pfx')
Copy-IfExists (Join-Path $Root 'certs\kerwen-https.cer') (Join-Path $OutDir 'certs\kerwen-https.cer')
Copy-IfExists (Join-Path $Root 'certs\kerwen.pfx') (Join-Path $OutDir 'certs\kerwen.pfx')
Copy-IfExists (Join-Path $Root 'certs\kerwen.cer') (Join-Path $OutDir 'certs\kerwen.cer')
Copy-IfExists (Join-Path $Root 'certs\kerwen-ips.json') (Join-Path $OutDir 'certs\kerwen-ips.json')
Copy-IfExists (Join-Path $Root 'certs\operator-pack') (Join-Path $OutDir 'certs\operator-pack')

Write-Host '3) data / suratlar / templates...' -ForegroundColor Yellow
Copy-IfExists (Join-Path $Root 'data') (Join-Path $OutDir 'data')
Copy-IfExists (Join-Path $Root 'suratlar') (Join-Path $OutDir 'suratlar')
Copy-IfExists (Join-Path $Root 'templates') (Join-Path $OutDir 'templates')

$dataDir = Join-Path $OutDir 'data'
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }
$stamp = (Get-Date).ToUniversalTime().ToString('o')
@{ folderPath = ''; updatedAt = $stamp } | ConvertTo-Json |
  Set-Content -LiteralPath (Join-Path $dataDir 'kici-suratlar-folder.json') -Encoding UTF8
@{ folderPath = 'suratlar'; updatedAt = $stamp } | ConvertTo-Json |
  Set-Content -LiteralPath (Join-Path $dataDir 'scan-folder.json') -Encoding UTF8
Write-Host '  [ok] data json paths cleared for new PC' -ForegroundColor Green

Write-Host '3b) Desktop anketa_kici_suratlar...' -ForegroundColor Yellow
$desk = [Environment]::GetFolderPath('Desktop')
$kiciSrcCandidates = New-Object System.Collections.Generic.List[string]
foreach ($c in @(
  (Join-Path $desk 'anketa_kici_suratlar'),
  (Join-Path $env:USERPROFILE 'OneDrive\Desktop\anketa_kici_suratlar'),
  (Join-Path $env:USERPROFILE 'Desktop\anketa_kici_suratlar'),
  (Join-Path $Root 'data\anketa_kici_suratlar')
)) {
  if ($c -and (Test-Path -LiteralPath $c)) { $kiciSrcCandidates.Add($c) }
}
$od = Join-Path $env:USERPROFILE 'OneDrive'
if (Test-Path -LiteralPath $od) {
  Get-ChildItem -LiteralPath $od -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $try = Join-Path $_.FullName 'anketa_kici_suratlar'
    if (Test-Path -LiteralPath $try) { $kiciSrcCandidates.Add($try) }
  }
}
$kiciOut = Join-Path $OutDir 'anketa_kici_suratlar'
if ($kiciSrcCandidates.Count -gt 0) {
  Copy-IfExists $kiciSrcCandidates[0] $kiciOut
} else {
  New-Item -ItemType Directory -Force -Path $kiciOut | Out-Null
  Write-Host '  [skip] Desktop anketa_kici_suratlar yok' -ForegroundColor DarkGray
}

Write-Host '4) .env...' -ForegroundColor Yellow
Copy-IfExists (Join-Path $Root '.env') (Join-Path $OutDir '.env')

Write-Host '5) PostgreSQL dump...' -ForegroundColor Yellow
$envFile = Join-Path $Root '.env'
$dbName = 'kerwen_kadr'
$dbUser = 'postgres'
$dbHost = '127.0.0.1'
$dbPort = '5432'
$dbPass = ''
if (Test-Path $envFile) {
  Get-Content $envFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*DB_NAME\s*=\s*(.+)$') { $dbName = $Matches[1].Trim().Trim('"').Trim("'") }
    if ($_ -match '^\s*DB_USER\s*=\s*(.+)$') { $dbUser = $Matches[1].Trim().Trim('"').Trim("'") }
    if ($_ -match '^\s*DB_HOST\s*=\s*(.+)$') { $dbHost = $Matches[1].Trim().Trim('"').Trim("'") }
    if ($_ -match '^\s*DB_PORT\s*=\s*(.+)$') { $dbPort = $Matches[1].Trim().Trim('"').Trim("'") }
    if ($_ -match '^\s*DB_PASSWORD\s*=\s*(.+)$') { $dbPass = $Matches[1].Trim().Trim('"').Trim("'") }
  }
}
if ($dbPass) { $env:PGPASSWORD = $dbPass }
$dumpPath = Join-Path $OutDir 'db\kerwen_dump.sql'
$pgDump = $null
foreach ($c in @(
  'pg_dump',
  'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe',
  'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe',
  'C:\Program Files\PostgreSQL\16\bin\pg_dump.exe',
  'C:\Program Files\PostgreSQL\15\bin\pg_dump.exe',
  'C:\Program Files\PostgreSQL\14\bin\pg_dump.exe',
  'C:\Program Files\PostgreSQL\13\bin\pg_dump.exe'
)) {
  if ($c -eq 'pg_dump') {
    $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmd) { $pgDump = $cmd.Source; break }
  } elseif (Test-Path $c) { $pgDump = $c; break }
}
if ($pgDump) {
  Write-Host ("  pg_dump: {0} ({1} at {2}:{3})" -f $pgDump, $dbName, $dbHost, $dbPort)
  & $pgDump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F p -f $dumpPath
  if ($LASTEXITCODE -eq 0 -and (Test-Path $dumpPath)) {
    $dumpMb = [math]::Round((Get-Item $dumpPath).Length / 1MB, 2)
    Write-Host ("  [ok] {0} ({1} MB)" -f $dumpPath, $dumpMb) -ForegroundColor Green
    if ($dumpMb -lt 0.05) {
      Write-Host '  [!] Dump juda kici - barlan!' -ForegroundColor Red
    }
  } else {
    Write-Host ("  [!] Dump failed. Manual: pg_dump -U {0} -d {1} -f db/kerwen_dump.sql" -f $dbUser, $dbName) -ForegroundColor Yellow
  }
} else {
  Write-Host '  [!] pg_dump not found. Put dump into db folder manually.' -ForegroundColor Yellow
}

$okaPath = Join-Path $OutDir 'OKA-TAZE-MAIN.txt'
@(
  'TAZE MAIN PC - full clone pack'
  ''
  'KONE PC: tools MAKE-TAZE-MAIN-USB.bat'
  'USB folder: tools _taze-main-usb'
  ''
  'TAZE PC:'
  '  1. Node.js LTS + PostgreSQL'
  '  2. APPLY-TAZE-MAIN.bat'
  '  3. Desktop Kerwen Panel'
  ''
  'NOTE: code-update alone is NOT enough for new PC'
  'Always use _taze-main-usb pack'
) | Set-Content -LiteralPath $okaPath -Encoding UTF8

Write-Host ''
Write-Host '=== TAYYAR ===' -ForegroundColor Green
Write-Host $OutDir
Write-Host 'Taze PC: APPLY-TAZE-MAIN.bat or Install.bat option 1'
Write-Host ''
if (-not $env:KERWEN_MIGRATE_QUIET) { pause }
