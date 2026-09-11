import React, { useState } from "react";
import { GOOGLE_BASEMAPS, BasemapType } from "@/lib/basemaps";
import { Layers } from "lucide-react";

interface BasemapSwitcherProps {
  current: BasemapType;
  onChange: (type: BasemapType) => void;
  className?: string;
}

export default function BasemapSwitcher({ current, onChange, className = "" }: BasemapSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 hover:border-slate-300 shadow-md rounded-xl text-xs font-semibold text-slate-700 hover:text-sky-600 transition-all pointer-events-auto"
        title="Alternar Basemap do Google Maps"
      >
        <Layers size={14} className="text-sky-600" />
        <span className="hidden sm:inline">{GOOGLE_BASEMAPS[current].icon} {GOOGLE_BASEMAPS[current].label}</span>
        <span className="sm:hidden">{GOOGLE_BASEMAPS[current].icon}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 p-1.5 bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-2xl flex flex-col gap-1 z-[700] min-w-[160px] pointer-events-auto animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Google Maps Basemaps
          </div>
          {(Object.keys(GOOGLE_BASEMAPS) as BasemapType[]).map((key) => {
            const item = GOOGLE_BASEMAPS[key];
            const active = current === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors text-left ${
                  active
                    ? "bg-sky-50 text-sky-700 font-semibold border border-sky-200/60"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="text-sm">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
