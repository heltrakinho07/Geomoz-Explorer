import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { PLANS, PLAN_ORDER, isPlanId, type GeoMozPlan, type PlanId, type PlanFeature, hasPlanFeature } from "@/lib/plans";
import { apiFetch } from "@/lib/api";

export interface BillingState {
  plan: PlanId;
  status: "active" | "trialing" | "past_due" | "cancelled" | "expired";
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  creditsUsed: number;
  creditCycle: string | null;
  storageUsedBytes: number;
}
const FREE: BillingState = {plan:"community",status:"active",periodEnd:null,cancelAtPeriodEnd:false,creditsUsed:0,creditCycle:null,storageUsedBytes:0};
export function useSubscription() {
  const {user} = useAuth();
  const [state,setState] = useState<BillingState>(FREE);
  const [catalog,setCatalog] = useState<Record<PlanId,GeoMozPlan>>(PLANS);
  const [metering, setMetering] = useState<{cycle:string;creditsUsed:number;creditsReserved:number;creditsRemaining:number|null}|null>(null);
  useEffect(()=>{
    let mounted=true;
    apiFetch("/geomoz-api/billing/catalog")
      .then(async response=>response.ok?response.json():null)
      .then(data=>{
        if(!mounted || !data?.plans) return;
        const merged=Object.fromEntries(PLAN_ORDER.map(id=>[id,{...PLANS[id],...(data.plans[id]||{})}])) as Record<PlanId,GeoMozPlan>;
        setCatalog(merged);
      }).catch(()=>undefined);
    return ()=>{mounted=false;};
  },[]);
  useEffect(()=>{
    if(!user || user.uid==="guest_user"){setMetering(null);return;}
    let active=true;
    const poll=()=>{
      apiFetch("/geomoz-api/billing/usage")
        .then(async response=>response.ok?response.json():null)
        .then(data=>{if(active)setMetering(data?.cycle?data:null);})
        .catch(()=>{if(active)setMetering(null);});
    };
    poll();
    const timer=window.setInterval(poll,60000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[user?.uid]);
  const [loading,setLoading] = useState(true);
  const [now,setNow] = useState(Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60_000);return ()=>window.clearInterval(timer);},[]);
  const [error,setError] = useState<string | null>(null);
  useEffect(()=>{
    setState(FREE);setError(null);
    if(!user || user.uid==="guest_user"){setLoading(false);return;}
    setLoading(true);
    const unsubscribe = onSnapshot(doc(db,"billing",user.uid), snap=>{
      const data=snap.data();
      const plan=isPlanId(data?.plan)?data.plan:"community";
      const status = data?.status;
      const validStatus = status === undefined ? "active" : (["active","trialing","past_due","cancelled","expired"].includes(status) ? status as BillingState["status"] : "expired");
      const periodEnd = typeof data?.periodEnd==="string"?data.periodEnd:null;
      const unexpired = plan==="community" || (!!periodEnd && Date.parse(periodEnd)>Date.now());
      const usable = (validStatus==="active" || validStatus==="trialing") && unexpired;
      const cycle = typeof data?.creditCycle==="string"?data.creditCycle:null;
      setState({plan:usable?plan:"community",status:unexpired?validStatus:"expired",periodEnd,cancelAtPeriodEnd:data?.cancelAtPeriodEnd===true,creditsUsed:typeof data?.creditsUsed==="number"?Math.max(0,data.creditsUsed):0,creditCycle:cycle,storageUsedBytes:typeof data?.storageUsedBytes==="number"?Math.max(0,data.storageUsedBytes):0});
      setLoading(false);
    },err=>{setError(err.message);setState(FREE);setLoading(false);});
    return unsubscribe;
  },[user?.uid]);
  const stillValid=state.plan==="community" || (state.periodEnd!==null && Date.parse(state.periodEnd)>now);
  const plan=stillValid?state.plan:"community";
  const utcMonth=new Date(now).toISOString().slice(0,7);
  const consumed=state.creditCycle===utcMonth?state.creditsUsed:0;
  const live=!!metering && metering.cycle===utcMonth;
  return { ...state, plan, planData:catalog[plan], loading, error,
    creditsUsed:live?metering.creditsUsed:consumed,
    creditsReserved:live?metering.creditsReserved:0,
    meteringLive:live,
    can:(feature:PlanFeature)=>hasPlanFeature(plan,feature),
    remainingCredits:live && metering.creditsRemaining!==null
      ? metering.creditsRemaining
      : Math.max(0,(catalog[plan].credits??Number.MAX_SAFE_INTEGER)-consumed),
  };
}
