# Dados públicos mundiais no GeoMoz AI

## Fontes revistas em 2026-11-04

| Fonte | Identificador Earth Engine | Resolução | Cobertura / período | Ligação nesta entrega |
| --- | --- | --- | --- | --- |
| Sentinel-2 SR Harmonized | `COPERNICUS/S2_SR_HARMONIZED` | 10/20/60 m por banda | Terra/costa, desde 2017; 2017–2018 incompletos | Estatísticas por AOI/limiar e diferença entre períodos |
| WorldCover | `ESA/WorldCover/v200` | 10 m | Terra global, 2021 | Mapa e áreas por classe de 2021 |
| ERA5-Land Daily | `ECMWF/ERA5_LAND/DAILY_AGGR` | ~11,1 km | Terra global, desde 1950; últimos dias sujeitos à disponibilidade | Precipitação acumulada e temperatura média |
| FAO GAUL 2025 ADM1 | `FAO/GAUL/2025/level1` | Vectorial | Edição 2025 | Selecção ADM1 e união por ISO3 para país |
| FAO GAUL 2025 ADM2 | `FAO/GAUL/2025/level2` | Vectorial | Edição 2025 | Selecção ADM2 com validação do pai ADM1 |
| geoBoundaries ADM0 v6 | `WM/geoLab/geoBoundaries/600/ADM0` | Vectorial | 199 entidades; edição 2023 | Limites nacionais para os novos motores públicos |
| CHIRPS v2 | `UCSB-CHG/CHIRPS/DAILY` | ~5,6 km | Terra entre 50°S e 50°N, desde 1981 | Motor anterior; não é cobertura mundial completa |
| Landsat 8 C2 L2 | `LANDSAT/LC08/C02/T1_L2` | 30 m (óptico) | Cenas terrestres desde 2013 | Motor anterior de índices |
| Dynamic World | `GOOGLE/DYNAMICWORLD/V1` | 10 m | Observações Sentinel-2 desde 2015 | Apenas catálogo; nova integração ainda pendente |
| Copernicus GLO-30 2024_1 | `COPERNICUS/DEM/GLO30_2024_1` | 30 m | DSM baseado em aquisições 2010–2020 | Apenas catálogo; motor de terreno anterior ainda usa edição antiga |
| JRC Surface Water v1.4 | `JRC/GSW1_4/GlobalSurfaceWater` | 30 m | Histórico 1984–2021 | Apenas catálogo para novos fluxos; não detecção de cheia actual |

Cada entrada de `agent/public_datasets.py` inclui a ligação para o catálogo oficial, período, cobertura, termos, usos e limitações. `implemented` significa que o motor foi ligado no código, não que foi validado remotamente com credenciais GEE nesta entrega. `existing` identifica implementação prévia; `catalogue_only` não declara funcionalidade operacional.

## Análises concretas

### Estatísticas zonais e áreas por limiar

O motor calcula NDVI, NDWI, MNDWI, NDBI ou NBR a partir de medianas de reflectância Sentinel-2 harmonizada. Usa a SCL para reter vegetação, solo e água (classes 4, 5 e 6), aplica factor 0,0001 e exclui nuvens/sombras/neve. A filtragem por percentagem de nuvens de cena é configurável (30% por omissão).

A média, mínimo, máximo, desvio-padrão e contagem referem-se à grelha de análise explicitada. Áreas usam `ee.Image.pixelArea()`; percentagens por limiar usam a área observada válida como denominador. Ausência de observação não é classe negativa nem zero. O raster é calculado de novo com parâmetros explícitos; não se usa um nome livre de camada para presumir um produto existente.

### Diferença temporal

O utilizador define A e B; ambos devem estar disponíveis, em ordem cronológica e sem sobreposição. O motor calcula `B − A` somente na intersecção dos pixels válidos. Reporta média, suporte comum e áreas com aumento/diminuição acima do limiar absoluto (0,2 por omissão). Não se trata de dNBR convencional (pré menos pós), classificação de desflorestação ou validação de área ardida.

Estações diferentes, efeitos fenológicos, sombras, solos e diferenças de amostragem podem explicar mudanças. Número de cenas não é número de observações válidas em cada pixel.

### Cobertura do solo

WorldCover v200 devolve o mapa de 2021 e áreas das 11 classes, calculadas na grelha explicitada. A data seleccionada no projecto não altera a data do produto. Percentagens são relativas à área classificada válida; erros de classificação permanecem.

### Clima terrestre

ERA5-Land agrega os dias exactos do intervalo (fim exclusivo). A precipitação é a soma da banda `total_precipitation_sum`, convertida de metros para milímetros. A temperatura é a média de `temperature_2m`, convertida de kelvin para graus Celsius. A média final é espacial sobre a AOI. O motor recusa intervalos cujo número de dias disponíveis não coincide com o esperado. Reanálise não é previsão nem estação meteorológica; os artefactos conhecidos do produto não são corrigidos silenciosamente.

## Área, escala e execução

A selecção de país no frontend fornece uma caixa para navegação. Os novos motores resolvem o código ISO alfa-3 em `geoBoundaries/600/ADM0` e usam a geometria nacional no servidor. Se o país não estiver presente, a análise falha de forma explícita; não usa a caixa envolvente como substituto. Polígonos carregados/desenhados são validados em EPSG:4326.

As reduções usam EPSG:6933, escala explícita e máximo de pixels. AOIs grandes aumentam a escala de análise para um orçamento de aproximadamente oito milhões de células; o resultado comunica essa escala, sem `bestEffort` oculto. A grelha não aumenta a resolução efectiva dos sensores. Países extensos e geometrias complexas podem exceder limites de memória/tempo: subdividir a AOI. As RPCs dos novos motores correm fora do loop assíncrono do servidor, mas ainda não constituem jobs persistentes com cancelamento.

Os limites nacionais geoBoundaries e a sua política de representação territorial devem ser citados. Não são limites cadastrais. A carta geológica GeoMoz continua a cobrir Moçambique; não existe substituição automática por geologia mundial.

O catálogo público pode ser consultado sem login GEE. Cálculos exigem Earth Engine autorizado no projecto/configuração existente e estão sujeitos às quotas, preços e termos aplicáveis. Disponibilidade pública não elimina esses requisitos.

## Validação desta entrega

Testes offline verificam invariantes numéricos com rasters sintéticos: sentido B−A, intersecção de máscaras, denominador de área válida, conversão m→mm, falha com dados ausentes e selecção do limite nacional por ISO-3. Testes de interface verificam parâmetros escolhidos e bloqueio de submissões repetidas. Estes testes não certificam exactidão científica nem substituem execução remota autenticada em áreas de referência.


## Limites FAO GAUL 2025

O agente permite escolher explicitamente FAO GAUL 2025 ou geoBoundaries v6 na área mundial. Países seleccionados de novo no agente usam GAUL 2025 por omissão; projectos anteriores sem esta escolha mantêm a fonte anterior. Na opção FAO, a hierarquia país → ADM1 → ADM2 usa `ISO3_CODE`, `GAUL1_CODE` e `GAUL2_CODE`. Não se reutilizam campos `ADM1_CODE`/`ADM2_CODE` de 2015 nesta edição.

A edição oficial no GEE contém ADM1 e ADM2. A AOI de país é derivada pela união das unidades ADM1 filtradas por ISO3, com erro máximo de fusão 100 m; o dossiê regista a derivação e a fonte de 2025. Não é apresentado um suposto asset oficial GAUL 2025 level0. Para ADM2, o código ADM1 é obrigatório e validado dentro do país. Alterar o pai limpa o filho no selector. Falhas de cobertura devolvem erro, sem fallback silencioso para outro país ou outra fonte.

Listagens transferem apenas atributos, têm limite de 2.000 unidades e exigem ADM1 para carregar ADM2. Não são descarregadas todas as geometrias mundiais para o browser. Pedidos de listagem obsoletos são abortados/ignorados ao mudar de país ou pai.

A nomenclatura ADM1/ADM2 varia: pode corresponder a províncias, estados, regiões, distritos, concelhos, municípios ou outros equivalentes. Não se deve presumir equivalência universal nem precisão cadastral. A selecção mantém os códigos GAUL e os nomes do produto. A vista inicial de navegação pode continuar a abranger o país; os cálculos usam a geometria exacta seleccionada da fonte.

Os termos publicados no catálogo oficial para 2025 indicam CC BY 4.0. A atribuição FAO acompanha os resultados; o logótipo da FAO não é usado. A edição 2015 está assinalada como substituída e não é usada como fallback: os seus campos e termos de utilização são distintos.

Fontes oficiais:
- https://developers.google.com/earth-engine/datasets/catalog/FAO_GAUL_2025_level1
- https://developers.google.com/earth-engine/datasets/catalog/FAO_GAUL_2025_level2
- https://developers.google.com/earth-engine/datasets/catalog/FAO_GAUL_2015_level2
