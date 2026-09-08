# Bir USB pack: kod + baza + suratlar + poçta — täze Main PC-de BIR APPLY
# Cykyş: tools\_taze-main-usb\

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$OutDir = Join-Path $Root 'tools\_taze-main-usb'
$env:KERWEN_MIGRATE_QUIET = '1'

Write-Host ''
Write-Host '=== Kerwen TAZE MAIN PC USB pack ===' -ForegroundColor Cyan
Write-Host ("Proyekt: {0}" -f $Root)
Write-Host ("Cyky:    {0}" -f $OutDir)
Write-Host ''

if (Test-Path -LiteralPath $OutDir) {
  $bak = Join-Path $Root ("tools\_taze-main-usb.bak-{0}" -f $stamp)
  try {
    Rename-Item -LiteralPath $OutDir -NewName (Split-Path $bak -Leaf) -Force -ErrorAction Stop
    Write-Host ("Kone pack: {0}" -f $bak) -ForegroundColor DarkGray
  } catch {
    # Gulply bolsa - taze ady bilen yaz
    $OutDir = Join-Path $Root ("tools\_taze-main-usb-{0}" -f $stamp)
    Write-Host ("Pack gulply - taze papka: {0}" -f $OutDir) -ForegroundColor Yellow
  }
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host '1) Migrate (baza dump + uploads + data + 3x4)...' -ForegroundColor Yellow
$migrateOut = Join-Path $OutDir 'migrate'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'tools\migrate-to-new-main-pc.ps1') -OutDir $migrateOut

Write-Host ''
Write-Host '2) Kod update...' -ForegroundColor Yellow
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'tools\make-code-update.ps1')
$codeSrc = Join-Path $Root 'tools\_code-update'
$codeDst = Join-Path $OutDir 'code'
if (Test-Path -LiteralPath $codeSrc) {
  New-Item -ItemType Directory -Force -Path $codeDst | Out-Null
  robocopy $codeSrc $codeDst /E /NFL /NDL /NJH /NJS /NC /NS /NP /R:1 /W:1 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy code failed ($LASTEXITCODE)" }
  Write-Host '  [ok] code/' -ForegroundColor Green
}

Copy-Item -LiteralPath (Join-Path $Root 'tools\apply-full-new-pc.ps1') -Destination (Join-Path $OutDir 'apply-full-new-pc.ps1') -Force
Copy-Item -LiteralPath (Join-Path $Root 'tools\APPLY-TAZE-MAIN.bat') -Destination (Join-Path $OutDir 'APPLY-TAZE-MAIN.bat') -Force

$okaLines = @(
  'Kerwen - TAZE MAIN PC (onki yaly doly gocurme)',
  '',
  'KONE PC-de (shu PC):',
  '  tools\MAKE-TAZE-MAIN-USB.bat',
  '  -> tools\_taze-main-usb\',
  '',
  'USB-e dine su papkany gocurun:',
  '  tools\_taze-main-usb',
  '',
  'TAZE MAIN PC-de (ilkinji gezek):',
  '  1) Node.js LTS gurna  (https://nodejs.org)',
  '  2) PostgreSQL gurna   (paroly yatda saklan)',
  '  3) Kerwen papkasy eyyam bar bolsa - yapyn Panel/serweri',
  '  4) APPLY-TAZE-MAIN.bat basyn (Admin sorasa OK)',
  '',
  'Skript ozi edyar: kod + baza + suratlar + 3x4 + Panel + awtostart',
  'Kone C:\Users\edovr\... yollary pozylar. DB_PORT awto.',
  '',
  'Son: Desktop Kerwen Panel -> http://localhost:8000  Ctrl+F5',
  '',
  'MOHUM: dine _code-update / APPLY.bat - TAZE PC ucin YETERLIK DAL.',
  'Taze PC ucin HEMISE su _taze-main-usb pack.'
)
Set-Content -LiteralPath (Join-Path $OutDir 'OKAN.txt') -Value $okaLines -Encoding UTF8

Write-Host ''
Write-Host '=== TAYYAR ===' -ForegroundColor Green
Write-Host $OutDir
Write-Host 'USB: dine _taze-main-usb papkasy'
Write-Host 'Taze PC: APPLY-TAZE-MAIN.bat'
Write-Host ''
