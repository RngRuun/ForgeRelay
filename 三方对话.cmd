@echo off
chcp 65001 >nul
cd /d "%~dp0"
node cli.mjs %*
if errorlevel 1 pause
