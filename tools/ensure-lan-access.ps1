# Kerwen — operatorlar LAN-dan girip bilsin
# 1) Tor profilini Private et (Public = Firewall ýapýar)
# 2) TCP 8000 / 8443 aç
# 3) (islege bagly) Windows-da awtomatik gaýtaláýan Task döret
param(
  [switch]$RegisterTask,
  [switch]$Quiet
)

$ErrorActionPreference = 'SilentlyContinue'
$TaskName = 'KerwenLanAccess'

function Write-Info([string]$msg, [string]$color = 'Gray') {
  if (-not $Quiet) { Write-Host $msg -ForegroundColor $color }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Info 'Admin rugsat gerek — ýokarlykly başladylýar...' 'Yellow'
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
  if ($RegisterTask) { $argList += '-RegisterTask' }
  if ($Quiet) { $argList += '-Quiet' }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
  exit $LASTEXITCODE
}

# --- 1) Private profil ---
Get-NetConnectionProfile | Where-Object {
  $_.InterfaceAlias -notmatch 'Loopback|Bluetooth'
} | ForEach-Object {
  try {
    if ($_.NetworkCategory -ne 'Private') {
      Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
      Write-Info "[OK] Private: $($_.InterfaceAlias)" 'Green'
    } else {
      Write-Info "[OK] eýýäm Private: $($_.InterfaceAlias)" 'DarkGray'
    }
  } catch {
    Write-Info "[!] Private edilmedi ($($_.InterfaceAlias)): $($_.Exception.Message)" 'Yellow'
  }
}

# --- 2) Firewall portlar (ähli profil) ---
@(
  'Kerwen HTTP 8000', 'Kerwen HTTPS 8443',
  'Kerwen Kadr 8000', 'Kerwen Kadr 8443'
) | ForEach-Object {
  netsh advfirewall firewall delete rule name=$_ 2>$null | Out-Null
}

netsh advfirewall firewall add rule name="Kerwen HTTP 8000" dir=in action=allow protocol=TCP localport=8000 profile=any | Out-Null
netsh advfirewall firewall add rule name="Kerwen HTTPS 8443" dir=in action=allow protocol=TCP localport=8443 profile=any | Out-Null
Write-Info '[OK] Firewall: TCP 8000 we 8443 (ähli profil)' 'Green'

# --- 3) Awtomatik Task ---
if ($RegisterTask) {
  $scriptPath = $PSCommandPath
  $argXml = [System.Security.SecurityElement]::Escape(
    "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" -Quiet"
  )
  $cmdXml = [System.Security.SecurityElement]::Escape('powershell.exe')

  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <BootTrigger><Enabled>true</Enabled></BootTrigger>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
    <TimeTrigger>
      <Repetition>
        <Interval>PT10M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>2020-01-01T00:05:00</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$cmdXml</Command>
      <Arguments>$argXml</Arguments>
    </Exec>
  </Actions>
</Task>
"@

  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  try {
    Register-ScheduledTask -TaskName $TaskName -Xml $xml -Force -ErrorAction Stop | Out-Null
    Write-Info "[OK] Task: $TaskName (boot + logon + her 10 min)" 'Green'
  } catch {
    # Fallback: diňe boot+logon
    try {
      $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
        "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" -Quiet"
      )
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
      $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
      Register-ScheduledTask -TaskName $TaskName -Action $action `
        -Trigger @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -AtLogOn)) `
        -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
      Write-Info "[OK] Task: $TaskName (boot + logon)" 'Green'
    } catch {
      Write-Info "[!] Task döredilmedi: $($_.Exception.Message)" 'Yellow'
    }
  }
}

# IP ýatlatma
$wifiIp = $null
Get-NetIPConfiguration | Where-Object {
  $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' -and
  $_.IPv4Address.IPAddress -notlike '127.*' -and
  $_.IPv4Address.IPAddress -notlike '169.254.*'
} | ForEach-Object {
  $n = "$($_.InterfaceAlias) $($_.NetAdapter.InterfaceDescription)"
  if ($n -match 'Wi-?Fi|WLAN|Wireless|802\.11' -and $n -notmatch 'PdaNet|Virtual|Bluetooth|VPN') {
    $wifiIp = $_.IPv4Address.IPAddress
  }
}
if (-not $wifiIp) {
  $first = Get-NetIPConfiguration | Where-Object {
    $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' -and
    $_.IPv4Address.IPAddress -notlike '127.*' -and
    $_.IPv4Address.IPAddress -notlike '169.254.*' -and
    ($_.InterfaceAlias + ' ' + $_.NetAdapter.InterfaceDescription) -notmatch 'PdaNet|Bluetooth|Virtual'
  } | Select-Object -First 1
  if ($first) { $wifiIp = $first.IPv4Address.IPAddress }
}

if (-not $Quiet) {
  Write-Host ''
  Write-Host '=== Operator LAN açyk ===' -ForegroundColor Cyan
  if ($wifiIp) {
    Write-Host "HTTP:  http://${wifiIp}:8000/"
    Write-Host "HTTPS: https://${wifiIp}:8443/admin/login.html"
  }
  Write-Host 'Kerwen Panel / serwer işleýän bolsun.'
}
