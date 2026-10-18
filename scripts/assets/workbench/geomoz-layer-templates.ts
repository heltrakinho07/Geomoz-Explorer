/** GeoMoz user-owned editable, EMPTY geospatial layers. No sample geometry or fabricated data. */
import type {AttributeFormConfig,LayerStyle} from "@geolibre/core";
export type GeoMozLayerPreset="unidades-geologicas"|"contactos-falhas"|"observacoes-campo"|"mapa-tematico-polygon"|"mapa-tematico-line"|"mapa-tematico-point";
export type GeoMozFieldType="string"|"number"|"integer";
export interface GeoMozFieldSpec {field:string;alias:string;type:GeoMozFieldType;values?:readonly string[];}
export interface GeoMozLayerTemplate {id:GeoMozLayerPreset;label:string;geometry:"Polygon"|"LineString"|"Point";fields:readonly GeoMozFieldSpec[];fill:string;stroke:string;}
const field=(name:string,alias:string,type:GeoMozFieldType="string",values?:readonly string[]):GeoMozFieldSpec=>({field:name,alias,type,values});
export const GEOMOZ_LAYER_TEMPLATES:readonly GeoMozLayerTemplate[]=[
{id:"unidades-geologicas",label:"Unidades geológicas · polígonos",geometry:"Polygon",fill:"#e0b68b",stroke:"#7c2d12",fields:[
 field("codigo","Código da unidade"),field("unidade","Unidade geológica"),field("litologia","Litologia"),field("idade","Idade geológica"),
 field("formacao","Formação / Complexo"),field("descricao","Descrição"),field("fonte","Fonte cartográfica"),field("confianca","Confiança", "string",["alta","media","baixa"])]},
{id:"contactos-falhas",label:"Falhas e contactos · linhas",geometry:"LineString",fill:"#c2410c",stroke:"#9a3412",fields:[
 field("codigo","Código"),field("tipo","Tipo de feição","string",["falha","contacto","lineamento","dique","fractura"]),
 field("cinematica","Cinemática"),field("rumo","Rumo (°)","number"),field("mergulho","Mergulho (°)","number"),field("fonte","Fonte"),field("observacoes","Observações")]},
{id:"observacoes-campo",label:"Observações de campo · pontos",geometry:"Point",fill:"#0284c7",stroke:"#0c4a6e",fields:[
 field("codigo","Código da estação"),field("tipo","Tipo de observação","string",["afloramento","amostra","medicao_estrutural","contacto","outro"]),
 field("litologia","Litologia"),field("rumo","Rumo (°)","number"),field("mergulho","Mergulho (°)","number"),
 field("colector","Colector"),field("data","Data da recolha"),field("observacoes","Observações")]},
{id:"mapa-tematico-polygon",label:"Mapa temático · polígonos",geometry:"Polygon",fill:"#38bdf8",stroke:"#075985",fields:[
 field("codigo","Código"),field("classe","Classe temática"),field("valor","Valor","number"),field("unidade","Unidade"),
 field("fonte","Fonte"),field("descricao","Descrição")]},
{id:"mapa-tematico-line",label:"Mapa temático · linhas",geometry:"LineString",fill:"#38bdf8",stroke:"#075985",fields:[
 field("codigo","Código"),field("classe","Classe temática"),field("valor","Valor","number"),field("fonte","Fonte"),field("descricao","Descrição")]},
{id:"mapa-tematico-point",label:"Mapa temático · pontos",geometry:"Point",fill:"#38bdf8",stroke:"#075985",fields:[
 field("codigo","Código"),field("classe","Classe temática"),field("valor","Valor","number"),field("fonte","Fonte"),field("descricao","Descrição")]}
];
export function findGeoMozTemplate(id:string):GeoMozLayerTemplate{
 const template=GEOMOZ_LAYER_TEMPLATES.find(t=>t.id===id);
 if(!template)throw Error("Modelo geoespacial desconhecido.");
 return template;
}
const reserved=new Set(["__proto__","constructor","prototype","__gm_id","__geolibre_fid"]);
export function validGeoMozFieldName(name:string):boolean{
 return /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(name)&&!reserved.has(name.toLowerCase())&&!name.startsWith("__");
}
export function makeGeoMozLayerDefinition(preset:string,name:string,extraFields:readonly GeoMozFieldSpec[]=[]){
 const template=findGeoMozTemplate(preset),label=name.trim();
 if(label.length<2||label.length>90||/[<>]/.test(label))throw Error("Indique um nome válido de 2 a 90 caracteres.");
 const fields=[...template.fields,...extraFields];
 if(fields.length>40)throw Error("Limite de 40 campos por camada.");
 const unique=new Set<string>();
 for(const f of fields){
  const key=f.field.toLowerCase();
  if(!validGeoMozFieldName(f.field)||unique.has(key)||f.alias.length>100||!["string","number","integer"].includes(f.type))throw Error("Nome ou tipo de campo inválido: "+f.field);
  unique.add(key);
 }
 const attributeForm:AttributeFormConfig={fields:fields.map(f=>({
  field:f.field,alias:f.alias,widget:f.values?.length?"valueMap":f.type==="string"?"text":"number",
  valueType:f.type,...(f.values?.length?{valueMap:f.values.map(value=>({value,label:value}))}:{})
 }))};
 const style:Partial<LayerStyle>={fillColor:template.fill,strokeColor:template.stroke,strokeWidth:template.geometry==="LineString"?2.3:1.2,
   circleRadius:template.geometry==="Point"?6:5};
 return {
  name:label,geojson:{type:"FeatureCollection" as const,features:[]},
  attributeForm,style,
  metadata:{geomozDigitizingTemplate:template.id,geomozDigitizingGeometry:template.geometry,
    geomozDigitizingSchema:fields.map(f=>({field:f.field,type:f.type,alias:f.alias})),
    geomozOrigin:"GeoMoz GIS Workspace",geomozCRS:"EPSG:4326"}
 };
}
/** Default schema values are attached ONLY to newly drawn features of GeoMoz-owned layers.
 * Native imported features retain their original data without rewrites. */
export function geomozNewFeatureProperties(fields:AttributeFormConfig["fields"],data:Record<string,unknown>){
 const values:Record<string,unknown>={};
 for(const f of fields){if(!validGeoMozFieldName(f.field))continue;values[f.field]=f.valueType==="number"||f.valueType==="integer"?null:"";}
 // Editor values take precedence over blank defaults, including numeric 0.
 return {...values,...data};
}
