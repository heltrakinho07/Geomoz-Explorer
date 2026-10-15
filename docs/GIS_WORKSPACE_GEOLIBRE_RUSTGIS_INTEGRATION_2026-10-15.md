# GeoMoz GIS Workspace v1.1 — motor vectorial real

## Estado e origem

Esta implementação integra o GIS Workspace existente (Explorer → GIS Workspace)
com ferramentas vectoriais **que executam cálculos sobre GeoJSON real**.
Foram estudadas as arquitecturas de [GeoLibre](https://github.com/opengeos/GeoLibre)
(MIT, © 2026 Qiusheng Wu) e [RustGIS](https://github.com/opengeos/RustGIS)
(Apache-2.0).

- **GeoLibre:** padrão de `ProcessingAlgorithm` / registo / executor / Web Worker.
- **RustGIS:** camadas independentes `geom → data → analysis → engine → UI`,
  validação explícita e resultados de comandos reproduzíveis.
- **GeoMoz:** código original de integração que reutiliza as operações Turf.js
  já presentes em `wasm-geoprocessing.ts`. A presença de "wasm" no nome
  histórico deste módulo **não significa que estas operações usem WASM**.

**Não incorporámos os executáveis de RustGIS, Whitebox/GeoLibre WASM,
DuckDB-WASM nem as suas 1000+ ferramentas nesta fase.** Não declarar estas
capacidades como implementadas até existirem artefactos compatíveis,
integração e testes de licença/dependências.

## Estrutura

```text
src/components/GISWorkspacePanel.tsx             UI, mapa, camadas e atributos
       │                 │
       ▼                 ▼
src/lib/gis-workspace.ts                Parser GeoJSON/CSV e controlo de limites
       │
       ▼
src/lib/gis-workspace-runner.ts         Promise, Web Worker, timeout, erro
       │
       ▼
src/lib/gis-workspace.worker.ts         Trabalho fora da thread principal
       │
       ▼
src/lib/gis-workspace-engine.ts         Registo, validação e proveniência
       │
       ▼
src/lib/wasm-geoprocessing.ts           Algoritmos vectoriais Turf.js reais
```

Operações realmente suportadas: buffer (m/km), centróides, convex hull,
bbox, dissolve, simplify, explode, área e comprimento, intersecção, diferença
(erase) e contagem de pontos em polígonos.

Cada operação valida GeoJSON/WGS84, geometrias obrigatórias, unidade e
intervalo de parâmetros, limites de feições e de pares de sobreposição.
Um resultado sem feições pode ser válido em intersecção/erase e é identificado.
Operações não implementadas falham explicitamente. Não há operação genérica
de fallback a centróides.

Camadas derivadas preservam `command`, `engine`, parâmetros, duração e
nomes das camadas de entrada e máscara. Exportação em GeoJSON no browser.
Não há upload implícito nem promessas de persistência permanente: o estado
actual é de sessão, e desaparece se a página for actualizada.

## Restrições técnicas e interpretação

- **Vector only:** não aplica raster algebra ou geoprocessamento de DEM.
- **EPSG:4326:** coordenadas GeoJSON WGS84; não reprojeta Shapefile/GeoPackage.
- **Limite 5.000 feições** e **100.000 pares** em overlay. Operações mais
  exigentes devem ser executadas por GEE/GeoPandas/PostGIS numa implementação
  futura, após controlo de autenticação e custos.
- **Turf.js** utiliza fórmulas geodésicas/aproximações na esfera. Área,
  comprimento e buffer não substituem um método elipsoidal ou projecção local
  para medições cadastrais de precisão.
- Geometrias malformadas podem falhar; não confundir sucesso de execução com
  validade científica/cartográfica de dados de origem.
- O motor funciona num Web Worker com timeout de 60 segundos. A UI mostra
  erros sem criar camadas falsas.

## Próximas extensões, não implementadas

1. Parquet/GeoPackage/COG via DuckDB-WASM, GDAL/rasterio ou GeoParquet.
2. Motor raster e Whitebox GeoLibre WebAssembly com importação de artefactos
   verificados, confirmação de compatibilidade e integração em worker.
3. RustGIS no browser, somente com um artefacto WASM suportado; nunca presumir
   que os crates compilam directamente para a ABI do GeoMoz.
4. Model Builder, histórico durável por projecto, persistência e exportação
   GeoPackage, proveniência completa e partilha colaborativa.
5. Análise geológica por cruzamento de mapas de litologia, lineamentos,
   índices espectrais reais e validação de dados de campo.

## Verificação

```sh
pnpm --dir artifacts/geomoz-react exec vitest run \
  src/lib/__tests__/gis-workspace.test.ts \
  src/lib/__tests__/gis-workspace-engine.test.ts
pnpm --dir artifacts/geomoz-react run typecheck
pnpm --dir artifacts/geomoz-react run build
```

Smoke-test manual: importar dois polígonos GeoJSON (sobrepostos), executar
intersecção, diferença e buffer; importar CSV de pontos; contar pontos;
verificar resultados na tabela/mapa, descarregar GeoJSON, testar erros de
parâmetros inválidos e browser pequeno.

## Licenças e atribuições

- GeoLibre © 2026 Qiusheng Wu — MIT; consultar
  [LICENSE](https://github.com/opengeos/GeoLibre/blob/main/LICENSE).
- RustGIS — Apache-2.0; consultar
  [LICENSE](https://github.com/opengeos/RustGIS/blob/main/LICENSE) e
  [ATTRIBUTION](https://github.com/opengeos/RustGIS/blob/main/ATTRIBUTION.md).
- O módulo de comando e o Web Worker do GeoMoz são nova implementação
  baseada nesses conceitos, não cópia integral de ficheiros de terceiros.
- Se forem vendorizados ficheiros desses projectos, preservar licenças,
  avisos de copyright, NOTICE (quando aplicável) e origem por ficheiro.
