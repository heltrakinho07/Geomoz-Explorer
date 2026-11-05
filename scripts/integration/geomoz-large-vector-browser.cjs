/** Browser regression of the real Add Vector Layer panel's 150 MB routing.
 * Only the costly DuckDB conversion is simulated: the UI, File selection,
 * host bridge and cancellation code run in the compiled GeoMoz Workbench.
 * Other tests cover actual smaller GeoJSON imports and classified symbology.
 */
const assert = require("node:assert/strict");

module.exports = async function verifyGeoMozLargeVectorPanel(page) {
  await page.getByRole("navigation", { name: "Categorias de ferramentas GIS" })
    .getByRole("button", { name: "Vector", exact: true }).click();
  await page.getByTestId("geomoz-tools-flyout")
    .locator('[data-command="add.vector"]').click();

  const panel = page.locator(".geolibre-vector-panel").first();
  await panel.waitFor({ state: "visible", timeout: 20000 });
  const fileInput = panel.locator('input[type="file"]').first();
  await fileInput.waitFor({ state: "attached" });

  // Intercept only GeoMoz's large-vector Web Worker. Avoid running a 150 MB
  // DuckDB conversion in CI; keep the actual 150 MB File and real UI routing.
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    window.__geomozVectorMode = "progress";
    window.__restoreGeomozVectorWorker = () => { window.Worker = NativeWorker; };
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes("geomoz-large-vector")) {
          return new NativeWorker(url, options);
        }
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
        this._finished = false;
      }
      postMessage(request) {
        if (request?.kind !== "convert") throw Error("Unexpected vector worker message");
        window.setTimeout(() => {
          if (this._finished) return;
          this.onmessage?.({ data: { kind: "progress",
            label: "A ler o ficheiro geológico", percent: 37 } });
          if (window.__geomozVectorMode === "error") {
            window.setTimeout(() => {
              if (!this._finished) this.onmessage?.({ data: {
                kind: "error", message: "Ficheiro de teste inválido" } });
            }, 70);
          }
        }, 40);
      }
      terminate() { this._finished = true; }
    };
  });

  const loadedSize = await page.evaluate(() => {
    const part = new Blob([new Uint8Array(1024 * 1024)]);
    const source = new File(Array(150).fill(part), "geologia_150MB.geojson", {
      type: "application/geo+json",
    });
    const input = document.querySelector(".geolibre-vector-panel input[type=file]");
    if (!(input instanceof HTMLInputElement)) throw Error("Native file picker not found");
    const files = new DataTransfer();
    files.items.add(source);
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return source.size;
  });
  assert.equal(loadedSize, 150 * 1024 * 1024, "Exercise a real 150 MiB File");

  const status = panel.getByTestId("geomoz-large-vector-progress");
  await status.waitFor({ state: "visible", timeout: 12000 });
  await status.getByText(/geologia_150MB\.geojson/).waitFor();
  const bar = status.getByRole("progressbar", {
    name: "Progresso da leitura de GeoJSON",
  });
  await page.waitForFunction(() => {
    const meter = document.querySelector(".geomoz-large-vector-meter");
    return meter instanceof HTMLProgressElement && meter.value === 37;
  });
  assert.equal(await bar.getAttribute("value"), "37");
  await status.getByRole("button", { name: "Cancelar importação" }).click();
  await status.getByText(/Importação cancelada/).waitFor();
  assert.equal(await status.getByRole("button", { name: "Tentar novamente" }).count(), 1);
  assert.equal(await status.getByRole("button", { name: "Fechar" }).count(), 1);

  // Retry against a failed conversion, then retry/cancel once more. The
  // displayed error must remain actionable rather than disappearing silently.
  await page.evaluate(() => { window.__geomozVectorMode = "error"; });
  await status.getByRole("button", { name: "Tentar novamente" }).click();
  await status.getByText(/Ficheiro de teste inválido/).waitFor({ timeout: 10000 });
  assert.equal(await status.getAttribute("role"), "alert");
  await page.evaluate(() => { window.__geomozVectorMode = "progress"; });
  await status.getByRole("button", { name: "Tentar novamente" }).click();
  await status.getByRole("button", { name: "Cancelar importação" }).click();
  await status.getByRole("button", { name: "Fechar" }).click();
  await status.waitFor({ state: "hidden" });
  assert.equal(await page.locator('.gm-layer-row[data-layer-name="geologia_150MB"]').count(), 0,
    "Cancelling the huge import must not create a false GIS layer");
  await page.evaluate(() => window.__restoreGeomozVectorWorker?.());

  const close = panel.locator(".vector-control-close").first();
  if (await close.isVisible()) await close.click();
  console.log("150 MiB vector import: visible progress, cancellation, failure, retry and cleanup passed.");
};
