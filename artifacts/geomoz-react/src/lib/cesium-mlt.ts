/** MLT adapter is kept separate from the imagery renderer. */
import * as MLT from "@maplibre/mlt";
export async function decodeMltLayers(_data:Uint8Array):Promise<Record<string,never>> {
  // Replaced with the pinned decoder API after dependency inspection in CI.
  throw new Error("MLT: " + Object.keys(MLT).join(", "));
}
