# GeoMoz Explorer — PayZeno + subscrições

## Estado da implementação

A subscrição GeoMoz Explorer usa **PayZeno Hosted Checkout** para pagamentos em **MZN**, com o mesmo contrato técnico adoptado na GeoAcademy e sem misturar as bases de dados nem as matrículas. O ciclo mensal/anual é uma **compra única de acesso por 1/12 meses**, não uma autorização de débito recorrente.

- Catálogo: Community 0 MZN, Academic 299/2.990 MZN, Pro 1.199/11.990 MZN, Teams 4.999/49.990 MZN, Enterprise sob consulta.
- Página `/planos`, selector mensal/anual, região Moçambique/internacional e telefone; `Definições → Plano e subscrição`.
- `POST /geomoz-api/billing/checkout` exige Firebase ID token válido, lê preço no servidor e cria uma transacção `billingPayments/{id}` com referência `GMZ-{id}`.
- PayZeno `POST https://api.payzeno.io/v1/checkout/sessions` com `Api-Key`, `Idempotency-Key`, `amount` em centavos, `currency=MZN`, `reference`, `customer`, `success_url`, `cancel_url`. Sem `payment_methods`, para disponibilizar todos os métodos permitidos pela conta (M-Pesa, e-Mola, cartões quando activos).
- `POST /geomoz-api/billing/webhook` verifica `X-Signature` HMAC-SHA256 (hex, base64 e prefixo `sha256=`), referências GeoMoz, montante e moeda. O evento `payment.succeeded` dispara também `GET /v1/checkout/sessions/{id}/status` autenticado antes de activar o plano.
- `GET /geomoz-api/billing/payments/{id}` permite reconciliação *server-to-server* depois do retorno e apenas ao comprador autenticado.
- `GET /geomoz-api/billing/history` mostra o histórico por utilizador. `GET /geomoz-api/billing/me` devolve o plano efectivo, com expiração.
- Transacção Firestore idempotente aplica pagamentos **uma vez**, estende períodos para renovação do mesmo plano, revoga o acesso do último pagamento no caso de reembolso ou chargeback.
- Firestore `billing/{uid}` legível só pelo próprio, nunca alterável pelo browser; `billingPayments`, `billingCheckoutState` e `billingEvents` só pelo backend Firebase Admin. `charge_managed_cloud_credits` está pronto para integração com trabalhadores cloud.
- Não ocorre acesso pago por URL de sucesso ou pela sessão PayZeno ainda pendente.

## Configuração obrigatória em produção

Definir no serviço backend do GeoMoz Explorer (Cloud Run) via Secret Manager:

| Variável | Função |
|---|---|
| `PAYZENO_API_KEY` | Chave PayZeno com permissão para criar e consultar sessões |
| `PAYZENO_WEBHOOK_SECRET` | Segredo correspondente à mesma aplicação/chave PayZeno |
| `GEOMOZ_PUBLIC_URL` | `https://geomoz.geolithica.com` |

No painel PayZeno, registar o webhook **GeoMoz**:
`https://geomoz.geolithica.com/geomoz-api/billing/webhook`

**Importante:** A PayZeno permite chaves por aplicação, com URL de webhook associado à chave. Para continuar a usar a mesma conta merchant da GeoAcademy, crie uma **chave/aplicação específica para GeoMoz Explorer** e o seu segredo/webhook, usando os mesmos gateways activos. Não altere o endpoint GeoAcademy existente para apontar ao GeoMoz, sob risco de quebrar as matrículas da GeoAcademy. Não partilhe a chave em código, frontend ou Git.

O modo `all` omite o campo `payment_methods`. Num checkout internacional, o campo obrigatório `customer.phone` usa o contacto técnico de referência adoptado pela GeoAcademy (+258860406315); não é número de autenticação nem de cobrança móvel. Os cartões só aparecem se a conta merchant suportar esse canal.

A elegibilidade Academic permanece sujeita a validação administrativa `billing/{uid}.academicApproved=true` feita exclusivamente no backend.

## Testes de aceitação e segurança antes do lançamento

1. Testar com chave PayZeno de sandbox, quando disponível; em produção, apenas fazer uma compra real controlada e autorizada.
2. Confirmar preço MZN x100, método de pagamento disponível, valores de retorno e expiração do checkout.
3. Verificar assinatura ausente/inválida; referência ou valor divergentes; eventos repetidos; eventos fora de ordem.
4. Simular e validar `pending`, `paid`, `failed`, `cancelled`, `expired`, `refunded`, `chargeback`, mês com 28/29 dias, renovação antecipada e downgrade.
5. Confirmar autenticação obrigatória em `/checkout`, `/payments/{id}`, `/history` e isolamento entre utilizadores.
6. Confirmar operações do GeoMoz que cobram créditos no backend, com reserva/compensação de créditos após falha.
7. Restringir projectos cloud, armazenamento, lugares e jobs com verificações de servidor — actualmente o módulo de quotas existe mas os fluxos de trabalho ainda precisam de migração de compatibilidade local.
8. Implementar gestão institucional Teams, facturação fiscal e comprovativos conforme exigências legais. Não expor secrets nem chaves PayZeno ao cliente.
9. Confirmar que a aplicação PayZeno da GeoAcademy continua a receber o seu webhook próprio.

## Referências de implementação

- Código existente GeoAcademy (Lovable): `supabase/functions/create-payment/index.ts`, `payzeno-webhook/index.ts` e `verify-payment/index.ts`.
- Documentação oficial: https://payzeno.io/api
- Não assumir cobrança automática de subscrição; o modelo actual é **pagamento pontual renovável manualmente**.

**Não promover este módulo a cobrança comercial em produção antes de configurar a aplicação PayZeno do GeoMoz, efectuar testes ponta a ponta e aplicar quotas em todos os serviços relevantes.**
