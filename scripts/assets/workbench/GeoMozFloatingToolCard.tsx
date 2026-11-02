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
 * Mount tool cards alongside the FDSN seismic panel, directly under the owned
 * workspace chrome. Never mount inside the horizontally scrolling ribbon:
 * its overflow clips absolute descendants regardless of their z-index.
 *
 * This also preserves the workspace theme and typography inherited by its
 * descendants (which are lost when a card is portaled straight into body).
 */
export function GeoMozFloatingToolCard({
  title, icon: Icon, open, onToggle, onClose, children, testId,
}: GeoMozFloatingToolCardProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<FlyoutPosition | null>(null);
  // The trigger is always mounted. A portal outside the ribbon but inside the
  // same React tree keeps command state, permission checks and event handlers.
  const chrome = triggerRef.current?.closest<HTMLElement>(".gm-workbench-chrome") ?? null;

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const anchor = triggerRef.current;
      const host = anchor?.closest<HTMLElement>(".gm-workbench-chrome");
      if (!anchor || !host) return;
      const rect = anchor.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      const width = Math.min(440, Math.max(180, window.innerWidth - 24));
      const left = Math.max(12 - bounds.left, Math.min(
        rect.left - bounds.left, window.innerWidth - bounds.left - width - 12,
      ));
      const available = Math.max(120, window.innerHeight - bounds.bottom - 14);
      setPosition({
        position: "absolute",
        top: "calc(100% + 4px)",
        left,
        width,
        maxHeight: Math.min(540, available),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
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
      {open && position && chrome && createPortal(
        <section ref={panelRef} id={id} role="dialog" aria-modal="false"
          aria-label={"Ferramentas: " + title} data-testid="geomoz-tools-flyout"
          className="gm-tool-flyout" style={position}>
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
        </section>, chrome
      )}
    </div>
  );
}
