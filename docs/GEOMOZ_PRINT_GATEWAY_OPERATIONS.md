# GeoMoz Cartographic Print Gateway — provisioning and acceptance

Issue: https://github.com/heltrakinho07/Geomoz-Explorer/issues/265

## Request flow

1. An authenticated GIS Workspace user chooses PyQGIS or Cartopy and clicks
   "Exportar PDF". The existing same-origin auth iframe returns a short-lived
   Firebase ID token only in response to a validated first-party request.
2. POST /geomoz-api/v1/prints uses Authorization: Bearer [Firebase ID token]
   and an Idempotency-Key, validates the bounded GeoJSON job schema, looks up
   the server-owned plan and atomically enforces per-user print limits.
3. The normalized input JSON is stored in a PRIVATE Google Cloud Storage bucket.
   A task is queued on Cloud Tasks with a signed Google OIDC service-account
   identity, never a browser-provided credential.
4. The authenticated internal task route requests a PDF from the selected
   private PyQGIS or Cartopy worker using a Google-signed Cloud Run ID token
   (Authorization: Bearer) **and** an independent server-only worker secret
   (X-Geomoz-Worker-Token). Both gates must pass before rendering.
   Successful PDF bytes are validated and stored privately; job status is
   updated to succeeded/failed and active quota is released.
5. The browser polls the Firebase-authenticated status endpoint and fetches
   GET /geomoz-api/v1/prints/{jobId}/result with the same Firebase token.
   Only the owner can download; the PDF has no public GCS URL.
6. Job result access expires after two hours; an external GCS lifecycle
   policy deletes input and output objects. Firestore TTL can remove job docs
   using the dedicated expireAt timestamp field.

## Provisioning — explicit manual action (not executed by merging)

The repository includes `.github/workflows/geomoz-print-private-provision.yml`
and `scripts/cloud/geomoz-print-provision.sh`. The workflow is **manual only**;
a merge does not create or bill GCP resources. Open
[Actions → Provision GeoMoz private print infrastructure](https://github.com/heltrakinho07/Geomoz-Explorer/actions/workflows/geomoz-print-private-provision.yml),
choose `plan` to see the non-mutating preview, or `apply` and enter the exact
confirmation `APPLY_PRIVATE_PRINT_INFRA`. Apply uses GitHub Workload Identity
Federation and requires a GCP deployment service account with permission to
create Cloud Run services, IAM bindings, Cloud Tasks, GCS and Secret Manager
resources. GitHub environment `production` may require additional reviewers
if configured.

The script is idempotent: it reuses existing service accounts, secret,
bucket and queue; creates two IAM-only Cloud Run workers, rejects public
worker invoker grants, then activates the existing API gateway via environment
variables. Existing GEE settings and the API runtime identity are preserved.

**Billing/cost:** Cloud Run CPU/memory, image storage, Cloud Tasks dispatches,
Secret Manager and GCS storage may incur charges. Apply requires deliberate
operator approval. Do not run in an unverified project.

## Production configuration — not automatically provisioned

The API cannot print until all these variables are configured in the
Cloud Run service geomoz-explorer-api:

    GEOMOZ_PRINT_BUCKET=your-private-gcs-bucket
    GEOMOZ_PRINT_TASKS_QUEUE=projects/PROJECT/locations/europe-west1/queues/geomoz-prints
    GEOMOZ_PRINT_TASKS_SERVICE_ACCOUNT=geomoz-print-tasks@PROJECT.iam.gserviceaccount.com
    GEOMOZ_PRINT_DISPATCH_URL=https://API_RUN_URL/geomoz-api/v1/prints/internal/dispatch
    GEOMOZ_PRINT_PYQGIS_URL=https://PRIVATE_PYQGIS_ENDPOINT/v1/print/pdf
    GEOMOZ_PRINT_CARTOPY_URL=https://PRIVATE_CARTOPY_ENDPOINT/v1/print/pdf
    GEOMOZ_PRINT_WORKER_TOKEN=SecretManager:geomoz-print-worker-token
    GEOMOZ_PRINT_WORKER_AUTH_MODE=iam
    GEOMOZ_PRINT_REQUIRE_APP_CHECK=false

Never commit an actual token or put the worker token in Vite environment
variables. Use Cloud Run Secret Manager integration for the worker token.

## Required infrastructure

- A uniform-bucket-level-access Google Cloud Storage bucket with public
  access prevention. Allow only the API runtime service account to read/write
  objects under geomoz-prints/ and configure a lifecycle Delete rule after
  1 day. Storage TTL is managed independently of the API.
- A Cloud Tasks queue with limited concurrent jobs and backoff:
  recommended max two running tasks per gateway service and retry policy.
- A dedicated Cloud Tasks service account. Grant only the minimum role to
  enqueue tasks to the gateway's runtime service account and permission for
  the Tasks service agent to sign task OIDC tokens. The gateway verifies the
  signed token, issuer, audience and exact service account email itself.
- PyQGIS and Cartopy workers deployed to private, HTTPS-reachable endpoints
  accessible ONLY to the gateway's service identity/network. The workers
  require a Google-signed Cloud Run invoker token and an independent private
  worker-secret header. Local Docker Compose remains bound to loopback.
- Firestore IAM access for the gateway runtime service account, and Firestore
  TTL policy for printJobs.expireAt if automatic metadata cleanup is desired.
- Worker Cloud Run services use `--invoker-iam-check` and are **not**
  accessible to unauthenticated callers; only the existing API Cloud Run
  service identity receives `roles/run.invoker`. The endpoint URLs can be
  resolved publicly, but IAM denies anonymous access. The script verifies
  their policy and `/health` anonymous response before enabling printing.
- Cloud Run's `Authorization: Bearer <Google ID token>` is separate from
  `X-Geomoz-Worker-Token: <Secret Manager secret>`, so the two mechanisms
  are not competing for the same header.
- Explicitly verify workers' IAM policy on subsequent deploys. App Check
  is initially optional pending a standalone GIS Workspace integration.

Never pass worker tokens from the browser. The gateway IAM worker mode only
accepts `*.run.app` hosts, and OAuth tokens are scoped to the destination
service origin. Configure private workers via the provisioning script rather
than copying an arbitrary HTTPS endpoint.

## Scope and plan limits

The remote printing feature uses the existing server-owned cloud_jobs
entitlement. Community users retain local offline printing. For entitled
accounts, the initial monthly quotas are Academic 30, Pro 150, Teams 500
and Enterprise 2000. A per-minute limit of four and existing plan
concurrency limits are enforced using Firestore transactions and expiring
active-job leases. The client cannot change its plan or quota.

Current schema: A4/A3 PDF, GeoJSON WGS84 input, EPSG:4326/UTM, geodetic
graticules for both motors and metric UTM grid on PyQGIS only.
COG/GeoTIFF, WMS/WMTS, Earth Engine layers and advanced QGIS symbology
are NOT yet wired to this printing gateway. Integration from GeoAnálises,
GeoMoz AI, Hidrologia and other modules remains follow-up work.

## Acceptance and release gates

- [x] Firebase UID enforced on create, poll and download; owner-only PDF.
- [x] Google OIDC verified for internal tasks; no browser-supplied worker token.
- [x] Firestore quota, concurrency, idempotency and bounded input.
- [x] Task queue and Cloud Storage PDF processing code.
- [x] GIS Workspace Export PDF, progress, preview/download and JSON fallback.
- [x] Unit and simulated end-to-end tests added to CI.
- [x] Manual, explicit-approval IAM worker/bucket/queue provisioning automation added.
- [ ] Execute provisioning in the GCP project and verify actual resources.
- [ ] Confirm Firebase App Check strategy for the standalone GIS bundle.
- [ ] Validate real Cloud Tasks → workers → owner-authenticated gateway download
  after provisioning (mocked tests do not prove cloud execution).
- [ ] Wire remaining GIS/GeoAnálises/AI/Hidrologia module print actions.
- [ ] Confirm production rendering, internationalisation and bucket lifecycle.
- [ ] Verify Cloud Run deployment and user-visible workflow in production.

The issue MUST NOT be closed while any live production acceptance gate
above remains incomplete. An unconfigured gateway intentionally returns
HTTP 503 rather than exposing an insecure fallback service.
