import React, { useState, useEffect, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, Play, Pause, Compass, Layers,
  MapPin, CheckCircle2, Sparkles, BarChart2, Plus, Trash2, Download,
  Maximize2, Minimize2, Target, Mountain, Droplets, Flame
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface StorySlide {
  id: string;
  title: string;
  subtitle: string;
  chapter: string;
  narrative: string;
  center: [number, number]; // [lat, lng]
  zoom: number;
  pitch?: number;
  bearing?: number;
  activeLayerId?: string;
  metrics?: { label: string; value: string; unit?: string }[];
  recommendation?: string;
}

const DEFAULT_STORY_SLIDES: StorySlide[] = [
  {
    id: "slide-1",
    chapter: "1. Enquadramento Regional",
    title: "Concessão Mineira & Contexto Tectónico",
    subtitle: "Cinturão de Moçambique · Província de Cabo Delgado",
    narrative:
      "A área de estudo localiza-se no Complexo de Lurio/Xixano, uma das províncias geológicas mais promissoras de África Oriental para grafite de alta pureza, vanádio e gemas. A concessão cobre uma área de 14.250 hectares sobre gnaisses e xistos metamórficos de fácies anfibolítica a granulítica.",
    center: [-13.0, 39.5],
    zoom: 8,
    pitch: 30,
    metrics: [
      { label: "Área Total", value: "142.5", unit: "km²" },
      { label: "Litologia", value: "Gnaisses & Xistos" },
      { label: "Status Licença", value: "Prospecção Ativa" },
    ],
    recommendation: "Priorizar amostragem de solos ao longo do eixo de contacto litológico NW-SE.",
  },
  {
    id: "slide-2",
    chapter: "2. Geologia Estrutural",
    title: "Lineamentos Topográficos & Falhas Rúpteis",
    subtitle: "DEM Copernicus GLO-30 (30m) · Filtro Direcional Sobel/Canny",
    narrative:
      "A extração automatizada de lineamentos revelou um padrão estrutural bimodal com direções preferenciais N30W e N60E. Estas zonas de cisalhamento correspondem aos condutores primários de fluidos hidrotermais mineralizantes e controlam a acumulação de sulfetos e grafite escamosa.",
    center: [-13.25, 39.65],
    zoom: 10,
    pitch: 45,
    metrics: [
      { label: "Densidade Falhas", value: "2.4", unit: "km/km²" },
      { label: "Estruturas Mapeadas", value: "128", unit: "falhas" },
      { label: "Cisalhamento", value: "Dextral NW-SE" },
    ],
    recommendation: "Cruzar intersecções de falhas com anomalias aeromagnéticas para localização de alvos de perfuração.",
  },
  {
    id: "slide-3",
    chapter: "3. Sensoriamento Remoto GEE",
    title: "Assinatura Espectral & Alteração Hidrotermal",
    subtitle: "Sentinel-2 MSI · Razões de Bandas SWIR/NIR",
    narrative:
      "A análise multiespectral calibrada no Google Earth Engine detectou halos intensos de alteração sericítica/argílica e óxidos de ferro (hematite/goethite). As anomalias de BSI (Bare Soil Index) e razão B11/B12 confirmam a exposição de horizontes meteorizados mineralizados.",
    center: [-13.22, 39.7],
    zoom: 12,
    pitch: 50,
    metrics: [
      { label: "Anomalia Fe-Oxide", value: "Alta", unit: "> 1.85" },
      { label: "Argilas / Sericite", value: "Forte", unit: "B11/B12" },
      { label: "Cenas S-2 Calibradas", value: "24", unit: "cenas" },
    ],
    recommendation: "Executar trincheiras de exploração nos picos de anomalia espectral para validação geoquímica.",
  },
  {
    id: "slide-4",
    chapter: "4. Hidrogeologia & Ambiente",
    title: "Potencial Aquífero (GWP) & Risco de Erosão",
    subtitle: "Modelo AHP HidroGeoMoz & Equação RUSLE",
    narrative:
      "A modelagem hidrogeológica aponta recarga potencial moderada a alta nas planícies aluvionares adjacentes, garantindo disponibilidade de água para futuras operações de processamento mineral. O mapa de risco RUSLE sinaliza zonas de vertente íngreme suscetíveis a erosão laminar.",
    center: [-13.18, 39.6],
    zoom: 11,
    pitch: 35,
    metrics: [
      { label: "GWP Médio", value: "68", unit: "/100" },
      { label: "Erosão RUSLE", value: "Moderada", unit: "12 t/ha/ano" },
      { label: "Vulnerabilidade", value: "Baixa a Média" },
    ],
    recommendation: "Implantar bacias de sedimentação nas drenagens a jusante para salvaguarda ambiental.",
  },
  {
    id: "slide-5",
    chapter: "5. Alvos de Prospecção",
    title: "Targeting AI & Recomendação de Sondagem",
    subtitle: "Modelo Multi-Critério Ponderado por Inteligência Artificial",
    narrative:
      "A integração convergente de dados geológicos, estruturais, espectrais e topográficos gerou 3 alvos de classe mundial (Alvo Alpha, Beta e Gamma). O Alvo Alpha apresenta score de favorabilidade de 94/100 com espessura estimada de horizonte mineralizado superior a 40 metros.",
    center: [-13.21, 39.68],
    zoom: 13,
    pitch: 60,
    metrics: [
      { label: "Alvos Prioritários", value: "3", unit: "locações" },
      { label: "Score Favorabilidade", value: "94.2", unit: "/100" },
      { label: "Furos Recomendados", value: "12", unit: "sondagens" },
    ],
    recommendation: "Iniciar campanha de sondagem diamantada com 1.500 metros no Alvo Alpha na próxima janela seca.",
  },
];

interface StoryMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFlyTo?: (lat: number, lng: number, zoom: number, pitch?: number) => void;
}

export default function StoryMapModal({
  open,
  onOpenChange,
  onFlyTo,
}: StoryMapModalProps) {
  const [slides, setSlides] = useState<StorySlide[]>(DEFAULT_STORY_SLIDES);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const activeSlide = slides[currentIndex];

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % slides.length);
  }, [slides.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  // Sync map camera on slide change
  useEffect(() => {
    if (activeSlide && onFlyTo) {
      onFlyTo(activeSlide.center[0], activeSlide.center[1], activeSlide.zoom, activeSlide.pitch);
    }
  }, [activeSlide, onFlyTo]);

  // Auto-play presentation timer
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      handleNext();
    }, 8000);
    return () => clearInterval(timer);
  }, [isPlaying, handleNext]);

  // Keyboard navigation (Arrow keys, Space, Esc)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleNext, handlePrev]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isFullscreen ? "max-w-[98vw] h-[95vh]" : "max-w-4xl max-h-[85vh]"} p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-all duration-200`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  Modo Apresentação Executivo (StoryMap)
                </h3>
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                  Slide {currentIndex + 1} de {slides.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Narrativa geocientífica interativa para relatórios de investimento e reuniões técnicas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsPlaying(v => !v)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                isPlaying
                  ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                  : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200"
              }`}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlaying ? "Pausar" : "Apresentar"}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(v => !v)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Chapter badge & title */}
          <div>
            <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
              {activeSlide.chapter}
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
              {activeSlide.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {activeSlide.subtitle}
            </p>
          </div>

          {/* Key Quantitative Metrics */}
          {activeSlide.metrics && (
            <div className="grid grid-cols-3 gap-3">
              {activeSlide.metrics.map((m, i) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{m.label}</div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5 font-mono">
                    {m.value} {m.unit && <span className="text-xs font-normal text-slate-400">{m.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Narrative description */}
          <div className="bg-sky-50/40 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Compass size={14} className="text-sky-500" />
              <span>Análise Técnica & Evidências Geológicas</span>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {activeSlide.narrative}
            </p>
          </div>

          {/* Recommendation / Operational Action */}
          {activeSlide.recommendation && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3 flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                  Recomendação de Campo & Sondagem:
                </span>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {activeSlide.recommendation}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-2">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                title={s.title}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  currentIndex === idx
                    ? "w-8 bg-sky-500"
                    : "w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Anterior</span>
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-xs font-bold text-white transition-colors shadow-xs cursor-pointer"
            >
              <span>Próximo</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
