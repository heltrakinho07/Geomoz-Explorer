# GeoMoz Product Hardening — P0/P1

Data: 2026-09-28  
Branch de trabalho: `feat/geomoz-p0-reliability`

## Objetivo

Transformar o GeoMoz de um conjunto rico de módulos geoespaciais em um produto
operacional, previsível e demonstrável. O foco inicial não é adicionar mais
índices; é fazer os fluxos existentes funcionarem de ponta a ponta, com estado,
erros, persistência e feedback consistentes.

## Estado observado no código

> "Presente no código" não significa "validado em produção". A classificação
> abaixo é uma auditoria estática do repositório e deve ser confirmada com testes
> E2E contra o deployment.

| Área | Estado estático | Observações |
| --- | --- | --- |
| Mapa / cartografia | Presente | Explorer, MapView, geologia, províncias, distritos e estatísticas existem |
| AOI | Integrado ao workspace | AOI é partilhado entre módulos e persistido/restaurado por projecto |
| GEE BYO | Parcial / P0 | Fluxo OAuth existe, mas havia falha crítica no inicializador e sessão apenas em memória |
| GeoAnalises | Presente, alto acoplamento | Página ~175 KB; precisa decomposição por feature |
| Hidrologia | Presente | Endpoints e UI para bacias, drenagem, rede fluvial e watershed |
| Água subterrânea | Presente | UI e fatores AHP presentes; precisa workflow de resultado/ranking persistente |
| Geoperigos | Presente | Flood e RUSLE expostos no backend/UI |
| GeoMoz AI | Agent foundation implementada | Ask GeoMoz usa Tool Registry determinístico; planner LLM é opcional e não executa código arbitrário |
| Autenticação GeoMoz | Presente | Firebase Auth |
| Testes | Presente | Pytest/Vitest existem; cobertura precisa crescer em fluxos críticos |
| Jobs assíncronos | Implementado P0 | Lifecycle persistente com progresso, cancelamento, retry e recuperação de jobs órfãos |
| Projects | Implementado P1 inicial | Workspace persiste AOI, viewport, camadas, estilo e associação de jobs |
| Layer Manager universal | Implementado P1 inicial | Resultados de jobs entram no mapa principal com visibilidade, opacidade, remoção e persistência por projecto |
| Monitorização/alertas | Não consolidado | Recomendado após Jobs + Projects |
| Relatórios | Parcial | Exportações existem em módulos, mas falta output profissional universal |

## Falhas P0 encontradas

### 1. Inicialização GEE quebrada

O fluxo de `_init_gee(uid)` inicializava Earth Engine com o token do utilizador
e depois tentava executar novamente `ee.Initialize(project=project_id)` usando
uma variável não definida. Isso podia transformar uma ligação OAuth válida num
erro 503.

**Correção nesta branch:** inicializador reescrito, com validação explícita de
token, project ID e fallback separado para credenciais do servidor.

### 2. Status GEE dava falso positivo

O endpoint `/geomoz-api/gee/status` considerava o utilizador "connected" apenas
porque havia um token guardado.

**Correção nesta branch:** status agora executa uma verificação leve no Earth
Engine antes de declarar a conexão operacional.

### 3. Sessões GEE frágeis em Cloud Run

Os tokens eram mantidos somente num dicionário Python. Restart ou scale-out do
container perdia a ligação.

**Correção nesta branch:** cache local + persistência Firestore quando disponível,
com fallback seguro para desenvolvimento local.

### 4. "Disconnect GEE" terminava a sessão GeoMoz

O frontend chamava `firebaseSignOut`, desligando o utilizador do produto inteiro.

**Correção nesta branch:** endpoint dedicado `POST /geomoz-api/gee/disconnect`
remove apenas a ligação Earth Engine.

## Próximos P0

- [x] Criar um modelo universal `AnalysisJob`: queued / processing / completed / failed / cancelled.
- [x] Migrar os primeiros fluxos pesados para execução fora do request HTTP: índices, cheias e groundwater AHP.
- [x] Persistir jobs e resultados pequenos no Firestore, com cache local.
- [x] Adicionar cancelamento cooperativo e retry de jobs sem reintroduzir parâmetros manualmente.
- [x] Criar Projects com restore automático + autosave de workspace.
- [x] Criar Layer Manager universal para resultados de análises.
- [x] Criar Tool Registry determinístico e API de execução segura.
- [x] Adicionar Ask GeoMoz como workspace de agente, com planner opcional server-side.
- [ ] Introduzir Cloud Tasks/PubSub + Cloud Run Job/worker para análises longas.
- [~] Padronizar erros em formato `code/message/retryable/details` — implementado no Job Engine; falta migrar endpoints legados.
- [~] Criar toast + progress UI universal — componente criado e aplicado aos workflows já migrados.
- [ ] Executar smoke tests E2E contra deployment real.
- [ ] Adicionar telemetry de latência e falhas por endpoint/módulo.
- [ ] Rever concorrência BYO-GEE: a biblioteca Python EE usa estado global; não
      assumir isolamento multiutilizador apenas com `ee.Initialize`.
- [ ] Migrar o OAuth BYO-GEE para fluxo server-side com refresh token para evitar
      reconexão quando o access token expirar.

## Workflows já migrados para AnalysisJob

| Workflow | Job type | UI com progresso | Persistência |
| --- | --- | --- | --- |
| Índices espectrais / terreno | `gee.index` | Sim | Sim |
| Cheias Sentinel-1 | `gee.flood` | Sim | Sim |
| Erosão RUSLE | `gee.erosion` | Sim | Sim |
| Água subterrânea AHP | `gee.groundwater` | Sim | Sim |
| Targeting mineral | `gee.targeting` | Sim | Sim |
| Delimitação de bacia | `gee.watershed` | Sim | Sim |

O Dashboard já apresenta as análises recentes do utilizador, incluindo estado,
progresso, mensagem da etapa e horário. Jobs locais órfãos são marcados como
falhados após timeout conservador para não permanecerem eternamente em
`processing` após restart do worker.

## P1 — Produto

### Projects

**Estado: implementação inicial concluída.**

O domínio persistente já guarda nome, descrição, AOI e `map_state`. O workspace
restaura automaticamente o projecto activo após reload e faz autosave com
debounce de centro/zoom, selecção administrativa, camadas-base, estilo e
resultados de análise.

Próxima extensão do domínio:

```text
Project
├── id
├── owner / organisation
├── name
├── description
├── AOI
├── map_state
├── result_layers
├── analysis_jobs
├── reports
└── collaborators
```

### AOI Manager

Um único AOI transversal ao produto:

- limite administrativo
- desenho
- upload GeoJSON/KML/SHP
- coordenadas
- extensão atual
- AOI guardada

### Layer Manager

**Estado: implementação inicial concluída.**

Resultados GEE com `tileUrl` entram automaticamente no mapa principal após a
conclusão do job. O utilizador já pode controlar visibilidade, opacidade e
remoção; as camadas de resultado também são persistidas no projecto.

Ainda faltam estilo avançado, legenda, estatísticas, filtro, exportação e
proveniência detalhada.

### GeoMoz Tool Registry

**Estado: primeira versão implementada.**

O agente não executa Python/GIS arbitrário. A primeira registry expõe apenas
workflows que já possuem validação e execução pelo AnalysisJob:

- `calculate_index` → `gee.index`
- `detect_flood` → `gee.flood`
- `delineate_watershed` → `gee.watershed`
- `run_mineral_targeting` → `gee.targeting`
- `calculate_erosion_risk` → `gee.erosion`
- `run_groundwater_ahp` → `gee.groundwater`

A API expõe catálogo, detalhe e execução controlada. O **Ask GeoMoz** usa um
planner opcional server-side para seleccionar no máximo uma ferramenta por
turno. O backend continua a ser a autoridade sobre validação, permissões e
execução.

Próximas tools: estatísticas zonais, change detection genérico, buffers,
intersecções, exportações e relatórios.


### AnalysisPlan multi-etapa

**Estado: implementação inicial concluída.**

Pedidos que exigem duas ou mais ferramentas podem ser transformados num plano
persistente de até seis etapas. O plano não executa código livre: cada etapa
referencia um `tool_id` do Tool Registry e cria um `AnalysisJob` normal.

Lifecycle:

```text
ready
  → step 1 queued / processing / completed
  → step 2 queued / processing / completed
  → ...
  → completed
```

Regras implementadas:

- a etapa seguinte só inicia após sucesso da anterior;
- falha de uma etapa bloqueia as seguintes;
- cancelar o plano cancela também o child job activo;
- retry reinicia apenas a etapa problemática;
- plano, propósito, parâmetros, job IDs e timestamps ficam persistidos;
- resultados concluídos continuam a entrar no Layer Manager;
- síntese final usa somente os outputs persistidos dos child jobs;
- Dashboard mostra planos recentes e progresso por projecto.

**Limitação actual:** a reconciliação/avanço do plano ainda é accionada por
polling do frontend contra o backend. A evolução de produção é mover esta
orquestração para Cloud Tasks/Pub/Sub + worker/Cloud Run Job para que o plano
continue a progredir mesmo sem browser aberto.

## Refatoração recomendada

### Backend

```text
services/
  earth_engine/
    auth.py
    datasets/
    spectral/
    terrain/
    hydrology/
    groundwater/
    hazards/
    geology/
    ml/
routers/
  auth.py
  projects.py
  gee.py
  satellite.py
  terrain.py
  hydrology.py
  groundwater.py
  hazards.py
  ai.py
  exports.py
```

### Frontend

`GeoAnalises.tsx` (~175 KB) deve ser separado por feature. O mesmo princípio
vale para `HidroGeoMoz.tsx` e `GeoMozAI.tsx`.

```text
features/
  analysis/
    spectral/
    terrain/
    prospectivity/
    common/
  hydrology/
  hazards/
  groundwater/
  ai/
```

## Critério de pronto para um módulo

Um módulo só deve ser marcado como operacional quando cumprir todos:

1. carrega sem erro;
2. aceita AOI universal;
3. valida inputs;
4. mostra progresso;
5. falha com mensagem acionável;
6. pode ser repetido com os mesmos parâmetros;
7. guarda parâmetros e resultado;
8. exporta o resultado;
9. possui teste de integração;
10. possui pelo menos um smoke test E2E.

## Workflow estrela para validar a plataforma

**Groundwater Potential**

```text
Project
  → AOI
  → factors
  → AHP
  → job
  → map
  → statistics
  → ranked targets
  → explanation
  → export
  → report
```

Este fluxo deve ser o primeiro caso completamente fechado antes de se ampliar o
número de módulos.


## Activação segura do GeoMoz Agent

O planner de linguagem natural é opcional. Sem credencial, o GeoMoz continua
operacional para GIS/GEE e a interface mostra o Agent como não configurado.

Variáveis esperadas no backend:

```text
OPENAI_API_KEY=<secret server-side>
GEOMOZ_AI_MODEL=<modelo permitido pela conta>
```

A chave nunca deve ser exposta como variável `VITE_*` nem enviada ao browser.
No Cloud Run, configurar `OPENAI_API_KEY` via Secret Manager. O código não
adiciona automaticamente um secret inexistente ao workflow de deploy para
evitar quebrar deployments actuais.

Contrato do Agent:

```text
linguagem natural
  → planner
  → 0 ou 1 tool registada
  → validação GeoMoz
  → AnalysisJob
  → GEE/Python
  → Layer Manager
  → Project workspace
```

O planner não possui ferramenta de shell, Python arbitrário ou expressão GEE
livre.
