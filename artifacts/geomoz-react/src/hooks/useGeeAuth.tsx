import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { auth } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { apiFetch } from "@/lib/api";

// GEE tokens/refresh tokens/SA keys never enter Firestore client SDK or
// localStorage. The private credential store is accessed by Firebase Admin
// on the GeoMoz API only.
const GOOGLE_CLIENT_ID =
  "628082413338-o588j9sajmpvd0se4rmahaqaddjlnkpk.apps.googleusercontent.com";
const GEE_SCOPE =
  "https://www.googleapis.com/auth/earthengine https://www.googleapis.com/auth/userinfo.email openid";

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

async function backendJson(
  path: string,
  options?: RequestInit
): Promise<Record<string, any>> {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "Erro de ligação ao Google Earth Engine.");
  }
  return data;
}

function removeLegacyBrowserTokens() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("geomoz_gee_oauth_token");
    localStorage.removeItem("geomoz_gee_oauth_token_timestamp");
    for (const key of Object.keys(localStorage)) {
      if (/^geomoz_gee_user_.*_token(_ts)?$/.test(key)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

export function GeeAuthProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid !== "guest_user" ? user?.uid : undefined;
  const [geeConnected, setGeeConnected] = useState(false);
  const [geeProject, setGeeProject] = useState<string | null>(null);
  const [geeAccount, setGeeAccount] = useState<string | null>(null);
  const [isPermanent, setIsPermanent] = useState(false);
  const [hasRefreshToken, setHasRefreshToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const fetchStatus = useCallback(async () => {
    const requestedUid = uid;
    const epoch = ++generation.current;
    removeLegacyBrowserTokens();

    if (!requestedUid) {
      setGeeConnected(false);
      setGeeProject(null);
      setGeeAccount(null);
      setIsPermanent(false);
      setHasRefreshToken(false);
      return;
    }
    try {
      const data = await backendJson("/geomoz-api/gee/status");
      if (epoch !== generation.current || auth.currentUser?.uid !== requestedUid) {
        return;
      }
      setGeeConnected(Boolean(data.connected && data.user_connected));
      setGeeProject(data.project || null);
      setGeeAccount(data.account || null);
      setIsPermanent(Boolean(data.is_permanent));
      setHasRefreshToken(Boolean(data.has_refresh_token));
    } catch (caught) {
      if (epoch !== generation.current) return;
      setGeeConnected(false);
      setIsPermanent(false);
      setHasRefreshToken(false);
      setError(caught instanceof Error ? caught.message : "GEE indisponível.");
    }
  }, [uid]);

  useEffect(() => {
    void fetchStatus();
    return () => { generation.current += 1; };
  }, [fetchStatus]);

  const assertUser = () => {
    if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) {
      throw new Error("Entre no GeoMoz antes de ligar as suas credenciais GEE.");
    }
  };

  const saveCredentials = async (
    project: string,
    account?: string,
    serviceAccountJson?: string
  ): Promise<{ success: boolean; message: string }> => {
    setLoading(true);
    setError(null);
    try {
      assertUser();
      const chosenProject = project.trim();
      if (!chosenProject) {
        throw new Error("Indique o ID do seu próprio projeto Google Cloud.");
      }
      const data = await backendJson("/geomoz-api/gee/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: chosenProject,
          account: account?.trim() || undefined,
          service_account_key: serviceAccountJson?.trim() || undefined,
        }),
      });
      await fetchStatus();
      return {
        success: Boolean(data.connected),
        message: data.message || (data.connected
          ? "Credenciais pessoais GEE verificadas."
          : "Projeto guardado. Ligue a sua conta GEE para executar análises."),
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Erro GEE.";
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  };

  const connectGee = async (project?: string, _accountEmail?: string) => {
    setLoading(true);
    setError(null);
    const requestingUid = uid;
    try {
      assertUser();
      const chosenProject = project?.trim() || geeProject?.trim();
      if (!chosenProject) {
        throw new Error("Indique primeiro o seu projeto Google Cloud com Earth Engine ativa.");
      }

      // Google OAuth is independent of Firebase login: never signInWithPopup
      // using Firebase Auth to link a different Earth Engine principal.
      const oauth = (window as any).google?.accounts?.oauth2;
      if (!oauth?.initCodeClient && !oauth?.initTokenClient) {
        throw new Error("Google Identity Services indisponível para autorizar Earth Engine.");
      }

      let persistentError: Error | null = null;
      let connected = false;

      if (oauth.initCodeClient) {
        try {
          const code = await new Promise<string>((resolve, reject) => {
            const client = oauth.initCodeClient({
              client_id: GOOGLE_CLIENT_ID,
              scope: GEE_SCOPE,
              ux_mode: "popup",
              select_account: true,
              callback: (result: any) => {
                if (result.code) resolve(result.code);
                else reject(new Error(result.error_description || "Autorização GEE recusada."));
              },
              error_callback: (result: any) =>
                reject(new Error(result?.message || "Falha na autorização GEE.")),
            });
            client.requestCode();
          });
          if (auth.currentUser?.uid !== requestingUid) {
            throw new Error("A conta GeoMoz mudou durante a autorização.");
          }
          const result = await backendJson("/geomoz-api/gee/oauth/exchange-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              redirect_uri: "postmessage",
              project: chosenProject,
            }),
          });
          connected = Boolean(result.connected);
          if (!connected) {
            persistentError = new Error(result.message || "OAuth GEE permanente não validado.");
          }
        } catch (caught) {
          persistentError = caught instanceof Error ? caught : new Error("Falha OAuth GEE.");
        }
      }

      // No client-secret is required for this temporary GIS token flow.
      // The token lives only in the callback; the server validates and stores
      // it within the signed-in Firebase user's private credential document.
      if (!connected && oauth.initTokenClient) {
        const accessToken = await new Promise<string>((resolve, reject) => {
          const client = oauth.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GEE_SCOPE,
            prompt: "select_account",
            callback: (result: any) => {
              if (result.access_token) resolve(result.access_token);
              else reject(new Error(result.error_description || "GEE não autorizou o acesso."));
            },
            error_callback: (result: any) =>
              reject(new Error(result?.message || "Falha na autorização GEE.")),
          });
          client.requestAccessToken();
        });

        if (auth.currentUser?.uid !== requestingUid) {
          throw new Error("A conta GeoMoz mudou durante a autorização GEE.");
        }
        const result = await backendJson("/geomoz-api/gee/oauth-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken, project: chosenProject }),
        });
        connected = Boolean(result.connected);
        if (!connected) {
          throw new Error(result.message || "O token GEE foi recusado.");
        }
      }

      if (!connected) {
        throw persistentError || new Error("Não foi possível autorizar GEE.");
      }

      await fetchStatus();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha OAuth GEE.";
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  // Do not use Firebase signInWithRedirect here: it can silently switch users.
  // Keep this legacy UI action functional through the safe GIS code flow.
  const connectGeeWithRedirect = connectGee;

  const disconnectGee = async () => {
    setLoading(true);
    setError(null);
    try {
      assertUser();
      await backendJson("/geomoz-api/gee/oauth-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: "", project: null }),
      });
      removeLegacyBrowserTokens();
      setGeeConnected(false);
      setGeeProject(null);
      setGeeAccount(null);
      setHasRefreshToken(false);
      setIsPermanent(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha ao desligar GEE.";
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GeeAuthContext.Provider value={{
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
      setProjectOnly: async (project, account) => {
        await saveCredentials(project, account);
      },
      disconnectGee,
      refreshStatus: fetchStatus,
    }}>
      {children}
    </GeeAuthContext.Provider>
  );
}

export function useGeeAuth(): GeeAuthContextType {
  const context = useContext(GeeAuthContext);
  if (!context) throw new Error("useGeeAuth requer GeeAuthProvider.");
  return context;
}
