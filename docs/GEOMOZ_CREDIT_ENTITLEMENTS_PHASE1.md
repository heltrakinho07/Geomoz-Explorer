# GeoMoz — Motor de créditos e permissões (fase 1)

## Integração com a facturação existente

Este desenvolvimento amplia os controlos introduzidos no PR #249 sem duplicar os valores. **A fonte de verdade é o documento `billing/{uid}`**, cuja utilização é exposta em `GET /geomoz-api/billing/usage`. A operação de cobrança `charge_managed_cloud_credits` continua a utilizar este documento e passa a contar também os créditos reservados.

- Os planos são sempre determinados por `_effective_plan` no backend (estado de pagamento e validade), nunca por campos enviados no browser.
- As quotas vêm de `get_plan_limits` e as reservas são feitas por transacção Firestore antes da execução da ferramenta.
- Apenas a operação `ai.agent_chat` tem custo explícito nesta fase: **1 crédito por operação**, quando o controlo estiver activado.
- O processamento bem-sucedido confirma o débito; as falhas libertam a reserva. A liquidação é idempotente e cria um evento em `usageEvents` quando confirmada.
- Uma reserva abandonada expira após uma hora e é recuperada, por transacção, na próxima reserva da conta. A recuperação não duplica débitos.
- As quotas seguem meses UTC; reservas do mês anterior não reduzem o saldo do mês seguinte.
- A secção **Definições → Plano e subscrição** passa a apresentar utilização, reservas e barra de progresso, usando o endpoint já existente.

## Segurança operacional

**GEOMOZ_ENFORCE_AI_CREDITS=false** por defeito. A API e o código de reserva existem em produção após publicação, mas **nenhuma cobrança de créditos ao GeoMoz AI é aplicada automaticamente** até activar esta variável num ensaio controlado. A validação do checkout monetário, a subscrição e o webhook não são alterados.

Testes de isolamento de contas, concorrência, recuperação e liquidação idempotente usam o Firestore Emulator no workflow Python. Testes sem serviços externos verificam a flag desactivada, custos imutáveis no servidor e a mudança de ciclo.

## A implementar nas fases seguintes

1. Aplicar o mesmo controlo às ferramentas GEE, GeoAnálises e ao motor independente do GIS Workspace; definir custos com base nos recursos executados.
2. Limites de armazenamento (Firebase Storage, uploads e exportações), operações simultâneas, equipas e número de lugares Teams.
3. Registo consolidado de utilização por ferramenta, histórico e gráficos no Superadmin.
4. Ensaios de cargas, downgrade/expiração, idempotência em pedidos reexecutados e métricas de custos reais.
5. Manutenção e monitorização de reservas expiradas sem depender da próxima tentativa do utilizador.

Os **créditos GeoMoz** não correspondem às quotas ou cobranças do Google Earth Engine, nem substituem as regras de acesso do serviço de origem.
