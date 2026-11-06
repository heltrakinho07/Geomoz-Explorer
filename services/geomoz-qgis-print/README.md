# GeoMoz — Cartographic Layout Engine (PyQGIS + Cartopy)

## Implementado

O GeoMoz prepara pacotes de impressão JSON (schema 1) para dois motores:

- **PyQGIS:** PDF vectorial A4/A3, camadas GeoJSON, CRS geográfico/UTM,
  grelhas geográficas ou UTM com anotações, legendas e escala gráfica QGIS.
- **Cartopy + Matplotlib:** PDF vectorial científico A4/A3, CRS geográfico/UTM,
  pontos/linhas/polígonos, legenda e grelha de latitude/longitude.
  A anotação UTM métrica ainda está disponível apenas no PyQGIS.

O painel do GIS Workspace permite escolher motor, CRS, grelha, intervalos,
formato de papel e DPI. **Nesta fase, o painel descarrega um pacote JSON,
não gera um PDF no navegador.** Para o utilizador, a impressão imediata via
GeoLibre continua disponível separadamente; o PDF desse compositor pode
conter mapas rasterizados.

## Utilização privada, via Docker Compose

1. Criar ficheiro .env a partir de .env.example e substituir o token por
   uma cadeia aleatória segura de pelo menos 32 caracteres.
2. Executar:

    cd services/geomoz-qgis-print
    docker compose --env-file .env build
    docker compose --env-file .env up -d

3. Descarregar geomoz-qgis-impressao.json a partir do GeoMoz GIS Workspace.
4. Para um pacote com engine=pyqgis enviar para 127.0.0.1:18085; com
   engine=cartopy enviar para 127.0.0.1:18086:

    curl --fail -sS -H "Authorization: Bearer SEU_TOKEN_PRIVADO" \
      -H "Content-Type: application/json" \
      --data-binary @geomoz-qgis-impressao.json \
      http://127.0.0.1:18086/v1/print/pdf -o mapa-cartopy.pdf

Cada worker recusa pedidos destinados ao outro motor.

## Contracto de impressão

O JSON inclui engine, map_crs, grid, paper, orientation, dpi, title e layers.
O CRS do mapa admite EPSG:4326 e zonas UTM WGS84 EPSG:32601–32660 e
EPSG:32701–32760. As coordenadas das feições GeoJSON e o envelope bbox
são SEMPRE EPSG:4326 (longitude, latitude). Exemplo de parâmetros:

    {
      "engine": "cartopy",
      "map_crs": "EPSG:32736",
      "grid": {
        "type": "geographic",
        "interval_degrees": 0.5,
        "interval_meters": 10000
      }
    }

Tipos de grelha: none, geographic, utm e both. Cartopy aceita none e
geographic; PyQGIS suporta os quatro tipos. Pacotes anteriores mantêm
compatibilidade: motor predefinido pyqgis, CRS EPSG:4326, sem grelha.

## Limites e segurança

- JSON até 4 MB; 12 camadas; 5 000 feições; 100 000 vértices.
- Um job por worker, máximo 90 segundos, limites de memória e CPU.
- Não aceita URLs remotos, scripts arbitrários, ficheiros de projecto,
  QML, ou fontes de dados externas fornecidas pelo utilizador.
- Containers isolados, sem privilégios elevados, filesystem read-only,
  portas restritas a 127.0.0.1 na máquina anfitriã.
- O token privado nunca deve ser incluído em JavaScript ou no GitHub.
- Para imprimir online, é obrigatório um gateway que valide Firebase
  ID Tokens, aplique quotas e faça a comunicação privada com os workers.

## Limitações actuais

O motor só trabalha com vectores GeoJSON de cor simples. Não reproduz
automaticamente simbologia por categorias/valores, GeoTIFF, WMS, WMTS,
GEE, basemaps, atlas ou GeoPDF. Para Cartopy, escala gráfica e etiquetas
de coordenadas UTM necessitam de implementação específica. Nenhum motor
deve inventar escalas ou coordenadas. Comparar os PDFs da CI visualmente
com equivalentes no QGIS Desktop antes da promoção a produção cartográfica.

## Testes

A CI contém unit tests do schema, testes de isolamento Docker e smoke tests
com PyQGIS e Cartopy reais, com PDF inspeccionado por Poppler.

Referências: https://qgis.org/pyqgis/ e https://cartopy.readthedocs.io/
