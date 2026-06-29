#!/bin/bash

# Build script for GeoMoz Desktop application
# This script builds the frontend and then packages the Electron app

set -e

echo "=========================================="
echo "Building GeoMoz Desktop Application"
echo "=========================================="

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Step 1: Build frontend React
echo ""
echo "Step 1: Building frontend React..."
cd "$PROJECT_ROOT/artifacts/geomoz-react"
pnpm build

# Step 2: Install Electron dependencies
echo ""
echo "Step 2: Installing Electron dependencies..."
cd "$SCRIPT_DIR"
pnpm install

# Step 3: Build Electron app
echo ""
echo "Step 3: Building Electron app..."
pnpm build

echo ""
echo "=========================================="
echo "Build complete! Installers are in dist/"
echo "=========================================="
