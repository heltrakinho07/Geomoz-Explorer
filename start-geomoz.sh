#!/bin/bash
# ============================================================================
#  GeoMoz Explorer — arranque unificado
#  Uso:
#     ./start-geomoz.sh            # backend + frontend web (dev, recarrega ao vivo)
#     ./start-geomoz.sh desktop    # backend + app desktop (Electron)
#     ./start-geomoz.sh backend    # só o backend (API + GEE)
#     ./start-geomoz.sh stop       # para tudo (backend, vite, desktop)
# ============================================================================
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"

NODE_BIN="$HOME/.nvm/versions/node/v24.13.1/bin"      # Node 24 (Vite 7 exige)
[ -d "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"

# ---------------------------------------------------------------------------
start_backend() {
  if curl -s -m 2 http://127.0.0.1:5003/geomoz-api/gee/status >/dev/null 2>&1; then
    echo "✓ Backend já está a correr em http://127.0.0.1:5003"
    return
  fi
  if [ ! -f "service-account-key.json" ]; then
    echo "❌ Falta service-account-key.json na raiz do projeto."; exit 1
  fi
  echo "📡 A iniciar backend FastAPI (porta 5003)…"
  export GEE_SERVICE_ACCOUNT_KEY="$(python3 -c "import json;print(json.dumps(json.load(open('service-account-key.json'))))")"
  export GEE_PROJECT_ID="eengine-project"
  export CORS_ORIGINS="*"
  nohup .venv/bin/uvicorn geomoz-explorer.api:app --host 0.0.0.0 --port 5003 \
        > /tmp/geomoz-backend.log 2>&1 &
  echo "   PID $! · log: /tmp/geomoz-backend.log"
  for i in $(seq 1 30); do
    curl -s -m 2 http://127.0.0.1:5003/geomoz-api/gee/status >/dev/null 2>&1 && break
    sleep 1
  done
  echo "✓ Backend pronto (GEE: $(curl -s http://127.0.0.1:5003/geomoz-api/gee/status | python3 -c 'import sys,json;print("conectado" if json.load(sys.stdin)["connected"] else "offline")'))"
}

start_web() {
  echo "🌐 A iniciar frontend web (Vite, porta 3000)…"
  ( cd artifacts/geomoz-react && PORT=3000 BASE_PATH=/ nohup pnpm dev > /tmp/geomoz-web.log 2>&1 & )
  sleep 4
  echo "✓ Web pronto → abre  http://localhost:3000"
}

start_desktop() {
  echo "🖥️  A iniciar app desktop (Electron)…"
  if [ ! -x electron-app/dist/linux-unpacked/geomoz-desktop ]; then
    echo "❌ App desktop não compilada. Corre primeiro:  cd electron-app && pnpm run build:linux"; exit 1
  fi
  ( cd electron-app; unset ELECTRON_RUN_AS_NODE VIRTUAL_ENV
    DISPLAY=${DISPLAY:-:0} setsid ./dist/linux-unpacked/geomoz-desktop --no-sandbox \
        > /tmp/geomoz-desktop.log 2>&1 < /dev/null & )
  sleep 5
  echo "✓ App desktop aberta."
}

stop_all() {
  echo "🛑 A parar serviços…"
  for pid in $(lsof -ti:5003 2>/dev/null); do kill "$pid" 2>/dev/null && echo "   backend $pid"; done
  for pid in $(lsof -ti:3000 2>/dev/null); do kill "$pid" 2>/dev/null && echo "   vite $pid"; done
  for pid in $(pgrep -f "linux-unpacked/geomoz-desktop" 2>/dev/null); do kill "$pid" 2>/dev/null && echo "   desktop $pid"; done
  echo "✓ Parado."
}

# ---------------------------------------------------------------------------
case "${1:-web}" in
  backend)  start_backend ;;
  desktop)  start_backend; start_desktop ;;
  stop)     stop_all ;;
  web|"")   start_backend; start_web
            echo; echo "👉  Abre  http://localhost:3000  no navegador." ;;
  *) echo "Uso: $0 [web|desktop|backend|stop]"; exit 1 ;;
esac
