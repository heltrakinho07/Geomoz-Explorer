# GeoMoz Explorer — Subscrições e facturação (pré-lançamento)

## Estado real (04-11-2026)

Esta implementação introduz catálogo de planos, interface pública `/planos`,
gestão em Definições → Plano e Subscrição, encomendas, validação académica,
pedidos empresariais, limitação transaccional dos projectos **cloud**,
eventos de pagamento idempotentes e contabilização de créditos por operação.

**Não é um anúncio de disponibilidade comercial:** a facturação exige
revisão de preços, configuração de serviços, credenciais e testes de produção.
Não activar clientes pagantes antes de cumprir a lista de verificação abaixo.

## Planos propostos

| Plano | Mensal | Anual | Projectos cloud | Armazenamento indicativo | Créditos/mês | Lugares |
|---|---:|---:|---:|---:|---:|---:|
| Community | Grátis | Grátis | 3 | 500 MB | 20 | 1 |
| Academic | 299 MZN | 2.990 MZN | 15 | 5 GB | 150 | 1 |
| Pro | 1.199 MZN | 11.990 MZN | 75 | 30 GB | 800 | 1 |
| Teams | 4.999 MZN | 49.990 MZN | 200 | 150 GB | 3.000 | 5 |
| Enterprise | Por contrato | Por contrato | Contratual | Contratual | Contratual | Contratual |

Fonte de verdade: `geomoz-explorer/billing_core.py` no servidor.
O frontend consulta `GET /geomoz-api/billing/plans`, não fixa preços.

## Arquitetura e isolamento

- Firebase Authentication para identidade (token verificado por Firebase Admin).
- Firestore Admin para `billing_accounts/{uid}`, `billing_orders/{id}`,
  `billing_events/{sha256(provider:event_id)}`,
  `billing_academic_requests/{uid}`, `billing_enterprise_requests/{id}`.
- Colecções `billing_*` **não podem** ser alteradas por SDK de cliente:
  não constam das permissões de `firestore.rules`.
- `POST /geomoz-api/billing/projects` executa consulta dos projectos dentro
  de transacção Firestore e impede novas criações acima do limite do plano.
- As regras `firestore.rules` deixam criação e eliminação cloud exclusivamente
  ao Firebase Admin. Projectos de convidados são apenas locais.
- `POST /geomoz-api/billing/internal/consume` é serviço interno: requer
  `X-GeoMoz-Metering-Secret`, usa transacção e `operation_id` idempotente.
- A cobrança de créditos só deve ser feita quando um trabalho cloud real tem
  medição, reserva e reconciliação integradas; a rota interna disponibiliza
  uma base segura, **não significa que cada módulo já está ligado**.
- Quotas de armazenamento, concorrência e membros de Teams ainda exigem
  ligação aos serviços de Storage, filas de trabalho e IAM de organizações.

## Checkout e pagamentos

- `POST /geomoz-api/billing/checkout` gera encomenda a partir do preço
  **do servidor**, nunca do montante enviado pelo navegador.
- **Stripe**: Checkout com pagamento pontual (pré-pago; sem renovação
  automática). Só fica activo quando o webhook `checkout.session.completed`
  possui assinatura válida, `payment_status=paid`, sessão, moeda e valor
  correspondentes. O regresso à página não activa a subscrição.
  O suporte MZN depende da conta Stripe e elegibilidade do titular.
- **M-Pesa / E-Mola**: neste ponto apenas criam pedido pendente;
  NÃO cobram nem activam. O webhook genérico `/webhooks/partner`
  é reservado a um adaptador que primeiro autentica a resposta real
  do operador e depois assina o payload. Não o expor directamente como
  webhook M-Pesa ou E-Mola sem verificar os protocolos contratados.
- Validação académica não é automática: um administrador tem de analisar
  a instituição e aprovar mediante `POST /admin/academic/{uid}`.
- Um plano pago expira na data registada e reverte para Community na
  avaliação dos direitos; não são apagados projectos.

## Variáveis de ambiente (servidor; NUNCA no VITE_)

```env
FIREBASE_PROJECT_ID=geoprocessamento-426809
BILLING_FRONTEND_URL=https://geomoz.geolithica.com
BILLING_ADMIN_UIDS=<uid-do-administrador>
BILLING_METERING_SECRET=<segredo-aleatorio-longo>
# Stripe APENAS quando houver conta comercial elegível:
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CURRENCY=mzn
# Apenas depois de adaptar e autenticar os callbacks nativos dos operadores:
BILLING_PARTNER_WEBHOOK_SECRET=
```

Atribuir segredos pelo Secret Manager e IAM no Cloud Run. Nunca os colocar
em GitHub, no frontend, em ficheiros de imagem ou na base de dados de clientes.
Os nomes e preços devem ser revistos com contabilidade, IVA e termos comerciais
antes de aceitar pagamentos.

## Testes e operações

```sh
cd geomoz-explorer
pytest -q tests/test_billing.py
cd ../artifacts/geomoz-react
pnpm run typecheck
pnpm run test
```

Checklist antes de fazer merge/deploy:

1. Executar testes Python e TypeScript, verificando imports e dependências.
2. Verificar configuração de `firebase_admin`, GCP/Firebase e permissões
   das contas de serviço no ambiente staging.
3. Testar 3 projectos Community, bloqueio do quarto, actualização, eliminação
   e permissões Firestore com dois utilizadores reais.
4. Confirmar que `billing_accounts`, `billing_orders`, `billing_events`
   não são legíveis nem escrevíveis no cliente Firebase.
5. Exercitar webhooks assinados, replays, pagamento com valor divergente,
   pagamento duplicado, expiração do plano e concorrência entre transacções.
6. Integrar e testar os provedores nacionais antes de oferecer pagamento
   imediato M-Pesa/E-Mola; completar o circuito de conciliação.
7. Integrar cobrança/reserva/reembolso de créditos com os **trabalhos cloud**
   reais; aplicar quotas de Storage, jobs e lugares Teams no backend.
8. Confirmar licenças/quota GEE pessoal versus processamento comercial
   gerido pela plataforma. Não apresentar processamento GEE ilimitado.
9. Validar IVA, moeda, elegibilidade Stripe, política de privacidade,
   termos de subscrição e retenção de dados.
10. Testar em mobile, tablet, desktop e nos idiomas suportados.

### API

- `GET /geomoz-api/billing/plans` público.
- `GET /geomoz-api/billing/me` utilizador Firebase.
- `POST /geomoz-api/billing/checkout` utilizador Firebase.
- `POST /geomoz-api/billing/academic-request` utilizador Firebase.
- `POST /geomoz-api/billing/enterprise-request` utilizador Firebase.
- `POST /geomoz-api/billing/admin/academic/{uid}` administrador.
- `POST /geomoz-api/billing/webhooks/stripe` assinatura Stripe.
- `POST /geomoz-api/billing/webhooks/partner` assinatura do adaptador.
- `POST /geomoz-api/billing/internal/consume` segredo do serviço.
- `POST /geomoz-api/billing/projects` cria projecto respeitando a quota.
- `DELETE /geomoz-api/billing/projects/{project_id}` elimina projecto e runs.

## Reversão

Se a facturação não estiver configurada: manter a página pública como
pré-lançamento e bloquear operações monetárias. Para reverter as novas
regras de projectos, reverter **juntos** a mudança de `projectService.ts`,
`project_quota.py` e `firestore.rules`. Não remover unilateralmente
a API de criação, pois isso bloqueia novos projectos cloud.
