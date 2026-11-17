import { z } from "zod";
const finite = z.number().finite();
const name = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{N}_ .-]+$/u);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const contact = z
  .object({ x: finite, y: finite, z: finite, formation: name })
  .strict();
const orientation = contact.extend({
  azimuth: finite.min(0).lt(360),
  dip: finite.min(0).max(90),
  polarity: z.union([z.literal(1), z.literal(-1)]),
});
const modelSchema = z
  .object({
    schemaVersion: z.literal(1),
    name,
    crs: z.string().regex(/^(LOCAL|EPSG:\d{4,6})$/),
    extent: z.tuple([finite, finite, finite, finite, finite, finite]),
    resolution: z.union([z.literal(16), z.literal(24), z.literal(32)]),
    interfaces: z
      .array(
        z.object({ name, kind: z.enum(["layer", "fault"]), color }).strict(),
      )
      .min(1)
      .max(8),
    contacts: z.array(contact).min(3).max(250),
    orientations: z.array(orientation).min(1).max(100),
  })
  .strict();
export type GeologicalModel = z.infer<typeof modelSchema>;
const resultSchema = z.object({
  schemaVersion: z.literal(1),
  input: modelSchema,
  engine: z.object({
    gempy: z.string(),
    gempy_engine: z.string(),
    backend: z.literal("numpy"),
    dtype: z.literal("float64"),
  }),
  grid: z.object({
    resolution: z.tuple([finite, finite, finite]),
    extent: z.tuple([finite, finite, finite, finite, finite, finite]),
    order: z.literal("xyz-C"),
    sampling: z.literal("cell-centres"),
    lithology: z.array(z.number().int().min(1).max(9)).max(32768),
  }),
  units: z
    .array(
      z.object({
        id: z.number().int().min(1).max(9),
        name: z.string().max(64),
        color,
      }),
    )
    .max(9),
  meshes: z
    .array(
      z.object({
        name,
        color,
        vertices: z.array(z.tuple([finite, finite, finite])).max(100000),
        triangles: z
          .array(
            z.tuple([
              z.number().int().nonnegative(),
              z.number().int().nonnegative(),
              z.number().int().nonnegative(),
            ]),
          )
          .max(100000),
      }),
    )
    .max(8),
  interpretation: z.string().max(1000),
});
export type GeologicalResult = z.infer<typeof resultSchema>;
export interface GeologicalJob {
  id: string;
  projectId: string;
  name: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  error?: string;
}
export const activeJob = (job: GeologicalJob | null) =>
  !!job && ["queued", "running"].includes(job.status);
export function parseGeologicalModel(value: unknown): GeologicalModel {
  const parsed = modelSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      "Dados inválidos: " +
        parsed.error.issues[0].path.join(".") +
        " · " +
        parsed.error.issues[0].message,
    );
  const m = parsed.data,
    names = m.interfaces.map((u) => u.name);
  if (
    new Set(names).size !== names.length ||
    names.some((n) => n.toLowerCase() === "basement") ||
    m.interfaces.filter((u) => u.kind === "fault").length > 1 ||
    !m.interfaces.some((u) => u.kind === "layer")
  )
    throw new Error(
      "Sequência inválida: nomes únicos, camadas e no máximo uma falha.",
    );
  for (const i of [0, 2, 4])
    if (
      m.extent[i + 1] - m.extent[i] < 1 ||
      m.extent[i + 1] - m.extent[i] > 100000
    )
      throw new Error("Cada dimensão deve medir entre 1 m e 100 km.");
  for (const rows of [m.contacts, m.orientations]) {
    const seen = new Set<string>();
    for (const p of rows) {
      if (!names.includes(p.formation))
        throw new Error("Formação desconhecida: " + p.formation);
      for (const [i, a] of (["x", "y", "z"] as const).entries())
        if (p[a] < m.extent[i * 2] || p[a] > m.extent[i * 2 + 1])
          throw new Error("Ponto fora da extensão do modelo.");
      const key = JSON.stringify([p.formation, p.x, p.y, p.z]);
      if (seen.has(key)) throw new Error("Pontos duplicados.");
      seen.add(key);
    }
  }
  for (const n of names)
    if (
      m.contacts.filter((p) => p.formation === n).length < 3 ||
      !m.orientations.some((p) => p.formation === n)
    )
      throw new Error(n + ": são necessários 3 contactos e uma orientação.");
  return m;
}
export function parseGeologicalResult(value: unknown): GeologicalResult {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) throw new Error("Resultado geológico inválido.");
  const r = parsed.data;
  parseGeologicalModel(r.input);
  const n = r.input.resolution;
  if (
    r.grid.resolution.some((v) => v !== n) ||
    r.grid.extent.some((v, i) => v !== r.input.extent[i]) ||
    r.grid.lithology.length !== n ** 3
  )
    throw new Error("Dimensões da grelha incompatíveis.");
  const ids = new Set(r.units.map((u) => u.id));
  if (ids.size !== r.units.length || r.grid.lithology.some((v) => !ids.has(v)))
    throw new Error("Classes litológicas inválidas.");
  if (
    r.meshes.some((m) =>
      m.triangles.some((t) => t.some((i) => i >= m.vertices.length)),
    )
  )
    throw new Error("Índice de malha inválido.");
  if (r.meshes.reduce((s, m) => s + m.triangles.length, 0) > 100000)
    throw new Error("Malha demasiado grande para esta vista.");
  return r;
}
const columns = {
  contacts: ["x", "y", "z", "formation"],
  orientations: ["x", "y", "z", "azimuth", "dip", "polarity", "formation"],
};
export function parseGeologyCsv(
  text: string,
  kind: "contacts",
): GeologicalModel["contacts"];
export function parseGeologyCsv(
  text: string,
  kind: "orientations",
): GeologicalModel["orientations"];
export function parseGeologyCsv(
  text: string,
  kind: "contacts" | "orientations",
) {
  text = text.replace(/^\uFEFF/, "").trim();
  if (text.length > 1000000) throw new Error("CSV excede 1 MB.");
  const header = text.split(/\r?\n/, 1)[0],
    delimiter = header.includes(";") ? ";" : header.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === delimiter || c === "\n")) {
      row.push(field.trim());
      field = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else if (c !== "\r" || quoted) field += c;
  }
  if (quoted) throw new Error("Aspas não fechadas no CSV.");
  row.push(field.trim());
  rows.push(row);
  const keys = rows.shift()!.map((s) => s.toLowerCase());
  if (
    keys.length !== columns[kind].length ||
    new Set(keys).size !== keys.length ||
    columns[kind].some((k) => !keys.includes(k))
  )
    throw new Error("Colunas esperadas: " + columns[kind].join(","));
  return rows
    .filter((r) => r.some(Boolean))
    .map((r, index) => {
      if (r.length !== keys.length)
        throw new Error(`Linha ${index + 2}: número de colunas inválido.`);
      const obj = Object.fromEntries(
        keys.map((k, i) => [
          k,
          k === "formation"
            ? r[i]
            : r[i] === ""
              ? NaN
              : Number(delimiter === "," ? r[i] : r[i].replace(",", ".")),
        ]),
      );
      const parsed = (kind === "contacts" ? contact : orientation).safeParse(
        obj,
      );
      if (!parsed.success)
        throw new Error(`Linha ${index + 2}: valores inválidos.`);
      return parsed.data;
    });
}
export function geologyCsv(
  rows: GeologicalModel["contacts"] | GeologicalModel["orientations"],
  kind: "contacts" | "orientations",
) {
  const keys = columns[kind];
  return [
    keys.join(","),
    ...rows.map((row) =>
      keys
        .map((k) => {
          const v = String((row as unknown as Record<string, unknown>)[k]);
          return /[",\n]/.test(v) ? '"' + v.replaceAll('"', '""') + '"' : v;
        })
        .join(","),
    ),
  ].join("\n");
}
export function sectionCells(
  r: GeologicalResult,
  axis: "XZ" | "YZ",
  slice: number,
) {
  const n = r.input.resolution;
  if (!Number.isInteger(slice) || slice < 0 || slice >= n)
    throw new Error("Secção fora do modelo.");
  return Array.from({ length: n * n }, (_, i) => {
    const u = i % n,
      row = Math.floor(i / n),
      z = n - 1 - row,
      x = axis === "XZ" ? u : slice,
      y = axis === "XZ" ? slice : u;
    return { u, row, id: r.grid.lithology[(x * n + y) * n + z] };
  });
}
export function downloadGeology(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
