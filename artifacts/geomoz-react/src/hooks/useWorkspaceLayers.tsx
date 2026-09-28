import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface WorkspaceResultLayer {
  id: string;
  jobId: string;
  name: string;
  analysisType: string;
  tileUrl: string;
  visible: boolean;
  opacity: number;
  createdAt: string;
  source?: string | null;
}

interface WorkspaceLayersContextValue {
  resultLayers: WorkspaceResultLayer[];
  setResultLayers: (layers: WorkspaceResultLayer[]) => void;
  upsertResultLayer: (layer: WorkspaceResultLayer) => void;
  toggleResultLayer: (layerId: string) => void;
  setResultLayerOpacity: (layerId: string, opacity: number) => void;
  removeResultLayer: (layerId: string) => void;
  clearResultLayers: () => void;
}

const WorkspaceLayersContext = createContext<WorkspaceLayersContextValue | null>(null);

export function WorkspaceLayersProvider({ children }: { children: ReactNode }) {
  const [resultLayers, setResultLayersState] = useState<WorkspaceResultLayer[]>([]);

  const setResultLayers = useCallback((layers: WorkspaceResultLayer[]) => {
    setResultLayersState(Array.isArray(layers) ? layers : []);
  }, []);

  const upsertResultLayer = useCallback((layer: WorkspaceResultLayer) => {
    setResultLayersState(current => {
      const existing = current.find(item => item.id === layer.id);
      if (!existing) return [layer, ...current];
      return current.map(item => item.id === layer.id ? { ...item, ...layer } : item);
    });
  }, []);

  const toggleResultLayer = useCallback((layerId: string) => {
    setResultLayersState(current => current.map(layer =>
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    ));
  }, []);

  const setResultLayerOpacity = useCallback((layerId: string, opacity: number) => {
    const safeOpacity = Math.max(0, Math.min(1, opacity));
    setResultLayersState(current => current.map(layer =>
      layer.id === layerId ? { ...layer, opacity: safeOpacity } : layer
    ));
  }, []);

  const removeResultLayer = useCallback((layerId: string) => {
    setResultLayersState(current => current.filter(layer => layer.id !== layerId));
  }, []);

  const clearResultLayers = useCallback(() => {
    setResultLayersState([]);
  }, []);

  const value = useMemo<WorkspaceLayersContextValue>(() => ({
    resultLayers,
    setResultLayers,
    upsertResultLayer,
    toggleResultLayer,
    setResultLayerOpacity,
    removeResultLayer,
    clearResultLayers,
  }), [
    resultLayers,
    setResultLayers,
    upsertResultLayer,
    toggleResultLayer,
    setResultLayerOpacity,
    removeResultLayer,
    clearResultLayers,
  ]);

  return (
    <WorkspaceLayersContext.Provider value={value}>
      {children}
    </WorkspaceLayersContext.Provider>
  );
}

export function useWorkspaceLayers() {
  const value = useContext(WorkspaceLayersContext);
  if (!value) {
    throw new Error("useWorkspaceLayers must be used inside WorkspaceLayersProvider");
  }
  return value;
}
