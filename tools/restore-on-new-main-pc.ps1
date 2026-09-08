# Kerwen — TÄZE Main PC-de bazany restore etmek we barlamak
# Proýekt kökünden Administrator bilen işlediň.

param(
  [string]$DumpPath = '',
  [switch]$SkipRestore
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

$envFile = Join-Path $Root '.env'
if (-not (Test-Path $envFile)) {
  Write-Host '[!] .env tapylmady. migrate-pack-dan göçüriň.' -ForegroundColor Red
  exit 1
}

$dbName = 'kerwen_kadr'
$dbUser = 'postgres'
$dbHost = '127.0.0.1'
$dbPort = '5432'
$dbPass = ''
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*DB_NAME\s*=\s*(.+)$') { $dbName = $Matches[1].Trim().Trim('"').Trim("'") }
  if ($_ -match '^\s*DB_USER\s*=\s*(.+)$') { $dbUser = $Matches[1].Trim().Trim('"').Trim("'") }
  if ($_ -match '^\s*DB_HOST\s*=\s*(.+)$') { $dbHost = $Matches[1].Trim().Trim('"').Trim("'") }
  if ($_ -match '^\s*DB_PORT\s*=\s*(.+)$') { $dbPort = $Matches[1].Trim().Trim('"').Trim("'") }
  if ($_ -match '^\s*DB_PASSWORD\s*=\s*(.+)$') { $dbPass = $Matches[1].Trim().Trim('"').Trim("'") }
}

if (-not $DumpPath) {
  $candidates = @(
    (Join-Path $Root 'db\kerwen_dump.sql'),
    (Join-Path $Root 'tools\_migrate-pack\db\kerwen_dump.sql')
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $DumpPath = $c; break }
  }
}

Write-Host '=== Kerwen — Täze Main PC baza restore ===' -ForegroundColor Cyan
Write-Host "DB: $dbName @ ${dbHost}:${dbPort}"
Write-Host ''

function Find-PgTool($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $found = Get-ChildItem -Path 'C:\Program Files\PostgreSQL' -Filter "$name.exe" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq 'bin' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($found) { return $found.FullName }
  foreach ($ver in 18,17,16,15,14,13) {
    $p = "C:\Program Files\PostgreSQL\$ver\bin\$name.exe"
    if (Test-Path $p) { return $p }
  }
  return $null
}

$psql = Find-PgTool 'psql'
$createdb = Find-PgTool 'createdb'

if (-not $psql) {
  Write-Host '[!] psql tapylmady. PostgreSQL gurnaň.' -ForegroundColor Red
  exit 1
}

if ($dbPass) { $env:PGPASSWORD = $dbPass }

function Test-PgPort([string]$port) {
  & $psql -h $dbHost -p $port -U $dbUser -d postgres -c 'SELECT 1' 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

if (-not (Test-PgPort $dbPort)) {
  Write-Host "Port $dbPort jogap bermeýär — 5432/5433 synalýar..." -ForegroundColor Yellow
  $found = $null
  foreach ($try in @('5432', '5433', '5434', '5435')) {
    if (Test-PgPort $try) { $found = $try; break }
  }
  if ($found) {
    Write-Host "PostgreSQL port: $found" -ForegroundColor Green
    $dbPort = $found
    if (Test-Path $envFile) {
      $envTxt = Get-Content $envFile -Raw -Encoding UTF8
      if ($envTxt -match '(?m)^\s*DB_PORT\s*=') {
        $envTxt = $envTxt -replace '(?m)^\s*DB_PORT\s*=.*$', "DB_PORT=$found"
      } else {
        $envTxt = $envTxt.TrimEnd() + "`r`nDB_PORT=$found`r`n"
      }
      Set-Content -LiteralPath $envFile -Value $envTxt -Encoding UTF8
    }
  } else {
    Write-Host '[!] PostgreSQL port tapylmady. Serwis işläp durmu?' -ForegroundColor Red
    exit 1
  }
}

if (-not $SkipRestore) {
  if (-not $DumpPath -or -not (Test-Path $DumpPath)) {
    Write-Host '[!] kerwen_dump.sql tapylmady.' -ForegroundColor Red
    Write-Host '    Köne Main PC-de tools\migrate-to-new-main-pc.bat işlediň.' -ForegroundColor Yellow
    exit 1
  }
  $sizeMb = [math]::Round((Get-Item $DumpPath).Length / 1MB, 2)
  Write-Host "Dump: $DumpPath ($sizeMb MB)" -ForegroundColor Yellow
  if ($sizeMb -lt 0.05) {
    Write-Host '[!] Dump juda kiçi — köne PC-de pg_dump täzeden ediň.' -ForegroundColor Red
    exit 1
  }

  Write-Host '1) Baza bar bolsa, täzeden döredilýär...' -ForegroundColor Yellow
  & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "DROP DATABASE IF EXISTS `"$dbName`";" 2>$null
  if ($createdb) {
    & $createdb -h $dbHost -p $dbPort -U $dbUser $dbName
  } else {
    & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "CREATE DATABASE `"$dbName`";"
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[!] Baza döredilmedi.' -ForegroundColor Red
    exit 1
  }

  Write-Host '2) Dump restore...' -ForegroundColor Yellow
  & $psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $DumpPath
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[!] Restore ýalňyşlygy.' -ForegroundColor Red
    exit 1
  }
  Write-Host '   [ok] Restore tamam' -ForegroundColor Green
} else {
  Write-Host 'Restore geçirildi (-SkipRestore)' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '3) npm install (zerur bolsa)...' -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  npm install
}

Write-Host '4) Wezipe tertibi (1→2→3) düzetme...' -ForegroundColor Yellow
npm run db:fix-positions

Write-Host '4b) Täze sütünler / töleg tablisasy...' -ForegroundColor Yellow
npm run db:sync
npm run db:fee-payments

Write-Host '5) Maglumat barlagy (server işlemese hem)...' -ForegroundColor Yellow
node (Join-Path $Root 'tools\check-placed-stats.js')
node (Join-Path $Root 'tools\verify-new-main-pc.js')

Write-Host ''
Write-Host 'Indi: npm run dev  ýa-da  Kerwen Panel' -ForegroundColor Green
Write-Host 'Panelde «Biziň ýerleşdirenlerimiz» sanawy köne Main bilen deň bolmaly.' -ForegroundColor Green
Write-Host ''
if (-not $env:KERWEN_MIGRATE_QUIET) { pause }
