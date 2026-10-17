import React, { useEffect, useRef, useState } from "react";
import { X, ChevronRight, ChevronLeft, GripHorizontal } from "lucide-react";

interface DraggablePanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
  defaultPosition?: { x: number; y: number };
  defaultWidth?: number;
  className?: string;
  isDocked?: boolean;
  onDockToggle?: () => void;
}

/**
 * Desktop: draggable, resizable and dockable analytics inspector.
 * Mobile: accessible bottom sheet with its own scrolling surface.
 *
 * Results live in the parent page, so closing the inspector never discards
 * previously computed layers or statistics.
 */
export default function DraggablePanel({
  title,
  icon,
  children,
  onClose,
  defaultPosition = { x: 16, y: 16 },
  defaultWidth = 340,
  className = "",
  isDocked = false,
  onDockToggle,
}: DraggablePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const manuallyMoved = useRef(false);
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [pos, setPos] = useState(defaultPosition);
  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posStartX: 0, posStartY: 0 });
  const resizeStart = useRef({ x: 0, widthStart: 0 });

  useEffect(() => {
    const onResize = () => {
      setMobile(window.innerWidth < 768);
      const parent = panelRef.current?.parentElement;
      if (!parent) return;
      // A previously dragged inspector must not be stranded offscreen after
      // a desktop resize or a phone rotating into landscape.
      setPos(prev => ({
        x: Math.max(0, Math.min(prev.x, parent.clientWidth - Math.min(width, parent.clientWidth) - 8)),
        y: Math.max(0, Math.min(prev.y, parent.clientHeight - 48)),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width]);

  useEffect(() => {
    if (mobile) {
      setDragging(false);
      setResizing(false);
      return;
    }
    function onMouseMove(event: MouseEvent) {
      const parent = panelRef.current?.parentElement;
      if (!parent) return;
      if (dragging && !isDocked) {
        const nextX = dragStart.current.posStartX + event.clientX - dragStart.current.x;
        const nextY = dragStart.current.posStartY + event.clientY - dragStart.current.y;
        setPos({
          x: Math.max(8, Math.min(parent.clientWidth - width - 8, nextX)),
          y: Math.max(8, Math.min(parent.clientHeight - 48, nextY)),
        });
      }
      if (resizing) {
        const delta = event.clientX - resizeStart.current.x;
        const requested = resizeStart.current.widthStart + (isDocked ? -delta : delta);
        setWidth(Math.max(260, Math.min(600, parent.clientWidth - 16, requested)));
      }
    }
    const onMouseUp = () => {
      setDragging(false);
      setResizing(false);
    };
    if (dragging || resizing) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, resizing, isDocked, width, mobile]);

  const style: React.CSSProperties = mobile
    ? {
        position: "absolute",
        insetInline: 0,
        bottom: 0,
        width: "100%",
        maxHeight: "min(78dvh, calc(100% - 12px))",
        zIndex: 710,
      }
    : isDocked
      ? {
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: `min(${width}px, 55%)`,
          minHeight: 0,
          zIndex: 700,
        }
      : {
          position: "absolute",
          top: manuallyMoved.current ? pos.y : 12,
          ...(manuallyMoved.current ? { left: pos.x } : { right: 12 }),
          width: `min(${width}px, calc(100% - 24px))`,
          maxHeight: "calc(100% - 24px)",
          minHeight: 0,
          zIndex: 700,
        };

  return (
    <section
      ref={panelRef}
      aria-label={title}
      data-testid="geo-analysis-results-panel"
      className={`pointer-events-auto flex min-h-0 flex-col overflow-hidden glass-panel shadow-2xl transition-shadow ${
        mobile ? "rounded-t-2xl border-t border-slate-200 dark:border-slate-700" :
        isDocked ? "rounded-none border-l border-slate-200/50 dark:border-slate-800" :
        "rounded-2xl"
      } ${className}`}
      style={style}
    >
      <div
        className={`flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 dark:border-slate-800 sm:px-4 ${
          !isDocked && !mobile ? "cursor-move" : ""
        }`}
        onMouseDown={event => {
          if (mobile || isDocked || (event.target as HTMLElement).closest("button")) return;
          const panel = panelRef.current;
          if (!panel) return;
          manuallyMoved.current = true;
          setDragging(true);
          dragStart.current = {
            x: event.clientX,
            y: event.clientY,
            posStartX: panel.offsetLeft,
            posStartY: panel.offsetTop,
          };
          setPos({ x: panel.offsetLeft, y: panel.offsetTop });
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {mobile && <GripHorizontal size={16} className="shrink-0 text-slate-400" aria-hidden="true" />}
          {icon}
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onDockToggle && !mobile && (
            <button
              type="button"
              onClick={event => { event.stopPropagation(); onDockToggle(); }}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"
              title={isDocked ? "Desencaixar painel" : "Encaixar painel à direita"}
              aria-label={isDocked ? "Desencaixar painel" : "Encaixar painel à direita"}
            >
              {isDocked ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={event => { event.stopPropagation(); onClose(); }}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
              title="Ocultar painel (os resultados permanecem no mapa)"
              aria-label="Ocultar painel de análise"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      <div
        tabIndex={0}
        aria-label={`Conteúdo e estatísticas: ${title}`}
        data-testid="geo-analysis-results-scroll"
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth px-0 pb-[env(safe-area-inset-bottom)] [scrollbar-gutter:stable]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {children}
      </div>
      {!mobile && (
        <div
          className={`absolute bottom-0 top-0 z-[710] w-2 cursor-col-resize transition-colors hover:bg-sky-500/20 ${
            isDocked ? "-ml-1 left-0" : "-mr-1 right-0"
          }`}
          role="separator"
          aria-label="Redimensionar painel de resultados"
          onMouseDown={event => {
            event.stopPropagation();
            setResizing(true);
            resizeStart.current = { x: event.clientX, widthStart: width };
          }}
        />
      )}
    </section>
  );
}
