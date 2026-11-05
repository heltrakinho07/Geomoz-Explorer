import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, type Firestore } from "firebase/firestore";
import { deleteObject, getBytes, getDownloadURL, listAll, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import { loadGISWorkspaceFromCloud, syncGISWorkspaceToCloud } from "@/services/gisWorkspaceCloudService";
import { loadGISWorkspaceSnapshot, saveGISWorkspaceSnapshot, saveGISWorkspaceRasterFile, type GISWorkspaceSnapshot } from "@/lib/gis-workspace-persistence";

const client = vi.hoisted(() => ({ db: null as unknown as Firestore, storage: null as unknown as FirebaseStorage }));
vi.mock("@/lib/firebase", () => ({ get db() { return client.db; }, get storage() { return client.storage; } }));

const projectId = "demo-geomoz-gis";
let env: RulesTestEnvironment;
function signIn(uid: string | null) {
  const context = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  client.db = context.firestore() as unknown as Firestore;
  client.storage = context.storage() as unknown as FirebaseStorage;
}
function snapshot(project = "project-a"): Omit<GISWorkspaceSnapshot, "version" | "updatedAt"> {
  return {
    projectId: project,
    layers: [{ id: "points", name: "Pontos", color: "#2563eb", visible: true,
      featureCount: 1, geometryType: "Point", fields: ["name"],
      geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "Maputo" }, geometry: { type: "Point", coordinates: [32.6, -25.9] } }] } }],
    rasters: [], services: [], selectedLayerId: "points", secondLayerId: "", tableLayerId: "points",
    history: [], modelNodes: [], modelEdges: [], activeTab: "vector_toolbox", basemap: "hybrid",
  };
}

beforeAll(async () => {
  // Fail explicitly if invoked without emulators; production must never be used.
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error("Run with Firebase emulators:exec and project demo-geomoz-gis.");
  }
  env = await initializeTestEnvironment({ projectId,
    firestore: { host: "127.0.0.1", port: 8085, rules: readFileSync("../../firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: readFileSync("../../storage.rules", "utf8") },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("geomoz-gis-workspace");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  signIn("alice");
});
afterAll(async () => { await env?.cleanup(); });

describe("Workspace service against Firestore and Storage emulators", () => {
  it("restores vector content, order, view and raster bytes with an empty local cache", async () => {
    const data = snapshot();
    const bytes = new Uint8Array([73, 73, 42, 0, 8, 0, 0, 0]);
    await saveGISWorkspaceRasterFile("alice::project-a", "raster", new File([bytes], "tiny.tif", { type: "image/tiff" }));
    data.rasters = [{ id: "raster", name: "Raster", fileName: "tiny.tif", mimeType: "image/tiff", sizeBytes: bytes.length, visible: true, opacity: 0.7 }];
    await syncGISWorkspaceToCloud("alice", data);
    // A new SDK context has no Firestore client cache; cloud restore does not
    // read IndexedDB. The 8 bytes test persistence, not GeoTIFF rendering.
    signIn("alice");
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("geomoz-gis-workspace");
      request.onsuccess = () => resolve();
    });
    const restored = await loadGISWorkspaceFromCloud("alice", "project-a");
    expect(restored?.layers).toEqual(data.layers);
    expect(restored?.selectedLayerId).toBe("points");
    expect(restored?.tableLayerId).toBe("points");
    expect(restored?.rasters[0]).toMatchObject({ id: "raster", opacity: 0.7, sourceType: "storage" });
    const response = await fetch(restored!.rasters[0].remoteUrl!);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("keeps same project IDs independent between two users and two projects", async () => {
    await syncGISWorkspaceToCloud("alice", snapshot());
    const other = snapshot("project-b"); other.layers[0].name = "Outro projecto";
    await syncGISWorkspaceToCloud("alice", other);
    signIn("bob");
    const bob = snapshot(); bob.layers[0].name = "Bob";
    await syncGISWorkspaceToCloud("bob", bob);
    expect((await loadGISWorkspaceFromCloud("bob", "project-a"))?.layers[0].name).toBe("Bob");
    signIn("alice");
    expect((await loadGISWorkspaceFromCloud("alice", "project-a"))?.layers[0].name).toBe("Pontos");
    expect((await loadGISWorkspaceFromCloud("alice", "project-b"))?.layers[0].name).toBe("Outro projecto");
  });

  it("does not publish or delete existing layers when a raster has no durable file", async () => {
    await syncGISWorkspaceToCloud("alice", snapshot());
    const broken = snapshot(); broken.layers = [];
    broken.rasters = [{ id: "missing", name: "Missing", fileName: "missing.tif", mimeType: "image/tiff", sizeBytes: 1, visible: true, opacity: 1 }];
    await expect(syncGISWorkspaceToCloud("alice", broken)).rejects.toThrow(/indisponíveis/);
    expect((await loadGISWorkspaceFromCloud("alice", "project-a"))?.layers).toHaveLength(1);
  });

  it("preserves committed vector bytes if publication fails after an upload", async () => {
    await syncGISWorkspaceToCloud("alice", snapshot());
    const broken = snapshot();
    broken.layers[0].geojson.features[0].properties = { name: "changed" };
    broken.basemap = "x".repeat(1_100_000); // Exceeds Firestore's document limit.
    await expect(syncGISWorkspaceToCloud("alice", broken)).rejects.toThrow();
    expect((await loadGISWorkspaceFromCloud("alice", "project-a"))?.layers[0].geojson.features[0].properties?.name).toBe("Maputo");
  });

  it("rejects a manifest with a missing object or a foreign project path", async () => {
    await syncGISWorkspaceToCloud("alice", snapshot());
    const manifest = doc(client.db, "users/alice/projects/project-a/workspaceLayers/points");
    const path = (await getDoc(manifest)).data()!.objectPath;
    await deleteObject(ref(client.storage, path));
    await expect(loadGISWorkspaceFromCloud("alice", "project-a")).rejects.toThrow();
    await setDoc(manifest, { objectPath: "users/bob/projects/project-a/vectors/secret.geojson" }, { merge: true });
    await expect(loadGISWorkspaceFromCloud("alice", "project-a")).rejects.toThrow(/fora do projecto/);
  });

  it("removes stale manifests and objects only after a complete save", async () => {
    await syncGISWorkspaceToCloud("alice", snapshot());
    const path = (await getDoc(doc(client.db, "users/alice/projects/project-a/workspaceLayers/points"))).data()!.objectPath;
    const empty = snapshot(); empty.layers = [];
    await syncGISWorkspaceToCloud("alice", empty);
    expect((await loadGISWorkspaceFromCloud("alice", "project-a"))?.layers).toEqual([]);
    await expect(getDownloadURL(ref(client.storage, path))).rejects.toThrow();
  });

  it("detects tampered vector bytes and a missing committed manifest", async () => {
    await syncGISWorkspaceToCloud("alice", snapshot());
    const manifest = doc(client.db, "users/alice/projects/project-a/workspaceLayers/points");
    const path = (await getDoc(manifest)).data()!.objectPath;
    await uploadBytes(ref(client.storage, path), new TextEncoder().encode(JSON.stringify({ type: "FeatureCollection", features: [] })));
    await expect(loadGISWorkspaceFromCloud("alice", "project-a")).rejects.toThrow(/Integridade/);
    await deleteDoc(manifest);
    await expect(loadGISWorkspaceFromCloud("alice", "project-a")).rejects.toThrow(/incompleto/);
  });

  it("restores external raster metadata and optional history provenance", async () => {
    const data = snapshot();
    data.rasters = [{ id: "remote", name: "COG", fileName: "remote.tif", mimeType: "image/tiff", sizeBytes: 0,
      visible: false, opacity: 0.4, sourceType: "url", remoteUrl: "https://example.org/cog.tif" }];
    data.history = [{ id: "h1", toolId: "vector_buffer", toolName: "Buffer", engine: "Client (Turf.js)",
      timestamp: "10:00", durationMs: 1, inputLayerName: "Pontos", outputCount: 1, status: "success", parameters: { distance: 100 },
      provenance: { algorithm: "vector_buffer", inputLayerId: "points", overlayLayerId: null, outputLayerId: "buffer", inputFeatureCount: 1, overlayFeatureCount: null, completedAt: "2026-10-16T00:00:00Z" } }];
    await syncGISWorkspaceToCloud("alice", data);
    const restored = await loadGISWorkspaceFromCloud("alice", "project-a");
    expect(restored?.rasters[0]).toMatchObject(data.rasters[0]);
    expect(restored?.history).toEqual(data.history);
  });
});

describe.each(["bob", null])("rules deny another identity (%s)", (uid) => {
  it("denies get, list, create, update and delete for Alice's workspace", async () => {
    await syncGISWorkspaceToCloud("alice", snapshot());
    await uploadBytes(ref(client.storage, "users/alice/projects/project-a/vectors/private.geojson"), new Uint8Array([1]));
    signIn(uid);
    const base = "users/alice/projects/project-a";
    for (const path of [`${base}/workspace/state`, `${base}/workspaceLayers/points`]) {
      await assertFails(getDoc(doc(client.db, path)));
      await assertFails(setDoc(doc(client.db, path), { visible: false }, { merge: true }));
      await assertFails(deleteDoc(doc(client.db, path)));
    }
    await assertFails(setDoc(doc(client.db, `${base}/workspaceLayers/foreign`), { name: "forged" }));
    await assertFails(getDocs(collection(client.db, `${base}/workspaceLayers`)));
    const object = ref(client.storage, `${base}/vectors/private.geojson`);
    await assertFails(uploadBytes(object, new Uint8Array([1])));
    await assertFails(getBytes(object));
    await assertFails(getDownloadURL(object));
    await assertFails(deleteObject(object));
    await assertFails(listAll(ref(client.storage, `${base}/vectors`)));
  });
});

it("persists local snapshots on transaction completion and isolates the UID cache key", async () => {
  await saveGISWorkspaceSnapshot({ ...snapshot(), projectId: "alice::cache" });
  expect((await loadGISWorkspaceSnapshot("alice::cache"))?.layers).toEqual(snapshot().layers);
  expect(await loadGISWorkspaceSnapshot("bob::cache")).toBeNull();
});

it("rejects a raster cache write rolled back after request success", async () => {
  const original = IDBObjectStore.prototype.put;
  const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
    const request = original.call(this, value, key);
    request.addEventListener("success", () => this.transaction.abort());
    return request;
  });
  try {
    await expect(saveGISWorkspaceRasterFile("alice::rollback", "r", new File(["bytes"], "r.tif"))).rejects.toThrow(/abortada/);
  } finally { put.mockRestore(); }
});
