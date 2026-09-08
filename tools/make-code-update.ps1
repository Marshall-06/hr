# Diňe KOD update pack (surat / baza / .env göçürilmeýär)
# Cykyş: tools\_code-update\

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$OutDir = Join-Path $Root 'tools\_code-update'

Write-Host ''
Write-Host '=== Kerwen KOD update pack ===' -ForegroundColor Cyan
Write-Host "Proyekt: $Root"
Write-Host "Cyky:    $OutDir"
Write-Host 'Suratlar, baza, .env pack-a girmeýär.'
Write-Host ''

if (Test-Path -LiteralPath $OutDir) {
  Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Copy-Tree($src, $dst, $excludeDirNames = @()) {
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "  [skip] $src" -ForegroundColor DarkGray
    return
  }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $xd = @()
  foreach ($n in $excludeDirNames) { $xd += $n }
  $args = @($src, $dst, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP', '/R:1', '/W:1')
  if ($xd.Count) {
    $args += '/XD'
    $args += $xd
  }
  & robocopy @args | Out-Null
  $code = $LASTEXITCODE
  if ($code -ge 8) { throw "robocopy failed ($code): $src" }
  Write-Host "  [ok] $src" -ForegroundColor Green
}

function Copy-File($src, $dst) {
  if (-not (Test-Path -LiteralPath $src)) { return }
  $parent = Split-Path $dst -Parent
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  Copy-Item -LiteralPath $src -Destination $dst -Force
  Write-Host "  [ok] $(Split-Path $src -Leaf)" -ForegroundColor Green
}

Write-Host 'Kod gocurylyar...' -ForegroundColor Yellow
Copy-Tree (Join-Path $Root 'src') (Join-Path $OutDir 'src')
Copy-Tree (Join-Path $Root 'public') (Join-Path $OutDir 'public') @('uploads')
Copy-Tree (Join-Path $Root 'scripts') (Join-Path $OutDir 'scripts')
Copy-Tree (Join-Path $Root 'templates') (Join-Path $OutDir 'templates')
Copy-File (Join-Path $Root 'package.json') (Join-Path $OutDir 'package.json')
Copy-File (Join-Path $Root 'package-lock.json') (Join-Path $OutDir 'package-lock.json')
Copy-File (Join-Path $Root 'nodemon.json') (Join-Path $OutDir 'nodemon.json')

Copy-File (Join-Path $Root 'tools\apply-code-update.ps1') (Join-Path $OutDir 'apply-code-update.ps1')
Copy-File (Join-Path $Root 'tools\apply-code-update.bat') (Join-Path $OutDir 'APPLY-ON-NEW-PC.bat')
Copy-File (Join-Path $OutDir 'APPLY-ON-NEW-PC.bat') (Join-Path $OutDir 'APPLY.bat')
Copy-File (Join-Path $Root 'tools\Kerwen.exe') (Join-Path $OutDir 'tools\Kerwen.exe')
Copy-File (Join-Path $Root 'tools\install-kerwen.ps1') (Join-Path $OutDir 'tools\install-kerwen.ps1')
Copy-File (Join-Path $Root 'tools\KerwenLauncher.cs') (Join-Path $OutDir 'tools\KerwenLauncher.cs')
Copy-File (Join-Path $Root 'tools\fix-autostart.ps1') (Join-Path $OutDir 'tools\fix-autostart.ps1')
Copy-File (Join-Path $Root 'tools\fix-autostart.bat') (Join-Path $OutDir 'tools\fix-autostart.bat')
Copy-File (Join-Path $Root 'tools\Install-Panel.bat') (Join-Path $OutDir 'tools\Install-Panel.bat')
Copy-File (Join-Path $Root 'tools\verify-new-main-pc.js') (Join-Path $OutDir 'tools\verify-new-main-pc.js')
Copy-File (Join-Path $Root 'tools\setup-new-main-pc.ps1') (Join-Path $OutDir 'tools\setup-new-main-pc.ps1')
Copy-File (Join-Path $Root 'tools\setup-new-main-pc.bat') (Join-Path $OutDir 'tools\setup-new-main-pc.bat')
Copy-File (Join-Path $Root 'tools\restore-on-new-main-pc.ps1') (Join-Path $OutDir 'tools\restore-on-new-main-pc.ps1')
Copy-File (Join-Path $Root 'tools\restore-on-new-main-pc.bat') (Join-Path $OutDir 'tools\restore-on-new-main-pc.bat')
Copy-File (Join-Path $Root 'tools\ensure-lan-access.ps1') (Join-Path $OutDir 'tools\ensure-lan-access.ps1')
Copy-File (Join-Path $Root 'tools\setup-secure-lan.ps1') (Join-Path $OutDir 'tools\setup-secure-lan.ps1')
Copy-File (Join-Path $Root 'tools\check-placed-stats.js') (Join-Path $OutDir 'tools\check-placed-stats.js')
Copy-File (Join-Path $Root 'tools\watchdog-server.ps1') (Join-Path $OutDir 'tools\watchdog-server.ps1')
Copy-File (Join-Path $Root 'Install.bat') (Join-Path $OutDir 'Install.bat')
Copy-File (Join-Path $Root 'src\utils\sanitizeLocalConfig.js') (Join-Path $OutDir 'src\utils\sanitizeLocalConfig.js')

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
@(
  "Kerwen KOD update $stamp"
  'Match: anketa -> wakansiya, wakansiya -> dalasgar'
  'Bu pack surat / baza / .env DEGISDIRMEYAR'
) | Set-Content -LiteralPath (Join-Path $OutDir 'VERSION.txt') -Encoding UTF8

$readme = @"
Kerwen — KOD UPDATE (diňe kod; surat / baza galýar)

TÄZE MAIN PC-Ä DOLY GÖÇÜRMEK ÜÇIN (öňki ýaly):
  tools\MAKE-TAZE-MAIN-USB.bat → tools\_taze-main-usb
  Täze PC-de: APPLY-TAZE-MAIN.bat
  Diňe bu _code-update pack TÄZE PC üçin ÝETERLIK DÄL.

Kod update (eýýäm işleýän Kerwen-de):
1) USB-ä tools\_code-update
2) Panel ýapyň
3) APPLY.bat
4) Ctrl+F5

3x4: Desktop\anketa_kici_suratlar
"@
Set-Content -LiteralPath (Join-Path $OutDir 'OKAN.txt') -Value $readme -Encoding UTF8

Write-Host ''
Write-Host 'Pack tayyar.' -ForegroundColor Green
Write-Host $OutDir
Write-Host ''
Write-Host 'USB: tools\_code-update  (dine su papka)'
Write-Host 'Taze PC: APPLY-ON-NEW-PC.bat'
Write-Host ''
