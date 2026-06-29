#!/bin/bash

# Setup script for backend Python environment
# This script creates a virtual environment and installs dependencies

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../geomoz-explorer" && pwd)"
VENV_DIR="$BACKEND_DIR/venv"

echo "Setting up backend environment..."
echo "Backend directory: $BACKEND_DIR"
echo "Virtual environment: $VENV_DIR"

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate virtual environment and install dependencies
echo "Installing dependencies..."
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r "$BACKEND_DIR/requirements.txt"

echo "Backend setup complete!"
echo "To activate the virtual environment, run: source $VENV_DIR/bin/activate"
