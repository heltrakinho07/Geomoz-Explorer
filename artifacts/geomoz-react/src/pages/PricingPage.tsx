import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Building2, Check, CreditCard, GraduationCap, Layers3, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { PLANS, PLAN_ORDER, formatMzn, type PlanId } from "@/lib/plans";
import { apiFetch } from "@/lib/api";

const features: Record<PlanId, string[]> = {
  community: ["GIS Workspace e ferramentas SIG locais", "3 projectos e 500 MB", "20 créditos mensais de teste"],
  academic: ["Análises científicas e GEE próprio", "15 projectos e 5 GB", "150 créditos mensais · elegibilidade académica"],
  pro: ["Processamento e exportação avançados", "75 projectos e 30 GB", "800 créditos mensais"],
  teams: ["Até cinco utilizadores", "200 projectos e 150 GB", "3.000 créditos mensais"],
  enterprise: ["Integrações, APIs e SLA", "Capacidades personalizadas", "Licenciamento institucional"],
};
type PaymentRecord = {
  id: string;
  plan: PlanId;
  period: string;
  amountMzn: number;
  status: string;
  createdAt?: string;
};
type Region = "mz" | "international";

export default function PricingPage() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading, getIdToken } = useAuth();
  const billing = useSubscription();
  const [annual, setAnnual] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [region, setRegion] = useState<Region>("mz");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiFetch("/geomoz-api/billing/config")
      .then(async res => res.ok ? res.json() : null)
      .then(data => { if (mounted) setCheckoutEnabled(data?.checkoutEnabled === true); })
      .catch(() => { if (mounted) setCheckoutEnabled(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setCustomerName(user?.displayName || "");
  }, [user?.uid, user?.displayName]);

  async function verifyPayment(paymentId: string) {
    if (!user || user.uid === "guest_user") {
      setNotice("Inicie sessão na conta que efectuou o pagamento para consultar o estado.");
      return;
    }
    setChecking(true);
    try {
      const response = await apiFetch("/geomoz-api/billing/payments/" + encodeURIComponent(paymentId));
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Não foi possível verificar o pagamento.");
      const status = String(result.status || "pending");
      const messages: Record<string, string> = {
        paid: "Pagamento confirmado pelo PayZeno. O plano está activo.",
        pending: "Pagamento ainda pendente de confirmação. Pode voltar a verificar.",
        expired: "A sessão de pagamento expirou.",
        cancelled: "O pagamento foi cancelado.",
        failed: "O PayZeno não confirmou o pagamento.",
        refunded: "Pagamento reembolsado; o acesso foi actualizado.",
        chargeback: "O pagamento foi contestado; contacte o suporte.",
      };
      setNotice(messages[status] || "Estado actual: " + status);
    } catch (error: any) {
      setNotice(error?.message || "Falha na verificação do pagamento.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (authLoading || !user || user.uid === "guest_user") return;
    const qs = new URLSearchParams(window.location.search);
    const paymentId = qs.get("payment_id");
    if (paymentId && /^[0-9a-f]{32}$/.test(paymentId)) void verifyPayment(paymentId);
  }, [user?.uid, authLoading]);

  async function loadHistory() {
    if (!user || user.uid === "guest_user") {
      navigate("/login");
      return;
    }
    setShowHistory(!showHistory);
    if (showHistory) return;
    try {
      const response = await apiFetch("/geomoz-api/billing/history");
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Histórico indisponível.");
      setHistory(Array.isArray(result.payments) ? result.payments : []);
    } catch (error: any) {
      setNotice(error?.message || "Não foi possível carregar o histórico.");
    }
  }

  function selectPlan(plan: PlanId) {
    setNotice("");
    if (plan === "community") { navigate(user ? "/dashboard" : "/"); return; }
    if (plan !== "enterprise" && !checkoutEnabled) {
      setNotice("O checkout PayZeno está em validação. O pagamento será disponibilizado após os testes de segurança.");
      return;
    }
    if (plan === "enterprise") {
      setNotice("Solicite uma proposta institucional à equipa GEOLÍTHICA.");
      return;
    }
    if (!user || user.uid === "guest_user") { navigate("/login"); return; }
    setSelected(plan);
  }

  async function checkout() {
    if (!selected || !user || user.uid === "guest_user") return;
    setWorking(true);
    setNotice("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Inicie sessão para efectuar o pagamento.");
      const response = await apiFetch("/geomoz-api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          plan: selected,
          period: annual ? "yearly" : "monthly",
          phone: region === "mz" ? phone : "",
          checkout_region: region,
          customer_name: customerName.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Não foi possível iniciar o pagamento.");
      if (typeof result.url !== "string" || !result.url.startsWith("https://checkout.payzeno.io/")) {
        throw new Error("O PayZeno devolveu um endereço inesperado.");
      }
      window.location.assign(result.url);
    } catch (error: any) {
      setNotice(error?.message || "Não foi possível iniciar o checkout PayZeno.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <button onClick={() => navigate(user ? "/dashboard" : "/")} className="flex items-center gap-2 text-sm font-semibold">
            <ArrowLeft size={17} /> <Layers3 className="text-sky-600" size={20} /> GeoMoz Explorer
          </button>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Planos e subscrição</span>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-9">
          <div className="inline-flex items-center gap-2 text-sky-700 dark:text-sky-300 text-xs font-semibold uppercase tracking-widest"><ShieldCheck size={16} /> Acesso transparente</div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mt-3">SIG profissional, à sua escala.</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-2xl mx-auto">Explore gratuitamente. Evolua para projectos científicos, processamento em cloud e colaboração profissional.</p>
        </div>
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className={!annual ? "font-bold text-sm" : "text-sm text-slate-500"}>Mensal</span>
          <button type="button" role="switch" aria-checked={annual} aria-label="Alternar periodicidade" onClick={() => setAnnual(!annual)} className={`rounded-full w-12 h-7 p-1 transition-colors ${annual ? "bg-sky-600" : "bg-slate-300 dark:bg-slate-700"}`}>
            <span className={`block bg-white rounded-full w-5 h-5 transition-transform ${annual ? "translate-x-5" : ""}`} />
          </button>
          <span className={annual ? "font-bold text-sm" : "text-sm text-slate-500"}>Anual <span className="text-emerald-600 text-xs">2 meses grátis</span></span>
        </div>
        {notice && <div role="status" className="max-w-2xl mx-auto mb-6 border border-sky-300 bg-sky-50 text-sky-950 rounded-xl p-4 text-sm">
          {notice}
          {new URLSearchParams(window.location.search).get("payment_id") && <button type="button" disabled={checking} className="ml-3 underline font-semibold disabled:opacity-50" onClick={() => verifyPayment(new URLSearchParams(window.location.search).get("payment_id") || "")}>Verificar novamente</button>}
        </div>}
        {user && user.uid !== "guest_user" && <div className="mb-6 text-center">
          <button type="button" onClick={loadHistory} className="text-sm font-semibold underline underline-offset-4 text-sky-600">
            {showHistory ? "Ocultar pagamentos" : "Consultar pagamentos e renovações"}
          </button>
        </div>}
        {showHistory && <div className="max-w-3xl mx-auto mb-8 rounded-xl border border-slate-200 dark:border-slate-800 p-5 bg-white dark:bg-slate-900">
          <h2 className="font-bold mb-3">Histórico de pagamentos PayZeno</h2>
          {history.length ? <ul className="space-y-2">{history.map(item => <li key={item.id} className="flex flex-wrap gap-2 items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 text-sm">
            <span>GeoMoz {item.plan} · {item.period === "yearly" ? "Anual" : "Mensal"}</span>
            <span>{formatMzn(item.amountMzn)} · {item.status}</span>
          </li>)}</ul> : <p className="text-sm text-slate-500">Sem pagamentos registados.</p>}
          <p className="text-xs mt-4 text-slate-500">Os períodos não são renovados automaticamente. Pode efectuar uma nova compra antes do vencimento.</p>
        </div>}
        {billing.error && <p className="text-center text-amber-700 text-sm mb-4">Não foi possível consultar a subscrição. Acesso Community apresentado por segurança.</p>}
        {!checkoutEnabled && <p className="text-center text-sm text-amber-700 dark:text-amber-300 mb-6">Pagamentos temporariamente em validação. Os planos podem ser consultados sem efectuar cobranças.</p>}
      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">
          {PLAN_ORDER.map(id => {
            const p = PLANS[id], current = billing.plan === id;
            return <section key={id} className={`rounded-2xl border flex flex-col p-5 shadow-sm ${id === "pro" ? "border-sky-500 ring-2 ring-sky-200 dark:ring-sky-800 bg-white dark:bg-slate-900" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`}>
              <div className="flex items-center gap-2 mb-4 text-sky-600">{id === "academic" ? <GraduationCap size={20} /> : id === "enterprise" ? <Building2 size={20} /> : <Layers3 size={20} />}<h2 className="font-bold">{p.name}</h2></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 min-h-10">{p.audience}</p>
              <div className="mt-4 min-h-16"><div className="text-2xl font-bold tracking-tight">{id === "enterprise" ? "Sob consulta" : formatMzn(annual ? (p.yearlyMzn ?? 0) : (p.monthlyMzn ?? 0))}</div><div className="text-xs text-slate-500">{id === "enterprise" ? "Contrato institucional" : annual ? "por ano" : "por mês"}</div></div>
              <ul className="space-y-3 mt-6 mb-8 flex-1">{features[id].map(feature => <li key={feature} className="flex gap-2 text-sm"><Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />{feature}</li>)}</ul>
              <button type="button" disabled={billing.loading || (!checkoutEnabled && id !== "community" && id !== "enterprise")} onClick={() => selectPlan(id)} className="w-full rounded-xl bg-sky-600 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold py-3 text-sm hover:bg-sky-700 transition-colors">
                {current && id !== "community" ? "Renovar / Gerir período" : id === "enterprise" ? "Solicitar proposta" : id === "community" ? "Começar gratuitamente" : !checkoutEnabled ? "Em validação" : "Escolher plano"}
              </button>
            </section>;
          })}
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">Pagamento único por período contratado, sem débito automático. O checkout PayZeno apresenta os métodos activos e compatíveis, incluindo M-Pesa, e-Mola e cartões quando disponíveis.</p>
        <p className="mt-3 text-center text-sm text-slate-500">O Google Earth Engine associado à sua conta segue as regras e quotas do respectivo projecto Google Cloud; os créditos GeoMoz destinam-se apenas ao processamento gerido pela plataforma.</p>
        <p className="mt-3 text-center text-xs text-slate-500"><CreditCard size={13} className="inline mr-1" /> A confirmação é realizada no servidor e não pelo redireccionamento.</p>
      </main>
      {selected && <div className="fixed inset-0 z-50 bg-black/55 flex justify-center items-center p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
        <section role="dialog" aria-modal="true" aria-label="Dados do pagamento" className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
          <div className="flex justify-between gap-3 items-start">
            <div><div className="text-xs uppercase font-bold tracking-wider text-sky-600">Checkout PayZeno</div><h2 className="text-xl font-bold mt-1">GeoMoz {PLANS[selected].name}</h2>
              <p className="text-sm text-slate-500">{formatMzn(annual ? PLANS[selected].yearlyMzn ?? 0 : PLANS[selected].monthlyMzn ?? 0)} · {annual ? "12 meses" : "1 mês"}</p>
            </div>
            <button type="button" aria-label="Fechar" onClick={() => setSelected(null)}><X size={20} /></button>
          </div>
          <label className="block text-sm font-medium">Nome do titular
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} autoComplete="name" className="mt-1 w-full rounded-lg px-3 py-2 border border-slate-300 dark:border-slate-700 bg-transparent" placeholder="Nome e apelido" required />
          </label>
          <label className="block text-sm font-medium">Região de pagamento
            <select value={region} onChange={e => setRegion(e.target.value as Region)} className="mt-1 w-full rounded-lg px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
              <option value="mz">Moçambique — M-Pesa, e-Mola ou cartão</option>
              <option value="international">Internacional — cartão (quando activo)</option>
            </select>
          </label>
          {region === "mz" ? <label className="block text-sm font-medium">Contacto moçambicano
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" autoComplete="tel" className="mt-1 w-full rounded-lg px-3 py-2 border border-slate-300 dark:border-slate-700 bg-transparent" placeholder="+258 84 000 0000" required />
          </label> : <p className="text-xs text-slate-500">O checkout internacional utiliza um contacto técnico de referência. O pagamento por cartão depende da habilitação do método na sua conta PayZeno.</p>}
          {selected === "academic" && <p className="text-xs text-amber-700">Este plano requer verificação académica antes de pagar.</p>}
          <button type="button" disabled={working || !customerName.trim() || (region === "mz" && !phone.trim())} onClick={checkout} className="w-full py-3 rounded-xl bg-sky-600 text-white font-bold disabled:opacity-50">{working ? "A iniciar checkout…" : "Prosseguir para PayZeno"}</button>
          <p className="text-xs text-slate-500">O GeoMoz não guarda os dados do cartão. O acesso só será activado após confirmação segura do pagamento.</p>
        </section>
      </div>}
    </div>
  );
}
