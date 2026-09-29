import React, { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Play, Pause, Sparkles, Download,
  Maximize2, Minimize2, Share2, CheckCircle2, BarChart2, Layers,
  Compass, FileText, Globe
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

export interface StorySlide {
  id: string;
  chapter: string;
  title: string;
  subtitle: string;
  narrative: string;
  center?: [number, number]; // [lat, lng]
  zoom?: number;
  pitch?: number;
  metrics?: { label: string; value: string; unit?: string }[];
  recommendation?: string;
}

export interface DynamicAnalysisContext {
  analysisId: string;
  analysisTitle: string;
  analysisSubtitle?: string;
  category?: string;
  province?: string | null;
  district?: string | null;
  aoiLabel?: string;
  source?: string;
  dateRange?: string;
  cloudPct?: number;
  formula?: string;
  bands?: string;
  interpretation?: string;
  stats?: {
    areaKm2?: number | null;
    mean?: number | null;
    median?: number | null;
    stdDev?: number | null;
    p10?: number | null;
    p90?: number | null;
    p95?: number | null;
    min?: number | null;
    max?: number | null;
    sampleCount?: number | null;
  };
  center?: [number, number];
  zoom?: number;
}

export interface StoryMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFlyTo?: (lat: number, lng: number, zoom: number, pitch?: number) => void;
  context?: DynamicAnalysisContext | null;
  slides?: StorySlide[];
}

function buildDynamicSlides(ctx: DynamicAnalysisContext): StorySlide[] {
  const loc = ctx.aoiLabel || (ctx.district ? `${ctx.district}, ${ctx.province}` : ctx.province || "Moçambique");
  const stats = ctx.stats || {};
  const latLng = ctx.center || [-18.665695, 35.529562];
  const zoom = ctx.zoom || 7;

  return [
    {
      id: "slide-1",
      chapter: "1. Enquadramento Territorial",
      title: `Área de Estudo: ${loc}`,
      subtitle: `${ctx.source || "Sentinel-2 MSI (Copernicus)"} · ${ctx.dateRange || "Composição Recente"}`,
      narrative: `A presente análise foi processada no Google Earth Engine sobre o território de ${loc}. A área de interesse foi recortada com filtro de nuvens restrito a ${ctx.cloudPct ?? 30}%, garantindo pureza radiométrica e máxima fidelidade de superfície.`,
      center: latLng,
      zoom,
      metrics: [
        { label: "Área de Análise", value: stats.areaKm2 ? stats.areaKm2.toFixed(1) : "Recorte", unit: stats.areaKm2 ? "km²" : "" },
        { label: "Satélite / Sensor", value: ctx.source?.split("·")[0]?.trim() || "Sentinel-2" },
        { label: "Nuvens Máx.", value: `${ctx.cloudPct ?? 30}%` },
      ],
      recommendation: "Validar o alinhamento com a cartografia municipal e delimitações administrativas oficiais.",
    },
    {
      id: "slide-2",
      chapter: "2. Metodologia & Fundamento Físico",
      title: ctx.analysisTitle,
      subtitle: ctx.formula ? `Fórmula: ${ctx.formula}` : "Metodologia Multiespectral Calibrada",
      narrative: `A modelagem fundamenta-se nas propriedades espectrais das bandas ${ctx.bands || "NIR e SWIR"}. O cálculo de ${ctx.analysisTitle} isola o contraste físico do alvo mitigando ruídos de solo, aerossóis e sombras topográficas.`,
      center: latLng,
      zoom: zoom + 1,
      metrics: [
        { label: "Fórmula", value: ctx.formula || "Normalizada" },
        { label: "Bandas Utilizadas", value: ctx.bands || "NIR / SWIR" },
        { label: "Resolução Espacial", value: "10–20 m" },
      ],
      recommendation: "Utilizar os comprimentos de onda de infravermelho para discriminar alvos com assinatura espectral similar.",
    },
    {
      id: "slide-3",
      chapter: "3. Estatísticas Zonais no Recorte",
      title: "Distribuição Quantitativa no Recorte",
      subtitle: "Métricas Zonais: Média, Mediana e Dispersão",
      narrative: `A amostragem quantitativa revela uma média ponderada de ${stats.mean != null ? stats.mean.toFixed(3) : "—"} (desvio padrão σ = ${stats.stdDev != null ? stats.stdDev.toFixed(3) : "—"}). Os percentis P10 (${stats.p10 != null ? stats.p10.toFixed(2) : "—"}) e P90 (${stats.p90 != null ? stats.p90.toFixed(2) : "—"}) delimitam a variação mais representativa da área.`,
      center: latLng,
      zoom: zoom + 1,
      metrics: [
        { label: "Média (μ)", value: stats.mean != null ? stats.mean.toFixed(3) : "—" },
        { label: "Mediana (P50)", value: stats.median != null ? stats.median.toFixed(3) : "—" },
        { label: "Desvio (σ)", value: stats.stdDev != null ? stats.stdDev.toFixed(3) : "—" },
        { label: "P90", value: stats.p90 != null ? stats.p90.toFixed(2) : "—" },
      ],
      recommendation: "Focar inspeções em campo nas feições que se situem nos extremos da distribuição (> P90 ou < P10).",
    },
    {
      id: "slide-4",
      chapter: "4. Interpretação Geocientífica",
      title: "Diagnóstico Territorial & Comportamento",
      subtitle: "Síntese Técnica e Aplicação Prática",
      narrative: ctx.interpretation || "A distribuição espacial do índice reflete as características biofísicas, hidrológicas e de relevo do território, permitindo intervenções direcionadas com alta acurácia espacial.",
      center: latLng,
      zoom: zoom + 2,
      metrics: [
        { label: "Classificação", value: ctx.category || "Análise Geoespacial" },
        { label: "Precisão", value: "10 m (Pixel)" },
        { label: "Nível de Ruído", value: "Atenuado (GEE)" },
      ],
      recommendation: "Cruzar estes resultados com as camadas de hidrografia e hipsometria para diagnóstico integrado.",
    },
    {
      id: "slide-5",
      chapter: "5. Conclusão Executiva",
      title: "Recomendações Técnicas & Decisão",
      subtitle: "Diretrizes de Ação e Suporte à Decisão",
      narrative: `Os dados gerados pelo GeoMoz Explorer oferecem base técnica sólida para planeamento estratégico em ${loc}. Recomenda-se a integração dos resultados com equipas de terreno e a emissão de relatórios oficiais para salvaguarda e investimento.`,
      center: latLng,
      zoom,
      metrics: [
        { label: "Status da Análise", value: "Concluída" },
        { label: "Fiabilidade dos Dados", value: "Alta (Copernicus/GEE)" },
        { label: "Próxima Etapa", value: "Ação de Campo" },
      ],
      recommendation: "Partilhar este sumário com os intervenientes de projeto e arquivar no dossiê técnico.",
    },
  ];
}

export default function StoryMapModal({
  open,
  onOpenChange,
  onFlyTo,
  context,
  slides: customSlides,
}: StoryMapModalProps) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Compute slides dynamically from context if provided, else fallback to custom or default
  const slides = React.useMemo(() => {
    if (context) return buildDynamicSlides(context);
    if (customSlides && customSlides.length > 0) return customSlides;
    return [];
  }, [context, customSlides]);

  const activeSlide = slides[currentIndex] || slides[0];

  const handleNext = useCallback(() => {
    if (!slides.length) return;
    setCurrentIndex(prev => (prev + 1) % slides.length);
  }, [slides.length]);

  const handlePrev = useCallback(() => {
    if (!slides.length) return;
    setCurrentIndex(prev => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  // Sync map camera on slide change (only when modal is actively open)
  useEffect(() => {
    if (!open) return;
    if (activeSlide?.center && onFlyTo) {
      onFlyTo(activeSlide.center[0], activeSlide.center[1], activeSlide.zoom ?? 10, activeSlide.pitch ?? 0);
    }
  }, [open, activeSlide, onFlyTo]);

  // Auto-play presentation timer (only when playing and modal is open)
  useEffect(() => {
    if (!isPlaying || !open) return;
    const timer = setInterval(() => {
      handleNext();
    }, 8000);
    return () => clearInterval(timer);
  }, [isPlaying, open, handleNext]);

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

  // Copy shareable link to clipboard
  const handleShareLink = () => {
    const url = new URL(window.location.origin + "/analises");
    if (context?.analysisId) url.searchParams.set("index", context.analysisId);
    if (context?.province) url.searchParams.set("province", context.province);
    if (context?.district) url.searchParams.set("district", context.district);
    navigator.clipboard.writeText(url.toString());
    toast({
      title: "Link da Análise Copiado!",
      description: "O link com os parâmetros desta análise foi copiado para a área de transferência.",
    });
  };

  // Generate and download multi-slide PDF presentation
  const handleExportPdf = () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = 297;
      const pageH = 210;

      slides.forEach((s, idx) => {
        if (idx > 0) doc.addPage();

        // Dark banner header
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(0, 0, pageW, 35, "F");

        // Brand & Title
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("GEOMOZ EXPLORER — RELATÓRIO EXECUTIVO", 16, 14);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(`${s.chapter} | Slide ${idx + 1} de ${slides.length}`, 16, 24);

        // Slide Main Title
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text(s.title, 16, 52);

        doc.setFont("helvetica", "italic");
        doc.setFontSize(11);
        doc.setTextColor(100, 116, 139);
        doc.text(s.subtitle, 16, 60);

        // Narrative Box
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(16, 70, pageW - 32, 45, 3, 3, "F");
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(16, 70, pageW - 32, 45, 3, 3, "S");

        doc.setTextColor(51, 65, 85);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const splitText = doc.splitTextToSize(s.narrative, pageW - 44);
        doc.text(splitText, 22, 82);

        // Metrics Table / Cards
        if (s.metrics && s.metrics.length > 0) {
          const cardW = (pageW - 32 - (s.metrics.length - 1) * 8) / s.metrics.length;
          s.metrics.forEach((m, mIdx) => {
            const cardX = 16 + mIdx * (cardW + 8);
            doc.setFillColor(241, 245, 249);
            doc.roundedRect(cardX, 125, cardW, 30, 2, 2, "F");

            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text(m.label.toUpperCase(), cardX + 8, 135);

            doc.setTextColor(14, 116, 144); // cyan-700
            doc.setFontSize(14);
            doc.text(`${m.value} ${m.unit || ""}`, cardX + 8, 147);
          });
        }

        // Recommendation Box
        if (s.recommendation) {
          doc.setFillColor(254, 243, 199); // amber-100
          doc.roundedRect(16, 165, pageW - 32, 22, 2, 2, "F");
          doc.setDrawColor(245, 158, 11);
          doc.roundedRect(16, 165, pageW - 32, 22, 2, 2, "S");

          doc.setTextColor(180, 83, 9);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text("RECOMENDAÇÃO TÉCNICA:", 22, 174);

          doc.setFont("helvetica", "normal");
          doc.setTextColor(120, 53, 15);
          doc.text(s.recommendation, 22, 181);
        }

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`GeoMoz Explorer · Inteligência Geoespacial Planetária · Gerado a ${new Date().toLocaleDateString("pt-PT")}`, 16, pageH - 8);
      });

      const fileName = `GeoMoz_Apresentacao_${context?.analysisId || "Analise"}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
      toast({
        title: "Apresentação PDF Gerada!",
        description: `O ficheiro ${fileName} foi descarregado com sucesso.`,
      });
    } catch (err) {
      console.error("PDF export error:", err);
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar a apresentação PDF.",
        variant: "destructive",
      });
    }
  };

  if (!activeSlide) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isFullscreen ? "max-w-[98vw] h-[95vh]" : "max-w-4xl max-h-[88vh]"} p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-all duration-200`}>
        {/* Header with Title and Share / Download actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                  Apresentação Executiva: {context?.analysisTitle || "Análise Geoespacial"}
                </h3>
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 shrink-0">
                  Slide {currentIndex + 1} de {slides.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {activeSlide.chapter} · {context?.aoiLabel || context?.province || "Moçambique"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Share Link Button */}
            <button
              type="button"
              onClick={handleShareLink}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
              title="Copiar link direto para esta análise"
            >
              <Share2 size={13} />
              <span className="hidden sm:inline">Partilhar Link</span>
            </button>

            {/* Download PDF Presentation */}
            <button
              type="button"
              onClick={handleExportPdf}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              title="Descarregar apresentação completa em PDF"
            >
              <Download size={13} />
              <span className="hidden sm:inline">PDF</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen(v => !v)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isFullscreen ? "Sair de tela cheia" : "Tela cheia"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {/* Slide Content Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5 bg-white dark:bg-slate-900">
          {/* Chapter & Title */}
          <div>
            <div className="text-xs font-extrabold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Compass size={13} />
              <span>{activeSlide.chapter}</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              {activeSlide.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {activeSlide.subtitle}
            </p>
          </div>

          {/* Key Metrics Cards */}
          {activeSlide.metrics && activeSlide.metrics.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {activeSlide.metrics.map((m, idx) => (
                <div key={idx} className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {m.label}
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 font-mono truncate">
                    {m.value} {m.unit && <span className="text-xs font-normal text-slate-500">{m.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Narrative Content */}
          <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText size={13} className="text-indigo-500" />
              <span>Análise Técnica & Evidências</span>
            </h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {activeSlide.narrative}
            </p>
          </div>

          {/* Strategic Recommendation */}
          {activeSlide.recommendation && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                  Recomendação Técnica:
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                  {activeSlide.recommendation}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 shrink-0">
          {/* Play/Pause Presentation */}
          <button
            type="button"
            onClick={() => setIsPlaying(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              isPlaying
                ? "bg-amber-500 text-white border-amber-500"
                : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            <span>{isPlaying ? "Pausar" : "Apresentar"}</span>
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center gap-1.5">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  currentIndex === idx
                    ? "w-6 bg-sky-600 dark:bg-sky-400"
                    : "w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400"
                }`}
                title={`Ir para o slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Prev / Next Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Slide anterior (Seta esquerda)"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Próximo slide (Seta direita ou Espaço)"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
