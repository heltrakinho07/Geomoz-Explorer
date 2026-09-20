import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface AreaUploadProps {
  onGeometryLoaded: (geojson: GeoJSON.GeoJSON, label: string) => void;
}

/**
 * AreaUpload — drag & drop or click-to-upload GeoJSON/KML/GPX files.
 * Parses the file client-side and calls onGeometryLoaded with the result.
 */
export default function AreaUpload({ onGeometryLoaded }: AreaUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["geojson", "json", "kml", "gpx"].includes(ext)) {
      setError("Formato não suportado. Use GeoJSON (.geojson/.json), KML ou GPX.");
      setLoading(false);
      return;
    }

    try {
      const text = await file.text();

      if (ext === "geojson" || ext === "json") {
        const data = JSON.parse(text) as GeoJSON.GeoJSON;
        if (!data.type || !["Point","MultiPoint","LineString","MultiLineString",
                           "Polygon","MultiPolygon","GeometryCollection",
                           "Feature","FeatureCollection"].includes(data.type)) {
          throw new Error("GeoJSON inválido: tipo geométrico não reconhecido.");
        }
        onGeometryLoaded(data, file.name.replace(/\.[^.]+$/, ""));
      } else {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${apiUrl}/geomoz-api/convert-geom`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.detail || `Erro na conversão: ${res.status}`);
        }
        const data = await res.json() as GeoJSON.GeoJSON;
        onGeometryLoaded(data, file.name.replace(/\.[^.]+$/, ""));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ler ficheiro.");
    } finally {
      setLoading(false);
    }
  }, [onGeometryLoaded]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40"
            : "border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-500 hover:bg-sky-50/50 dark:hover:bg-slate-800/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".geojson,.json,.kml,.gpx"
          className="hidden"
          onChange={onFileInput}
        />
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
            <Loader2 size={16} className="animate-spin text-sky-500" />
            <span className="text-sm">A ler ficheiro…</span>
          </div>
        ) : (
          <>
            <Upload size={20} className="mx-auto mb-1.5 text-slate-400 dark:text-slate-500" />
            <p className="text-xs text-slate-500 dark:text-slate-300 font-medium">
              Arraste um ficheiro ou clique para escolher
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              GeoJSON, KML ou GPX
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg text-[11px] text-red-700 dark:text-red-300">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
