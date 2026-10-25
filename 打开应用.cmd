@echo off
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -File "%~dp0open-app.ps1"
if errorlevel 1 pause
