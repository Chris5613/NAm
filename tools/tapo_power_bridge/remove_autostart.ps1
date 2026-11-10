$ErrorActionPreference = "SilentlyContinue"
$taskName = "NAm Tapo Power Bridge"
Stop-ScheduledTask -TaskName $taskName
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Host "NAm Tapo Power Bridge autostart task removed." -ForegroundColor Green
