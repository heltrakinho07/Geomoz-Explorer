import {useState,useCallback} from "react";
import {useAppStore,useAppCapability,type GeoLibreLayer} from "@geolibre/core";
import {participantCanEditLayer} from "../../lib/collab-protocol";
import {useLayoutOptions} from "../../hooks/useLayoutOptions";
import {usePluginRegistry} from "../../hooks/usePlugins";
import {useLayerActions} from "../panels/layer-panel/useLayerActions";
import type {ComponentProps} from "react";
import type {LayerPanel} from "../panels/LayerPanel";

export function GeoMozLayerProperties({layer,props}:{layer:GeoLibreLayer;props:ComponentProps<typeof LayerPanel>}) {
  const {viewer}=useLayoutOptions();
  const collaboration=useAppStore(s=>s.collaboration);
  const deployment=useAppStore(s=>s.deploymentCapabilities);
  const groups=useAppStore(s=>s.layerGroups);
  const update=useAppStore(s=>s.updateLayer);
  const reorder=useAppStore(s=>s.reorderLayer);
  const move=useAppStore(s=>s.moveLayerToGroup);
  const addGroup=useAppStore(s=>s.addLayerGroup);
  const [groupName,setGroupName]=useState("");
  const exportPrivilege=useAppCapability("export:data");
  const canEditLayer=useCallback((id:string)=>{
    if(viewer||!deployment.has("project:edit"))return false;
    if(!collaboration.isActive)return true;
    if(props.collaborationApi?.canEditLayer)return props.collaborationApi.canEditLayer(id);
    const participant=collaboration.participants.find(p=>p.clientId===collaboration.clientId);
    if(participant)return participantCanEditLayer(participant,collaboration.mode,id,collaboration.lockedLayerIds??[]);
    return collaboration.role==="host"||(collaboration.mode==="co-edit"&&!(collaboration.lockedLayerIds??[]).includes(id));
  },[viewer,deployment,collaboration,props.collaborationApi]);
  const registry=usePluginRegistry();
  const actions=useLayerActions({
    mapControllerRef:props.mapControllerRef,canEditLayer,
    setRefreshStatuses:props.refresh.setRefreshStatuses,
    clearRefreshStatusTimer:props.refresh.clearRefreshStatusTimer,
    scheduleStatusClear:props.refresh.scheduleStatusClear,
    markMssqlRefreshRequired:props.refresh.markMssqlRefreshRequired,
    isPluginActive:registry.isActive,togglePlugin:registry.toggle,
  });
  const editable=canEditLayer(layer.id);
  const canExport=!viewer&&deployment.has("export:data")&&exportPrivilege.granted;
  const status=props.refresh.refreshStatuses[layer.id];
  return <details className="gm-layer-properties" key={layer.id}><summary>Propriedades da camada</summary>
    <label>Nome<input aria-label="Renomear camada" defaultValue={layer.name} disabled={!editable}
      onBlur={event=>{const name=event.target.value.trim();if(name&&editable)update(layer.id,{name});else event.target.value=layer.name;}}
      onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing)event.currentTarget.blur();}}/></label>
    <label>Grupo<select aria-label="Grupo da camada" value={layer.groupId??""} disabled={!editable}
      onChange={event=>{if(editable)move(layer.id,event.target.value||null);}}><option value="">Sem grupo</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    {editable&&<form onSubmit={event=>{event.preventDefault();if(groupName.trim()){addGroup(groupName.trim(),[layer.id]);setGroupName("");}}}><input aria-label="Nome do novo grupo" placeholder="Novo grupo" value={groupName} onChange={event=>setGroupName(event.target.value)}/><button type="submit" disabled={!groupName.trim()}>Criar</button></form>}
    <div className="gm-inspector-actions">{editable&&<><button type="button" onClick={()=>reorder(layer.id,"up")}>Subir</button><button type="button" onClick={()=>reorder(layer.id,"down")}>Descer</button></>}
      {canExport&&layer.geojson&&<button type="button" onClick={()=>void actions.handleExportLayer(layer,"geojson")}>Exportar GeoJSON</button>}</div>
    <p>{layer.type} · {layer.geojson?.features.length??"—"} feições</p>
    {status&&<p role="status">{status.message}</p>}
    {!editable&&<p>As propriedades estão disponíveis para consulta nesta sessão.</p>}
  </details>;
}
