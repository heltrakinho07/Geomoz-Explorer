type Point = { label: string; value: number; time?: number };
type Chart = { title: string; unit: string; points: Point[]; kind?: "line" };

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
    add(label, "km²", points(rows.map(object).flatMap(row =>
      typeof row.name === "string" ? [[row.name, row.areaKm2]] as Array<[string, unknown]> : [])));
  }

  if (tool === "detect_temporal_change") {
    const threshold = number(result.threshold) ? format.format(result.threshold) : "";
    add(`${title} · área por classe de mudança`, "km²", points([
      [threshold ? `Aumento ≥ ${threshold}` : "Aumento", result.increaseAreaKm2],
      [threshold ? `Diminuição ≤ −${threshold}` : "Diminuição", result.decreaseAreaKm2],
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
      </figcaption>
      {line && (
        <svg aria-hidden="true" viewBox="0 0 320 96" className="w-full text-violet-600 dark:text-violet-400">
          <line x1="8" x2="312" y1={88 - zero * 0.8} y2={88 - zero * 0.8} stroke="currentColor" opacity="0.3" />
          <polyline fill="none" stroke="currentColor" strokeWidth="2" points={chart.points.map(point =>
            `${8 + 304 * ((point.time ?? firstTime) - firstTime) / duration},${88 - 80 * (point.value - min) / span}`).join(" ")} />
        </svg>
      )}
      <ul className="max-h-64 space-y-2 overflow-auto">
        {chart.points.map(({ label, value }, i) => (
          <li key={i}>
            <div className="flex justify-between gap-2">
              <span className="break-words">{label}</span>
              <span className="shrink-0 tabular-nums">{format.format(value)}</span>
            </div>
            {!line && (
              <div aria-hidden="true" className="relative mt-1 h-2 rounded bg-slate-100 dark:bg-slate-800">
                <div className="absolute inset-y-0 w-px bg-slate-400" style={{ left: `${zero}%` }} />
                <div className={`absolute inset-y-0 rounded ${value < 0 || /^(Diminuição|diminuição)/.test(label) ? "bg-amber-600" : "bg-violet-600"}`}
                  style={{ left: `${((Math.min(0, value) - min) / span) * 100}%`, width: `${Math.abs(value) / span * 100}%` }} />
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
