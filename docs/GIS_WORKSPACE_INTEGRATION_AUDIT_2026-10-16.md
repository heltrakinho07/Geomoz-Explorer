# GIS Workspace: integration audit (2026-10-16)

Base: `main` at `cbcaab82101657ea2216aff10dbeb3f2633667ef` (merged PR #77).
No synced project references or production user data were modified during testing.

## Findings and repairs

- Autosave coalescing shared one pending slot across projects/users. Queue entries
  now coalesce only within a UID/project key, preserving other pending saves.
- Vector uploads overwrote committed object bytes before the full save succeeded.
  Changed content now uses immutable hash paths. All manifests, deletions and
  workspace state publish in one Firestore batch after uploads finish. A rejected
  publication leaves the previous committed content readable.
- Firestore rejects undefined optional metadata. Publication serializes optional
  fields before writing, including nested history/provenance.
- A missing raster file silently returned success without a manifest. This now
  rejects the save. Hydration retains missing raster metadata and blocks cloud
  autosave rather than dropping the layer. Cloud raster URLs take precedence over
  potentially stale cached files.
  Source readiness is recalculated for each save, so removing/replacing a
  missing raster restores cloud sync without reloading; failed cloud hydration
  remains blocked regardless of subsequent raster edits.
- Cloud restore rejects foreign-project Storage paths, absent committed
  manifests, missing vector objects and vector SHA-256 mismatches.
- IndexedDB request success preceded transaction commit. Cache writes now settle
  on transaction completion and reject aborts.
- Changing user/project or unmounting now aborts the active vector worker.
  Runner regressions cover late success after abort, timeout and mismatched IDs.
- The centroid algorithm averaged vertices, which differs from a geometric
  centroid. It now weights polygon areas (subtracting holes), multipart polygon
  areas and line segment lengths. Coordinates remain Cartesian in the input CRS.
- Dissolve errors previously returned the unchanged input as a successful result.
  They now throw. Vector input validation rejects malformed and self-crossing
  polygon geometry before processing.

## Executed validation

- 74 tests across the 16 frontend suites used by CI, including 9 independent
  GEOS/analytic reference tests, passed locally.
- 12 Firestore/Storage emulator integration tests passed locally. They exercise
  the production workspace service using Firebase SDKs and the repository's actual
  security rules, with IndexedDB supplied by fake-indexeddb. The SDK instances
  come from rules-unit-testing authenticated and unauthenticated contexts.
- Project TypeScript checks passed; frontend production build passed. Existing
  build warnings include large bundles and browser externalization in lerc.
- CI now runs emulator integration with Java 21 and a demo project, and requires
  that job before the production-build check. Emulator configuration is separate
  from production Firebase configuration. No credentials are needed for this job.

Emulator cases cover vector metadata/content, raster bytes and opacity, a cold
cloud restore with an empty IndexedDB cache, two users sharing a project ID,
multiple projects for one user, foreign/anonymous CRUD and list denial in both
services, failed publication after uploading changed data, missing raster source,
missing/tampered vector objects, missing manifests, external raster metadata,
history provenance, stale-layer cleanup, local UID isolation and transaction abort.
The raster byte fixture is deliberately minimal and is **not** a rendering test.

Independent fixtures were generated with **Shapely 2.1.2 / GEOS 3.13.1** using
`scripts/generate-gis-geos-reference.py`. Tests compare intersection, difference
and dissolve topology and planar area, centroid coordinates for asymmetric
polygons, holes, unequal multipart polygons and unequal line segments, reject a
GEOS-invalid self-crossing polygon, and check spherical line distance analytically.
Planar coordinates have a 1e-10 comparison tolerance; the spherical metric check
allows its existing two-decimal output rounding. GEOS buffers in degree units
are not presented as reference metre buffers.

## Reproduction

```text
pnpm install --no-frozen-lockfile
pnpm run test:gis:firebase
pnpm --dir artifacts/geomoz-react exec vitest run src/lib/__tests__/gis-geos-reference.test.ts
pnpm run typecheck
```

Use Java 21 for emulators. On the Windows desktop used for this audit, the
preinstalled PDF24 Java runtime lacked `jdk.httpserver`; a complete Temurin JRE
was downloaded into ignored `.cache/`. Its Unix socket temporary directory also
needed a short Windows path. Those machine-specific settings are not required by
the Linux CI job and are not part of production configuration.

## Boundaries and remaining production acceptance

- **No real authenticated two-user browser test was executed.** Emulator
  identities are simulated; they do not validate Google login, deployed IAM,
  production rules propagation, CORS, raster rendering or session refresh.
  Firebase CLI had no authenticated session, so production database edition was
  not independently inspected. Existing default database/SDK configuration is
  preserved; no database provisioning or edition change is included.
- Worker cancellation tests use a controlled Worker double. They validate runner
  lifecycle, rejection and stale-message handling; actual browser CPU interruption
  and UI interaction still need a browser acceptance run.
- Firebase token download URLs are bearer links. Rules isolation tests validate
  authenticated SDK access and denial of another user's paths; they do not claim
  that a deliberately shared download token becomes unusable to its recipient.
- Autosave ordering is per mounted workspace queue. Simultaneous edits from
  multiple devices/tabs still have no conflict resolution. Firestore publication
  is atomic, but uploads and publication across Storage/Firestore are not one
  distributed transaction. Old content revisions and failed uploads can remain
  orphaned; automatic garbage collection is outside this change.
- The atomic batch limit is guarded before upload (at most 500 document writes).
  Retained layer revisions are preserved for readers of the previous manifest.
- QGIS GUI was not run. GEOS reference checks are deterministic Cartesian
  equivalents, not a general certification for every CRS or topology. Turf
  geographic metrics use a sphere; engineering accuracy requires an appropriate
  projected/geodesic workflow and separate domain acceptance.

Production acceptance with authorised real sessions should still import vectors
and a valid GeoTIFF, save, refresh/reopen, compare data and rendering, switch
projects/users, test offline recovery and cancel a large vector job. Report those
results separately from emulator/CI evidence.
