@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -m pip install -r requirements.txt
  if errorlevel 1 goto :error
  py setup_bridge.py
) else (
  python -m pip install -r requirements.txt
  if errorlevel 1 goto :error
  python setup_bridge.py
)
echo.
pause
exit /b 0

:error
echo.
echo Setup failed. Review the error above.
pause
exit /b 1
