#!/usr/bin/env bash
# Run from a reviewed repository checkout in Cloud Shell.
set -euo pipefail
MODE="${1:-plan}"
PROJECT="${GCP_PROJECT_ID:-geoprocessamento-426809}"
REGION="${GCP_REGION:-europe-west1}"
API_SERVICE=geomoz-explorer-api
SERVICE=geomoz-gempy
QUEUE=geomoz-geology
BUCKET="${PROJECT}-geological-models"
WORKER_SA="geomoz-geology-worker@${PROJECT}.iam.gserviceaccount.com"
TASK_SA="geomoz-geology-tasks@${PROJECT}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/geomoz-explorer-api/${SERVICE}:$(git rev-parse --short=12 HEAD)"
if [[ "$MODE" == plan ]]; then
  cat <<EOF
Project: $PROJECT; region: $REGION
Private worker: $SERVICE (2 CPU, 2 GiB, concurrency 1, max instances 2, min instances 0)
Queue: $QUEUE (2 simultaneous dispatches, max 3 attempts)
Private bucket: gs://$BUCKET (retained until user deletion)
Dedicated worker/task identities; authenticated API owns user access.
Apply with: bash scripts/cloud/geomoz-geology-provision.sh apply
EOF
  exit 0
fi
[[ "$MODE" == apply && "$PROJECT" == geoprocessamento-426809 ]] || { echo 'Use plan or apply with the expected project.' >&2; exit 2; }
for command in gcloud docker python3; do command -v "$command" >/dev/null; done
API_SA="$(gcloud run services describe "$API_SERVICE" --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
[[ "$API_SA" == *@*.iam.gserviceaccount.com || "$API_SA" == *@developer.gserviceaccount.com ]] || { echo 'API service identity missing.' >&2; exit 1; }
gcloud services enable run.googleapis.com cloudtasks.googleapis.com storage.googleapis.com firestore.googleapis.com artifactregistry.googleapis.com --project="$PROJECT" --quiet
for identity in geomoz-geology-worker geomoz-geology-tasks; do
  if ! gcloud iam service-accounts describe "$identity@$PROJECT.iam.gserviceaccount.com" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$identity" --project="$PROJECT" --quiet
  fi
done
if ! gcloud storage buckets describe "gs://$BUCKET" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --project="$PROJECT" --location="$REGION" --uniform-bucket-level-access --public-access-prevention --quiet
fi
gcloud storage buckets update "gs://$BUCKET" --uniform-bucket-level-access --public-access-prevention --quiet
for account in "$WORKER_SA" "$API_SA"; do
  gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$account" --role=roles/storage.objectAdmin --quiet >/dev/null
done
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$WORKER_SA" --role=roles/datastore.user --condition=None --quiet >/dev/null
if ! gcloud tasks queues describe "$QUEUE" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  gcloud tasks queues create "$QUEUE" --project="$PROJECT" --location="$REGION" --quiet
fi
gcloud tasks queues update "$QUEUE" --project="$PROJECT" --location="$REGION" --max-concurrent-dispatches=2 --max-dispatches-per-second=1 --max-attempts=3 --min-backoff=30s --max-backoff=60s --quiet
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$API_SA" --role=roles/cloudtasks.enqueuer --condition=None --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$TASK_SA" --project="$PROJECT" --member="serviceAccount:$API_SA" --role=roles/iam.serviceAccountUser --quiet >/dev/null
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker build -f services/geomoz-gempy/Dockerfile -t "$IMAGE" .
docker run --rm --entrypoint python "$IMAGE" -c 'import engine,service; print(service.health())'
docker push "$IMAGE"
gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$IMAGE" --service-account="$WORKER_SA" --no-allow-unauthenticated --cpu=2 --memory=2Gi --concurrency=1 --min-instances=0 --max-instances=2 --timeout=600s --update-env-vars="GEOMOZ_GEOLOGY_BUCKET=$BUCKET,GEOMOZ_GEOLOGY_TASK_ACCOUNT=$TASK_SA" --quiet
URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" --update-env-vars="GEOMOZ_GEOLOGY_WORKER_URL=$URL" --quiet
gcloud run services add-iam-policy-binding "$SERVICE" --project="$PROJECT" --region="$REGION" --member="serviceAccount:$TASK_SA" --role=roles/run.invoker --quiet >/dev/null
gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json | python3 -c 'import sys,json; p=json.load(sys.stdin); assert not any(m in ("allUsers","allAuthenticatedUsers") for b in p.get("bindings",[]) if b["role"]=="roles/run.invoker" for m in b.get("members",[])), "Worker must be private"'
# New module settings only; preserve GEE, billing and print configuration.
gcloud run services update "$API_SERVICE" --project="$PROJECT" --region="$REGION" --update-env-vars="GEOMOZ_GEOLOGY_ENABLED=true,GEOMOZ_GEOLOGY_BUCKET=$BUCKET,GEOMOZ_GEOLOGY_QUEUE=projects/$PROJECT/locations/$REGION/queues/$QUEUE,GEOMOZ_GEOLOGY_TASK_ACCOUNT=$TASK_SA,GEOMOZ_GEOLOGY_WORKER_URL=$URL" --quiet
printf 'Worker deployed. Validate a real authenticated model at https://geomoz.geolithica.com/geologia-3d\n'
