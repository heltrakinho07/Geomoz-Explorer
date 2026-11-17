import { useEffect, useMemo, useRef, useState } from "react";
import { createGeologicalRenderer } from "@/lib/geological-renderer";
import { sectionCells, type GeologicalResult } from "@/lib/geological-model";
export default function GeologicalViewer({
  result,
  pt = true,
}: {
  result: GeologicalResult;
  pt?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(
    () => new Set(result.meshes.map((m) => m.name)),
  );
  const [opacity, setOpacity] = useState(0.8),
    [reset, setReset] = useState(0),
    [error, setError] = useState("");
  const [axis, setAxis] = useState<"XZ" | "YZ">("XZ"),
    [slice, setSlice] = useState(Math.floor(result.input.resolution / 2));
  const n = result.input.resolution,
    b = result.input.extent,
    cells = useMemo(
      () => sectionCells(result, axis, slice),
      [result, axis, slice],
    ),
    colours = new Map(result.units.map((u) => [u.id, u.color]));
  const horizontal = axis === "XZ" ? 0 : 2,
    fixed = axis === "XZ" ? 2 : 0,
    coordinate = b[fixed] + ((slice + 0.5) * (b[fixed + 1] - b[fixed])) / n;
  useEffect(() => {
    setError("");
    if (!canvas.current) return undefined;
    try {
      return createGeologicalRenderer(canvas.current, result, visible, opacity);
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  }, [result, visible, opacity, reset]);
  return (
    <>
      <section className="geology-card">
        <div className="geology-section-title">
          <h2>{pt ? "Superfícies geológicas 3D" : "3D geological surfaces"}</h2>
          <button onClick={() => setReset((v) => v + 1)}>
            {pt ? "Repor vista" : "Reset view"}
          </button>
        </div>
        <canvas
          ref={canvas}
          className="geology-canvas"
          tabIndex={0}
          aria-label={
            pt
              ? "Modelo geológico 3D. Setas para rodar; + e - para zoom; Home para repor."
              : "3D geological model. Arrow keys rotate; + and - zoom; Home resets."
          }
        />
        {error && <p role="alert">{error}</p>}
        <p className="geology-hint">
          {pt
            ? "Arraste para rodar · Roda para aproximar · Pontos brancos: contactos observados · X Este, Y Norte, Z Cota (m)"
            : "Drag to rotate · Scroll to zoom · White points: observed contacts · X East, Y North, Z Elevation (m)"}
        </p>
        <div className="geology-toolbar">
          <label>
            {pt ? "Opacidade" : "Opacity"}
            <input
              aria-label={pt ? "Opacidade das superfícies" : "Surface opacity"}
              type="range"
              min=".15"
              max="1"
              step=".05"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </label>
          {result.meshes.map((m) => (
            <label key={m.name}>
              <input
                type="checkbox"
                checked={visible.has(m.name)}
                onChange={() =>
                  setVisible((old) => {
                    const next = new Set(old);
                    if (next.has(m.name)) next.delete(m.name);
                    else next.add(m.name);
                    return next;
                  })
                }
              />
              <i className="geology-swatch" style={{ background: m.color }} />
              {m.name}
            </label>
          ))}
        </div>
      </section>
      <section className="geology-card">
        <div className="geology-section-title">
          <h2>{pt ? "Secção litológica" : "Lithological section"}</h2>
          <select
            aria-label={pt ? "Plano da secção" : "Section plane"}
            value={axis}
            onChange={(e) => setAxis(e.target.value as "XZ" | "YZ")}
          >
            <option>XZ</option>
            <option>YZ</option>
          </select>
        </div>
        <label className="geology-slice">
          {axis === "XZ" ? "Y" : "X"} = {coordinate.toFixed(2)} m{" "}
          <input
            aria-label={pt ? "Posição da secção" : "Section position"}
            type="range"
            min="0"
            max={n - 1}
            value={slice}
            onChange={(e) => setSlice(Number(e.target.value))}
          />
        </label>
        <svg
          viewBox="0 0 640 390"
          role="img"
          aria-label={`${pt ? "Secção" : "Section"} ${axis}, ${coordinate.toFixed(2)} m`}
        >
          <rect x="60" y="20" width="560" height="320" fill="#071426" />
          {cells.map((c) => (
            <rect
              key={`${c.u}-${c.row}`}
              x={60 + (c.u * 560) / n}
              y={20 + (c.row * 320) / n}
              width={560 / n + 0.1}
              height={320 / n + 0.1}
              fill={colours.get(c.id) ?? "#555"}
            />
          ))}
          <g fill="currentColor" fontSize="12">
            <text x="8" y="25">
              {b[5]}
            </text>
            <text x="8" y="340">
              {b[4]}
            </text>
            <text x="60" y="360">
              {b[horizontal]}
            </text>
            <text x="620" y="360" textAnchor="end">
              {b[horizontal + 1]}
            </text>
            <text x="340" y="382" textAnchor="middle">
              {axis[0]} (m)
            </text>
            <text x="16" y="180" transform="rotate(-90 16 180)">
              Z (m)
            </text>
          </g>
        </svg>
        <p className="geology-hint">
          {pt
            ? "Classes nos centros das células. Eixos com escalas visuais independentes; leia as cotas indicadas."
            : "Classes at cell centres. Axes use independent display scales; refer to the labelled coordinates."}
        </p>
        <div className="geology-toolbar">
          {result.units
            .filter((u) => result.grid.lithology.includes(u.id))
            .map((u) => (
              <span key={u.id}>
                <i className="geology-swatch" style={{ background: u.color }} />
                {u.name}
              </span>
            ))}
        </div>
      </section>
    </>
  );
}
