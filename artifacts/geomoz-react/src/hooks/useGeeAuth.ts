import { useState, useEffect, useCallback } from "react";
import { GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup } from "firebase/auth";
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
        if (!data.connected && data.message) {
          setError(data.message);
        }
      } else {
        setGeeConnected(false);
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Falha ao verificar o Earth Engine (HTTP ${res.status})`);
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
    if (!auth?.currentUser) {
      setError("Inicie sessão no GeoMoz antes de ligar o Earth Engine.");
      return;
    }

    const originalUid = auth.currentUser.uid;
    setLoading(true);
    setError(null);

    try {
      // Never use signInWithPopup here: that could replace the current
      // Firebase identity and silently move the user into another GeoMoz UID.
      // Link Google to the existing account; if already linked, reauthenticate.
      let result;
      try {
        result = await linkWithPopup(auth.currentUser, geeProvider);
      } catch (linkError: any) {
        if (linkError?.code === "auth/provider-already-linked") {
          result = await reauthenticateWithPopup(auth.currentUser, geeProvider);
        } else {
          throw linkError;
        }
      }

      if (result.user.uid !== originalUid || auth.currentUser.uid !== originalUid) {
        throw new Error(
          "A conta Google seleccionada não corresponde à sessão GeoMoz actual.",
        );
      }

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      if (!accessToken) {
        throw new Error("Não foi possível obter o token de acesso Google do popup.");
      }

      const idToken = await auth.currentUser.getIdToken(true);
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

      const data = await res.json();
      setGeeConnected(!!data.connected);
      setGeeProject(data.project || project || null);
      if (!data.connected) {
        throw new Error(data.message || "A ligação ao Google Earth Engine não foi validada.");
      }
    } catch (err: any) {
      console.error("Error connecting GEE:", err);
      let msg = err.message || "Erro ao ligar ao Google Earth Engine.";
      if (err.code === "auth/popup-closed-by-user") {
        msg = "Janela de login foi fechada antes de concluir a autenticação.";
      } else if (err.code === "auth/popup-blocked") {
        msg = "O seu navegador bloqueou a janela pop-up de login. Permita pop-ups para este site.";
      } else if (err.code === "auth/unauthorized-domain") {
        msg = "Domínio não autorizado na Consola do Firebase (Authentication > Settings > Authorized Domains).";
      } else if (
        err.code === "auth/credential-already-in-use" ||
        err.code === "auth/email-already-in-use"
      ) {
        msg =
          "Esta conta Google já está associada a outro utilizador GeoMoz. " +
          "Use a conta ligada à sessão actual ou contacte o administrador.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const disconnectGee = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!auth?.currentUser) {
        setGeeConnected(false);
        setGeeProject(null);
        return;
      }

      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`${apiBase}/geomoz-api/gee/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Falha ao desligar GEE (HTTP ${res.status})`);
      }

      setGeeConnected(false);
      setGeeProject(null);
    } catch (e: any) {
      setError(e.message || "Erro ao desligar o Google Earth Engine.");
    } finally {
      setLoading(false);
    }
  };

  return { geeConnected, geeProject, loading, error, connectGee, disconnectGee, refreshStatus: fetchStatus };
}
