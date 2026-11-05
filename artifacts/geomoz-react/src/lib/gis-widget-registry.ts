/** GeoMoz GIS Widget registry. MapGIS-inspired architecture, independently implemented. */
export interface GISWidgetContext {
  mapId: string;
  layerId?: string;
}
export interface GISWidgetDefinition {
  id: string;
  title: string;
  category: "vector" | "raster" | "analysis" | "terrain" | "general";
  description: string;
  order?: number;
  enabled?: (context: GISWidgetContext) => boolean;
  /** Lazy module loader. Widget modules are loaded only on activation. */
  load: () => Promise<unknown>;
}
export class GISWidgetRegistry {
  private readonly widgets = new Map<string, GISWidgetDefinition>();
  register(widget: GISWidgetDefinition): () => void {
    if (!/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(widget.id)) throw new Error("ID de widget inválido.");
    if (this.widgets.has(widget.id)) throw new Error(`Widget duplicado: ${widget.id}`);
    this.widgets.set(widget.id, widget);
    return () => { if (this.widgets.get(widget.id) === widget) this.widgets.delete(widget.id); };
  }
  list(context: GISWidgetContext, category?: GISWidgetDefinition["category"]): GISWidgetDefinition[] {
    return [...this.widgets.values()].filter(widget =>
      (!category || widget.category === category) && (widget.enabled?.(context) ?? true)
    ).sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title));
  }
  get(id: string): GISWidgetDefinition | undefined { return this.widgets.get(id); }
  async activate(id: string, context: GISWidgetContext): Promise<unknown> {
    const widget = this.widgets.get(id);
    if (!widget) throw new Error(`Widget não encontrado: ${id}`);
    if (widget.enabled && !widget.enabled(context)) throw new Error("Widget indisponível neste contexto.");
    return widget.load();
  }
}
export const gisWidgetRegistry = new GISWidgetRegistry();
gisWidgetRegistry.register({
  id: "feature-inspector", title: "Inspeccionar feição", category: "vector",
  description: "Consulta e exportação dos atributos de uma feição seleccionada.",
  order: 10, enabled: context => Boolean(context.layerId),
  load: () => import("./gis-feature-inspector"),
});
