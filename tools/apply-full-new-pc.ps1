# Täze Main PC: doly gurna (kod + migrate + DB + Panel)
# APPLY-TAZE-MAIN.bat çagyrýar. Admin peýdaly.
param(
  [string]$PackDir = '',
  [string]$Dest = ''
)

$ErrorActionPreference = 'Continue'
$env:KERWEN_MIGRATE_QUIET = '1'
$env:KERWEN_SETUP_QUIET = '1'

if (-not $PackDir) { $PackDir = $PSScriptRoot }
$PackDir = (Resolve-Path -LiteralPath $PackDir).Path
$CodeDir = Join-Path $PackDir 'code'
$MigrateDir = Join-Path $PackDir 'migrate'
if (-not (Test-Path (Join-Path $CodeDir 'src\server.js'))) {
  # Pack tools\_taze-main-usb ýa-da özi code/
  if (Test-Path (Join-Path $PackDir 'src\server.js')) { $CodeDir = $PackDir }
}
if (-not (Test-Path (Join-Path $MigrateDir 'db\kerwen_dump.sql'))) {
  if (Test-Path (Join-Path $PackDir 'db\kerwen_dump.sql')) { $MigrateDir = $PackDir }
}

function Test-Project($p) {
  if (-not $p) { return $false }
  return (Test-Path -LiteralPath (Join-Path $p 'src\server.js')) -and (Test-Path -LiteralPath (Join-Path $p 'package.json'))
}

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-Dest {
  if ($Dest -and (Test-Project $Dest)) { return (Resolve-Path $Dest).Path }
  $cands = New-Object System.Collections.Generic.List[string]
  $rootFile = Join-Path $env:LOCALAPPDATA 'KerwenKadr\kerwen-root.txt'
  if (Test-Path $rootFile) {
    $t = (Get-Content $rootFile -Raw -ErrorAction SilentlyContinue).Trim().Trim('"')
    if (Test-Project $t) { $cands.Add($t) }
  }
  $bases = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:USERPROFILE 'Desktop'),
    (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
    (Join-Path $env:USERPROFILE 'OneDrive\Рабочий стол'),
    (Join-Path $env:USERPROFILE 'Documents')
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  foreach ($b in $bases) {
    Get-ChildItem -LiteralPath $b -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.Name -match 'kerwen|kadr') {
        if (Test-Project $_.FullName) { $cands.Add($_.FullName) }
      }
    }
  }
  $uniq = @($cands | ForEach-Object {
    try { (Resolve-Path -LiteralPath $_).Path } catch { $_ }
  } | Select-Object -Unique)
  if ($uniq.Count -ge 1) { return $uniq[0] }
  return $null
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Kerwen — TÄZE MAIN PC DOLY GURNA' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ("Pack: {0}" -f $PackDir)
Write-Host ("Admin: {0}" -f (Test-Admin))
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '[!] Node.js ýok. https://nodejs.org LTS gurnaň, soň APPLY täzeden.' -ForegroundColor Red
  pause
  exit 1
}
$pgSvc = @(Get-Service -Name '*postgres*','*pgsql*' -ErrorAction SilentlyContinue)
if ($pgSvc.Count -eq 0) {
  Write-Host '[!] PostgreSQL ýok. https://www.postgresql.org gurnaň, soň APPLY täzeden.' -ForegroundColor Red
  pause
  exit 1
}

$Target = Find-Dest
if (-not $Target) {
  $desk = [Environment]::GetFolderPath('Desktop')
  if (-not $desk) { $desk = Join-Path $env:USERPROFILE 'Desktop' }
  $Target = Join-Path $desk 'kerwen_kadr'
  Write-Host ("Kerwen papkasy ýok — döredilýär: {0}" -f $Target) -ForegroundColor Yellow
  New-Item -ItemType Directory -Force -Path $Target | Out-Null
}

Write-Host ("Proýekt: {0}" -f $Target) -ForegroundColor Cyan

# 1) Kod
Write-Host '1) Kod goýulýar...' -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $CodeDir 'src\server.js'))) {
  Write-Host '[!] Pack içinde code\ ýok. MAKE-TAZE-MAIN-USB.bat täzeden işlediň.' -ForegroundColor Red
  pause
  exit 1
}
foreach ($dir in @('src','public','scripts','templates','tools')) {
  $src = Join-Path $CodeDir $dir
  if (-not (Test-Path $src)) { continue }
  $dst = Join-Path $Target $dir
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  robocopy $src $dst /E /NFL /NDL /NJH /NJS /NC /NS /NP /R:1 /W:1 /XD uploads node_modules | Out-Null
}
foreach ($f in @('package.json','package-lock.json','nodemon.json','Install.bat')) {
  $sf = Join-Path $CodeDir $f
  if (Test-Path $sf) { Copy-Item $sf (Join-Path $Target $f) -Force }
}
# tools scripts from migrate/setup
$toolsSrc = Join-Path $Target 'tools'
New-Item -ItemType Directory -Force -Path $toolsSrc | Out-Null
Write-Host '   [ok] kod' -ForegroundColor Green

# 2) Migrate data into tools\_migrate-pack + project
Write-Host '2) Migrate (uploads / data / dump / 3x4)...' -ForegroundColor Yellow
$packLink = Join-Path $Target 'tools\_migrate-pack'
if (Test-Path $MigrateDir) {
  if (Test-Path $packLink) { Remove-Item $packLink -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Force -Path $packLink | Out-Null
  robocopy $MigrateDir $packLink /E /NFL /NDL /NJH /NJS /NC /NS /NP /R:1 /W:1 | Out-Null
  Write-Host '   [ok] tools\_migrate-pack' -ForegroundColor Green
} else {
  Write-Host '   [!] migrate\ ýok — baza boş galyp biler' -ForegroundColor Red
}

# 3) setup-new-main-pc (DB port, restore, EXE…)
Write-Host '3) Setup (baza + Panel + awtostart)...' -ForegroundColor Yellow
$setup = Join-Path $Target 'tools\setup-new-main-pc.ps1'
# Ensure setup script exists (from code pack or this PC tools)
if (-not (Test-Path $setup)) {
  $fallback = Join-Path $PackDir '..\setup-new-main-pc.ps1'
  if (Test-Path (Join-Path $CodeDir 'tools\setup-new-main-pc.ps1')) {
    Copy-Item (Join-Path $CodeDir 'tools\setup-new-main-pc.ps1') $setup -Force
  }
}
# Copy essential tools into target if missing
$needTools = @(
  'setup-new-main-pc.ps1','restore-on-new-main-pc.ps1','install-kerwen.ps1',
  'fix-autostart.ps1','Kerwen.exe','KerwenLauncher.cs','verify-new-main-pc.js',
  'ensure-lan-access.ps1','setup-secure-lan.ps1','check-placed-stats.js'
)
foreach ($nt in $needTools) {
  $td = Join-Path $Target "tools\$nt"
  if (Test-Path $td) { continue }
  foreach ($cand in @(
    (Join-Path $CodeDir "tools\$nt"),
    (Join-Path $PackDir "..\$nt"),
    (Join-Path $PSScriptRoot $nt)
  )) {
    if (Test-Path $cand) { Copy-Item $cand $td -Force; break }
  }
}

if (Test-Path $setup) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $setup
} else {
  Write-Host '[!] setup-new-main-pc.ps1 ýok' -ForegroundColor Red
  pause
  exit 1
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  TÄZE MAIN PC — gutardy' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ("Papka: {0}" -f $Target)
Write-Host 'Desktop: Kerwen Panel'
Write-Host 'http://localhost:8000/admin/login.html  (Ctrl+F5)'
Write-Host ''
