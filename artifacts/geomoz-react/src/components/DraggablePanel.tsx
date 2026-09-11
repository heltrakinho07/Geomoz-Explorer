import React, { useState, useEffect, useRef } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

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

export default function DraggablePanel({
  title,
  icon,
  children,
  onClose,
  defaultPosition = { x: window.innerWidth - 340 - 16, y: 16 },
  defaultWidth = 340,
  className = "",
  isDocked = false,
  onDockToggle,
}: DraggablePanelProps) {
  const [pos, setPos] = useState(defaultPosition);
  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0, posStartX: 0, posStartY: 0 });
  const resizeStart = useRef({ x: 0, widthStart: 0 });

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragging && !isDocked) {
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - width, dragStart.current.posStartX + e.clientX - dragStart.current.x)),
          y: Math.max(0, Math.min(window.innerHeight - 50, dragStart.current.posStartY + e.clientY - dragStart.current.y)),
        });
      }
      if (resizing) {
        if (isDocked) {
          const newWidth = Math.max(250, Math.min(600, resizeStart.current.widthStart + (resizeStart.current.x - e.clientX)));
          setWidth(newWidth);
        } else {
          const newWidth = Math.max(250, Math.min(600, resizeStart.current.widthStart + (e.clientX - resizeStart.current.x)));
          setWidth(newWidth);
        }
      }
    }
    
    function onMouseUp() {
      setDragging(false);
      setResizing(false);
    }
    
    if (dragging || resizing) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, resizing, isDocked, width]);

  const style: React.CSSProperties = isDocked 
    ? { top: 0, right: 0, bottom: 0, width: width }
    : { top: pos.y, left: pos.x, width: width, maxHeight: "calc(100vh - 32px)" };

  return (
    <div
      className={`pointer-events-auto flex flex-col glass-panel shadow-2xl transition-shadow ${
        isDocked ? "rounded-none border-l border-slate-200/50" : "rounded-2xl"
      } ${className}`}
      style={{ position: "absolute", zIndex: 700, ...style }}
    >
      {/* Header / Drag Handle */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0 ${!isDocked ? "cursor-move" : ""}`}
        onMouseDown={(e) => {
          if (isDocked || (e.target as HTMLElement).closest('button')) return;
          setDragging(true);
          dragStart.current = { x: e.clientX, y: e.clientY, posStartX: pos.x, posStartY: pos.y };
        }}
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onDockToggle && (
            <button
              onClick={(e) => { e.stopPropagation(); onDockToggle(); }}
              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
              title={isDocked ? "Desencaixar (Flutuar)" : "Encaixar à Direita"}
            >
              {isDocked ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          )}
          {onClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors"
              title="Fechar painel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </div>

      {/* Resize Handle */}
      <div
        className={`absolute top-0 bottom-0 ${isDocked ? "left-0 -ml-1 cursor-col-resize" : "right-0 -mr-1 cursor-col-resize"} w-2 z-[710] hover:bg-sky-500/20 transition-colors`}
        onMouseDown={(e) => {
          e.stopPropagation();
          setResizing(true);
          resizeStart.current = { x: e.clientX, widthStart: width };
        }}
      />
    </div>
  );
}
