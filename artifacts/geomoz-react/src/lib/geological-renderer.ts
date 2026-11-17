import type { GeologicalResult } from "./geological-model";
/** CPU orthographic projection of actual GemPy meshes, including browsers without WebGL. */
export function createGeologicalRenderer(
  canvas: HTMLCanvasElement,
  result: GeologicalResult,
  visible: Set<string>,
  opacity: number,
) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Vista 3D indisponível; consulte as secções.");
  const b = result.input.extent,
    centre = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2],
    scale = Math.max(b[1] - b[0], b[3] - b[2], b[5] - b[4]);
  const norm = (p: number[]) => p.map((v, i) => (v - centre[i]) / scale);
  const triangles: { p: number[][]; color: number[] }[] = [];
  for (const mesh of result.meshes)
    if (visible.has(mesh.name)) {
      const points = mesh.vertices.map(norm),
        rgb = [1, 3, 5].map((i) => parseInt(mesh.color.slice(i, i + 2), 16));
      for (const indices of mesh.triangles) {
        const p = indices.map((i) => points[i]),
          a = p[1].map((v, i) => v - p[0][i]),
          b = p[2].map((v, i) => v - p[0][i]);
        const n = [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
          ],
          light =
            0.55 +
            0.45 *
              Math.abs(
                (n[0] * 0.3 + n[1] * 0.4 + n[2] * 0.866) /
                  (Math.hypot(...n) || 1),
              );
        triangles.push({ p, color: rgb.map((v) => Math.round(v * light)) });
      }
    }
  let yaw = -0.6,
    pitch = 0.55,
    zoom = 1.1,
    drag: number[] | null = null,
    frame = 0,
    disposed = false;
  const project = (p: number[]) => {
    const x = Math.cos(yaw) * p[0] - Math.sin(yaw) * p[1],
      d = Math.sin(yaw) * p[0] + Math.cos(yaw) * p[1],
      y = Math.cos(pitch) * p[2] - Math.sin(pitch) * d,
      z = Math.sin(pitch) * p[2] + Math.cos(pitch) * d;
    return [
      canvas.width / 2 + x * zoom * canvas.height * 0.75,
      canvas.height / 2 - y * zoom * canvas.height * 0.75,
      z,
    ];
  };
  const render = () => {
    frame = 0;
    if (disposed) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    ctx.fillStyle = "#09111c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const projected = triangles
      .map((t) => ({ p: t.p.map(project), color: t.color }))
      .sort(
        (a, b) =>
          a.p.reduce((s, p) => s + p[2], 0) - b.p.reduce((s, p) => s + p[2], 0),
      );
    for (const t of projected) {
      ctx.beginPath();
      t.p.forEach((p, i) =>
        i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
      );
      ctx.closePath();
      ctx.fillStyle = `rgba(${t.color.join(",")},${opacity})`;
      ctx.fill();
    }
    const corners = Array.from({ length: 8 }, (_, i) =>
      project(norm([b[i & 1 ? 1 : 0], b[i & 2 ? 3 : 2], b[i & 4 ? 5 : 4]])),
    );
    ctx.strokeStyle = "rgba(166,191,217,.5)";
    ctx.lineWidth = ratio;
    ctx.beginPath();
    for (let i = 0; i < 8; i++)
      for (const bit of [1, 2, 4])
        if (!(i & bit)) {
          ctx.moveTo(corners[i][0], corners[i][1]);
          ctx.lineTo(corners[i | bit][0], corners[i | bit][1]);
        }
    ctx.stroke();
    ctx.fillStyle = "#fff";
    for (const p of result.input.contacts)
      if (visible.has(p.formation)) {
        const q = project(norm([p.x, p.y, p.z]));
        ctx.beginPath();
        ctx.arc(q[0], q[1], 2.5 * ratio, 0, Math.PI * 2);
        ctx.fill();
      }
  };
  const schedule = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  };
  const down = (e: PointerEvent) => {
    drag = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    yaw += (e.clientX - drag[0]) * 0.008;
    pitch = Math.max(
      -1.45,
      Math.min(1.45, pitch + (e.clientY - drag[1]) * 0.008),
    );
    drag = [e.clientX, e.clientY];
    schedule();
  };
  const up = () => {
    drag = null;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom = Math.max(0.35, Math.min(3, zoom * Math.exp(-e.deltaY * 0.001)));
    schedule();
  };
  const key = (e: KeyboardEvent) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "-",
        "Home",
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    if (e.key === "Home") {
      yaw = -0.6;
      pitch = 0.55;
      zoom = 1.1;
    }
    if (e.key === "ArrowLeft") yaw -= 0.1;
    if (e.key === "ArrowRight") yaw += 0.1;
    if (e.key === "ArrowUp") pitch = Math.min(1.45, pitch + 0.1);
    if (e.key === "ArrowDown") pitch = Math.max(-1.45, pitch - 0.1);
    if (e.key === "+") zoom = Math.min(3, zoom * 1.1);
    if (e.key === "-") zoom = Math.max(0.35, zoom / 1.1);
    schedule();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", key);
  const observer = new ResizeObserver(schedule);
  observer.observe(canvas);
  schedule();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("keydown", key);
  };
}
