# GeoMoz Explorer - Desktop Application

Versão desktop do GeoMoz Explorer baseada em Electron, com backend FastAPI local e armazenamento SQLite para funcionalidades offline.

## Estrutura

```
electron-app/
├── main.js              # Processo principal Electron
├── preload.js           # Script de preload para IPC
├── database.js          # SQLite database operations
├── export-utils.js      # Funções de exportação local
├── package.json         # Dependências e configuração
├── setup-backend.sh     # Script de setup do backend (Linux/Mac)
├── setup-backend.bat   # Script de setup do backend (Windows)
├── build.sh            # Script de build completo (Linux/Mac)
├── build.bat           # Script de build completo (Windows)
├── resources/          # Ícones e recursos
└── .gitignore          # Arquivos ignorados
```

## Funcionalidades

### ✅ Implementadas
- **Backend FastAPI local**: Executado automaticamente pelo Electron
- **Comunicação IPC**: Entre frontend React e processo Electron
- **SQLite Database**: Armazenamento local para:
  - Views salvas (configurações de mapa)
  - Cache de dados geoespaciais (offline)
  - Histórico de exportações
  - Configurações do usuário
- **Exportação Local**:
  - GeoJSON
  - CSV
  - Imagens (PNG/JPEG)
  - Configurações (JSON)
- **Diálogos Nativos**: Salvar/abrir arquivos
- **Acesso ao Sistema de Arquivos**: Leitura/escrita de arquivos

### 🔄 Em Desenvolvimento
- Exportação PDF (requer biblioteca adicional)
- Sincronização de dados offline/online
- Integração com QGIS/ArcGIS

## Instalação

### Pré-requisitos
- Node.js 18+
- Python 3.9+
- pnpm (para o frontend React)

### Setup do Backend

**Linux/Mac:**
```bash
cd electron-app
chmod +x setup-backend.sh
./setup-backend.sh
```

**Windows:**
```cmd
cd electron-app
setup-backend.bat
```

### Setup do Electron

```bash
cd electron-app
pnpm install
```

## Execução

### Modo Desenvolvimento

**Terminal 1 - Iniciar o frontend React:**
```bash
cd artifacts/geomoz-react
pnpm dev
```

**Terminal 2 - Iniciar o Electron:**
```bash
cd electron-app
pnpm dev
```

### Modo Produção

**Linux/Mac:**
```bash
cd electron-app
chmod +x build.sh
./build.sh
```

**Windows:**
```cmd
cd electron-app
build.bat
```

Os instaladores serão gerados na pasta `dist/`.

## Build para Distribuição

**Windows:**
```bash
pnpm build:win
```

**macOS:**
```bash
pnpm build:mac
```

**Linux:**
```bash
pnpm build:linux
```

## API Electron Disponível no Frontend

### Operações de Arquivo
```typescript
// Salvar arquivo
const result = await window.electronAPI.showSaveDialog({
  defaultPath: 'export.geojson',
  filters: [{ name: 'GeoJSON', extensions: ['geojson'] }]
});

// Ler arquivo
const data = await window.electronAPI.readFile(filePath);

// Escrever arquivo
await window.electronAPI.writeFile(filePath, content);
```

### Operações de Banco de Dados
```typescript
// Salvar view
const viewId = await window.electronAPI.dbSaveView({
  name: 'Minha Análise',
  province: 'Maputo',
  district: null,
  layers: { provinces: true, geology: true },
  colorBy: 'code2006'
});

// Listar views
const views = await window.electronAPI.dbGetViews();

// Cache de dados
await window.electronAPI.dbCacheData('provinces', 'all', geojsonData, 3600);
const cached = await window.electronAPI.dbGetCachedData('provinces', 'all');

// Configurações
await window.electronAPI.dbSetSetting('theme', 'dark');
const theme = await window.electronAPI.dbGetSetting('theme');
```

### Operações de Exportação
```typescript
// Exportar GeoJSON
await window.electronAPI.exportGeoJSON(geojsonData, 'mapa.geojson');

// Exportar CSV
await window.electronAPI.exportCSV(data, headers, 'dados.csv');

// Exportar imagem
await window.electronAPI.exportImage(imageBuffer, 'mapa.png');

// Exportar/importar configurações
await window.electronAPI.exportSettings(settings, 'config.json');
const imported = await window.electronAPI.importSettings();
```

### Backend URL
```typescript
const backendUrl = await window.electronAPI.getBackendUrl();
// Retorna: http://127.0.0.1:5003
```

## Variáveis de Ambiente

O backend usa as seguintes variáveis de ambiente (configuradas automaticamente pelo Electron):

- `CORS_ORIGINS`: Configurado para localhost
- `PORT`: 5003 (configurado pelo Electron)
- `GEE_SERVICE_ACCOUNT_KEY`: Deve ser configurado pelo usuário
- `GEE_PROJECT_ID`: Deve ser configurado pelo usuário

## Troubleshooting

### Backend não inicia

Verifique se o Python virtual environment foi criado corretamente:
```bash
cd geomoz-explorer
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate     # Windows
python -m uvicorn api:app --host 127.0.0.1 --port 5003
```

### Frontend não carrega

Certifique-se de que o frontend foi buildado ou está em modo dev:
```bash
cd artifacts/geomoz-react
pnpm dev  # modo dev
# ou
pnpm build  # modo produção
```

### Erro de better-sqlite3 (native module / NODE_MODULE_VERSION)

`better-sqlite3` é um módulo nativo e precisa ser compilado contra a ABI do
Electron (não a do Node do sistema). O script `postinstall` do `package.json`
executa `@electron/rebuild` automaticamente após cada `install`. Se precisar
rodá-lo manualmente:

```bash
cd electron-app
npm run postinstall          # ou: npx electron-rebuild -f -w better-sqlite3
```

#### Ambiente necessário para o rebuild (importante)

A ferramenta de build tem requisitos específicos neste projeto:

1. **`@electron/rebuild` exige Node ≥ 20.** O Node do sistema é 18, então use
   o Node 24 do nvm:
   ```bash
   export PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH"
   ```
2. **node-gyp falha com o Python do `.venv` do projeto.** Force o Python do
   sistema e remova o `.venv` do `PATH`:
   ```bash
   export npm_config_python=/usr/bin/python3
   ```
3. Comando completo de rebuild manual:
   ```bash
   cd electron-app
   env npm_config_python=/usr/bin/python3 \
     PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH" \
     npx electron-rebuild -f -w better-sqlite3
   ```

Se ocorrer `NODE_MODULE_VERSION` incompatível ao iniciar o app, o binding foi
compilado para a ABI errada — rode o comando acima novamente.

### Erro de CORS

O Electron configura automaticamente o CORS para o backend. Se ainda tiver problemas, verifique as variáveis de ambiente no `main.js`.

## Arquitetura

```
┌─────────────────────────────────────┐
│         Electron Main Process       │
│  ┌───────────────────────────────┐  │
│  │  FastAPI Backend (Python)     │  │
│  │  - Port 5003                  │  │
│  │  - GEE Integration            │  │
│  │  - Geospatial Processing      │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  SQLite Database              │  │
│  │  - Saved Views                │  │
│  │  - Cached Data                │  │
│  │  - Export History             │  │
│  │  - User Settings              │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  File System & Export Utils   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
                  ↕ IPC
┌─────────────────────────────────────┐
│      Renderer Process (React)       │
│  ┌───────────────────────────────┐  │
│  │  React Frontend               │  │
│  │  - Leaflet Maps               │  │
│  │  - GeoAnalyses                │  │
│  │  - HydroGeoMoz                │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Próximos Passos

1. Adicionar ícones da aplicação em `resources/`
2. Implementar exportação PDF com puppeteer
3. Adicionar sistema de atualização automática
4. Implementar sincronização cloud/local
5. Adicionar integração com softwares GIS externos
6. Criar instaladores assinados para Windows/Mac
