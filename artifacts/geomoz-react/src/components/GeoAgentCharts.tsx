type Point = { label: string; value: number; time?: number; color?: string; classId?: number; percentage?: number };
type Chart = { title: string; unit: string; points: Point[]; kind?: "line"; worldCover?: boolean };

const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const format = new Intl.NumberFormat("pt-PT", { maximumSignificantDigits: 6 });

function points(entries: Array<[string, unknown]>): Point[] {
  return entries.flatMap(([label, value]) => number(value) ? [{ label, value }] : []);
}

export function chartsFor(tool: string, result: Record<string, unknown>): Chart[] {
  const charts: Chart[] = [];
  const index = typeof result.index === "string" ? result.index.toUpperCase() : "";
  const title = tool === "detect_temporal_change" ? `Δ${index || "índice"} (B − A)`
    : index || (tool === "get_global_climate" ? "ERA5-Land" : tool.replaceAll("_", " "));
  const unit = typeof result.unit === "string" ? result.unit : "";
  const add = (title: string, unit: string, data: Point[], kind?: Chart["kind"]) => {
    if (data.length) charts.push({ title, unit, points: data, kind });
  };

  for (const [key, label] of [["classes", "Área por classe"], ["dominantUnits", "Área das unidades geológicas apresentadas"]]) {
    const rows = result[key];
    if (!Array.isArray(rows)) continue;
    const worldCover = tool === "get_public_landcover" && key === "classes";
    const data = rows.map(object).flatMap(row => {
      if (typeof row.name !== "string" || !number(row.areaKm2)) return [];
      return [{
        label: row.name, value: row.areaKm2,
        color: worldCover && typeof row.color === "string" && /^#[0-9a-f]{6}$/i.test(row.color) ? row.color : undefined,
        classId: worldCover && number(row.id) ? row.id : undefined,
        percentage: worldCover && number(row.percentOfValidArea) ? row.percentOfValidArea : undefined,
      }];
    });
    if (data.length) charts.push({ title: label, unit: "km²", points: data, worldCover });
  }

  if (tool === "detect_temporal_change") {
    const threshold = number(result.threshold) ? format.format(result.threshold) : "";
    add(`${title} · área por classe de mudança`, "km²", points([
      [threshold ? `Aumento ≥ ${threshold}` : "Aumento", result.increaseAreaKm2],
      [threshold ? `Diminuição ≤ −${threshold}` : "Diminuição", result.decreaseAreaKm2],
      ["Alteração inferior ao limiar", result.neutralAreaKm2],
    ]));
  } else if (tool === "calculate_zonal_statistics" && number(result.selectedAreaKm2)) {
    const operators: Record<string, string> = { gte: "≥", gt: ">", lte: "≤", lt: "<" };
    const operator = typeof result.comparison === "string" ? operators[result.comparison] : undefined;
    const selected = operator && number(result.threshold) ? `Área ${operator} ${format.format(result.threshold)}` : "Área acima ou abaixo do limiar seleccionado";
    add(`${title} · área observada`, "km²", points([
      [selected, result.selectedAreaKm2], ["Área válida total", result.validAreaKm2],
    ]));
  }

  const stats = object(result.stats);
  const summary = points([["Mínimo", stats.min], ["Média", stats.mean ?? result.mean], ["Máximo", stats.max]]);
  if (summary.length && (index || unit || summary.length > 1)) add(`${title} · estatísticas espaciais`, unit, summary);

  if (Array.isArray(result.series) && unit) {
    const dated = result.series.map(object).flatMap(row => {
      if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !number(row.value)) return [];
      const time = Date.parse(row.date);
      return Number.isFinite(time) ? [{ label: row.date, value: row.value, time }] : [];
    }).sort((a, b) => a.time - b.time);
    if (dated.length >= 2 && dated[0].time !== dated[dated.length - 1].time) add(`${title} · série temporal`, unit, dated, "line");
  }

  if (!charts.length) {
    const entries = Object.entries(result);
    const fields = (suffix: string) => points(entries.filter(([name]) => name.endsWith(suffix))
      .map(([name, value]) => [name.slice(0, -suffix.length).replace(/([a-z])([A-Z])/g, "$1 $2"), value]));
    const areas = fields("AreaKm2").filter(point => !/^(aoi|valid|common valid)$/i.test(point.label));
    if (areas.length) add(`${title} · áreas`, "km²", areas);
    else if (unit && summary.length) add(title, unit, summary);
  }
  return charts;
}

function exportWorldCover(points: Point[]) {
  const rows = [["ano", "codigo_classe", "classe", "area_km2", "percentagem_area_valida", "cor"],
    ...points.map(point => [2021, point.classId ?? "", point.label, point.value, point.percentage ?? "", point.color ?? ""])];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "worldcover-2021-estatisticas.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ChartFigure({ chart }: { chart: Chart }) {
  const values = chart.points.map(point => point.value);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = max - min || 1;
  const zero = (-min / span) * 100;
  const line = chart.kind === "line";
  const firstTime = chart.points[0].time ?? 0;
  const duration = (chart.points[chart.points.length - 1].time ?? 0) - firstTime;
  return (
    <figure className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
      <figcaption className="font-semibold text-slate-800 dark:text-slate-100">
        {chart.title}{chart.unit && ` · ${chart.unit}`}
        {chart.worldCover && <button type="button" className="ml-3 underline" onClick={() => exportWorldCover(chart.points)}>Exportar CSV</button>}
      </figcaption>
      {line && (
        <svg aria-hidden="true" viewBox="0 0 320 96" className="w-full text-violet-600 dark:text-violet-400">
          <line x1="8" x2="312" y1={88 - zero * 0.8} y2={88 - zero * 0.8} stroke="currentColor" opacity="0.3" />
          <polyline fill="none" stroke="currentColor" strokeWidth="2" points={chart.points.map(point =>
            `${8 + 304 * ((point.time ?? firstTime) - firstTime) / duration},${88 - 80 * (point.value - min) / span}`).join(" ")} />
        </svg>
      )}
      <ul className="max-h-64 space-y-2 overflow-auto">
        {chart.points.map(({ label, value, color }, i) => (
          <li key={i}>
            <div className="flex justify-between gap-2">
              <span className="break-words">{color && <span aria-hidden="true" className="mr-1.5 inline-block size-3 rounded-sm border border-slate-500/40" style={{ backgroundColor: color }} />}{label}</span>
              <span className="shrink-0 tabular-nums">{format.format(value)}</span>
            </div>
            {!line && (
              <div aria-hidden="true" className="relative mt-1 h-2 rounded bg-slate-100 dark:bg-slate-800">
                <div className="absolute inset-y-0 w-px bg-slate-400" style={{ left: `${zero}%` }} />
                <div className={`absolute inset-y-0 rounded ${value < 0 || /^(Diminuição|diminuição)/.test(label) ? "bg-amber-600" : "bg-violet-600"}`}
                  style={{ backgroundColor: color, left: `${((Math.min(0, value) - min) / span) * 100}%`, width: `${Math.abs(value) / span * 100}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function GeoAgentCharts({ evidence }: {
  evidence: Array<{ id: string; tool: string; status: string; result: Record<string, unknown> }>;
}) {
  const charts = evidence.flatMap(record => record.status === "success"
    ? chartsFor(record.tool, record.result).map((chart, index) => ({ chart, id: `${record.id}-${index}` }))
    : []);
  if (!charts.length) return null;
  return (
    <section aria-label="Gráficos da análise" className="space-y-2">
      {charts.map(({ id, chart }) => <ChartFigure key={id} chart={chart} />)}
    </section>
  );
}
