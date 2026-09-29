import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
  GeoMozProject,
  CreateProjectInput,
  UpdateProjectInput,
  StudyRun,
} from "../types/project";

// Firestore collection references
const getProjectsCol = (uid: string) => collection(db, "users", uid, "projects");
const getProjectDoc = (uid: string, projectId: string) =>
  doc(db, "users", uid, "projects", projectId);
const getRunsCol = (uid: string, projectId: string) =>
  collection(db, "users", uid, "projects", projectId, "runs");
const getRunDoc = (uid: string, projectId: string, runId: string) =>
  doc(db, "users", uid, "projects", projectId, "runs", runId);

/**
 * Recursively removes undefined fields from an object so Firestore never rejects it.
 */
export function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as any;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined) as any;
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = stripUndefined(value);
    }
  }
  return result;
}

// ── Local Storage Dual-Persistence Helpers ─────────────────────────────────────
const LOCAL_PROJECTS_KEY = (uid: string) => `geomoz_projects_${uid}`;
const LOCAL_RUNS_KEY = (uid: string, projId: string) => `geomoz_runs_${uid}_${projId}`;

export function getLocalProjects(uid: string): GeoMozProject[] {
  try {
    const raw = localStorage.getItem(LOCAL_PROJECTS_KEY(uid));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalProjects(uid: string, projects: GeoMozProject[]): void {
  try {
    localStorage.setItem(LOCAL_PROJECTS_KEY(uid), JSON.stringify(projects));
  } catch {}
}

export function getLocalRuns(uid: string, projectId: string): StudyRun[] {
  try {
    const raw = localStorage.getItem(LOCAL_RUNS_KEY(uid, projectId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalRuns(uid: string, projectId: string, runs: StudyRun[]): void {
  try {
    localStorage.setItem(LOCAL_RUNS_KEY(uid, projectId), JSON.stringify(runs));
  } catch {}
}

/**
 * List all projects for a user, ordered by most recently updated
 */
export async function listUserProjects(uid: string): Promise<GeoMozProject[]> {
  const localProjects = getLocalProjects(uid);
  try {
    const q = query(getProjectsCol(uid), orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    const firestoreList = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as GeoMozProject[];

    // Merge firestore with local
    const map = new Map<string, GeoMozProject>();
    firestoreList.forEach((p) => map.set(p.id, p));
    localProjects.forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, p);
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );
    saveLocalProjects(uid, merged);
    return merged;
  } catch (error) {
    console.warn("Firestore listUserProjects fallback to localStorage:", error);
    return localProjects;
  }
}

/**
 * Real-time subscription to user projects with instant local cache fallback
 */
export function subscribeUserProjects(
  uid: string,
  onUpdate: (projects: GeoMozProject[]) => void,
  onError?: (err: Error) => void
): () => void {
  // Emit local projects immediately so loading finishes instantly
  const localInitial = getLocalProjects(uid);
  if (localInitial.length > 0) {
    onUpdate(localInitial);
  }

  // Guests are 100% client-side (no Firestore network calls)
  if (!uid || uid.startsWith("guest_")) {
    onUpdate(localInitial);
    return () => {};
  }

  try {
    const q = query(getProjectsCol(uid), orderBy("updatedAt", "desc"));
    return onSnapshot(
      q,
      (snapshot) => {
        const firestoreProjects = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as GeoMozProject[];

        const map = new Map<string, GeoMozProject>();
        firestoreProjects.forEach((p) => map.set(p.id, p));
        getLocalProjects(uid).forEach((p) => {
          if (!map.has(p.id)) map.set(p.id, p);
        });

        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        );
        saveLocalProjects(uid, merged);
        onUpdate(merged);
      },
      (error) => {
        console.warn("Firestore onSnapshot error on projects, using local cache:", error);
        if (onError) onError(error);
        onUpdate(getLocalProjects(uid));
      }
    );
  } catch (err: any) {
    console.warn("Could not attach onSnapshot, using local cache:", err);
    onUpdate(getLocalProjects(uid));
    return () => {};
  }
}

/**
 * Create a new GeoMoz project with guaranteed instant local save and background Firestore sync
 */
export async function createProject(
  uid: string,
  input: CreateProjectInput
): Promise<GeoMozProject> {
  const now = new Date().toISOString();
  const id = "proj_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

  const cleanAOI = stripUndefined(input.aoi || {});

  const newProject: GeoMozProject = {
    id,
    userId: uid,
    name: input.name.trim(),
    description: (input.description || "").trim(),
    category: input.category,
    aoi: cleanAOI,
    period: input.period,
    statsSummary: {
      totalRuns: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  // 1. Save locally immediately (guaranteed instant resolution)
  const currentList = getLocalProjects(uid);
  const updatedList = [newProject, ...currentList.filter((p) => p.id !== id)];
  saveLocalProjects(uid, updatedList);

  // 2. Persist to Firestore in background without blocking return
  if (uid && !uid.startsWith("guest_") && db) {
    try {
      const payload = stripUndefined({
        userId: uid,
        name: newProject.name,
        description: newProject.description,
        category: newProject.category,
        aoi: newProject.aoi,
        period: newProject.period,
        statsSummary: newProject.statsSummary,
        createdAt: now,
        updatedAt: now,
      });
      setDoc(doc(db, "users", uid, "projects", id), payload).catch((fsErr) => {
        console.warn("Firestore sync warning on createProject (saved locally):", fsErr);
      });
    } catch (fsErr) {
      console.warn("Firestore payload preparation warning:", fsErr);
    }
  }

  return newProject;
}

/**
 * Update an existing project
 */
export async function updateProject(
  uid: string,
  projectId: string,
  input: UpdateProjectInput
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Update locally
  const currentList = getLocalProjects(uid);
  const updatedList = currentList.map((p) => {
    if (p.id !== projectId) return p;
    return {
      ...p,
      name: input.name !== undefined ? input.name.trim() : p.name,
      description: input.description !== undefined ? input.description.trim() : p.description,
      category: input.category !== undefined ? input.category : p.category,
      aoi: input.aoi !== undefined ? stripUndefined(input.aoi) : p.aoi,
      period: input.period !== undefined ? input.period : p.period,
      updatedAt: now,
    };
  });
  saveLocalProjects(uid, updatedList);

  // 2. Persist to Firestore in background
  if (uid && !uid.startsWith("guest_") && db) {
    try {
      const docRef = getProjectDoc(uid, projectId);
      const payload: Record<string, any> = {
        updatedAt: now,
      };
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.description !== undefined) payload.description = input.description.trim();
      if (input.category !== undefined) payload.category = input.category;
      if (input.aoi !== undefined) payload.aoi = stripUndefined(input.aoi);
      if (input.period !== undefined) payload.period = input.period;

      updateDoc(docRef, stripUndefined(payload)).catch((err) => {
        console.warn("Firestore updateProject warning (updated locally):", err);
      });
    } catch (err) {
      console.warn("Firestore updateProject prep warning:", err);
    }
  }
}

/**
 * Delete a project and its runs
 */
export async function deleteProject(uid: string, projectId: string): Promise<void> {
  // 1. Delete locally
  const currentList = getLocalProjects(uid);
  saveLocalProjects(uid, currentList.filter((p) => p.id !== projectId));
  try {
    localStorage.removeItem(LOCAL_RUNS_KEY(uid, projectId));
  } catch {}

  // 2. Delete in Firestore in background
  if (uid && !uid.startsWith("guest_") && db) {
    getDocs(getRunsCol(uid, projectId))
      .then((runsSnap) => {
        const deletePromises = runsSnap.docs.map((d) => deleteDoc(d.ref));
        return Promise.all(deletePromises);
      })
      .then(() => deleteDoc(getProjectDoc(uid, projectId)))
      .catch((err) => {
        console.warn("Firestore deleteProject warning:", err);
      });
  }
}

/**
 * Add an analysis study run to a project
 */
export async function addStudyRun(
  uid: string,
  projectId: string,
  run: Omit<StudyRun, "id" | "projectId" | "createdAt">
): Promise<StudyRun> {
  const now = new Date().toISOString();
  const id = "run_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

  const cleanRun = stripUndefined({
    id,
    projectId,
    ...run,
    createdAt: now,
  }) as StudyRun;

  // 1. Save locally
  const localRuns = getLocalRuns(uid, projectId);
  saveLocalRuns(uid, projectId, [cleanRun, ...localRuns]);

  // Update project run count locally
  const projects = getLocalProjects(uid);
  saveLocalProjects(
    uid,
    projects.map((p) => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        updatedAt: now,
        statsSummary: {
          totalRuns: (p.statsSummary?.totalRuns || 0) + 1,
          lastAnalysisType: run.name,
          lastRunAt: now,
        },
      };
    })
  );

  // 2. Persist to Firestore in background
  if (uid && !uid.startsWith("guest_") && db) {
    const docRef = doc(db, "users", uid, "projects", projectId, "runs", id);
    setDoc(docRef, cleanRun).catch((err) => {
      console.warn("Firestore addStudyRun warning (saved locally):", err);
    });

    const projectRef = getProjectDoc(uid, projectId);
    updateDoc(projectRef, {
      updatedAt: now,
      "statsSummary.lastAnalysisType": run.name,
      "statsSummary.lastRunAt": now,
    }).catch((err) => {
      console.warn("Firestore updateDoc warning (saved locally):", err);
    });
  }

  return cleanRun;
}

/**
 * List all study runs within a project
 */
export async function listStudyRuns(
  uid: string,
  projectId: string
): Promise<StudyRun[]> {
  const localRuns = getLocalRuns(uid, projectId);
  if (!uid || uid.startsWith("guest_") || !db) {
    return localRuns;
  }

  try {
    const q = query(getRunsCol(uid, projectId), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const firestoreRuns = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as StudyRun[];

    const map = new Map<string, StudyRun>();
    firestoreRuns.forEach((r) => map.set(r.id, r));
    localRuns.forEach((r) => {
      if (!map.has(r.id)) map.set(r.id, r);
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    saveLocalRuns(uid, projectId, merged);
    return merged;
  } catch (err) {
    console.warn("Firestore listStudyRuns warning, using local cache:", err);
    return localRuns;
  }
}

/**
 * Delete a specific study run
 */
export async function deleteStudyRun(
  uid: string,
  projectId: string,
  runId: string
): Promise<void> {
  // 1. Delete locally
  const localRuns = getLocalRuns(uid, projectId);
  saveLocalRuns(uid, projectId, localRuns.filter((r) => r.id !== runId));

  // 2. Delete in Firestore in background
  if (uid && !uid.startsWith("guest_") && db) {
    deleteDoc(getRunDoc(uid, projectId, runId)).catch((err) => {
      console.warn("Firestore deleteStudyRun warning:", err);
    });
  }
}
