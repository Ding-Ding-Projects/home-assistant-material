@echo off
rem Builds the Home Assistant Material Deploy Assistant on Windows.
rem
rem   build.bat            install, test, and make the installer in out\make
rem   build.bat run        install, test, and start the app from source
rem   build.bat notest     skip the tests (they are quick; use only when you must)
rem   build.bat clean      remove node_modules and out first
rem
rem Nothing is code-signed. The installer is out\make\squirrel.windows\x64\HAM-Deploy-Assistant-Setup.exe.

setlocal EnableExtensions
cd /d "%~dp0"

set "DO_RUN="
set "DO_TEST=1"
set "DO_CLEAN="
for %%A in (%*) do (
  if /i "%%~A"=="run" set "DO_RUN=1"
  if /i "%%~A"=="notest" set "DO_TEST="
  if /i "%%~A"=="clean" set "DO_CLEAN=1"
  if /i "%%~A"=="help" goto :help
  if /i "%%~A"=="/?" goto :help
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 or newer from https://nodejs.org and run this again.
  exit /b 1
)
for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 20 (
  echo Node.js %NODE_MAJOR% is too old. Install Node.js 20 or newer from https://nodejs.org.
  exit /b 1
)

rem The renderer is built from the project page, so it must be beside this folder.
if not exist "..\docs\site\app.js" (
  echo ..\docs\site was not found. Run this from deploy-assistant inside a full checkout of the repository.
  exit /b 1
)

rem Make sure no signing certificate is ever picked up.
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "CSC_LINK="
set "CSC_KEY_PASSWORD="
set "WINDOWS_CERTIFICATE_FILE="
set "WINDOWS_CERTIFICATE_PASSWORD="

if defined DO_CLEAN (
  echo [1/4] Removing node_modules and out...
  if exist node_modules rmdir /s /q node_modules
  if exist out rmdir /s /q out
)

echo [1/4] Installing packages...
if exist package-lock.json (
  call npm ci --no-audit --no-fund
) else (
  call npm install --no-audit --no-fund
)
if errorlevel 1 goto :failed

if defined DO_TEST (
  echo [2/4] Running the tests...
  call npm test
  if errorlevel 1 goto :failed
) else (
  echo [2/4] Tests skipped because you asked. They have not run on this build.
)

echo [3/4] Building the window...
call npm run build
if errorlevel 1 goto :failed

if defined DO_RUN (
  echo [4/4] Starting the app...
  call npx electron .
  exit /b %errorlevel%
)

echo [4/4] Making the installer...
call npx electron-forge make --platform win32 --arch x64
if errorlevel 1 goto :failed

set "SETUP=out\make\squirrel.windows\x64\HAM-Deploy-Assistant-Setup.exe"
if not exist "%SETUP%" (
  echo The build finished but %SETUP% is missing.
  goto :failed
)
powershell -NoProfile -Command "$s = Get-AuthenticodeSignature -FilePath '%SETUP%'; if ($s.Status -ne 'NotSigned') { Write-Host ('The installer is ' + $s.Status + ', but it must not be signed.'); exit 1 }"
if errorlevel 1 goto :failed
powershell -NoProfile -Command "Get-FileHash -Algorithm SHA256 -Path '%SETUP%' | ForEach-Object { 'SHA-256 ' + $_.Hash.ToLower() }"

echo.
echo Done. The installer is %CD%\%SETUP%
echo It is not code-signed, so Windows SmartScreen asks once before it runs.
exit /b 0

:failed
echo.
echo The build stopped. The step above says why.
exit /b 1

:help
echo build.bat            install, test, and make the installer in out\make
echo build.bat run        install, test, and start the app from source
echo build.bat notest     skip the tests
echo build.bat clean      remove node_modules and out first
exit /b 0
