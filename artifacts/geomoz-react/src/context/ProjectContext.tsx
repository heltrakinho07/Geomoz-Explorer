import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useAuth } from "../hooks/useAuth";
import {
  subscribeUserProjects,
  createProject as apiCreateProject,
  updateProject as apiUpdateProject,
  deleteProject as apiDeleteProject,
  addStudyRun as apiAddStudyRun,
  listStudyRuns as apiListStudyRuns,
  deleteStudyRun as apiDeleteStudyRun,
} from "../services/projectService";
import type {
  GeoMozProject,
  CreateProjectInput,
  UpdateProjectInput,
  StudyRun,
} from "../types/project";

interface ProjectContextType {
  projects: GeoMozProject[];
  activeProject: GeoMozProject | null;
  activeRuns: StudyRun[];
  loading: boolean;
  runsLoading: boolean;
  error: string | null;
  setActiveProject: (project: GeoMozProject | null) => void;
  setActiveProjectId: (projectId: string | null) => void;
  createProject: (input: CreateProjectInput) => Promise<GeoMozProject>;
  updateProject: (projectId: string, input: UpdateProjectInput) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  saveRunToActiveProject: (
    run: Omit<StudyRun, "id" | "projectId" | "createdAt">
  ) => Promise<StudyRun | null>;
  deleteRunFromActiveProject: (runId: string) => Promise<void>;
  refreshRuns: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const ACTIVE_PROJECT_KEY = "geomoz_active_project_id";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<GeoMozProject[]>([]);
  const [activeProject, setActiveProjectState] = useState<GeoMozProject | null>(null);
  const [activeRuns, setActiveRuns] = useState<StudyRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveUid = user?.uid || "guest_local_user";

  // Subscribe to user projects with local cache fallback
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeUserProjects(
      effectiveUid,
      (updatedProjects) => {
        setProjects(updatedProjects);
        setLoading(false);

        // Auto-select or restore active project safely (preserve reference if unchanged)
        const savedId = localStorage.getItem(ACTIVE_PROJECT_KEY);
        if (savedId) {
          const match = updatedProjects.find((p) => p.id === savedId);
          if (match) {
            setActiveProjectState((prev) => (prev?.id === match.id ? prev : match));
            return;
          }
        }

        setActiveProjectState((prev) => {
          if (!prev) return updatedProjects.length > 0 ? updatedProjects[0] : null;
          const stillExists = updatedProjects.find((p) => p.id === prev.id);
          return stillExists ? prev : (updatedProjects.length > 0 ? updatedProjects[0] : null);
        });
      },
      (err) => {
        console.warn("Projects subscription notice:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [effectiveUid]);

  // Load study runs when activeProject ID changes
  const activeProjectId = activeProject?.id;
  const refreshRuns = useCallback(async () => {
    if (!activeProjectId) {
      setActiveRuns([]);
      return;
    }

    setRunsLoading(true);
    try {
      const runs = await apiListStudyRuns(effectiveUid, activeProjectId);
      setActiveRuns(runs);
    } catch (err) {
      console.warn("Error loading project runs:", err);
    } finally {
      setRunsLoading(false);
    }
  }, [effectiveUid, activeProjectId]);

  useEffect(() => {
    refreshRuns();
  }, [refreshRuns]);

  // Set active project and save preference
  const setActiveProject = useCallback((project: GeoMozProject | null) => {
    setActiveProjectState((prev) => (prev?.id === project?.id ? prev : project));
    if (project) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  }, []);

  const setActiveProjectId = useCallback(
    (projectId: string | null) => {
      if (!projectId) {
        setActiveProject(null);
        return;
      }
      const match = projects.find((p) => p.id === projectId);
      if (match) {
        setActiveProject(match);
      }
    },
    [projects, setActiveProject]
  );

  // Create Project (infallible resolution)
  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<GeoMozProject> => {
      setError(null);
      try {
        const newProj = await apiCreateProject(effectiveUid, input);
        setActiveProject(newProj);
        return newProj;
      } catch (err: any) {
        console.error("Failed to create project:", err);
        setError("Erro ao criar projeto.");
        throw err;
      }
    },
    [effectiveUid, setActiveProject]
  );

  // Update Project
  const updateProject = useCallback(
    async (projectId: string, input: UpdateProjectInput): Promise<void> => {
      setError(null);
      try {
        await apiUpdateProject(effectiveUid, projectId, input);
      } catch (err: any) {
        console.error("Failed to update project:", err);
        setError("Erro ao atualizar projeto.");
        throw err;
      }
    },
    [effectiveUid]
  );

  // Delete Project
  const deleteProject = useCallback(
    async (projectId: string): Promise<void> => {
      setError(null);
      try {
        await apiDeleteProject(effectiveUid, projectId);
        if (activeProject?.id === projectId) {
          setActiveProject(null);
        }
      } catch (err: any) {
        console.error("Failed to delete project:", err);
        setError("Erro ao eliminar projeto.");
        throw err;
      }
    },
    [effectiveUid, activeProject?.id, setActiveProject]
  );

  // Save study run to active project
  const saveRunToActiveProject = useCallback(
    async (
      run: Omit<StudyRun, "id" | "projectId" | "createdAt">
    ): Promise<StudyRun | null> => {
      if (!activeProjectId) {
        return null;
      }

      try {
        const saved = await apiAddStudyRun(effectiveUid, activeProjectId, run);
        setActiveRuns((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
        return saved;
      } catch (err) {
        console.error("Failed to save study run to active project:", err);
        throw err;
      }
    },
    [effectiveUid, activeProjectId]
  );

  // Delete study run
  const deleteRunFromActiveProject = useCallback(
    async (runId: string): Promise<void> => {
      if (!activeProjectId) return;

      try {
        await apiDeleteStudyRun(effectiveUid, activeProjectId, runId);
        setActiveRuns((prev) => prev.filter((r) => r.id !== runId));
      } catch (err) {
        console.error("Failed to delete study run:", err);
        throw err;
      }
    },
    [effectiveUid, activeProjectId]
  );

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        activeRuns,
        loading,
        runsLoading,
        error,
        setActiveProject,
        setActiveProjectId,
        createProject,
        updateProject,
        deleteProject,
        saveRunToActiveProject,
        deleteRunFromActiveProject,
        refreshRuns,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject deve ser utilizado dentro de um ProjectProvider");
  }
  return context;
}
