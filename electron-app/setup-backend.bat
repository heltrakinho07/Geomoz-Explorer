@echo off
REM Setup script for backend Python environment on Windows
REM This script creates a virtual environment and installs dependencies

set BACKEND_DIR=%~dp0..\geomoz-explorer
set VENV_DIR=%BACKEND_DIR%\venv

echo Setting up backend environment...
echo Backend directory: %BACKEND_DIR%
echo Virtual environment: %VENV_DIR%

REM Create virtual environment if it doesn't exist
if not exist "%VENV_DIR%" (
    echo Creating virtual environment...
    python -m venv "%VENV_DIR%"
)

REM Activate virtual environment and install dependencies
echo Installing dependencies...
call "%VENV_DIR%\Scripts\activate.bat"
python -m pip install --upgrade pip
pip install -r "%BACKEND_DIR%\requirements.txt"

echo Backend setup complete!
echo To activate the virtual environment, run: %VENV_DIR%\Scripts\activate.bat
pause
