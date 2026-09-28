import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";

export interface ActiveProject {
  id: string;
  name: string;
}

interface ProjectContextValue {
  activeProject: ActiveProject | null;
  setActiveProject: (project: ActiveProject | null) => void;
  clearActiveProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeProject, setActiveProjectState] = useState<ActiveProject | null>(null);

  const storageKey = user?.uid ? `geomoz.activeProject.${user.uid}` : null;

  useEffect(() => {
    if (!storageKey) {
      setActiveProjectState(null);
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      setActiveProjectState(raw ? JSON.parse(raw) : null);
    } catch {
      setActiveProjectState(null);
    }
  }, [storageKey]);

  const setActiveProject = (project: ActiveProject | null) => {
    setActiveProjectState(project);
    if (!storageKey) return;

    try {
      if (project) {
        window.localStorage.setItem(storageKey, JSON.stringify(project));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Local storage is a convenience only; Firestore remains authoritative.
    }
  };

  const value = useMemo<ProjectContextValue>(() => ({
    activeProject,
    setActiveProject,
    clearActiveProject: () => setActiveProject(null),
  }), [activeProject, storageKey]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const value = useContext(ProjectContext);
  if (!value) {
    throw new Error("useProject must be used inside ProjectProvider");
  }
  return value;
}
