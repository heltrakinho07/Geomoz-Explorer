# GeoMoz Explorer — BYO-GEE por utilizador

## Política
Cada utilizador autentica a sua conta Google e selecciona o próprio projecto Google Cloud habilitado para Earth Engine. O Firebase Auth identifica o titular GeoMoz; as credenciais GEE ficam associadas ao UID no armazenamento privado, sem fallback para as credenciais/serviço Cloud Run do GeoMoz.

- O endpoint `GET /geomoz-api/gee/config` exige Firebase Auth e mostra **apenas** a configuração do utilizador autenticado, sem chaves, tokens, prefixos de segredos, ou projecto da infraestrutura.
- `/geomoz-api/gee/status` continua a validar a sessão e distingue ligação verificada de configuração guardada.
- Os endpoints de análises GEE usam `require_gee_auth` ou `require_pro_gee_auth`, que verificam o UID, projecto e credenciais pessoais.
- A serialização global das chamadas GEE no processo Python evita que a sessão global `ee.Initialize` seja partilhada entre dois utilizadores durante análises.
- As quotas e a eventual facturação Google Cloud/Earth Engine pertencem ao projecto do utilizador, sujeitas às condições da Google. **Não cobrar créditos GeoMoz adicionais apenas pelo cálculo remoto executado na própria conta GEE do utilizador.**
- Os serviços próprios do GeoMoz — IA gerida, impressão PDF em workers privados, armazenamento e processamento no Cloud Run — podem continuar sujeitos às quotas comerciais publicadas, quando realmente aplicadas.

## Regressão
Testar configuração de Alice e Bob com credenciais/projectos distintos; conta sem ligação; env server `GEE_PROJECT_ID` e `GEE_SERVICE_ACCOUNT_KEY` presentes sem aparecimento na resposta; falha de Firestore; Firebase não autenticado; troca de conta Google, expiração e reconexão. Verificar em Cloud Run com duas contas reais antes de publicar.

Não alterar `GEOMOZ_ENFORCE_AI_CREDITS`, `GEOMOZ_ENFORCE_PROCESSING_PLAN` ou a facturação ao publicar esta correcção. Não foi activado qualquer GEE-credit-metering.
