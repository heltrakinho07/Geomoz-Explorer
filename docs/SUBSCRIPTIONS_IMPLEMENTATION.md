# GeoMoz Explorer — Subscrições (implementação inicial)

## Incluído neste ramo

- Catálogo Community (0 MZN), Academic (299/2.990 MZN), Pro (1.199/11.990 MZN), Teams (4.999/49.990 MZN), Enterprise sob consulta.
- UI em `/planos` e separador «Plano e subscrição» em Definições, ligada a `billing/{uid}`.
- Regras Firestore que tornam os documentos de facturação, eventos e uso **read-only** para o navegador.
- API FastAPI autenticada para checkout, portal e webhook Stripe; assinatura Stripe verificada, janela de cinco minutos e deduplicação transaccional de eventos.
- Função interna `charge_managed_cloud_credits(uid, cost, operation_id)` com débito atómico e idempotente e ciclo mensal UTC.
- Testes unitários para catálogo de planos.

## Configuração obrigatória antes de oferecer pagamentos

No Cloud Run, definir via Secret Manager:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`,
`STRIPE_PRICE_TEAMS_MONTHLY`, `STRIPE_PRICE_TEAMS_YEARLY`,
`STRIPE_PRICE_ACADEMIC_MONTHLY`, `STRIPE_PRICE_ACADEMIC_YEARLY`,
e `GEOMOZ_PUBLIC_URL=https://geomoz.geolithica.com`.

Criar os preços recorrentes reais no Stripe com moeda compatível com a conta e conferir que montantes, periodicidades, taxas e conversões correspondem à tabela pública. Associar o webhook a `https://geomoz.geolithica.com/geomoz-api/billing/webhook` com eventos `checkout.session.completed`, `customer.subscription.updated` e `customer.subscription.deleted`. **Não** marcar pagamentos como confirmados a partir do URL de retorno.

O Academic está bloqueado por defeito até à verificação administrativa, que define `academicApproved: true` no documento `billing/{uid}` através de uma credencial de servidor. Não conceder permissão de escrita no Firestore ao cliente.

## Limitações importantes e trabalho pré-produção

1. O fluxo M-Pesa/E-Mola ainda não está integrado: requer credenciais empresariais, especificação contratual, validação assinada de callbacks e reconciliação. Não activar botões de pagamento local antes disso.
2. A função de débito de créditos existe, mas **ainda deve ser ligada a cada worker de cloud jobs** (reserva/reembolso/resultado) para aplicar quotas em todas as análises. Operações GEE BYO pertencem ao projecto do utilizador e não podem ser contabilizadas como créditos GeoMoz.
3. A criação de projectos mantém uma via Firestore/local de compatibilidade. Para quotas inultrapassáveis, migrar a criação para uma API autenticada transaccional e tornar `users/{uid}/projects` exclusivamente escrita pelo servidor. Não interpretar os limites apresentados no frontend como controlos de segurança já aplicados.
4. Storage, lugares Teams e concorrência de jobs necessitam de medição real, contadores atómicos, gestão de organizações e regras de servidor antes de activar comercialmente.
5. Validar testes CI, deploy em staging, Stripe test mode, cenários de pagamento recusado, cancelamento, renovação, webhook duplicado, expiração, downgrade e acesso de terceiros. Implementar gestão de impostos e facturação segundo requisitos locais.
6. Configurar alertas financeiros e limites de custo de GEE/Cloud Run/Storage antes de activar processamento cloud gerido.

**Nunca publicar a branch como um sistema de facturação plenamente operacional sem estes passos.**
