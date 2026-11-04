import React, { useEffect, useState } from "react";
import { Link as WLink, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, BookOpen, Building2, CalendarClock, Check, CheckCircle2, ChevronRight, Cloud, CreditCard, GraduationCap, Layers3, LockKeyhole, Moon, ShieldCheck, Smartphone, Sun, Users, Wallet, X, Zap } from "lucide-react";
import GeoMozBrandIcon from "@/components/GeoMozBrandIcon";
import { useGeoMozTheme } from "@/hooks/useGeoMozTheme";
import "@/components/dashboard-glass.css";
import "./pricing-geomoz.css";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { PLANS, PLAN_ORDER, formatMzn, type PlanId, type GeoMozPlan } from "@/lib/plans";
import { apiFetch } from "@/lib/api";

const features: Record<PlanId, string[]> = {
  community: ["GIS Workspace e ferramentas SIG locais"],
  academic: ["Análises científicas e GEE próprio", "Elegibilidade académica"],
  pro: ["Processamento e exportação avançados"],
  teams: ["Colaboração e equipas"],
  enterprise: ["Integrações, APIs e SLA", "Licenciamento institucional"],
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

const planIcons: Record<PlanId, React.ElementType> = {
  community: Layers3, academic: GraduationCap, pro: Zap, teams: Users, enterprise: Building2,
};

function formatStorage(bytes: number | null): string {
  if (bytes === null) return "Personalizado";
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(bytes / 1024 ** 3) + " GB";
}

export default function PricingPage() {
  const [, navigate] = useLocation();
  const { theme, toggleTheme } = useGeoMozTheme();
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
  const [teamsCheckoutEnabled, setTeamsCheckoutEnabled] = useState(false);
  const [academicApproved, setAcademicApproved] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [recentRequest, setRecentRequest] = useState<{plan: PlanId; status: string} | null>(null);
  const [serverPlans, setServerPlans] = useState<Record<string, Partial<GeoMozPlan> & {enabled?:boolean}>>({});

  useEffect(() => {
    let mounted = true;
    apiFetch("/geomoz-api/billing/config")
      .then(async res => res.ok ? res.json() : null)
      .then(data => {
        if (!mounted) return;
        setCheckoutEnabled(data?.checkoutEnabled === true);
        setTeamsCheckoutEnabled(data?.teamsCheckoutEnabled === true);
      })
      .catch(() => { if (mounted) setCheckoutEnabled(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch("/geomoz-api/billing/catalog")
      .then(async res => res.ok ? res.json() : null)
      .then(data => { if (active && data?.plans) setServerPlans(data.plans); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (authLoading || !user || user.uid === "guest_user") {
      setAcademicApproved(false);
      setRecentRequest(null);
      return;
    }
    let mounted = true;
    apiFetch("/geomoz-api/billing/me")
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (mounted) setAcademicApproved(data?.academicApproved === true); })
      .catch(() => { if (mounted) setAcademicApproved(false); });
    apiFetch("/geomoz-api/billing/requests/me")
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (mounted && data?.request?.plan) setRecentRequest({
          plan: data.request.plan as PlanId,
          status: String(data.request.status || "pending"),
        });
      }).catch(() => undefined);
    try {
      const stored = window.sessionStorage.getItem("geomoz_pending_plan");
      if (stored) {
        window.sessionStorage.removeItem("geomoz_pending_plan");
        const decoded = JSON.parse(stored);
        if (PLAN_ORDER.includes(decoded.plan) && decoded.plan !== "community"
            && typeof decoded.time === "number" && Date.now() - decoded.time < 1800000) {
          setAnnual(decoded.annual === true);
          setSelected(decoded.plan as PlanId);
        }
      }
    } catch {}
    return () => { mounted = false; };
  }, [user?.uid, authLoading]);

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
      if (!response.ok) throw new Error(String(result.detail || "Não foi possível verificar o pagamento.").replace(/payzeno/gi, "serviço de pagamentos"));
      const status = String(result.status || "pending");
      const messages: Record<string, string> = {
        paid: "Pagamento confirmado. O plano está activo.",
        pending: "Pagamento ainda pendente de confirmação. Pode voltar a verificar.",
        expired: "A sessão de pagamento expirou.",
        cancelled: "O pagamento foi cancelado.",
        failed: "O pagamento não foi confirmado.",
        refunded: "Pagamento reembolsado; o acesso foi actualizado.",
        chargeback: "O pagamento foi contestado; contacte o suporte.",
      };
      setNotice(messages[status] || "Estado actual: " + status);
    } catch (error: any) {
      setNotice(String(error?.message || "Falha na verificação do pagamento.").replace(/payzeno/gi, "serviço de pagamentos"));
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
      setNotice(String(error?.message || "Não foi possível carregar o histórico.").replace(/payzeno/gi, "serviço de pagamentos"));
    }
  }

  function selectPlan(plan: PlanId) {
    setNotice("");
    if (plan === "community") {
      navigate(user && user.uid !== "guest_user" ? "/dashboard" : "/");
      return;
    }
    if (serverPlans[plan]?.enabled === false) {
      setNotice("Este plano está temporariamente indisponível.");
      return;
    }
    if (!user || user.uid === "guest_user") {
      // Whitelisted return route restores the selected plan after login.
      try {
        window.sessionStorage.setItem("geomoz_pending_plan", JSON.stringify({
          plan, annual, time: Date.now(),
        }));
      } catch {}
      navigate("/login?next=/planos");
      return;
    }
    setRequestMessage("");
    setSelected(plan);
  }

  async function submitPlanRequest() {
    if (!selected || !user || user.uid === "guest_user") return;
    setWorking(true);
    setNotice("");
    try {
      const response = await apiFetch("/geomoz-api/billing/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selected, period: annual ? "yearly" : "monthly",
          message: requestMessage.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.detail === "string" ? result.detail : "Não foi possível registar o pedido.");
      }
      setRecentRequest({ plan: selected, status: String(result.request?.status || "pending") });
      setNotice("Pedido de adesão registado. Pode acompanhar o estado nesta página; a nossa equipa analisará o pedido. Não foi efectuada qualquer cobrança.");
      setSelected(null);
      setRequestMessage("");
    } catch (error: any) {
      setNotice(String(error?.message || "Não foi possível submeter o pedido."));
      setSelected(null);
    } finally {
      setWorking(false);
    }
  }

  async function checkout() {
    if (!selected || !user || user.uid === "guest_user" || !checkoutEnabled) return;
    if (selected === "enterprise" || (selected === "teams" && !teamsCheckoutEnabled)
        || (selected === "academic" && !academicApproved)) return;
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
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail.replace(/payzeno/gi, "serviço de pagamentos") : "Não foi possível iniciar o pagamento.");
      if (typeof result.url !== "string" || !result.url.startsWith("https://checkout.payzeno.io/")) {
        throw new Error("O serviço de pagamentos devolveu um endereço inesperado.");
      }
      window.location.assign(result.url);
    } catch (error: any) {
      setNotice(error?.message || "Não foi possível iniciar o pagamento seguro.");
    } finally {
      setWorking(false);
    }
  }


  const home = user && user.uid !== "guest_user" ? "/dashboard" : "/";
  const activePlan = selected ? { ...PLANS[selected], ...(serverPlans[selected] || {}) } : null;
  const requestOnly = Boolean(selected && (
    !checkoutEnabled || selected === "enterprise" ||
    (selected === "teams" && !teamsCheckoutEnabled) ||
    (selected === "academic" && !academicApproved)
  ));
  const paymentId = new URLSearchParams(window.location.search).get("payment_id");

  return (
    <div data-geomoz-system="pricing" className="gm-dashboard gm-pricing min-h-screen text-slate-900 dark:text-slate-100">
      <header className="gm-pricing-topbar sticky top-0 z-30 border-b border-slate-200/85 dark:border-slate-800 bg-white/85 dark:bg-slate-950/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between gap-4">
          <WLink href={home} className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity" aria-label="GeoMoz Explorer — início">
            <GeoMozBrandIcon alt="GeoMoz Explorer" className="h-10 w-10 rounded-xl shadow-md shadow-sky-500/15" width={40} height={40} />
            <span className="flex flex-col min-w-0 leading-tight">
              <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">GeoMoz <span className="text-sky-600 dark:text-sky-400">Explorer</span></span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Planos e subscrições</span>
            </span>
          </WLink>
          <nav aria-label="Navegação de planos" className="flex items-center gap-2 sm:gap-3">
            <button type="button" onClick={toggleTheme} className="grid place-items-center h-10 w-10 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" title={theme === "dark" ? "Activar modo claro" : "Activar modo escuro"} aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo escuro"}>
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <WLink href={home} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/75 dark:bg-slate-800/60 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-sky-700 dark:hover:text-sky-300 transition-colors">
              <ArrowLeft size={16} /> <span className="hidden sm:inline">Voltar à plataforma</span><span className="sm:hidden">Voltar</span>
            </WLink>
          </nav>
        </div>
      </header>

      <main className="gm-dashboard-content max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-9 pb-16">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
          <WLink href={home} className="hover:text-sky-600">GeoMoz Explorer</WLink><ChevronRight size={14} />
          <span className="text-sky-700 dark:text-sky-300 font-bold">Planos e subscrições</span>
        </div>

        <section className="gm-dashboard-hero gm-pricing-hero p-6 sm:p-8 mb-7" aria-labelledby="pricing-title">
          <div className="relative z-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div className="max-w-[760px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-200">
                <ShieldCheck size={14}/> GeoMoz Explorer · Subscrições
              </span>
              <h1 id="pricing-title" className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white">
                O plano certo para cada <span className="text-sky-300">projecto geoespacial.</span>
              </h1>
              <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-300">
                Do trabalho SIG individual à investigação, consultoria e colaboração institucional. Uma única plataforma, com diferentes níveis de utilização.
              </p>
            </div>
            <div className="gm-pricing-hero-status rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-4 min-w-[190px]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-sky-200">O seu acesso</div>
              <div className="mt-1.5 text-xl font-extrabold text-white">{user && user.uid !== "guest_user" ? billing.planData.name : "Explorar GeoMoz"}</div>
              <div className="mt-1 text-xs text-slate-300">{user && user.uid !== "guest_user" ? "Plano associado à sua conta" : "Comece pelo plano Community"}</div>
            </div>
          </div>
          <div className="gm-dashboard-hero__divider relative z-10 mt-6 pt-4 border-t flex flex-wrap gap-3 sm:gap-6 text-xs text-slate-200">
            <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-300" /> Sem renovação automática</span>
            <span className="inline-flex items-center gap-2"><LockKeyhole size={15} className="text-sky-300" /> Confirmação segura</span>
            <span className="inline-flex items-center gap-2"><Cloud size={15} className="text-sky-300" /> Ferramentas SIG e análises científicas</span>
          </div>
        </section>

        <section aria-label="Periodicidade de subscrição" className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Escolha o seu plano</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Preços em meticais (MZN), sem débitos automáticos.</p>
          </div>
          <div className="gm-pricing-period inline-flex items-center p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/85 shadow-sm" role="group" aria-label="Duração do plano">
            <button type="button" onClick={() => setAnnual(false)} aria-pressed={!annual}
              className={"rounded-lg px-4 py-2.5 text-sm font-bold transition-all " + (!annual ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/15" : "text-slate-500 dark:text-slate-300 hover:text-sky-700 dark:hover:text-white")}>Mensal</button>
            <button type="button" onClick={() => setAnnual(true)} aria-pressed={annual}
              className={"rounded-lg px-4 py-2.5 text-sm font-bold transition-all " + (annual ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/15" : "text-slate-500 dark:text-slate-300 hover:text-sky-700 dark:hover:text-white")}>Anual</button>
          </div>
        </section>

        {notice && (
          <div role="status" className="gm-dashboard-panel mb-6 max-w-4xl rounded-xl p-4 text-sm flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2"><ShieldCheck size={17} className="text-sky-600 dark:text-sky-300 shrink-0"/><span>{notice}</span></div>
            {paymentId && /^[0-9a-f]{32}$/.test(paymentId) && <button type="button" disabled={checking} className="text-sky-700 dark:text-sky-300 underline font-semibold disabled:opacity-50" onClick={() => verifyPayment(paymentId)}>Verificar novamente</button>}
          </div>
        )}
        {billing.error && <div className="mb-5 text-sm text-amber-700 dark:text-amber-300">Não foi possível consultar a subscrição. O estado será actualizado quando a ligação for restabelecida.</div>}
        {recentRequest && (
          <div className="gm-dashboard-panel mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 text-sm" role="status">
            <span><strong>Pedido {recentRequest.plan}:</strong> {
              recentRequest.status === "pending" ? "recebido, aguarda análise" :
              recentRequest.status === "in_review" ? "em análise" :
              recentRequest.status === "completed" ? "analisado pela equipa" : "encerrado"
            }.</span>
            <button type="button" className="font-bold text-sky-600 dark:text-sky-300 hover:underline" onClick={() => {
              apiFetch("/geomoz-api/billing/requests/me").then(async response => response.ok ? response.json() : null)
                .then(data => { if (data?.request) setRecentRequest({ plan: data.request.plan, status: data.request.status }); })
                .catch(() => setNotice("Não foi possível actualizar o pedido."));
            }}>Actualizar estado</button>
          </div>
        )}
        {!checkoutEnabled && <div className="gm-pricing-readiness mb-6 rounded-xl border border-amber-200/85 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/25 p-4 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <CalendarClock size={19} className="shrink-0 mt-0.5"/>
          <div><strong>Pedidos de adesão abertos.</strong> Pode escolher um plano e submeter o pedido à Administração GeoMoz. Os pagamentos online serão activados depois da validação de segurança, sem qualquer cobrança nesta fase.</div>
        </div>}

        <div className="gm-pricing-grid grid sm:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6" aria-label="Comparação de planos">
          {PLAN_ORDER.map(id => {
            const p = { ...PLANS[id], ...(serverPlans[id] || {}) };
            const Icon = planIcons[id];
            const current = user && user.uid !== "guest_user" && billing.plan === id && !billing.error;
            const highlighted = id === "pro";
            const amount = annual ? p.yearlyMzn : p.monthlyMzn;
            const disabled = p.enabled === false;
            return (
              <article key={id} data-plan={id} className={"gm-pricing-card gm-dashboard-panel relative flex flex-col p-5 sm:p-6 " + (highlighted ? "gm-pricing-card--featured" : "")}>
                {highlighted && <span className="gm-pricing-featured-label absolute top-0 right-0 rounded-bl-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-3.5 py-2 text-[10px] uppercase tracking-wider font-extrabold text-white">Para profissionais</span>}
                <div className="flex items-start justify-between gap-3 mt-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="gm-pricing-plan-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/95 dark:bg-sky-950/40 text-sky-600 dark:text-sky-300"><Icon size={22}/></span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-extrabold tracking-tight">{p.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{p.audience}</p>
                    </div>
                  </div>
                  {current && <span className="gm-pricing-current inline-flex rounded-full bg-emerald-100 dark:bg-emerald-900/35 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Plano actual</span>}
                </div>
                <div className="mt-6 pb-5 border-b border-slate-200/75 dark:border-slate-700/75">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-3xl sm:text-[34px] font-black tracking-tight text-slate-900 dark:text-white">{id === "enterprise" ? "Sob consulta" : formatMzn(amount ?? 0)}</span>
                  </div>
                  <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{id === "enterprise" ? "Condições para instituições" : id === "community" ? "Acesso gratuito" : annual ? "Total por 12 meses" : "Total por 1 mês"}</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <div className="gm-pricing-metric rounded-xl bg-slate-50/90 dark:bg-slate-800/60 p-3 border border-slate-200/60 dark:border-slate-700/50">
                    <Layers3 size={15} className="text-sky-600 dark:text-sky-300"/>
                    <div className="mt-2 text-sm font-extrabold">{p.projects === null ? "À medida" : p.projects}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Projectos cloud</div>
                  </div>
                  <div className="gm-pricing-metric rounded-xl bg-slate-50/90 dark:bg-slate-800/60 p-3 border border-slate-200/60 dark:border-slate-700/50">
                    <Zap size={15} className="text-sky-600 dark:text-sky-300"/>
                    <div className="mt-2 text-sm font-extrabold">{p.credits === null ? "À medida" : p.credits.toLocaleString("pt-PT")}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Créditos / mês</div>
                  </div>
                  <div className="gm-pricing-metric rounded-xl bg-slate-50/90 dark:bg-slate-800/60 p-3 border border-slate-200/60 dark:border-slate-700/50">
                    <Cloud size={15} className="text-sky-600 dark:text-sky-300"/>
                    <div className="mt-2 text-sm font-extrabold">{formatStorage(p.storageBytes)}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Armazenamento*</div>
                  </div>
                  <div className="gm-pricing-metric rounded-xl bg-slate-50/90 dark:bg-slate-800/60 p-3 border border-slate-200/60 dark:border-slate-700/50">
                    <Users size={15} className="text-sky-600 dark:text-sky-300"/>
                    <div className="mt-2 text-sm font-extrabold">{p.seats === null ? "À medida" : p.seats}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Utilizadores*</div>
                  </div>
                </div>
                <ul className="mt-5 mb-6 flex-1 space-y-3">
                  {features[id].map(feature => <li key={feature} className="flex gap-2.5 text-sm text-slate-700 dark:text-slate-200"><Check size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" /> {feature}</li>)}
                </ul>
                <button type="button" onClick={() => selectPlan(id)}
                  disabled={billing.loading || disabled}
                  className={"gm-pricing-card-button w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold transition-all disabled:cursor-not-allowed " +
                    "bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:from-sky-600 hover:to-indigo-700 shadow-md shadow-sky-500/15"}>
                  {disabled ? "Indisponível" : id === "enterprise" ? "Pedir proposta" : id === "community" ? (current ? "Abrir GeoMoz" : "Começar gratuitamente") : (!checkoutEnabled || (id === "teams" && !teamsCheckoutEnabled) || (id === "academic" && !academicApproved)) ? "Solicitar adesão" : current ? "Renovar plano" : "Escolher plano"}
                  {id === "enterprise" ? <ArrowRight size={16}/> : null}
                </button>
              </article>
            );
          })}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          * Armazenamento partilhado, colaboração e limites de processamento avançado dependem da disponibilização técnica dos serviços correspondentes. Os créditos GeoMoz são independentes das quotas Google Earth Engine da sua conta.
        </p>

        <section className="gm-pricing-payment-section gm-dashboard-panel mt-9 rounded-2xl p-5 sm:p-7" aria-labelledby="payment-methods-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <div className="text-xs uppercase tracking-wider font-bold text-sky-600 dark:text-sky-300">Pagamento e segurança</div>
              <h2 id="payment-methods-title" className="mt-1.5 text-xl sm:text-2xl font-extrabold">Como pode efectuar o pagamento?</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Em Moçambique, poderá utilizar carteira móvel ou cartão, conforme os métodos activos no momento do pagamento. Para o exterior, a disponibilidade de cartões internacionais depende da modalidade habilitada.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-bold"><ShieldCheck size={17}/> Processamento seguro</span>
          </div>
          <div className="mt-6 grid sm:grid-cols-3 gap-3">
            <div className="gm-pricing-payment-method flex gap-3 items-start rounded-xl border border-slate-200/80 dark:border-slate-700 p-4 bg-white/65 dark:bg-slate-800/35">
              <span className="gm-pricing-payment-icon"><Smartphone size={21}/></span>
              <div><h3 className="font-bold text-sm">M-Pesa</h3><p className="text-xs mt-1 text-slate-500 dark:text-slate-400">Pagamento móvel em Moçambique, quando disponível.</p></div>
            </div>
            <div className="gm-pricing-payment-method flex gap-3 items-start rounded-xl border border-slate-200/80 dark:border-slate-700 p-4 bg-white/65 dark:bg-slate-800/35">
              <span className="gm-pricing-payment-icon"><Wallet size={21}/></span>
              <div><h3 className="font-bold text-sm">e-Mola</h3><p className="text-xs mt-1 text-slate-500 dark:text-slate-400">Pagamento por carteira móvel, quando disponível.</p></div>
            </div>
            <div className="gm-pricing-payment-method flex gap-3 items-start rounded-xl border border-slate-200/80 dark:border-slate-700 p-4 bg-white/65 dark:bg-slate-800/35">
              <span className="gm-pricing-payment-icon"><CreditCard size={21}/></span>
              <div><h3 className="font-bold text-sm">Cartão bancário</h3><p className="text-xs mt-1 text-slate-500 dark:text-slate-400">Cartões nacionais ou internacionais, se habilitados.</p></div>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-700 flex flex-wrap gap-3 justify-between items-center text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-2"><CalendarClock size={15} className="text-sky-600 dark:text-sky-300"/> O pagamento é único para o período escolhido, sem renovação automática.</span>
            <span className="inline-flex items-center gap-2"><LockKeyhole size={15} className="text-sky-600 dark:text-sky-300"/> O GeoMoz não armazena dados de cartões; a confirmação é feita no servidor.</span>
          </div>
        </section>

        {user && user.uid !== "guest_user" && (
          <section className="gm-dashboard-panel mt-6 rounded-2xl p-5 sm:p-6" aria-label="Pagamentos e renovações">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-extrabold text-lg">Pagamentos e renovações</h2><p className="text-xs mt-1 text-slate-500 dark:text-slate-400">Consulte os movimentos associados à sua conta GeoMoz.</p></div>
              <button type="button" onClick={loadHistory} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-sm font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-800">
                <BookOpen size={16}/> {showHistory ? "Ocultar histórico" : "Ver histórico"}
              </button>
            </div>
            {showHistory && <div className="mt-5 pt-5 border-t border-slate-200/80 dark:border-slate-700">
              {history.length ? <ul className="space-y-3">{history.map(item => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-sm">
                  <span className="font-semibold">GeoMoz {item.plan} · {item.period === "yearly" ? "Anual" : "Mensal"}</span>
                  <span>{formatMzn(item.amountMzn)}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{item.status === "paid" ? "Confirmado" : item.status === "pending" ? "Pendente" : item.status}</span>
                </li>))}</ul> : <p className="text-sm text-slate-500">Ainda não existem pagamentos registados.</p>}
              <p className="mt-4 text-xs text-slate-500">A subscrição não é renovada automaticamente. Poderá adquirir um novo período antes do vencimento.</p>
            </div>}
          </section>
        )}
      </main>

      {selected && activePlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex justify-center items-center p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section role="dialog" aria-modal="true" aria-label={requestOnly ? "Pedido de adesão GeoMoz" : "Pagamento seguro GeoMoz"} className="gm-pricing-checkout gm-dashboard-panel w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between gap-3 items-start">
              <div className="flex gap-3 items-start">
                <GeoMozBrandIcon className="h-10 w-10 rounded-xl shrink-0" alt="" width={40} height={40}/>
                <div>
                  <div className="text-xs uppercase font-bold tracking-wider text-sky-600 dark:text-sky-300">{requestOnly ? "Adesão e subscrições · GeoMoz" : "Pagamento seguro · GeoMoz"}</div>
                  <h2 className="text-xl font-extrabold mt-1">{activePlan.name}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{formatMzn((annual ? activePlan.yearlyMzn : activePlan.monthlyMzn) ?? 0)} · {annual ? "12 meses" : "1 mês"}</p>
                </div>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setSelected(null)} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19}/></button>
            </div>
            <label className="block text-sm font-semibold">Nome do titular
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} autoComplete="name" className="gm-pricing-input mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/75 px-3.5 py-3 text-sm outline-none focus:border-sky-500" placeholder="Nome e apelido" required />
            </label>
            {!requestOnly && <label className="block text-sm font-semibold">Região de pagamento
              <select value={region} onChange={e => setRegion(e.target.value as Region)} className="gm-pricing-input mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/75 px-3.5 py-3 text-sm outline-none focus:border-sky-500">
                <option value="mz">Moçambique — carteiras móveis e cartões</option>
                <option value="international">Internacional — cartões quando disponíveis</option>
              </select>
            </label>}
            {!requestOnly && (region === "mz" ? <label className="block text-sm font-semibold">Contacto moçambicano
              <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" autoComplete="tel" className="gm-pricing-input mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/75 px-3.5 py-3 text-sm outline-none focus:border-sky-500" placeholder="+258 84 000 0000" required />
            </label> : <p className="text-xs text-slate-500 dark:text-slate-400">Cartões internacionais dependem da disponibilidade para a sua região. Os métodos activos serão apresentados no próximo passo.</p>)}
            {selected === "academic" && !academicApproved && <p className="text-xs text-amber-700 dark:text-amber-300">A equipa verificará a elegibilidade académica antes de disponibilizar o pagamento.</p>}
            {requestOnly && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold" htmlFor="plan-request-message">Mensagem para a equipa GeoMoz{selected === "enterprise" ? " (obrigatória)" : " (opcional)"}</label>
                <textarea id="plan-request-message" maxLength={1000} rows={3}
                  className="gm-pricing-input w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/75 p-3 text-sm"
                  placeholder={selected === "academic" ? "Instituição de ensino e finalidade académica" : selected === "enterprise" ? "Descreva a organização e as necessidades do projecto" : "Descreva brevemente o seu interesse"}
                  value={requestMessage} onChange={event => setRequestMessage(event.target.value)} />
                <p className="text-xs text-slate-500 dark:text-slate-400">Este pedido não cria uma subscrição paga nem gera qualquer débito. A Administração poderá analisá-lo.</p>
              </div>
            )}
            <button type="button" disabled={working || (requestOnly ? (selected === "enterprise" && requestMessage.trim().length < 8) : (!checkoutEnabled || !customerName.trim() || (region === "mz" && !phone.trim())))} onClick={requestOnly ? submitPlanRequest : checkout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-extrabold shadow-md shadow-sky-500/15 disabled:opacity-45 disabled:cursor-not-allowed">
              {working ? (requestOnly ? "A registar pedido..." : "A preparar pagamento...") : (requestOnly ? "Submeter pedido de adesão" : "Continuar para pagamento seguro")} <ArrowRight size={17}/>
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{requestOnly ? "A escolha do plano não representa uma cobrança. Receberá confirmação quando houver uma decisão." : "O acesso só será activado após confirmação do pagamento. Não armazenamos os dados do seu cartão."}</p>
          </section>
        </div>
      )}
    </div>
  );
}
