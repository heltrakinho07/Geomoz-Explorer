@echo off
REM Build script for GeoMoz Desktop application on Windows
REM This script builds the frontend and then packages the Electron app

echo ==========================================
echo Building GeoMoz Desktop Application
echo ==========================================

REM Get script directory
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..

REM Step 1: Build frontend React
echo.
echo Step 1: Building frontend React...
cd %PROJECT_ROOT%\artifacts\geomoz-react
call pnpm build

REM Step 2: Install Electron dependencies
echo.
echo Step 2: Installing Electron dependencies...
cd %SCRIPT_DIR%
call pnpm install

REM Step 3: Build Electron app
echo.
echo Step 3: Building Electron app...
call pnpm build

echo.
echo ==========================================
echo Build complete! Installers are in dist\
echo ==========================================
pause
