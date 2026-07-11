#!/bin/bash

# GeoMoz-Explorer FastAPI startup script with GEE service account authentication

set -e

cd "$(dirname "$0")"

# Activate virtual environment
. .venv/bin/activate

echo "📡 Starting GeoMoz-Explorer FastAPI server..."
echo ""

# Read service account JSON from file and set as environment variable
if [ ! -f "service-account-key.json" ]; then
    echo "❌ Error: service-account-key.json not found!"
    echo "Please ensure the service account credentials file is in the project root."
    exit 1
fi

SERVICE_ACCOUNT_JSON=$(python3 -c "import json; print(json.dumps(json.load(open('service-account-key.json'))))")

export GEE_SERVICE_ACCOUNT_KEY="$SERVICE_ACCOUNT_JSON"
export GEE_PROJECT_ID="eengine-project"

echo "✓ GEE Service Account configured"
echo "✓ Project ID: eengine-project"
echo ""
echo "🚀 FastAPI running on http://localhost:5003"
echo "📝 API docs: http://localhost:5003/docs"
echo ""

uvicorn geomoz-explorer.api:app --host 0.0.0.0 --port 5003 --reload
