# Inspecção administrativa de créditos — Fase 2

Endpoint novo: `GET /geomoz-api/admin/users/{uid}/usage?limit=25`.

- Exige autenticação Firebase e autorização administrativa actual (`require_admin`), incluindo revogação de sessões e contas desactivadas.
- Confirma a existência da conta via Firebase Auth e usa `user_subscription_snapshot` para obter os mesmos limites e contadores de `/billing/entitlements`.
- Devolve plano efectivo, validade, créditos consumidos/reservados, quotas, flags de aplicação e **uma amostra limitada** de eventos por operação.
- Eventos recentes ordenados por `createdAt` (limite 1–100); não são totais históricos e não expõem conteúdo de prompts, respostas, segredos ou campos arbitrários.
- Operação exclusivamente de leitura: não cobra créditos, não modifica permissões ou pagamentos, nem activa `GEOMOZ_ENFORCE_AI_CREDITS`.
- A existência do endpoint não significa que os créditos estejam activos na produção. O estado `enforcement.credits` continua a indicar se a contabilização é aplicada.

## Validação antes da activação

Executar `pytest geomoz-explorer/tests/test_admin_credit_usage.py` no ambiente com as dependências do backend. Validar com conta support/admin e token Firebase autêntico, e confirmar rejeição de utilizador comum e de token revogado. Confirmar resultados e reservas contra `/billing/entitlements`; executar testes de concorrência no Firestore Emulator antes de activar qualquer flag. Evitar activation global sem ensaio com contas Community, Academic e Pro.

## Seguinte

Acrescentar visualização no Centro de Administração e contadores agregados com índices Firestore e paginação. Expandir metering para operações GEE por tipo de trabalho apenas depois de definir unidade de consumo e assegurar reserva, liquidação e compensação em falhas.
