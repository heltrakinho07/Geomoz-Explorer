import { useEffect, useRef, useState } from "react";
import { Popup, useMapEvents } from "react-leaflet";
import { apiFetch } from "@/lib/api";

type Pixel = { status: "success"; id: number; name: string; color: string }
  | { status: "outside" | "no_data" };

export function WorldCoverInspector({ aoi }: { aoi: Record<string, unknown> }) {
  const request = useRef<AbortController | null>(null);
  const [sample, setSample] = useState<{
    latitude: number; longitude: number; id: number; result?: Pixel; error?: string;
  } | null>(null);
  const clickId = useRef(0);
  useEffect(() => () => request.current?.abort(), []);

  useMapEvents({
    click: async ({ latlng }) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const point = { latitude: latlng.lat, longitude: ((latlng.lng + 180) % 360 + 360) % 360 - 180 };
      const selection = { ...point, id: ++clickId.current };
      setSample(selection);
      try {
        const response = await apiFetch("/geomoz-api/ai/worldcover-pixel", {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aoi, ...point }),
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => null);
          throw new Error(typeof problem?.detail === "string" ? problem.detail : "Não foi possível consultar este ponto.");
        }
        const result = await response.json() as Pixel;
        if (!controller.signal.aborted) setSample({ ...selection, result });
      } catch (error) {
        if (!controller.signal.aborted) setSample({ ...selection, error: error instanceof Error ? error.message : "Falha na consulta." });
      }
    },
  });

  if (!sample) return null;
  const { latitude, longitude, result, error } = sample;
  return (
    <Popup key={sample.id} position={[latitude, longitude]} autoPan={false}>
      <div role="status" className="space-y-1 text-xs">
        <strong>WorldCover 2021 · Inspector</strong>
        <div>{latitude.toFixed(5)}, {longitude.toFixed(5)}</div>
        {error ? <div>{error}</div> : !result ? <div>A consultar classe…</div>
          : result.status === "success" ? (
            <div>
              <span aria-hidden="true" className="mr-1.5 inline-block size-3 rounded-sm border border-slate-500/40" style={{ backgroundColor: result.color }} />
              {result.name} · classe {result.id}
            </div>
          ) : <div>{result.status === "outside" ? "Fora da área da análise." : "Sem dados neste ponto."}</div>}
      </div>
    </Popup>
  );
}
