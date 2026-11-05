import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GISWorkspaceMapLibre from '../GISWorkspaceMapLibre';
const mock = vi.hoisted(() => ({map: null as any}));
vi.mock('@/lib/gis-raster', () => ({syncGISWorkspaceRasters: vi.fn()}));
vi.mock('@/lib/gis-data-sources', () => ({syncGISWorkspaceServiceLayers: vi.fn()}));
vi.mock('maplibre-gl', () => ({
  NavigationControl: class {}, ScaleControl: class {},
  Map: class {
    listeners: Record<string, Function[]> = {};
    sources: Record<string, any> = {};
    layers: Record<string, any> = {};
    doubleClickZoom = {enable: vi.fn(), disable: vi.fn()};
    canvas = document.createElement('canvas');
    constructor() { mock.map = this; }
    on(event: string, cb: Function) { (this.listeners[event] ??= []).push(cb); }
    once(event: string, cb: Function) { this.on(event, cb); }
    emit(event: string, data = {}) { this.listeners[event]?.forEach(cb => cb(data)); }
    // Imagery can still be loading after style.load. Drawing must remain usable.
    isStyleLoaded() { return false; }
    addSource(id: string, source: any) { this.sources[id] = {...source, setData: vi.fn((data: any) => {this.sources[id].data = data;})}; }
    getSource(id: string) { return this.sources[id]; }
    addLayer(layer: any) { this.layers[layer.id] = layer; }
    getLayer(id: string) { return this.layers[id]; }
    getStyle() { return {sources: this.sources}; }
    setStyle() { this.sources = {}; this.layers = {}; }
    getCanvas() { return this.canvas; }
    project(coords: [number, number]) { return { x: coords[0] * 2 + 200, y: coords[1] * -2 + 100 }; }
    moveLayer(id: string) { this.moveCalls.push(id); }
    moveCalls: string[] = [];
    addControl() {} remove() {} resize() {}
  },
}));
afterEach(cleanup);
function setup() {
  const complete = vi.fn(), cancel = vi.fn();
  const view = render(<GISWorkspaceMapLibre layers={[]} basemap="terrain" drawingEnabled onDrawComplete={complete} onDrawCancel={cancel} />);
  act(() => mock.map.emit('style.load'));
  const click = (lng: number, lat: number) => act(() => mock.map.emit('click', {lngLat: {lng, lat}}));
  return {complete, cancel, click, ...view};
}
describe('GIS AOI drawing', () => {
  it('shows the first vertex and second edge while imagery is loading; finishes with a button', () => {
    const {click, complete, rerender} = setup();
    const finish = screen.getByRole('button', {name: 'Concluir área'});
    expect(finish).toBeDisabled();
    click(32, -25);
    expect(mock.map.getSource('__geomoz_draw').data.features[0].geometry.type).toBe('Point');
    expect(screen.getByRole('status')).toHaveTextContent('1 ponto');
    expect(screen.getByTestId('gis-aoi-visible-overlay')).toBeInTheDocument();
    expect(screen.getAllByTestId('gis-aoi-drawing-vertex')).toHaveLength(1);
    click(33, -25);
    expect(mock.map.getSource('__geomoz_draw').data.features[0].geometry.type).toBe('LineString');
    expect(screen.getAllByTestId('gis-aoi-drawing-vertex')).toHaveLength(2);
    expect(screen.getByTestId('gis-aoi-drawing-path').getAttribute('d')).toContain(' L');
    click(33, -24);
    expect(finish).toBeEnabled();
    expect(screen.getAllByTestId('gis-aoi-drawing-vertex')).toHaveLength(3);
    expect(screen.getByTestId('gis-aoi-drawing-path').getAttribute('d')).toContain('Z');
    fireEvent.click(finish);
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][0]).toEqual({type: 'Polygon', coordinates: [[[32,-25],[33,-25],[33,-24],[32,-25]]]});
    rerender(<GISWorkspaceMapLibre layers={[]} basemap="terrain" drawingEnabled={false} aoiGeometry={complete.mock.calls[0][0]} />);
    expect(mock.map.getSource('__geomoz_aoi').data.type).toBe('Polygon');
    expect(screen.getByTestId('gis-aoi-visible-overlay').querySelector('path')).toHaveAttribute('stroke', '#fb7185');
    expect(mock.map.moveCalls).toContain('__geomoz_draw_points');
    // A delayed double-click cannot finish the same polygon twice.
    act(() => mock.map.emit('dblclick', {preventDefault: vi.fn()}));
    expect(complete).toHaveBeenCalledOnce();
  });
  it('supports undo and cancel without changing the selected AOI', () => {
    const {click, complete, cancel} = setup();
    click(32, -25); click(33, -25); click(33, -24);
    fireEvent.click(screen.getByText('Desfazer ponto'));
    expect(screen.getByRole('button', {name: 'Concluir área'})).toBeDisabled();
    fireEvent.click(screen.getByText('Cancelar desenho'));
    expect(cancel).toHaveBeenCalledOnce(); expect(complete).not.toHaveBeenCalled();
    expect(mock.map.getSource('__geomoz_draw').data.features).toEqual([]);
    expect(screen.queryByTestId('gis-aoi-visible-overlay')).toBeNull();
  });
  it('reprojects the visible polygon on map move and keeps it above map imagery', () => {
    const { click } = setup();
    click(32, -25);
    click(33, -25);
    click(33, -24);
    const shape = screen.getByTestId('gis-aoi-drawing-path');
    const prior = shape.getAttribute('d');
    mock.map.project = ([lng, lat]: [number, number]) => ({ x: lng * 3 + 300, y: lat * -3 + 120 });
    act(() => mock.map.emit('move'));
    expect(screen.getByTestId('gis-aoi-drawing-path').getAttribute('d')).not.toEqual(prior);
    expect(screen.getAllByTestId('gis-aoi-drawing-vertex')).toHaveLength(3);
    expect(mock.map.moveCalls).toContain('__geomoz_draw_line');
  });

  it('keeps double-click completion and explains an invalid area', () => {
    const {click, complete} = setup();
    click(32, -25); click(33, -25); click(34, -25);
    fireEvent.click(screen.getByText('Concluir área'));
    expect(screen.getByRole('alert')).toHaveTextContent('formar uma área');
    expect(complete).not.toHaveBeenCalled();
    click(34, -24);
    act(() => mock.map.emit('dblclick', {preventDefault: vi.fn()}));
    expect(complete).toHaveBeenCalledOnce();
  });
});
