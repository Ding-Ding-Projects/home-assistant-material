@echo off
rem Builds the Home Assistant Material Deploy Assistant on Windows.
rem
rem   build.bat            install, test, and make the installer in out\make
rem   build.bat run        install, test, and start the app from source
rem   build.bat notest     skip the tests (they are quick; use only when you must)
rem   build.bat clean      remove node_modules and out first
rem
rem Missing tools (Node.js, Git, Python) are installed with Chocolatey, which is installed first
rem if needed. Nothing is code-signed. The installer is out\make\squirrel.windows\x64\HAM-Deploy-Assistant-Setup.exe.

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

rem Every tool this build needs is installed automatically with Chocolatey when it is missing:
rem Node.js LTS (with npm), Git and Python. Chocolatey itself is installed first if it is not
rem there. Installing needs administrator rights, so Windows asks once.
call :need node "Node.js 20 or newer" nodejs-lts
if errorlevel 1 exit /b 1
for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 20 (
  echo Node.js %NODE_MAJOR% is too old. Upgrading Node.js LTS with Chocolatey...
  call :choco upgrade nodejs-lts
  if errorlevel 1 exit /b 1
  for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
)
if %NODE_MAJOR% LSS 20 (
  echo Node.js is still %NODE_MAJOR% after the upgrade. Stopping; nothing was built.
  exit /b 1
)
call :need git "Git" git
if errorlevel 1 exit /b 1
call :need python "Python 3" python
if errorlevel 1 exit /b 1
echo Using Node.js %NODE_MAJOR%, npm, Git and Python.

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

:need
rem :need program "what it is" chocolatey-package
if /i "%~1"=="python" goto :needpy
where %~1 >nul 2>nul
if not errorlevel 1 exit /b 0
goto :needinstall
:needpy
rem The Microsoft Store placeholder answers to "python" but is not Python, so ask it to run.
python -c "import sys" >nul 2>nul && exit /b 0
:needinstall
echo %~2 was not found. Installing it with Chocolatey...
call :choco install %~3
if errorlevel 1 exit /b 1
if /i "%~1"=="python" (python -c "import sys" >nul 2>nul) else (where %~1 >nul 2>nul)
if errorlevel 1 (
  echo %~2 was installed but is still not found. Open a new window and run build.bat again.
  exit /b 1
)
exit /b 0

:choco
rem :choco install|upgrade package. Installs Chocolatey first when it is missing, runs as
rem administrator through one Windows prompt, then reloads PATH so this window can use the result.
set "CHOCO_OP=%~1"
set "CHOCO_PKG=%~2"
set "CHOCO_LOG=%TEMP%\ham-choco-%RANDOM%.log"
set "CHOCO_PS=%TEMP%\ham-choco-%RANDOM%.ps1"
> "%CHOCO_PS%" echo $ErrorActionPreference = 'Stop'
>> "%CHOCO_PS%" echo try {
>> "%CHOCO_PS%" echo   if (-not (Get-Command choco -ErrorAction SilentlyContinue) -and -not (Test-Path "$env:ProgramData\chocolatey\bin\choco.exe")) {
>> "%CHOCO_PS%" echo     'Installing Chocolatey from community.chocolatey.org'
>> "%CHOCO_PS%" echo     Set-ExecutionPolicy Bypass -Scope Process -Force
>> "%CHOCO_PS%" echo     [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
>> "%CHOCO_PS%" echo     Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
>> "%CHOCO_PS%" echo   }
>> "%CHOCO_PS%" echo   $choco = "$env:ProgramData\chocolatey\bin\choco.exe"
>> "%CHOCO_PS%" echo   ^& $choco %CHOCO_OP% %CHOCO_PKG% -y --no-progress
>> "%CHOCO_PS%" echo   if ($LASTEXITCODE -notin 0, 1641, 3010) { throw "choco %CHOCO_OP% %CHOCO_PKG% ended with $LASTEXITCODE" }
>> "%CHOCO_PS%" echo   'OK'
>> "%CHOCO_PS%" echo } catch { 'FAILED: ' + $_.Exception.Message }
powershell -NoProfile -Command "try { Start-Process powershell -Verb RunAs -Wait -WindowStyle Normal -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-Command','& ''%CHOCO_PS%'' *> ''%CHOCO_LOG%''') } catch { exit 5 }"
if errorlevel 5 (
  echo The administrator prompt was cancelled. Nothing was installed and nothing was built.
  del "%CHOCO_PS%" >nul 2>nul
  exit /b 1
)
type "%CHOCO_LOG%" 2>nul
findstr /b /c:"OK" "%CHOCO_LOG%" >nul 2>nul
if errorlevel 1 (
  echo Chocolatey could not %CHOCO_OP% %CHOCO_PKG%. The lines above say why. Nothing was built.
  del "%CHOCO_PS%" "%CHOCO_LOG%" >nul 2>nul
  exit /b 1
)
del "%CHOCO_PS%" "%CHOCO_LOG%" >nul 2>nul
for /f "usebackq tokens=*" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"
exit /b 0

:help
echo build.bat            install, test, and make the installer in out\make
echo build.bat run        install, test, and start the app from source
echo build.bat notest     skip the tests
echo build.bat clean      remove node_modules and out first
exit /b 0
