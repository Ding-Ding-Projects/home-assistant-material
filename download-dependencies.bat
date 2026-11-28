@echo off
setlocal EnableExtensions
set "QUIET=0"
if /i "%SILENT%"=="1" set "QUIET=1"
if /i "%~1"=="/s" set "QUIET=1"
if /i "%~1"=="--silent" set "QUIET=1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-companion\prerequisites.ps1" -Package docker-desktop -Silent:%QUIET%
set "RC=%errorlevel%"
if "%QUIET%"=="0" pause
exit /b %RC%
