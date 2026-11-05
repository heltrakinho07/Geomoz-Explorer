# GeoMoz Explorer — diagnosticar Failed to fetch no Google Earth Engine

## Arquitectura corrigida

- Frontend: Firebase Hosting `https://geomoz.geolithica.com`.
- API: Google Cloud Run `geomoz-explorer-api` na região `europe-west1`.
- Google Cloud/Firebase: `geoprocessamento-426809`.
- Frontend chama agora **`/geomoz-api/**` no mesmo domínio**. O `firebase.json` encaminha este prefixo para o Cloud Run. Em produção, NÃO configure `VITE_API_BASE` para o URL directo do Cloud Run.
- O ecrã de ligação lê antecipadamente `GET /geomoz-api/gee/oauth/capabilities` autenticado via Firebase, antes de abrir o popup Google.

## Testes de disponibilidade, sem segredos

1. Em `https://geomoz.geolithica.com/geomoz-api/health`, a resposta esperada é JSON `{"status":"ok", ...}`, e não HTML, erro 404, 403 ou 502.
2. Abra `https://geoprocessamento-426809.web.app/geomoz-api/health` e confirme que também recebe JSON.
3. Com sessão GeoMoz, em **Definições > Google Earth Engine**, clique **Testar Conexão em Tempo Real**. Ausência de ligação pessoal é diferente de API inacessível.
4. Em DevTools (Network), confirme que `/geomoz-api/gee/status` e `/geomoz-api/gee/oauth/capabilities` são chamadas ao domínio GeoMoz. Verifique o **código HTTP**. `401` = Firebase inválido; `503` = serviços ou armazenamento privados indisponíveis; `200 connected:false` = falta autenticação GEE; falha sem código HTTP = rede ou bloqueio do navegador.
5. O workflow Firebase executa um smoke test do encaminhamento após o deploy; o workflow Cloud Run verifica `/geomoz-api/health`.

## Acesso temporário versus renovável

- **Temporário**: Google Identity Services token popup; exige nova autorização após expiração. Nunca rotular como permanente.
- **Renovável**: Google Identity Services code popup, com troca do código no servidor e refresh token armazenado por UID. Depende de **`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` configurados no Cloud Run**. Um refresh token pode ser revogado ou invalidado, logo não significa 'nunca expira'.
- A nova rota autenticada `GET /geomoz-api/gee/oauth/capabilities` indica apenas se o servidor tem as configurações necessárias, **sem divulgar segredos**. O botão escolhe um único fluxo, sem duas janelas Google consecutivas.
- O código emitido por GIS popup é trocado usando o **origin da página** (por exemplo `https://geomoz.geolithica.com`). Não usar o antigo redirect `postmessage`.
- Ao ligar outra conta Google, as credenciais anteriores do UID são substituídas: nunca se herda o refresh token antigo.
- As quotas Earth Engine dependem do **projecto Google Cloud seleccionado**, das permissões e dos limites do serviço, não apenas da identidade Firebase.

## Configuração Google Cloud necessária para acesso renovável

1. Em Google Cloud Console > Google Auth Platform > Clients, confirme que o cliente OAuth do GeoMoz é uma aplicação Web, que utiliza o mesmo ID indicado por `VITE_GOOGLE_CLIENT_ID` no frontend e `GOOGLE_CLIENT_ID` no backend.
2. Confirme **Authorized JavaScript origins**: `https://geomoz.geolithica.com` e, se usado para testes, `https://geoprocessamento-426809.web.app`. Configure os redirect URIs para os endereços exactos utilizados pelo fluxo GIS.
3. Registe um **client secret** válido no Google Secret Manager (por exemplo nome `geomoz-google-oauth-secret`) e conceda ao service account de execução do Cloud Run a função **Secret Manager Secret Accessor** apenas para esse segredo.
4. Na configuração do Cloud Run `geomoz-explorer-api`, adicione um segredo de ambiente `GOOGLE_CLIENT_SECRET` com a versão correspondente do Secret Manager, sem revelar o valor em repositórios, logs ou chat. Pode efectuar pela interface do Cloud Run > Variables & Secrets ou por `gcloud run services update geomoz-explorer-api --region=europe-west1 --update-secrets=GOOGLE_CLIENT_SECRET=geomoz-google-oauth-secret:latest`.
5. O workflow usa `--update-env-vars` e `--update-secrets` para **não apagar outros segredos existentes** durante o deploy.
6. Certifique-se de que o utilizador da Google tem Earth Engine activado e permissões para o projecto escolhido. Verifique a API `earthengine.googleapis.com` e a elegibilidade do projecto.
7. Enquanto a aplicação OAuth estiver em **Testing**, confirme que a conta com que testa aparece entre os utilizadores de teste, quando aplicável. A verificação de branding referida noutro documento é necessária para o lançamento alargado.

**Nunca** coloque client secrets, refresh tokens ou chaves privadas de contas de serviço no frontend, em repositórios públicos nem em capturas de ecrã.

## Se o problema continuar

- Se `/geomoz-api/health` não devolver JSON, resolver primeiro **DNS / Firebase Hosting / rewrite / Cloud Run / IAM do Cloud Run**. Repetir login Google não vai resolver um backend offline.
- Se o health der 200, mas a ligação mostrar 401, refazer sessão Firebase e confirmar que `geomoz.geolithica.com` é domínio autorizado no Firebase Authentication.
- Se o consentimento Google falhar, confirmar OAuth client, origin autorizado, scopes, e os utilizadores de teste / branding.
- Se o consentimento funcionar mas o GEE ficar não conectado, conferir permissões do projecto, registo Earth Engine, armazenamento seguro Firestore e Cloud Run logs, sem expor tokens.

Referências: Google Identity Services Code Model https://developers.google.com/identity/oauth2/web/guides/use-code-model ; Earth Engine auth https://developers.google.com/earth-engine/guides/auth ; Firebase Hosting to Cloud Run https://firebase.google.com/docs/hosting/cloud-run .
