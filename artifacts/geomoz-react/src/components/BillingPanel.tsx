import React, { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Check, CreditCard, GraduationCap, Building2, Users, Globe2, Zap, ShieldCheck, Loader2, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

type Interval = "month" | "year";
type PlanId = "community" | "academic" | "pro" | "teams" | "enterprise";
type Provider = "stripe" | "mpesa" | "emola";
interface Plan {
  id: PlanId;
  name: string;
  monthly_mzn: number | null;
  annual_mzn: number | null;
  projects: number | null;
  storage_bytes: number | null;
  credits: number | null;
  seats: number | null;
  concurrent_jobs: number | null;
  features: string[];
  description: string;
}
interface Order {
  id: string; plan: string; amount_mzn: number; status: string;
  interval: Interval; provider: string; created_at: string;
}
interface Account {
  plan: PlanId;
  status: string;
  expires_at: string | null;
  academic_verified: boolean;
  academic_request_status?: string | null;
  usage: { cycle: string; credits_used: number; credits_remaining: number | null; projects: number; projects_limit: number | null };
  orders: Order[];
}
const icons: Record<PlanId, React.ReactNode> = {
  community: <Globe2 size={20} />, academic: <GraduationCap size={20} />,
  pro: <Zap size={20} />, teams: <Users size={20} />, enterprise: <Building2 size={20} />,
};
const descriptions: Record<string, string> = {
  gis_core: "SIG e cartografia", map_services: "Serviços WMS, WFS, XYZ e WMTS",
  digitizing: "Digitalização vectorial", local_raster: "Ferramentas raster locais",
  terrain_3d_basic: "Visualização 3D", basic_exports: "Exportações essenciais",
  scientific_analysis: "Análises científicas", research_exports: "Exportações académicas",
  batch_processing: "Análises em lote", high_res_exports: "Exportações de alta resolução",
  team_workspace: "Espaços de equipa", roles: "Permissões e papéis",
  enterprise_api: "Integração API", sso: "Autenticação empresarial", sla: "Acordo de serviço",
};
const money = (n: number) => new Intl.NumberFormat("pt-PT").format(n) + " MZN";
const bytes = (n: number | null) => n == null ? "Por contrato" : n >= 1024 ** 3
  ? Math.round(n / (1024 ** 3)) + " GB" : Math.round(n / (1024 ** 2)) + " MB";

export default function BillingPanel({ publicView = false }: { publicView?: boolean }) {
  const { user, isGuest } = useAuth();
  const signedIn = Boolean(user && !isGuest);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [stripeReady, setStripeReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [interval, setInterval] = useState<Interval>("month");
  const [provider, setProvider] = useState<Provider>("mpesa");
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [institution, setInstitution] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessMessage, setBusinessMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = await apiFetch("/geomoz-api/billing/plans");
      if (!p.ok) throw new Error("Não foi possível carregar o catálogo de planos.");
      const pjson = await p.json();
      setPlans(pjson.plans as Plan[]);
      setStripeReady(Boolean(pjson.payment_methods?.stripe));
      if (signedIn) {
        const a = await apiFetch("/geomoz-api/billing/me");
        if (!a.ok) throw new Error("Não foi possível consultar a subscrição. Confirme a ligação ao servidor.");
        setAccount(await a.json() as Account);
      } else {
        setAccount(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de ligação ao servidor.");
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => { void load(); }, [load]);

  const requestCheckout = async (plan: PlanId) => {
    if (!signedIn) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch("/geomoz-api/billing/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval, provider }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || "Não foi possível criar o pedido.");
      if (result.checkout_url) {
        const url = new URL(result.checkout_url);
        if (url.protocol !== "https:" || !url.hostname.endsWith(".stripe.com")) {
          throw new Error("O gateway devolveu um endereço de pagamento inválido.");
        }
        window.location.assign(url.href);
        return;
      }
      setNotice(result.message || "Pedido registado. Aguarde a confirmação do pagamento.");
      setSelected(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro no checkout."); }
    finally { setBusy(false); }
  };

  const requestAcademic = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch("/geomoz-api/billing/academic-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution, institutional_email: schoolEmail }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || "Não foi possível enviar o pedido.");
      setNotice(result.message); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); }
    finally { setBusy(false); }
  };

  const requestEnterprise = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch("/geomoz-api/billing/enterprise-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisation, contact_email: businessEmail, message: businessMessage }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || "Não foi possível enviar o pedido.");
      setNotice("Pedido institucional submetido. A equipa entrará em contacto após avaliação.");
      setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-5 text-slate-900 dark:text-slate-100" aria-label="Planos e subscrição GeoMoz">
      {!publicView && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Plano e subscrição</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Consulte o seu plano, os consumos e os pedidos de pagamento.</p>
          </div>
          <button type="button" onClick={() => void load()} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700" aria-label="Actualizar subscrição">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      )}
      {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200"><AlertCircle size={17} className="shrink-0" />{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-200">{notice}</div>}
      {signedIn && account && (
        <div className="rounded-2xl border border-sky-200/80 bg-sky-50/70 dark:bg-slate-800/70 dark:border-slate-700 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-sky-600" /><span className="text-sm font-semibold">Plano actual: GeoMoz {account.plan[0].toUpperCase() + account.plan.slice(1)}</span></div>
            <span className="text-xs text-slate-500 dark:text-slate-300">{account.expires_at ? "Válido até " + new Date(account.expires_at).toLocaleDateString("pt-PT") : "Sem validade de pagamento"}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/80 dark:bg-slate-900/70 p-3"><p className="text-[11px] text-slate-500">Projectos cloud</p><p className="text-base font-bold">{account.usage.projects} / {account.usage.projects_limit ?? "—"}</p></div>
            <div className="rounded-xl bg-white/80 dark:bg-slate-900/70 p-3"><p className="text-[11px] text-slate-500">Créditos disponíveis</p><p className="text-base font-bold">{account.usage.credits_remaining ?? "Por contrato"}</p></div>
            <div className="rounded-xl bg-white/80 dark:bg-slate-900/70 p-3 col-span-2 sm:col-span-1"><p className="text-[11px] text-slate-500">Ciclo de consumo (UTC)</p><p className="text-base font-bold">{account.usage.cycle}</p></div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Créditos medem apenas operações executadas pelos serviços GeoMoz com medição activada; processamento no projecto GEE pessoal tem quotas próprias.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="text-base font-bold">Escolha o plano adequado</h4><p className="text-xs text-slate-500 dark:text-slate-400">Preços propostos em meticais · renovação manual · sem cobrança automática.</p></div>
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 gap-1" role="group" aria-label="Periodicidade">
          <button type="button" aria-pressed={interval === "month"} onClick={() => setInterval("month")} className={`px-3 py-2 text-xs rounded-lg font-semibold ${interval === "month" ? "bg-white dark:bg-slate-700 shadow-sm" : "text-slate-500 dark:text-slate-400"}`}>Mensal</button>
          <button type="button" aria-pressed={interval === "year"} onClick={() => setInterval("year")} className={`px-3 py-2 text-xs rounded-lg font-semibold ${interval === "year" ? "bg-white dark:bg-slate-700 shadow-sm" : "text-slate-500 dark:text-slate-400"}`}>Anual · poupe 2 meses</button>
        </div>
      </div>
      {loading && plans.length === 0 && <div className="flex items-center gap-2 text-sm text-slate-500 py-8"><Loader2 size={18} className="animate-spin" /> A carregar planos…</div>}
      <div className={`grid gap-3 ${publicView ? "md:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"}`}>
        {plans.map(plan => {
          const isPro = plan.id === "pro";
          const amount = interval === "month" ? plan.monthly_mzn : plan.annual_mzn;
          return (
            <article key={plan.id} className={`relative rounded-2xl border p-4 flex flex-col gap-3 bg-white dark:bg-slate-900 shadow-sm ${isPro ? "border-sky-400 dark:border-sky-600 ring-1 ring-sky-400/30" : "border-slate-200 dark:border-slate-700"}`}>
              {isPro && <span className="absolute -top-2 right-3 rounded-full bg-sky-600 px-2.5 py-0.5 text-[10px] font-bold text-white">Mais completo para profissionais</span>}
              <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">{icons[plan.id]}<h5 className="text-sm font-bold text-slate-900 dark:text-white">{plan.name}</h5></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 min-h-8">{plan.description}</p>
              <div className="min-h-9">
                <strong className="text-xl font-extrabold tracking-tight">{amount == null ? "Sob consulta" : amount === 0 ? "Grátis" : money(amount)}</strong>
                {amount != null && amount !== 0 && <span className="text-xs text-slate-400"> / {interval === "month" ? "mês" : "ano"}</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300 border-y border-slate-100 dark:border-slate-800 py-3">
                <span>Projectos: <b>{plan.projects ?? "À medida"}</b></span>
                <span>Créditos/mês: <b>{plan.credits ?? "À medida"}</b></span>
                <span>Espaço: <b>{bytes(plan.storage_bytes)}</b></span>
                <span>Utilizadores: <b>{plan.seats ?? "À medida"}</b></span>
              </div>
              <ul className="space-y-1.5 flex-1">
                {plan.features.slice(0, publicView ? 8 : 6).map(f => <li key={f} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><Check size={13} className="mt-0.5 shrink-0 text-emerald-600" />{descriptions[f] || f}</li>)}
              </ul>
              {plan.id === "community"
                ? <button disabled className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-500">Acesso gratuito incluído</button>
                : !signedIn
                  ? <Link href="/register" className="w-full rounded-xl bg-sky-600 px-3 py-2.5 text-center text-xs text-white font-bold hover:bg-sky-700">Registar-se para aderir</Link>
                  : <button type="button" onClick={() => { setSelected(plan.id); setError(""); setNotice(""); }} className="w-full rounded-xl bg-sky-600 px-3 py-2.5 text-xs text-white font-bold hover:bg-sky-700">{plan.id === "enterprise" ? "Solicitar proposta" : plan.id === account?.plan ? "Renovar plano" : "Seleccionar plano"}</button>}
            </article>
          );
        })}
      </div>

      {selected && signedIn && (
        <div className="rounded-2xl border border-sky-300 dark:border-sky-700 bg-slate-50 dark:bg-slate-800/80 p-4 space-y-3" aria-label="Finalizar pedido">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h4 className="text-sm font-bold">Adesão: {plans.find(p => p.id === selected)?.name}</h4>
            <button onClick={() => setSelected(null)} type="button" className="text-xs underline text-slate-500">Fechar</button>
          </div>
          {selected === "academic" && !account?.academic_verified ? (
            <form onSubmit={requestAcademic} className="space-y-3">
              <p className="text-xs text-slate-500">A modalidade académica requer verificação da instituição antes do pagamento. Estado: {account?.academic_request_status || "não solicitado"}.</p>
              <input required minLength={2} maxLength={180} value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Universidade ou instituição" className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-sm" />
              <input required type="email" maxLength={254} value={schoolEmail} onChange={e => setSchoolEmail(e.target.value)} placeholder="E-mail institucional" className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-sm" />
              <button disabled={busy} type="submit" className="rounded-lg bg-sky-600 text-white px-4 py-2 text-xs font-semibold disabled:opacity-50">{busy ? "A enviar…" : "Solicitar verificação académica"}</button>
            </form>
          ) : selected === "enterprise" ? (
            <form onSubmit={requestEnterprise} className="space-y-3">
              <input required minLength={2} maxLength={180} value={organisation} onChange={e => setOrganisation(e.target.value)} placeholder="Organização" className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-sm" />
              <input required type="email" maxLength={254} value={businessEmail} onChange={e => setBusinessEmail(e.target.value)} placeholder="E-mail de contacto" className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-sm" />
              <textarea maxLength={2000} rows={3} value={businessMessage} onChange={e => setBusinessMessage(e.target.value)} placeholder="Número de utilizadores, módulos e necessidades de integração" className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-sm" />
              <button type="submit" disabled={busy} className="rounded-lg bg-sky-600 text-white px-4 py-2 text-xs font-semibold disabled:opacity-50">Solicitar proposta institucional</button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300">Pagamento antecipado para {interval === "month" ? "um mês" : "um ano"}. A subscrição só é activada após confirmação verificada pelo servidor.</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Método de pagamento">
                {(["mpesa", "emola", "stripe"] as Provider[]).map(p => <button type="button" disabled={p === "stripe" && !stripeReady} aria-pressed={provider === p} key={p} onClick={() => setProvider(p)} className={`rounded-lg border px-3 py-2 text-xs ${provider === p ? "border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "border-slate-300 dark:border-slate-700"}`}>{p === "stripe" ? "Cartão / Stripe" + (!stripeReady ? " (indisponível)" : "") : p === "mpesa" ? "M-Pesa" : "E-Mola"}</button>)}
              </div>
              {provider !== "stripe" && <p className="text-xs text-amber-700 dark:text-amber-300">O gateway {provider === "mpesa" ? "M-Pesa" : "E-Mola"} está em preparação. O pedido ficará pendente; não efectue transferências sem referência de pagamento válida.</p>}
              <button type="button" onClick={() => void requestCheckout(selected)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 text-white px-4 py-2.5 text-xs font-bold hover:bg-sky-700 disabled:opacity-50"><CreditCard size={15} />{busy ? "A processar…" : provider === "stripe" ? "Continuar para pagamento seguro" : "Registar pedido pendente"}<ExternalLink size={13} /></button>
            </div>
          )}
        </div>
      )}

      {signedIn && account && account.orders.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold">Histórico de pedidos</h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800"><tr><th className="p-2.5">Data</th><th className="p-2.5">Plano</th><th className="p-2.5">Valor</th><th className="p-2.5">Estado</th></tr></thead>
              <tbody>{account.orders.map(o => <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2.5">{new Date(o.created_at).toLocaleDateString("pt-PT")}</td><td className="p-2.5">{o.plan}</td><td className="p-2.5">{money(o.amount_mzn)}</td><td className="p-2.5 font-semibold">{o.status === "paid" ? "Pago" : o.status === "pending" ? "Pendente" : "Erro de gateway"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">O GeoMoz não elimina automaticamente os seus projectos no fim da subscrição. As quotas e créditos aplicam-se a recursos geridos pela plataforma; a utilização de Earth Engine com projecto próprio segue as condições da Google. Valores e modalidades sujeitos a validação comercial antes do lançamento.</p>
    </section>
  );
}
