# GeoMoz Analysis Engine V2

## Objectivo

Separar a recepção de pedidos de análise do processamento pesado Google Earth Engine.

A API pública persiste o job e responde imediatamente. Em produção, o job é enviado para uma fila Google Cloud Tasks e executado por um serviço Cloud Run privado dedicado.

## Arquitectura

```text
Browser
  |
  | POST /geomoz-api/jobs
  v
GeoMoz API (Cloud Run)
  |
  | persist job -> Firestore
  | create task
  v
Cloud Tasks: geomoz-analysis
  |
  | OIDC authenticated POST
  v
geomoz-analysis-worker (Cloud Run private)
  | concurrency=1 per instance
  | autoscaling across instances
  v
Google Earth Engine
  |
  | progress/result
  v
Firestore
```

## Porque melhora o desempenho

O executor anterior usava uma thread dentro da API e serializava o acesso ao estado global do Earth Engine. O Engine V2 mantém isolamento por instância, mas permite que o Cloud Run crie várias instâncias do worker. Assim, jobs de utilizadores diferentes deixam de precisar de esperar todos pela mesma thread de uma instância da API.

## Configuração de produção

A API usa:

- `ANALYSIS_EXECUTION_BACKEND=cloud_tasks`
- `ANALYSIS_TASKS_PROJECT`
- `ANALYSIS_TASKS_LOCATION`
- `ANALYSIS_TASKS_QUEUE`
- `ANALYSIS_WORKER_URL`
- `ANALYSIS_TASKS_AUDIENCE`
- `ANALYSIS_TASKS_SERVICE_ACCOUNT`
- `ANALYSIS_MAX_ACTIVE_PER_USER`

O worker usa:

- `GEOMOZ_SERVICE_ROLE=analysis-worker`
- `ANALYSIS_EXECUTION_BACKEND=local`
- `ANALYSIS_TASK_MAX_RETRIES=2`

O deployment cria/actualiza a fila `geomoz-analysis`, publica o mesmo container num serviço worker privado, configura `concurrency=1` e autoriza a identidade runtime a invocar o worker.

## Segurança

- O endpoint `/geomoz-api/internal/analysis/run` responde apenas quando a instância está configurada como `analysis-worker`.
- O serviço worker é publicado com `--no-allow-unauthenticated`.
- Cloud Tasks usa OIDC para invocar o worker.
- As credenciais BYO-GEE continuam user-scoped e são recuperadas do Firestore pelo UID do job.
- Uma instância worker recebe no máximo uma análise simultânea, evitando troca concorrente do estado global do Earth Engine.

## Resiliência

- Os jobs permanecem persistidos no Firestore.
- Cloud Tasks usa nomes determinísticos de tarefa para evitar duplicação acidental.
- Falhas temporárias podem ser repetidas automaticamente.
- Cancelamentos persistidos impedem um worker tardio de executar o job.
- O modo local continua disponível para desenvolvimento e testes.

## Próxima optimização

Depois da migração para o Engine V2, a prioridade seguinte é reduzir round-trips síncronos ao Earth Engine, especialmente chamadas `getInfo()` e `reduceRegion().getInfo()`, e introduzir cache persistente por fingerprint de análise.
