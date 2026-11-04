import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { PLANS, isPlanId, type PlanId, type PlanFeature, hasPlanFeature } from "@/lib/plans";

export interface BillingState {
  plan: PlanId;
  status: "active" | "trialing" | "past_due" | "cancelled" | "expired";
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  creditsUsed: number;
  storageUsedBytes: number;
}
const FREE: BillingState = {plan:"community",status:"active",periodEnd:null,cancelAtPeriodEnd:false,creditsUsed:0,storageUsedBytes:0};
export function useSubscription() {
  const {user} = useAuth();
  const [state,setState] = useState<BillingState>(FREE);
  const [loading,setLoading] = useState(true);
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
      const usable = validStatus==="active" || validStatus==="trialing";
      setState({plan:usable?plan:"community",status:validStatus,periodEnd:typeof data?.periodEnd==="string"?data.periodEnd:null,cancelAtPeriodEnd:data?.cancelAtPeriodEnd===true,creditsUsed:typeof data?.creditsUsed==="number"?Math.max(0,data.creditsUsed):0,storageUsedBytes:typeof data?.storageUsedBytes==="number"?Math.max(0,data.storageUsedBytes):0});
      setLoading(false);
    },err=>{setError(err.message);setState(FREE);setLoading(false);});
    return unsubscribe;
  },[user?.uid]);
  return { ...state, planData:PLANS[state.plan], loading, error,
    can:(feature:PlanFeature)=>hasPlanFeature(state.plan,feature),
    remainingCredits:Math.max(0,(PLANS[state.plan].credits??Number.MAX_SAFE_INTEGER)-state.creditsUsed),
  };
}
