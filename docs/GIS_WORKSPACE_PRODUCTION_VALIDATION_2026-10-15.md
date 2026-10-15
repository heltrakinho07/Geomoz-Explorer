# GeoMoz GIS Workspace — robustez de dados e processamento (2026-10-15)

## Arquitectura confirmada na branch de produção `main`
- Workspace principal: `artifacts/geomoz-react/src/pages/GeoProcessamento.tsx`.
- Dados locais por `uid::projectId`: IndexedDB com ficheiros raster em separado.
- Autenticados: estado e metadados no Firestore; vectores GeoJSON e rasters GeoTIFF no Firebase Storage.
- Importação: GeoJSON, CSV, KML, GPKG, Shapefile, GeoParquet e raster, conforme o importador real e formatos suportados.
- Análise: Turf.js em Web Worker para operações vectoriais; outros motores GeoMoz (DuckDB Spatial, Whitebox WASM, GDAL backend) mantidos independentes.
- Firebase Storage: bucket `geoprocessamento-426809.firebasestorage.app` em `us-east1`; Cloud Run em `europe-west1`.

## Alterações desta entrega
1. As operações vectoriais são canceláveis através de `AbortSignal`. Cancelamento encerra o worker e não cria camadas ou sucessos fictícios.
2. O motor vectorial recusa falhas topológicas antes silenciadas no buffer, dissolve, intersecção e diferença. Não indica êxito quando Turf.js lança um erro.
3. O histórico guarda proveniência da operação: algoritmo, IDs das entradas, contagens de feições, ID do resultado e instante de conclusão. A proveniência viaja com o histórico local e remoto.
4. A interface distingue restauro, cache apenas local, upload pendente, guardado na nuvem e erro de sincronização. **Cache local não equivale a backup remoto confirmado**.
5. Se o restauro cloud falhar (rede, autenticação, Storage), a escrita cloud é bloqueada durante essa hidratação. Não se sobrepõe um estado local potencialmente vazio a camadas remotas por causa de erros transitórios.
6. Gravações automáticas são serializadas. Pedidos pendentes são coalescidos para que um upload antigo não termine depois do estado mais recente.
7. Testes regressivos para fila last-write-wins, falhas/repetição, cancelamento de worker e limites vectoriais.

## Matriz de aceitação de produção — requer sessão real em navegador
Os testes CI **não equivalem** aos testes reais de autenticação e acesso a Firebase. Verificar manualmente:
- Utilizador A, Projecto 1: importar GeoJSON com 2 pontos, criar buffer, conferir resultado no mapa, histórico e estado «guardado no Firebase». Actualizar e reabrir; validar feições.
- Importar GeoTIFF pequeno, recarregar e verificar restauro e renderização das bandas. Importar segundo projecto; verificar separação por projecto.
- Utilizador B: confirmar que não consegue consultar os objectos do utilizador A nem os manifests Firestore.
- Desligar rede, editar projecto e verificar estado «apenas cache local» ou «erro» conforme etapa da sessão. Reabrir com ligação e verificar sincronização recuperada sem eliminar dados remotos.
- Iniciar buffer demorado e cancelar: **nenhuma camada derivada é criada** e o mapa permanece interactivo.
- Sobrepor polígonos disjuntos: intersecção vazia válida; polígonos inválidos: erro explícito. Comparar área/medida de casos de referência com QGIS/GEOS antes de uso científico exigente.
- Medir tempo/custos de transferências de GeoTIFF entre `us-east1` e `europe-west1`.

## Limites e próximas melhorias
- Não foi executado smoke test autenticado de dois utilizadores em browser nesta entrega.
- Não há resolução automática de conflitos simultâneos entre dispositivos; recomenda-se evitar editar o mesmo projecto em múltiplos dispositivos até introduzir versionamento/merge remoto.
- Interrupção de algoritmo vectorial não deve ser confundida com interrupção automática de jobs GDAL/Whitebox (possuem fluxos independentes).
- Turf.js opera em GeoJSON geográfico EPSG:4326; resultados cartográficos com precisão de engenharia exigem CRS apropriado, testes GEOS/PROJ e validação topológica do domínio.
- Em caso de erro de sincronização cloud, os dados permanecem na cache local do navegador e devem ser exportados antes de limpar cache.
