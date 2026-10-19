import {useState} from "react";
import {useAppStore} from "@geolibre/core";
import {Layers3,Plus,Info,X} from "lucide-react";
import {CARTOGRAPHIC_TEMPLATES,newCartographicGeoJSON,specById,validateCartographicName,type CartographicTemplate,type CartographicGeometry} from "./geomoz-cartography";
export function GeoMozLayerCreation({onClose}:{onClose:()=>void}){
 const [kind,setKind]=useState<CartographicTemplate>("geology");
 const [title,setTitle]=useState("Unidades geológicas");
 const [geometry,setGeometry]=useState<CartographicGeometry>("Polygon");
 const [error,setError]=useState("");
 const [created,setCreated]=useState("");
 const add=useAppStore(s=>s.addGeoJsonLayer);
 const setStyle=useAppStore(s=>s.setLayerStyle);
 const updateLayer=useAppStore(s=>s.updateLayer);
 const select=useAppStore(s=>s.selectLayer);
 const canAdd=useAppStore(s=>s.deploymentCapabilities.has("data:add"));
 const selectKind=(id:CartographicTemplate)=>{
   const template=specById(id);setKind(id);setTitle(template.name);setGeometry(template.geometry);
   setError("");setCreated("");
 };
 const create=()=>{
   if(!canAdd){setError("O seu perfil não permite criar camadas.");return;}
   try{
     const name=validateCartographicName(title),template=specById(kind);
     // Preserve GeoJSON interoperability. Declared fields are kept in the
     // GeoMoz schema section; drawn features must be attributed in the native
     // GeoEditor, not prepopulated with fabricated field observations.
     const fc=newCartographicGeoJSON({...template,geometry});
     const id=add(name,fc);
     updateLayer(id,{attributeForm:{fields:template.fields.map(field=>({field:field.name,widget:field.type==="number"?"number" as const:"text" as const,alias:field.description,valueType:field.type==="number"?"number" as const:"string" as const}))}});
     setStyle(id,{fillColor:template.color,strokeColor:template.id==="faults"?"#991b1b":"#334155",strokeWidth:1.7,circleRadius:6});
     select(id);
     setCreated(name);setError("");
   }catch(e){setError(e instanceof Error?e.message:"Não foi possível criar a camada.");}
 };
 return <section className="gm-cartography-wizard" role="dialog" aria-label="Criar camada cartográfica" data-testid="geomoz-cartography-wizard">
  <header><h3><Layers3 size={17}/> Criar camada cartográfica</h3><button type="button" onClick={onClose} aria-label="Fechar assistente"><X size={17}/></button></header>
  <p>Escolha um modelo. As novas camadas começam vazias, em WGS 84, prontas para digitalização e preenchimento real dos atributos.</p>
  <label>Modelo de cartografia<select aria-label="Modelo cartográfico" value={kind} onChange={e=>selectKind(e.target.value as CartographicTemplate)}>
    {CARTOGRAPHIC_TEMPLATES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <label>Nome da camada<input aria-label="Nome da nova camada" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label>
  <label>Tipo de geometria<select aria-label="Geometria da camada" value={geometry} onChange={e=>setGeometry(e.target.value as CartographicGeometry)}>
    <option value="Polygon">Polígonos · unidades</option><option value="LineString">Linhas · contactos/falhas</option><option value="Point">Pontos · amostras/medidas</option></select></label>
  <div className="gm-cartography-fields"><strong>Atributos recomendados</strong>
   <div>{specById(kind).fields.map(f=><span key={f.name} title={f.description}>{f.name}<small>{f.type==="number"?"numérico":"texto"}</small></span>)}</div>
  </div>
  <p className="gm-cartography-note"><Info size={14}/> Depois de criar, seleccione a camada no catálogo e clique em «Digitalizar nesta camada». Desenhe as feições e termine com «Concluir e guardar edição». Em seguida abra «Tabela» na camada para criar campos e preencher os atributos, e use «Simbologia» para representar as classes. Guarde o projecto e exporte GeoJSON.</p>
  {error&&<p role="alert" className="gm-cartography-error">{error}</p>}
  {created&&<p role="status" className="gm-cartography-created">Camada «{created}» criada. No catálogo, seleccione «Digitalizar nesta camada» para desenhar e editar as feições.</p>}
  <button type="button" onClick={create} disabled={!canAdd} className="gm-cartography-create"><Plus size={16}/> Criar camada vazia</button>
 </section>;
}
