import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isGeoMozProClaim,
  requireProGISStorageIdentity,
} from "../gis-workspace-pro-storage";
import type { User } from "firebase/auth";

function fakeUser(uid: string, claims: Record<string, unknown>): Pick<User, "uid" | "getIdTokenResult"> {
  return {
    uid,
    getIdTokenResult: vi.fn(async () => ({ claims }) as Awaited<ReturnType<User["getIdTokenResult"]>>),
  };
}
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("GIS Workspace cloud infrastructure preserved for Pro", () => {
  it("never confuses a user-editable plan field with trusted Firebase claims", () => {
    expect(isGeoMozProClaim({ plan: "pro", tier: "pro", role: "admin" })).toBe(false);
    expect(isGeoMozProClaim({ geomoz_pro: true })).toBe(true);
    expect(isGeoMozProClaim({ geomozPro: true })).toBe(true);
    expect(isGeoMozProClaim({ geomoz_pro: "true" })).toBe(false);
  });

  it("rejects guests and non-Pro identities before reading cloud state", async () => {
    await expect(requireProGISStorageIdentity(null, "project1")).rejects.toThrow("conta autenticada");
    await expect(requireProGISStorageIdentity(fakeUser("guest_user", { geomoz_pro: true }), "project1"))
      .rejects.toThrow("conta autenticada");
    await expect(requireProGISStorageIdentity(fakeUser("u1", {}), "project1"))
      .rejects.toThrow("ainda não está autorizada");
    await expect(requireProGISStorageIdentity(fakeUser("u1", { geomoz_pro: true }), null))
      .rejects.toThrow("conta autenticada");
  });

  it("scopes future Pro data by verified Firebase UID and active project", async () => {
    const account = fakeUser("uid_123", { geomoz_pro: true });
    expect(await requireProGISStorageIdentity(account, "projectABC")).toEqual({
      uid: "uid_123", projectId: "projectABC", cacheKey: "uid_123::projectABC",
    });
    expect(account.getIdTokenResult).toHaveBeenCalledWith(true);
    await expect(requireProGISStorageIdentity(account, "../foreign")).rejects.toThrow("inválido");
  });

  it("retains Firestore/Storage/IndexedDB modules and restrictive project ownership rules", () => {
    const cloud = read("src/services/gisWorkspaceCloudService.ts");
    const indexed = read("src/lib/gis-workspace-persistence.ts");
    const pro = read("src/lib/gis-workspace-pro-storage.ts");
    const local = read("src/pages/GeoProcessamento.tsx");
    expect(cloud).toContain("syncGISWorkspaceToCloud");
    expect(cloud).toContain("loadGISWorkspaceFromCloud");
    expect(cloud).toContain("firebase/storage");
    expect(indexed).toContain("indexedDB");
    expect(pro).toContain('import("@/services/gisWorkspaceCloudService")');
    expect(pro).toContain('import("@/lib/gis-workspace-persistence")');
    expect(pro).toContain("server-side subscription");
    expect(local).not.toContain("syncGISWorkspaceToCloud(");
  });
});
