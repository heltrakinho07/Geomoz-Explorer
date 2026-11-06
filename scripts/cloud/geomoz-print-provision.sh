#!/usr/bin/env bash
# GeoMoz print workers: opt-in, repeatable infrastructure provisioning.
set -euo pipefail
MODE="${1:-plan}"
PROJECT="${GCP_PROJECT_ID:-geoprocessamento-426809}"
REGION="${GCP_REGION:-europe-west1}"
API_SERVICE="geomoz-explorer-api"
PYQGIS_SERVICE="geomoz-print-pyqgis"
CARTOPY_SERVICE="geomoz-print-cartopy"
BUCKET="geomoz-print-${PROJECT}"
QUEUE="geomoz-prints"
SECRET="geomoz-print-worker-token"
TASK_ID="geomoz-print-tasks"
WORKER_ID="geomoz-print-worker"
ARTIFACT_REPO="geomoz-explorer-api"

if [[ "$MODE" != plan && "$MODE" != apply ]]; then
  echo "Usage: bash scripts/cloud/geomoz-print-provision.sh plan|apply" >&2
  exit 2
fi
if [[ "$PROJECT" != geoprocessamento-426809 || "$REGION" != europe-west1 ]]; then
  echo "Unexpected Google Cloud project or region. Refusing." >&2
  exit 2
fi
cat <<EOF
GeoMoz Print Gateway ($MODE)
Project: $PROJECT / $REGION
Private workers: $PYQGIS_SERVICE, $CARTOPY_SERVICE (Cloud Run IAM required)
Private bucket: gs://$BUCKET (1 day, no public access)
Cloud Tasks: $QUEUE (max 2 concurrent)
Worker secret in Secret Manager, never in the repository or browser.
EOF
if [[ "$MODE" == plan ]]; then
  echo "Plan only: no GCP resources have been changed."
  exit 0
fi
if [[ "${GEOMOZ_PRINT_APPLY_CONFIRM:-}" != APPLY_PRIVATE_PRINT_INFRA ]]; then
  echo "Explicit approval required for billable GCP provisioning." >&2
  exit 3
fi
for cmd in gcloud docker openssl python3 curl; do command -v "$cmd" >/dev/null; done
gcloud config set project "$PROJECT" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
TASK_SA="$TASK_ID@$PROJECT.iam.gserviceaccount.com"
WORKER_SA="$WORKER_ID@$PROJECT.iam.gserviceaccount.com"
TASKS_AGENT="service-$PROJECT_NUMBER@gcp-sa-cloudtasks.iam.gserviceaccount.com"
API_SA="$(gcloud run services describe "$API_SERVICE" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
API_SA="${API_SA:-$PROJECT_NUMBER-compute@developer.gserviceaccount.com}"
[[ "$API_SA" == *@* ]] || { echo "API service identity unknown." >&2; exit 4; }
echo "Using existing API runtime identity $API_SA"

gcloud services enable run.googleapis.com cloudtasks.googleapis.com \
  storage.googleapis.com iam.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com --project="$PROJECT" --quiet
for identity in "$TASK_ID" "$WORKER_ID"; do
  email="$identity@$PROJECT.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$email" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$identity" --display-name="GeoMoz private print $identity" --quiet
  fi
done
if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
  gcloud secrets create "$SECRET" --replication-policy=automatic --quiet
fi
if [[ -z "$(gcloud secrets versions list "$SECRET" --filter='state=ENABLED' --format='value(name)' | head -n 1)" ]]; then
  openssl rand -hex 48 | tr -d '\n' | gcloud secrets versions add "$SECRET" --data-file=- --quiet >/dev/null
fi
for account in "$API_SA" "$WORKER_SA"; do
  gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$account" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
done

if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" \
    --project="$PROJECT" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention \
    --soft-delete-duration=0 --quiet
fi
gcloud storage buckets update "gs://$BUCKET" \
  --uniform-bucket-level-access --public-access-prevention \
  --soft-delete-duration=0 --quiet
LIFECYCLE_FILE="$(mktemp)"
trap 'rm -f "$LIFECYCLE_FILE"' EXIT
printf '%s\n' '{"rule":[{"action":{"type":"Delete"},"condition":{"age":1}}]}' >"$LIFECYCLE_FILE"
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file="$LIFECYCLE_FILE" --quiet
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$API_SA" --role=roles/storage.objectAdmin --quiet >/dev/null

if ! gcloud tasks queues describe "$QUEUE" --location="$REGION" >/dev/null 2>&1; then
  gcloud tasks queues create "$QUEUE" --location="$REGION" \
    --max-dispatches-per-second=1 --max-concurrent-dispatches=2 \
    --max-attempts=3 --min-backoff=10s --max-backoff=60s --quiet
else
  gcloud tasks queues update "$QUEUE" --location="$REGION" \
    --max-dispatches-per-second=1 --max-concurrent-dispatches=2 \
    --max-attempts=3 --min-backoff=10s --max-backoff=60s --quiet
fi
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$API_SA" \
  --role=roles/cloudtasks.enqueuer --condition=None --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$TASK_SA" \
  --member="serviceAccount:$API_SA" --role=roles/iam.serviceAccountUser --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$TASKS_AGENT" --role=roles/cloudtasks.serviceAgent \
  --condition=None --quiet >/dev/null

gcloud artifacts repositories describe "$ARTIFACT_REPO" --location="$REGION" >/dev/null
REGISTRY="$REGION-docker.pkg.dev"
gcloud auth configure-docker "$REGISTRY" --quiet >/dev/null
TAG="${GITHUB_SHA:-manual}"
IMAGE_PYQGIS="$REGISTRY/$PROJECT/$ARTIFACT_REPO/$PYQGIS_SERVICE:$TAG"
IMAGE_CARTOPY="$REGISTRY/$PROJECT/$ARTIFACT_REPO/$CARTOPY_SERVICE:$TAG"
docker build -f services/geomoz-qgis-print/Dockerfile -t "$IMAGE_PYQGIS" services/geomoz-qgis-print
docker build -f services/geomoz-qgis-print/Dockerfile.cartopy -t "$IMAGE_CARTOPY" services/geomoz-qgis-print
docker push "$IMAGE_PYQGIS"
docker push "$IMAGE_CARTOPY"

deploy_worker() {
  local service="$1" image="$2" engine="$3"
  gcloud run deploy "$service" --project="$PROJECT" --region="$REGION" \
    --platform=managed --image="$image" --service-account="$WORKER_SA" \
    --invoker-iam-check --no-allow-unauthenticated --ingress=all \
    --port=8085 --memory=2Gi --cpu=2 --concurrency=1 \
    --max-instances=2 --min-instances=0 --timeout=120s \
    --update-env-vars="GEOMOZ_PRINT_ENGINE=$engine,GEOMOZ_PRINT_WORKER_AUTH=iam,GEOMOZ_PRINT_PORT=8085" \
    --update-secrets="GEOMOZ_PRINT_WORKER_TOKEN=$SECRET:latest" --quiet
  # A previous revision's public roles must not survive the deploy.
  gcloud run services remove-iam-policy-binding "$service" --region="$REGION" \
    --member=allUsers --role=roles/run.invoker --quiet >/dev/null 2>&1 || true
  gcloud run services remove-iam-policy-binding "$service" --region="$REGION" \
    --member=allAuthenticatedUsers --role=roles/run.invoker --quiet >/dev/null 2>&1 || true
  gcloud run services add-iam-policy-binding "$service" --region="$REGION" \
    --member="serviceAccount:$API_SA" --role=roles/run.invoker --quiet >/dev/null
}
deploy_worker "$PYQGIS_SERVICE" "$IMAGE_PYQGIS" pyqgis
deploy_worker "$CARTOPY_SERVICE" "$IMAGE_CARTOPY" cartopy

PYQGIS_URL="$(gcloud run services describe "$PYQGIS_SERVICE" --region="$REGION" --format='value(status.url)')"
CARTOPY_URL="$(gcloud run services describe "$CARTOPY_SERVICE" --region="$REGION" --format='value(status.url)')"
API_URL="$(gcloud run services describe "$API_SERVICE" --region="$REGION" --format='value(status.url)')"
for url in "$PYQGIS_URL" "$CARTOPY_URL" "$API_URL"; do
  [[ "$url" == https://*.run.app ]] || { echo "Invalid Cloud Run URL." >&2; exit 5; }
done

# Cloud Run IAM must reject anonymous traffic before the worker sees it.
for name in "$PYQGIS_SERVICE" "$CARTOPY_SERVICE"; do
  gcloud run services get-iam-policy "$name" --region="$REGION" --format=json | \
    python3 -c '
import json, sys
policy = json.load(sys.stdin)
public = {"allUsers", "allAuthenticatedUsers"}
assert not any(public.intersection(binding.get("members", []))
               for binding in policy.get("bindings", [])), "Public worker access found"
'
done
for url in "$PYQGIS_URL" "$CARTOPY_URL"; do
  code="$(curl -sS -o /dev/null --max-time 30 -w '%{http_code}' "$url/health")"
  if [[ "$code" != 401 && "$code" != 403 && "$code" != 404 ]]; then
    echo "Anonymous request returned HTTP $code. Gateway NOT activated." >&2
    exit 6
  fi
done

# Existing API service account, secrets and GEE configuration are preserved.
gcloud run services update "$API_SERVICE" --project="$PROJECT" --region="$REGION" \
  --update-env-vars="^@^GEOMOZ_PRINT_BUCKET=$BUCKET@GEOMOZ_PRINT_TASKS_QUEUE=projects/$PROJECT/locations/$REGION/queues/$QUEUE@GEOMOZ_PRINT_TASKS_SERVICE_ACCOUNT=$TASK_SA@GEOMOZ_PRINT_DISPATCH_URL=$API_URL/geomoz-api/v1/prints/internal/dispatch@GEOMOZ_PRINT_PYQGIS_URL=$PYQGIS_URL/v1/print/pdf@GEOMOZ_PRINT_CARTOPY_URL=$CARTOPY_URL/v1/print/pdf@GEOMOZ_PRINT_WORKER_AUTH_MODE=iam@GEOMOZ_PRINT_REQUIRE_APP_CHECK=false" \
  --update-secrets="GEOMOZ_PRINT_WORKER_TOKEN=$SECRET:latest" --quiet

curl --fail --silent --show-error --max-time 30 "$API_URL/geomoz-api/health" | \
  python3 -c 'import json,sys; assert json.load(sys.stdin).get("status") == "ok"'
echo "Gateway infrastructure applied. Verify real Firebase-authenticated PDF E2E before closing #265."
