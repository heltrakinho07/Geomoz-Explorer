# GeoMoz Subscription & Access Engine — Fase 1

## Objectivo

Aplicar permissões do plano **no servidor**, em vez de apenas esconder botões.
Não alterar o processamento SIG local/offline nem os limites externos Google
Earth Engine/FAO; manter as subscrições e planos existentes.

## Fonte da verdade

- Firebase Authentication: validação do ID token da sessão em cada operação.
- Firestore \`billing/{uid}\`: plano, estado, data final, creditsUsed, creditCycle,
  storageUsedBytes, academicApproved e origem do pagamento/concessão.
- Firestore \`platformConfig/commerce\`: limites e flags globais configuradas no Superadmin.
- Firestore \`billingProjectQuota/{uid}\`: total de projectos **cloud** sob controlo
  de criação/eliminação transaccional. Conta exacta só quando o documento existe.
- Firestore \`billing/{uid}/usageEvents/raster-{job-id}\`: reservas e conclusão
  de créditos para jobs raster geridos. Negado aos clientes nas regras Firestore.

O cálculo do plano efectivo considera estado \`active/trialing\` e data de expiração;
uma subscrição cancelada, expirada ou contestada regressa a Community.
Desactivar a venda de um plano **não** revoga subscrições activas existentes.

## Endpoint autenticado

\`GET /geomoz-api/billing/access\`

Resposta inclui: \`plan\`, \`status\`, \`periodEnd\`, \`features\`, \`modules\`,
\`limits\`, \`usage.creditCycle\`, \`usage.creditsUsed\`,
\`usage.creditsRemaining\`, \`usage.projectsUsed\`,
\`usage.storageUsedBytes\`, \`usage.storageQuotaEnforced=false\`,
\`usage.concurrentQuotaScope="instance"\`, \`automaticRenewal=false\`,
\`earthEngineQuota="external-user-owned"\`.

É uma API **apenas de leitura**, protegida por Firebase. Nunca recebe UID,
plano, preços ou créditos fornecidos pelo navegador.

## Regras activas

| Acção | Regra |
|---|---|
| GIS local (sem execução no servidor) | Community e restantes planos |
| Criar projecto cloud | Limites por plano, já transaccionais |
| GEE: análises que exigem credenciais próprias | Academic/Pro/Teams/Enterprise; módulo remote_sensing activo; nenhuma dedução de créditos GeoMoz |
| Processamento pesado GDAL/COG no servidor | Academic/Pro/Teams/Enterprise; módulo GIS activo; 1 crédito GeoMoz por job aceite e concluído |
| Concorrência GDAL | \`min(concurrent_jobs_do_plano, GEOMOZ_JOB_MAX_ACTIVE_PER_USER)\` **por instância** |
| Sem créditos, plano vencido ou Community | Recusa de nova submissão do job (402) |
| Falha/cancelamento do job gerido | Devolução transaccional, idempotente, do crédito |
| Worker interrompido por deployment/crash | Reservas abandonadas reconciliadas após timeout (na próxima leitura do saldo) |

Os créditos contam por **mês civil UTC**, não por aniversário da subscrição.
Uma nova sessão de compra não altera retroactivamente as reservas antigas.

## Limitações técnicas ainda abertas

1. Quotas efectivas de **armazenamento**: os tamanhos reportados não substituem
   um serviço de uploads autenticado e transaccional com reserva por bytes.
2. Concorrência **global**: o processador GDAL ainda guarda jobs em memória por
   instância Cloud Run. A fila durable e leases distribuídas serão fase seguinte.
3. Capacidade **Teams**: perfis, seats e RBAC organizacional não estão concluídos;
   não activar checkout Teams até esses controlos serem efectivos.
4. Custos do **GeoMoz AI**: o endpoint pode usar credenciais de fornecedores
   inseridas pelo utilizador; ainda não existe metering de tokens geridos.
5. Workspace estático, Storage e serviços de terceiros: cada serviço deve aplicar
   as próprias regras, não depender apenas da flag do portal.
6. Total de projectos antes da primeira operação de quota pode ser apresentado como
   desconhecido; não apresentar \`0\` como contagem verificada.
7. Recuperação de reservas crashadas depende da próxima leitura autenticada;
   uma tarefa de reconciliação periódica central será necessária em escala.

## Verificações recomendadas antes da publicação

- Conta Community deve continuar com SIG local e até 3 projectos cloud.
- Conta Community não deve poder executar análise GEE paga ou job GDAL gerido,
  mesmo chamando a API directamente.
- Academic aprovado e com subscrição válida deve aceder a GEE próprio e 1 job
  por instância; Pro terá 2, sujeitos a limites físicos do worker.
- Verificar consumo de 1 crédito por job raster concluído e reembolso se falhar,
  terminar por timeout ou for cancelado.
- Testar expiração/refund de plano entre check de permissões e reserva: o backend
  tem de recusar a reserva dentro da transacção.
- Testar reset UTC, múltiplas reservas concorrentes, refunds idempotentes e
  revogação das flags globais.
- Manter a configuração comercial Cloud Run e as credenciais de pagamento já
  existentes **sem alterações**. Esta fase não mexe no checkout.

## Próximas fases

Fase 2: upload gateway seguro com contabilização de bytes, leases distribuídas
de jobs e métricas por instância. Fase 3: Organizations/Teams, convites e seats.
Fase 4: metering de operações GeoMoz AI geridas, painéis de utilização e alarmes.
