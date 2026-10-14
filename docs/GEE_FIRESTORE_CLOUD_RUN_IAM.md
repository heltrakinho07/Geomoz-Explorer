# Reparar acesso do Cloud Run ao Firestore (GEE)

**Projecto:** `geoprocessamento-426809`  
**Serviço:** `geomoz-explorer-api`  
**Região:** `europe-west1`  

## O que significa o erro

`Não foi possível consultar as credenciais GEE no Firestore` é uma falha **da identidade de execução do backend** ou da base de dados. Não significa que o utilizador não esteja registado no Google Earth Engine. O Firebase Admin SDK utiliza IAM para ler `geePrivateSessions/{Firebase UID}`, de forma inacessível ao cliente web.

## Diagnóstico/auto-reparação

O workflow [Diagnose and Repair GeoMoz GEE Firestore Access](../.github/workflows/gee-firestore-remediation.yml) inicia quando o ficheiro é adicionado à `main` e pode ser executado manualmente pelo separador Actions.

1. Usa o **Workload Identity Federation** existente, não chaves JSON públicas.
2. Identifica a conta de serviço efectivamente configurada no Cloud Run (ou a conta padrão da Compute Engine, caso não exista uma explícita).
3. Verifica a existência da base de dados Firestore `(default)`. **Não cria bases de dados**, porque a localização da base é uma escolha do proprietário.
4. Tenta atribuir **apenas** `roles/datastore.user` à identidade efectiva do Cloud Run. A identidade do GitHub precisa de `resourcemanager.projects.setIamPolicy`. Se a permissão faltar, o workflow **falha** e apresenta o comando exacto que um administrador IAM pode executar. Não concede permissões adicionais ao GitHub nem aos utilizadores web.
5. Recolhe unicamente categorias de erros do Cloud Run, sem tokens, chaves ou documentos privados.

Se o workflow falhar na verificação da base de dados, confirme-a em [Cloud Firestore](https://console.cloud.google.com/firestore/databases?project=geoprocessamento-426809). Se falhar na atribuição IAM, abra [IAM](https://console.cloud.google.com/iam-admin/iam?project=geoprocessamento-426809) e aplique a função `Cloud Datastore User` à conta de serviço **indicada nos logs do workflow**. Não use indiscriminadamente o e-mail de utilizador do Google Earth Engine ou a conta de serviço do Firebase Hosting.

## Teste depois da reparação

No GeoMoz: Definições → Google Earth Engine → **Voltar a verificar a API**. Espera-se que a mensagem de indisponibilidade do Firestore desapareça e seja substituída por "Ainda não há uma conta Earth Engine ligada" ou pelo estado real da sessão. Só depois clique **Ligar com a Conta Google**, com o projecto `geoprocessamento-426809`.

Observação: a publicação de regras de Firestore/Storage em GitHub Actions usa outra identidade/permissões (`roles/firebaserules.admin`, etc.). Não confundir com o acesso do backend pelo Firebase Admin SDK.

Documentação: https://firebase.google.com/docs/firestore/security/iam .
