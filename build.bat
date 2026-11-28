@echo off
rem One-command build for Windows. The only requirement is Docker Desktop, which
rem download-dependencies.bat installs when it is missing.
rem
rem   build.bat            build the container image home-assistant-material:local
rem   build.bat --run      build, then start it on http://localhost:8123
rem   build.bat --demo     build the interactive Pages demo in frontend\demo\dist
rem   build.bat --backup-bootstrap-helper   build the pinned offline image helper
rem   build.bat --supervisor                build the Supervisor container
rem   build.bat --deploy-assistant          build the native desktop installer
rem   build.bat --build-companion           package the portable build application
rem   /s, --silent or SILENT=1 run without pausing at the end
rem
rem Every phase reports its real result. The script stops at the first failure and
rem returns that failure's exit code.
setlocal EnableExtensions EnableDelayedExpansion
set "BUILD_ROOT=%~dp0"
cd /d "%BUILD_ROOT%"

set "QUIET=0"
set "RUN=0"
set "DEMO=0"
set "TARGET=core"
if /i "%SILENT%"=="1" set "QUIET=1"
:args
if "%~1"=="" goto args_done
if /i "%~1"=="/s" (set "QUIET=1") else if /i "%~1"=="--silent" (set "QUIET=1") else if /i "%~1"=="--run" (set "RUN=1") else if /i "%~1"=="--demo" (set "DEMO=1") else if /i "%~1"=="--backup-bootstrap-helper" (set "TARGET=backup-bootstrap-helper") else if /i "%~1"=="--supervisor" (set "TARGET=supervisor") else if /i "%~1"=="--deploy-assistant" (set "TARGET=deploy-assistant") else if /i "%~1"=="--build-companion" (set "TARGET=build-companion") else (
  echo Unknown build option.
  exit /b 2
)
shift
goto args
:args_done
set "RC=0"
if "%TARGET%"=="build-companion" (
  call "%BUILD_ROOT%build-companion\package.bat"
  set "RC=!errorlevel!"
  goto done
)
if "%TARGET%"=="deploy-assistant" (
  call "%BUILD_ROOT%deploy-assistant\build.bat" notest
  set "RC=!errorlevel!"
  goto done
)
if "%DEMO%"=="1" goto demo

echo.
echo [1/5] Checking for Docker
where docker >nul 2>&1
if errorlevel 1 (
  echo Docker is not installed. Starting the dependency installer.
  if "%QUIET%"=="1" (call "%BUILD_ROOT%download-dependencies.bat" /s) else (call "%BUILD_ROOT%download-dependencies.bat")
  if errorlevel 1 ( set "RC=3" & echo The dependency installer did not finish. & goto done )
  if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;!PATH!"
  where docker >nul 2>&1
  if errorlevel 1 ( set "RC=3" & echo Docker was installed but is not on PATH yet. Sign out and in, then run build.bat again. & goto done )
)
docker version >nul 2>&1
if not errorlevel 1 goto docker_ready
echo Docker is installed but not running. Starting Docker Desktop.
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a TRIES=0
:wait_docker
ping -n 6 127.0.0.1 >nul
docker version >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a TRIES+=1
if !TRIES! lss 36 goto wait_docker
set "RC=3"
echo Docker did not start within 3 minutes.
goto done
:docker_ready
if "%TARGET%"=="backup-bootstrap-helper" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%BUILD_ROOT%build\build-backup-bootstrap.ps1"
  set "RC=!errorlevel!"
  goto done
)
if "%TARGET%"=="supervisor" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%BUILD_ROOT%build\build-supervisor.ps1"
  set "RC=!errorlevel!"
  goto done
)
rem An explicit release number stamps only this source copy. The release caller
rem supplies an immutable source revision when building an exported checkout.
if defined HA_BUILD_NUMBER (
  powershell -NoProfile -Command "if ($env:HA_BUILD_NUMBER -notmatch '^[0-9]+$') { exit 1 }"
  if errorlevel 1 (set "RC=4" & echo HA_BUILD_NUMBER must contain digits only. & goto done)
  docker run --rm -v "%CD%:/src" -w /src python:3.14.0-slim python scripts/ci/set-versions.py "%HA_BUILD_NUMBER%"
  if errorlevel 1 (set "RC=4" & echo Version stamping did not finish. & goto done)
)
set "SOURCE_REVISION=local"
if defined HA_BUILD_SOURCE (
  powershell -NoProfile -Command "if ($env:HA_BUILD_SOURCE -notmatch '^[a-f0-9]{40}$') { exit 1 }"
  if errorlevel 1 (set "RC=4" & echo HA_BUILD_SOURCE must be a full source revision. & goto done)
  set "SOURCE_REVISION=%HA_BUILD_SOURCE%"
)
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content versions.json -Raw | ConvertFrom-Json).core"`) do set "CORE_BASE=%%V"
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content versions.json -Raw | ConvertFrom-Json).core_base_image"`) do set "BASE_IMAGE=%%V"
if "%CORE_BASE%"=="" ( set "RC=4" & echo Could not read versions.json. & goto done )
set "CORE_VERSION=%CORE_BASE%"
if defined HA_BUILD_NUMBER set "CORE_VERSION=%CORE_BASE%.%HA_BUILD_NUMBER%"
set "ARCH=amd64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=aarch64"
if defined HA_BUILD_MACHINE (
  powershell -NoProfile -Command "$v=Get-Content versions.json -Raw | ConvertFrom-Json; if ($v.machines.($env:ARCH) -notcontains $env:HA_BUILD_MACHINE) { exit 1 }"
  if errorlevel 1 (set "RC=4" & echo HA_BUILD_MACHINE is not supported on this processor. & goto done)
)
echo Docker is ready. Core %CORE_BASE%, processor %ARCH%.

echo.
echo [2/5] Building the frontend wheel (English only; release builds add all languages)
del /q core\home_assistant_frontend-*.whl >nul 2>&1
docker build -f build/frontend.Dockerfile --output type=local,dest=core frontend
if errorlevel 1 ( set "RC=!errorlevel!" & echo The frontend build failed. & goto done )
if not exist core\home_assistant_frontend-*.whl ( set "RC=5" & echo The frontend build produced no wheel. & goto done )

echo.
echo [3/5] Collecting integration translations for core %CORE_BASE%
set "TDIR=%TEMP%\ham-translations-%RANDOM%"
docker build -f build/translations.Dockerfile --build-arg CORE_BASE=%CORE_BASE% --output "type=local,dest=%TDIR%" build
if errorlevel 1 ( set "RC=!errorlevel!" & echo Collecting translations failed. & goto done )
tar -xf "%TDIR%\translations.tar" -C core\homeassistant
if errorlevel 1 ( set "RC=!errorlevel!" & echo Unpacking translations failed. & goto done )
rmdir /s /q "%TDIR%" >nul 2>&1

echo.
echo [4/5] Building the container image home-assistant-material:local
> core\rootfs\OFFICIAL_IMAGE echo %SOURCE_REVISION%;manual;build.bat
docker build core --build-arg BUILD_FROM=ghcr.io/home-assistant/%ARCH%-homeassistant-base:%BASE_IMAGE% --label io.hass.arch=%ARCH% --label io.hass.version=%CORE_VERSION% --label org.opencontainers.image.revision=%SOURCE_REVISION% --tag home-assistant-material:local
set "BUILD_RC=!errorlevel!"
del /q core\rootfs\OFFICIAL_IMAGE >nul 2>&1
if not "%BUILD_RC%"=="0" ( set "RC=%BUILD_RC%" & echo The container image build failed. & goto done )
if defined HA_BUILD_MACHINE (
  docker build core/machine --file "core/machine/%HA_BUILD_MACHINE%" --build-arg BUILD_FROM=home-assistant-material:local --tag home-assistant-material:machine-local
  if errorlevel 1 (set "RC=!errorlevel!" & echo The machine image build failed. & goto done)
)

echo.
echo [5/5] Result
docker image inspect home-assistant-material:local --format "Built {{.Id}}"
if errorlevel 1 ( set "RC=!errorlevel!" & echo The image is missing after the build. & goto done )
if defined HA_BUILD_MACHINE (
  docker image inspect home-assistant-material:machine-local --format "Built machine image {{.Id}}"
  if errorlevel 1 (set "RC=!errorlevel!" & goto done)
)
if "%RUN%"=="0" goto done
if not exist config mkdir config
rem Docker rejects an occupied name or port without replacing another installation.
docker run -d --name home-assistant-material -p 127.0.0.1:8123:8123 -v "%CD%\config:/config" home-assistant-material:local
if errorlevel 1 ( set "RC=!errorlevel!" & echo The container did not start. & goto done )
echo Waiting for http://localhost:8123 ...
set /a TRIES=0
:wait_ha
ping -n 3 127.0.0.1 >nul
curl.exe -fsS -o NUL http://localhost:8123/manifest.json >nul 2>&1
if not errorlevel 1 (
  echo Home Assistant Material is running at http://localhost:8123
  if "%QUIET%"=="0" start "" http://localhost:8123
  goto done
)
set /a TRIES+=1
if !TRIES! lss 90 goto wait_ha
set "RC=6"
echo The container started but did not answer within 3 minutes. See: docker logs home-assistant-material
goto done

:demo
where node >nul 2>&1 || (set "RC=3" & echo Node.js is required to build the demo. & goto done)
where pnpm >nul 2>&1 || (set "RC=3" & echo pnpm is required to build the demo. & goto done)
if not defined DEMO_BASE_PATH set "DEMO_BASE_PATH=/home-assistant-material/demo"
if not defined HA_BUILD_WORKERS set "HA_BUILD_WORKERS=2"
if not defined NODE_OPTIONS set "NODE_OPTIONS=--max_old_space_size=6144"
set "SKIP_FETCH_NIGHTLY_TRANSLATIONS=1"
set "HUSKY=0"
pushd frontend
if not exist node_modules\.bin\gulp.cmd (
  call pnpm install --frozen-lockfile
  if errorlevel 1 (set "RC=!errorlevel!" & popd & goto done)
)
call node_modules\.bin\gulp.cmd build-demo-pages
set "RC=!errorlevel!"
popd

:done
echo.
if "%RC%"=="0" (echo Build finished.) else (echo Build did not finish. Exit code %RC%.)
if "%QUIET%"=="0" pause
exit /b %RC%
