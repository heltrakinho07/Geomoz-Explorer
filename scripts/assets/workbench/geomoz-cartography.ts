/** GeoMoz cartographic layer schemas — local-first, native GeoJSON. */
export type CartographicTemplate="geology"|"structure"|"occurrence"|"lithology"|"landuse"|"faults"|"custom";
export type CartographicGeometry="Polygon"|"LineString"|"Point";
export interface CartographicLayerSpec {
 id:CartographicTemplate;name:string;geometry:CartographicGeometry;
 fields:readonly {name:string;type:"text"|"number";description:string}[];
 color:string;labelField:string;
}
export const CARTOGRAPHIC_TEMPLATES:readonly CartographicLayerSpec[]=[
 {id:"geology",name:"Unidades geológicas",geometry:"Polygon",color:"#8b5cf6",labelField:"unidade",
  fields:[{name:"unidade",type:"text",description:"Código da unidade geológica"},{name:"litologia",type:"text",description:"Litologia dominante"},{name:"idade",type:"text",description:"Idade geológica"},{name:"formacao",type:"text",description:"Formação geológica"},{name:"descricao",type:"text",description:"Observações de campo"},{name:"fonte",type:"text",description:"Referência/cartografia"}]},
 {id:"faults",name:"Falhas e lineamentos",geometry:"LineString",color:"#dc2626",labelField:"nome",
  fields:[{name:"nome",type:"text",description:"Nome/identificador"},{name:"tipo",type:"text",description:"Falha normal, inversa, desligamento, etc."},{name:"direccao",type:"number",description:"Direcção em graus (se medida)"},{name:"mergulho",type:"number",description:"Mergulho em graus (se medido)"},{name:"confianca",type:"text",description:"Interpretada, inferida ou observada"},{name:"fonte",type:"text",description:"Fonte"}]},
 {id:"structure",name:"Medidas estruturais",geometry:"Point",color:"#f59e0b",labelField:"codigo",
  fields:[{name:"codigo",type:"text",description:"Identificador da medida"},{name:"tipo",type:"text",description:"Acamamento, foliação, fractura"},{name:"strike",type:"number",description:"Strike em graus"},{name:"dip",type:"number",description:"Dip em graus"},{name:"rake",type:"number",description:"Rake em graus"},{name:"fonte",type:"text",description:"Fonte"}]},
 {id:"occurrence",name:"Ocorrências minerais",geometry:"Point",color:"#10b981",labelField:"substancia",
  fields:[{name:"substancia",type:"text",description:"Mineral ou elemento"},{name:"deposito",type:"text",description:"Tipo de depósito"},{name:"rocha",type:"text",description:"Rocha hospedeira"},{name:"estado",type:"text",description:"Estado da ocorrência"},{name:"fonte",type:"text",description:"Fonte"}]},
 {id:"lithology",name:"Afloramentos e amostras",geometry:"Point",color:"#2563eb",labelField:"codigo",
  fields:[{name:"codigo",type:"text",description:"Código do ponto"},{name:"litologia",type:"text",description:"Litologia"},{name:"descricao",type:"text",description:"Descrição de afloramento"},{name:"amostra",type:"text",description:"Código da amostra"},{name:"fonte",type:"text",description:"Fonte"}]},
 {id:"landuse",name:"Uso e cobertura do solo",geometry:"Polygon",color:"#16a34a",labelField:"classe",
  fields:[{name:"classe",type:"text",description:"Classe temática"},{name:"subclasse",type:"text",description:"Subclasse"},{name:"ano",type:"number",description:"Ano de referência"},{name:"fonte",type:"text",description:"Origem dos dados"}]},
 {id:"custom",name:"Nova camada personalizada",geometry:"Polygon",color:"#0284c7",labelField:"",
  fields:[{name:"nome",type:"text",description:"Identificador da feição"},{name:"descricao",type:"text",description:"Descrição"}]}
];
export function specById(id:CartographicTemplate):CartographicLayerSpec {
 const spec=CARTOGRAPHIC_TEMPLATES.find(x=>x.id===id);
 if(!spec)throw Error("Modelo cartográfico desconhecido");
 return spec;
}
export function newCartographicGeoJSON(spec:CartographicLayerSpec){
 return {type:"FeatureCollection" as const,features:[],geomozSchema:{
  geometryType:spec.geometry,fields:spec.fields.map(f=>({...f})),
  schemaVersion:1,source:"GeoMoz GIS Workspace",crs:"EPSG:4326"
 }};
}
export function validateCartographicName(value:string):string {
 const name=value.trim();
 if(name.length<2||name.length>100||/[<>]/.test(name))throw Error("Nome de camada inválido (2–100 caracteres).");
 return name;
}
