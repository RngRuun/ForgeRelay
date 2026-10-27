@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.19+ is required. Install Node.js or use the Windows portable app.
  if "%~1"=="" pause
  exit /b 1
)
node "%~dp0tools\start-desktop.mjs" %*
set "relayExit=%errorlevel%"
if not "%relayExit%"=="0" if "%~1"=="" pause
exit /b %relayExit%
