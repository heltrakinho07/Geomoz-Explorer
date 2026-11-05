import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type MunicipalDistrict = { code: string; name: string; bbox: [number, number, number, number] };

export function isMaputoCity(name?: string | null) {
  return /^(?:cidade (?:de|do) maputo|maputo cidade|maputo city)$/i.test(
    (name ?? "").replace(/[()]/g, "").trim(),
  );
}

export function MaputoMunicipalSelect({ value, disabled, onChange }: {
  value: string;
  disabled?: boolean;
  onChange: (district: MunicipalDistrict | null) => void;
}) {
  const [units, setUnits] = useState<MunicipalDistrict[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/geomoz-api/maputo-municipal-districts", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setUnits(data.units);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);

  return (
    <div className="space-y-1 text-[11px] text-slate-300">
      <label className="block">
        Distrito municipal — Cidade de Maputo
        <select value={value} disabled={disabled || error || !units?.length}
          onChange={(event) => onChange(units?.find((unit) => unit.code === event.target.value) ?? null)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs disabled:opacity-50">
          <option value="">{!error && !units ? "A carregar distritos municipais…" : "Toda a Cidade de Maputo"}</option>
          {units?.map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}
        </select>
      </label>
      {error ? (
        <button type="button" disabled={disabled} className="text-amber-300 underline"
          onClick={() => { setError(false); setRetry((count) => count + 1); }}>
          Não foi possível carregar os distritos. Tentar novamente
        </button>
      ) : (
        <p className="text-slate-400">
          Fonte: cartografia nacional GeoMoz.
          {units && units.length < 7 && ` Limites disponíveis para ${units.length} dos 7 distritos.`}
        </p>
      )}
    </div>
  );
}
