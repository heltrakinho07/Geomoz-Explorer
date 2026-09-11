import { useState, useEffect } from "react";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { useAuth } from "./useAuth";

const geeProvider = new GoogleAuthProvider();
geeProvider.addScope("https://www.googleapis.com/auth/earthengine");

export function useGeeAuth() {
  const { getIdToken, user } = useAuth();
  const [geeConnected, setGeeConnected] = useState(false);
  const [geeProject, setGeeProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    if (!user) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/geomoz-api/gee/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGeeConnected(data.connected);
        setGeeProject(data.project);
      }
    } catch (e) {
      console.error("Error fetching GEE status", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStatus();
    } else {
      setGeeConnected(false);
      setGeeProject(null);
      setLoading(false);
    }
  }, [user]);

  const connectGee = async (project?: string) => {
    try {
      const result = await signInWithPopup(auth, geeProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      
      if (accessToken) {
        const token = await getIdToken();
        const res = await fetch(`${import.meta.env.VITE_API_BASE}/geomoz-api/gee/oauth-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ access_token: accessToken, project: project || null })
        });
        if (res.ok) {
          setGeeConnected(true);
          setGeeProject(project || null);
        }
      }
    } catch (e) {
      console.error("Error connecting GEE", e);
    }
  };

  const disconnectGee = async () => {
    // Add endpoint to clear token if needed, or just update local state.
    // For now we just reset state.
    setGeeConnected(false);
    setGeeProject(null);
  };

  return { geeConnected, geeProject, loading, connectGee, disconnectGee };
}

