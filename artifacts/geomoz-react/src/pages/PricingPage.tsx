import React from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck, Globe2 } from "lucide-react";
import BillingPanel from "@/components/BillingPanel";

/** Public pricing and plans page; uses the same GeoMoz design language. */
export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 dark:border-slate-800/80 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-3 px-4 sm:px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5 font-extrabold text-lg">
            <img src="/favicon.svg" alt="" aria-hidden="true" className="w-9 h-9 rounded-xl" />GeoMoz <span className="font-normal text-slate-500 text-sm hidden sm:inline">Explorer</span>
          </Link>
          <div className="flex items-center gap-3 text-xs font-semibold">
            <Link href="/" className="flex gap-1.5 items-center text-slate-600 dark:text-slate-300 hover:text-sky-600"><ArrowLeft size={14} /> Início</Link>
            <Link href="/login" className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2">Entrar</Link>
            <Link href="/register" className="rounded-xl px-3 py-2 bg-sky-600 text-white hover:bg-sky-700">Criar conta</Link>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 dark:border-sky-900 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300"><Globe2 size={14} /> GeoMoz Explorer · SIG na Web</div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Planos para cada etapa do seu trabalho geoespacial</h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">Explore gratuitamente. Amplie a capacidade de processamento e colaboração quando precisar. Preços de referência em MZN.</p>
        </div>
        <BillingPanel publicView />
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 pb-6"><ShieldCheck size={16} /> Pagamentos confirmados no servidor · Sem activação a partir de capturas de ecrã ou redireccionamentos</div>
      </main>
    </div>
  );
}
