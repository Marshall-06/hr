' Kerwen watchdog — PowerShell-i penceresiz başlat (flash ýok)
' 0 = hidden window, False = don't wait
Option Explicit
Dim sh, fso, dir, ps1, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir & "\watchdog-server.ps1"
If Not fso.FileExists(ps1) Then WScript.Quit 1
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, False
