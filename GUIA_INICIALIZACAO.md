# GeoMoz Explorer — Guia de Inicialização

Plataforma de geociência e exploração mineral para Moçambique
(geologia · análises espectrais · terreno · bacias hidrográficas · targeting mineral).

A aplicação tem **dois componentes**:

| Componente | O que é | Porta |
|------------|---------|-------|
| **Backend** | API FastAPI + Google Earth Engine (Python) | `5003` |
| **Frontend** | Interface React/Vite — em **web** (navegador) ou **desktop** (Electron) | `3000` (web) |

> O frontend **não funciona sozinho** — precisa sempre do backend a correr para
> os mapas GEE (geologia, bacias, índices, etc.).

---

## ⚡ Arranque rápido (recomendado)

Foi criado um script único: **`start-geomoz.sh`**

```bash
./start-geomoz.sh            # backend + frontend WEB (dev, recarrega ao vivo) → http://localhost:3000
./start-geomoz.sh desktop    # backend + app DESKTOP (Electron)
./start-geomoz.sh backend    # só o backend (API + GEE)
./start-geomoz.sh stop       # para tudo
```

- O script **arranca o backend automaticamente** (se ainda não estiver a correr) e mostra se o GEE conectou.
- Logs: `/tmp/geomoz-backend.log`, `/tmp/geomoz-web.log`, `/tmp/geomoz-desktop.log`.

### Para verificar alterações de código
- **Web (`./start-geomoz.sh`)** → reflete o **código-fonte ao vivo** (hot-reload). Ideal para testar mudanças rapidamente.
- **Desktop** → usa o frontend **já compilado e empacotado**. Depois de mexeres no código React tens de **reconstruir** (ver secção *Reconstruir* abaixo).

---

##  Pré-requisitos

- **Python 3.12** com ambiente virtual em `.venv/` (já existe)
- **Node.js 24** via nvm (`~/.nvm/versions/node/v24.13.1`) — Vite 7 exige Node ≥ 20
- **pnpm** (gestor de pacotes do workspace)
- **`service-account-key.json`** na raiz do projeto (credenciais GEE) — **nunca commitar**

---

## 🔧 Arranque manual (passo a passo)

### 1. Backend (FastAPI + GEE) — porta 5003
```bash
cd /home/helder-gt-traquinho/Documentos/Programacao/GeoMoz-Explorer
export GEE_SERVICE_ACCOUNT_KEY="$(python3 -c "import json;print(json.dumps(json.load(open('service-account-key.json'))))")"
export GEE_PROJECT_ID="eengine-project"
export CORS_ORIGINS="*"
.venv/bin/uvicorn geomoz-explorer.api:app --host 0.0.0.0 --port 5003
# (acrescenta --reload para recarregar ao editar Python)
```
Disponível em: API `http://localhost:5003` · Docs `http://localhost:5003/docs`

### 2a. Frontend WEB (dev) — porta 3000
```bash
export PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH"
cd artifacts/geomoz-react
PORT=3000 BASE_PATH=/ pnpm dev
```
Abre **http://localhost:3000**.

### 2b. Frontend DESKTOP (Electron)
```bash
cd electron-app
unset ELECTRON_RUN_AS_NODE
./dist/linux-unpacked/geomoz-desktop --no-sandbox
```

---

## 🔁 Reconstruir o frontend para o desktop

Sempre que mudares o código React e quiseres ver no **app desktop**:
```bash
export PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH"
cd artifacts/geomoz-react
BASE_PATH=./ PORT=3000 npx vite build --config vite.config.ts
# copiar o build para dentro do app desktop:
rm -rf ../../electron-app/dist/linux-unpacked/resources/frontend/dist
mkdir -p ../../electron-app/dist/linux-unpacked/resources/frontend/dist
cp -r dist/public/. ../../electron-app/dist/linux-unpacked/resources/frontend/dist/
```
> `BASE_PATH=./` é obrigatório no desktop (carrega via `file://`, precisa de caminhos relativos).

Para gerar **instaladores** (`.AppImage` / `.deb`):
```bash
cd electron-app && pnpm run build:linux   # (build:win / build:mac p/ outras plataformas)
```

---

## ✅ Verificações úteis

```bash
# Backend vivo + GEE conectado?
curl -s http://localhost:5003/geomoz-api/gee/status | python3 -m json.tool

# Frontend web a responder?
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

---

## 🩺 Problemas comuns

| Sintoma | Causa / Solução |
|---------|-----------------|
| Mapas GEE vazios, erros de rede | Backend não está a correr → `./start-geomoz.sh backend` |
| `GEE offline` na app | `service-account-key.json` em falta ou inválido na raiz |
| Vite falha (`crypto.hash is not a function`) | Node antigo → usa Node 24 (`PATH` com nvm v24.13.1) |
| `PORT environment variable is required` | Faltou `PORT=3000` (e `BASE_PATH`) no comando do Vite |
| App desktop com ecrã branco | Frontend não reconstruído/copiado, ou construído sem `BASE_PATH=./` |
| Localização (GPS) não funciona | Permissão negada no navegador, ou PC sem GPS (usa Wi-Fi/IP, menos preciso) |

---

## 🗺️ Funcionalidades recentes (para verificar)

- **Ferramentas de mapa** (todos os mapas, canto inferior direito): 📍 localização GPS em tempo real, coordenadas ao vivo + zoom (com copiar), ⛶ ecrã inteiro.
- **Hidrografia → Explorar Bacias**: agora funcional (fonte HydroATLAS).
- **Hidrografia → Relatório de Bacia**: índices de risco (erosão/cheia/hidrogeológico) agora **distintos por bacia** (corrigido).


