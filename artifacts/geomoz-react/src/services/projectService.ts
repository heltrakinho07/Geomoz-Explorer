import {
  collection,
  doc,
  addDoc,
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
 * List all projects for a user, ordered by most recently updated
 */
export async function listUserProjects(uid: string): Promise<GeoMozProject[]> {
  try {
    const q = query(getProjectsCol(uid), orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as GeoMozProject[];
  } catch (error) {
    console.error("Error listing user projects from Firestore:", error);
    // Fallback if index on updatedAt is still propagating or not yet populated
    try {
      const snapshot = await getDocs(getProjectsCol(uid));
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as GeoMozProject[];
      return list.sort(
        (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      );
    } catch (fallbackErr) {
      console.error("Fallback listing projects also failed:", fallbackErr);
      return [];
    }
  }
}

/**
 * Real-time subscription to user projects
 */
export function subscribeUserProjects(
  uid: string,
  onUpdate: (projects: GeoMozProject[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(getProjectsCol(uid), orderBy("updatedAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const projects = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as GeoMozProject[];
      onUpdate(projects);
    },
    (error) => {
      console.error("Firestore onSnapshot error on projects:", error);
      if (onError) onError(error);
    }
  );
}

/**
 * Create a new GeoMoz project in Firestore
 */
export async function createProject(
  uid: string,
  input: CreateProjectInput
): Promise<GeoMozProject> {
  const now = new Date().toISOString();
  const projectData: Omit<GeoMozProject, "id"> = {
    userId: uid,
    name: input.name.trim(),
    description: (input.description || "").trim(),
    category: input.category,
    aoi: input.aoi,
    period: input.period,
    statsSummary: {
      totalRuns: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(getProjectsCol(uid), projectData);
  return {
    id: docRef.id,
    ...projectData,
  };
}

/**
 * Update an existing project
 */
export async function updateProject(
  uid: string,
  projectId: string,
  input: UpdateProjectInput
): Promise<void> {
  const docRef = getProjectDoc(uid, projectId);
  const now = new Date().toISOString();
  const payload: Record<string, any> = {
    updatedAt: now,
  };

  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.description !== undefined) payload.description = input.description.trim();
  if (input.category !== undefined) payload.category = input.category;
  if (input.aoi !== undefined) payload.aoi = input.aoi;
  if (input.period !== undefined) payload.period = input.period;

  await updateDoc(docRef, payload);
}

/**
 * Delete a project and its runs
 */
export async function deleteProject(uid: string, projectId: string): Promise<void> {
  // Delete all study runs in the subcollection first
  try {
    const runsSnap = await getDocs(getRunsCol(uid, projectId));
    const deletePromises = runsSnap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn("Non-fatal: could not clear subcollection runs before deleting project", err);
  }

  // Delete project document
  await deleteDoc(getProjectDoc(uid, projectId));
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
  const runPayload: Omit<StudyRun, "id"> = {
    projectId,
    ...run,
    createdAt: now,
  };

  const docRef = await addDoc(getRunsCol(uid, projectId), runPayload);

  // Update project metadata (increment totalRuns, update lastAnalysisType and updatedAt)
  try {
    const projectRef = getProjectDoc(uid, projectId);
    const pSnap = await getDoc(projectRef);
    if (pSnap.exists()) {
      const current = pSnap.data() as GeoMozProject;
      const currentTotal = current.statsSummary?.totalRuns || 0;
      await updateDoc(projectRef, {
        updatedAt: now,
        "statsSummary.totalRuns": currentTotal + 1,
        "statsSummary.lastAnalysisType": run.name,
        "statsSummary.lastRunAt": now,
      });
    }
  } catch (updateErr) {
    console.warn("Could not update project stats summary:", updateErr);
  }

  return {
    id: docRef.id,
    ...runPayload,
  };
}

/**
 * List all study runs within a project
 */
export async function listStudyRuns(
  uid: string,
  projectId: string
): Promise<StudyRun[]> {
  try {
    const q = query(getRunsCol(uid, projectId), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as StudyRun[];
  } catch (err) {
    console.warn("Ordering runs failed, reading without order:", err);
    const snapshot = await getDocs(getRunsCol(uid, projectId));
    const list = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as StudyRun[];
    return list.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
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
  await deleteDoc(getRunDoc(uid, projectId, runId));

  // Decrement totalRuns in project
  try {
    const projectRef = getProjectDoc(uid, projectId);
    const pSnap = await getDoc(projectRef);
    if (pSnap.exists()) {
      const current = pSnap.data() as GeoMozProject;
      const currentTotal = current.statsSummary?.totalRuns || 1;
      await updateDoc(projectRef, {
        "statsSummary.totalRuns": Math.max(0, currentTotal - 1),
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (updateErr) {
    console.warn("Could not update project stats summary on run deletion:", updateErr);
  }
}
