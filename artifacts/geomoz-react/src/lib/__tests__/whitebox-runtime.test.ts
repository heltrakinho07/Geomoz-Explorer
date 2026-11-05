// @vitest-environment node
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { initTools, listTools } from "whitebox-wasm/tools";

describe("GeoMoz Whitebox WASM runtime", () => {
  it(
    "loads the independent Whitebox binary and exposes the curated terrain tools",
    async () => {
      const require = createRequire(import.meta.url);
      const toolsPath = require.resolve("whitebox-wasm/tools");
      const wasmPath = join(dirname(toolsPath), "whitebox-cli.wasm");
      const wasmBytes = await readFile(wasmPath);

      await initTools(new Uint8Array(wasmBytes));
      const available = new Set(await listTools());

      for (const tool of [
        "slope",
        "aspect",
        "hillshade",
        "fill_depressions",
        "buffer_vector",
        "minimum_convex_hull",
      ]) {
        expect(available.has(tool), `Whitebox tool missing: ${tool}`).toBe(true);
      }
    },
    30_000
  );
});
