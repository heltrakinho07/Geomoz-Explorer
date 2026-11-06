import React, { useCallback, useEffect, useState } from "react";
import { Link as WLink } from "wouter";
import {
  Activity, ArrowLeft, BarChart3, Check, ChevronLeft, ChevronRight,
  CreditCard, Database, ExternalLink, LockKeyhole, Moon, RefreshCw, Sun,
  Save, Search, Settings2, Shield, ShieldCheck, ShieldAlert, SlidersHorizontal,
  Users, X, Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGeoMozTheme } from "@/hooks/useGeoMozTheme";
import GeoMozBrandIcon from "@/components/GeoMozBrandIcon";
import "@/components/dashboard-glass.css";
import "./admin-geomoz.css";
import { apiFetch } from "@/lib/api";
import { ADMIN_MODULE_GROUPS } from "./adminModuleCatalog";
import { PLAN_ORDER, formatMzn, type PlanId } from "@/lib/plans";

type AdminRole = "superadmin" | "admin" | "support";
type Section = "overview" | "users" | "plans" | "requests" | "features" | "payments" | "audit";

interface Session {
  uid: string; email: string; role: AdminRole; canEdit: boolean; isSuperadmin: boolean;
}
interface AdminUser {
  uid: string; email: string; displayName: string; disabled: boolean;
  emailVerified: boolean; role: string; plan: PlanId;
  periodEnd?: string | null; academicApproved: boolean; billingStatus: string;
  createdAt?: number | null; lastSignInAt?: number | null;
}
interface PlanConfig {
  name: string; enabled: boolean; monthlyMzn: number | null; yearlyMzn: number | null;
  projects: number | null; storageBytes: number | null; credits: number | null;
  seats: number | null; concurrentJobs: number | null;
}
interface PlanApplication {
  uid: string; email: string; name: string; plan: PlanId;
  period: string; message: string; status: string;
  submittedAt: string; reviewedAt?: string | null;
}
interface Payment {
  id: string; uid: string; plan: string; period: string; amountMzn: number;
  currency: string; status: string; reference: string; createdAt: string; paidAt?: string;
}
interface AuditEntry {
  id: string; actorUid: string; actorRole: string; action: string; target: string;
  details?: Record<string, unknown>; at: string;
}
interface Overview {
  users: number; usersCountExact: boolean; recentPayments: number;
  recentSettledMzn: number; recentPaymentsByStatus: Record<string, number>;
  billingCheckoutEnabled: boolean; features: Record<string, boolean>;
}
type Catalog = Record<PlanId, PlanConfig>;

const initialNavigation: { id: Section; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "overview", label: "Visão geral", icon: BarChart3, hint: "Indicadores e operação" },
  { id: "users", label: "Utilizadores", icon: Users, hint: "Contas e permissões" },
  { id: "plans", label: "Planos", icon: CreditCard, hint: "Preços e quotas" },
  { id: "requests", label: "Pedidos de adesão", icon: ShieldCheck, hint: "Análises e candidaturas" },
  { id: "features", label: "Funcionalidades", icon: SlidersHorizontal, hint: "Módulos do GeoMoz" },
  { id: "payments", label: "Pagamentos", icon: Database, hint: "Transacções e subscrições" },
  { id: "audit", label: "Auditoria", icon: ShieldCheck, hint: "Acções administrativas" },
];
const FEATURE_NAMES: Record<string, string> = {
  gis_workspace: "GIS Workspace", geo_ai: "GeoMoz AI Agent",
  hydrology: "Hidrologia", terrain_3d: "Terrain Studio 3D",
  remote_sensing: "Detecção remota", seismic_catalogs: "Catálogos sísmicos",
};
const LIMIT_FIELDS: { key: keyof PlanConfig; label: string }[] = [
  { key: "projects", label: "Projectos cloud" },
  { key: "storageBytes", label: "Armazenamento (bytes)" },
  { key: "credits", label: "Créditos / mês" },
  { key: "seats", label: "Utilizadores" },
  { key: "concurrentJobs", label: "Processos simultâneos" },
];
const card = "gm-dashboard-panel gm-admin-panel rounded-2xl";
const input = "gm-admin-input w-full min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-950/75 px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15";
const btn = "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const primary = btn + " gm-admin-button-primary bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:from-sky-600 hover:to-indigo-700 shadow-sm shadow-sky-500/15";
const subtle = btn + " gm-admin-button-subtle border border-slate-200/90 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white/70 dark:bg-slate-800/60 hover:bg-sky-50 dark:hover:bg-slate-800";
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("pt-PT") : "—";
const fmtTime = (s?: string | null) => s ? new Date(s).toLocaleString("pt-PT") : "—";

async function jsonApi<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({})) as { detail?: string };
  if (!response.ok) throw new Error(typeof json.detail === "string" ? json.detail : "Operação não concluída (" + response.status + ").");
  return json as T;
}

function StatusTag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warn" | "danger" | "neutral" }) {
  const tones = {
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    danger: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold " + tones[tone]}>{children}</span>;
}

export default function AdminConsole() {
  const { user, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useGeoMozTheme();
  const [identity, setIdentity] = useState<Session | null>(null);
  const [authError, setAuthError] = useState("");
  const [section, setSection] = useState<Section>("overview");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [applications, setApplications] = useState<PlanApplication[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [drafts, setDrafts] = useState<Catalog | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [grantPlan, setGrantPlan] = useState<PlanId>("pro");
  const [grantThrough, setGrantThrough] = useState("");
  const [grantReason, setGrantReason] = useState("");

  const loadSection = useCallback(async (target: Section, token?: string, email?: string) => {
    setBusy(true);
    setNotice("");
    try {
      if (target === "overview") {
        const data = await jsonApi<Overview>("/geomoz-api/admin/overview");
        setOverview(data);
      } else if (target === "users") {
        const query = email ? "?email=" + encodeURIComponent(email) :
          "?limit=30" + (token ? "&page_token=" + encodeURIComponent(token) : "");
        const response = await jsonApi<{ users: AdminUser[]; nextPageToken?: string }>("/geomoz-api/admin/users" + query);
        setUsers(response.users);
        setNextPageToken(response.nextPageToken || null);
      } else if (target === "plans" || target === "features") {
        const response = await jsonApi<{ plans: Catalog; features: Record<string, boolean> }>("/geomoz-api/admin/plans");
        setCatalog(response.plans);
        setDrafts(JSON.parse(JSON.stringify(response.plans)) as Catalog);
        setFeatures(response.features);
      } else if (target === "payments") {
        const response = await jsonApi<{ payments: Payment[] }>("/geomoz-api/admin/payments?limit=80");
        setPayments(response.payments);
      } else if (target === "requests") {
        const response = await jsonApi<{ requests: PlanApplication[] }>("/geomoz-api/admin/plan-requests?limit=80");
        setApplications(response.requests);
      } else if (target === "audit") {
        const response = await jsonApi<{ events: AuditEntry[] }>("/geomoz-api/admin/audit?limit=80");
        setAudit(response.events);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível carregar a secção.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.uid === "guest_user") { setAuthError("É necessário iniciar sessão com uma conta administrativa."); return; }
    let active = true;
    jsonApi<Session>("/geomoz-api/admin/me")
      .then(result => { if (active) { setIdentity(result); setAuthError(""); } })
      .catch(err => { if (active) setAuthError(err instanceof Error ? err.message : "Acesso não autorizado."); });
    return () => { active = false; };
  }, [user?.uid, authLoading]);

  useEffect(() => {
    if (identity) void loadSection(section, undefined, section === "users" ? searchEmail.trim() || undefined : undefined);
  }, [identity?.uid, section, loadSection]);

  const act = async (callback: () => Promise<unknown>, success: string, refresh: Section = section) => {
    setBusy(true);
    setNotice("");
    try {
      await callback();
      setNotice(success);
      await loadSection(refresh, undefined, refresh === "users" ? searchEmail.trim() || undefined : undefined);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  };
  const go = (destination: Section) => { setSection(destination); setNotice(""); setSelectedUser(null); };
  const guard = (question: string) => window.confirm(question);
  const canWrite = identity?.canEdit === true;
  const isRoot = identity?.isSuperadmin === true;


  if (authLoading || (!identity && !authError)) return (
    <div data-geomoz-system="admin" className="gm-dashboard gm-admin min-h-screen grid place-items-center">
      <div className="gm-dashboard-panel flex items-center gap-3 rounded-2xl p-6 text-slate-700 dark:text-slate-200">
        <RefreshCw size={22} className="animate-spin text-sky-500" />
        A verificar permissões de administração...
      </div>
    </div>
  );
  if (!identity) return (
    <div data-geomoz-system="admin" className="gm-dashboard gm-admin min-h-screen grid place-items-center p-5">
      <div className="gm-dashboard-panel max-w-md w-full rounded-3xl p-8 text-center">
        <GeoMozBrandIcon className="mx-auto mb-5 h-14 w-14 rounded-2xl" width={56} height={56} />
        <LockKeyhole size={28} className="mx-auto mb-3 text-amber-500" />
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">Acesso administrativo restrito</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{authError}</p>
        <WLink href="/dashboard" className={subtle}>Regressar ao GeoMoz Explorer</WLink>
      </div>
    </div>
  );

  const currentMenu = initialNavigation.find(item => item.id === section);
  const MenuIcon = currentMenu?.icon ?? BarChart3;
  return (
    <div data-geomoz-system="admin" className="gm-dashboard gm-admin min-h-screen">
      <div className="gm-dashboard-content relative lg:flex min-h-screen">
        <aside className="gm-admin-sidebar gm-sidebar lg:sticky lg:top-0 lg:h-screen lg:w-[276px] lg:flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200/90 dark:border-slate-800 bg-white/85 dark:bg-slate-950/95 text-slate-800 dark:text-slate-100">
          <div className="gm-admin-sidebar__brand flex items-center justify-between gap-3 px-4 py-4 border-b border-slate-200/80 dark:border-slate-800">
            <WLink href="/dashboard" className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity" title="Regressar ao GeoMoz Explorer">
              <GeoMozBrandIcon className="h-10 w-10 rounded-xl shadow-md shadow-sky-500/20" width={40} height={40} alt="GeoMoz Explorer" />
              <span className="min-w-0 flex flex-col">
                <span className="font-black text-slate-900 dark:text-white tracking-tight text-base whitespace-nowrap">GeoMoz <span className="text-sky-600 dark:text-sky-400">Explorer</span></span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Centro de Administração</span>
              </span>
            </WLink>
            <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo escuro"}
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              className="gm-admin-theme-toggle flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
          <div className="gm-admin-sidebar__identity mx-3 mt-4 rounded-2xl border border-sky-100 dark:border-sky-900/35 bg-sky-50/80 dark:bg-sky-950/30 p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-300"><ShieldCheck size={17}/></div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Sessão administrativa</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={identity.email}>{identity.email}</div>
              </div>
            </div>
            <span className="mt-2.5 inline-flex rounded-full border border-sky-200 dark:border-sky-700 bg-white/85 dark:bg-slate-900/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">{identity.role}</span>
          </div>
          <div className="px-5 mt-5 mb-2 hidden lg:block">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Gestão da plataforma</p>
          </div>
          <nav aria-label="Secções administrativas" className="gm-admin-nav flex lg:flex-col lg:flex-1 min-w-0 gap-1.5 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto px-3 py-3 lg:py-1.5">
            {initialNavigation.map(item => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" onClick={() => go(item.id)}
                  aria-current={section === item.id ? "page" : undefined}
                  className={"gm-admin-nav__item min-w-max lg:min-w-0 w-auto lg:w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition-all " +
                    (section === item.id
                      ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/90 dark:hover:bg-slate-900")}>
                  <Icon size={18} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate">{item.label}</div>
                    <div className={"hidden lg:block text-[11px] font-medium mt-0.5 " + (section === item.id ? "text-white/80" : "text-slate-400 dark:text-slate-500")}>{item.hint}</div>
                  </div>
                </button>
              );
            })}
          </nav>
          <div className="gm-admin-sidebar__footer hidden lg:block p-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/60">
            <WLink href="/dashboard" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-300">
              <ArrowLeft size={16}/> Voltar ao GeoMoz Explorer
            </WLink>
          </div>
        </aside>

        <main className="gm-admin-content flex-1 min-w-0 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 lg:py-8">
          <section className="gm-dashboard-hero gm-admin-hero p-5 sm:p-7 mb-6 text-white" aria-label="Centro de Administração GeoMoz">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0 max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/20 px-3 py-1 text-xs font-bold text-sky-200"><ShieldCheck size={14}/> Gestão centralizada da plataforma</span>
                <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Centro de <span className="text-sky-300">Administração</span></h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">Utilizadores, subscrições, módulos e operações do GeoMoz Explorer num único ambiente.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" className="gm-dashboard-hero__action inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm font-semibold" onClick={() => void loadSection(section)} disabled={busy}><RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Actualizar</button>
                <WLink href="/dashboard" className="gm-dashboard-hero__action inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm font-semibold"><ExternalLink size={15}/> Abrir Workspace</WLink>
              </div>
            </div>
          </section>
          <div className="gm-admin-section-heading mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-200/75 dark:border-sky-900/55 bg-sky-50/80 dark:bg-sky-950/35 text-sky-600 dark:text-sky-300"><MenuIcon size={20}/></span>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{currentMenu?.label}</h2>
              <p className="text-xs sm:text-sm mt-0.5 text-slate-500 dark:text-slate-400">{currentMenu?.hint}</p>
            </div>
          </div>
          {notice && <div role="status" className="mb-6 p-4 rounded-xl border border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-100 text-sm flex justify-between gap-3">
            {notice}<button onClick={() => setNotice("")} aria-label="Fechar notificação"><X size={16}/></button>
          </div>}

          {section === "overview" && (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { icon: Users, title: "Contas Firebase", value: overview ? (overview.usersCountExact ? "" : "≥ ") + overview.users.toLocaleString("pt-PT") : "—", note: "Utilizadores registados" },
                  { icon: CreditCard, title: "Pagamentos recentes", value: overview?.recentPayments ?? "—", note: "Últimas 100 transacções" },
                  { icon: Activity, title: "Pagamentos liquidados", value: overview ? formatMzn(overview.recentSettledMzn) : "—", note: "Somente últimas 100 transacções" },
                  { icon: Zap, title: "Pagamentos GeoMoz", value: overview?.billingCheckoutEnabled ? "Activo" : "Em validação", note: "Controlo seguro no Cloud Run" },
                ].map((kpi, i) => {
                  const Icon = kpi.icon;
                  return <div key={i} className={card + " gm-admin-kpi p-5"} data-kpi={i}>
                    <div className="gm-admin-kpi__icon w-11 h-11 rounded-xl bg-sky-50 dark:bg-sky-900/25 grid place-items-center mb-4"><Icon size={20} className="text-sky-600 dark:text-sky-300" /></div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{kpi.title}</div>
                    <div className="font-extrabold tracking-tight text-2xl mt-2 tabular-nums">{kpi.value}</div>
                    <p className="text-xs text-slate-500 mt-2">{kpi.note}</p>
                  </div>;
                })}
              </div>
              <div className="grid lg:grid-cols-2 gap-5">
                <section className={card + " p-6"}>
                  <h2 className="font-bold text-lg mb-5">Estado operacional</h2>
                  {[
                    ["API e autenticação", "Firebase Admin"],
                    ["Cobrança", overview?.billingCheckoutEnabled ? "Disponível" : "Desactivada por segurança"],
                    ["Gateway", "Sem renovação automática"],
                    ["Controlo comercial", "Custom Claims + Firestore"],
                  ].map(([name, status]) => <div key={name} className="flex justify-between gap-3 border-b last:border-0 border-slate-100 dark:border-slate-800 py-3 text-sm"><span className="text-slate-500">{name}</span><span className="font-semibold text-right">{status}</span></div>)}
                </section>
                <section className={card + " p-6"}>
                  <h2 className="font-bold text-lg mb-5">Últimas transacções</h2>
                  {Object.entries(overview?.recentPaymentsByStatus || {}).map(([status, count]) => <div key={status} className="flex justify-between border-b last:border-0 border-slate-100 dark:border-slate-800 py-3 text-sm"><span>{status}</span><b>{count}</b></div>)}
                  {!Object.keys(overview?.recentPaymentsByStatus || {}).length && <p className="text-sm text-slate-500">Sem registos de pagamento recentes.</p>}
                  <button className={subtle + " mt-5"} onClick={() => go("payments")}>Ver pagamentos <ChevronRight size={16}/></button>
                </section>
              </div>
            </div>
          )}

          {section === "users" && <div className="space-y-5">
            <div className={card + " p-4 sm:p-5 flex flex-wrap items-end gap-3"}>
              <div className="flex-1 min-w-[230px]">
                <label htmlFor="admin-user-search" className="block text-xs font-bold text-slate-500 mb-2">Procurar por e-mail exacto</label>
                <div className="relative"><Search size={17} className="absolute top-3 left-3 text-slate-400"/>
                  <input id="admin-user-search" className={input + " pl-10"} value={searchEmail} type="email" placeholder="utilizador@dominio.com" onChange={e => setSearchEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void loadSection("users", undefined, searchEmail.trim() || undefined); }} />
                </div>
              </div>
              <button className={primary} disabled={busy} onClick={() => void loadSection("users", undefined, searchEmail.trim() || undefined)}>Pesquisar</button>
              <button className={subtle} onClick={() => {setSearchEmail(""); void loadSection("users");}}>Limpar</button>
            </div>
            <section className={card + " gm-admin-table-wrap overflow-hidden"}>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50/90 dark:bg-slate-800/65">
                  <tr><th className="px-5 py-4">Conta</th><th className="px-4 py-4">Perfil</th><th className="px-4 py-4">Plano</th><th className="px-4 py-4">Estado</th><th className="px-4 py-4 text-right">Acções</th></tr>
                </thead>
                <tbody>{users.map(account => <tr key={account.uid} className="border-t border-slate-100 dark:border-slate-800 hover:bg-sky-50/40 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-4 min-w-[210px]"><div className="font-bold">{account.displayName || "Sem nome"}</div><div className="text-xs text-slate-500 break-all">{account.email || account.uid}</div></td>
                  <td className="px-4 py-4"><StatusTag tone={account.role === "superadmin" ? "warn" : "neutral"}>{account.role}</StatusTag></td>
                  <td className="px-4 py-4"><div className="font-semibold capitalize">{account.plan}</div><div className="text-[11px] text-slate-500">{fmtDate(account.periodEnd)}</div></td>
                  <td className="px-4 py-4"><StatusTag tone={account.disabled ? "danger" : "good"}>{account.disabled ? "Bloqueado" : "Activo"}</StatusTag>{account.academicApproved && <div className="text-[11px] text-emerald-600 mt-1">Academic aprovado</div>}</td>
                  <td className="px-4 py-4 text-right">
                    <button className={subtle + " !px-3 !py-2"} onClick={() => { setSelectedUser(account); setGrantPlan(account.plan); setGrantThrough(account.periodEnd?.slice(0,10) || ""); setGrantReason(""); }}><Settings2 size={15}/> Gerir</button>
                  </td>
                </tr>)}</tbody>
              </table></div>
              {!users.length && <p className="p-6 text-sm text-slate-500">Nenhuma conta encontrada nesta consulta.</p>}
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500">{users.length} conta(s) nesta página</span>
                <div className="flex gap-2"><button className={subtle + " !py-2"} onClick={() => void loadSection("users")}><ChevronLeft size={14}/> Início</button>
                  <button className={subtle + " !py-2"} disabled={!nextPageToken || busy || Boolean(searchEmail)} onClick={() => void loadSection("users", nextPageToken || undefined)}>Seguinte <ChevronRight size={14}/></button></div>
              </div>
            </section>
          </div>}

          {section === "plans" && <div className="grid lg:grid-cols-2 2xl:grid-cols-3 gap-5">
            {PLAN_ORDER.map(code => {
              const plan = drafts?.[code] || catalog?.[code];
              if (!plan) return null;
              const original = catalog?.[code];
              return <section className={card + " p-5 space-y-4"} key={code}>
                <div className="flex items-center justify-between gap-2">
                  <div><h2 className="font-extrabold text-lg">{plan.name}</h2><p className="text-xs text-slate-500">Plano {code}</p></div>
                  <StatusTag tone={plan.enabled ? "good" : "warn"}>{plan.enabled ? "Disponível" : "Suspenso"}</StatusTag>
                </div>
                <label className="flex justify-between items-center gap-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <span className="font-semibold">Disponível para novas adesões</span>
                  <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={plan.enabled} disabled={!isRoot || code === "community"} onChange={e => setDrafts(prev => prev ? { ...prev, [code]: { ...prev[code], enabled: e.target.checked } } : prev)} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[{key:"monthlyMzn",label:"Mensal (MZN)"},{key:"yearlyMzn",label:"Anual (MZN)"}].map(field => <label className="block text-xs font-semibold text-slate-500" key={field.key}>{field.label}
                    <input type="number" min="1" step="1" className={input + " mt-1.5"} value={plan[field.key as "monthlyMzn" | "yearlyMzn"] ?? ""} disabled={!isRoot || code === "community" || code === "enterprise"}
                      onChange={e => setDrafts(prev => prev ? { ...prev, [code]: { ...prev[code], [field.key]: e.target.value === "" ? null : Number(e.target.value) } } : prev)} />
                  </label>)}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {LIMIT_FIELDS.map(field => <label className="block text-xs font-semibold text-slate-500" key={field.key}>{field.label}
                    <input type="number" min="0" step="1" className={input + " mt-1.5"} value={(plan[field.key] as number | null) ?? ""} disabled={!isRoot || code === "community"}
                      onChange={e => setDrafts(prev => prev ? { ...prev, [code]: { ...prev[code], [field.key]: e.target.value === "" ? null : Number(e.target.value) } } : prev)} />
                  </label>)}
                </div>
                <button className={primary + " w-full"} disabled={!isRoot || busy || code === "community" || JSON.stringify(plan) === JSON.stringify(original)}
                  onClick={() => void act(() => jsonApi("/geomoz-api/admin/plans/" + code, "PATCH", Object.fromEntries(
                    (["enabled","monthlyMzn","yearlyMzn","projects","storageBytes","credits","seats","concurrentJobs"] as (keyof PlanConfig)[])
                      .filter(key => plan[key] !== original?.[key]).map(key => [key, plan[key]])
                  )), "Alterações do plano guardadas.", "plans")}>
                  <Save size={16}/> Guardar alterações
                </button>
              </section>;
            })}
            <p className="text-xs text-slate-500 lg:col-span-2 2xl:col-span-3">Alterações de preços aplicam-se apenas a novas sessões de checkout. Planos já pagos mantêm o período contratado. Quotas de armazenamento, processos simultâneos e equipas continuam dependentes dos respectivos serviços de execução.</p>
          </div>}

          {section === "features" && <div className="space-y-6">
            <section aria-labelledby="admin-module-controls" className="space-y-4">
              <div>
                <h3 id="admin-module-controls" className="font-extrabold text-lg">Controlos globais</h3>
                <p className="text-xs text-slate-500 mt-1">Apenas os módulos com integração administrativa existente podem ser activados ou desactivados aqui.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {Object.entries(FEATURE_NAMES).map(([key,label]) => <section className={card + " p-5 flex items-center justify-between gap-4"} key={key}>
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-900/25 text-sky-600 dark:text-sky-300"><Zap size={18}/></div>
                    <div><h4 className="font-bold text-sm">{label}</h4><p className="text-xs text-slate-500 mt-1">{features[key] === false ? "Desactivado" : "Activado"} · Controlo global</p></div>
                  </div>
                  <button role="switch" aria-label={"Alternar " + label} aria-checked={features[key] !== false} disabled={!isRoot || busy}
                    onClick={() => { const state = features[key] !== false; if (guard((state ? "Desactivar" : "Activar") + " " + label + " para os utilizadores?")) void act(() => jsonApi("/geomoz-api/admin/features", "PATCH", { changes: { [key]: !state } }), "Estado do módulo actualizado.", "features"); }}
                    className={"relative shrink-0 w-12 h-7 rounded-full p-1 transition-colors " + (features[key] !== false ? "bg-sky-600" : "bg-slate-300 dark:bg-slate-700")}>
                    <span className={"block rounded-full bg-white h-5 w-5 shadow-sm transition-transform " + (features[key] !== false ? "translate-x-5" : "")} />
                  </button>
                </section>)}
              </div>
            </section>
            <section aria-labelledby="admin-module-inventory" className="space-y-4">
              <div>
                <h3 id="admin-module-inventory" className="font-extrabold text-lg">Inventário de módulos e ferramentas</h3>
                <p className="text-xs text-slate-500 mt-1">Catálogo das áreas disponíveis na plataforma. «Associado» identifica o controlo global; «Sem controlo independente» indica que ainda não existe um bloqueio administrativo próprio.</p>
              </div>
              {ADMIN_MODULE_GROUPS.map(group => (
                <section key={group.title} className={card + " p-5"}>
                  <h4 className="font-bold mb-3">{group.title}</h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    {group.entries.map(entry => (
                      <div key={entry.title} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{entry.title}</div>
                          <p className="text-xs text-slate-500 mt-1">{entry.description}</p>
                          <p className="text-[11px] text-slate-500 mt-2">
                            {entry.controlledBy
                              ? "Associado a " + FEATURE_NAMES[entry.controlledBy] + " · " + (features[entry.controlledBy] === false ? "desactivado" : "activo")
                              : "Sem controlo independente"}
                          </p>
                        </div>
                        <WLink href={entry.route} title={"Abrir " + entry.title} className="text-sky-600 dark:text-sky-400 shrink-0 rounded-lg p-1 hover:bg-sky-50 dark:hover:bg-slate-800" aria-label={"Abrir " + entry.title}>
                          <ExternalLink size={16}/>
                        </WLink>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </section>
            <p className="text-xs text-slate-500">A listagem não constitui garantia de bloqueio técnico. Os bloqueios existentes aplicam-se apenas às rotas e aos endpoints efectivamente protegidos; serviços externos e o GIS Workspace autónomo necessitam de protecção adicional.</p>
          </div>}

          {section === "requests" && <section className={card + " gm-admin-table-wrap overflow-hidden"}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Pedidos de adesão</h3>
                <p className="mt-1 text-xs text-slate-500">Pedidos de planos e validação Academic. A análise não activa pagamentos ou subscrições.</p>
              </div>
              <StatusTag tone="neutral">{applications.filter(item => item.status === "pending").length} pendentes</StatusTag>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[830px] text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr><th className="px-5 py-4">Utilizador</th><th className="px-4 py-4">Plano</th><th className="px-4 py-4">Pedido</th><th className="px-4 py-4">Estado</th><th className="px-4 py-4">Acção</th></tr>
                </thead>
                <tbody>{applications.map(request => (
                  <tr key={request.uid} className="border-t border-slate-100 dark:border-slate-800 align-top">
                    <td className="px-5 py-4">
                      <div className="font-bold">{request.name || "Utilizador"}</div>
                      <div className="text-xs text-slate-500 break-all">{request.email}</div>
                      <div className="mt-1 text-[11px] text-slate-400">{fmtTime(request.submittedAt)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold capitalize">{request.plan}</div>
                      <div className="text-xs text-slate-500">{request.period === "yearly" ? "Anual" : "Mensal"}</div>
                    </td>
                    <td className="px-4 py-4 max-w-[320px] whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">{request.message || "Sem observações"}</td>
                    <td className="px-4 py-4"><StatusTag tone={request.status === "pending" ? "warn" : request.status === "completed" ? "good" : "neutral"}>{request.status === "pending" ? "Pendente" : request.status === "in_review" ? "Em análise" : request.status === "completed" ? "Concluído" : "Encerrado"}</StatusTag></td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" className={subtle + " !px-2.5 !py-1.5 !text-xs"} onClick={() => { setSearchEmail(request.email); go("users"); }}>Ver conta</button>
                        {canWrite && request.status !== "in_review" && request.status === "pending" && <button type="button" className={primary + " !px-2.5 !py-1.5 !text-xs"} disabled={busy} onClick={() => void act(() => jsonApi("/geomoz-api/admin/plan-requests/" + encodeURIComponent(request.uid), "PATCH", { status: "in_review" }), "Pedido marcado para análise.", "requests")}>Analisar</button>}
                        {canWrite && request.status === "in_review" && <button type="button" className={primary + " !px-2.5 !py-1.5 !text-xs"} disabled={busy} onClick={() => {
                          if (guard("Concluir a análise? Esta acção não concede acesso ao plano.")) void act(() => jsonApi("/geomoz-api/admin/plan-requests/" + encodeURIComponent(request.uid), "PATCH", { status: "completed" }), "Pedido analisado. O acesso deverá ser atribuído separadamente, quando aplicável.", "requests");
                        }}>Concluir</button>}
                        {canWrite && (request.status === "pending" || request.status === "in_review") && <button type="button" className={subtle + " !px-2.5 !py-1.5 !text-xs"} disabled={busy} onClick={() => {
                          if (guard("Encerrar este pedido sem atribuir subscrição?")) void act(() => jsonApi("/geomoz-api/admin/plan-requests/" + encodeURIComponent(request.uid), "PATCH", { status: "declined" }), "Pedido encerrado.", "requests");
                        }}>Encerrar</button>}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {!applications.length && <p className="px-5 py-6 text-sm text-slate-500">Ainda não existem pedidos de adesão registados.</p>}
            <p className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 text-xs text-slate-500">A aprovação académica e a atribuição administrativa de planos são feitas em Utilizadores → Gerir. Nenhum pedido cria um pagamento automaticamente.</p>
          </section>}

          {section === "payments" && <section className={card + " overflow-hidden"}>
            <div className="overflow-x-auto"><table className="min-w-[730px] w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-4">Referência</th><th className="px-4 py-4">Utilizador</th><th className="px-4 py-4">Plano</th><th className="px-4 py-4">Montante</th><th className="px-4 py-4">Estado</th><th className="px-4 py-4">Data</th></tr>
              </thead>
              <tbody>{payments.map(payment => <tr key={payment.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-5 py-3.5 font-mono text-xs">{payment.reference}</td><td className="px-4 py-3.5 text-xs break-all">{payment.uid}</td>
                <td className="px-4 py-3.5 capitalize">{payment.plan}<div className="text-xs text-slate-500">{payment.period}</div></td>
                <td className="px-4 py-3.5 font-bold">{formatMzn(payment.amountMzn)}</td>
                <td className="px-4 py-3.5"><StatusTag tone={payment.status === "paid" ? "good" : payment.status === "pending" ? "warn" : "danger"}>{payment.status}</StatusTag></td>
                <td className="px-4 py-3.5 text-xs text-slate-500">{fmtTime(payment.createdAt)}</td>
              </tr>)}</tbody>
            </table></div>
            {!payments.length && <p className="p-6 text-sm text-slate-500">Não existem transacções registadas.</p>}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">Últimas 80 transacções registadas. O painel não altera estados financeiros confirmados pelo gateway.</div>
          </section>}

          {section === "audit" && <section className={card + " overflow-hidden"}>
            <div className="overflow-x-auto"><table className="min-w-[660px] w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-4">Acção</th><th className="px-4 py-4">Operador</th><th className="px-4 py-4">Alvo</th><th className="px-4 py-4">Data</th></tr>
              </thead>
              <tbody>{audit.map(event => <tr key={event.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-5 py-4"><StatusTag>{event.action}</StatusTag></td>
                <td className="px-4 py-4"><div className="font-semibold capitalize">{event.actorRole}</div><div className="text-[11px] text-slate-500 break-all">{event.actorUid}</div></td>
                <td className="px-4 py-4 text-xs break-all">{event.target}</td>
                <td className="px-4 py-4 text-xs text-slate-500">{fmtTime(event.at)}</td>
              </tr>)}</tbody>
            </table></div>
            {!audit.length && <p className="p-6 text-sm text-slate-500">Ainda não existem registos de operações administrativas.</p>}
          </section>}
        </main>
      </div>

      {selectedUser && <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedUser(null); }} className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm z-50 p-4 flex justify-center items-center">
        <section role="dialog" aria-modal="true" aria-label="Gerir utilizador" className="gm-admin-modal gm-dashboard-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8">
          <div className="flex justify-between gap-2 mb-5">
            <div><div className="text-xs text-sky-600 dark:text-sky-300 font-extrabold uppercase tracking-widest">Gestão da conta</div><h2 className="text-xl font-bold mt-1">{selectedUser.displayName || selectedUser.email}</h2><p className="text-xs break-all text-slate-500 mt-1">{selectedUser.email} · {selectedUser.uid}</p></div>
            <button aria-label="Fechar" onClick={() => setSelectedUser(null)}><X size={20}/></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <h3 className="font-bold text-sm">Estado e elegibilidade</h3>
              <div className="flex gap-2 flex-wrap"><StatusTag tone={selectedUser.disabled ? "danger" : "good"}>{selectedUser.disabled ? "Bloqueado" : "Activo"}</StatusTag><StatusTag>{selectedUser.role}</StatusTag></div>
              <button className={subtle + " w-full"} disabled={!canWrite || busy || selectedUser.role === "superadmin"}
                onClick={() => { const next = !selectedUser.academicApproved; if (guard((next ? "Aprovar" : "Revogar") + " a elegibilidade Academic?")) void act(() => jsonApi("/geomoz-api/admin/users/" + encodeURIComponent(selectedUser.uid) + "/academic", "PATCH", { approved: next }), "Elegibilidade académica actualizada.", "users").then(() => setSelectedUser(null)); }}>
                <Check size={15}/>{selectedUser.academicApproved ? "Revogar Academic" : "Aprovar Academic"}
              </button>
              <button className={subtle + " w-full"} disabled={!isRoot || busy || selectedUser.uid === identity.uid || selectedUser.role === "superadmin"}
                onClick={() => { const next = !selectedUser.disabled; if (guard((next ? "Bloquear" : "Reactivar") + " esta conta?")) void act(() => jsonApi("/geomoz-api/admin/users/" + encodeURIComponent(selectedUser.uid) + "/status", "PATCH", { disabled: next }), "Estado da conta actualizado.", "users").then(() => setSelectedUser(null)); }}>
                {selectedUser.disabled ? <ShieldCheck size={15}/> : <ShieldAlert size={15}/>}
                {selectedUser.disabled ? "Reactivar conta" : "Bloquear conta"}
              </button>
              <label className="block text-xs font-semibold">Perfil administrativo
                <select className={input + " mt-2"} disabled={!isRoot || busy || selectedUser.role === "superadmin" || selectedUser.uid === identity.uid} value={selectedUser.role === "superadmin" ? "superadmin" : selectedUser.role}
                  onChange={e => { const role = e.target.value; if (guard("Alterar o perfil para " + role + "? O utilizador terá de iniciar sessão novamente.")) void act(() => jsonApi("/geomoz-api/admin/users/" + encodeURIComponent(selectedUser.uid) + "/role", "PATCH", {role}), "Perfil actualizado.", "users").then(() => setSelectedUser(null)); }}>
                  {selectedUser.role === "superadmin" && <option value="superadmin">Superadmin (externo)</option>}
                  <option value="user">Utilizador</option><option value="support">Suporte (leitura)</option><option value="admin">Administrador</option>
                </select>
              </label>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <h3 className="font-bold text-sm">Acesso manual ao plano</h3>
              <label className="block text-xs font-semibold">Plano
                <select className={input + " mt-2"} value={grantPlan} disabled={!isRoot} onChange={e => setGrantPlan(e.target.value as PlanId)}>
                  {PLAN_ORDER.map(plan => <option key={plan} value={plan}>{plan}</option>)}
                </select>
              </label>
              {grantPlan !== "community" && <label className="block text-xs font-semibold">Data final da subscrição
                <input className={input + " mt-2"} type="date" value={grantThrough} onChange={e => setGrantThrough(e.target.value)} disabled={!isRoot} />
              </label>}
              <label className="block text-xs font-semibold">Justificação administrativa
                <textarea className={input + " mt-2 min-h-20"} maxLength={300} value={grantReason} onChange={e => setGrantReason(e.target.value)} placeholder="Motivo da concessão, contrato ou correcção" disabled={!isRoot}/>
              </label>
              <button className={primary + " w-full"} disabled={!isRoot || busy || selectedUser.role === "superadmin" || grantReason.trim().length < 5 || (grantPlan !== "community" && !grantThrough)}
                onClick={() => { if (guard("Atribuir manualmente o plano " + grantPlan + " à conta seleccionada? Esta acção fica auditada.")) void act(() => jsonApi("/geomoz-api/admin/users/" + encodeURIComponent(selectedUser.uid) + "/plan", "PATCH", { plan:grantPlan, through: grantPlan === "community" ? null : grantThrough, reason: grantReason.trim() }), "Plano atribuído.", "users").then(() => setSelectedUser(null)); }}>
                <Save size={15}/> Atribuir plano
              </button>
              <p className="text-[11px] text-slate-500">As concessões manuais não geram um pagamento externo nem um recibo.</p>
            </div>
          </div>
        </section>
      </div>}
    </div>
  );
}
