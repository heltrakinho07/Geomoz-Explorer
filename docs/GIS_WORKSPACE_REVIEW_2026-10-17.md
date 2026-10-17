# Revisão do GIS Workspace — 17 de Outubro de 2026

A imagem partilhada mostra um DEM Global a 611 m, um catálogo a competir com os parâmetros e dois botões principais de execução. O código anterior não seleccionava automaticamente o raster produzido pelo Whitebox: a execução podia terminar e o mapa continuar centrado/seleccionado na entrada.

Esta alteração:
- acrescenta um painel de estudo com três passos (área, dados, análise), entrada seleccionada, aviso explícito para a resolução regional do DEM conhecido, estado de execução e acesso aos resultados;
- melhora contraste, tamanho dos campos e tipografia do painel, sem alterar a atribuição cartográfica;
- selecciona o primeiro raster Whitebox produzido e abre as camadas; mantém o erro de execução visível;
- aceita SRTM HGT 1201/3601, assinado big-endian, NoData -32768, com georreferenciação pelo nome original e centros de amostra preservados;
- limita a grelha de download GEE antes de pedir o URL; DEM até 900000 células float32, dimensões inferiores a 10000, resolução efectiva comunicada;
- ajusta a grelha de análise à memória disponível e regista a mudança de resolução.

O ambiente local ficou indisponível durante o trabalho anterior. A validação desta entrega é feita no GitHub Actions. Não se declara ensaio visual nem ensaio do ficheiro específico do utilizador.

## Pendências explícitas
O mapa actual continua a usar MapLibre em 2D. A migração pedida para CesiumJS não está implementada nesta alteração. Essa migração precisa de verificar a preservação de camadas raster, classificação, serviços OGC e desenho no mapa; não deve ser confundida com mudar o nome do mapa ou a imagem de fundo.
