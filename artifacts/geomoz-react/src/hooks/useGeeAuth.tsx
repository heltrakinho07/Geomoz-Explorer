import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { useAuth } from "./useAuth";
import { apiFetch } from "@/lib/api";

const geeProvider = new GoogleAuthProvider();
geeProvider.addScope("https://www.googleapis.com/auth/earthengine");
geeProvider.setCustomParameters({
  prompt: "select_account",
});

// Helper for per-user localStorage isolation
const getUserStorageKey = (key: string, uid?: string | null) => {
  const scope = uid && uid !== "guest_user" ? `user_${uid}` : "guest";
  return `geomoz_gee_${scope}_${key}`;
};

const saveTokenToStorage = (uid: string | undefined | null, token: string) => {
  const now = Date.now();
  if (typeof window !== "undefined") {
    localStorage.setItem(getUserStorageKey("token", uid), token);
    localStorage.setItem(getUserStorageKey("token_ts", uid), String(now));
    localStorage.setItem("geomoz_gee_oauth_token", token);
    localStorage.setItem("geomoz_gee_oauth_token_timestamp", String(now));
  }
};

const clearTokenFromStorage = (uid?: string | null) => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(getUserStorageKey("token", uid));
    localStorage.removeItem(getUserStorageKey("token_ts", uid));
    localStorage.removeItem("geomoz_gee_oauth_token");
    localStorage.removeItem("geomoz_gee_oauth_token_timestamp");
  }
};

export interface GeeAuthContextType {
  geeConnected: boolean;
  geeProject: string | null;
  geeAccount: string | null;
  isPermanent: boolean;
  hasRefreshToken: boolean;
  loading: boolean;
  error: string | null;
  connectGee: (project?: string, accountEmail?: string) => Promise<void>;
  connectGeeWithRedirect: (project?: string, accountEmail?: string) => Promise<void>;
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
  const [isPermanent, setIsPermanent] = useState<boolean>(false);
  const [hasRefreshToken, setHasRefreshToken] = useState<boolean>(false);
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

      // Check if OAuth token is expired (> 50 min)
      if (token) {
        const tokenTsStr =
          localStorage.getItem(getUserStorageKey("token_ts", uid)) ||
          localStorage.getItem("geomoz_gee_oauth_token_timestamp");
        if (tokenTsStr) {
          const ts = parseInt(tokenTsStr, 10);
          if (Date.now() - ts > 50 * 60 * 1000) {
            clearTokenFromStorage(uid);
            token = null;
            connected = false;
          }
        }
      }

      // Sanitize old dummy project
      if (project === "eengine-project" || !project) {
        project = "geoprocessamento-426809";
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(getUserStorageKey("project", uid), project);
            localStorage.setItem("geomoz_gee_project", project);
          } catch {}
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
            setIsPermanent(Boolean(data.is_permanent || data.has_refresh_token));
            setHasRefreshToken(Boolean(data.has_refresh_token));
            if (!data.connected && token) {
              clearTokenFromStorage(uid);
            }
          }
          if (data.project) {
            setGeeProject(data.project);
          }
          if (data.account) {
            setGeeAccount(data.account);
          }
        } else if (res && (res.status === 401 || res.status === 403)) {
          clearTokenFromStorage(uid);
          setGeeConnected(false);
          setIsPermanent(false);
          setHasRefreshToken(false);
        }
      }
    } catch (e: any) {
      console.warn("GEE status fetch notice:", e);
    }
  }, [user]);

  // Handle OAuth redirect return on component mount
  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          try {
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const accessToken = credential?.accessToken;
            const uid = result.user.uid;
            const email = result.user.email || geeAccount || "";
            const defaultProject = geeProject || "geoprocessamento-426809";

            if (accessToken) {
              saveTokenToStorage(uid, accessToken);
              if (typeof window !== "undefined") {
                localStorage.setItem(getUserStorageKey("project", uid), defaultProject);
                localStorage.setItem(getUserStorageKey("account", uid), email);
                localStorage.setItem(getUserStorageKey("connected", uid), "true");
                localStorage.setItem("geomoz_gee_project", defaultProject);
              }

              setGeeProject(defaultProject);
              setGeeAccount(email);
              setGeeConnected(true);

              let headers: Record<string, string> = { "Content-Type": "application/json" };
              const idToken = await result.user.getIdToken(false).catch(() => null);
              if (idToken) headers["Authorization"] = `Bearer ${idToken}`;

              await apiFetch("/geomoz-api/gee/oauth-token", {
                method: "POST",
                headers,
                body: JSON.stringify({
                  access_token: accessToken,
                  project: defaultProject,
                }),
              }).catch(() => null);

              if (db && uid !== "guest_user") {
                const docRef = doc(db, "users", uid, "settings", "gee");
                await setDoc(
                  docRef,
                  {
                    project: defaultProject,
                    account: email,
                    access_token: accessToken,
                    connected: true,
                    connectedAt: new Date().toISOString(),
                  },
                  { merge: true }
                ).catch(() => null);
              }
            }
          } catch (e) {
            console.warn("GEE redirect result processing note:", e);
          }
        }
      })
      .catch((err) => {
        console.warn("GEE getRedirectResult error:", err);
      });
  }, [user, geeAccount, geeProject]);

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
      let chosenProject = project.trim() || geeProject || "geoprocessamento-426809";
      if (chosenProject === "eengine-project") {
        chosenProject = "geoprocessamento-426809";
      }
      const chosenAccount = account?.trim() || geeAccount || (user?.email || "");

      // 1. Save to user-scoped and global localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey("project", uid), chosenProject);
        localStorage.setItem(getUserStorageKey("account", uid), chosenAccount);
        localStorage.setItem(getUserStorageKey("connected", uid), "true");
        localStorage.setItem("geomoz_gee_project", chosenProject);
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
      if (serviceAccountJson && serviceAccountJson.trim()) {
        setIsPermanent(true);
      }
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

  const connectGeeWithRedirect = async (project?: string, accountEmail?: string) => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    const uid = user?.uid;
    let chosenProject = project?.trim() || geeProject || "geoprocessamento-426809";
    if (chosenProject === "eengine-project") chosenProject = "geoprocessamento-426809";
    const emailCandidate = accountEmail?.trim() || geeAccount || user?.email || "";

    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey("project", uid), chosenProject);
      if (emailCandidate) localStorage.setItem(getUserStorageKey("account", uid), emailCandidate);
      localStorage.setItem("geomoz_gee_project", chosenProject);
    }

    try {
      await signInWithRedirect(auth, geeProvider);
    } catch (err: any) {
      setLoading(false);
      const msg = err.message || "Erro ao redirecionar para a Google.";
      setError(msg);
      throw new Error(msg);
    }
  };

  const GOOGLE_CLIENT_ID = "628082413338-o588j9sajmpvd0se4rmahaqaddjlnkpk.apps.googleusercontent.com";

  const connectGee = async (project?: string, accountEmail?: string) => {
    setLoading(true);
    setError(null);

    const uid = user?.uid;
    let chosenProject = project?.trim() || geeProject || "geoprocessamento-426809";
    if (chosenProject === "eengine-project") chosenProject = "geoprocessamento-426809";
    const emailCandidate = accountEmail?.trim() || geeAccount || user?.email || "";

    // 1. First priority: Google Identity Services (GIS) Code Flow for PERMANENT refresh_token
    if (typeof window !== "undefined" && (window as any).google?.accounts?.oauth2) {
      try {
        const codePromise = new Promise<{ code: string }>((resolve, reject) => {
          const client = (window as any).google.accounts.oauth2.initCodeClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: "https://www.googleapis.com/auth/earthengine https://www.googleapis.com/auth/userinfo.email openid",
            ux_mode: "popup",
            select_account: true,
            callback: (response: any) => {
              if (response.code) {
                resolve({ code: response.code });
              } else if (response.error) {
                reject(new Error(response.error_description || response.error));
              } else {
                reject(new Error("Nenhum código de autorização retornado pela Google."));
              }
            },
            error_callback: (err: any) => {
              reject(err);
            },
          });
          client.requestCode();
        });

        const { code } = await codePromise;
        let headers: Record<string, string> = { "Content-Type": "application/json" };
        if (auth?.currentUser) {
          try {
            const idToken = await auth.currentUser.getIdToken();
            if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
          } catch {}
        }

        const exchangeRes = await apiFetch("/geomoz-api/gee/oauth/exchange-code", {
          method: "POST",
          headers,
          body: JSON.stringify({
            code,
            redirect_uri: "postmessage",
            project: chosenProject,
          }),
        });

        if (!exchangeRes.ok) {
          const errData = await exchangeRes.json().catch(() => ({}));
          throw new Error(errData.detail || "Falha na troca de autorização permanente com a Google.");
        }

        const data = await exchangeRes.json();
        setGeeConnected(Boolean(data.connected));
        setIsPermanent(Boolean(data.is_permanent || data.has_refresh_token));
        setHasRefreshToken(Boolean(data.has_refresh_token));
        setGeeProject(data.project || chosenProject);
        if (typeof window !== "undefined") {
          localStorage.setItem(getUserStorageKey("project", uid), data.project || chosenProject);
          localStorage.setItem(getUserStorageKey("connected", uid), "true");
          localStorage.setItem("geomoz_gee_project", data.project || chosenProject);
        }
        return;
      } catch (gisErr: any) {
        console.warn("GIS Code Flow attempt note:", gisErr);
        // Fall through to Firebase popup if user cancelled GIS or it wasn't supported
      }
    }

    // 2. Fallback: Firebase signInWithPopup
    try {
      if (auth) {
        // Race popup with a 25-second timeout so it never hangs indefinitely
        const popupPromise = signInWithPopup(auth, geeProvider);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => {
            const timeoutErr: any = new Error(
              "A janela de início de sessão da Google não abriu ou foi fechada. Se o pop-up estiver bloqueado pelo navegador, use o botão 'Autenticar por Redirecionamento'."
            );
            timeoutErr.code = "auth/popup-timeout";
            reject(timeoutErr);
          }, 25000)
        );
        const result: any = await Promise.race([popupPromise, timeoutPromise]);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential?.accessToken;
        const email = result.user?.email || emailCandidate;

        if (accessToken) {
          saveTokenToStorage(uid, accessToken);
          if (typeof window !== "undefined") {
            localStorage.setItem(getUserStorageKey("project", uid), chosenProject);
            localStorage.setItem(getUserStorageKey("account", uid), email);
            localStorage.setItem(getUserStorageKey("connected", uid), "true");
            localStorage.setItem("geomoz_gee_project", chosenProject);
          }

          setGeeProject(chosenProject);
          setGeeAccount(email);
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
        userMsg = "O navegador bloqueou a janela pop-up. Clique em 'Autenticar por Redirecionamento' abaixo para entrar sem pop-ups.";
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
      setIsPermanent(false);
      setHasRefreshToken(false);
      setGeeProject(null);
      setGeeAccount(null);

      clearTokenFromStorage(uid);
      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey("connected", uid), "false");
        localStorage.removeItem(getUserStorageKey("project", uid));
        localStorage.removeItem(getUserStorageKey("account", uid));
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
        isPermanent,
        hasRefreshToken,
        loading,
        error,
        connectGee,
        connectGeeWithRedirect,
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
      isPermanent: false,
      hasRefreshToken: false,
      loading: false,
      error: null,
      connectGee: async () => {},
      connectGeeWithRedirect: async () => {},
      setProjectOnly: async () => {},
      saveCredentials: async () => ({ success: false, message: "" }),
      disconnectGee: async () => {},
      refreshStatus: async () => {},
    };
  }
  return context;
}
