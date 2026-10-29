# GIS Workspace — nível 2: primeira entrega

O nível 1 foi integrado pelo PR #137. Os PRs #125 e #126 mantêm-se
separados para não perder trabalho de digitalização e sismicidade.

## Processamento raster no navegador

Reprojectar e Recortar DEM por máscara passam a executar GDAL WebAssembly,
sem exigir o serviço Python de desktop. A biblioteca e o carregador GDAL
já eram usados pelo georreferenciador; não foi incorporado código NextGIS.

- Reprojecção: SRC EPSG explícito e vizinho mais próximo, bilinear ou cúbica.
- Recorte: escolher uma camada poligonal do projecto, recortar à extensão
  da máscara e produzir transparência fora dela. A máscara usa GeoJSON WGS84.
- Resultado COG adicionado automaticamente ao mapa e GeoTIFF descarregável.
- Histórico e erros do formulário nativo preservados.
- Limite de entrada de 64 MB nesta integração; máscara até 8 MB.
- O módulo GDAL pode descarregar os seus ficheiros WASM da origem já
  configurada na aplicação. Os dados de entrada são processados localmente.

A preparação continua a validar as âncoras do motor fixado, falhando se o
código original mudar. O caminho de desktop é preservado.

## Validação

71 testes Node locais passaram. Compilação TypeScript e bundle locais passaram.
Chromium executa um DEM de controlo projectado: declive comparado com o valor
analítico, hillshade dentro do intervalo, mudança efectiva de SRC e recorte
poligonal com redução de extensão e banda de transparência. Exporta GeoTIFFs
como evidência de CI, usando os algoritmos reais, sem simular os resultados.

## Restante nível 2

Curvas de nível e reprojecção vectorial ainda dependem de motores próprios
do projecto e precisam de validação no navegador. Recorte, intersecção e
dissolução vectoriais e recorte raster por extensão precisam de cobertura
funcional adicional. Esta entrega não declara o nível 2 concluído.
