import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";

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

  useEffect(()=>{
    if(loading || !user || isGuest || user.isAnonymous || auth.currentUser?.uid!==user.uid)
      return;
    // Same-origin request relay: GeoLibre never reads an OAuth/Firebase token.
    // The authenticated GeoMoz portal owns its fetch and sends only the
    // bounded categorical result to the already-authorized GIS Workspace.
    let pending=false;
    const relay=async (event:MessageEvent)=>{
      if(event.origin!==window.location.origin || event.source!==window.parent ||
        event.data?.type!=="geomoz:workspace:landcover:request" ||
        typeof event.data.requestId!=="string" ||
        !/^[a-z0-9-]{8,80}$/i.test(event.data.requestId))return;
      const {requestId,payload}=event.data as {
        requestId:string;payload?:{crs?:unknown;bounds_meters?:unknown;width?:unknown;height?:unknown}
      };
      const respond=(ok:boolean,data:unknown)=>window.parent.postMessage({
        type:"geomoz:workspace:landcover:response",requestId,ok,...(ok?{data}:{error:data})
      },window.location.origin);
      if(pending){respond(false,"Pedido Earth Engine ainda em processamento.");return;}
      if(!payload || typeof payload.crs!=="string" ||
        !/^EPSG:(3857|32[67][0-9]{2})$/.test(payload.crs) ||
        !Array.isArray(payload.bounds_meters) || payload.bounds_meters.length!==4 ||
        !payload.bounds_meters.every((v:unknown)=>typeof v==="number"&&Number.isFinite(v)) ||
        !Number.isInteger(payload.width)||!Number.isInteger(payload.height) ||
        Number(payload.width)<2||Number(payload.width)>255 ||
        Number(payload.height)<2||Number(payload.height)>255){
        respond(false,"Grelha DEM inválida para o Earth Engine.");return;
      }
      pending=true;
      try {
        const response=await apiFetch("/geomoz-api/terrain/gee-worldcover",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify(payload)
        });
        const body=await response.json().catch(()=>null);
        if(!response.ok)throw Error(typeof body?.detail==="string"?body.detail:
          "Falha na consulta ESA WorldCover ("+response.status+").");
        if(body?.dataset!=="ESA/WorldCover/v200" || body.width!==payload.width ||
          body.height!==payload.height || body.targetCrs!==payload.crs ||
          !Array.isArray(body.values) || body.values.length!==Number(payload.width)*Number(payload.height))
          throw Error("A API devolveu classes sem correspondência com o DEM.");
        respond(true,body);
      }catch(cause){
        respond(false,cause instanceof Error?cause.message:"Erro na ligação Earth Engine.");
      }finally{pending=false;}
    };
    window.addEventListener("message",relay);
    return ()=>window.removeEventListener("message",relay);
  },[user,isGuest,loading]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
      <p className="text-sm">A verificar a sessão GeoMoz…</p>
    </main>
  );
}
