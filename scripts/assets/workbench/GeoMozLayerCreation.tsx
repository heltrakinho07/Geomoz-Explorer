import {useState} from "react";
import {useAppStore} from "@geolibre/core";
import {useLanguage} from "../../hooks/useLanguage";
import {geoMozSpecialistText} from "./geomoz-specialist-locale";
import {Layers3,Plus,Info,X,Trash2,ListPlus} from "lucide-react";
import {CARTOGRAPHIC_TEMPLATES,newCartographicGeoJSON,specById,validateCartographicName,type CartographicTemplate,type CartographicGeometry} from "./geomoz-cartography";

type Field={name:string;type:"text"|"number";description:string};
const validField=/^[a-zA-Z_][a-zA-Z0-9_]*$/;
export function GeoMozLayerCreation({onClose}:{onClose:()=>void}){
 const {language}=useLanguage();
 const ui=(pt:string)=>geoMozSpecialistText(language,pt);
 const [kind,setKind]=useState<CartographicTemplate>("geology");
 const [title,setTitle]=useState("Unidades geológicas");
 const [geometry,setGeometry]=useState<CartographicGeometry>("Polygon");
 const [fields,setFields]=useState<Field[]>(()=>specById("geology").fields.map(f=>({...f})));
 const [preferredCrs,setPreferredCrs]=useState("EPSG:4326");
 const [newField,setNewField]=useState("");
 const [newType,setNewType]=useState<"text"|"number">("text");
 const [error,setError]=useState("");
 const [created,setCreated]=useState("");
 const add=useAppStore(s=>s.addGeoJsonLayer);
 const setStyle=useAppStore(s=>s.setLayerStyle);
 const updateLayer=useAppStore(s=>s.updateLayer);
 const select=useAppStore(s=>s.selectLayer);
 const canAdd=useAppStore(s=>s.deploymentCapabilities.has("data:add"));
 const selectKind=(id:CartographicTemplate)=>{
   const template=specById(id);setKind(id);setTitle(template.name);setGeometry(template.geometry);
   setFields(template.fields.map(f=>({...f})));setError("");setCreated("");
 };
 const addField=()=>{
   const name=newField.trim();
   if(!validField.test(name)){setError(ui("O nome do campo deve começar por letra ou _ e conter apenas letras, números ou _."));return;}
   if(fields.some(f=>f.name.toLowerCase()===name.toLowerCase())){setError(ui("Já existe um campo com este nome."));return;}
   setFields(all=>[...all,{name,type:newType,description:name}]);setNewField("");setError("");
 };
 const create=()=>{
   if(!canAdd){setError(ui("O seu perfil não permite criar camadas."));return;}
   if(newField.trim()){setError(ui("Adicione o campo pendente à lista antes de criar a camada."));return;}
   try{
     const name=validateCartographicName(title),template=specById(kind);
     if(fields.some(f=>!validField.test(f.name))||new Set(fields.map(f=>f.name.toLowerCase())).size!==fields.length){
       throw Error(ui("Corrija os nomes ou a duplicação de campos."));
     }
     // GeoJSON map coordinates always remain lon/lat (RFC 7946). The UTM
     // preference is metadata, NOT a fake CRS assigned to those coordinates.
     const fc=newCartographicGeoJSON({...template,geometry,fields});
     const id=add(name,fc);
     const layer=useAppStore.getState().layers.find(l=>l.id===id);
     updateLayer(id,{
       attributeForm:{fields:fields.map(field=>({
         field:field.name,widget:field.type==="number"?"number" as const:"text" as const,
         alias:field.description,valueType:field.type==="number"?"number" as const:"string" as const,
       }))},
       metadata:{...layer?.metadata,geomozGeometryType:geometry,geomozPreferredCrs:preferredCrs,geomozFieldSchema:fields},
     });
     setStyle(id,{fillColor:template.color,strokeColor:template.id==="faults"?"#991b1b":"#334155",strokeWidth:1.7,circleRadius:6});
     select(id);setCreated(name);setError("");
     window.dispatchEvent(new CustomEvent("geomoz:task",{detail:"vector"}));
   }catch(e){setError(e instanceof Error?e.message:ui("Não foi possível criar a camada."));}
 };
 return <section className="gm-cartography-wizard" role="dialog" aria-label={ui("Criar camada cartográfica")} data-testid="geomoz-cartography-wizard">
  <header><h3><Layers3 size={17}/> {ui("Nova camada vectorial")}</h3><button type="button" onClick={onClose} aria-label={ui("Fechar assistente")}><X size={17}/></button></header>
  <p><strong>{ui("Etapa 2 · Camada e atributos.")}</strong> {ui("Crie uma camada vazia e configure os campos antes de desenhar. O ficheiro do projecto é guardado localmente quando utilizar «Guardar como».")}</p>
  <label>{ui("Modelo cartográfico")}<select aria-label={ui("Modelo cartográfico")} value={kind} onChange={e=>selectKind(e.target.value as CartographicTemplate)}>
    {CARTOGRAPHIC_TEMPLATES.map(spec=><option key={spec.id} value={spec.id}>{ui(spec.name)}</option>)}</select></label>
  <label>{ui("Nome da camada")}<input aria-label={ui("Nome da nova camada")} maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label>
  <label>{ui("Tipo de geometria")}<select aria-label={ui("Geometria da camada")} value={geometry} onChange={e=>setGeometry(e.target.value as CartographicGeometry)}>
    <option value="Point">{ui("Ponto")}</option><option value="LineString">{ui("Linha")}</option><option value="Polygon">{ui("Polígono")}</option></select></label>
  <label>{ui("SRC de referência para resultados")}<select aria-label={ui("SRC pretendido da camada")} value={preferredCrs} onChange={e=>setPreferredCrs(e.target.value)}>
    <option value="EPSG:4326">EPSG:4326 · WGS 84 (geográfico)</option>
    <option value="EPSG:32735">EPSG:32735 · UTM zona 35S</option>
    <option value="EPSG:32736">EPSG:32736 · UTM zona 36S</option>
    <option value="EPSG:32737">EPSG:32737 · UTM zona 37S</option>
  </select></label>
  <p className="gm-cartography-note"><Info size={14}/> {ui("O motor WebGIS desenha e guarda GeoJSON em WGS 84 (longitude/latitude). Uma preferência UTM não reprojeta automaticamente o GeoJSON: utilize «Reprojectar» antes de exportar para um SRC métrico.")}</p>
  <div className="gm-cartography-fields">
   <strong>{ui("Campos da tabela de atributos")}</strong>
   <div className="gm-cartography-field-list">{fields.map(f=><span key={f.name} title={f.description}><span>{f.name}<small>{f.type==="number"?ui("Número decimal"):ui("Texto")}</small></span><button aria-label={ui("Remover campo ")+f.name} type="button" onClick={()=>setFields(all=>all.filter(x=>x.name!==f.name))}><Trash2 size={13}/></button></span>)}</div>
   <div className="gm-cartography-add-field"><input aria-label={ui("Novo campo")} placeholder="Nome_do_campo" value={newField} maxLength={64} onChange={e=>setNewField(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addField();}}}/><select aria-label={ui("Tipo do novo campo")} value={newType} onChange={e=>setNewType(e.target.value as "text"|"number")}><option value="text">{ui("Texto")}</option><option value="number">{ui("Decimal")}</option></select><button type="button" onClick={addField} aria-label={ui("Adicionar à lista de campos")}><ListPlus size={16}/> {ui("Adicionar")}</button></div>
  </div>
  <p className="gm-cartography-note"><Info size={14}/> {ui("Após criar, seleccione a camada no catálogo, active «Edição» e use «Adicionar ponto», «Adicionar linha» ou «Adicionar polígono» conforme a geometria. Cada feição abre um formulário de atributos. Termine guardando as edições e o projecto.")}</p>
  {error&&<p role="alert" className="gm-cartography-error">{error}</p>}
  {created&&<p role="status" className="gm-cartography-created">{ui("Camada «")}{created}{ui("» criada e seleccionada. Abra «Vector» no cabeçalho para iniciar a digitalização.")}</p>}
  <button type="button" onClick={create} disabled={!canAdd} className="gm-cartography-create"><Plus size={16}/> {ui("Criar camada vazia")}</button>
 </section>;
}
