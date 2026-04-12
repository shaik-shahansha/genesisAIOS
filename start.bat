@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "COMPOSE_FILE=docker\docker-compose.yml"
set "APP_URL=http://localhost:3000"
set "DOCKER_EXE="
set "DOCKER_DIR="
set "STATUS="
set "RUNNING=0"

for /f "delims=" %%P in ('where docker 2^>nul') do (
    if not defined DOCKER_EXE set "DOCKER_EXE=%%P"
)

if not defined DOCKER_EXE if exist "C:\Program Files\Docker\Docker\resources\bin\docker.exe" (
    set "DOCKER_EXE=C:\Program Files\Docker\Docker\resources\bin\docker.exe"
)

if not defined DOCKER_EXE (
    echo Docker was not found.
    echo Install Docker Desktop or add docker.exe to PATH, then try again.
    pause
    exit /b 1
)

for %%I in ("%DOCKER_EXE%") do set "DOCKER_DIR=%%~dpI"
if defined DOCKER_DIR set "PATH=%DOCKER_DIR%;%PATH%"

if not exist "%COMPOSE_FILE%" (
    echo Missing compose file: %COMPOSE_FILE%
    pause
    exit /b 1
)

"%DOCKER_EXE%" inspect -f "{{.State.Running}}" genesis-daemon 2>nul | findstr /I /C:"true" >nul && set "RUNNING=1"
"%DOCKER_EXE%" inspect -f "{{.State.Running}}" genesis-ollama 2>nul | findstr /I /C:"true" >nul && set "RUNNING=1"

if "%RUNNING%"=="1" (
    echo Genesis OS is already running.
    choice /C YN /N /M "Restart the active session? [Y/N]: "
    echo.
    if errorlevel 2 goto open_existing
    echo Restarting Genesis OS...
    "%DOCKER_EXE%" compose -f "%COMPOSE_FILE%" down
    if errorlevel 1 (
        echo Failed to stop the current Genesis OS session.
        pause
        exit /b 1
    )
)

echo Starting Genesis OS...
"%DOCKER_EXE%" compose -f "%COMPOSE_FILE%" up --build -d
if errorlevel 1 (
    echo Failed to start Genesis OS.
    pause
    exit /b 1
)

call :wait_for_daemon
if errorlevel 1 (
    echo Genesis OS started, but the daemon did not become healthy in time.
    echo You can still check it manually at %APP_URL%
    pause
    exit /b 1
)

goto open_existing

:wait_for_daemon
echo Waiting for Genesis OS to become ready...
for /L %%I in (1,1,90) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%APP_URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 exit /b 0
    <nul set /p =.
    >nul ping 127.0.0.1 -n 3
)
echo.
exit /b 1

:open_existing
echo Opening Genesis OS in your browser...
start "" "%APP_URL%"
echo Genesis OS is available at %APP_URL%
exit /b 0
