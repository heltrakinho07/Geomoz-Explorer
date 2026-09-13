import { useState, useEffect, useCallback } from "react";
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

export function useGeeAuth() {
  const { user } = useAuth();
  const [geeConnected, setGeeConnected] = useState(false);
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
      setLoading(true);
      setError(null);

      let headers: Record<string, string> = {};
      if (user) {
        try {
          const idToken = await user.getIdToken();
          headers["Authorization"] = `Bearer ${idToken}`;
        } catch {}
      }

      const res = await apiFetch("/geomoz-api/gee/status", { headers });
      if (res.ok) {
        const data = await res.json();
        const isConn = !!data.connected;
        const proj = data.project || localStorage.getItem(LOCAL_STORAGE_GEE_PROJECT) || null;
        setGeeConnected(isConn);
        setGeeProject(proj);
      } else {
        setGeeConnected(false);
      }

      // Check Firestore saved project if user is logged in
      if (user && db) {
        try {
          const docRef = doc(db, "users", user.uid, "settings", "gee");
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const savedData = snap.data();
            if (savedData?.project) {
              setGeeProject(savedData.project);
              localStorage.setItem(LOCAL_STORAGE_GEE_PROJECT, savedData.project);
            }
          }
        } catch {}
      }
    } catch (e: any) {
      console.error("Error fetching GEE status", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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

      const chosenProject = project?.trim() || geeProject || undefined;

      let headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (auth.currentUser) {
        const idToken = await auth.currentUser.getIdToken();
        headers["Authorization"] = `Bearer ${idToken}`;
      }

      const res = await apiFetch("/geomoz-api/gee/oauth-token", {
        method: "POST",
        headers,
        body: JSON.stringify({
          access_token: accessToken,
          project: chosenProject || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Falha ao registar credenciais (HTTP ${res.status})`);
      }

      setGeeConnected(true);
      if (chosenProject) {
        setGeeProject(chosenProject);
        localStorage.setItem(LOCAL_STORAGE_GEE_PROJECT, chosenProject);
      }

      // Persist in Firestore
      if (auth.currentUser && db) {
        try {
          const docRef = doc(db, "users", auth.currentUser.uid, "settings", "gee");
          await setDoc(
            docRef,
            {
              project: chosenProject || null,
              access_token: accessToken,
              connectedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (fsErr) {
          console.warn("Could not persist to Firestore:", fsErr);
        }
      }
    } catch (err: any) {
      console.error("Error connecting GEE:", err);
      let msg = err.message || "Erro ao ligar ao Google Earth Engine.";
      if (err.code === "auth/popup-closed-by-user") {
        msg = "Janela de login foi fechada antes de concluir a autenticação.";
      } else if (err.code === "auth/popup-blocked") {
        msg = "O navegador bloqueou a janela pop-up de login. Permita pop-ups para este site.";
      } else if (err.code === "auth/unauthorized-domain") {
        msg = "Domínio não autorizado na Consola do Firebase (Authentication > Settings > Authorized Domains).";
      }
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const disconnectGee = async () => {
    try {
      setLoading(true);
      setGeeConnected(false);
      setGeeProject(null);
      localStorage.removeItem(LOCAL_STORAGE_GEE_PROJECT);
      setError(null);

      if (auth?.currentUser && db) {
        try {
          const docRef = doc(db, "users", auth.currentUser.uid, "settings", "gee");
          await deleteDoc(docRef);
        } catch {}
      }
    } catch (e: any) {
      setError(e.message || "Erro ao desligar.");
    } finally {
      setLoading(false);
    }
  };

  return {
    geeConnected,
    geeProject,
    loading,
    error,
    connectGee,
    disconnectGee,
    refreshStatus: fetchStatus,
  };
}
