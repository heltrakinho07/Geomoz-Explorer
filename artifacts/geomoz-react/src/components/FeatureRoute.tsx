import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

export default function FeatureRoute({ feature, children }: { feature: string; children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    apiFetch("/geomoz-api/billing/module-access")
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (current) setEnabled(data?.features?.[feature] === true); })
      .catch(() => { if (current) setEnabled(false); });
    return () => { current = false; };
  }, [feature]);
  if (enabled === null) return <div className="w-full min-h-screen in-[[data-geomoz-system]]:min-h-0 grid place-items-center text-slate-500">A verificar a disponibilidade do módulo...</div>;
  if (!enabled) return <div className="w-full min-h-screen in-[[data-geomoz-system]]:min-h-0 grid place-items-center p-5 bg-slate-950 text-slate-100">
    <div className="max-w-md text-center rounded-2xl border border-slate-700 p-8">
      <h1 className="font-bold text-xl">Módulo temporariamente indisponível</h1>
      <p className="text-slate-400 text-sm mt-3">Este módulo está indisponível para o plano da conta ou foi desactivado pela administração.</p>
      <a href="/dashboard" className="inline-block text-sky-300 mt-5">Voltar ao painel</a>
    </div>
  </div>;
  return <>{children}</>;
}
