#!/usr/bin/env bash
# Offline regression: GCP permissions and API activation are checked before writes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/cloud/geomoz-print-provision.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/gcloud" <<'MOCK'
#!/usr/bin/env bash
case "$1 $2" in
  "config set") exit 0 ;;
  "projects describe") echo "628082413338"; exit 0 ;;
  "run services") echo "628082413338-compute@developer.gserviceaccount.com"; exit 0 ;;
  "services list")
     if [[ "$MOCK_DENY_LIST" == 1 ]]; then
       echo "Permission denied: serviceusage.services.list" >&2
       exit 1
     fi
     printf '%s\n' \
       run.googleapis.com storage.googleapis.com iam.googleapis.com \
       secretmanager.googleapis.com artifactregistry.googleapis.com
     exit 0 ;;
  *) echo "Unexpected state-changing gcloud command: $*" >&2; exit 98 ;;
esac
MOCK
chmod +x "$TMP/gcloud"

# A plan must always succeed with no cloud access.
bash "$SCRIPT" plan >/dev/null

# Missing APIs must not be enabled with the deployment identity.
if OUTPUT="$(PATH="$TMP:$PATH" MOCK_DENY_LIST=0 \
     GEOMOZ_PRINT_APPLY_CONFIRM=APPLY_PRIVATE_PRINT_INFRA \
     bash "$SCRIPT" apply 2>&1)"; then
  echo "Unexpected provisioning success with Cloud Tasks disabled" >&2
  exit 1
else
  RC=$?
fi
[[ "$RC" == 5 ]]
grep -Fq 'Required APIs are not enabled: cloudtasks.googleapis.com' <<<"$OUTPUT"
grep -Fq 'gcloud services enable cloudtasks.googleapis.com --project=geoprocessamento-426809' <<<"$OUTPUT"

# Read-only API visibility errors must be actionable, without attempting writes.
if OUTPUT="$(PATH="$TMP:$PATH" MOCK_DENY_LIST=1 \
     GEOMOZ_PRINT_APPLY_CONFIRM=APPLY_PRIVATE_PRINT_INFRA \
     bash "$SCRIPT" apply 2>&1)"; then
  echo "Unexpected provisioning success without API listing permission" >&2
  exit 1
else
  RC=$?
fi
[[ "$RC" == 5 ]]
grep -Fq 'roles/serviceusage.serviceUsageViewer' <<<"$OUTPUT"
echo "GeoMoz print provision API permission preflight tests passed"
