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

// Helper for per-user localStorage isolation
const getUserStorageKey = (key: string, uid?: string | null) => {
  const scope = uid && uid !== "guest_user" ? `user_${uid}` : "guest";
  return `geomoz_gee_${scope}_${key}`;
};

export interface GeeAuthContextType {
  geeConnected: boolean;
  geeProject: string | null;
  geeAccount: string | null;
  loading: boolean;
  error: string | null;
  connectGee: (project?: string, accountEmail?: string) => Promise<void>;
  setProjectOnly: (project: string, accountName?: string) => Promise<void>;
  saveCredentials: (
    project: string,
    account?: string,
    serviceAccountJson?: string
  ) => Promise<{ success: boolean; message: string }>;
  disconnectGee: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const GeeAuthContext = createContext<GeeAuthContextType | undefined>(undefined);

export function GeeAuthProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [geeConnected, setGeeConnected] = useState<boolean>(false);
  const [geeProject, setGeeProject] = useState<string | null>(null);
  const [geeAccount, setGeeAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const uid = user?.uid;
      let project: string | null = null;
      let account: string | null = null;
      let token: string | null = null;
      let connected = false;

      // 1. If registered user, first check their personal Firestore document
      if (user && db && user.uid !== "guest_user") {
        try {
          const docRef = doc(db, "users", user.uid, "settings", "gee");
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const saved = snap.data();
            project = saved?.project || null;
            account = saved?.account || user.email || null;
            token = saved?.access_token || null;
            connected = Boolean(saved?.connected || token || saved?.service_account_key || project);
          }
        } catch (fsErr) {
          console.warn("Firestore GEE load notice:", fsErr);
        }
      }

      // 2. Fallback to per-user localStorage cache if Firestore didn't have it
      if (!project && typeof window !== "undefined") {
        project = localStorage.getItem(getUserStorageKey("project", uid));
        account = localStorage.getItem(getUserStorageKey("account", uid));
        token = localStorage.getItem(getUserStorageKey("token", uid));
        const connVal = localStorage.getItem(getUserStorageKey("connected", uid));
        if (connVal === "false") {
          connected = false;
        } else if (connVal === "true") {
          connected = true;
        }
      }

      setGeeProject(project);
      setGeeAccount(account);
      setGeeConnected(connected);

      // 3. Verify real backend status for this user
      if (project || token) {
        let headers: Record<string, string> = {};
        if (project) headers["X-GEE-Project"] = project;
        if (token) headers["X-GEE-Token"] = token;
        if (user) {
          try {
            const idToken = await user.getIdToken();
            headers["Authorization"] = `Bearer ${idToken}`;
          } catch {}
        }

        const res = await apiFetch("/geomoz-api/gee/status", { headers }).catch(() => null);
        if (res && res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.connected !== undefined) {
            setGeeConnected(Boolean(data.connected));
          }
          if (data.project) {
            setGeeProject(data.project);
          }
          if (data.account) {
            setGeeAccount(data.account);
          }
        }
      }
    } catch (e: any) {
      console.warn("GEE status fetch notice:", e);
    }
  }, [user]);

  // When user logs in, switches, or logs out, reload that user's specific status
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const saveCredentials = async (
    project: string,
    account?: string,
    serviceAccountJson?: string
  ): Promise<{ success: boolean; message: string }> => {
    setLoading(true);
    setError(null);
    try {
      const uid = user?.uid;
      const chosenProject = project.trim() || geeProject || "";
      const chosenAccount = account?.trim() || geeAccount || (user?.email || "");

      // 1. Save to user-scoped localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey("project", uid), chosenProject);
        localStorage.setItem(getUserStorageKey("account", uid), chosenAccount);
        localStorage.setItem(getUserStorageKey("connected", uid), "true");
      }

      setGeeProject(chosenProject);
      setGeeAccount(chosenAccount);

      // 2. Configure on backend for this specific user
      const payload: any = {
        project_id: chosenProject,
        account: chosenAccount,
      };
      if (serviceAccountJson && serviceAccountJson.trim()) {
        payload.service_account_key = serviceAccountJson.trim();
      }

      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth?.currentUser) {
        try {
          const idTokenPromise = auth.currentUser.getIdToken();
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
          const idToken = await Promise.race([idTokenPromise, timeoutPromise]);
          if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
        } catch {}
      }

      const res = await apiFetch("/geomoz-api/gee/configure", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      // 3. Persist to Firestore under this user's profile (fire-and-forget, non-blocking)
      if (auth?.currentUser && db && auth.currentUser.uid !== "guest_user") {
        try {
          const docRef = doc(db, "users", auth.currentUser.uid, "settings", "gee");
          const fsData: any = {
            project: chosenProject,
            account: chosenAccount,
            connected: Boolean(data.connected),
            updatedAt: new Date().toISOString(),
          };
          if (serviceAccountJson && serviceAccountJson.trim()) {
            fsData.service_account_key = serviceAccountJson.trim();
          }
          setDoc(docRef, fsData, { merge: true }).catch((fsErr) => {
            console.warn("Firestore GEE persist notice:", fsErr);
          });
        } catch (fsErr) {
          console.warn("Firestore GEE persist notice:", fsErr);
        }
      }

      setGeeConnected(Boolean(data.connected));
      return {
        success: Boolean(data.connected),
        message:
          data.message ||
          (data.connected ? "GEE configurado e conectado com sucesso!" : "Configuração guardada."),
      };
    } catch (err: any) {
      const msg = err.message || "Erro ao guardar definições.";
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  };

  const setProjectOnly = async (project: string, accountName?: string) => {
    await saveCredentials(project, accountName);
  };

  const connectGee = async (project?: string, accountEmail?: string) => {
    setLoading(true);
    setError(null);

    const uid = user?.uid;
    const chosenProject = project?.trim() || geeProject || "";
    const emailCandidate = accountEmail?.trim() || geeAccount || user?.email || "";

    try {
      if (auth) {
        // Race popup with a 60-second timeout to prevent infinite spinning
        const popupPromise = signInWithPopup(auth, geeProvider);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => {
            const timeoutErr: any = new Error(
              "A janela de início de sessão demorou a responder ou ficou oculta em segundo plano. Verifique se o seu navegador não bloqueou pop-ups."
            );
            timeoutErr.code = "auth/popup-timeout";
            reject(timeoutErr);
          }, 60000)
        );
        const result: any = await Promise.race([popupPromise, timeoutPromise]);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential?.accessToken;
        const email = result.user?.email || emailCandidate;

        if (accessToken) {
          if (typeof window !== "undefined") {
            localStorage.setItem(getUserStorageKey("token", uid), accessToken);
            if (chosenProject) localStorage.setItem(getUserStorageKey("project", uid), chosenProject);
            if (email) localStorage.setItem(getUserStorageKey("account", uid), email);
            localStorage.setItem(getUserStorageKey("connected", uid), "true");
          }

          setGeeProject(chosenProject || null);
          setGeeAccount(email || null);
          setGeeConnected(true);

          let headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (auth.currentUser) {
            try {
              const idToken = await auth.currentUser.getIdToken();
              headers["Authorization"] = `Bearer ${idToken}`;
            } catch {}
          }

          // Register with backend for this user
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

          // Persist to Firestore for this user
          if (auth.currentUser && db && auth.currentUser.uid !== "guest_user") {
            try {
              const docRef = doc(db, "users", auth.currentUser.uid, "settings", "gee");
              await setDoc(
                docRef,
                {
                  project: chosenProject,
                  account: email,
                  access_token: accessToken,
                  connected: true,
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
      let userMsg = err.message || "Erro na autenticação Google.";
      if (err.code === "auth/popup-blocked") {
        userMsg = "O navegador bloqueou a janela pop-up de início de sessão. Por favor, permita pop-ups para este site na barra de endereços.";
      } else if (err.code === "auth/popup-closed-by-user") {
        userMsg = "A janela de autenticação foi fechada antes de concluir.";
      } else if (err.code === "auth/popup-timeout") {
        userMsg = err.message;
      }
      setError(userMsg);
      throw new Error(userMsg);
    } finally {
      setLoading(false);
    }
  };

  const disconnectGee = async () => {
    try {
      setLoading(true);
      const uid = user?.uid;

      setGeeConnected(false);
      setGeeProject(null);
      setGeeAccount(null);

      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey("connected", uid), "false");
        localStorage.removeItem(getUserStorageKey("project", uid));
        localStorage.removeItem(getUserStorageKey("account", uid));
        localStorage.removeItem(getUserStorageKey("token", uid));
      }

      if (user && db && user.uid !== "guest_user") {
        try {
          await deleteDoc(doc(db, "users", user.uid, "settings", "gee"));
        } catch {}
      }

      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth?.currentUser) {
        try {
          const idToken = await auth.currentUser.getIdToken();
          headers["Authorization"] = `Bearer ${idToken}`;
        } catch {}
      }

      await apiFetch("/geomoz-api/gee/oauth-token", {
        method: "POST",
        headers,
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
        geeAccount,
        loading,
        error,
        connectGee,
        saveCredentials,
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
    return {
      geeConnected: false,
      geeProject: null,
      geeAccount: null,
      loading: false,
      error: null,
      connectGee: async () => {},
      setProjectOnly: async () => {},
      saveCredentials: async () => ({ success: false, message: "" }),
      disconnectGee: async () => {},
      refreshStatus: async () => {},
    };
  }
  return context;
}
