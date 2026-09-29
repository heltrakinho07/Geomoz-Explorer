/**
 * MapDraw — Polygon/rectangle drawing on the Leaflet map.
 *
 * Renders a click handler that captures map clicks (to create vertices)
 * and preview polygons/lines on the map.
 *
 * IMPORTANT: This component MUST be rendered as a child of <MapContainer>.
 */
import { useEffect, useState, useRef } from "react";
import { useMapEvents, Polygon, Polyline, Marker } from "react-leaflet";
import { Pen, X, Check, Trash2, EyeOff, MapPin } from "lucide-react";
import L from "leaflet";

interface LatLng {
  lat: number;
  lng: number;
}

interface MapDrawProps {
  enabled: boolean;
  onDrawComplete: (geojson: GeoJSON.GeoJSON, label: string) => void;
  onCancel: () => void;
  /** If true, shows that a drawn AOI exists on the map */
  hasDrawnAOI?: boolean;
  /** Called to clear the drawn AOI */
  onClearAOI?: () => void;
  /** External trigger: increment to request finishing the current drawing */
  finishRequest?: number;
}

type DrawMode = "polygon" | "rectangle" | "line";

/**
 * DrawingHandler — A proper React component that uses useMapEvents at the
 * top level, as required by React hooks rules.
 *
 * Verifies that the click originated from the MAP, not from inside the
 * toolbar. This prevents the "Concluir" button click from adding a
 * spurious vertex. Uses originalEvent.target (the actual DOM element that
 * was clicked) rather than relying on event propagation timing.
 */
function DrawingHandler({
  enabled,
  drawing,
  onMapClick,
  toolbarRef,
}: {
  enabled: boolean;
  drawing: boolean;
  onMapClick: (lat: number, lng: number) => void;
  toolbarRef: React.RefObject<HTMLDivElement | null>;
}) {
  useMapEvents({
    click(e) {
      if (!enabled || !drawing) return;
      // Ignore clicks that originated from inside the toolbar
      // (e.g. "Concluir", "Cancelar", mode buttons, undo)
      if (e.originalEvent && toolbarRef.current?.contains(e.originalEvent.target as Node)) {
        return;
      }
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * MapDraw — drawing tools for the Leaflet map.
 *
 * Props:
 *   enabled    - show/hide the drawing toolbar
 *   onDrawComplete - called with resulting GeoJSON when user finishes
 *   onCancel   - called when user cancels drawing
 *
 * Usage inside <MapContainer>:
 *   <MapDraw enabled={true} onDrawComplete={...} onCancel={...} />
 */
export default function MapDraw({ enabled, onDrawComplete, onCancel, hasDrawnAOI, onClearAOI, finishRequest }: MapDrawProps) {
  const [mode, setMode] = useState<DrawMode>("polygon");
  const [points, setPoints] = useState<LatLng[]>([]);
  const [drawing, setDrawing] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (enabled) {
      setDrawing(true);
    } else {
      setDrawing(false);
    }
  }, [enabled]);

  function handleMapClick(lat: number, lng: number) {
    setPoints(prev => [...prev, { lat, lng }]);
  }

  function startDraw() {
    setPoints([]);
    setDrawing(true);
  }

  function cancelDraw() {
    setPoints([]);
    setDrawing(false);
    onCancel();
  }

  function finishDraw() {
    if (points.length < 3 && mode !== "line") return;
    if (points.length < 2 && mode === "line") return;

    let geometry: GeoJSON.GeoJSON;

    if (mode === "polygon" || mode === "rectangle") {
      const coords = points.map(p => [p.lng, p.lat] as [number, number]);
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push(first);
      }
      geometry = {
        type: "Polygon",
        coordinates: [coords],
      } as GeoJSON.Polygon;
    } else {
      const coords = points.map(p => [p.lng, p.lat] as [number, number]);
      geometry = {
        type: "LineString",
        coordinates: coords,
      } as GeoJSON.LineString;
    }

    const label = mode === "line"
      ? `Área desenhada (${points.length} pontos)`
      : `Área desenhada (${points.length} vértices, ${points.length + (points.length > 0 ? 1 : 0)} coordenadas no anel)`;
    onDrawComplete(geometry, label);
    setPoints([]);
    setDrawing(false);
  }

  // If parent requests finish, call finishDraw
  useEffect(() => {
    if (typeof finishRequest === "number") {
      // only finish if currently drawing
      if (drawing) finishDraw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishRequest]);

  function undoLast() {
    setPoints(prev => prev.slice(0, -1));
  }

  // Attach native event listeners on the toolbar wrapper to stop ALL pointer events
  // from reaching the Leaflet map container. React's synthetic stopPropagation
  // fires too late (after the native event has already propagated past the
  // map container and triggered useMapEvents' click handler).
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const stop = (e: Event) => { e.stopPropagation(); };
    // NOTE: 'click' and 'dblclick' are intentionally excluded here because
    // React 17+ delegates events at the root. Calling stopPropagation on
    // native 'click' would prevent React from processing the button's
    // onClick handlers (e.g. finishDraw, cancelDraw), breaking save.
    // The originalEvent.target check in DrawingHandler is the primary
    // defense against spurious vertices from toolbar clicks.
    const events = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'];
    events.forEach(evt => el.addEventListener(evt, stop));
    return () => {
      events.forEach(evt => el.removeEventListener(evt, stop));
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div ref={toolbarRef}>
      {/* Proper hook-based click handler (must be inside MapContainer) */}
      <DrawingHandler enabled={enabled} drawing={drawing} onMapClick={handleMapClick} toolbarRef={toolbarRef} />

      {/* Pulsing drawing-mode indicator */}
      {enabled && drawing && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[999] bg-fuchsia-600/90 backdrop-blur-sm text-white rounded-full px-4 py-1.5 text-xs font-medium flex items-center gap-2 shadow-lg pointer-events-none animate-pulse">
          <Pen size={12} className="animate-bounce" />
          Clique no mapa para adicionar vértices
        </div>
      )}

      {/* Drawing toolbar — idle state */}
      {!drawing && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 bg-white rounded-xl shadow-lg border border-slate-200 p-1"
        >
          {!hasDrawnAOI ? (
            <>
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 rounded-lg">
                <Pen size={13} />
                Clique no mapa para adicionar vértices
              </div>
              <div className="h-4 w-px bg-slate-200" />
              <button
                onClick={onCancel}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
              >
                <EyeOff size={12} />
                Fechar
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1">
                <MapPin size={13} className="text-emerald-600" />
                <span className="text-[11px] font-medium text-emerald-700 whitespace-nowrap">Área desenhada ativa</span>
              </div>
              <div className="h-4 w-px bg-slate-200" />
              <button
                onClick={() => { onClearAOI?.(); startDraw(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-50 rounded-lg transition-colors"
                title="Substituir por nova área desenhada"
              >
                <Pen size={13} />
                Desenhar novo
              </button>
              <button
                onClick={() => { onClearAOI?.(); onCancel(); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Remover área desenhada"
              >
                <Trash2 size={12} />
                Limpar
              </button>
            </>
          )}
        </div>
      )}

      {/* Drawing toolbar — active drawing state */}
      {drawing && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 bg-white rounded-xl shadow-lg border border-fuchsia-200 p-1.5">
          <div className="flex items-center gap-0.5 mr-1">
            {(["polygon", "rectangle", "line"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 text-[10px] rounded-md transition-colors ${
                  mode === m ? "bg-fuchsia-100 text-fuchsia-700 font-medium" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {m === "polygon" ? "Polígono" : m === "rectangle" ? "Rectângulo" : "Linha"}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-slate-200" />

          <span className="text-[10px] text-slate-400 px-1.5 font-medium">
            {points.length} {points.length === 1 ? "ponto" : "pts"}
          </span>

          {points.length > 0 && (
            <button
              onClick={undoLast}
              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Desfazer último ponto"
            >
              <Trash2 size={13} />
            </button>
          )}

          <div className="h-5 w-px bg-slate-200" />

          <button
            onClick={finishDraw}
            disabled={mode === "line" ? points.length < 2 : points.length < 3}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors shadow-sm"
          >
            <Check size={12} />
            Concluir
          </button>

          <button
            onClick={cancelDraw}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-lg transition-all"
          >
            <X size={12} />
            Cancelar
          </button>
        </div>
      )}

      {/* Preview polygon on map */}
      {drawing && points.length > 0 && (
        <>
          {/* Vertices */}
          {points.map((p, i) => (
            <Marker
              key={i}
              position={[p.lat, p.lng]}
              icon={L.divIcon({
                className: "",
                html:
                  '<div style="width:18px;height:18px;border-radius:50%;background:#0ea5e9;color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)">' +
                  String(i + 1) +
                  '</div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            />
          ))}
          {/* Connecting lines */}
          {points.length >= 2 && (
            <Polyline
              positions={points.map(p => [p.lat, p.lng])}
              color="#0ea5e9"
              weight={2}
              dashArray="5 5"
            />
          )}
          {/* Closed polygon preview */}
          {points.length >= 3 && (mode === "polygon" || mode === "rectangle") && (
            <Polygon
              positions={points.map(p => [p.lat, p.lng])}
              color="#0ea5e9"
              fillColor="#0ea5e9"
              fillOpacity={0.15}
              weight={2}
            />
          )}
        </>
      )}
    </div>
  );
}
