import {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {useAppStore,type GeoLibreLayer} from "@geolibre/core";
import {Pencil,Save,Trash2,Magnet,MapPin,Waypoints,Pentagon,Info,X,Check,Table2} from "lucide-react";

type Shape="Point"|"LineString"|"Polygon";
type Field={name:string;type:"text"|"number";description:string};
type NewFeature={layerId:string;featureKey:string;geometryType:string};
function layerFields(layer:GeoLibreLayer):Field[]{
 const stored=layer.metadata.geomozFieldSchema;
 if(Array.isArray(stored)){
   return stored.filter((f):f is Field=>!!f&&typeof f==="object"&&typeof f.name==="string"&&(f.type==="text"||f.type==="number"));
 }
 return (layer.attributeForm?.fields??[]).map(f=>({
   name:f.field,type:f.valueType==="number"?"number" as const:"text" as const,
   description:f.alias??f.field,
 }));
}
function layerShape(layer:GeoLibreLayer):Shape{
 const raw=layer.metadata.geomozGeometryType;
 if(raw==="Point"||raw==="LineString"||raw==="Polygon")return raw;
 const first=layer.geojson?.features?.find(f=>f.geometry)?.geometry?.type;
 if(first==="Point"||first==="LineString"||first==="Polygon")return first;
 return "Polygon";
}
const SHAPES:{key:Shape;name:string;mode:string;icon:typeof MapPin}[]=[
 {key:"Point",name:"Adicionar ponto",mode:"marker",icon:MapPin},
 {key:"LineString",name:"Adicionar linha",mode:"line",icon:Waypoints},
 {key:"Polygon",name:"Adicionar polígono",mode:"polygon",icon:Pentagon},
];

export function GeoMozDigitizingTools({layer,editLayerId,onToggleEdit,onCancelEdit}:{
 layer:GeoLibreLayer;editLayerId:string|null;
 onToggleEdit:(id:string)=>void;onCancelEdit:()=>void;
}){
 const [snapping,setSnapping]=useState(true);
 const [tolerance,setTolerance]=useState(10);
 const [pending,setPending]=useState<NewFeature|null>(null);
 const [values,setValues]=useState<Record<string,string>>({});
 const [notice,setNotice]=useState("");
 const active=editLayerId===layer.id;
 const shape=layerShape(layer);
 const fields=layerFields(layer);
 const canEdit=useAppStore(s=>s.deploymentCapabilities.has("project:edit"));
 const activeShape=SHAPES.find(s=>s.key===shape)!;
 useEffect(()=>{
   const listener=(event:Event)=>{
     const feature=(event as CustomEvent<NewFeature>).detail;
     if(!feature||feature.layerId!==layer.id)return;
     setValues({});setPending(feature);
   };
   window.addEventListener("geomoz:digitizing-feature-created",listener);
   return()=>window.removeEventListener("geomoz:digitizing-feature-created",listener);
 },[layer.id]);
 useEffect(()=>{
   if(!active){setPending(null);return;}
   window.dispatchEvent(new CustomEvent("geomoz:digitizing-snap",{detail:{layerId:layer.id,enabled:snapping,distance:tolerance}}));
 },[active,layer.id,snapping,tolerance]);
 const draw=()=>{
   if(!active)return;
   window.dispatchEvent(new CustomEvent("geomoz:digitizing-start-draw",{detail:{layerId:layer.id,mode:activeShape.mode}}));
   setNotice("Clique no mapa para desenhar. Conclua a geometria com o comando do editor; no polígono pode fechar no primeiro vértice.");
 };
 const saveAttributes=()=>{
   if(!pending)return;
   const attributes:Record<string,string|number|null>={};
   for(const field of fields){
     const raw=(values[field.name]??"").trim();
     if(field.type==="number"&&raw&&(!Number.isFinite(Number(raw)))){
       setNotice("O campo "+field.name+" deve conter um número decimal válido.");return;
     }
     attributes[field.name]=raw===""?null:field.type==="number"?Number(raw):raw;
   }
   window.dispatchEvent(new CustomEvent("geomoz:digitizing-attributes-save",{
     detail:{layerId:pending.layerId,featureKey:pending.featureKey,attributes},
   }));
   setPending(null);setNotice("Atributos atribuídos à feição. Guarde as edições da camada para os conservar.");
 };
 const showForm=pending&&pending.layerId===layer.id;
 return <section className="gm-digitizing-tools" data-testid="geomoz-digitizing-tools" aria-label="Fluxo de digitalização">
  <h4><Pencil size={15}/> Digitalização da camada</h4>
  <p><strong>1. Base cartográfica</strong> · Utilize «Dados» para adicionar raster/ortofoto ou «Georreferenciar imagem» em Digitalizar. Confirme o SRC.</p>
  <p><strong>2. Camada activa</strong> · {layer.name} · {shape==="Point"?"Ponto":shape==="LineString"?"Linha":"Polígono"}</p>
  <div className="gm-digitizing-controls">
   <button type="button" disabled={!canEdit} aria-pressed={active} onClick={()=>onToggleEdit(layer.id)}>
     {active?<Save size={15}/>:<Pencil size={15}/>}
     {active?"Guardar edições / Sair da edição":"Alternar edição"}
   </button>
   {active&&<button type="button" onClick={onCancelEdit}><Trash2 size={15}/> Descartar</button>}
  </div>
  <div className="gm-digitizing-snap" role="group" aria-label="Configuração de aderência">
   <label><input type="checkbox" checked={snapping} onChange={e=>setSnapping(e.target.checked)} disabled={!active}/>
     <Magnet size={15}/> Aderência (snapping)</label>
   <label>Tolerância (pixels)<input type="number" min={2} max={40} step={1} value={tolerance} disabled={!active||!snapping}
     onChange={e=>setTolerance(Math.max(2,Math.min(40,Math.round(Number(e.target.value)||10))))}/></label>
  </div>
  <div className="gm-digitizing-controls">
   <button type="button" data-testid="geomoz-add-digitized-feature" disabled={!active} onClick={draw}>
     <activeShape.icon size={16}/>{activeShape.name}
   </button>
   <button type="button" disabled={!layer.geojson?.features?.length||active}
    onClick={()=>useAppStore.getState().setAttributeTableOpen(true)}>
    <Table2 size={15}/> Tabela de atributos
   </button>
  </div>
  <p className="gm-digitizing-hint"><Info size={14}/> <span><strong>3. Aderência · 4. Desenho · 5. Guardar.</strong> Depois de concluir cada feição, introduza os atributos. Guarde as edições antes de fechar o projecto e use «Resultados → Guardar como» para guardar o projecto no computador.</span></p>
  {notice&&<p role="status" className="gm-digitizing-notice">{notice}</p>}
  {showForm&&createPortal(<div className="gm-digitizing-overlay">
   <form className="gm-digitizing-attribute-form" role="dialog" aria-modal="true" aria-label="Atributos da nova feição"
    onSubmit={event=>{event.preventDefault();saveAttributes();}}>
    <header><h3><Table2 size={18}/> Atributos da nova feição</h3>
      <button type="button" aria-label="Fechar formulário de atributos" onClick={()=>{setPending(null);setNotice("Feição criada sem atributos. Pode preenchê-los após guardar a edição, na tabela.");}}><X size={17}/></button></header>
    <p>Geometria criada na camada «{layer.name}». Preencha os campos antes de guardar as edições.</p>
    {!fields.length&&<p>Esta camada não tem campos definidos. Pode guardá-la e configurar a tabela depois.</p>}
    {fields.map(field=><label key={field.name}>{field.description||field.name} <small>({field.name})</small>
      <input autoComplete="off" aria-label={"Atributo "+field.name} type={field.type==="number"?"number":"text"} step={field.type==="number"?"any":undefined}
       value={values[field.name]??""} onChange={e=>setValues(old=>({...old,[field.name]:e.target.value}))}/></label>)}
    <footer><button type="button" onClick={()=>{setPending(null);setNotice("Feição criada sem atributos. Utilize a tabela depois.");}}>Sem atributos</button>
      <button type="submit"><Check size={15}/> Guardar atributos</button></footer>
   </form>
  </div>,document.body)}
 </section>;
}
