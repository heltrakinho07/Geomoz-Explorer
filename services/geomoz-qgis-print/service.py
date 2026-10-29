"""Local-only authenticated HTTP façade for the PyQGIS print worker.

Never expose directly to the internet. Terminate HTTPS, verify the user's
Firebase identity and enforce per-user quotas at an independent trusted gateway.
No browser token or untrusted external URLs are included in print jobs.
"""
from __future__ import annotations
import hmac
import json
import os
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from job import MAX_REQUEST_BYTES, InvalidJob, parse_request

PORT = int(os.environ.get("GEOMOZ_PRINT_PORT", "8085"))
TOKEN = os.environ.get("GEOMOZ_PRINT_WORKER_TOKEN", "")
_MAX_CONCURRENT = threading.BoundedSemaphore(value=1)

class Handler(BaseHTTPRequestHandler):
    server_version = "GeoMozQGISPrint/1"
    def _error(self, status: int, message: str):
        payload = json.dumps({"error": message}, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path != "/health":
            return self._error(404, "Rota não encontrada.")
        payload = b'{"status":"ok","engine":"PyQGIS"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if self.path != "/v1/print/pdf":
            return self._error(404, "Rota não encontrada.")
        auth = self.headers.get("Authorization", "")
        if not TOKEN or not hmac.compare_digest(auth, "Bearer " + TOKEN):
            return self._error(401, "Credenciais do serviço inválidas.")
        length_str = self.headers.get("Content-Length", "")
        if not length_str.isdigit() or not 0 < int(length_str) <= MAX_REQUEST_BYTES:
            return self._error(413, "Pedido excede o tamanho permitido.")
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            return self._error(415, "Envie application/json.")
        if not _MAX_CONCURRENT.acquire(blocking=False):
            return self._error(429, "Servidor ocupado. Repita a impressão.")
        try:
            try:
                job = parse_request(self.rfile.read(int(length_str)))
            except InvalidJob as exc:
                return self._error(422, str(exc))
            with tempfile.TemporaryDirectory(prefix="geomoz-qgis-print-") as directory:
                source = Path(directory) / "job.json"
                output = Path(directory) / "mapa.pdf"
                source.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
                try:
                    result = subprocess.run(
                        [sys.executable, str(Path(__file__).with_name("render.py")), str(source), str(output)],
                        capture_output=True, timeout=90, check=False,
                        env={**os.environ, "QT_QPA_PLATFORM": "offscreen"},
                    )
                except subprocess.TimeoutExpired:
                    return self._error(504, "A impressão excedeu o tempo de processamento.")
                if result.returncode != 0 or not output.is_file():
                    self.log_error("QGIS rendering failed: %s", result.stderr.decode(errors="replace")[:400])
                    return self._error(500, "Não foi possível gerar o PDF cartográfico.")
                pdf = output.read_bytes()
                if not pdf.startswith(b"%PDF-") or len(pdf) > 32 * 1024 * 1024:
                    return self._error(500, "O resultado de impressão não é um PDF válido.")
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Disposition", 'attachment; filename="geomoz-mapa.pdf"')
                self.send_header("Content-Length", str(len(pdf)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(pdf)
        finally:
            _MAX_CONCURRENT.release()

if __name__ == "__main__":
    if len(TOKEN) < 32:
        raise SystemExit("GEOMOZ_PRINT_WORKER_TOKEN obrigatório (mínimo 32 caracteres).")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"GeoMoz PyQGIS print worker listening on container port {PORT}", flush=True)
    server.serve_forever(poll_interval=0.5)
