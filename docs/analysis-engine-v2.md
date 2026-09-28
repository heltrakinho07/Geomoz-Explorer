# GeoMoz Analysis Engine V2

## Objectivo

Separar a recepção de pedidos de análise do processamento pesado Google Earth Engine.

A API pública persiste o job e responde imediatamente. Em produção, cada análise inicia uma execução isolada de **Cloud Run Jobs**, evitando executar trabalho pesado em threads de background da API.

## Arquitectura

```text
Browser
  |
  | POST /geomoz-api/jobs
  v
GeoMoz API (Cloud Run)
  |
  | persist job -> Firestore
  | POST run.googleapis.com .../geomoz-analysis-job:run
  | env override: uid + job_id
  v
geomoz-analysis-job (Cloud Run Job)
  | 1 task por execução
  | processo GEE isolado
  | execuções diferentes podem correr em paralelo
  v
Google Earth Engine
  |
  | progress/result
  v
Firestore
```

## Porque melhora o desempenho

O executor local usa uma thread dentro da API e precisa serializar o acesso ao estado global do Earth Engine. Com Cloud Run Jobs, cada análise recebe um processo isolado, portanto o lock de credenciais continua a proteger a execução dentro do processo sem obrigar análises de utilizadores diferentes a esperar pela mesma instância.

Esta arquitectura também remove a dependência de bootstrap do Cloud Tasks. O projecto já utiliza Cloud Run, por isso o mesmo plano de controlo cria e executa os workers.

## Configuração de produção

A API usa:

- `ANALYSIS_EXECUTION_BACKEND=cloud_run_jobs`
- `ANALYSIS_RUN_JOB_PROJECT`
- `ANALYSIS_RUN_JOB_LOCATION`
- `ANALYSIS_RUN_JOB_NAME`
- `ANALYSIS_RUN_JOB_TIMEOUT_SECONDS`
- `ANALYSIS_MAX_ACTIVE_PER_USER`

O job worker usa:

- `GEOMOZ_SERVICE_ROLE=analysis-job`
- `ANALYSIS_EXECUTION_BACKEND=local`
- `ANALYSIS_RUN_JOB_MAX_RETRIES=2`
- `GEOMOZ_JOB_UID` e `GEOMOZ_JOB_ID` como overrides por execução

O deployment publica o mesmo container como API e como Cloud Run Job. A identidade runtime da API recebe `roles/run.jobsExecutorWithOverrides` **apenas no job GeoMoz**, porque o dispatcher precisa de `run.jobs.runWithOverrides` para injectar o UID e ID do job em cada execução.

## Segurança

- Cada execução GEE corre num processo isolado.
- O UID e job ID identificam apenas um job já persistido no Firestore.
- As credenciais BYO-GEE permanecem user-scoped e são recuperadas do Firestore pelo UID.
- Não existe endpoint worker público a expor para o backend Cloud Run Jobs.
- A identidade runtime recebe permissão de execução apenas sobre o job `geomoz-analysis-job`.
- O conteúdo do job é novamente validado por `_prepare_analysis_runner` no worker.

## Resiliência

- Os jobs permanecem persistidos no Firestore antes do dispatch.
- O worker é idempotente para jobs já `completed`, `failed` ou `cancelled`.
- Cloud Run Jobs executa retries de task e o GeoMoz mantém o contador de tentativas.
- Se o job distribuído não puder ser inicializado, o deploy mantém o modo local como fallback para preservar disponibilidade.
- Métricas `queue_wait_ms`, `execution_ms` e `total_ms` permitem distinguir espera de processamento efectivo.

## Performance GEE

A primeira passagem de performance já reduz round-trips síncronos em:

- Groundwater AHP;
- RUSLE;
- Mineral Targeting;
- Flood Sentinel-1.

O monitor frontend apresenta fila, processamento e total ao utilizador.

## Próximas optimizações

- reducers combinados adicionais para análises hidrológicas;
- cache persistente por fingerprint de análise;
- preview de baixa resolução antes do resultado científico;
- métricas agregadas por tipo de análise para identificar os maiores gargalos.
