@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py tapo_power_bridge.py
) else (
  python tapo_power_bridge.py
)
pause
