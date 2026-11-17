# GeoMoz Geological Modelling Studio — beta

A primeira versão em `/geologia-3d` permite importar contactos e orientações CSV, organizar interfaces, calcular com GemPy em CPU, explorar superfícies 3D, gerar secções XZ/YZ, guardar execuções no projecto e exportar/reabrir JSON completo. Exemplos são sintéticos, não dados geológicos de Moçambique. A visualização usa as malhas calculadas pelo GemPy, com projecção ortográfica interactiva em Canvas, sem exigir WebGL.

## Âmbito científico

- Uma sequência estratigráfica, até oito interfaces e uma falha que desloca toda a sequência. Cada interface define a **base** da unidade; o embasamento é implícito.
- X Este, Y Norte, Z cota positiva para cima, em metros. `LOCAL` ou EPSG projectado em metros. Não há reprojecção automática.
- Azimute é **direcção de inclinação**, no sentido horário a partir do Norte, não rumo; inclinação 0–90° e polaridade ±1.
- Mínimo de três contactos não colineares e uma orientação por interface. Limites: 250 contactos, 100 orientações, grelha 16³/24³/32³, 1 MB de entrada e 16 MB de saída.
- Malhas extraídas com octree, refinamento 4. Secções amostram classes nos centros da grelha densa, ordem C `((ix * ny) + iy) * nz + iz`. Eixos das secções têm escalas visuais independentes, explicitamente indicadas.
- GemPy 2026.0.3 / gempy_engine 2026.0.3.post1, NumPy float64, CPU. Versões fixadas em `requirements.txt`.
- Testes de referência: interfaces horizontais a 600/400 m, falha com deslocamento de 400 m, coordenadas UTM grandes e reprodução após reabertura. Geometrias correspondem aos exemplos [jan_models model1/model5](https://github.com/cgre-aachen/gempy_data/tree/master/data/input_data/jan_models).

Ainda não abrange topografia/DEM, interpretação de sondagens, múltiplas falhas e séries, discordâncias, edição gráfica de atitudes, volumes, topologia, gravimetria, inversão ou probabilidades. Não anuncia equivalência integral ao GemPy. As superfícies são interpretações dos dados e hipóteses, não observações directas.

## Execução e privacidade

A API verifica Firebase, módulo administrativo e direito `cloud_jobs`. Firestore guarda metadados/quota em colecções exclusivamente do servidor (`geologicalJobs`, `geologicalQuotas`), protegidas pelas regras existentes de negação por omissão. GCS privado guarda entradas/resultados; os clientes só os recebem através da API autenticada. O worker aceita apenas OIDC da identidade de tarefas, além do IAM Cloud Run.

A reserva transaccional verifica que o projecto pertence ao utilizador, impede pedidos duplicados e limita uma tarefa activa e 100 modelos guardados por utilizador. Limites beta mensais: Academic 10, Pro 40, Teams 100, Enterprise 200. Contam tentativas aceites, incluindo falhas; não descontam créditos do ledger geral. Não são quotas por membro partilhadas. Chaves de idempotência têm `expireAt` para limpeza administrativa futura; sem TTL configurado permanecem guardadas. Eliminar um modelo não devolve a quota mensal. Os resultados são retidos até eliminação explícita.

Cada lease tem token próprio e resultado com nome único. Cancelar ou substituir o lease impede que um processo antigo publique resultados. O cálculo corre num subprocesso terminado em caso de cancelamento ou após 440 s; jobs pendentes expiram após 15 min e são reconciliados ao consultar o histórico. Não se executa código, pickle ou URLs fornecidos pelo cliente.

## Publicação e activação no GCP

O merge publica a interface e a API pelos workflows existentes. **O motor novo não fica activo só com o merge.** Até ao provisionamento, a interface informa que o cálculo está indisponível; permite preparar dados e abrir resultados JSON.

Na Cloud Shell, a partir da raiz de um checkout actualizado e revisto deste repositório:

```bash
git switch main
git pull --ff-only
bash scripts/cloud/geomoz-geology-provision.sh plan
bash scripts/cloud/geomoz-geology-provision.sh apply
```

Requer permissões administrativas GCP e Docker; usa `geoprocessamento-426809`, `europe-west1`, Artifact Registry e API já existentes. O script cria bucket privado, identidades dedicadas e fila, testa a imagem, publica worker privado com 2 CPU/2 GiB, concorrência 1 e 0–2 instâncias, verifica IAM e activa apenas as novas variáveis da API. Há custos de execução/armazenamento conforme utilização. Não configura GPU, domínio novo ou credenciais GEE.

Aceitação após activação: entrar com plano elegível; seleccionar um projecto guardado na nuvem; calcular **Exemplo: estratos**, verificar superfícies a 600/400 m; reabrir após actualizar a página; calcular **Exemplo: falha**, explorar XZ/YZ; testar cancelamento e confirmar que outro utilizador não acede ao ID. Confirmar o estado `succeeded` real, não apenas saúde do container. A pré-visualização de desenvolvimento com transporte simulado não substitui esta validação.

Para suspender novos cálculos mantendo acesso aos ficheiros existentes:

```bash
gcloud run services update geomoz-explorer-api \
  --project=geoprocessamento-426809 --region=europe-west1 \
  --update-env-vars GEOMOZ_GEOLOGY_ENABLED=false
```

O controlo administrativo `geological_modelling` desactiva também a rota e endpoints. Workers e API precisam da mesma versão do contrato; repetir o script após mudanças do motor. Não atribuir acesso público ao worker ou bucket.

## Validação local

```bash
python -m venv .venv-geology
. .venv-geology/bin/activate
pip install -r services/geomoz-gempy/requirements.txt pytest httpx firebase-admin
PYTHONPATH=geomoz-explorer:services/geomoz-gempy OPENBLAS_NUM_THREADS=1 \
  python -m pytest --noconftest -q services/geomoz-gempy/tests
npx --yes firebase-tools@14.22.0 emulators:exec --config firebase.emulators.json \
  --only firestore --project demo-geomoz-geology \
  'python -m pytest --noconftest -q services/geomoz-gempy/tests/test_firestore.py'
pnpm --dir artifacts/geomoz-react exec vitest run \
  src/lib/__tests__/geological-model.test.ts src/pages/__tests__/GeologicalStudio.test.tsx
```

Os testes Firestore são ignorados na primeira chamada quando não há emulador; a segunda verifica transacções reais concorrentes, isolamento, quotas, cancelamento e rejeição de leases antigos.

## Atribuição e código-fonte

[GemPy](https://github.com/gempy-project/gempy) e [GemPy Engine](https://github.com/gempy-project/gempy_engine) são projectos dos respectivos autores sob EUPL-1.2. A licença completa e o aviso de copyright upstream estão em `LICENSE` e são incluídos na imagem. Esta integração é código novo; não altera o código instalado de GemPy. O adaptador, contrato, gateway e interface estão disponíveis neste repositório e ligados na interface. Manter estes avisos e acesso ao código correspondente nas versões distribuídas/comunicadas.
