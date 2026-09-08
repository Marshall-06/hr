# Agency EXE install (once)
# Desktop "{Brand} Panel" -> server + browser
# Windows startup -> server automatic
# BRAND_SHORT (.env) = separate LocalAppData folder per agency

param(
  [string]$BrandShort = ''
)

$ErrorActionPreference = 'Continue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Get-DotEnvValue {
  param([string]$Key)
  $envFile = Join-Path $ProjectRoot '.env'
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    if ($t -match ('^\s*' + [regex]::Escape($Key) + '\s*=\s*(.*)$')) {
      $val = $Matches[1].Trim().Trim('"').Trim("'")
      if ($val) { return $val }
    }
  }
  return $null
}

if (-not $BrandShort) { $BrandShort = Get-DotEnvValue -Key 'BRAND_SHORT' }
if (-not $BrandShort) { $BrandShort = 'Kerwen' }

$SafeId = ($BrandShort -replace '[^A-Za-z0-9]', '')
if (-not $SafeId) { $SafeId = 'Agency' }

$InstallDir = Join-Path $env:LOCALAPPDATA ("{0}Kadr" -f $SafeId)
$ExeName = ("{0}.exe" -f $SafeId)
$PanelLabel = ("{0} Panel" -f $BrandShort)
$ServerLabel = ("{0} Server" -f $BrandShort)
$CscCandidates = @(
  'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
  'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
)
$Csc = $CscCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$ExePath = Join-Path $InstallDir $ExeName
$Src = Join-Path $PSScriptRoot 'KerwenLauncher.cs'
$Icon = Join-Path $ProjectRoot 'public\favicon.ico'

Write-Host ("Marka:   {0}  ({1})" -f $BrandShort, $SafeId)
Write-Host ("Proyekt: {0}" -f $ProjectRoot)
Write-Host ("EXE:     {0}" -f $ExePath)
Write-Host 'Gurnalyar...'

function Stop-KerwenExe {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^Kerwen' -or $_.ProcessName -eq 'Kerwen' } |
    ForEach-Object {
      try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
  Start-Sleep -Milliseconds 800
}

function Copy-Unlocked {
  param([string]$From, [string]$To)
  if (-not (Test-Path -LiteralPath $From)) { return $false }
  $dir = Split-Path $To -Parent
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  for ($i = 0; $i -lt 6; $i++) {
    try {
      Copy-Item -LiteralPath $From -Destination $To -Force -ErrorAction Stop
      return $true
    } catch {
      Stop-KerwenExe
      Start-Sleep -Milliseconds 600
    }
  }
  Write-Host ("  [skip] gulply: {0}" -f $To) -ForegroundColor Yellow
  return (Test-Path -LiteralPath $To)
}

Stop-KerwenExe

# Ilki täze CS-den kompilyasiýa (awtostart / port düzedişleri üçin)
$compiled = $false
if ($Csc -and (Test-Path -LiteralPath $Src)) {
  $BuildDir = Join-Path $env:TEMP 'KerwenBuild'
  New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
  $SrcBuild = Join-Path $BuildDir 'KerwenLauncher.cs'
  Copy-Item -LiteralPath $Src -Destination $SrcBuild -Force
  $ExeBuild = Join-Path $BuildDir $ExeName
  $null = & $Csc '/nologo','/target:winexe','/optimize+','/r:System.Windows.Forms.dll',("/out:{0}" -f $ExeBuild),$SrcBuild 2>&1
  if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $ExeBuild)) {
    $compiled = Copy-Unlocked -From $ExeBuild -To $ExePath
    if ($compiled) {
      $null = Copy-Unlocked -From $ExeBuild -To (Join-Path $PSScriptRoot 'Kerwen.exe')
      Write-Host '  [ok] EXE täzeden kompiliýasiýa edildi' -ForegroundColor Green
    }
  }
}

if (-not $compiled) {
  $Prebuilt = @(
    (Join-Path $PSScriptRoot 'Kerwen.exe'),
    (Join-Path $ProjectRoot 'dist\Kerwen.exe')
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($Prebuilt) {
    $compiled = Copy-Unlocked -From $Prebuilt -To $ExePath
    if ($compiled) { Write-Host ("  [ok] Taýýar EXE: {0}" -f $Prebuilt) -ForegroundColor Green }
  }
}

if (-not $compiled -and (Test-Path -LiteralPath $ExePath)) {
  Write-Host '  [ok] Bar bolan EXE ulanylýar (gulply täzelenmedi)' -ForegroundColor Yellow
  $compiled = $true
}

if (-not $compiled) {
  throw 'EXE gurnalmady. tools\Kerwen.exe barlaň ýa-da .NET Framework 4 gurnaň.'
}

if (Test-Path -LiteralPath $Icon) {
  Copy-Item -LiteralPath $Icon -Destination (Join-Path $InstallDir 'favicon.ico') -Force -ErrorAction SilentlyContinue
}

[System.IO.File]::WriteAllText(
  (Join-Path $InstallDir 'kerwen-root.txt'),
  $ProjectRoot,
  [System.Text.UTF8Encoding]::new($false)
)
[System.IO.File]::WriteAllText(
  (Join-Path $InstallDir 'brand-id.txt'),
  $SafeId,
  [System.Text.UTF8Encoding]::new($false)
)

$Dist = Join-Path $ProjectRoot 'dist'
New-Item -ItemType Directory -Force -Path $Dist | Out-Null
$null = Copy-Unlocked -From $ExePath -To (Join-Path $Dist $ExeName)
Copy-Item -LiteralPath (Join-Path $InstallDir 'kerwen-root.txt') -Destination (Join-Path $Dist 'kerwen-root.txt') -Force -ErrorAction SilentlyContinue

function New-KerwenShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Target,
    [string]$Arguments = '',
    [string]$WorkDir = '',
    [string]$Description = ''
  )
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut($Path)
  $s.TargetPath = $Target
  $s.Arguments = $Arguments
  if ($WorkDir) { $s.WorkingDirectory = $WorkDir }
  $s.Description = $Description
  if (Test-Path -LiteralPath $Target) { $s.IconLocation = ("{0},0" -f $Target) }
  $s.WindowStyle = 1
  $s.Save()
  Write-Host ("  Bellik: {0}" -f $Path)
  if ($Arguments) { Write-Host ("    args: {0}" -f $Arguments) }
}

$Desktop = [Environment]::GetFolderPath('Desktop')
$Startup = [Environment]::GetFolderPath('Startup')

New-KerwenShortcut `
  -Path (Join-Path $Desktop ("{0}.lnk" -f $PanelLabel)) `
  -Target $ExePath `
  -Arguments '' `
  -WorkDir $InstallDir `
  -Description ("{0} - serwer + panel" -f $BrandShort)

New-KerwenShortcut `
  -Path (Join-Path $Startup ("{0}.lnk" -f $ServerLabel)) `
  -Target $ExePath `
  -Arguments '--autostart --silent' `
  -WorkDir $InstallDir `
  -Description ("{0} serwer (Windows awtomatik)" -f $BrandShort)

$taskName = ("{0}Server" -f $SafeId)
$watchName = ("{0}Watchdog" -f $SafeId)
try {
  $action = New-ScheduledTaskAction -Execute $ExePath -Argument '--autostart --silent' -WorkingDirectory $InstallDir
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $trigger.Delay = 'PT8S'
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
  Write-Host ("  Task Scheduler: {0} (logon + 8 s, auto-retry)" -f $taskName) -ForegroundColor Green
} catch {
  Write-Host '  Task Scheduler rugsat yok - Startup .lnk bar.' -ForegroundColor Yellow
  Write-Host '  Has ygtybarly: tools\fix-autostart.bat (Run as administrator)' -ForegroundColor Yellow
  # schtasks fallback
  try {
    schtasks /Delete /TN $taskName /F 2>$null | Out-Null
    schtasks /Create /TN $taskName /TR "`"$ExePath`" --autostart --silent" /SC ONLOGON /DELAY 0000:08 /RL LIMITED /F | Out-Null
    Write-Host ("  schtasks: {0}" -f $taskName) -ForegroundColor Green
  } catch {}
}

# Watchdog: her 2 minut — port 8000 ýok bolsa serweri başlat (5–10 min boşluk bolmaz)
$watchPs = Join-Path $PSScriptRoot 'watchdog-server.ps1'
if (Test-Path -LiteralPath $watchPs) {
  Copy-Item -LiteralPath $watchPs -Destination (Join-Path $InstallDir 'watchdog-server.ps1') -Force -ErrorAction SilentlyContinue
  $watchLocal = Join-Path $InstallDir 'watchdog-server.ps1'
  try {
    $wAction = New-ScheduledTaskAction `
      -Execute 'powershell.exe' `
      -Argument ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`"" -f $watchLocal)
    $wTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration ([TimeSpan]::MaxValue)
    $wSettings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
      -MultipleInstances IgnoreNew
    $wPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
    Unregister-ScheduledTask -TaskName $watchName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $watchName -Action $wAction -Trigger $wTrigger -Settings $wSettings -Principal $wPrincipal -Force -ErrorAction Stop | Out-Null
    Write-Host ("  Watchdog: {0} (her 2 min, port 8000)" -f $watchName) -ForegroundColor Green
  } catch {
    try {
      schtasks /Delete /TN $watchName /F 2>$null | Out-Null
      $tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchLocal`""
      schtasks /Create /TN $watchName /TR $tr /SC MINUTE /MO 2 /RL LIMITED /F | Out-Null
      Write-Host ("  Watchdog schtasks: {0}" -f $watchName) -ForegroundColor Green
    } catch {
      Write-Host ("  Watchdog gurnalmady: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
    }
  }
}

try {
  $pg = @(Get-Service -Name '*postgres*','*pgsql*' -ErrorAction SilentlyContinue)
  foreach ($s in $pg) {
    if ($s.StartType -eq 'Disabled') {
      try {
        Set-Service -Name $s.Name -StartupType Automatic -ErrorAction Stop
        Write-Host ("  Postgres {0}: Automatic" -f $s.Name) -ForegroundColor Green
      } catch {}
    } elseif ($s.StartType -ne 'Automatic') {
      try { Set-Service -Name $s.Name -StartupType Automatic -ErrorAction SilentlyContinue } catch {}
    }
    if ($s.Status -ne 'Running') {
      try {
        Start-Service -Name $s.Name -ErrorAction Stop
        Write-Host ("  Postgres {0}: started" -f $s.Name) -ForegroundColor Green
      } catch {
        Write-Host ("  Postgres {0}: el bilen Start edin (services.msc)" -f $s.Name) -ForegroundColor Yellow
      }
    } else {
      Write-Host ("  Postgres {0}: Running / Automatic" -f $s.Name) -ForegroundColor Green
    }
  }
  if ($pg.Count -eq 0) {
    Write-Host '  PostgreSQL Service tapylmady - gurnalyn we Automatic edin!' -ForegroundColor Red
  }
} catch {
  Write-Host ("  Postgres barlagy: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

try {
  & (Join-Path $PSScriptRoot 'ensure-lan-access.ps1') -RegisterTask -Quiet
  Write-Host '  LAN access: Firewall 8000/8443 + Private Task' -ForegroundColor Green
} catch {
  Write-Host '  LAN access: tools\firewall-acyk.bat isledin (Admin)' -ForegroundColor Yellow
}

$StartMenu = Join-Path $env:APPDATA ("Microsoft\Windows\Start Menu\Programs\{0}" -f $BrandShort)
New-Item -ItemType Directory -Force -Path $StartMenu | Out-Null
New-KerwenShortcut `
  -Path (Join-Path $StartMenu ("{0}.lnk" -f $PanelLabel)) `
  -Target $ExePath `
  -Arguments '' `
  -WorkDir $InstallDir `
  -Description $PanelLabel
New-KerwenShortcut `
  -Path (Join-Path $StartMenu ("{0} Server (dine serwer).lnk" -f $BrandShort)) `
  -Target $ExePath `
  -Arguments '--autostart' `
  -WorkDir $InstallDir `
  -Description 'Dine serweri baslat'

Write-Host ''
Write-Host '=== GURNALDY ===' -ForegroundColor Green
Write-Host ("1) Desktop: {0}  (bas -> serwer + brauzer)" -f $PanelLabel)
Write-Host '2) Windows yakylanda: serwer ~10-40 s (Startup + Task +8 s + Watchdog 2 min)'
Write-Host ("3) EXE: {0}" -f $ExePath)
Write-Host ("4) Proyekt: {0}" -f $ProjectRoot)
Write-Host '5) Islemese: tools\fix-autostart.bat (Admin)'
Write-Host ''
Write-Host 'MOHUM (taze main PC):' -ForegroundColor Yellow
Write-Host ' - Proyekt OneDrive-da bolsa: Always keep on this device'
Write-Host ' - PostgreSQL Service = Automatic (services.msc)'
Write-Host ' - Dine EXE gocurek yetmez - Install.bat su PC-de isledin'
Write-Host ''

try {
  Write-Host 'Serwer indiki basladylyar...' -ForegroundColor Yellow
  Start-Process -FilePath $ExePath -ArgumentList '--autostart' -WorkingDirectory $InstallDir
} catch {
  Write-Host ("Serwer basladyrylmady: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

Write-Host ("Synag: Desktopdaky {0}-e basyn." -f $PanelLabel)
Write-Host 'Baska agentlik: ayratyn .env + DB + BRAND_SHORT ulanyn.'

