# GeoMoz Subscription & Access Engine — Fase 1

## Entrega

O servidor consulta billing/{uid}, calcula o plano efectivo com verificação de
estado e expiração e obtém os limites de platformConfig/commerce. A UI não
define quotas.

GET /geomoz-api/entitlements/me exige autenticação Firebase e devolve:
- plano, funcionalidades e data de validade;
- ciclo UTC YYYY-MM, créditos usados, limite e saldo;
- limites de projectos, armazenamento, lugares e processos simultâneos;
- utilização reportada e flags de implementação.

A secção Definições → Plano e subscrição mostra os dados do servidor.

## Processamento GDAL gerido

GEOMOZ_ENTITLEMENTS_JOBS_ENABLED=true activa o controlo:

1. O servidor verifica o plano efectivo. Community não inclui cloud_jobs.
2. Uma transacção Firestore reserva um lugar em
   billingProcessingQuota/{uid}.activeJobs e debita cinco créditos em
   billing/{uid}. O ledger é billing/{uid}/usageEvents/{id}.
3. O trabalho GDAL tem o mesmo UUID da reserva. Concluído: confirma o débito.
   Falha ou cancelamento: liberta o lugar e devolve créditos na mesma
   transacção idempotente, desde que não esteja noutro ciclo mensal.
4. Reservas expiradas (3600s, acima do tempo máximo padrão GDAL 1800s)
   são ignoradas para a concorrência da próxima transacção.

Firestore Rules bloqueiam acesso cliente ao ledger e à quota de processamento.
O limite de concorrência aplica-se entre réplicas Cloud Run.

IMPORTANTE: processing_jobs.py ainda utiliza execução em-processo e ficheiros
temporários em /tmp. Não existe fila distribuída durável. Um crash de worker
pode deixar créditos reservados mesmo depois de o lugar expirar. Será
necessário reconciliação automática ou workers persistentes antes de prometer
um SLA de processamento. Não confundir limite de concorrência com SLA.

## Google Earth Engine e IA

GEOMOZ_ENTITLEMENTS_SCIENCE_ENABLED=true activa verificação de
scientific_analysis para pedidos POST de execução científica GEE e chat IA.
Ambas as flags estão desligadas por defeito, para evitar bloqueio inesperado
de operações existentes sem teste controlado.

O uso de Earth Engine com OAuth/projecto do próprio utilizador não debita
créditos GeoMoz. Quotas GEE são distintas e continuam a ser definidas pelo
Google e respectivos fornecedores de dados (incluindo possíveis limites FAO).

## Activação controlada

As flags de permissões são independentes de GEOMOZ_BILLING_ENABLED: não alteram
a cobrança PayZeno nem o webhook.

Após ensaios com contas Community e Pro, em Cloud Shell:

    gcloud run services update geomoz-explorer-api \
      --region=europe-west1 \
      --update-env-vars=GEOMOZ_ENTITLEMENTS_JOBS_ENABLED=true

Activar restrições científicas só após teste dos endpoints GEE:

    gcloud run services update geomoz-explorer-api \
      --region=europe-west1 \
      --update-env-vars=GEOMOZ_ENTITLEMENTS_SCIENCE_ENABLED=true

Rollback:

    gcloud run services update geomoz-explorer-api \
      --region=europe-west1 \
      --update-env-vars=GEOMOZ_ENTITLEMENTS_JOBS_ENABLED=false,GEOMOZ_ENTITLEMENTS_SCIENCE_ENABLED=false

## Próximas fases

- Armazenamento: contabilização existente NÃO constitui quota imposta em
  todos os uploads e objectos Cloud Storage.
- Teams: falta gerir organizações, convites e limites efectivamente por lugar.
- Workers: persistência e reconciliação de eventos após crash/redeploy.
- Cobrança por custo real: inicialmente cinco créditos por trabalho GDAL;
  estudar CPU, duração e tamanho de dados antes da política final.
- Superadmin: dashboards paginados de utilização e incidentes por equipa.
- Quotas Earth Engine: respeitar as quotas e os termos de cada fornecedor.

Esta fase implementa consulta centralizada de direitos, uma reserva
transaccional de créditos e de concorrência para GDAL e controlos de acesso
científico opcionais. O rollout é opt-in para não afectar produção antes
da validação.
