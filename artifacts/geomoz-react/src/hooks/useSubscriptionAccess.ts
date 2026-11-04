import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import type { PlanId, PlanFeature } from "@/lib/plans";

/**
 * Read-only subscription snapshot from the server-side entitlement engine.
 * It is never used as proof of access: FastAPI rechecks the plan at execution.
 */
export interface SubscriptionAccess {
  plan: PlanId;
  status: string;
  periodEnd: string | null;
  features: Record<PlanFeature, boolean>;
  modules: Record<string, boolean>;
  limits: {
    projects: number | null;
    credits: number | null;
    storage_bytes: number | null;
    seats: number | null;
    concurrent_jobs: number | null;
  };
  usage: {
    creditCycle: string;
    creditsUsed: number;
    creditsRemaining: number | null;
    storageUsedBytes: number;
    storageQuotaEnforced: boolean;
    projectsUsed: number | null;
    projectCountVerified: boolean;
    concurrentJobsUsed: number | null;
    concurrentQuotaScope: string;
  };
  automaticRenewal: boolean;
  earthEngineQuota: string;
}

export function useSubscriptionAccess(enabled = true) {
  const { user } = useAuth();
  const [access, setAccess] = useState<SubscriptionAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !user || user.uid === "guest_user") {
      setAccess(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/geomoz-api/billing/access");
      if (!response.ok) {
        throw new Error(response.status === 401
          ? "A sessão expirou. Volte a iniciar sessão."
          : "Não foi possível confirmar as permissões e os consumos.");
      }
      setAccess(await response.json() as SubscriptionAccess);
    } catch (cause) {
      setAccess(null);
      setError(cause instanceof Error ? cause.message : "Falha ao consultar subscrição.");
    } finally {
      setLoading(false);
    }
  }, [enabled, user?.uid]);

  useEffect(() => {
    // Refresh only while the user is viewing this section, to avoid
    // fetching Firestore every time another settings panel is opened.
    if (enabled) void refresh();
    else { setAccess(null); setError(null); }
  }, [refresh, enabled]);

  return { access, loading, error, refresh };
}
