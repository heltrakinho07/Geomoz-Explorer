GeoMoz — Subscription & Access Engine (Fase 1)

Fonte de verdade
- Plano efectivo calculado no servidor a partir do documento billing do utilizador e do prazo de validade.
- Estados inactivos ou período expirado recaem no plano Community, sem eliminação de dados.
- Preços/limites provenientes de platformConfig/commerce e não de campos do navegador.
- Contagem de projectos e créditos reutiliza o saldo e o ledger existentes. Não há segunda carteira.

APIs (Firebase Auth obrigatório)
- GET /geomoz-api/billing/entitlements — plano, validade, limites, uso, flags e estado de aplicação.
- GET /geomoz-api/billing/usage — formato legado derivado da mesma informação.
- GET /geomoz-api/billing/usage/history — eventos de consumo.
- POST /geomoz-api/processing/jobs — verificação de plano no backend quando habilitada.

Configuração e rollout
- GEOMOZ_ENFORCE_PROCESSING_PLAN=false (valor predefinido) mantém o acesso anterior. Só activar após testes de Community, Academic e Pro.
- GEOMOZ_ENFORCE_AI_CREDITS=false (valor predefinido) mantém o consumo do AI sem débitos. Activar só após testes de idempotência, falhas, reversões e quotas.
- GEOMOZ_BILLING_ENABLED não é alterado por esta implementação; checkout e webhooks permanecem independentes.

Transparência do estado das quotas
- Projectos cloud: limite transaccional aplicado.
- Créditos: reserva e débito atómicos; aplicação ao AI opcional.
- Jobs GDAL: autorização server-side disponível, aplicação opcional.
- Armazenamento: capacidade anunciada; utilização transversal ainda não verificada.
- Lugares Teams: ainda não provisionados integralmente.
- Simultaneidade: limite ainda não aplicado entre workers.
- Quotas GEE: externas e distintas dos créditos GeoMoz.

Aceitação
1. Confirmar consistência entre entitlements, billing/me e usage nas contas Community, Pro e expiradas.
2. Confirmar 402 quando o limite de projectos é atingido, incluindo concorrência.
3. Testar reserva concorrente, libertação e ciclo UTC dos créditos no Firestore emulator.
4. Verificar flags de módulos desactivados para contas Pro.
5. Testar responsividade e modo claro/escuro da área A minha subscrição.
6. Manter a activação de cobranças reais fora deste PR.

Etapa seguinte: armazenamento verificado por objecto, seats Teams, simultaneidade distribuída e tarifário de operações GEE.