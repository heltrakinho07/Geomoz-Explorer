# 🚂 GeoMoz Explorer — Deploy no Railway

Este documento descreve como fazer deploy do **GeoMoz Explorer** na plataforma [Railway.app](https://railway.app).

---

## 📋 Arquitetura

O projeto é composto por **2 serviços** no mesmo projeto Railway:

| Serviço | Diretório | Stack | URL exemplo |
|---------|-----------|-------|-------------|
| **Backend API** | `geomoz-explorer/` | FastAPI + GDAL + GEE | `https://backend.up.railway.app` |
| **Frontend Web** | `artifacts/geomoz-react/` | React + Vite (pnpm) | `https://frontend.up.railway.app` |

---

## 🚀 Passos para Deploy

### 1. Criar conta no Railway

Acede a [railway.app](https://railway.app) e regista-te (gratuito, $5 de crédito/mês).

### 2. Criar projeto e ligar GitHub

1. Clica **New Project** → **Deploy from GitHub repo**
2. Seleciona o repositório `heltrakinho07/GeoMoz-Explorer`
3. Railway detecta automaticamente o `railway.json` na raiz

### 3. Criar os 2 serviços

No dashboard do projeto:

**Service 1 — Backend:**
1. Clica **New Service** → **Add from GitHub** → mesmo repositório
2. Configura:
   - **Root Directory**: `geomoz-explorer`
   - **Build**: usa o `Dockerfile` automaticamente (configurado em `railway.json`)
3. Clica **Deploy**

**Service 2 — Frontend:**
1. Clica **New Service** → **Add from GitHub** → mesmo repositório
2. Configura:
   - **Root Directory**: `artifacts/geomoz-react`
3. Clica **Deploy**

> **Nota:** Railway pode pedir para definir as variáveis de ambiente antes do deploy. Podes configurá-las depois também.

### 4. Configurar Variáveis de Ambiente

#### Backend (`geomoz-explorer/`)

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `GEE_SERVICE_ACCOUNT_KEY` | ✅ | JSON completo da service account do Google Earth Engine | `{"type": "service_account", ...}` |
| `GEE_PROJECT_ID` | ✅ | ID do projecto GCP | `eengine-project` |
| `CORS_ORIGINS` | ✅ | Origens permitidas (separadas por vírgula) | `https://frontend.up.railway.app` |
| `DISABLE_RATE_LIMIT` | ❌ | Desativar rate limiting | `true` |

#### Frontend (`artifacts/geomoz-react/`)

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `PORT` | ✅ | Porta do servidor (Railway define automaticamente) | `3000` |
| `BASE_PATH` | ✅ | Caminho base para os assets | `/` |
| `VITE_API_BASE` | ❌ | URL base da API (apenas se frontend e backend estiverem em domínios diferentes) | `https://backend.up.railway.app` |

> **`VITE_API_BASE`:** Se ambos os serviços estiverem no mesmo domínio Railway (ex: ambas em `*.up.railway.app`), não precisas definir esta variável — a API usa caminhos relativos (`/geomoz-api/...`). Se colocares um domínio personalizado com rotas separadas, define `VITE_API_BASE` com o URL completo do backend.

### 5. Obter a Service Account do GEE

Se ainda não tens a chave:

1. Acede a [console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Cria ou seleciona a service account com papel **Earth Engine Resource Viewer**
3. Clica **Add Key** → **JSON** → descarrega o ficheiro
4. Copia o conteúdo JSON completo para a variável `GEE_SERVICE_ACCOUNT_KEY` no Railway

> ⚠️ A chave JSON tem ~2 KB. Cola diretamente no campo de variável de ambiente do Railway.

### 6. Verificar o deploy

Após o deploy:

- **Backend**: `https://backend.up.railway.app/geomoz-api/health` → `{"status": "ok", "version": "2.1.0"}`
- **Frontend**: `https://frontend.up.railway.app` → interface GeoMoz Explorer
- **GEE**: `https://backend.up.railway.app/geomoz-api/gee/status` → `{"connected": true, ...}`

---

## 🔄 Atualizações

Cada `git push` para o branch `main` faz automaticamente redeploy de ambos os serviços (configurado nos ficheiros `.github/workflows/`).

---

## 🐳 Docker (deploy local)

Para testar a imagem Docker localmente:

```bash
# Construir
docker build -t geomoz-backend -f geomoz-explorer/Dockerfile .

# Correr (com GEE key)
docker run -p 5003:5003 \
  -e GEE_SERVICE_ACCOUNT_KEY="$(cat service-account-key.json)" \
  -e GEE_PROJECT_ID=eengine-project \
  -e CORS_ORIGINS=* \
  geomoz-backend
```

---

## 💰 Custos estimados (Free Tier)

| Recurso | Limite Free Tier | Uso estimado do GeoMoz |
|---------|------------------|------------------------|
| Crédito | $5/mês | ~$1–2/mês (2 serviços × ~500h) |
| Horas | 500 h/mês | 720 h (2 serviços × 24h × 30d) |
| PostgreSQL | 1 instância (dev) | Não usado |

Para uso contínuo 24/7 com 2 serviços, considera o plano **Hobby** ($5/mês) ou **Pro** ($20/mês).

---

## 🆘 Troubleshooting

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| Backend health check falha | GEE não configurado | Verificar `GEE_SERVICE_ACCOUNT_KEY` |
| `ModuleNotFoundError: No module named 'geomoz'`| Pacote geomoz não disponível no PyPI | Contactar o autor do pacote ou incluir fonte no Dockerfile |
| Frontend não carrega | `PORT` ou `BASE_PATH` não definidos | Definir no Railway dashboard |
| CORS error no browser | Backend sem `CORS_ORIGINS` correta | Definir com o URL do frontend |
| Tiles GEE não aparecem | GEE service account não registada | Registar o email da SA em [code.earthengine.google.com](https://code.earthengine.google.com) → Assets → Service Accounts |

---

## 📁 Ficheiros de Configuração

| Ficheiro | Função |
|----------|--------|
| `railway.json` | Configuração raiz do projeto Railway |
| `geomoz-explorer/railway.json` | Config do serviço backend |
| `geomoz-explorer/Dockerfile` | Docker multi-stage para o backend |
| `geomoz-explorer/nixpacks.toml` | Alternativa Nixpacks (usar se Docker falhar) |
| `geomoz-explorer/requirements-api.txt` | Dependências Python de produção (sem streamlit) |
| `artifacts/geomoz-react/railway.json` | Config do serviço frontend |
| `.dockerignore` | Exclusões para o Docker build |
