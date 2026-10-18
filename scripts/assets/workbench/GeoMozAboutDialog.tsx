/**
 * GeoMoz-owned About dialog for the GIS Workspace.
 * This component replaces only the upstream product-facing About UI; the
 * original MIT license and attribution are retained in third-party notices.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Button } from "@geolibre/ui";
import { ExternalLink, Info, Layers3, ShieldCheck, FileText } from "lucide-react";

interface AboutDialogProps {
  checkForUpdatesRequest?: number;
  open?: boolean;
  onOpenChange?: (open:boolean)=>void;
  renderTrigger?: boolean;
  buttonClassName?: string;
  buttonSize?: "icon"|"sm"|"default"|"lg";
  iconClassName?: string;
  showLabels?: boolean;
}
const links=[
  {href:"/mapa",label:"Explorador de mapas GeoMoz"},
  {href:"/documentacao",label:"Documentação GeoMoz"},
  {href:"/privacy",label:"Política de privacidade"},
  {href:"/terms",label:"Termos de utilização"},
  {href:"/gis-workspace/third-party-notices.html",label:"Créditos e licenças de terceiros"}
];
export function AboutDialog({
  open, onOpenChange, renderTrigger=true, buttonClassName, buttonSize="sm",
  iconClassName, showLabels=true
}:AboutDialogProps){
  const [internalOpen,setInternalOpen]=useState(false);
  const expanded=open??internalOpen;
  const change=(next:boolean)=>{setInternalOpen(next);onOpenChange?.(next);};
  return <Dialog open={expanded} onOpenChange={change}>
    {renderTrigger&&<DialogTrigger asChild><Button className={buttonClassName} size={buttonSize} variant="ghost"
      aria-label="Sobre o GeoMoz GIS Workspace"><Info className={iconClassName??"h-4 w-4"}/>{showLabels&&<span>Sobre</span>}</Button></DialogTrigger>}
    <DialogContent className="max-w-lg" data-testid="geomoz-about-dialog">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary"/> GeoMoz GIS Workspace</DialogTitle>
        <DialogDescription>Ambiente SIG profissional integrado no GeoMoz Explorer.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <p>Explore, visualize e analise informação geoespacial com ferramentas vectoriais, raster, DEM e serviços científicos, no navegador.</p>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
          <p className="flex gap-2 items-center"><ShieldCheck className="h-4 w-4 text-primary"/> Os seus ficheiros não são enviados automaticamente à nuvem GeoMoz.</p>
          <p>Guarde ou exporte o projecto para conservar o trabalho. Os serviços de mapas e catálogos públicos podem efectuar pedidos a terceiros.</p>
        </div>
        <div className="grid gap-1.5">
          {links.map(link=><a key={link.href} href={link.href}
            target={link.href.includes("third-party")?"_blank":undefined}
            rel={link.href.includes("third-party")?"noopener noreferrer":undefined}
            className="flex justify-between items-center rounded-md border px-3 py-2 hover:bg-accent hover:text-accent-foreground">
            <span className="inline-flex items-center gap-2"><FileText className="h-3.5 w-3.5"/>{link.label}</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true"/>
          </a>)}
        </div>
        <p className="text-xs text-muted-foreground">GeoMoz GIS Workspace · GEOLÍTHICA. Base tecnológica de código aberto sob as respectivas licenças, identificadas nos avisos de terceiros.</p>
      </div>
    </DialogContent>
  </Dialog>;
}
