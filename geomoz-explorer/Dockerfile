# ============================================================================
#  GeoMoz Explorer — Backend Dockerfile
#  Target: Railway.app (or any Docker-compatible host)
#  Stack:  Python 3.11-slim + FastAPI + GDAL/GEOS + GEE
#
#  Single-stage build to avoid ABI mismatch between stages.
# ============================================================================

FROM python:3.11-slim

# ── Environment ──────────────────────────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5003

# ── System dependencies (GDAL, GEOS, PROJ for geopandas/shapely) ────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils \
    libproj-dev \
    proj-bin \
    proj-data \
    libgeos-dev \
    libgdal-dev \
    gdal-bin \
    gfortran \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

ENV CPLUS_INCLUDE_PATH=/usr/include/gdal \
    C_INCLUDE_PATH=/usr/include/gdal

# ── Python dependencies ─────────────────────────────────────────────────────
WORKDIR /app

COPY requirements-api.txt requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Application code ────────────────────────────────────────────────────────
COPY api.py .
COPY gee_module.py .
COPY gee_presets.py .
COPY utils/ utils/

# ── Health check ─────────────────────────────────────────────────────────────
# Uses Python to read the $PORT env var at runtime
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python3 -c "import os,urllib.request; p=os.environ.get('PORT','5003'); urllib.request.urlopen(f'http://127.0.0.1:{p}/geomoz-api/health')" || exit 1

# ── Start ────────────────────────────────────────────────────────────────────
RUN useradd -m appuser && chown -R appuser /app
USER appuser
CMD uvicorn api:app --host 0.0.0.0 --port $PORT
