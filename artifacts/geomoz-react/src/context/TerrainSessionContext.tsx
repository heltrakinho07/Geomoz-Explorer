import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TerrainMeshData } from "@/lib/terrain-webgl";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/context/ProjectContext";

interface TerrainSession {
  terrain: TerrainMeshData | null;
  setTerrain: (value: TerrainMeshData | null) => void;
}

/** One shared in-memory 3D DEM scene for the GeoMoz Explorer's analytical tabs.
 * The numeric grid is NOT written to Firestore, localStorage or a remote cache.
 * Changing the authenticated user or active project invalidates the old model.
 */
const TerrainSessionContext = createContext<TerrainSession | undefined>(undefined);

export function TerrainSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const ownerKey = [user?.uid ?? "guest", activeProject?.id ?? "no-project"].join(":");
  const [session, setSession] = useState<{ key: string; terrain: TerrainMeshData | null }>({
    key: ownerKey, terrain: null,
  });
  useEffect(() => {
    setSession(previous => previous.key === ownerKey ? previous : {
      key: ownerKey, terrain: null,
    });
  }, [ownerKey]);

  const value = useMemo<TerrainSession>(() => ({
    terrain: session.key === ownerKey ? session.terrain : null,
    setTerrain: (terrain) => setSession({ key: ownerKey, terrain }),
  }), [session, ownerKey]);
  return <TerrainSessionContext.Provider value={value}>{children}</TerrainSessionContext.Provider>;
}

export function useTerrainSession(): TerrainSession {
  const context = useContext(TerrainSessionContext);
  if (!context) throw new Error("GeoMoz TerrainStudio exige TerrainSessionProvider.");
  return context;
}
