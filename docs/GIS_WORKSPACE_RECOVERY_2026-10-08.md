# GeoMoz GIS Workspace — Recuperação modular (2026-10-08)

## Funções introduzidas

- Separador **GIS Workspace** no Explorer, com interface responsiva.
- Importação local de GeoJSON/JSON e CSV com colunas `lat/latitude`, `lon/lng/longitude`.
- Mapa Leaflet interactivo, com basemap OSM, ajuste automático para a camada seleccionada, escala e controlo de visibilidade/opacidade.
- Tabela de atributos com pesquisa, suportando CSV com campos entre aspas, vírgula, ponto-e-vírgula ou tabulação.
- Limites explícitos por ficheiro: **8 MB** e **5 000 feições**; validação de coordenadas WGS84.
- Os ficheiros não são enviados ao backend nem persistidos. As camadas permanecem ao mudar de separador dentro do Explorer, mas desaparecem ao actualizar a página.

## Limitações conhecidas

- Esta é uma recuperação incremental, não o GIS Workspace multi-projecto completo previsto no roadmap.
- Ainda não suporta Shapefile, GeoPackage, KML, GeoTIFF, WMS/WFS ou armazenamento na nuvem.
- A representação cartográfica usa cores padrão; edição vectorial e estilos temáticos não estão incluídos.
- A tabela limita a apresentação às primeiras 300 feições filtradas; as importadas continuam disponíveis no estado local.
- GeoJSON exige coordenadas longitude/latitude; reprojecção ainda não está incluída.

## Critérios de validação

1. `pnpm --dir artifacts/geomoz-react exec vitest run src/lib/__tests__/gis-workspace.test.ts`
2. `pnpm run typecheck`
3. `pnpm run build`
4. Smoke-test manual no navegador: importar CSV e GeoJSON; visualizar polígonos e pontos; alternar visibilidade, opacidade e camada activa.
5. Testar layouts de ecrã pequeno e desktop, sem bloquear Explorer ou análise GEE.

Esta branch é baseada em `fix/geomoz-security-and-ci-20261008` (PR #36). A integração requer a aprovação de P0 e não deve promover automaticamente alterações para `main`, que continua a ser a branch de deploy.
