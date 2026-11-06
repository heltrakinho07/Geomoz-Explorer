import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";

const WORKSPACE_PATH = "/gis-workspace/";
const MESSAGE_TYPE = "geomoz:workspace-auth-state";
const POLL_MS = 30_000;

type AccessMessage = {
  type: typeof MESSAGE_TYPE;
  authenticated: boolean;
  allowed: boolean;
  seismicAllowed: boolean;
  reason?: "login_required" | "module_disabled" | "verification_unavailable";
};

/**
 * Same-origin bridge for the separate GeoLibre bundle. The GIS JavaScript is
 * loaded only after the GeoMoz backend confirms module entitlement.
 * Token verification, the effective plan and feature flags remain server-owned.
 * No Firebase token, billing document or UID is sent through postMessage.
 *
 * This is an application launch gate, NOT protection of public static assets.
 */
export default function WorkspaceAuthBridge() {
  const { user, isGuest, loading } = useAuth();
  const [message, setMessage] = useState("A verificar a sessão e as permissões GeoMoz…");

  useEffect(() => {
    if (loading) return;
    let active = true;
    let polling = false;

    const getAccess = async (): Promise<AccessMessage> => {
      const signedIn = Boolean(
        user && !isGuest && !user.isAnonymous &&
        auth.currentUser && auth.currentUser.uid === user.uid
      );
      if (!signedIn) {
        return { type: MESSAGE_TYPE, authenticated: false, allowed: false,
          seismicAllowed: false, reason: "login_required" };
      }
      try {
        const response = await apiFetch("/geomoz-api/billing/module-access", { cache: "no-store" });
        if (response.status === 401) {
          return { type: MESSAGE_TYPE, authenticated: false, allowed: false,
            seismicAllowed: false, reason: "login_required" };
        }
        if (!response.ok) throw new Error("Access service unavailable");
        const data = await response.json() as { features?: Record<string, unknown> };
        if (!data.features || typeof data.features.gis_workspace !== "boolean" ||
            typeof data.features.seismic_catalogs !== "boolean") {
          throw new Error("Incomplete module access response");
        }
        return {
          type: MESSAGE_TYPE,
          authenticated: true,
          allowed: data.features.gis_workspace === true,
          seismicAllowed: data.features.seismic_catalogs === true,
          reason: data.features.gis_workspace === true ? undefined : "module_disabled",
        };
      } catch {
        // A network error must never grant GIS access.
        return { type: MESSAGE_TYPE, authenticated: true, allowed: false,
          seismicAllowed: false, reason: "verification_unavailable" };
      }
    };

    const deliver = async () => {
      if (polling || !active) return;
      polling = true;
      try {
        const access = await getAccess();
        if (!active) return;
        if (window.parent === window) {
          if (!access.authenticated) window.location.replace("/login?next=%2Fgis-workspace%2F");
          else if (access.allowed) window.location.replace(WORKSPACE_PATH);
          else setMessage(access.reason === "verification_unavailable"
            ? "Não foi possível validar o acesso. Verifique a ligação."
            : "O GIS Workspace está temporariamente indisponível para esta conta.");
        } else {
          // Never send to '*' or to a different origin.
          window.parent.postMessage(access, window.location.origin);
        }
      } finally {
        polling = false;
      }
    };

    void deliver();
    const interval = window.setInterval(() => void deliver(), POLL_MS);
    return () => { active = false; window.clearInterval(interval); };
  }, [user?.uid, isGuest, loading]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center gap-4">
      <p className="text-sm" role="status">{message}</p>
      <a href="/dashboard" className="text-sm text-sky-300 underline">Voltar ao painel GeoMoz</a>
    </main>
  );
}
