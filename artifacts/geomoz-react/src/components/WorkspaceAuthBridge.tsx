import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";

const WORKSPACE_PATH = "/gis-workspace/";
const MESSAGE_TYPE = "geomoz:workspace-auth-state";

/**
 * Same-origin auth bridge: the separate GIS bundle never runs before the
 * main GeoMoz portal confirms a real Firebase session.
 *
 * Initial authorization sends no credentials. A short-lived Firebase ID token
 * is sent only in response to a matching same-origin parent print request.
 * Local/demo guest sessions are deliberately NOT valid credentials.
 */
export default function WorkspaceAuthBridge() {
  const { user, isGuest, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    const authenticated = Boolean(
      user && !isGuest && !user.isAnonymous && auth.currentUser && auth.currentUser.uid === user.uid
    );

    if (window.parent === window) {
      window.location.replace(authenticated ? WORKSPACE_PATH : "/login?next=%2Fgis-workspace%2F");
      return;
    }

    // targetOrigin ensures this message is delivered only to a same-origin
    // parent. Reading parent.location would throw if another site framed us.
    window.parent.postMessage({ type: MESSAGE_TYPE, authenticated }, window.location.origin);

    // Print requests originate only from the already-loaded, same-origin GIS app.
    // The initial workspace gate never receives or forwards a credential.
    const onPrintToken = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin ||
          event.source !== window.parent ||
          event.data?.type !== "geomoz:workspace-print-token-request" ||
          typeof event.data.id !== "string" ||
          !/^[a-zA-Z0-9_-]{16,80}$/.test(event.data.id)) return;
      try {
        if (!window.parent.location.pathname.startsWith("/gis-workspace")) return;
      } catch {
        return;
      }
      const result = {
        type: "geomoz:workspace-print-token-response",
        id: event.data.id,
        token: null as string | null,
      };
      const current = auth.currentUser;
      if (authenticated && current && !current.isAnonymous && current.uid === user?.uid) {
        try {
          // Firebase handles refresh/expiry; tokens are never cached in the GIS app.
          result.token = await current.getIdToken();
        } catch {
          // Fail closed if token refresh fails.
        }
      }
      window.parent.postMessage(result, window.location.origin);
    };
    window.addEventListener("message", onPrintToken);
    return () => window.removeEventListener("message", onPrintToken);
  }, [user, isGuest, loading]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
      <p className="text-sm">A verificar a sessão GeoMoz…</p>
    </main>
  );
}
