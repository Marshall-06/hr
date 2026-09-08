# Täze Main PC: diňe kod goýulýar. Surat / baza / .env galýar.
param(
  [string]$Dest = ''
)

$ErrorActionPreference = 'Continue'
$PackDir = $PSScriptRoot
# Pack içinden ýa-da tools\ içinden
if (-not (Test-Path (Join-Path $PackDir 'src\server.js'))) {
  $nested = Join-Path $PackDir '_code-update'
  if (Test-Path (Join-Path $nested 'src\server.js')) { $PackDir = $nested }
}

function Test-Project($p) {
  if (-not $p) { return $false }
  return (Test-Path -LiteralPath (Join-Path $p 'src\server.js')) -and (Test-Path -LiteralPath (Join-Path $p 'package.json'))
}

function Read-RootFile($f) {
  if (-not (Test-Path -LiteralPath $f)) { return $null }
  $t = (Get-Content -LiteralPath $f -Raw -ErrorAction SilentlyContinue)
  if (-not $t) { return $null }
  return $t.Trim().Trim('"')
}

function Find-Dest {
  if ($Dest -and (Test-Project $Dest)) { return (Resolve-Path $Dest).Path }

  $cands = New-Object System.Collections.Generic.List[string]

  $rootFiles = @(
    (Join-Path $env:LOCALAPPDATA 'KerwenKadr\kerwen-root.txt')
  )
  Get-ChildItem -Path $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $rootFiles += (Join-Path $_.FullName 'kerwen-root.txt')
  }
  foreach ($f in $rootFiles) {
    $p = Read-RootFile $f
    if (Test-Project $p) { $cands.Add($p) }
  }

  $searchBases = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:USERPROFILE 'Desktop'),
    (Join-Path $env:USERPROFILE 'Documents'),
    (Join-Path $env:USERPROFILE 'OneDrive'),
    (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
    (Join-Path $env:USERPROFILE 'OneDrive\Рабочий стол'),
    $env:USERPROFILE,
    'C:\',
    'D:\',
    'E:\'
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

  foreach ($base in $searchBases) {
    Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.Name -match 'kerwen|kadr') {
        if (Test-Project $_.FullName) { $cands.Add($_.FullName) }
      }
    }
  }

  $parent = Split-Path $PackDir -Parent
  if ($parent -and (Split-Path $parent -Leaf) -eq 'tools' -and (Test-Project (Split-Path $parent -Parent))) {
    $cands.Add((Split-Path $parent -Parent))
  }
  if (Test-Project $parent) { $cands.Add($parent) }

  $uniq = $cands | Where-Object { $_ } | ForEach-Object {
    try { (Resolve-Path -LiteralPath $_).Path } catch { $_ }
  } | Select-Object -Unique

  # Pack özüni overwrite etme
  $packFull = (Resolve-Path $PackDir).Path
  $uniq = @($uniq | Where-Object { $_ -and ($_ -ne $packFull) })

  if ($uniq.Count -eq 1) { return $uniq[0] }
  if ($uniq.Count -gt 1) {
    $withUploads = @($uniq | Where-Object { Test-Path (Join-Path $_ 'public\uploads') })
    if ($withUploads.Count -ge 1) { return $withUploads[0] }
    return $uniq[0]
  }
  return $null
}

function Stop-Kerwen {
  Write-Host 'Serwer togtadylýar...' -ForegroundColor Yellow
  try {
    Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique |
      ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
  } catch {}
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessName -match '^(node|Kerwen|Kerwen)$' -or $_.Name -match 'Kerwen'
    } |
    ForEach-Object {
      try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
  Start-Sleep -Seconds 1
}

function Copy-Tree($src, $dst, $excludeDirNames = @()) {
  if (-not (Test-Path -LiteralPath $src)) { return }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $args = @($src, $dst, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP', '/R:2', '/W:1')
  if ($excludeDirNames.Count) {
    $args += '/XD'
    $args += $excludeDirNames
  }
  & robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE): $src -> $dst" }
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Kerwen - kod update (surat/baza galyar)' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host "Pack: $PackDir"

if (-not (Test-Path (Join-Path $PackDir 'src\server.js'))) {
  Write-Host '[!] Pack içinde src\server.js ýok. _code-update papkasyny açyň.' -ForegroundColor Red
  exit 1
}

$Target = Find-Dest
if (-not $Target) {
  Write-Host '[!] Kerwen papkasy tapylmady.' -ForegroundColor Red
  Write-Host 'Kerwen papkasynyn doly yoluny yazyn (mysal C:\kerwen_kadr)'
  $typed = Read-Host 'Yol'
  if ($typed -and (Test-Project $typed.Trim('"'))) {
    $Target = (Resolve-Path $typed.Trim().Trim('"')).Path
  }
}
if (-not $Target) {
  Write-Host '[!] Bar bolan Kerwen papkasy tapylmady.' -ForegroundColor Red
  Write-Host '  APPLY.bat-y Kerwen\tools\_code-update içinde işlediň'
  Write-Host '  ýa-da: powershell -File apply-code-update.ps1 -Dest "C:\kerwen_kadr"'
  exit 1
}

Write-Host "Gurnalýan ýer: $Target" -ForegroundColor Green
Write-Host 'El degilmeýär: public\uploads , .env , PostgreSQL, suratlar\'
Write-Host ''

Stop-Kerwen

Write-Host 'Kod goýulýar...' -ForegroundColor Yellow
Copy-Tree (Join-Path $PackDir 'src') (Join-Path $Target 'src')
Copy-Tree (Join-Path $PackDir 'public') (Join-Path $Target 'public') @('uploads')
Copy-Tree (Join-Path $PackDir 'scripts') (Join-Path $Target 'scripts')
Copy-Tree (Join-Path $PackDir 'templates') (Join-Path $Target 'templates')
foreach ($f in @('package.json','package-lock.json','nodemon.json')) {
  $from = Join-Path $PackDir $f
  if (Test-Path $from) { Copy-Item -LiteralPath $from -Destination (Join-Path $Target $f) -Force }
}

# tools (EXE) - gulply bolsa skip
$packTools = Join-Path $PackDir 'tools'
if (Test-Path $packTools) {
  Get-ChildItem -LiteralPath $packTools -File -ErrorAction SilentlyContinue | ForEach-Object {
    $to = Join-Path $Target "tools\$($_.Name)"
    try { Copy-Item -LiteralPath $_.FullName -Destination $to -Force -ErrorAction Stop } catch {
      Write-Host ("  [skip] {0}" -f $_.Name) -ForegroundColor DarkGray
    }
  }
}

# Täze PC: köne ulanyjy ýoly (C:\Users\edovr\...) -> şu PC Desktop
$dataDir = Join-Path $Target 'data'
if (-not (Test-Path -LiteralPath $dataDir)) {
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
}
$kiciCfg = Join-Path $dataDir 'kici-suratlar-folder.json'
$me = $env:USERNAME
if (Test-Path -LiteralPath $kiciCfg) {
  $rawCfg = Get-Content -LiteralPath $kiciCfg -Raw -ErrorAction SilentlyContinue
  if ($rawCfg -match '\\Users\\([^\\]+)\\' -and $Matches[1] -and ($Matches[1] -ne $me)) {
    Write-Host ("Kone PC yol arassalanýar: Users\{0}" -f $Matches[1]) -ForegroundColor Yellow
    Set-Content -LiteralPath $kiciCfg -Value "{`n  `"folderPath`": `"`",`n  `"updatedAt`": `"$((Get-Date).ToString('o'))`"`n}`n" -Encoding UTF8
  }
}
$desk = [Environment]::GetFolderPath('Desktop')
if (-not $desk) { $desk = Join-Path $env:USERPROFILE 'Desktop' }
$kiciDesk = Join-Path $desk 'anketa_kici_suratlar'
New-Item -ItemType Directory -Force -Path $kiciDesk | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Target 'public\uploads') | Out-Null
Write-Host "3x4 papka (programma dashynda): $kiciDesk" -ForegroundColor Green

Set-Location $Target
if (Get-Command npm -ErrorAction SilentlyContinue) {
  Write-Host 'npm install...' -ForegroundColor Yellow
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[!] npm install ýalňyşlyk - node_modules bar bolsa dowam.' -ForegroundColor Yellow
  }
} else {
  Write-Host '[!] npm tapylmady - Node.js gurnaly bolmaly' -ForegroundColor Yellow
}

# Match kod barlag
$ms = Join-Path $Target 'src\services\matchService.js'
$txt = Get-Content -LiteralPath $ms -Raw -ErrorAction SilentlyContinue
if ($txt -match 'OPERATOR_KIND_KEYS' -and $txt -match 'turkmenSearchVariants') {
  Write-Host '[ok] matchService taze kod' -ForegroundColor Green
} else {
  Write-Host '[!] matchService kone gorynyar - pack-y tazeden gocurin' -ForegroundColor Red
}

# Panel EXE root täzele
$kerwenRootFiles = @(
  (Join-Path $env:LOCALAPPDATA 'KerwenKadr\kerwen-root.txt')
)
Get-ChildItem -Path $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $kerwenRootFiles += (Join-Path $_.FullName 'kerwen-root.txt')
}
foreach ($f in ($kerwenRootFiles | Select-Object -Unique)) {
  $dir = Split-Path $f -Parent
  if (Test-Path $dir) {
    try {
      [System.IO.File]::WriteAllText($f, $Target, [System.Text.UTF8Encoding]::new($false))
    } catch {}
  }
}

# Panel EXE + awtostart täzele (öňki ýaly Install)
$installPs = Join-Path $Target 'tools\install-kerwen.ps1'
if (Test-Path -LiteralPath $installPs) {
  Write-Host 'Panel EXE + awtostart gurnalýar...' -ForegroundColor Yellow
  try {
    powershell -NoProfile -ExecutionPolicy Bypass -File $installPs
  } catch {
    Write-Host ("Install: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
  }
}

# Serwer täzeden
$exe = @(
  (Join-Path $env:LOCALAPPDATA 'KerwenKadr\Kerwen.exe'),
  (Join-Path $Target 'tools\Kerwen.exe'),
  (Join-Path $Target 'dist\Kerwen.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($exe) {
  Write-Host "Serwer: $exe --autostart" -ForegroundColor Yellow
  Start-Process -FilePath $exe -ArgumentList '--autostart' -WorkingDirectory (Split-Path $exe)
} else {
  Write-Host 'Kerwen.exe ýok - npm start...' -ForegroundColor Yellow
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm start' -WorkingDirectory $Target
}

Write-Host ''
Write-Host 'Kod update gutardy. Suratlar we baza galýar.' -ForegroundColor Green
Write-Host 'Desktop: Kerwen Panel'
Write-Host 'Brauzerde:  http://localhost:8000/admin/login.html'
Write-Host 'Ctrl+F5 basyň.'
Write-Host ''
