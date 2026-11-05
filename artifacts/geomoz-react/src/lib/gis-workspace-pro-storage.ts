/**
 * Reserved GIS Workspace Pro storage bridge.
 *
 * This module preserves the existing Firestore + Firebase Storage + IndexedDB
 * infrastructure for a future paid plan. It is intentionally NOT called from
 * the default local GIS Workspace: opt-in and server-side subscription
 * enforcement must ship together before enabling cloud operations in the UI.
 *
 * All Pro data stays scoped by Firebase UID + project ID. This bridge makes
 * authentication/entitlement a prerequisite, but security MUST also be
 * enforced in Firebase Security Rules (client checks are not a paywall).
 */
import type { User } from "firebase/auth";
import type { GISWorkspaceSnapshot } from "@/lib/gis-workspace-persistence";
import type { GISWorkspaceRasterLayer } from "@/lib/gis-raster";

export interface ProGISStorageIdentity {
  uid: string;
  projectId: string;
  cacheKey: string;
}

export function isGeoMozProClaim(claims: Record<string, unknown>): boolean {
  // Only server-issued custom claims, never editable user profile fields.
  return claims.geomoz_pro === true || claims.geomozPro === true;
}

export async function requireProGISStorageIdentity(
  user: Pick<User, "uid" | "getIdTokenResult"> | null,
  projectId: string | null | undefined,
): Promise<ProGISStorageIdentity> {
  if (!user || !user.uid || user.uid === "guest_user" ||
      user.uid.startsWith("guest_") || !projectId || projectId === "session-default") {
    throw new Error("O armazenamento GIS Pro requer uma conta autenticada e um projecto.");
  }
  const token = await user.getIdTokenResult(true);
  if (!isGeoMozProClaim(token.claims)) {
    throw new Error("A sincronização Pro ainda não está autorizada para esta conta.");
  }
  if (user.uid.includes("/") || projectId.includes("/") || projectId.includes("..")) {
    throw new Error("Identificador de projecto ou utilizador inválido.");
  }
  return { uid: user.uid, projectId, cacheKey: `${user.uid}::${projectId}` };
}

/**
 * Future Pro restore. Reads an offline IndexedDB cache and a cloud snapshot,
 * but does not write anything or replace an existing local editing session.
 * The caller must obtain explicit user consent before applying either copy.
 */
export async function inspectProGISWorkspace(
  identity: ProGISStorageIdentity,
): Promise<{
  local: GISWorkspaceSnapshot | null;
  cloud: GISWorkspaceSnapshot | null;
}> {
  const [persistence, cloudService] = await Promise.all([
    import("@/lib/gis-workspace-persistence"),
    import("@/services/gisWorkspaceCloudService"),
  ]);
  const [local, cloud] = await Promise.all([
    persistence.loadGISWorkspaceSnapshot(identity.cacheKey),
    cloudService.loadGISWorkspaceFromCloud(identity.uid, identity.projectId),
  ]);
  return { local, cloud };
}

/**
 * Future Pro save. Explicit only, never invoked by local-only mode.
 * Uses the existing authenticated cloud service and IndexedDB cache.
 */
export async function saveProGISWorkspace(
  identity: ProGISStorageIdentity,
  state: Omit<GISWorkspaceSnapshot, "version" | "updatedAt">,
  rasters: GISWorkspaceRasterLayer[],
): Promise<void> {
  if (state.projectId !== identity.projectId) {
    throw new Error("A sincronização GIS Pro não pode alterar outro projecto.");
  }
  const [persistence, cloudService] = await Promise.all([
    import("@/lib/gis-workspace-persistence"),
    import("@/services/gisWorkspaceCloudService"),
  ]);
  // IndexedDB keeps the same legacy per-user keys for later recovery.
  await persistence.saveGISWorkspaceSnapshot({ ...state, projectId: identity.cacheKey });
  await persistence.syncGISWorkspaceRasterFiles(identity.cacheKey, rasters);
  // A failure here is reported, not silently declared a saved cloud copy.
  await cloudService.syncGISWorkspaceToCloud(identity.uid, state);
}
