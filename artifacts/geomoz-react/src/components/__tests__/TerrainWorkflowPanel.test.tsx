import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TerrainWorkflowPanel from '../TerrainWorkflowPanel';
import { runTerrainWorkflow } from '@/lib/terrain-workflow-client';
vi.mock('@/hooks/useSubscription',()=>({
  useSubscription:()=>({loading:false,can:()=>false,plan:"community"})
}));
vi.mock('@/lib/api', () => ({apiFetch: vi.fn()}));
vi.mock('@/lib/terrain-workflow-client', () => ({runTerrainWorkflow: vi.fn(), readBoundedDem: vi.fn()}));
vi.mock('@/lib/terrain-report', () => ({downloadTerrainBlob: vi.fn(), exportTerrainPdf: vi.fn(), exportTerrainPng: vi.fn()}));
const props = {aoi: {source: 'global' as const, label: 'Global'}, rasters: [], onComplete: vi.fn(), onShowProduct: vi.fn(), onDraw: vi.fn()};
afterEach(() => { cleanup(); delete window.GeoMozPreferences; vi.clearAllMocks(); });
it('requires a DEM and prevents whole-world Earth Engine requests', async () => {
  render(<TerrainWorkflowPanel {...props} />);
  fireEvent.click(screen.getByText('Executar análise completa'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Seleccione um GeoTIFF');
  fireEvent.change(screen.getByLabelText('Fonte'), {target: {value: 'gee'}});
  fireEvent.click(screen.getByText('Executar análise completa'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Seleccione um distrito');
  expect(runTerrainWorkflow).not.toHaveBeenCalled();
});
it('blocks Community users from requesting Copernicus DEM from GEE', async () => {
  render(<TerrainWorkflowPanel {...props}
    aoi={{source:'draw',label:'AOI',
      geometry:{type:'Polygon',coordinates:[[[32,-25],[33,-25],[33,-24],[32,-25]]]}}}/>);
  fireEvent.change(screen.getByLabelText('Fonte'),{target:{value:'gee'}});
  fireEvent.click(screen.getByText('Executar análise completa'));
  expect(await screen.findByRole('alert')).toHaveTextContent('GeoMoz Pro');
  expect(runTerrainWorkflow).not.toHaveBeenCalled();
});
it('cancels the active worker and never adds partial products', async () => {
  vi.mocked(runTerrainWorkflow).mockImplementation((_bytes, _name, _opts, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancel', 'AbortError')))));
  render(<TerrainWorkflowPanel {...props} />);
  const file = new File(['dem'], 'dem.tif');
  Object.defineProperty(file, 'arrayBuffer', {value: async () => new Uint8Array([1]).buffer});
  fireEvent.change(screen.getByLabelText(/GeoTIFF de elevação, uma banda/), {target: {files: [file]}});
  fireEvent.click(screen.getByText('Executar análise completa'));
  await waitFor(() => expect(runTerrainWorkflow).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByText('Cancelar'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Análise cancelada');
  expect(props.onComplete).not.toHaveBeenCalled();
});
it('uses the newly drawn AOI as the local DEM crop', async () => {
  vi.mocked(runTerrainWorkflow).mockRejectedValue(new Error('end test'));
  const view = render(<TerrainWorkflowPanel {...props} />);
  fireEvent.click(screen.getByText('Desenhar área no mapa'));
  expect(props.onDraw).toHaveBeenCalledOnce();
  view.rerender(<TerrainWorkflowPanel {...props} aoi={{...props.aoi, source: 'draw', geometry: {type: 'Polygon', coordinates: [[[32,-25],[33,-25],[33,-24],[32,-25]]]}, label: 'Área desenhada no mapa'}} />);
  expect(screen.getByLabelText('Recortar pela extensão rectangular desenhada')).toBeChecked();
  const file = new File(['dem'], 'dem.tif');
  Object.defineProperty(file, 'arrayBuffer', {value: async () => new Uint8Array([1]).buffer});
  fireEvent.change(screen.getByLabelText(/GeoTIFF de elevação, uma banda/), {target: {files: [file]}});
  fireEvent.click(screen.getByText('Executar análise completa'));
  await waitFor(() => expect(runTerrainWorkflow).toHaveBeenCalledOnce());
  expect(vi.mocked(runTerrainWorkflow).mock.calls[0][2].bbox).toEqual([32,-25,33,-24]);
  await screen.findByRole('alert');
});


it('switches terrain controls, feedback and fallback live in PT EN FR ES without changing analysis IDs', async () => {
  let language = 'pt';
  const listeners = new Set<() => void>();
  window.GeoMozPreferences = {
    getLanguage: () => language,
    setLanguage: (value: string) => { language = value; listeners.forEach(cb => cb()); return true; },
    getReducedMotion: () => false,
    setReducedMotion: () => {},
    subscribe: (callback: () => void) => { listeners.add(callback); return () => listeners.delete(callback); },
  };
  render(<TerrainWorkflowPanel {...props} />);
  expect(screen.getByText('Executar análise completa')).toBeInTheDocument();
  act(() => { window.GeoMozPreferences?.setLanguage('en'); });
  expect(screen.getByText('Run complete analysis')).toBeInTheDocument();
  expect(screen.getByLabelText('Source')).toHaveValue('file');
  fireEvent.click(screen.getByText('Run complete analysis'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Select an elevation GeoTIFF or HGT');
  act(() => { window.GeoMozPreferences?.setLanguage('fr'); });
  expect(screen.getByRole('alert')).toHaveTextContent("Sélectionnez un GeoTIFF ou HGT d'altitude");
  expect(screen.getByText("Lancer l'analyse complète")).toBeInTheDocument();
  act(() => { window.GeoMozPreferences?.setLanguage('es'); });
  expect(screen.getByText('Ejecutar análisis completo')).toBeInTheDocument();
  act(() => { window.GeoMozPreferences?.setLanguage('de'); });
  expect(screen.getByText('Run complete analysis')).toBeInTheDocument();
  expect(runTerrainWorkflow).not.toHaveBeenCalled();
});
