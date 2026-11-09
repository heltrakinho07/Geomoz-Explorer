import {useEffect,useMemo,useState} from "react";
import {
  VECTOR_COLOR_RAMPS, styleValue, useAppStore,
  type GeoLibreLayer, type VectorStyleMode, type VectorStyleStop,
} from "@geolibre/core";
import {getVectorLayerPropertyValues} from "@geolibre/plugins";
import {getAttributePropertyNames} from "../../lib/expression-inputs";
import {createDefaultStops, normalizeVectorStyleStops} from "../panels/style-panel/classification-helpers";

type LoadedValues = {key:string;values:unknown[]|null};
const isEditableMode=(mode:VectorStyleMode)=>mode==="single"||mode==="categorized"||mode==="graduated";
const numeric=(value:unknown):number|null=>{
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  if(typeof value!=="string"||!value.trim())return null;
  const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;
};
const distinct=(values:unknown[]):number=>{
  const seen=new Set<string>();
  for(const v of values){
    if(typeof v==="string"&&v.trim())seen.add("s:"+v);
    if(typeof v==="number"&&Number.isFinite(v))seen.add("n:"+v);
  }
  return seen.size;
};

/** Independent, QGIS-like vector renderer. Never accepts raster bands or pixel values. */
export function GeoMozVectorSymbology({layer,editable,onAdvanced}:{
  layer:GeoLibreLayer;editable:boolean;onAdvanced?:()=>void;
}){
  const setLayerStyle=useAppStore(s=>s.setLayerStyle);
  const committedMode=styleValue(layer.style,"vectorStyleMode");
  const [mode,setMode]=useState<VectorStyleMode>(committedMode);
  const [property,setProperty]=useState(styleValue(layer.style,"vectorStyleProperty"));
  const [ramp,setRamp]=useState(styleValue(layer.style,"vectorStyleColorRamp"));
  const [scheme,setScheme]=useState(styleValue(layer.style,"vectorStyleClassificationScheme"));
  const [classes,setClasses]=useState(Math.min(12,Math.max(2,styleValue(layer.style,"vectorStyleClassCount"))));
  const [stops,setStops]=useState<VectorStyleStop[]>(styleValue(layer.style,"vectorStyleStops"));
  const [needsClassification,setNeedsClassification]=useState(false);
  const [loaded,setLoaded]=useState<LoadedValues|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const fields=useMemo(()=>{
    const names=getAttributePropertyNames(layer);
    const existing=styleValue(layer.style,"vectorStyleProperty");
    if(existing&&!names.includes(existing))names.unshift(existing);
    return names;
  },[layer]);
  const valueKey=layer.id+"::"+property;
  const isFileBacked=layer.metadata.sourceKind==="maplibre-gl-vector";
  const isSampleOnly=!layer.geojson&&!isFileBacked;

  // GeoJSON is complete in memory. For GeoParquet/large GeoJSON ask the
  // VectorControl's DuckDB table for the FULL field, not viewport features.
  useEffect(()=>{
    setLoaded(null);
    setError("");
    if(mode==="single"||!isEditableMode(mode)||!property||layer.geojson||!isFileBacked){
      setLoading(false);return;
    }
    let cancelled=false;
    setLoading(true);
    void getVectorLayerPropertyValues(layer.id,property)
      .then(values=>{if(!cancelled)setLoaded({key:layer.id+"::"+property,values});})
      .catch(err=>{
        if(!cancelled){
          setLoaded({key:layer.id+"::"+property,values:null});
          setError(err instanceof Error?err.message:"Não foi possível consultar os atributos completos.");
        }
      })
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[layer.id,layer.geojson,isFileBacked,property,mode]);

  const values=useMemo(()=>{
    if(!property)return null;
    if(layer.geojson)return layer.geojson.features.map(f=>f.properties?.[property]);
    return loaded?.key===valueKey?loaded.values:null;
  },[layer.geojson,loaded,property,valueKey]);
  const showClasses=(mode==="categorized"||mode==="graduated");
  const validExisting=showClasses&&
    mode===committedMode&&property===styleValue(layer.style,"vectorStyleProperty");
  const markPending=()=>{setNeedsClassification(true);setMessage("");setError("");};
  const apply=()=>{
    if(!editable)return;
    if(mode==="single"){
      setLayerStyle(layer.id,{vectorStyleMode:"single"});
      setNeedsClassification(false);setError("");setMessage("Símbolo único aplicado ao mapa.");
      return;
    }
    if(!showClasses)return;
    if(!property){setError("Seleccione primeiro um campo de atributos.");return;}
    if(loading){setError("A leitura dos atributos ainda está em curso.");return;}
    if(isSampleOnly){
      setError("A fonte não permite confirmar todas as categorias. Importe o vector completo ou consulte a tabela de atributos.");
      return;
    }
    if(!values||values.length===0){
      setError("Não há valores de atributos completos disponíveis para este campo.");return;
    }
    const eligible=mode==="categorized"
      ? values.filter(v=>(typeof v==="string"&&v.trim().length>0)||(typeof v==="number"&&Number.isFinite(v)))
      : values.map(numeric).filter((n):n is number=>n!==null);
    const count=mode==="categorized"?distinct(eligible):new Set(eligible).size;
    if(count<(mode==="graduated"?2:1)){
      setError("O campo não contém valores suficientes para a classificação escolhida.");return;
    }
    // Reuse the engine's real vector classifier, including the GeoMoz patch
    // which removes the old 256-category ceiling for categorical fields.
    const targetCount=mode==="categorized"?count:classes;
    const classificationScheme=mode==="categorized"
      ? (["alphabetical","top-values","first-values"].includes(scheme)?scheme:"alphabetical")
      : (["equal-interval","quantile","natural-breaks","standard-deviation","geometric-interval"].includes(scheme)?scheme:"equal-interval");
    const generated=normalizeVectorStyleStops(mode,createDefaultStops(
      layer,mode,property,targetCount,ramp,classificationScheme,values
    ));
    if(!generated.length||(mode==="graduated"&&generated.length<2)){
      setError("Não foi possível produzir intervalos válidos para o campo.");return;
    }
    setLayerStyle(layer.id,{
      vectorStyleMode:mode,vectorStyleProperty:property,
      vectorStyleClassCount:generated.length,vectorStyleColorRamp:ramp,
      vectorStyleClassificationScheme:classificationScheme,vectorStyleStops:generated,
    });
    setStops(generated);
    setNeedsClassification(false);setScheme(classificationScheme);setError("");
    setMessage(String(generated.length)+" classes aplicadas ao mapa e guardadas no projecto.");
  };
  const changeColor=(index:number,color:string)=>{
    if(!editable||needsClassification||!validExisting)return;
    if(!/^#[0-9a-f]{6}$/i.test(color))return;
    const next=stops.map((stop,i)=>i===index?{...stop,color}:stop);
    setStops(next);setLayerStyle(layer.id,{vectorStyleStops:next});
    setMessage("Cor da classe actualizada no mapa.");
  };
  const singleColor=styleValue(layer.style,"fillColor");
  const changeSingleColor=(color:string)=>{
    if(!editable||!/^#[0-9a-f]{6}$/i.test(color))return;
    // The same main symbol colour works for polygon, line or point sources.
    // Keep the individual outline/marker editors in the detailed vector panel.
    setLayerStyle(layer.id,{vectorStyleMode:"single",fillColor:color,strokeColor:color,markerColor:color});
    setMessage("Cor do símbolo aplicada ao mapa.");setError("");
  };

  return <div className="gm-vector-editor" data-testid="geomoz-vector-symbology-editor">
    <label>Tipo de simbologia
      <select aria-label="Tipo de simbologia vectorial" value={mode} disabled={!editable}
        onChange={e=>{
          const next=e.target.value as VectorStyleMode;
          setMode(next);
          setScheme(next==="categorized"?"alphabetical":"equal-interval");
          markPending();
        }}>
        <option value="single">Símbolo único</option>
        <option value="categorized">Categorizado — valores distintos</option>
        <option value="graduated">Graduado — intervalos numéricos</option>
        {mode==="rule-based"&&<option value="rule-based">Baseado em regras (avançado)</option>}
        {mode==="expression"&&<option value="expression">Expressão (avançado)</option>}
      </select>
    </label>

    {mode==="single"&&<div className="gm-vector-editor-fields">
      <label>Cor do símbolo
        <input aria-label="Cor do símbolo vectorial" type="color" value={/^#[0-9a-f]{6}$/i.test(singleColor)?singleColor:"#2563eb"} disabled={!editable} onChange={e=>changeSingleColor(e.target.value)}/>
      </label>
      <p className="gm-layer-detail-note">Símbolo único para todas as feições. Para contornos, espessura e tamanho de pontos, abra as opções vectoriais.</p>
      {editable&&<button className="gm-layer-detail-primary" type="button" onClick={apply}>Aplicar símbolo único</button>}
    </div>}

    {showClasses&&<>
      <div className="gm-vector-editor-fields">
        <label>Valor · campo de atributos
          <select aria-label="Campo de classificação vectorial" disabled={!editable||fields.length===0}
            value={fields.includes(property)?property:""} onChange={e=>{setProperty(e.target.value);markPending();}}>
            {!fields.length&&<option value="">Campos indisponíveis</option>}
            {fields.length>0&&!fields.includes(property)&&<option value="">Seleccione um campo</option>}
            {fields.map(name=><option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>Rampa de cores
          <select aria-label="Rampa de cores vectorial" value={ramp} disabled={!editable}
            onChange={e=>{setRamp(e.target.value);markPending();}}>
            {!VECTOR_COLOR_RAMPS.some(item=>item.value===ramp)&&<option value={ramp}>{ramp}</option>}
            {VECTOR_COLOR_RAMPS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Método
          <select aria-label="Método de classificação vectorial"
            value={scheme} disabled={!editable} onChange={e=>{setScheme(e.target.value);markPending();}}>
            {mode==="categorized"?<>
              {!["alphabetical","top-values","first-values"].includes(scheme)&&<option value={scheme}>Por seleccionar</option>}
              <option value="alphabetical">Alfabético</option>
              <option value="top-values">Mais frequentes</option>
              <option value="first-values">Ordem dos dados</option>
            </>:<>
              {!["equal-interval","quantile","natural-breaks","standard-deviation","geometric-interval"].includes(scheme)&&<option value={scheme}>Por seleccionar</option>}
              <option value="equal-interval">Intervalos iguais</option>
              <option value="quantile">Quantis</option>
              <option value="natural-breaks">Quebras naturais (Jenks)</option>
              <option value="standard-deviation">Desvio-padrão</option>
              <option value="geometric-interval">Intervalos geométricos</option>
            </>}
          </select>
        </label>
        {mode==="graduated"&&<label>Número de classes
          <input aria-label="Número de classes graduadas" type="number" min="2" max="12" step="1"
            disabled={!editable} value={classes} onChange={e=>{setClasses(Math.max(2,Math.min(12,Number(e.target.value)||2)));markPending();}}/>
        </label>}
      </div>
      {loading&&<p role="status">A ler os valores completos do campo…</p>}
      {isSampleOnly&&<p role="note">Esta fonte só disponibiliza feições por mosaico visível; não é seguro classificar por um conjunto parcial de valores.</p>}
      <div className="gm-vector-editor-actions">
        {editable&&<button type="button" className="gm-layer-detail-primary" disabled={loading||!property||isSampleOnly}
          onClick={apply}>Classificar</button>}
        {values&&<small>{mode==="categorized"?String(distinct(values))+" categorias distintas disponíveis":String(values.map(numeric).filter(n=>n!==null).length)+" valores numéricos disponíveis"}</small>}
      </div>
      {needsClassification&&<p className="gm-layer-detail-note">Clique em «Classificar» para aplicar os parâmetros escolhidos e actualizar a legenda.</p>}
      <div className="gm-vector-class-table" role="region" aria-label="Classes vectoriais">
        <table><thead><tr><th>Símbolo</th><th>Valor</th><th>Legenda</th></tr></thead>
          <tbody>{!needsClassification&&validExisting&&stops.length?stops.map((stop,i)=><tr key={i}>
            <td><input aria-label={"Cor da classe "+String(stop.value)} type="color" value={stop.color}
              disabled={!editable} onChange={e=>changeColor(i,e.target.value)}/></td>
            <td>{mode==="graduated"?"≥ ":""}{String(stop.value)}</td>
            <td>{mode==="graduated"?"A partir de "+String(stop.value):String(stop.value)}</td>
          </tr>):<tr><td colSpan={3}>{needsClassification?"A classificação está por aplicar.":"Sem classes configuradas."}</td></tr>}</tbody>
        </table>
      </div>
    </>}

    {!isEditableMode(mode)&&<p className="gm-layer-detail-note">Este estilo usa regras ou expressões. Edite-o no painel vectorial avançado para preservar as condições existentes.</p>}
    {(onAdvanced&&editable)&&<button type="button" className="gm-vector-editor-advanced" onClick={onAdvanced}>Opções vectoriais avançadas · contornos, etiquetas e regras</button>}
    {error&&<p className="gm-vector-editor-error" role="alert">{error}</p>}
    {message&&<p className="gm-vector-editor-status" role="status">{message}</p>}
  </div>;
}
