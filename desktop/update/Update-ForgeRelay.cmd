@echo off
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Update-ForgeRelay.ps1" %*
set "relayExit=%errorlevel%"
if not "%relayExit%"=="0" if "%~1"=="" pause
exit /b %relayExit%
