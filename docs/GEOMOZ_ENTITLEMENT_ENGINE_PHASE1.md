# GeoMoz Subscription & Access Engine — Fase 1

## Estado real da implementação

- Backend: `GET /geomoz-api/billing/usage` exige Firebase ID token válido e apresenta ciclo UTC, plano efectivo, limite, consumo confirmado e reservas.
- Registo: `billingUsage/{uid}/cycles/{YYYY-MM}` e subcolecção de reservas, apenas através de Firebase Admin SDK. As regras de segurança impedem acesso directo do cliente.
- Reservas: duas operações simultâneas leem/alteram o mesmo documento num **Firestore transaction**. Uma só operação consegue reservar o último crédito disponível. `settle_credits` é idempotente: confirmação converte reserva em consumo e falha libertará a reserva.
- A cobrança de 1 crédito por chamada do `/geomoz-api/ai/agent-chat` está preparada mas **desligada por defeito**. Activar apenas depois de ensaio com `GEOMOZ_ENFORCE_AI_CREDITS=true` no ambiente escolhido.
- O front-end mostra utilização e créditos reservados na secção **Definições → Plano e subscrição**. Indica quando há sincronização em curso. O valor das quotas vem da configuração do servidor, não do frontend.
- A cobrança monetária e o webhook PayZeno não foram alterados. Os créditos GeoMoz não são quotas do Google Earth Engine.

## Limitações antes de activação obrigatória

1. Criar recuperação de reservas antigas quando o processo morre entre reserva e liquidação (com política de timeout/lease). **Não activar o débito obrigatório de créditos em produção sem esta recuperação.**
2. Abranger as outras operações GEE, análises em background e serviços independentes, com custos e políticas bem definidos. Actualmente só o GeoMoz AI Agent está preparado para contagem.
3. Testar o comportamento em concorrência contra um Firestore Emulator e com uma conta de ensaio autorizada; os testes unitários não substituem esse ensaio.
4. Implementar limites de armazenamento em todos os pontos de upload, limites por organização e sessões simultâneas; apenas o limite de projectos cloud já estava aplicado.
5. Definir regras de visibilidade de activos antigos em downgrade e reconciliação de recursos consumidos com o plano.
6. Adicionar métricas e alertas no Superadmin para eventos de limite atingido e gastos não liquidados.

## Activação controlada

A flag `GEOMOZ_ENFORCE_AI_CREDITS` permanece **false** em produção nesta PR. Não há necessidade de alterar `GEOMOZ_BILLING_ENABLED`, que é independente. A integração dos créditos deve passar pelo mesmo rollout seguro de outras ferramentas do GeoMoz: CI, ensaio, métricas, pilotagem, activação gradual e rollback.

A página **Planos e pagamentos** mantém os preços e os direitos financeiros actuais. Não converter créditos em moeda nem afirmar que custos GEE estão cobertos pelo plano.
