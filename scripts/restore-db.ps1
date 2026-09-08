# Kerwen Kadr — PostgreSQL restore (başga PC-de)
# Ulanyş: powershell -File scripts/restore-db.ps1 -DumpFile "backups\kerwen_kadr_YYYYMMDD_HHMM.sql"
# ÜNS: bar bolan baza üsti ýazylýar (ähli maglumat dump-dan gelýär).

param(
  [Parameter(Mandatory = $true)]
  [string]$DumpFile
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path $DumpFile)) {
  $alt = Join-Path $root $DumpFile
  if (Test-Path $alt) { $DumpFile = $alt }
  else { Write-Host "Faýl ýok: $DumpFile"; exit 1 }
}

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

function Find-Pg($exe) {
  $cmd = Get-Command $exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($ver in 18, 17, 16, 15, 14, 13) {
    $p = "C:\Program Files\PostgreSQL\$ver\bin\$exe.exe"
    if (Test-Path $p) { return $p }
  }
  return $null
}

$psql = Find-Pg 'psql'
if (-not $psql) {
  Write-Host 'psql tapylmady. PostgreSQL Client Tools gurnalyň.'
  exit 1
}

Write-Host "ÜNS: $name bazasy dump bilen çalşylýar."
$ok = Read-Host 'Dowam (y/n)'
if ($ok -ne 'y' -and $ok -ne 'Y') { Write-Host 'Bes edildi.'; exit 0 }

$env:PGPASSWORD = $pass

# Baza ýok bolsa döret
$exists = & $psql -h $hostName -p $port -U $user -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$name'"
if (-not $exists) {
  & $psql -h $hostName -p $port -U $user -d postgres -c "CREATE DATABASE $name"
}

# Baglanyşyklary kesip, täzeden ýükle
& $psql -h $hostName -p $port -U $user -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$name' AND pid <> pg_backend_pid();" | Out-Null
& $psql -h $hostName -p $port -U $user -d postgres -c "DROP DATABASE IF EXISTS $name;"
& $psql -h $hostName -p $port -U $user -d postgres -c "CREATE DATABASE $name;"
& $psql -h $hostName -p $port -U $user -d $name -f $DumpFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Restore tamam. Serweri täzeden işlediň: npm run start'
Write-Host 'Soň Ctrl+Shift+R bilen sahypany täzeläň.'
