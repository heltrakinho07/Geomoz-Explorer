import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { useAuth } from "./useAuth";
import { apiFetch } from "@/lib/api";

const geeProvider = new GoogleAuthProvider();
geeProvider.addScope("https://www.googleapis.com/auth/earthengine");
geeProvider.setCustomParameters({
  prompt: "consent",
  access_type: "offline",
});

const LOCAL_STORAGE_GEE_PROJECT = "geomoz_gee_project";
const LOCAL_STORAGE_GEE_CONNECTED = "geomoz_gee_connected";
const LOCAL_STORAGE_GEE_TOKEN = "geomoz_gee_oauth_token";

export interface GeeAuthContextType {
  geeConnected: boolean;
  geeProject: string | null;
  loading: boolean;
  error: string | null;
  connectGee: (project?: string) => Promise<void>;
  setProjectOnly: (project: string) => Promise<void>;
  disconnectGee: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const GeeAuthContext = createContext<GeeAuthContextType | undefined>(undefined);

export function GeeAuthProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [geeConnected, setGeeConnected] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem(LOCAL_STORAGE_GEE_CONNECTED) === "true" ||
        Boolean(localStorage.getItem(LOCAL_STORAGE_GEE_PROJECT))
      );
    } catch {
      return false;
    }
  });

  const [geeProject, setGeeProject] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_GEE_PROJECT) || null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const localProject = localStorage.getItem(LOCAL_STORAGE_GEE_PROJECT);
      const localConnected = localStorage.getItem(LOCAL_STORAGE_GEE_CONNECTED) === "true";

      if (localConnected && localProject) {
        setGeeConnected(true);
        setGeeProject(localProject);
      }

      // Check backend status in background
      let headers: Record<string, string> = {};
      if (user) {
        try {
          const idToken = await user.getIdToken();
          headers["Authorization"] = `Bearer ${idToken}`;
        } catch {}
      }

      const res = await apiFetch("/geomoz-api/gee/status", { headers }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.connected) {
          setGeeConnected(true);
          const proj = data.project || localProject || "geoprocessamento-426809";
          setGeeProject(proj);
          localStorage.setItem(LOCAL_STORAGE_GEE_PROJECT, proj);
          localStorage.setItem(LOCAL_STORAGE_GEE_CONNECTED, "true");
        }
      }

      // Check Firestore if available
      if (user && db) {
        try {
          const docRef = doc(db, "users", user.uid, "settings", "gee");
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const saved = snap.data();
            if (saved?.project) {
              setGeeProject(saved.project);
              setGeeConnected(true);
              localStorage.setItem(LOCAL_STORAGE_GEE_PROJECT, saved.project);
              localStorage.setItem(LOCAL_STORAGE_GEE_CONNECTED, "true");
            }
            if (saved?.access_token) {
              localStorage.setItem(LOCAL_STORAGE_GEE_TOKEN, saved.access_token);
            }
          }
        } catch {}
      }
    } catch (e: any) {
      console.warn("GEE status fetch notice:", e);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const setProjectOnly = async (project: string) => {
    const chosenProject = project.trim() || "geoprocessamento-426809";
    setGeeConnected(true);
    setGeeProject(chosenProject);
    try {
      localStorage.setItem(LOCAL_STORAGE_GEE_PROJECT, chosenProject);
      localStorage.setItem(LOCAL_STORAGE_GEE_CONNECTED, "true");
    } catch {}

    // Register with backend in background
    try {
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth?.currentUser) {
        try {
          const idToken = await auth.currentUser.getIdToken();
          headers["Authorization"] = `Bearer ${idToken}`;
        } catch {}
      }
      const token = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_GEE_TOKEN) : null;
      await apiFetch("/geomoz-api/gee/oauth-token", {
        method: "POST",
        headers,
        body: JSON.stringify({
          access_token: token || "",
          project: chosenProject,
        }),
      }).catch(() => null);
    } catch {}

    // Persist to Firestore in background
    if (auth?.currentUser && db) {
      try {
        const docRef = doc(db, "users", auth.currentUser.uid, "settings", "gee");
        await setDoc(docRef, { project: chosenProject, updatedAt: new Date().toISOString() }, { merge: true });
      } catch {}
    }
  };

  const connectGee = async (project?: string) => {
    setLoading(true);
    setError(null);

    const chosenProject = project?.trim() || geeProject || "geoprocessamento-426809";

    // 1. Immediately enable locally so the system unlocks without any freeze
    setGeeConnected(true);
    setGeeProject(chosenProject);
    try {
      localStorage.setItem(LOCAL_STORAGE_GEE_PROJECT, chosenProject);
      localStorage.setItem(LOCAL_STORAGE_GEE_CONNECTED, "true");
    } catch {}

    try {
      if (auth) {
        const result = await signInWithPopup(auth, geeProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential?.accessToken;

        if (accessToken) {
          try {
            localStorage.setItem(LOCAL_STORAGE_GEE_TOKEN, accessToken);
          } catch {}

          let headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (auth.currentUser) {
            try {
              const idToken = await auth.currentUser.getIdToken();
              headers["Authorization"] = `Bearer ${idToken}`;
            } catch {}
          }

          // Register with backend in background
          await apiFetch("/geomoz-api/gee/oauth-token", {
            method: "POST",
            headers,
            body: JSON.stringify({
              access_token: accessToken,
              project: chosenProject,
            }),
          }).catch((err) => {
            console.warn("Background OAuth registration note:", err);
          });

          // Persist to Firestore in background
          if (auth.currentUser && db) {
            try {
              const docRef = doc(db, "users", auth.currentUser.uid, "settings", "gee");
              await setDoc(
                docRef,
                {
                  project: chosenProject,
                  access_token: accessToken,
                  connectedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            } catch (fsErr) {
              console.warn("Firestore GEE persist warning:", fsErr);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn("Google popup result note:", err);
      // If user closed popup but provided a project, keep the project enabled
      if (err.code === "auth/popup-closed-by-user") {
        console.info("Popup closed by user. Project configuration retained locally:", chosenProject);
      } else {
        setError(err.message || "Erro de conexão ao Google Earth Engine.");
      }
    } finally {
      setLoading(false);
    }
  };

  const disconnectGee = async () => {
    try {
      setLoading(true);
      setGeeConnected(false);
      setGeeProject(null);
      try {
        localStorage.removeItem(LOCAL_STORAGE_GEE_PROJECT);
        localStorage.removeItem(LOCAL_STORAGE_GEE_CONNECTED);
        localStorage.removeItem(LOCAL_STORAGE_GEE_TOKEN);
      } catch {}

      if (user && db) {
        try {
          await deleteDoc(doc(db, "users", user.uid, "settings", "gee"));
        } catch {}
      }

      await apiFetch("/geomoz-api/gee/oauth-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: "", project: null }),
      }).catch(() => null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GeeAuthContext.Provider
      value={{
        geeConnected,
        geeProject,
        loading,
        error,
        connectGee,
        setProjectOnly,
        disconnectGee,
        refreshStatus: fetchStatus,
      }}
    >
      {children}
    </GeeAuthContext.Provider>
  );
}

export function useGeeAuth(): GeeAuthContextType {
  const context = useContext(GeeAuthContext);
  if (!context) {
    // Graceful fallback for components outside provider
    const isConn =
      typeof window !== "undefined" &&
      (localStorage.getItem(LOCAL_STORAGE_GEE_CONNECTED) === "true" ||
        Boolean(localStorage.getItem(LOCAL_STORAGE_GEE_PROJECT)));
    const proj =
      typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_GEE_PROJECT) : null;

    return {
      geeConnected: isConn,
      geeProject: proj,
      loading: false,
      error: null,
      connectGee: async () => {},
      setProjectOnly: async () => {},
      disconnectGee: async () => {},
      refreshStatus: async () => {},
    };
  }
  return context;
}
