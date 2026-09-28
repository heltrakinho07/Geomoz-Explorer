# GeoMoz Project Output Assets

## Objetivo

Project Outputs guardam metadados e evidência compacta no Firestore. Mapas
renderizados, imagens e futuros anexos binários devem ficar no Firebase /
Google Cloud Storage.

Nunca guardar PNG, GeoTIFF ou outros binários directamente no Firestore.

## Bucket

Produção:

```text
geoprocessamento-426809.firebasestorage.app
```

O backend resolve o bucket nesta ordem:

1. `GEOMOZ_STORAGE_BUCKET`
2. `FIREBASE_STORAGE_BUCKET`
3. Firebase project ID / `GOOGLE_CLOUD_PROJECT`

O workflow do Cloud Run define explicitamente:

```text
GEOMOZ_STORAGE_BUCKET=geoprocessamento-426809.firebasestorage.app
```

## Estrutura privada

```text
users/
  {uid}/
    projects/
      {project_id}/
        outputs/
          {output_id}/
            map.png
```

O Firestore guarda apenas:

```json
{
  "assets": {
    "map": {
      "storage_path": "users/.../map.png",
      "content_type": "image/png",
      "size_bytes": 123456,
      "kind": "map_snapshot",
      "bounds": {
        "south": -18.0,
        "north": -16.0,
        "west": 32.0,
        "east": 34.0
      }
    }
  }
}
```

Nenhuma URL pública ou signed URL permanente é persistida.

## IAM necessário

O service account que executa o Cloud Run precisa ler, criar, substituir e
eliminar objectos no bucket GeoMoz.

Conceder a função no bucket, não no projecto inteiro, sempre que possível:

```bash
gcloud storage buckets add-iam-policy-binding   gs://geoprocessamento-426809.firebasestorage.app   --member="serviceAccount:CLOUD_RUN_SERVICE_ACCOUNT"   --role="roles/storage.objectAdmin"
```

Substituir `CLOUD_RUN_SERVICE_ACCOUNT` pelo service account associado ao
serviço `geomoz-explorer-api`.

Para consultar:

```bash
gcloud run services describe geomoz-explorer-api   --region=europe-west1   --format="value(spec.template.spec.serviceAccountName)"
```

## Segurança

- O bucket não precisa ser público.
- O frontend não lê o objecto directamente.
- `GET /geomoz-api/outputs/{output_id}/map` exige Firebase Auth.
- O backend verifica ownership do output antes de ler o objecto.
- O relatório HTML recebe a imagem como data URI gerada server-side.
- Eliminar o output tenta eliminar também os assets associados.

## Lifecycle do snapshot

```text
AnalysisJob completed
  ↓
Guardar relatório
  ↓
Project Output criado/actualizado
  ↓
AOI / bounds resolvidos
  ↓
tile/GeoJSON ainda válido
  ↓
Cartopy gera mapa
  ↓
PNG privado no Storage
  ↓
asset metadata no Firestore
  ↓
HTML incorpora PNG
```

A geração é **best effort**. Falha de basemap, tile ou Storage não impede a
criação do entregável textual.

## Dependências de renderização

A imagem Docker deve incluir:

- matplotlib
- cartopy
- contextily
- matplotlib-scalebar

O Dockerfile instala estas dependências via `requirements-api.txt`.

## Recursos mínimos sugeridos

O workflow usa:

```text
CPU:    1
RAM:    1 GiB
Timeout: 300 s
```

O aumento de 512 MiB para 1 GiB reduz o risco de OOM durante renderizações
Cartopy em resolução de impressão.
