import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { apiFetch } from "@/lib/api";

const EARTH_ENGINE_SCOPE = "https://www.googleapis.com/auth/earthengine";
const GEE_REDIRECT_PENDING = "geomoz_gee_redirect_pending";
const GEE_REDIRECT_PROJECT = "geomoz_gee_redirect_project";
const GEE_REDIRECT_ACCOUNT = "geomoz_gee_redirect_account";

const geeProvider = new GoogleAuthProvider();
geeProvider.addScope(EARTH_ENGINE_SCOPE);
geeProvider.setCustomParameters({ prompt: "select_account" });

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "628082413338-o588j9sajmpvd0se4rmahaqaddjlnkpk.apps.googleusercontent.com";

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

function requireProject(project?: string | null): string {
  const value = project?.trim();
  if (!value) {
    throw new Error(
      "Introduza o Google Cloud Project ID associado à sua conta Earth Engine."
    );
  }
  return value;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => ({}));
  return data?.detail || data?.message || fallback;
}

export function GeeAuthProvider({ children }: { children: ReactNode }) {
  const { user, isGuest } = useAuth();

  const [geeConnected, setGeeConnected] = useState(false);
  const [geeProject, setGeeProject] = useState<string | null>(null);
  const [geeAccount, setGeeAccount] = useState<string | null>(null);
  const [isPermanent, setIsPermanent] = useState(false);
  const [hasRefreshToken, setHasRefreshToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyStatus = useCallback((data: any) => {
    setGeeConnected(Boolean(data?.connected));
    setGeeProject(data?.project || null);
    setGeeAccount(data?.account || null);
    setIsPermanent(Boolean(data?.is_permanent));
    setHasRefreshToken(Boolean(data?.has_refresh_token));
  }, []);

  const clearStatus = useCallback(() => {
    setGeeConnected(false);
    setGeeProject(null);
    setGeeAccount(null);
    setIsPermanent(false);
    setHasRefreshToken(false);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!user || isGuest || !auth?.currentUser) {
      clearStatus();
      return;
    }

    try {
      const response = await apiFetch("/geomoz-api/gee/status");
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearStatus();
          return;
        }
        throw new Error(await responseError(response, "Falha ao verificar Earth Engine."));
      }
      applyStatus(await response.json());
    } catch (err: any) {
      console.warn("GEE status fetch notice:", err);
      clearStatus();
    }
  }, [applyStatus, clearStatus, isGuest, user]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Handle only redirects explicitly initiated by the GEE connector.  This
  // prevents a normal GeoMoz Google login from being mistaken for GEE consent.
  useEffect(() => {
    if (!auth || typeof window === "undefined") return;
    if (sessionStorage.getItem(GEE_REDIRECT_PENDING) !== "true") return;

    const finishRedirect = async () => {
      setLoading(true);
      setError(null);
      try {
        const project = requireProject(sessionStorage.getItem(GEE_REDIRECT_PROJECT));
        const account = sessionStorage.getItem(GEE_REDIRECT_ACCOUNT) || undefined;
        const result = await getRedirectResult(auth);
        if (!result?.user) {
          throw new Error("A autenticação Google não foi concluída.");
        }

        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential?.accessToken;
        if (!accessToken) {
          throw new Error("A Google não devolveu um token Earth Engine.");
        }

        if (account) {
          await apiFetch("/geomoz-api/gee/configure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: project, account }),
          });
        }

        const response = await apiFetch("/geomoz-api/gee/oauth-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken, project }),
        });
        if (!response.ok) {
          throw new Error(
            await responseError(response, "Falha ao registar a ligação Earth Engine.")
          );
        }

        await fetchStatus();
      } catch (err: any) {
        setError(err?.message || "Falha ao concluir a autenticação Earth Engine.");
        clearStatus();
      } finally {
        sessionStorage.removeItem(GEE_REDIRECT_PENDING);
        sessionStorage.removeItem(GEE_REDIRECT_PROJECT);
        sessionStorage.removeItem(GEE_REDIRECT_ACCOUNT);
        setLoading(false);
      }
    };

    void finishRedirect();
  }, [clearStatus, fetchStatus]);

  const saveCredentials = useCallback(
    async (
      project: string,
      account?: string,
      serviceAccountJson?: string
    ): Promise<{ success: boolean; message: string }> => {
      if (!user || isGuest || !auth?.currentUser) {
        const message = "Inicie sessão numa conta GeoMoz para configurar o Earth Engine.";
        setError(message);
        return { success: false, message };
      }

      let chosenProject: string;
      try {
        chosenProject = requireProject(project);
      } catch (err: any) {
        const message = err.message;
        setError(message);
        return { success: false, message };
      }

      setLoading(true);
      setError(null);
      try {
        const payload: Record<string, string> = { project_id: chosenProject };
        if (account?.trim()) payload.account = account.trim();
        if (serviceAccountJson?.trim()) {
          payload.service_account_key = serviceAccountJson.trim();
        }

        const response = await apiFetch("/geomoz-api/gee/configure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.detail || data?.message || "Falha ao guardar definições GEE.");
        }

        setGeeProject(data?.project || chosenProject);
        setGeeAccount(data?.account || account?.trim() || null);
        setGeeConnected(Boolean(data?.connected));
        setIsPermanent(Boolean(data?.is_permanent || serviceAccountJson?.trim()));
        setHasRefreshToken(Boolean(data?.has_refresh_token));

        return {
          success: Boolean(data?.configured ?? response.ok),
          message:
            data?.message ||
            (data?.connected
              ? "Earth Engine configurado e conectado."
              : "Projeto guardado. Agora ligue a sua conta Google Earth Engine."),
        };
      } catch (err: any) {
        const message = err?.message || "Erro ao guardar definições Earth Engine.";
        setError(message);
        return { success: false, message };
      } finally {
        setLoading(false);
      }
    },
    [isGuest, user]
  );

  const setProjectOnly = useCallback(
    async (project: string, accountName?: string) => {
      const result = await saveCredentials(project, accountName);
      if (!result.success) throw new Error(result.message);
    },
    [saveCredentials]
  );

  const connectGeeWithRedirect = useCallback(
    async (project?: string, accountEmail?: string) => {
      if (!auth || !user || isGuest || !auth.currentUser) {
        throw new Error("Inicie sessão no GeoMoz antes de ligar o Earth Engine.");
      }

      const chosenProject = requireProject(project || geeProject);
      const account = accountEmail?.trim() || geeAccount || user.email || "";

      setLoading(true);
      setError(null);
      try {
        sessionStorage.setItem(GEE_REDIRECT_PENDING, "true");
        sessionStorage.setItem(GEE_REDIRECT_PROJECT, chosenProject);
        if (account) sessionStorage.setItem(GEE_REDIRECT_ACCOUNT, account);
        await signInWithRedirect(auth, geeProvider);
      } catch (err: any) {
        sessionStorage.removeItem(GEE_REDIRECT_PENDING);
        sessionStorage.removeItem(GEE_REDIRECT_PROJECT);
        sessionStorage.removeItem(GEE_REDIRECT_ACCOUNT);
        const message = err?.message || "Erro ao redirecionar para a Google.";
        setError(message);
        setLoading(false);
        throw new Error(message);
      }
    },
    [geeAccount, geeProject, isGuest, user]
  );

  const connectGee = useCallback(
    async (project?: string, accountEmail?: string) => {
      if (!auth || !user || isGuest || !auth.currentUser) {
        throw new Error("Inicie sessão no GeoMoz antes de ligar o Earth Engine.");
      }

      const chosenProject = requireProject(project || geeProject);
      const account = accountEmail?.trim() || geeAccount || user.email || "";

      setLoading(true);
      setError(null);

      // Persist non-secret project/account metadata before OAuth.
      const metadataResult = await saveCredentials(chosenProject, account || undefined);
      if (!metadataResult.success) {
        setLoading(false);
        throw new Error(metadataResult.message);
      }

      try {
        // Preferred flow: authorization-code exchange on the backend.  The
        // refresh token never touches localStorage or Firestore client code.
        if (typeof window !== "undefined" && (window as any).google?.accounts?.oauth2) {
          const { code } = await new Promise<{ code: string }>((resolve, reject) => {
            const client = (window as any).google.accounts.oauth2.initCodeClient({
              client_id: GOOGLE_CLIENT_ID,
              scope: `${EARTH_ENGINE_SCOPE} https://www.googleapis.com/auth/userinfo.email openid`,
              ux_mode: "popup",
              select_account: true,
              callback: (response: any) => {
                if (response?.code) resolve({ code: response.code });
                else reject(
                  new Error(
                    response?.error_description ||
                      response?.error ||
                      "Nenhum código de autorização devolvido pela Google."
                  )
                );
              },
              error_callback: (oauthError: any) => reject(oauthError),
            });
            client.requestCode();
          });

          const exchange = await apiFetch("/geomoz-api/gee/oauth/exchange-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              redirect_uri: "postmessage",
              project: chosenProject,
            }),
          });

          if (!exchange.ok) {
            throw new Error(
              await responseError(
                exchange,
                "Falha na autorização permanente do Google Earth Engine."
              )
            );
          }

          const data = await exchange.json();
          applyStatus({
            ...data,
            account: data?.account || account || null,
          });
          await fetchStatus();
          return;
        }

        // Compatibility fallback: short-lived OAuth access token.  It is sent
        // directly to the backend and is never persisted in browser storage.
        const result = await signInWithPopup(auth, geeProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential?.accessToken;
        if (!accessToken) {
          throw new Error("Não foi possível obter autorização Earth Engine.");
        }

        const response = await apiFetch("/geomoz-api/gee/oauth-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: accessToken,
            project: chosenProject,
          }),
        });
        if (!response.ok) {
          throw new Error(
            await responseError(response, "Falha ao ligar o Google Earth Engine.")
          );
        }

        await fetchStatus();
      } catch (err: any) {
        const message =
          err?.code === "auth/popup-blocked"
            ? "O navegador bloqueou o pop-up. Use a opção de autenticação por redirecionamento."
            : err?.code === "auth/popup-closed-by-user"
              ? "A janela de autenticação foi fechada antes de concluir."
              : err?.message || "Erro na autenticação Google Earth Engine.";
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [
      applyStatus,
      fetchStatus,
      geeAccount,
      geeProject,
      isGuest,
      saveCredentials,
      user,
    ]
  );

  const disconnectGee = useCallback(async () => {
    if (!user || isGuest || !auth?.currentUser) {
      clearStatus();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/geomoz-api/gee/disconnect", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          await responseError(response, "Falha ao desligar o Google Earth Engine.")
        );
      }
      clearStatus();
    } catch (err: any) {
      const message = err?.message || "Erro ao desligar Earth Engine.";
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [clearStatus, isGuest, user]);

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
        setProjectOnly,
        saveCredentials,
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
