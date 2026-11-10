$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = "NAm Tapo Power Bridge"
$runner = Join-Path $here "run_background.ps1"
$config = Join-Path $here "config.json"

if (-not (Test-Path $config)) {
  throw "config.json was not found. Run setup.bat first."
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '"' ) -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Runs the NAm Tapo P115 power bridge in the background at Windows sign-in."

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "NAm Tapo Power Bridge is now installed and running in the background." -ForegroundColor Green
Write-Host "You can close the old run.bat terminal window." -ForegroundColor Green
Write-Host ""
Write-Host "Task name: $taskName"
Write-Host "Log file:  $here\bridge.log"
