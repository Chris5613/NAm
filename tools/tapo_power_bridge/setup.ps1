$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host "NAm Tapo P115 bridge setup" -ForegroundColor Cyan
if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python 3 is required. Install Python, then rerun this setup."
}
$python = if (Get-Command py -ErrorAction SilentlyContinue) { "py" } else { "python" }

& $python -m pip install -r requirements.txt

$namUrl = Read-Host "NAm backend URL (example: https://your-backend.onrender.com)"
$token = Read-Host "Power bridge token from the NAm Mining Power card"
$tapoUser = Read-Host "Tapo account email"
$tapoPass = Read-Host "Tapo account password"
$plug1 = Read-Host "RTX 5070 P115 IP address"
$plug2 = Read-Host "RTX 2080 Super P115 IP address"

$config = @{
  nam_url = $namUrl.TrimEnd("/")
  token = $token
  interval_seconds = 15
  tapo_username = $tapoUser
  tapo_password = $tapoPass
  plugs = @(
    @{ id = "rtx5070"; label = "RTX 5070 PC"; host = $plug1 },
    @{ id = "rtx2080super"; label = "RTX 2080 Super PC"; host = $plug2 }
  )
}
$config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 config.json
Write-Host ""
Write-Host "Saved config.json locally. It is ignored by Git and should never be committed." -ForegroundColor Green
Write-Host "Run run.bat to start sending live wattage to NAm." -ForegroundColor Green
