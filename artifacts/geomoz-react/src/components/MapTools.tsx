import { useState, useRef, useCallback, useEffect } from "react";
import { useMap, useMapEvents, CircleMarker, Circle } from "react-leaflet";
import { LocateFixed, Loader2, Maximize2, Minimize2, Copy, Check } from "lucide-react";

/**
 * Reusable on-map toolset shared by every GeoMoz map:
 *  - Real-time geolocation (GPS) with live position marker + accuracy circle.
 *  - Live cursor coordinates (lat/lng) and current zoom level.
 *  - Copy coordinates to clipboard, fullscreen toggle.
 *
 * Rendered as a child of <MapContainer>; it uses useMap()/useMapEvents() so it
 * works on any page without extra wiring. Position defaults to bottom-right to
 * stay clear of zoom controls (top) and legends (bottom-left).
 */
export default function MapTools() {
  const map = useMap();
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState<number>(map.getZoom());
  const [loc, setLoc] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [fs, setFs] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasCentered = useRef(false);

  useMapEvents({
    mousemove(e) { setCursor({ lat: e.latlng.lat, lng: e.latlng.lng }); },
    mouseout() { setCursor(null); },
    zoomend() { setZoom(map.getZoom()); },
    locationfound(e) {
      setLocating(false);
      setLoc({ lat: e.latlng.lat, lng: e.latlng.lng, acc: e.accuracy });
      if (!hasCentered.current) {
        hasCentered.current = true;
        map.flyTo(e.latlng, Math.max(map.getZoom(), 13), { duration: 1 });
      }
    },
    locationerror() {
      setLocating(false);
      setTracking(false);
      map.stopLocate();
      // eslint-disable-next-line no-alert
      window.alert("Não foi possível obter a sua localização. Verifique as permissões de GPS/localização do navegador.");
    },
  });

  const toggleLocate = useCallback(() => {
    if (tracking) {
      map.stopLocate();
      setTracking(false);
      setLoc(null);
      hasCentered.current = false;
      return;
    }
    setLocating(true);
    setTracking(true);
    hasCentered.current = false;
    map.locate({ watch: true, enableHighAccuracy: true, maximumAge: 5000 });
  }, [map, tracking]);

  const toggleFullscreen = useCallback(() => {
    const el = map.getContainer();
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFs(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFs(false)).catch(() => {});
    }
  }, [map]);

  useEffect(() => {
    const onFs = () => { setFs(!!document.fullscreenElement); setTimeout(() => map.invalidateSize(), 200); };
    document.addEventListener("fullscreenchange", onFs);
    return () => { document.removeEventListener("fullscreenchange", onFs); map.stopLocate(); };
  }, [map]);

  const copyCoords = useCallback(() => {
    const c = loc ?? cursor ?? map.getCenter();
    const text = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
  }, [loc, cursor, map]);

  const display = loc ?? cursor;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      {loc && (
        <>
          <Circle center={[loc.lat, loc.lng]} radius={loc.acc}
            pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.12, weight: 1 }} />
          <CircleMarker center={[loc.lat, loc.lng]} radius={7}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }} />
        </>
      )}

      <div className="absolute bottom-6 right-2.5 z-[900] flex flex-col items-end gap-2"
        onMouseDown={stop} onDoubleClick={stop} onClick={stop}>

        {/* Coordinate / zoom readout */}
        <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-lg shadow-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-mono text-slate-700 flex items-center gap-2 leading-none">
          <span className="tabular-nums">
            {display ? `${display.lat.toFixed(5)}, ${display.lng.toFixed(5)}` : "— , —"}
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">z{zoom}</span>
          <button onClick={copyCoords} title="Copiar coordenadas"
            className="text-slate-400 hover:text-blue-600 transition-colors">
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
        </div>

        {/* Tool buttons */}
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <button onClick={toggleLocate}
            title={tracking ? "Parar localização em tempo real" : "A minha localização (GPS, tempo real)"}
            className={`w-9 h-9 rounded-lg shadow-md border flex items-center justify-center transition-colors ${
              tracking ? "bg-blue-600 border-blue-600 text-white" : "bg-white/95 backdrop-blur border-slate-200 text-slate-600 hover:text-blue-600"
            }`}>
            {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
          </button>
          <button onClick={toggleFullscreen}
            title={fs ? "Sair de ecrã inteiro" : "Ecrã inteiro"}
            className="w-9 h-9 rounded-lg shadow-md border bg-white/95 backdrop-blur border-slate-200 text-slate-600 hover:text-blue-600 flex items-center justify-center transition-colors">
            {fs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
    </>
  );
}
