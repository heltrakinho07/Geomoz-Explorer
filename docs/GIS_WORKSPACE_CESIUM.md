# GIS Workspace — CesiumJS em 2D

O Workspace usa CesiumJS 1.127.0, com SDK, imagens, CSS e workers servidos pelo próprio domínio. A cena é SCENE2D, com terreno elipsoidal, sem modo 3D nem dependência de Cesium Ion. Os outros mapas da aplicação mantêm o seu motor.

## Fluxo
1. Desenhar a área: clicar ou tocar para adicionar vértices, desfazer, concluir ou cancelar. O traçado SVG acompanha a câmara e permanece acima dos rasters.
2. Importar dados: GeoJSON, GeoTIFF/COG ou SRTM HGT, incluindo nomes como S20E035.hgt. A importação HGT existente produz um GeoTIFF georreferenciado.
3. Executar as ferramentas de processamento existentes. Os ficheiros de análise e exportação conservam os seus pixels; o renderizador trabalha numa cópia de apresentação.
4. Seleccionar o resultado: a câmara enquadra a sua extensão. Visibilidade, opacidade, bandas, RGB, cores, classes, NoData e stretch continuam ligados ao estado do projecto.

## Renderização
- GeoJSON: entidades Cesium, selecção por clique e atributos apresentados como texto.
- GeoTIFF: worker dedicado, janelas de leitura e níveis de overview; mosaicos de 256 pixels na resolução pedida pelo mapa. Aceita transformações afins, incluindo rotação, e transforma coordenadas EPSG com GeoLibre.
- COG remoto: leitura HTTP Range; o servidor precisa de permitir Range e CORS. Rasters sem CRS EPSG reconhecido apresentam um erro explícito.
- XYZ, WMTS e WMS: providers de imagem Cesium. WMS conserva o template EPSG:3857 do projecto. WMTS conserva os identificadores de matriz configurados na ligação.
- PMTiles: leitura por Range para imagens e vectores MVT/MLT, com filtros de source-layer e atribuição.

O worker é terminado ao sair da página; providers removidos deixam de actualizar a cena. Recursos e camadas que falhem apresentam um erro e a opção de recarregar. O limite de leitura e conversão de ficheiros continua a depender da memória do navegador.

## Verificação
O workflow Frontend CI executa TypeScript, testes GIS, testes de integridade, emuladores Firebase, build de produção e o ensaio Chromium de integração. As capturas são guardadas no artefacto workspace-browser-screenshots.

O ensaio usa um HGT sintético 1201 × 1201, desenho no canvas, declive WASM e apresentação efectiva de mosaicos do resultado. Inclui importação/identificação de GeoJSON e pedidos XYZ/WMS a fixtures locais. Não representa um ensaio do ficheiro original do utilizador nem de todos os serviços externos.
