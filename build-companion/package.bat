@echo off
setlocal EnableExtensions
pushd "%~dp0" || exit /b 1
where node >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prerequisites.ps1" -Package nodejs-lts
  if errorlevel 1 exit /b 3
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
call npm ci --no-audit --no-fund
if errorlevel 1 exit /b %errorlevel%
node source.cjs pack
if errorlevel 1 exit /b %errorlevel%
call node_modules\.bin\electron-builder.cmd --win portable --publish never
exit /b %errorlevel%
