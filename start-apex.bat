@echo off
title Apex POS — Starting Services
cd /d "%~dp0"

echo ========================================
echo   Apex POS — Starting All Services
echo ========================================
echo.

:: Check Docker / PostgreSQL
echo [1/4] Checking PostgreSQL...
docker compose up -d 2>nul
if %errorlevel% neq 0 (
    echo WARNING: Docker not running. Start Docker Desktop first.
    echo Waiting 10 seconds...
    timeout /t 10 /nobreak >nul
    docker compose up -d
)
echo       PostgreSQL OK
echo.

:: Start API server
echo [2/4] Starting API server (port 3000)...
start "Apex API" cmd /k "cd /d %~dp0 && pnpm dev"
echo       API starting...
echo.

:: Wait for API to be ready
echo [3/4] Waiting for API to be ready...
:wait_api
timeout /t 2 /nobreak >nul
curl -s http://localhost:3000/health >nul 2>&1
if %errorlevel% neq 0 goto wait_api
echo       API ready at http://localhost:3000
echo.

:: Start Web app
echo [4/4] Starting Web app (port 3001)...
start "Apex Web" cmd /k "cd /d %~dp0\apps\web && pnpm dev"
echo       Web starting...
echo.

:: Wait for Web to be ready
:wait_web
timeout /t 2 /nobreak >nul
curl -s http://localhost:3001 >nul 2>&1
if %errorlevel% neq 0 goto wait_web
echo       Web ready at http://localhost:3001
echo.

echo ========================================
echo   All services running!
echo.
echo   API:  http://localhost:3000
echo   Web:  http://localhost:3001
echo   DB:   localhost:5433
echo.
echo   Admin: admin@apex.com / admin12345
echo ========================================
echo.
echo Press any key to open the web dashboard...
pause >nul
start http://localhost:3001
