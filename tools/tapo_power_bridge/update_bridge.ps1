$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$python = if (Get-Command py -ErrorAction SilentlyContinue) { "py" } else { "python" }
& $python -m pip install --upgrade -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Dependency update failed." }

$taskName = "NAm Tapo Power Bridge"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $taskName
  Write-Host ""
  Write-Host "Bridge updated and restarted in the background." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "Dependencies updated. No autostart task was found; run run.bat to start the bridge." -ForegroundColor Yellow
}
