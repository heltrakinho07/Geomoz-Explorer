import { apiFetch } from "./api";

export interface GeeApiDiagnostic {
  connected: boolean;
  apiOnline: boolean;
  message: string;
}

type JsonResponse = { response: Response; data: Record<string, unknown> };

async function requestJson(path: string): Promise<JsonResponse> {
  // Do not leave the retry button spinning forever on stalled Cloud Run
  // cold starts, blocked Firebase rewrites, or failed token refreshes.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`A verificação da API excedeu 12 segundos em ${path}. Verifique a ligação e o Cloud Run.`));
      }, 12000);
    });
    // Timeout covers Firebase getIdToken AND the HTTP request; aborting fetch
    // alone would leave the UI stuck if token refresh never resolved.
    const response = await Promise.race([
      apiFetch(path, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      }),
      deadline,
    ]);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        `A rota ${path} devolveu uma página em vez da API JSON (HTTP ${response.status}). Verifique o encaminhamento Firebase Hosting → Cloud Run.`
      );
    }
    const data: Record<string, unknown> = await response.json();
    return { response, data };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function responseDetail(data: Record<string, unknown>, fallback: string): string {
  return typeof data.detail === "string"
    ? data.detail
    : typeof data.message === "string"
      ? data.message
      : fallback;
}

/** Perform a real health, OAuth capability, and personal GEE status check. */
export async function diagnoseGeeApi(): Promise<GeeApiDiagnostic> {
  try {
    const health = await requestJson("/geomoz-api/health");
    if (!health.response.ok || health.data.status !== "ok") {
      return {
        connected: false,
        apiOnline: false,
        message: `A API GeoMoz respondeu HTTP ${health.response.status}, mas o servidor não está saudável. Verifique o Cloud Run.`,
      };
    }
    const capabilities = await requestJson("/geomoz-api/gee/oauth/capabilities");
    if (!capabilities.response.ok) {
      return {
        connected: false,
        apiOnline: true,
        message: capabilities.response.status === 401
          ? "Servidor GeoMoz online, mas a sessão Firebase não está autenticada. Termine sessão e entre novamente no GeoMoz."
          : `Servidor online, mas a autorização Google está indisponível (HTTP ${capabilities.response.status}): ${responseDetail(capabilities.data, "Verifique a configuração OAuth no Cloud Run.")}`,
      };
    }
    const status = await requestJson("/geomoz-api/gee/status");
    if (!status.response.ok) {
      return {
        connected: false,
        apiOnline: true,
        message: status.response.status === 503
          ? `Servidor e autenticação Google disponíveis, mas o armazenamento das credenciais Earth Engine não está acessível (HTTP 503): ${responseDetail(status.data, "Verifique o acesso do Cloud Run ao Firestore.")}`
          : `Servidor online; não foi possível consultar a sessão Earth Engine (HTTP ${status.response.status}): ${responseDetail(status.data, "Verifique a sessão Firebase.")}`,
      };
    }
    if (status.data.connected === true && status.data.user_connected === true) {
      return {
        connected: true,
        apiOnline: true,
        message: `Ligação Earth Engine verificada com sucesso. Projecto: ${String(status.data.project || "não identificado")}.`,
      };
    }
    return {
      connected: false,
      apiOnline: true,
      message: `Servidor e autorização Google disponíveis. ${responseDetail(status.data, "Ainda não há uma conta Earth Engine ligada.")} Utilize «Ligar com a Conta Google» para autorizar o acesso.`,
    };
  } catch (err) {
    return {
      connected: false,
      apiOnline: false,
      message: err instanceof Error ? err.message : "Não foi possível concluir o diagnóstico da API GeoMoz.",
    };
  }
}
