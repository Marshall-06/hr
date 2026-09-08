# Port 8000 ýapyk bolsa — Kerwen serweri tiz başlat (Task Scheduler her 2 min)
# Install-kerwen.ps1 bu task-y awtomatik gurnaýar.

$ErrorActionPreference = 'SilentlyContinue'

function Test-Port8000 {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect('127.0.0.1', 8000, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(400)
    if (-not $ok) { $c.Close(); return $false }
    $c.EndConnect($iar)
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

if (Test-Port8000) { exit 0 }

$cands = New-Object System.Collections.Generic.List[string]
$cands.Add((Join-Path $env:LOCALAPPDATA 'KerwenKadr\Kerwen.exe'))

Get-ChildItem -Path $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Name -match '^(.+)Kadr$') {
    $brand = $Matches[1]
    $p = Join-Path $_.FullName ("{0}.exe" -f $brand)
    if (Test-Path -LiteralPath $p) { $cands.Add($p) }
  }
}

$exe = @($cands | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1)
if (-not $exe) { exit 1 }

Start-Process -FilePath $exe -ArgumentList '--autostart','--silent' -WorkingDirectory (Split-Path $exe)
exit 0
