@echo off
rem One step hosting for Home Assistant Material on Windows.
rem
rem   host.bat             ask which mode to use
rem   host.bat --detached  pull, start, wait until it answers, print the address, return
rem   host.bat --logs      the same, then stay in a live status and log view
rem   host.bat --stop      stop the container (data in .\config is kept)
rem
rem Leaving the log view does not stop anything. Existing data and other containers are left alone.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
if "%HA_MATERIAL_PORT%"=="" (set "PORT=8123") else (set "PORT=%HA_MATERIAL_PORT%")
set "SERVICE=homeassistant"

where docker >nul 2>&1 || (call :fail "Docker is not installed. Install Docker Desktop, then run this again." & exit /b 1)
docker info >nul 2>&1 || (call :fail "Docker is installed but not running. Start Docker Desktop, then run this again." & exit /b 1)
docker compose version >nul 2>&1 || (call :fail "Docker Compose is missing. Update Docker Desktop, then run this again." & exit /b 1)

set "MODE=%~1"
if "%MODE%"=="" (
  echo Home Assistant Material
  echo   1^) Start in the background and return
  echo   2^) Start and watch the live log
  echo   3^) Stop
  choice /c 123 /n /m "Choose 1, 2 or 3: "
  if errorlevel 3 (set "MODE=--stop") else if errorlevel 2 (set "MODE=--logs") else (set "MODE=--detached")
)

if /i "%MODE%"=="--stop" (
  docker compose stop || (call :fail "The container could not be stopped." & exit /b 1)
  echo Stopped. Data in .\config is kept.
  exit /b 0
)
if /i not "%MODE%"=="--detached" if /i not "%MODE%"=="--logs" (
  call :fail "Unknown option %MODE%. Use --detached, --logs or --stop."
  exit /b 1
)

echo Pulling the published image...
docker compose pull || (call :fail "The image could not be pulled. Check the network and the tag in compose.yaml." & exit /b 1)
echo Starting...
docker compose up -d || (call :fail "The container did not start. Port %PORT% may be in use; set HA_MATERIAL_PORT to another port." & exit /b 1)

echo Waiting until it answers on port %PORT%...
set /a TRIES=0
:wait
curl --fail --silent --max-time 5 "http://127.0.0.1:%PORT%/manifest.json" >nul 2>&1
if not errorlevel 1 goto ready
set /a TRIES+=1
if %TRIES% geq 60 (
  docker compose ps
  call :fail "It did not answer within 5 minutes. Run host.bat --logs to see why."
  exit /b 1
)
rem Named by full path: started from a Git shell, a bare "timeout" finds a different program
rem that fails at once, and Windows timeout.exe refuses to run without a console.
"%SystemRoot%\System32\ping.exe" -n 6 127.0.0.1 >nul
goto wait

:ready
set "ADDRESS="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress" 2^>nul`) do set "ADDRESS=%%A"
echo.
echo Home Assistant Material is running.
echo   On this machine:   http://localhost:%PORT%/
if defined ADDRESS (
  echo   On your network:   http://%ADDRESS%:%PORT%/
) else (
  echo   On your network:   the address of this machine could not be read; use its IP address with port %PORT%.
)
echo   Data is kept in:   %CD%\config
if /i "%MODE%"=="--detached" exit /b 0

:logview
echo.
for /f "usebackq delims=" %%S in (`docker inspect --format "{{.State.Status}}, {{if .State.Health}}{{.State.Health.Status}}{{else}}no health check{{end}}" home-assistant-material 2^>nul`) do echo Service %SERVICE%: %%S.
choice /c FLSQ /n /m "Keys: [F] follow logs (Ctrl+C returns here)  [L] last 50 lines  [S] status  [Q] leave (keeps running): "
if errorlevel 4 (
  echo Left the log view. The container keeps running.
  exit /b 0
)
if errorlevel 3 (docker compose ps & goto logview)
if errorlevel 2 (docker compose logs --tail 50 %SERVICE% & goto logview)
rem Following runs in a child command shell, so Ctrl+C ends the follow and returns to this menu.
cmd /c "docker compose logs --follow --tail 20 %SERVICE%"
goto logview

:fail
echo.
echo FAILED: %~1 1>&2
exit /b 1
