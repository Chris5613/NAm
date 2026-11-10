$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$log = Join-Path $here "bridge.log"
$python = $null

$py = Get-Command py -ErrorAction SilentlyContinue
if ($py) {
  $python = $py.Source
  $args = @("tapo_power_bridge.py")
} else {
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) {
    $python = $cmd.Source
    $args = @("tapo_power_bridge.py")
  } else {
    Add-Content -Path $log -Value ("[{0}] Python was not found." -f (Get-Date -Format s))
    exit 1
  }
}

Add-Content -Path $log -Value ([Environment]::NewLine + ("[{0}] Starting NAm Tapo P115 bridge." -f (Get-Date -Format s)))
& $python @args *>> $log
$code = $LASTEXITCODE
Add-Content -Path $log -Value ("[{0}] Bridge exited with code {1}." -f (Get-Date -Format s), $code)
exit $code
