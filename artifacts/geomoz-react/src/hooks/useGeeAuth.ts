import { useState, useEffect, useCallback } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "./useAuth";

const geeProvider = new GoogleAuthProvider();
geeProvider.addScope("https://www.googleapis.com/auth/earthengine");
// Prompt consent to guarantee refresh token / new access token
geeProvider.setCustomParameters({
  prompt: "consent",
  access_type: "offline"
});

export function useGeeAuth() {
  const { user } = useAuth();
  const [geeConnected, setGeeConnected] = useState(false);
  const [geeProject, setGeeProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_API_BASE || "";

  const fetchStatus = useCallback(async () => {
    if (!user || !auth?.currentUser) {
      setGeeConnected(false);
      setGeeProject(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`${apiBase}/geomoz-api/gee/status`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGeeConnected(!!data.connected);
        setGeeProject(data.project || null);
      } else {
        setGeeConnected(false);
      }
    } catch (e: any) {
      console.error("Error fetching GEE status", e);
    } finally {
      setLoading(false);
    }
  }, [user, apiBase]);

  useEffect(() => {
    if (user) {
      fetchStatus();
    } else {
      setGeeConnected(false);
      setGeeProject(null);
    }
  }, [user, fetchStatus]);

  const connectGee = async (project?: string) => {
    if (!auth) {
      setError("Firebase Auth não está inicializado. Verifique as configurações.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, geeProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      if (!accessToken) {
        throw new Error("Não foi possível obter o token de acesso Google do popup.");
      }

      const idToken = await result.user.getIdToken(true);
      const res = await fetch(`${apiBase}/geomoz-api/gee/oauth-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ access_token: accessToken, project: project || null })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Falha ao registar credenciais (HTTP ${res.status})`);
      }

      setGeeConnected(true);
      setGeeProject(project || null);
    } catch (err: any) {
      console.error("Error connecting GEE:", err);
      let msg = err.message || "Erro ao ligar ao Google Earth Engine.";
      if (err.code === "auth/popup-closed-by-user") {
        msg = "Janela de login foi fechada antes de concluir a autenticação.";
      } else if (err.code === "auth/popup-blocked") {
        msg = "O seu navegador bloqueou a janela pop-up de login. Permita pop-ups para este site.";
      } else if (err.code === "auth/unauthorized-domain") {
        msg = "Domínio não autorizado na Consola do Firebase (Authentication > Settings > Authorized Domains).";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const disconnectGee = async () => {
    try {
      setLoading(true);
      if (auth) {
        await firebaseSignOut(auth);
      }
      setGeeConnected(false);
      setGeeProject(null);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Erro ao desligar.");
    } finally {
      setLoading(false);
    }
  };

  return { geeConnected, geeProject, loading, error, connectGee, disconnectGee, refreshStatus: fetchStatus };
}
