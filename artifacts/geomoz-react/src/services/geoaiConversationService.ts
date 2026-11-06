import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** Small, private conversation memory. Scientific dossiers remain exportable separately. */
export type GeoAiStoredMessage = {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  model?: string;
};
export type GeoAiLastAnalysis = {
  aoi: Record<string, unknown>;
  tool: string;
  summary: string;
  period?: { startDate: string; endDate: string };
  sourceId?: string;
};
export type GeoAiConversation = {
  messages: GeoAiStoredMessage[];
  lastAnalysis: GeoAiLastAnalysis | null;
};

const MAX_MESSAGES = 32;
const MAX_MESSAGE_LENGTH = 1800;
const forbidden = /(access[_ -]?token|refresh[_ -]?token|api[_ -]?key|client[_ -]?secret|authorization|password|credential)/i;
const SECRET_PATTERN = /\b(?:sk-[a-zA-Z0-9_-]{14,}|AIza[a-zA-Z0-9_-]{20,}|ya29\.[a-zA-Z0-9._-]{15,})\b/g;

function scrub(text: string, max: number): string {
  return text.replace(SECRET_PATTERN, "[credencial omitida]").slice(0, max);
}

export function compactGeoAiHistory(messages: GeoAiStoredMessage[]): GeoAiStoredMessage[] {
  return messages.filter((msg) => msg && (msg.sender === "user" || msg.sender === "agent"))
    .slice(-MAX_MESSAGES)
    .map((msg) => ({
      id: String(msg.id || "").slice(0, 100),
      sender: msg.sender,
      text: scrub(String(msg.text || ""), MAX_MESSAGE_LENGTH),
      timestamp: String(msg.timestamp || "").slice(0, 30),
      ...(msg.model ? { model: String(msg.model).slice(0, 80) } : {}),
    }));
}

export function safeGeoAiAoi(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const original = raw as Record<string, unknown>;
  if (original.source === "global") return null;
  const aoi: Record<string, unknown> = {};
  for (const key of ["source", "countryCode", "countryName", "boundarySource", "label",
                     "province", "district", "municipalDistrict"]) {
    const value = original[key];
    if (typeof value === "string" && value.length <= 170 && !forbidden.test(key)) aoi[key] = value;
  }
  for (const key of ["adminLevel", "admin1Code", "admin2Code"]) {
    const value = original[key];
    if (typeof value === "number" && Number.isSafeInteger(value)) aoi[key] = value;
  }
  if (original.geometry && typeof original.geometry === "object") {
    const serialized = JSON.stringify(original.geometry);
    if (serialized.length > 85_000) return null;
    aoi.geometry = original.geometry;
  }
  if (!aoi.geometry && !aoi.countryCode && aoi.source !== "mozambique") return null;
  return aoi;
}

export function makeGeoAiAnalysisMemory(
  rawAoi: unknown,
  runs: unknown,
  period: { startDate?: string; endDate?: string } | null,
): GeoAiLastAnalysis | null {
  const aoi = safeGeoAiAoi(rawAoi);
  if (!aoi || !Array.isArray(runs)) return null;
  const result = [...runs].reverse().find(
    (run) => run?.output?.status === "success" && typeof run?.tool === "string",
  ) as { tool: string; output?: Record<string, unknown> } | undefined;
  if (!result) return null;
  const source = result.output?.source;
  const sourceId = typeof source === "object" && source
    ? (source as Record<string, unknown>).id : undefined;
  const validPeriod = period?.startDate && period?.endDate
    ? { startDate: period.startDate.slice(0, 10), endDate: period.endDate.slice(0, 10) }
    : undefined;
  return {
    aoi,
    tool: result.tool.slice(0, 90),
    summary: scrub(String(result.output?.summary || ""), 800),
    ...(validPeriod ? { period: validPeriod } : {}),
    ...(typeof sourceId === "string" ? { sourceId: sourceId.slice(0, 180) } : {}),
  };
}

function scopeDoc(uid: string, projectId?: string | null) {
  if (!uid || uid.startsWith("guest_")) throw new Error("É necessário iniciar sessão.");
  const safeProjectId = projectId && /^[\w-]{1,120}$/.test(projectId) ? projectId : "general";
  return doc(db, "users", uid, "geoaiThreads", safeProjectId);
}

export async function loadGeoAiConversation(uid: string, projectId?: string | null): Promise<GeoAiConversation> {
  const snapshot = await getDoc(scopeDoc(uid, projectId));
  if (!snapshot.exists()) return { messages: [], lastAnalysis: null };
  const data = snapshot.data();
  return {
    messages: compactGeoAiHistory(Array.isArray(data.messages) ? data.messages : []),
    lastAnalysis: data.lastAnalysis && safeGeoAiAoi(data.lastAnalysis.aoi)
      ? { ...data.lastAnalysis, aoi: safeGeoAiAoi(data.lastAnalysis.aoi) } as GeoAiLastAnalysis : null,
  };
}

export async function saveGeoAiConversation(
  uid: string, projectId: string | null | undefined, content: GeoAiConversation,
): Promise<void> {
  await setDoc(scopeDoc(uid, projectId), {
    version: 1,
    messages: compactGeoAiHistory(content.messages),
    lastAnalysis: content.lastAnalysis ? {
      ...content.lastAnalysis,
      aoi: safeGeoAiAoi(content.lastAnalysis.aoi),
      summary: scrub(content.lastAnalysis.summary, 800),
    } : null,
    updatedAt: serverTimestamp(),
  });
}

export async function clearGeoAiConversation(uid: string, projectId?: string | null) {
  await deleteDoc(scopeDoc(uid, projectId));
}
