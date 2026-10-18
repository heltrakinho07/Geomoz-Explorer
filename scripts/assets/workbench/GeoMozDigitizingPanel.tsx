import {useEffect,useMemo,useState} from "react";
import {useAppStore} from "@geolibre/core";
import {GEOMOZ_LAYER_TEMPLATES,makeGeoMozLayerDefinition,validGeoMozFieldName,type GeoMozLayerPreset,type GeoMozFieldSpec,type GeoMozFieldType} from "./geomoz-layer-templates";
import {FilePlus2,Plus,Trash2,X,Layers3} from "lucide-react";

interface Props{onClose:()=>void;onCreated:(id:string)=>void;}
const DEFAULT_TEMPLATE:GeoMozLayerPreset="unidades-geologicas";
/**
 * QGIS-style New Vector Layer wizard: empty layer + real persistent field schema.
 * No sample geometries are ever created and no data leaves the browser.
 */
export function GeoMozDigitizingPanel({onClose,onCreated}:Props){
 const [preset,setPreset]=useState<GeoMozLayerPreset>(DEFAULT_TEMPLATE);
 const [name,setName]=useState("Unidades geológicas");
 const [customFields,setCustomFields]=useState<GeoMozFieldSpec[]>([]);
 const [fieldName,setFieldName]=useState("");
 const [fieldAlias,setFieldAlias]=useState("");
 const [fieldType,setFieldType]=useState<GeoMozFieldType>("string");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const canAdd=useAppStore(s=>s.deploymentCapabilities.has("data:add"));
 const addLayer=useAppStore(s=>s.addGeoJsonLayer);
 const updateLayer=useAppStore(s=>s.updateLayer);
 const setStyle=useAppStore(s=>s.setLayerStyle);
 const select=useAppStore(s=>s.selectLayer);
 const template=useMemo(()=>GEOMOZ_LAYER_TEMPLATES.find(t=>t.id===preset)!,[preset]);
 useEffect(()=>{setName(template.label.split(" · ")[0]);setCustomFields([]);setError("");},[template]);
 const addField=()=>{
  const field=fieldName.trim(),alias=fieldAlias.trim()||field;
  const existing=[...template.fields,...customFields].some(f=>f.field.toLowerCase()===field.toLowerCase());
  if(!validGeoMozFieldName(field)||existing||customFields.length+template.fields.length>=40){
   setError("Nome de campo inválido, reservado ou repetido (máximo 40 campos; letras, números e _).");
   return;
  }
  setCustomFields(list=>[...list,{field,alias,type:fieldType}]);
  setFieldName("");setFieldAlias("");setError("");
 };
 const create=()=>{
  if(!canAdd||busy)return;
  setError("");
  try{
   const definition=makeGeoMozLayerDefinition(preset,name,customFields);
   setBusy(true);
   const id=addLayer(definition.name,definition.geojson);
   updateLayer(id,{metadata:{...definition.metadata},attributeForm:definition.attributeForm});
   setStyle(id,definition.style);
   select(id);
   onCreated(id);
   onClose();
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível criar a camada.");}
  finally{setBusy(false);}
 };
 return <section className="gm-digitizing-wizard" data-testid="geomoz-digitizing-wizard" aria-label="Criar camada geológica ou temática">
   <header><div><small>EDITOR DE DADOS · QGIS-STYLE</small><h3><FilePlus2 size={17}/> Nova camada vectorial</h3></div><button aria-label="Fechar nova camada" type="button" onClick={onClose}><X size={17}/></button></header>
   <p>Crie uma camada vazia com os campos preparados. Em seguida digitalize no mapa, edite os atributos e guarde o projecto.</p>
   <label>Tipo de camada
    <select aria-label="Tipo de camada" value={preset} onChange={e=>setPreset(e.target.value as GeoMozLayerPreset)}>
     {GEOMOZ_LAYER_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
    </select>
   </label>
   <label>Nome da camada
    <input aria-label="Nome da nova camada" maxLength={90} value={name} onChange={e=>setName(e.target.value)}/>
   </label>
   <div className="gm-digitizing-meta"><span><Layers3 size={13}/> Geometria: {template.geometry}</span><span>Referência: WGS 84 (EPSG:4326)</span><span>Guardar: local · GeoJSON/projecto</span></div>
   <div className="gm-digitizing-fields"><strong>Esquema de atributos ({template.fields.length+customFields.length})</strong>
    <div className="gm-digitizing-field-list">{[...template.fields,...customFields].map((f,i)=>
      <div key={f.field}><span><b>{f.field}</b><small>{f.alias} · {f.type}</small></span>{i>=template.fields.length&&<button type="button" aria-label={"Remover campo "+f.field} onClick={()=>setCustomFields(fields=>fields.filter(x=>x.field!==f.field))}><Trash2 size={13}/></button>}</div>)}
    </div>
   </div>
   <div className="gm-digitizing-newfield">
    <label>Campo<input aria-label="Novo campo" placeholder="ex.: mineralizacao" value={fieldName} onChange={e=>setFieldName(e.target.value)}/></label>
    <label>Tipo<select aria-label="Tipo do novo campo" value={fieldType} onChange={e=>setFieldType(e.target.value as GeoMozFieldType)}>
      <option value="string">Texto</option><option value="number">Número</option><option value="integer">Inteiro</option>
    </select></label>
    <label>Nome apresentado<input aria-label="Descrição do novo campo" placeholder="Ex.: Mineralização" value={fieldAlias} onChange={e=>setFieldAlias(e.target.value)}/></label>
    <button type="button" onClick={addField} disabled={!fieldName.trim()}><Plus size={13}/> Campo</button>
   </div>
   {error&&<p className="gm-digitizing-error" role="alert">{error}</p>}
   <footer><button type="button" onClick={onClose}>Cancelar</button>
    <button type="button" className="gm-digitizing-create" disabled={!canAdd||busy||!name.trim()} onClick={create}><Plus size={15}/> Criar camada vazia</button></footer>
   {!canAdd&&<p role="alert">A sessão não possui permissão para adicionar camadas.</p>}
 </section>;
}
