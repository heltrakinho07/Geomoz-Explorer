FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /app
COPY services/geomoz-gempy/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY geomoz-explorer/geological_model.py geomoz-explorer/geological_store.py ./
COPY services/geomoz-gempy/engine.py services/geomoz-gempy/service.py ./
COPY services/geomoz-gempy/LICENSE ./LICENSE
RUN useradd --uid 10001 --create-home worker
USER worker
CMD ["sh", "-c", "exec uvicorn service:app --host 0.0.0.0 --port ${PORT:-8080}"]
