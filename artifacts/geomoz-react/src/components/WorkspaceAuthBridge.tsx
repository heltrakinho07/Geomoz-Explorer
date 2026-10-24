import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";

const WORKSPACE_PATH = "/gis-workspace/";
const MESSAGE_TYPE = "geomoz:workspace-auth-state";

/**
 * Same-origin auth bridge: the separate GIS bundle never runs before the
 * main GeoMoz portal confirms a real Firebase session.
 *
 * No user ID, Firebase token, or credentials cross postMessage.
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
  }, [user, isGuest, loading]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
      <p className="text-sm">A verificar a sessão GeoMoz…</p>
    </main>
  );
}
