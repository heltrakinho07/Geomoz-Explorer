import {useCallback,useEffect,useState,type CSSProperties} from "react";
import {createPortal} from "react-dom";
import html2canvas from "html2canvas";
import {Image as ImageIcon, Loader2, Printer, RefreshCw, X} from "lucide-react";
import "./geomoz-print-layout.css";

export type GeoMozPrintPaper = "a4"|"a3";
export type GeoMozPrintOrientation = "portrait"|"landscape";
interface Props {
  open:boolean;
  onClose:()=>void;
  moduleName:string;
  projectName?:string;
  printSourceId:string;
}
const paperSize={a4:{w:210,h:297},a3:{w:297,h:420}};
export function printPageDimensions(paper:GeoMozPrintPaper,orientation:GeoMozPrintOrientation) {
  const {w,h}=paperSize[paper];
  return orientation==="landscape"?{width:h,height:w}:{width:w,height:h};
}

/**
 * One print composition for all GeoMoz Explorer modules. Screenshots are taken
 * from the visible module, not generated/approximated geographic information.
 * Printing is blocked if browser security prevents faithful screen capture.
 */
export default function GeoMozPrintLayout({open,onClose,moduleName,projectName,printSourceId}:Props){
  const [title,setTitle]=useState("");
  const [subtitle,setSubtitle]=useState("");
  const [sourceText,setSourceText]=useState("");
  const [notes,setNotes]=useState("");
  const [crs,setCrs]=useState("");
  const [scale,setScale]=useState("");
  const [north,setNorth]=useState(false);
  const [legend,setLegend]=useState("");
  const [showLegend,setShowLegend]=useState(false);
  const [paper,setPaper]=useState<GeoMozPrintPaper>("a4");
  const [orientation,setOrientation]=useState<GeoMozPrintOrientation>("landscape");
  const [snapshot,setSnapshot]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [warning,setWarning]=useState("");
  const [isCapturing,setIsCapturing]=useState(false);
  const [revision,setRevision]=useState(0);
  const [date,setDate]=useState("");
  const size=printPageDimensions(paper,orientation);
  const canPrint=Boolean(snapshot&&!busy&&!error);
  useEffect(()=>{
    if(!open)return;
    setTitle(moduleName==="Mapa"?"Mapa do estudo — GeoMoz":moduleName+" — GeoMoz");
    setSubtitle(projectName??"");
    setSourceText("GeoMoz Explorer · indicar a origem dos dados e o fundo cartográfico utilizado");
    setNotes("");setCrs("");setScale("");setNorth(false);setShowLegend(false);setLegend("");
    setError("");setWarning("");setSnapshot(null);
    setDate(new Date().toLocaleDateString("pt-PT"));
  },[open,moduleName,projectName]);
  const capture=useCallback(async()=>{
    if(!open||isCapturing)return;
    const element=document.getElementById(printSourceId);
    if(!element){setError("O conteúdo deste módulo não está disponível para captura.");setSnapshot(null);return;}
    setBusy(true);setIsCapturing(true);setError("");setWarning("");setSnapshot(null);
    try{
      // Capture only the currently visible map/dashboard/analysis. Browser
      // canvas/CORS limits are respected; do not fabricate cartography.
      const canvas=await html2canvas(element,{
        backgroundColor:document.documentElement.classList.contains("dark")?"#020617":"#ffffff",
        useCORS:true,allowTaint:false,logging:false,
        scale:Math.min(2,Math.max(1,window.devicePixelRatio||1)),
        windowWidth:window.innerWidth,
        width:element.clientWidth,height:element.clientHeight
      });
      if(!canvas.width||!canvas.height)throw Error("Imagem vazia.");
      const img=canvas.toDataURL("image/png");
      if(img.length<2000)throw Error("Não foi possível obter uma imagem válida.");
      setSnapshot(img);
      setWarning("Confirme visualmente a imagem antes de imprimir. Alguns mapas WebGL ou fundos externos podem não ser capturados pelo navegador.");
    }catch(e){
      setError("O navegador não conseguiu capturar esta vista. Verifique a ligação e as permissões CORS dos mapas, ou utilize a «Composição de mapa» nativa do GIS Workspace. "+(e instanceof Error?e.message:""));
    }finally{setBusy(false);setIsCapturing(false);}
  },[open,printSourceId,isCapturing]);
  useEffect(()=>{
    if(!open)return;
    // One async capture per opening. Refresh explicitly if the map changes.
    const id=window.setTimeout(()=>{void capture();},120);
    return ()=>window.clearTimeout(id);
  // Capturing changes its own state; revision only changes on an explicit retry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open,printSourceId,revision]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.title;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    document.addEventListener("keydown",onKey);
    return()=>{document.removeEventListener("keydown",onKey);document.title=previous;};
  },[open,onClose]);
  if(!open||typeof document==="undefined")return null;
  const print=()=>{
    if(!canPrint)return;
    const before=document.title;
    document.title="GeoMoz_"+(title.trim()||moduleName).replace(/[^A-Za-z0-9_ -]/g,"").slice(0,70);
    window.print();
    // afterprint is used for restoring title when print dialog closes.
    const restore=()=>{document.title=before;window.removeEventListener("afterprint",restore);};
    window.addEventListener("afterprint",restore,{once:true});
  };
  return createPortal(<div className="gm-print-portal" data-testid="geomoz-print-portal" role="dialog" aria-modal="true" aria-label="Layout de impressão GeoMoz">
    <style>{'@page {size:'+paper.toUpperCase()+' '+orientation+';margin:0}'}</style>
    <div className="gm-print-backdrop" onClick={onClose} aria-hidden="true"/>
    <div className="gm-print-frame">
      <header className="gm-print-topbar">
        <div><strong><Printer size={18}/> GeoMoz · Layout de impressão</strong><small>Composição técnica · sem alterar os dados de origem</small></div>
        <div className="gm-print-top-actions">
          <button onClick={()=>setRevision(n=>n+1)} type="button" disabled={busy}><RefreshCw size={15}/> Actualizar vista</button>
          <button onClick={print} type="button" disabled={!canPrint} className="gm-print-primary"><Printer size={15}/> Imprimir / Guardar PDF</button>
          <button onClick={onClose} type="button" aria-label="Fechar impressão"><X size={19}/></button>
        </div>
      </header>
      <div className="gm-print-body">
        <aside className="gm-print-settings" aria-label="Configuração do layout de impressão">
          <h3>Definições da página</h3>
          <div className="gm-print-grid">
            <label>Papel<select aria-label="Formato do papel" value={paper} onChange={e=>setPaper(e.target.value as GeoMozPrintPaper)}><option value="a4">A4</option><option value="a3">A3</option></select></label>
            <label>Orientação<select aria-label="Orientação do papel" value={orientation} onChange={e=>setOrientation(e.target.value as GeoMozPrintOrientation)}><option value="landscape">Horizontal</option><option value="portrait">Vertical</option></select></label>
          </div>
          <label>Título<input aria-label="Título do mapa" maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label>
          <label>Subtítulo / Projecto<input aria-label="Subtítulo" maxLength={180} value={subtitle} onChange={e=>setSubtitle(e.target.value)}/></label>
          <label>Fontes e créditos<input aria-label="Fontes cartográficas" maxLength={280} value={sourceText} onChange={e=>setSourceText(e.target.value)}/></label>
          <div className="gm-print-grid">
            <label>SRC / CRS (confirmar)<input aria-label="Sistema de coordenadas" placeholder="Ex.: EPSG:4326" value={crs} maxLength={45} onChange={e=>setCrs(e.target.value)}/></label>
            <label>Escala (confirmar)<input aria-label="Escala" placeholder="Ex.: 1:250 000" value={scale} maxLength={45} onChange={e=>setScale(e.target.value)}/></label>
          </div>
          <label>Notas técnicas<textarea aria-label="Notas técnicas" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={700}/></label>
          <label className="gm-print-toggle"><input type="checkbox" checked={north} onChange={e=>setNorth(e.target.checked)}/> Mostrar seta do norte <small>(apenas se a vista estiver orientada a norte)</small></label>
          <label className="gm-print-toggle"><input type="checkbox" checked={showLegend} onChange={e=>setShowLegend(e.target.checked)}/> Incluir legenda personalizada</label>
          {showLegend&&<label>Legenda (uma entrada por linha)<textarea aria-label="Legenda" rows={3} value={legend} onChange={e=>setLegend(e.target.value)} maxLength={700}/></label>}
          <p className="gm-print-hint">A escala e o SRC não são inferidos automaticamente. Introduza-os apenas quando confirmados; a seta de norte não corrige a rotação do mapa.</p>
          {busy&&<p role="status" className="gm-print-note"><Loader2 className="animate-spin" size={14}/> A captar vista real do módulo…</p>}
          {warning&&!error&&<p role="status" className="gm-print-note">{warning}</p>}
          {error&&<p role="alert" className="gm-print-error">{error}</p>}
        </aside>
        <div className="gm-print-stage" aria-label="Pré-visualização para impressão">
          <article className="gm-print-page" data-testid="geomoz-print-page" style={{"--gm-paper-w":size.width+"mm","--gm-paper-h":size.height+"mm"} as CSSProperties}>
            <div className="gm-print-paper-header">
              <div className="gm-print-logo"><img src="/favicon.svg" alt="" width="31" height="31"/><div><strong>GeoMoz</strong><span>EXPLORER · GEOLÍTHICA</span></div></div>
              <span className="gm-print-doc-type">COMPOSIÇÃO CARTOGRÁFICA / RELATÓRIO</span>
            </div>
            <div className="gm-print-title"><h1>{title||"Mapa GeoMoz"}</h1>{subtitle&&<p>{subtitle}</p>}</div>
            <div className="gm-print-map-area">
              {snapshot?<img src={snapshot} alt={"Vista capturada do módulo "+moduleName}/>:<div className="gm-print-map-empty"><ImageIcon size={25}/>{busy?"A captar o mapa e o conteúdo actual…":"Sem captura disponível"}</div>}
              {north&&<div className="gm-print-north" aria-label="Norte (indicado manualmente)"><span>N</span><strong>↑</strong></div>}
              {showLegend&&legend.trim()&&<div className="gm-print-legend"><strong>Legenda</strong>{legend.split(/\r?\n/).filter(Boolean).map((x,i)=><span key={i}>{x}</span>)}</div>}
            </div>
            <div className="gm-print-metadata"><span><b>Módulo</b> {moduleName}</span><span><b>Data</b> {date}</span>{crs&&<span><b>CRS</b> {crs}</span>}{scale&&<span><b>Escala declarada</b> {scale}</span>}</div>
            {notes.trim()&&<div className="gm-print-notes"><b>Notas técnicas</b><p>{notes}</p></div>}
            <footer className="gm-print-paper-footer"><span>{sourceText||"Fontes cartográficas a indicar"}</span><span>GeoMoz · geomoz.geolithica.com</span></footer>
          </article>
        </div>
      </div>
    </div>
  </div>,document.body);
}
