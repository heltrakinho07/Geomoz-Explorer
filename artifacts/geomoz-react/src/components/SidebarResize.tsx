import { useEffect, useRef, useState, type CSSProperties } from "react";

export function useSidebarWidth(key: string, initial = 320) {
  const clamp = (value: number) => Math.round(Math.max(260, Math.min(value, 640, window.innerWidth - 320)));
  const [width, setWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem(key)); return clamp(saved >= 260 ? saved : initial); }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, String(width)); } catch { /* Storage may be unavailable. */ } }, [key, width]);
  useEffect(() => {
    const resize = () => setWidth(value => clamp(value));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return { width, setWidth: (value: number) => setWidth(clamp(value)), reset: () => setWidth(clamp(initial)),
    style: { "--gm-sidebar-width": `${width}px` } as CSSProperties };
}

export function SidebarResize({ panel, breakpoint = "md" }: {
  panel: ReturnType<typeof useSidebarWidth>; breakpoint?: "md" | "lg";
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  return <div role="separator" aria-label="Largura do painel lateral" aria-orientation="vertical"
    aria-valuemin={260} aria-valuemax={Math.max(260, Math.min(640, window.innerWidth - 320))} aria-valuenow={panel.width}
    tabIndex={0} title="Arraste para alargar ou reduzir. Setas ajustam a largura; duplo clique repõe."
    className={`absolute inset-y-0 z-[710] w-2 touch-none cursor-col-resize items-center justify-center hover:bg-sky-500/20 focus-visible:bg-sky-500/20 focus-visible:outline-none ${breakpoint === "lg" ? "hidden lg:flex" : "hidden md:flex"}`}
    style={{ left: panel.width - 4 }} onDoubleClick={panel.reset}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus();
      drag.current = { x: event.clientX, width: panel.width };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => { if (drag.current) panel.setWidth(drag.current.width + event.clientX - drag.current.x); }}
    onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => {
      const delta = event.shiftKey ? 40 : 10;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault(); panel.setWidth(panel.width + (event.key === "ArrowRight" ? delta : -delta));
      } else if (event.key === "Home") { event.preventDefault(); panel.setWidth(260); }
      else if (event.key === "End") { event.preventDefault(); panel.setWidth(640); }
    }}><span className="h-12 w-1 rounded bg-slate-400/70" /></div>;
}
