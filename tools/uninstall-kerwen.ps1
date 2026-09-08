# Agentlik gurnama aýyrmak
# Parametr:  .\uninstall-kerwen.ps1 -BrandShort "SiziňAdyňyz"

param(
  [string]$BrandShort = ''
)

$ErrorActionPreference = 'Continue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Get-DotEnvValue {
  param([string]$Key)
  $envFile = Join-Path $ProjectRoot '.env'
  if (-not (Test-Path $envFile)) { return $null }
  foreach ($line in Get-Content $envFile -Encoding UTF8) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    if ($t -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
      $val = $Matches[1].Trim().Trim('"').Trim("'")
      if ($val) { return $val }
    }
  }
  return $null
}

if (-not $BrandShort) { $BrandShort = Get-DotEnvValue 'BRAND_SHORT' }
if (-not $BrandShort) { $BrandShort = 'Kerwen' }

$SafeId = ($BrandShort -replace '[^A-Za-z0-9]', '')
if (-not $SafeId) { $SafeId = 'Agency' }

$InstallDir = Join-Path $env:LOCALAPPDATA "${SafeId}Kadr"
$Desktop = [Environment]::GetFolderPath('Desktop')
$Startup = [Environment]::GetFolderPath('Startup')
$StartMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$BrandShort"

Remove-Item (Join-Path $Desktop "$BrandShort Panel.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Startup "$BrandShort Server.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item $StartMenu -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "$BrandShort gurnama aýryldy (proyekt faýllary galdy)."
Write-Host 'Işläp duran serweri ýapmak: Task Manager → node.exe → End task'
