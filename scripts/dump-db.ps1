# Kerwen Kadr — PostgreSQL dump (ähli anketalar + birnäçe wezipe bilen)
# Ulanyş (şu PC-de):  powershell -File scripts/dump-db.ps1
# Çykyş: backups\kerwen_kadr_YYYYMMDD_HHMM.sql

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# .env oka
$envFile = Join-Path $root '.env'
$hostName = 'localhost'
$port = '5433'
$name = 'kerwen_kadr'
$user = 'postgres'
$pass = 'postgres'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_.Split('=', 2)
    $k = $k.Trim(); $v = $v.Trim().Trim('"').Trim("'")
    switch ($k) {
      'DB_HOST' { $hostName = $v }
      'DB_PORT' { $port = $v }
      'DB_NAME' { $name = $v }
      'DB_USER' { $user = $v }
      'DB_PASSWORD' { $pass = $v }
    }
  }
}

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

if (-not $pgDump) {
  Write-Host 'pg_dump tapylmady. PostgreSQL Client Tools gurnalyň ýa-da PATH goşuň.'
  exit 1
}

$outDir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$outFile = Join-Path $outDir "kerwen_kadr_$stamp.sql"

$env:PGPASSWORD = $pass
& $pgDump -h $hostName -p $port -U $user -d $name -F p --no-owner --no-acl -f $outFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host "Dump taýýar: $outFile"
Write-Host 'Beýleki PC: bu faýly göçüriň, soň: powershell -File scripts/restore-db.ps1 -DumpFile "backups\kerwen_kadr_....sql"'
