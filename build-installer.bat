@echo off
rem Builds a flashable operating system image, the installer for this product.
rem
rem   build-installer.bat            VirtualBox and other virtual machines (board "ova")
rem   build-installer.bat rpi5-64    Raspberry Pi 5   (also rpi4-64, rpi3-64)
rem   /s, --silent or SILENT=1 run without pausing at the end
rem
rem The build runs inside a Docker container volume because it needs symbolic links
rem and a case-sensitive file system. It builds the committed source: commit first.
rem The first build takes several hours. Results land in dist\os with their SHA-256.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "QUIET=0"
set "BOARD=ova"
if /i "%SILENT%"=="1" set "QUIET=1"
:args
if "%~1"=="" goto args_done
if /i "%~1"=="/s" ( set "QUIET=1" ) else if /i "%~1"=="--silent" ( set "QUIET=1" ) else ( set "BOARD=%~1" )
shift
goto args
:args_done
set "RC=0"
set "DEFCONFIG="
if /i "%BOARD%"=="ova" set "DEFCONFIG=ova"
if /i "%BOARD%"=="rpi5-64" set "DEFCONFIG=rpi5_64"
if /i "%BOARD%"=="rpi4-64" set "DEFCONFIG=rpi4_64"
if /i "%BOARD%"=="rpi3-64" set "DEFCONFIG=rpi3_64"
if "%DEFCONFIG%"=="" ( set "RC=2" & echo Unknown board "%BOARD%". Use ova, rpi5-64, rpi4-64 or rpi3-64. & goto done )

echo.
echo [1/4] Checking for Docker
docker version >nul 2>&1
if errorlevel 1 ( set "RC=3" & echo Docker is not running. Run build.bat once, it installs and starts Docker. & goto done )

echo.
echo [2/4] Building the operating system build container
docker build --tag haos-builder operating-system
if errorlevel 1 ( set "RC=!errorlevel!" & echo The build container failed to build. & goto done )

echo.
echo [3/4] Building the %BOARD% image (several hours on the first run)
if not exist dist\os mkdir dist\os
del /q dist\os\haos_* >nul 2>&1
docker run --rm --privileged -e BUILDER_UID=1000 -e BUILDER_GID=1000 -v "%CD%:/repo:ro" -v ham-os-work:/work -v ham-os-cache:/cache -v "%CD%\dist\os:/out" haos-builder bash /repo/build/os-in-container.sh %DEFCONFIG%
if errorlevel 1 ( set "RC=!errorlevel!" & echo The operating system build failed. & goto done )

echo.
echo [4/4] Result
if not exist dist\os\haos_* ( set "RC=5" & echo The build finished without producing an image. & goto done )
for %%F in (dist\os\haos_*) do (
  echo %%~fF
  certutil -hashfile "%%~fF" SHA256 | findstr /v /c:"hash" /c:"CertUtil"
)

:done
echo.
if "%RC%"=="0" (echo Installer build finished.) else (echo Installer build did not finish. Exit code %RC%.)
if "%QUIET%"=="0" pause
exit /b %RC%
