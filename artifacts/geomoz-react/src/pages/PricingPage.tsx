import React, {useState} from "react";
import {useLocation} from "wouter";
import {Check, ArrowLeft, CreditCard, ShieldCheck, Layers3, GraduationCap, Building2} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {useSubscription} from "@/hooks/useSubscription";
import {PLANS, PLAN_ORDER, formatMzn, type PlanId} from "@/lib/plans";
import {apiFetch} from "@/lib/api";

const features: Record<PlanId,string[]> = {
  community:["GIS Workspace e ferramentas SIG locais","3 projectos e 500 MB","20 créditos mensais de teste"],
  academic:["Análises científicas e GEE próprio","15 projectos e 5 GB","150 créditos mensais"],
  pro:["Processamento e exportação avançados","75 projectos e 30 GB","800 créditos mensais"],
  teams:["Até cinco utilizadores","200 projectos e 150 GB","3.000 créditos mensais"],
  enterprise:["Integrações, APIs e SLA","Capacidades personalizadas","Licenciamento institucional"]
};
export default function PricingPage(){
  const [, navigate]=useLocation();
  const {user,getIdToken}=useAuth();
  const billing=useSubscription();
  const [annual,setAnnual]=useState(false);
  const [working,setWorking]=useState<PlanId|null>(null);
  const [notice,setNotice]=useState("");
  async function manageSubscription(){
    setNotice("");
    try{
      if(!user || user.uid==="guest_user")throw new Error("Inicie sessão para gerir a subscrição.");
      const token=await getIdToken();
      if(!token)throw new Error("Sessão não autenticada.");
      const response=await apiFetch("/geomoz-api/billing/portal",{method:"POST",headers:{"Authorization":`Bearer ${token}`}});
      const result=await response.json();
      if(!response.ok)throw new Error(result.detail||"Não foi possível abrir o portal.");
      if(typeof result.url!=="string" || !result.url.startsWith("https://"))throw new Error("URL inválido.");
      window.location.assign(result.url);
    }catch(e:any){setNotice(e.message||"Erro ao abrir o portal.");}
  }
  async function checkout(plan:PlanId){
    setNotice("");
    if(!user || user.uid==="guest_user"){navigate("/login");return;}
    if(plan==="enterprise"){setNotice("Contacte a equipa GEOLÍTHICA para uma proposta institucional.");return;}
    if(plan==="academic"){setNotice("O plano Academic requer verificação académica; contacte o suporte para validação antes de efectuar o pagamento.");return;}
    if(plan==="community"){navigate("/dashboard");return;}
    setWorking(plan);
    try{
      const token=await getIdToken();
      if(!token) throw new Error("É necessário iniciar sessão.");
      const response=await apiFetch("/geomoz-api/billing/checkout",{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body:JSON.stringify({plan,period:annual?"yearly":"monthly"})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(typeof result.detail==="string"?result.detail:"Não foi possível iniciar o pagamento.");
      if(typeof result.url!=="string" || !result.url.startsWith("https://"))throw new Error("URL de pagamento inválido.");
      window.location.assign(result.url);
    }catch(e:any){setNotice(e.message||"Não foi possível iniciar o pagamento.");}
    finally{setWorking(null);}
  }
  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
        <button onClick={()=>navigate(user?"/dashboard":"/")} className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={17}/> <Layers3 className="text-sky-600" size={20}/> GeoMoz Explorer</button>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Planos e subscrição</span>
      </div>
    </header>
    <main className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-9"><div className="inline-flex items-center gap-2 text-sky-700 dark:text-sky-300 text-xs font-semibold uppercase tracking-widest"><ShieldCheck size={16}/> Acesso transparente</div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mt-3">SIG profissional, à sua escala.</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-2xl mx-auto">Explore gratuitamente. Evolua para projectos científicos, processamento em cloud e colaboração profissional.</p>
      </div>
      <div className="flex items-center justify-center gap-3 mb-8">
        <span className={!annual?"font-bold text-sm":"text-sm text-slate-500"}>Mensal</span>
        <button role="switch" aria-checked={annual} aria-label="Alternar periodicidade" onClick={()=>setAnnual(!annual)} className={`rounded-full w-12 h-7 p-1 transition-colors ${annual?"bg-sky-600":"bg-slate-300 dark:bg-slate-700"}`}><span className={`block bg-white rounded-full w-5 h-5 transition-transform ${annual?"translate-x-5":""}`}/></button>
        <span className={annual?"font-bold text-sm":"text-sm text-slate-500"}>Anual <span className="text-emerald-600 text-xs">2 meses grátis</span></span>
      </div>
      {notice&&<div role="alert" className="max-w-2xl mx-auto mb-6 border border-amber-300 bg-amber-50 text-amber-950 rounded-xl p-4 text-sm">{notice}</div>}
      {!billing.loading && billing.plan!=="community" && <div className="mb-6 text-center"><button onClick={manageSubscription} className="text-sm font-semibold underline underline-offset-4 text-sky-600">Gerir pagamento, facturas e cancelamento</button></div>}
      {billing.error&&<p className="text-center text-amber-700 text-sm mb-4">Não foi possível confirmar o plano actual. É apresentado o acesso Community por segurança.</p>}
      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">
        {PLAN_ORDER.map(id=>{const p=PLANS[id], current=billing.plan===id;return <section key={id} className={`rounded-2xl border flex flex-col p-5 shadow-sm ${id==="pro"?"border-sky-500 ring-2 ring-sky-200 dark:ring-sky-800 bg-white dark:bg-slate-900":"border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`}>
          <div className="flex items-center gap-2 mb-4 text-sky-600">{id==="academic"?<GraduationCap size={20}/>:id==="enterprise"?<Building2 size={20}/>:<Layers3 size={20}/>}<h2 className="font-bold">{p.name}</h2></div>
          <p className="text-xs text-slate-500 dark:text-slate-400 min-h-10">{p.audience}</p>
          <div className="mt-4 min-h-16"><div className="text-2xl font-bold tracking-tight">{id==="enterprise"?"Sob consulta":formatMzn(annual?(p.yearlyMzn??0):(p.monthlyMzn??0))}</div><div className="text-xs text-slate-500">{id==="enterprise"?"Contrato institucional":annual?"/ano":"/mês"}</div></div>
          <ul className="space-y-3 mt-6 mb-8 flex-1">{features[id].map(x=><li key={x} className="flex gap-2 text-sm"><Check size={16} className="text-emerald-600 shrink-0 mt-0.5"/>{x}</li>)}</ul>
          <button disabled={working!==null || current || billing.loading} onClick={()=>checkout(id)} className="w-full rounded-xl bg-sky-600 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold py-3 text-sm hover:bg-sky-700 transition-colors">{current?"Plano actual":working===id?"A preparar…":id==="enterprise"?"Solicitar proposta":id==="community"?"Começar gratuitamente":"Escolher plano"}</button>
        </section>})}
      </div>
      <p className="mt-8 text-center text-sm text-slate-500">O Earth Engine associado à sua própria conta segue as regras e quotas do seu projecto Google Cloud. Créditos GeoMoz aplicam-se apenas a operações cloud geridas pela plataforma. A disponibilidade dos métodos de pagamento depende da configuração do gateway.</p>
      <p className="mt-3 text-center text-xs text-slate-500"><CreditCard size={13} className="inline mr-1"/> Pagamentos confirmados pelo servidor; nunca alteramos a subscrição apenas com uma resposta do navegador.</p>
    </main>
  </div>;
}
