import { useEffect, useState } from "react";

export interface GAULUnit { code: number; name: string; countryCode: string; parentCode: number | null; level: number }
export interface GAULSelection { adminLevel: 0 | 1 | 2; admin1Code: number | null; admin1Name: string | null; admin2Code: number | null; admin2Name: string | null }
export type LoadGAULUnits = (countryCode: string, level: 1 | 2, parentCode: number | null, signal: AbortSignal) => Promise<GAULUnit[]>;

type Props = { countryCode: string; selection: GAULSelection; disabled?: boolean; loadUnits: LoadGAULUnits; onChange: (selection: GAULSelection) => void };
export function GAULAreaSelect({ countryCode, selection, disabled, loadUnits, onChange }: Props) {
  const [first, setFirst] = useState<GAULUnit[]>([]);
  const [second, setSecond] = useState<GAULUnit[]>([]);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [error1, setError1] = useState("");
  const [error2, setError2] = useState("");
  const [retry, setRetry] = useState(0);
  const [districtQuery, setDistrictQuery] = useState("");
  const isMozambique = countryCode === "MOZ";
  const districtResults = second.filter((unit) => unit.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().includes(districtQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()));
  useEffect(() => {
    const controller = new AbortController();
    setFirst([]); setError1(""); setLoading1(true);
    loadUnits(countryCode, 1, null, controller.signal).then((units) => {
      if (!controller.signal.aborted) setFirst(units);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setError1(error instanceof Error ? error.message : "Não foi possível listar ADM1.");
    }).finally(() => { if (!controller.signal.aborted) setLoading1(false); });
    return () => controller.abort();
  }, [countryCode, loadUnits, retry]);
  useEffect(() => {
    const controller = new AbortController();
    setSecond([]); setError2(""); setLoading2(false);
    setDistrictQuery("");
    if (selection.admin1Code === null) return () => controller.abort();
    setLoading2(true);
    loadUnits(countryCode, 2, selection.admin1Code, controller.signal).then((units) => {
      if (!controller.signal.aborted) setSecond(units);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setError2(error instanceof Error ? error.message : "Não foi possível listar ADM2.");
    }).finally(() => { if (!controller.signal.aborted) setLoading2(false); });
    return () => controller.abort();
  }, [countryCode, selection.admin1Code, loadUnits, retry]);
  return <div className="space-y-2 text-[11px] text-slate-300">
    <div className="grid grid-cols-2 gap-2">
      <label>{isMozambique ? "Província (ADM1)" : "Unidade administrativa (ADM1)"}
        <select aria-label="Unidade FAO GAUL ADM1" disabled={disabled || loading1 || !!error1} value={selection.admin1Code ?? ""}
          onChange={(event) => {
            const unit = first.find((item) => String(item.code) === event.target.value);
            onChange({ adminLevel: unit ? 1 : 0, admin1Code: unit?.code ?? null, admin1Name: unit?.name ?? null, admin2Code: null, admin2Name: null });
          }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs">
          <option value="">{loading1 ? "A carregar ADM1…" : "Todo o país"}</option>
          {first.map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}
        </select>
      </label>
      <label>{isMozambique ? "Distrito (ADM2)" : "Unidade administrativa (ADM2)"}
        <input aria-label={isMozambique ? "Pesquisar distrito" : "Pesquisar unidade ADM2"} type="search" value={districtQuery} onChange={(event) => setDistrictQuery(event.target.value)} placeholder={isMozambique ? "Pesquisar distrito…" : "Pesquisar ADM2…"} disabled={disabled || selection.admin1Code === null || loading2 || !!error2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs disabled:opacity-50" />
        <select aria-label="Unidade FAO GAUL ADM2" disabled={disabled || selection.admin1Code === null || loading2 || !!error2} value={selection.admin2Code ?? ""}
          onChange={(event) => {
            const unit = second.find((item) => String(item.code) === event.target.value);
            onChange({ ...selection, adminLevel: unit ? 2 : 1, admin2Code: unit?.code ?? null, admin2Name: unit?.name ?? null });
          }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs disabled:opacity-50">
          <option value="">{loading2 ? "A carregar ADM2…" : "Toda a unidade ADM1"}</option>
          {districtResults.map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}
          {selection.admin2Code !== null && !districtResults.some((unit) => unit.code === selection.admin2Code) && second.filter((unit) => unit.code === selection.admin2Code).map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}
        </select>
        {districtQuery && !loading2 && !error2 && districtResults.length === 0 && <span role="status" className="mt-1 block text-amber-300">Nenhuma unidade encontrada.</span>}
      </label>
    </div>
    {(error1 || error2) && <div role="alert" className="text-amber-300">
      <p>{error1 || error2}</p>
      <button type="button" disabled={disabled} onClick={() => setRetry((value) => value + 1)} className="mt-1 underline">Tentar novamente</button>
    </div>}
    <p className="text-[10px] text-slate-400">FAO GAUL 2025 · CC BY 4.0. Os nomes e níveis variam por país. As listagens exigem GEE autorizado.</p>
  </div>;
}
