import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X, type LucideIcon } from "lucide-react";

interface GeoMozFloatingToolCardProps {
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}

type FlyoutPosition = CSSProperties & { maxHeight: number; width: number };

/**
 * Renders tools in a body-level portal, not inside the horizontally scrollable
 * ribbon. An absolute child of an overflow-x:auto ribbon is clipped regardless
 * of z-index. A viewport-positioned portal preserves the actual tool callbacks.
 */
export function GeoMozFloatingToolCard({
  title, icon: Icon, open, onToggle, onClose, children, testId,
}: GeoMozFloatingToolCardProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<FlyoutPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = triggerRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(440, Math.max(0, window.innerWidth - 24));
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const above = spaceBelow < 240 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(80, Math.min(540, (above ? spaceAbove : spaceBelow) - 8));
      setPosition(above
        ? { position: "fixed", left, bottom: window.innerHeight - rect.top + 8, maxHeight, width }
        : { position: "fixed", left, top: rect.bottom + 8, maxHeight, width });
    };
    update();
    window.addEventListener("resize", update);
    // Capture scrolls from the horizontal ribbon as well as the page.
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onClose]);

  return (
    <div className="gm-ribbon-accordion" data-testid={testId}>
      <button ref={triggerRef} type="button" className="gm-ribbon-trigger"
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={onToggle}>
        <Icon size={16} aria-hidden="true" />
        <span>{title}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && position && typeof document !== "undefined" && createPortal(
        <section ref={panelRef} id={id} role="dialog" aria-modal="false"
          aria-label={"Ferramentas: " + title} data-testid="geomoz-tools-flyout"
          className="gm-workbench gm-tool-flyout" style={position}>
          <header className="gm-tool-flyout-header">
            <div>
              <small>GEOMOZ GIS WORKSPACE / FERRAMENTAS</small>
              <h2><Icon size={18} aria-hidden="true" /> {title}</h2>
              <p>Seleccione uma ferramenta para trabalhar com as camadas do projecto.</p>
            </div>
            <button type="button" aria-label={"Fechar " + title} onClick={onClose}>
              <X size={17} aria-hidden="true" />
            </button>
          </header>
          <div className="gm-tool-flyout-grid">{children}</div>
        </section>, document.body
      )}
    </div>
  );
}
