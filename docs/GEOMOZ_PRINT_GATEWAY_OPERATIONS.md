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
   private PyQGIS or Cartopy worker using the server-only worker secret.
   Successful PDF bytes are validated and stored privately; job status is
   updated to succeeded/failed and active quota is released.
5. The browser polls the Firebase-authenticated status endpoint and fetches
   GET /geomoz-api/v1/prints/{jobId}/result with the same Firebase token.
   Only the owner can download; the PDF has no public GCS URL.
6. Job result access expires after two hours; an external GCS lifecycle
   policy deletes input and output objects. Firestore TTL can remove job docs
   using the dedicated expireAt timestamp field.

## Production configuration — NOT provisioned automatically

The API cannot print until all these variables are configured in the
Cloud Run service geomoz-explorer-api:

    GEOMOZ_PRINT_BUCKET=your-private-gcs-bucket
    GEOMOZ_PRINT_TASKS_QUEUE=projects/PROJECT/locations/europe-west1/queues/geomoz-prints
    GEOMOZ_PRINT_TASKS_SERVICE_ACCOUNT=geomoz-print-tasks@PROJECT.iam.gserviceaccount.com
    GEOMOZ_PRINT_DISPATCH_URL=https://API_RUN_URL/geomoz-api/v1/prints/internal/dispatch
    GEOMOZ_PRINT_PYQGIS_URL=https://PRIVATE_PYQGIS_ENDPOINT/v1/print/pdf
    GEOMOZ_PRINT_CARTOPY_URL=https://PRIVATE_CARTOPY_ENDPOINT/v1/print/pdf
    GEOMOZ_PRINT_WORKER_TOKEN=SecretManager:geomoz-print-worker-token
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
  already require the shared server-side token and remain bound to loopback
  when run using Docker Compose. Do not open their ports to the Internet.
- Firestore IAM access for the gateway runtime service account, and Firestore
  TTL policy for printJobs.expireAt if automatic metadata cleanup is desired.
- Explicit operational checks for ingress, VPC egress and worker certificate
  validity. Cloud Run private IAM-only endpoints cannot be called with a
  different bearer worker token unless the network/identity layer is adapted;
  use a private HTTPS worker ingress with the existing worker-secret protocol.

Do not enable worker URLs based solely on receiving an HTTP 200 from a public
untrusted hostname; that would risk leakage of the private worker credential.
Network access to the workers must be constrained operationally.

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
- [ ] Provision and configure actual private worker endpoints, bucket and queue.
- [ ] Confirm Firebase App Check strategy for the standalone GIS bundle.
- [ ] Validate real Cloud Tasks → workers → signed gateway download in staging.
- [ ] Wire remaining GIS/GeoAnálises/AI/Hidrologia module print actions.
- [ ] Confirm production rendering, internationalisation and bucket lifecycle.
- [ ] Verify Cloud Run deployment and user-visible workflow in production.

The issue MUST NOT be closed while any live production acceptance gate
above remains incomplete. An unconfigured gateway intentionally returns
HTTP 503 rather than exposing an insecure fallback service.
