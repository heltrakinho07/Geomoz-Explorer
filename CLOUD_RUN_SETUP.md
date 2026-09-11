# Configuração do Google Cloud Run via GitHub Actions

## Pré-requisitos

1. **Conta Google Cloud** com projeto ativo
2. **Repositório GitHub** do projeto
3. **gcloud CLI** instalado (opcional, para configuração inicial)

## Passo 1: Configurar o Google Cloud

### 1.1 Criar/Selecionar Projeto
```bash
gcloud projects list
# ou criar novo:
gcloud projects create seu-project-id
```

### 1.2 Ativar APIs Necessárias
```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com
```

### 1.3 Criar Artifact Registry
```bash
gcloud artifacts repositories create geomoz-explorer-api \
  --repository-format=docker \
  --location=europe-west1 \
  --description="Repositório Docker para GeoMoz Explorer"
```

### 1.4 Criar Service Account
```bash
gcloud iam service-accounts create geomoz-deployer \
  --display-name="GeoMoz Deployer" \
  --project=seu-project-id
```

### 1.5 Atribuir Permissões à Service Account
```bash
# Permissão para fazer deploy no Cloud Run
gcloud projects add-iam-policy-binding seu-project-id \
  --member="serviceAccount:geomoz-deployer@seu-project-id.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Permissão para acessar Artifact Registry
gcloud projects add-iam-policy-binding seu-project-id \
  --member="serviceAccount:geomoz-deployer@seu-project-id.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Permissão para Cloud Build
gcloud projects add-iam-policy-binding seu-project-id \
  --member="serviceAccount:geomoz-deployer@seu-project-id.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"
```

## Passo 2: Configurar Workload Identity Federation

### 2.1 Criar Workload Identity Pool
```bash
gcloud iam workload-identity-pools create github-pool \
  --project=seu-project-id \
  --location=global \
  --display-name="GitHub Pool"
```

### 2.2 Criar Workload Identity Provider
```bash
gcloud iam workload-identity-pools providers create github-provider \
  --project=seu-project-id \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --oidc-issuer-uri="https://token.actions.githubusercontent.com"
```

### 2.3 Permitir Autenticação da Service Account
```bash
gcloud iam service-accounts add-iam-policy-binding geomoz-deployer@seu-project-id.iam.gserviceaccount.com \
  --project=seu-project-id \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/seu-project-id/locations/global/workloadIdentityPools/github-pool/attribute.repository/seu-usuario/Geomoz-Explorer"
```

**Nota:** Substitua `seu-usuario` pelo seu username do GitHub e `Geomoz-Explorer` pelo nome do repositório.

## Passo 3: Configurar Secrets no GitHub

Vá ao repositório GitHub: **Settings → Secrets and variables → Actions**

Adicione os seguintes secrets:

| Secret Name | Valor |
|-------------|-------|
| `GCP_PROJECT_ID` | seu-project-id |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | projects/seu-project-id/locations/global/workloadIdentityPools/github-pool/providers/github-provider |
| `GCP_SERVICE_ACCOUNT` | geomoz-deployer@seu-project-id.iam.gserviceaccount.com |

## Passo 4: Ajustar Workflow (se necessário)

Se precisar alterar a região ou nome do serviço, edite `.github/workflows/cloud-run-deploy.yml`:

```yaml
env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: europe-west1  # Altere se necessário
  SERVICE_NAME: geomoz-explorer-api  # Altere se necessário
  IMAGE_NAME: geomoz-explorer-api  # Altere se necessário
```

## Passo 5: Deploy Inicial

1. Faça commit e push das alterações:
```bash
git add .github/workflows/cloud-run-deploy.yml
git commit -m "Add Cloud Run deployment workflow"
git push origin main
```

2. O workflow será executado automaticamente no push para `main`

3. Acompanhe o deploy em: **Actions → Deploy to Google Cloud Run**

## Passo 6: Verificar Deploy

Após o deploy bem-sucedido:

```bash
gcloud run services describe geomoz-explorer-api \
  --platform managed \
  --region europe-west1 \
  --format 'value(status.url)'
```

## Troubleshooting

### Erro: Permission denied
Verifique se a service account tem as permissões corretas:
```bash
gcloud iam service-accounts get-iam-policy geomoz-deployer@seu-project-id.iam.gserviceaccount.com
```

### Erro: Repository not found
Verifique se o Artifact Registry foi criado:
```bash
gcloud artifacts repositories list --location=europe-west1
```

### Erro: Workload Identity falha
Verifique se o mapping do repositório está correto no passo 2.3. O formato deve ser exato:
`principalSet://iam.googleapis.com/projects/PROJECT_ID/locations/global/workloadIdentityPools/POOL_ID/attribute.repository/USERNAME/REPO_NAME`

## Variáveis de Ambiente Adicionais

Se precisar adicionar variáveis de ambiente (ex: chaves de API do Google Earth Engine):

1. Adicione no GitHub Secrets:
   - `GEE_SERVICE_ACCOUNT_JSON` (conta de serviço do GEE)

2. Atualize o workflow para passar as variáveis:
```yaml
--set-env-vars PORT=5003,PYTHONUNBUFFERED=1,GEE_SERVICE_ACCOUNT_JSON=${{ secrets.GEE_SERVICE_ACCOUNT_JSON }}
```

## Regiões Disponíveis

- europe-west1 (Bélgica)
- europe-west2 (Londres)
- europe-west3 (Frankfurt)
- europe-west4 (Países Baixos)
- europe-west6 (Zurique)
- europe-southwest1 (Madrid)
- europe-north1 (Finlândia)

Escolha a região mais próxima dos seus usuários.
