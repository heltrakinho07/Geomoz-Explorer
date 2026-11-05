import { AlertCircle, CheckCircle2, Crosshair, Layers, Mountain, Upload } from "lucide-react";
import { usePortalTranslation } from "@/i18n/usePortalTranslation";
import { scienceUiText } from "@/i18n/scienceUi";
import type { GISWorkspaceRasterLayer } from "@/lib/gis-raster";
interface Props {
  raster: GISWorkspaceRasterLayer | null;
  layerCount: number;
  results: number;
  busy: boolean;
  error: string | null;
  onImport: () => void;
  onDraw: () => void;
  onTerrain: () => void;
  onLayers: () => void;
}
export default function GISWorkspaceOverview({raster, layerCount, results, busy, error, onImport, onDraw, onTerrain, onLayers}: Props) {
  const { language } = usePortalTranslation();
  const t = (key: import("@/i18n/scienceUi").ScienceUiKey) => scienceUiText(language, key);
  const native = raster?.name.match(/DEM Global · ([\d.]+) m/);
  const resolution = native ? Number(native[1]) : null;
  return <section className="gw-overview" aria-label={t("overview.label")}>
    <div className="gw-eyebrow">{t("overview.territorial")} <span>{t("overview.local")}</span></div>
    <h2>{t("overview.title")}</h2>
    <p>{t("overview.description")}</p>
    <div className="gw-step-grid">
      <button type="button" onClick={onDraw}><Crosshair size={17}/><span><small>{t("overview.area")}</small>{t("overview.draw")}</span></button>
      <button type="button" onClick={onImport}><Upload size={17}/><span><small>{t("overview.data")}</small>{t("overview.import")}</span></button>
      <button type="button" onClick={onTerrain}><Mountain size={17}/><span><small>{t("overview.analysis")}</small>{t("overview.terrain")}</span></button>
    </div>
    <div className="gw-input-card">
      <span>{t("overview.selected")}</span>
      <strong title={raster?.name}>{raster?.name || t("overview.none")}</strong>
      <p>{raster ? `${raster.bandCount ?? "?"} ${t("overview.bands")} · ${raster.sizeBytes ? (raster.sizeBytes / 1048576).toFixed(1) + " MiB" : t("overview.remote")}` : t("overview.importHint")}</p>
      {resolution !== null && <p className={resolution > 100 ? "gw-quality-warning" : ""}>{t("overview.sourceGrid")} {resolution.toFixed(0)} m. {resolution > 100 ? t("overview.lowDetail") : t("overview.resolution")}</p>}
    </div>
    <div className="gw-run-status" role="status">
      {busy ? <><span className="gw-pulse"/> {t("overview.processing")}</> : error ? <><AlertCircle size={16}/> {t("overview.error")}</> : raster ? <><CheckCircle2 size={16}/> {t("overview.ready")}</> : <><Layers size={16}/> {t("overview.start")}</>}
    </div>
    {error && <p role="alert" className="gw-error">{error}</p>}
    <button type="button" onClick={onLayers} className="gw-result-link">{layerCount} {t("overview.layers")} · {results} {t("overview.results")} <span>{t("overview.view")}</span></button>
  </section>;
}
