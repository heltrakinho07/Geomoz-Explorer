# Standalone GeoMoz PyQGIS worker: open-source QGIS rendering, not screenshots.
# Production must expose this only behind a trusted authenticated gateway.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive \
    QT_QPA_PLATFORM=offscreen \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/usr/share/qgis/python:/usr/lib/python3/dist-packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-qgis qgis-providers fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY job.py render.py service.py ./
RUN useradd -r -m -U --shell /usr/sbin/nologin geomoz && \
    mkdir -p /tmp/geomoz-print && chown geomoz:geomoz /tmp/geomoz-print
USER geomoz
EXPOSE 8085
CMD ["python3", "service.py"]
