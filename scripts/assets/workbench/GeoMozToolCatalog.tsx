import {useEffect,useRef} from "react";
import {createPortal} from "react-dom";
import {ArrowRight,ChevronLeft,Layers3,X,type LucideIcon} from "lucide-react";

export type GeoMozCatalogItem={
  id:string;
  title:string;
  description:string;
  icon:LucideIcon;
  disabledReason?:string;
  onSelect:()=>void;
};

export type GeoMozCatalogDefinition={
  id:"services"|"raster"|"seismic";
  title:string;
  description:string;
  icon:LucideIcon;
  items:GeoMozCatalogItem[];
};

/**
 * Task-scoped tool catalog. The first click opens this self-contained card,
 * the next opens the actual source/processing form owned by the GIS engine.
 * Never duplicate processing parameters or invoke hidden DOM buttons.
 */
export function GeoMozToolCatalog({catalog,onClose}:{
  catalog:GeoMozCatalogDefinition;
  onClose:()=>void;
}){
  const closeButton=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const dismiss=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();onClose();}};
    document.addEventListener("keydown",dismiss,true);
    closeButton.current?.focus();
    return()=>{document.removeEventListener("keydown",dismiss,true);if(previous?.isConnected)previous.focus();};
  },[onClose]);
  const Icon=catalog.icon;
  return createPortal(
    <div className="gm-tool-catalog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
      <section className="gm-tool-catalog" role="dialog" aria-modal="true" aria-label={"Ferramentas — "+catalog.title}
        data-testid="geomoz-tool-catalog" data-catalog={catalog.id}>
        <header className="gm-tool-catalog-header">
          <span className="gm-tool-catalog-icon"><Icon size={22}/></span>
          <div><small>ÁREA DE TRABALHO · DADOS</small>
            <h2>{catalog.title}</h2>
            <p>{catalog.description}</p>
          </div>
          <button type="button" aria-label="Fechar catálogo de ferramentas" className="gm-tool-catalog-close" ref={closeButton} onClick={onClose}><X size={19}/></button>
        </header>
        <div className="gm-tool-catalog-steps"><span>1. Escolher categoria</span><ArrowRight size={12}/><strong>2. Seleccionar ferramenta</strong><ArrowRight size={12}/><span>3. Configurar e executar</span></div>
        <div className="gm-tool-catalog-items" role="group" aria-label={"Ferramentas disponíveis de "+catalog.title}>
          {catalog.items.map(item=>{
            const ItemIcon=item.icon;
            return <button type="button" className="gm-tool-catalog-item" key={item.id}
              data-command={item.id} disabled={!!item.disabledReason}
              title={item.disabledReason??item.description}
              onClick={()=>{onClose();item.onSelect();}}>
              <span className="gm-tool-catalog-item-icon"><ItemIcon size={20}/></span>
              <span className="gm-tool-catalog-item-copy"><strong>{item.title}</strong><small>{item.disabledReason??item.description}</small></span>
              <ArrowRight size={17} className="gm-tool-catalog-next"/>
            </button>;
          })}
          {!catalog.items.length&&<div className="gm-tool-catalog-empty"><Layers3 size={18}/> Não existem ferramentas activadas nesta categoria.</div>}
        </div>
        <footer><button type="button" onClick={onClose}><ChevronLeft size={15}/> Voltar ao mapa</button>
          <span>As ferramentas utilizam os formulários e algoritmos reais do GIS Workspace.</span>
        </footer>
      </section>
    </div>,document.body
  );
}
