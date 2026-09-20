/**
 * share-payload.ts — Self-contained WebGIS link encoder / decoder.
 *
 * Uses the exact same logic as the standalone HTML export:
 * embeds the complete analysis snapshot into the URL hash (#data=...)
 * so the share link is 100% self-contained, works without any backend,
 * never expires, and opens instantly on any device or browser.
 */

export interface SharePayload {
  title?: string;
  basinReport: any;
  watershedData: any;
  watershedDrainageTile?: string | null;
  wsStats?: any;
  pourPoint?: [number, number] | null;
  province?: string | null;
  district?: string | null;
  aoi?: any;
}

/**
 * Encodes a share payload into a compact URL-safe base64 string using browser-native Deflate.
 */
export async function encodeSharePayload(payload: SharePayload): Promise<string> {
  try {
    const json = JSON.stringify(payload);

    // Use browser native CompressionStream if available (fast, standard Deflate)
    if (typeof CompressionStream !== "undefined") {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const response = new Response(stream);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return "z_" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    // Fallback: standard base64url
    return "b_" + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (err) {
    console.warn("encodeSharePayload error, using direct base64 fallback:", err);
    return "b_" + btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
}

/**
 * Decodes a share payload from a URL-safe base64 string.
 */
export async function decodeSharePayload(rawStr: string): Promise<SharePayload | null> {
  if (!rawStr) return null;
  try {
    let clean = rawStr.trim();
    if (clean.startsWith("#")) clean = clean.slice(1);
    if (clean.startsWith("data=")) clean = clean.slice(5);
    if (clean.startsWith("d=")) clean = clean.slice(2);

    // Check prefix
    if (clean.startsWith("z_") && typeof DecompressionStream !== "undefined") {
      let base64 = clean.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) base64 += "=";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const response = new Response(stream);
      const text = await response.text();
      return JSON.parse(text);
    }

    if (clean.startsWith("b_")) {
      let base64 = clean.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) base64 += "=";
      const json = decodeURIComponent(escape(atob(base64)));
      return JSON.parse(json);
    }

    // Try general base64 fallback
    let base64 = clean.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const json = decodeURIComponent(escape(atob(base64)));
    return JSON.parse(json);
  } catch (err) {
    console.warn("decodeSharePayload failed to parse:", err);
    return null;
  }
}
