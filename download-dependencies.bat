@echo off
rem Installs the one build dependency, Docker Desktop, with winget.
rem Windows asks for administrator approval in its normal prompt. Declining it leaves
rem this script unfinished with a non-zero exit code.
rem   /s, --silent or SILENT=1 run without pausing at the end
setlocal EnableExtensions
set "QUIET=0"
if /i "%SILENT%"=="1" set "QUIET=1"
if /i "%~1"=="/s" set "QUIET=1"
if /i "%~1"=="--silent" set "QUIET=1"
set "RC=0"

where docker >nul 2>&1
if not errorlevel 1 ( docker --version & echo Docker is already installed. & goto done )

where winget >nul 2>&1
if errorlevel 1 ( set "RC=3" & echo winget is not available. Install "App Installer" from the Microsoft Store, then run this again. & goto done )

echo Installing Docker Desktop with winget (package Docker.DockerDesktop).
winget install --exact --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
if errorlevel 1 ( set "RC=%errorlevel%" & echo Docker Desktop was not installed. & goto done )
echo Docker Desktop is installed. Windows may ask you to sign out or restart before Docker can run.

:done
if "%QUIET%"=="0" pause
exit /b %RC%
