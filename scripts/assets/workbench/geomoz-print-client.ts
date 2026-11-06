/** Secure same-origin GeoMoz GIS Workspace → authenticated print gateway.
 *
 * The Firebase JWT is obtained on-demand from the GeoMoz portal's existing
 * same-origin auth iframe. Tokens are never persisted or added to URLs.
 * Worker API tokens are NEVER available to the browser.
 */
import type { GeoMozQgisJob } from "./geomoz-qgis-print-job";

const REQUEST = "geomoz:workspace-print-token-request";
const RESPONSE = "geomoz:workspace-print-token-response";
const ENDPOINT = "/geomoz-api/v1/prints";
const uuid = () => crypto.randomUUID();

type PrintStatus = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  error?: string | null;
  statusUrl: string;
  resultUrl: string;
};

function getBridge() {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[src="/auth/workspace-check"]');
  if (!frame?.contentWindow || window.location.origin !== frame.contentWindow.location.origin) {
    throw Error("A sessão GeoMoz não está disponível. Entre novamente na plataforma.");
  }
  return frame;
}

export async function requestPrintFirebaseToken(signal?: AbortSignal): Promise<string> {
  const frame = getBridge();
  const id = uuid();
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timeout: number | undefined;
    const finish = (error?: Error, token?: string) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      if (timeout !== undefined) clearTimeout(timeout);
      if (error) reject(error);
      else if (token) resolve(token);
      else reject(Error("Sessão de impressão não autorizada."));
    };
    const onAbort = () => finish(Error("Pedido de impressão cancelado."));
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow ||
          event.data?.type !== RESPONSE || event.data?.id !== id) return;
      if (typeof event.data.token === "string" && event.data.token.length > 20) {
        finish(undefined, event.data.token);
      } else finish(Error("A sessão GeoMoz expirou. Inicie sessão novamente."));
    };
    if (signal?.aborted) return finish(Error("Pedido de impressão cancelado."));
    window.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = window.setTimeout(
      () => finish(Error("Não foi possível confirmar a sessão GeoMoz.")), 9000);
    frame.contentWindow!.postMessage({ type: REQUEST, id }, window.location.origin);
  });
}

async function apiRequest(url: string, token: string, options: RequestInit) {
  const response = await fetch(url, {
    ...options,
    credentials: "omit",
    redirect: "error",
    headers: {
      Authorization: "Bearer " + token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as {detail?: string; error?: string};
    throw Error(err.detail || err.error || "Serviço de impressão indisponível (HTTP " + response.status + ").");
  }
  return response;
}

function assertRelativePrintUrl(value: string) {
  if (typeof value !== "string" || !/^\/geomoz-api\/v1\/prints\/[a-f0-9]{32}(?:\/result)?$/.test(value)) {
    throw Error("O gateway devolveu um endereço de impressão inválido.");
  }
  return value;
}

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(Error("Pedido cancelado."));
  const timer = window.setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
  const abort = () => { window.clearTimeout(timer); reject(Error("Pedido cancelado.")); };
  signal?.addEventListener("abort", abort, { once: true });
});

export async function submitGeoMozPrint(
  job: GeoMozQgisJob,
  onStatus: (status: string) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const token = await requestPrintFirebaseToken(signal);
  const key = uuid().replace(/-/g, "");
  const start = await apiRequest(ENDPOINT, token, {
    method: "POST", signal,
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(job),
  });
  let result = await start.json() as PrintStatus;
  const started = Date.now();
  while (result.status !== "succeeded") {
    if (result.status === "failed") throw Error(result.error || "A impressão falhou.");
    if (Date.now() - started >= 120_000) {
      throw Error("A impressão continua em processamento. Tente novamente mais tarde.");
    }
    onStatus(result.status === "queued" ? "Na fila de impressão…" : "A gerar PDF cartográfico…");
    await pause(1800, signal);
    result = await (await apiRequest(assertRelativePrintUrl(result.statusUrl),
      token, { method: "GET", signal })).json() as PrintStatus;
  }
  onStatus("A obter o PDF gerado…");
  const response = await apiRequest(assertRelativePrintUrl(result.resultUrl),
    token, { method: "GET", signal });
  if (!response.headers.get("Content-Type")?.includes("application/pdf")) {
    throw Error("O servidor não devolveu um PDF válido.");
  }
  const blob = await response.blob();
  if (!blob.size || blob.size > 32 * 1024 * 1024) throw Error("PDF vazio ou demasiado grande.");
  return blob;
}
