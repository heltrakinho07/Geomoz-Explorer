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
| AOI | Presente, fragmentado | Há suporte a province/district/geometry; precisa virar serviço/estado universal |
| GEE BYO | Parcial / P0 | Fluxo OAuth existe, mas havia falha crítica no inicializador e sessão apenas em memória |
| GeoAnalises | Presente, alto acoplamento | Página ~175 KB; precisa decomposição por feature |
| Hidrologia | Presente | Endpoints e UI para bacias, drenagem, rede fluvial e watershed |
| Água subterrânea | Presente | UI e fatores AHP presentes; precisa workflow de resultado/ranking persistente |
| Geoperigos | Presente | Flood e RUSLE expostos no backend/UI |
| GeoMoz AI | Presente, ainda não plataforma de tools | UI grande; deve consumir Tool Registry determinístico |
| Autenticação GeoMoz | Presente | Firebase Auth |
| Testes | Presente | Pytest/Vitest existem; cobertura precisa crescer em fluxos críticos |
| Jobs assíncronos | Ausente como abstração universal | Operações GEE usam executor local; falta lifecycle persistente |
| Projects | Não encontrado como domínio central | P1 crítico para transformar análise em produto SaaS |
| Layer Manager universal | Parcial | Há camadas por páginas/componentes, não um estado único transversal |
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

- [x] Criar um modelo universal `AnalysisJob`: queued / processing / completed / failed.
- [x] Migrar os primeiros fluxos pesados para execução fora do request HTTP: índices, cheias e groundwater AHP.
- [x] Persistir jobs e resultados pequenos no Firestore, com cache local.
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
| Água subterrânea AHP | `gee.groundwater` | Sim | Sim |

O Dashboard já apresenta as análises recentes do utilizador, incluindo estado,
progresso, mensagem da etapa e horário. Jobs locais órfãos são marcados como
falhados após timeout conservador para não permanecerem eternamente em
`processing` após restart do worker.

## P1 — Produto

### Projects

Criar domínio persistente:

```text
Project
├── id
├── owner / organisation
├── name
├── description
├── AOI
├── CRS
├── layers
├── analyses
├── jobs
├── outputs
├── reports
├── map_state
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

Um único catálogo de camadas ativas com:

- visibilidade
- opacidade
- estilo
- legenda
- estatísticas
- filtro
- exportação
- proveniência

### GeoMoz Tool Registry

A IA não deve executar código arbitrário. Deve orquestrar ferramentas validadas:

- `calculate_ndvi`
- `calculate_ndwi`
- `calculate_slope`
- `delineate_watershed`
- `calculate_zonal_statistics`
- `run_groundwater_ahp`
- `detect_flood`
- `run_pca`
- `run_kmeans`
- `generate_report`
- `export_geotiff`

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
