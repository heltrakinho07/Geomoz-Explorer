# GeoMoz Explorer: uma plataforma web de geoanálise baseada em Google Earth Engine para exploração mineral, recursos hídricos e geoperigos em Moçambique

**Autor:** Helder Traquinho¹
**Afiliação:** ¹GeoMoz Explorer — Maputo, Moçambique
**Correspondência:** heltrakinho@gmail.com
**Data:** Junho de 2026
**Versão:** 1.0 (pré-impressão / documento técnico)

---

## Resumo

A prospeção de recursos e a gestão de riscos naturais em Moçambique são limitadas pela escassez de plataformas integradas que transformem dados de observação da Terra em informação acionável. Este trabalho apresenta o **GeoMoz Explorer**, uma plataforma web de geoanálise que combina o processamento em nuvem do **Google Earth Engine (GEE)** com uma interface interativa em React/Leaflet, servida por uma API em Python (FastAPI). O sistema disponibiliza seis famílias de análise sobre o território moçambicano: (i) índices espectrais e mapeamento de **alteração mineral** a partir de Sentinel-2; (ii) análise de **terreno e lineamentos estruturais** a partir do DEM Copernicus GLO-30; (iii) **prospectividade mineral** por combinação difusa ponderada; (iv) **hidrologia** (delimitação de bacias, redes de drenagem e relatórios hidro-ambientais); (v) **potencial de água subterrânea** por análise multicritério (AHP); e (vi) **geoperigos** — mapeamento de cheias com radar Sentinel-1 e risco de erosão do solo por RUSLE. Todos os cálculos são executados no lado do servidor e entregues ao cliente como camadas de mosaicos XYZ, permitindo análise à escala nacional sem transferência de dados brutos. A validação funcional demonstra, entre outros, a deteção de ~2085 km² de área inundada na província de Sofala durante o ciclone Idai (março de 2019) e a delimitação de sub-bacias hidrográficas em ~2 s. A plataforma é distribuída como aplicação web e como aplicação de ambiente de trabalho (Electron) multiplataforma.

**Palavras-chave:** Google Earth Engine; deteção remota; alteração hidrotermal; água subterrânea; AHP; Sentinel-1; RUSLE; Moçambique; geoperigos.

---

## Abstract

Resource prospecting and natural-hazard management in Mozambique are constrained by the scarcity of integrated platforms that turn Earth-observation data into actionable information. This paper presents **GeoMoz Explorer**, a web-based geoanalysis platform coupling **Google Earth Engine (GEE)** cloud processing with an interactive React/Leaflet front-end served by a Python (FastAPI) API. The system offers six analysis families over Mozambique: (i) spectral indices and **mineral-alteration mapping** from Sentinel-2; (ii) **terrain and structural-lineament** analysis from the Copernicus GLO-30 DEM; (iii) **mineral prospectivity** via weighted fuzzy overlay; (iv) **hydrology** (watershed delineation, drainage networks and hydro-environmental basin reports); (v) **groundwater potential** via Analytic Hierarchy Process (AHP); and (vi) **geohazards** — Sentinel-1 SAR flood mapping and RUSLE soil-erosion risk. All computations run server-side and are delivered as XYZ map tiles, enabling national-scale analysis without transferring raw data. Functional validation shows, among others, the detection of ~2085 km² of flooded area in Sofala province during Cyclone Idai (March 2019) and sub-basin delineation in ~2 s. The platform ships as a web app and as a cross-platform desktop (Electron) application.

**Keywords:** Google Earth Engine; remote sensing; hydrothermal alteration; groundwater; AHP; Sentinel-1; RUSLE; Mozambique; geohazards.

---

## 1. Introdução

Moçambique possui um potencial mineral significativo (carvão em Tete, rubis em Montepuez, grafite, areias pesadas, ouro e gás) e, simultaneamente, uma elevada vulnerabilidade a perigos hidrometeorológicos, exemplificada pelos ciclones Idai e Kenneth (2019) e Freddy (2023). O acesso a água potável em meio rural continua a ser um desafio estrutural. Estes três domínios — **recursos minerais, água e risco** — partilham uma dependência comum de dados geoespaciais consistentes e atualizados.

A observação da Terra por satélite, associada à computação em nuvem, tornou possível analisar estes fenómenos à escala nacional. O **Google Earth Engine** (Gorelick et al., 2017) disponibiliza petabytes de imagens e um motor de processamento paralelo que dispensa a descarga de dados. Contudo, o GEE exige programação, o que limita a sua adoção por técnicos e decisores. Persiste, assim, uma lacuna entre a capacidade analítica do GEE e a sua utilização operacional em contextos como o moçambicano.

Este trabalho apresenta o **GeoMoz Explorer**, concebido para colmatar essa lacuna: uma plataforma que expõe, através de uma interface cartográfica simples, um conjunto coerente de análises de deteção remota, hidrologia e geoperigos, sem que o utilizador escreva código. O sistema foi desenhado segundo quatro diferenciadores: (1) mapeamento de alteração mineral; (2) potencial de água subterrânea; (3) suíte de geoperigos; e (4) preparação para integração de modelos de aprendizagem automática.

---

## 2. Área de estudo

A área de estudo é o território da República de Moçambique (aproximadamente 30,2°E–40,8°E; 26,9°S–10,4°S; ~799 000 km²), na costa sudeste de África. O país abrange desde as planícies costeiras do Índico e os grandes deltas (Zambeze, Púnguè, Limpopo) até aos planaltos e maciços do interior (Manica, Tete, Niassa). A análise pode ser restringida interativamente a qualquer das províncias ou distritos (nível administrativo 2), delimitados a partir de conjuntos vetoriais oficiais, ou a uma área definida pelo utilizador no mapa.

---

## 3. Dados e métodos

### 3.1 Arquitetura do sistema

O GeoMoz Explorer segue uma arquitetura de três camadas:

1. **Motor de processamento (GEE).** Todo o cálculo geoespacial pesado ocorre no Earth Engine, autenticado por conta de serviço. Cada análise produz uma imagem que é publicada como serviço de mosaicos XYZ (`getMapId`), e/ou estatísticas zonais reduzidas (`reduceRegion`).
2. **API (Python/FastAPI).** Um servidor assíncrono medeia os pedidos do cliente, resolve a geometria da área de estudo (província/distrito/AOI), invoca as funções GEE num *pool* de execução e devolve URLs de mosaicos e estatísticas em JSON. Inclui CORS, compressão GZip e limitação de taxa.
3. **Cliente (React + Vite + Leaflet).** A interface consome os mosaicos XYZ e sobrepõe-nos a mapas base, com legendas, painéis de estatísticas (Recharts), ferramentas de localização em tempo real (GPS), seleção de área pelo mapa e exportação. A mesma base de código é empacotada como aplicação de ambiente de trabalho (Electron) para Windows, macOS e Linux.

Esta separação — cálculo no servidor, entrega como mosaicos — permite análise à escala nacional sem transferir dados brutos para o navegador, ultrapassando os limites de desempenho do carregamento de vetores pesados no cliente.

### 3.2 Fontes de dados

| Conjunto de dados | Identificador GEE | Resolução | Utilização |
|-------------------|-------------------|-----------|------------|
| Sentinel-2 SR (harmonizado) | `COPERNICUS/S2_SR_HARMONIZED` | 10–20 m | Índices espectrais, alteração mineral |
| Landsat 8 SR (C2) | `LANDSAT/LC08/C02/T1_L2` | 30 m | NDVI (série temporal) |
| Copernicus DEM GLO-30 | `COPERNICUS/DEM/GLO30` | 30 m | Terreno, declive, lineamentos, LS |
| HydroSHEDS 15" (dir./acum.) | `WWF/HydroSHEDS/15DIR`, `15ACC` | 15 arcsec | Drenagem, TWI, watershed D8 |
| HydroATLAS / HydroBASINS | `WWF/HydroATLAS/v1/Basins/level06–12` | vetor | Sub-bacias hidrográficas |
| CHIRPS diário | `UCSB-CHG/CHIRPS/DAILY` | ~5 km | Precipitação, erosividade, recarga |
| ESA WorldCover 2021 (v200) | `ESA/WorldCover/v200` | 10 m | Uso/cobertura, CN, infiltração |
| Sentinel-1 GRD (SAR) | `COPERNICUS/S1_GRD` | 10 m | Mapeamento de cheias |
| JRC Global Surface Water | `JRC/GSW1_4/GlobalSurfaceWater` | 30 m | Máscara de água permanente |
| MODIS NDVI (16 dias) | `MODIS/061/MOD13Q1` | 250 m | Fator de cobertura (RUSLE) |

### 3.3 Índices espectrais e mapeamento de alteração mineral

A partir de compósitos de mediana Sentinel-2 (filtragem de nuvens por QA60), o sistema calcula índices razão de bandas orientados à exploração:

- **Óxidos de ferro (Fe³⁺):** `B4/B2`.
- **Argilas (SWIR):** `B11/B8A`.
- **Alteração hidrotermal** (Crosta et al., 1998): `(B11+B4)/(B8A+B3)`.
- **Solo exposto (BSI):** `(B11+B4−B8−B2)/(B11+B4+B8+B2)`.
- **Alteração argílica/fílica — Al-OH:** `B11/B12`. A absorção Al-OH (~2200 nm) de sericite, caulinite e alunite recai na banda B12 (~2190 nm), pelo que a razão B11/B12 realça alteração argílica e fílica em sistemas epitermais e pórfiro.
- **Ferro ferroso (Fe²⁺):** `B12/B8A`, sensível a clorite, anfíbola e biotite (rochas máficas, alteração propilítica).
- **Gossan (capa de ferro):** `(B4/B2)·(B11/B12)`, combinando óxido de ferro e alteração argílica para realçar capas de oxidação sobre corpos sulfuretados.

Reconhece-se que o Sentinel-2 dispõe apenas de duas bandas SWIR, o que impede a separação completa das alterações argílica/fílica/propilítica; para tal recomenda-se o sensor ASTER (Rowan & Mars, 2003) num desenvolvimento futuro.

### 3.4 Análise de terreno e lineamentos estruturais

Sobre o DEM GLO-30 (suavizado por média focal), o sistema deriva elevação, declive (`ee.Terrain.slope`), sombreamento, hipsometria (normalização por percentis 2–98) e classes topográficas. Os **lineamentos** (proxies de falhas e fraturas) são extraídos por deteção de bordos em múltiplos azimutes: para azimutes de 0°, 45°, 90° e 135° gera-se o sombreamento e aplica-se o detetor de Canny (`ee.Algorithms.CannyEdgeDetector`), unindo-se os resultados; a orientação é obtida por gradientes de Sobel, produzindo densidade de lineamentos e diagramas de roseta. Perfis topográficos e curvas de nível ao longo de linhas definidas pelo utilizador completam o módulo.

### 3.5 Prospectividade mineral

A favorabilidade mineral (0–100) resulta de uma **combinação difusa ponderada** de índices normalizados, segundo predefinições por matéria-prima (ouro, cobre/ferro, entre outros). Cada predefinição declara pesos positivos para os índices favoráveis (p. ex., alteração hidrotermal, Fe-óxido, densidade de lineamentos) e conjuntos de inversão, produzindo um mapa de favorabilidade contínuo com legenda 0–100.

### 3.6 Hidrologia

- **Delimitação de bacia num ponto.** O método principal devolve a sub-bacia HydroBASINS (HydroATLAS, níveis 6–12) que contém o ponto clicado — um limite hidrologicamente definido, obtido em ~2 s. Como alternativa, mantém-se um algoritmo iterativo D8 sobre `HydroSHEDS/15DIR`, com *snapping* do ponto ao canal de maior acumulação.
- **Rede de drenagem e linhas de água** por limiarização da acumulação de fluxo (`15ACC`), com classificação multi-ordem.
- **Relatório hidro-ambiental de bacia:** morfometria (área, perímetro, elevação, declive, densidade de drenagem, compacidade de Gravelius, fator de forma de Horton), uso do solo (ESA WorldCover), regime de chuva mensal (climatologia CHIRPS) e escoamento potencial por **Curve Number** do SCS, remapeando as classes de cobertura para valores de CN.

### 3.7 Potencial de água subterrânea (AHP)

O potencial de água subterrânea é estimado por **sobreposição ponderada multicritério** segundo o *Analytic Hierarchy Process* (Saaty, 1980). Seis fatores hidrogeológicos são normalizados para [0,1] (normalização min–máx no recorte) e combinados:

$$ \mathrm{GWPI} = \sum_i w_i \cdot x_i $$

com os pesos: densidade de lineamentos (0,25), precipitação (0,22), declive (0,18; inverso), densidade de drenagem (0,13; inversa), índice de humidade topográfica TWI (0,12) e cobertura do solo/infiltração (0,10). O TWI é calculado como `ln(a / tan β)`, com *a* aproximado pela área de contribuição a montante (HydroSHEDS 15ACC) e β o declive. O índice resultante é classificado em cinco classes de potencial (muito baixo a muito alto). A litologia — fator relevante, mas dependente de um raster de permeabilidade — está identificada como sétimo fator a integrar.

### 3.8 Geoperigos

**Cheias (Sentinel-1 SAR).** Seguindo a prática recomendada da UN-SPIDER, a extensão de inundação é obtida por **deteção de mudança** na retrodifusão VV: compara-se a mediana do período do evento com uma linha de base (por omissão, os 60 dias anteriores). Considera-se inundação onde a retrodifusão desce acentuadamente (Δ < −3 dB) e é absolutamente baixa no evento (< −15 dB). Removem-se a água permanente (JRC, ocorrência > 40%), os declives acentuados (> 5°) e o ruído *speckle* (filtragem focal e remoção de aglomerados < 8 píxeis conexos). O radar penetra a cobertura de nuvens, o que é essencial durante ciclones.

**Erosão do solo (RUSLE).** O risco de perda de solo segue a Equação Universal de Perda de Solo Revista (Renard et al., 1997), `A = R·K·LS·C·P`:
- **R** (erosividade da chuva) a partir de CHIRPS anual: `R = 0,363·P + 79`;
- **K** (erodibilidade) como constante moderada (0,25) — limitação assumida, refinável com SoilGrids;
- **LS** (comprimento/declive) pela formulação de Wischmeier & Smith a partir do declive em percentagem;
- **C** (cobertura) a partir de NDVI MODIS: `C = exp(−2·NDVI/(1−NDVI))`;
- **P** = 1 (sem dados de práticas de conservação).

O resultado é classificado em cinco classes (t·ha⁻¹·ano⁻¹).

---

## 4. Resultados e discussão

A plataforma foi validada funcionalmente em cenários representativos, verificando-se a correção dos resultados e o desempenho interativo.

**Cheias — Ciclone Idai (Sofala, 15–25 março 2019).** A deteção por Sentinel-1 (14 cenas de evento; 52 de linha de base) estimou **~2085 km²** de área inundada, coerente com a extensão documentada da catástrofe em torno da Beira e do baixo Púnguè/Buzi.

**Erosão — Manica (2023).** O modelo RUSLE devolveu uma perda de solo média de **~2,5 t·ha⁻¹·ano⁻¹**, com as classes "alto" e "muito alto" concentradas nas vertentes íngremes do maciço de Manica, como esperado fisicamente. A substituição do compósito Sentinel-2 por NDVI MODIS reduziu o tempo de cálculo de >3 min para **~5 s**, sem perda de significado à escala provincial.

**Água subterrânea — Manica (2023).** O índice AHP produziu uma distribuição plausível, com predomínio de potencial moderado, zonas de potencial elevado alinhadas com vales e corredores de fraturação (elevada densidade de lineamentos e TWI) e potencial muito alto escasso — padrão consistente com o controlo estrutural da água subterrânea em terrenos de embasamento. Após otimização (uma única passagem de normalização e escalas de redução mais grosseiras), o cálculo executa em **~16 s**.

**Hidrologia.** A delimitação de sub-bacias por HydroBASINS responde em **~2 s**, contra 16–41 s (e resultados truncados) do algoritmo D8 iterativo, que foi remetido para papel de alternativa. Os relatórios de bacia integram morfometria, uso do solo, chuva mensal e escoamento SCS-CN num único painel.

**Alteração mineral.** Os índices Al-OH, ferro ferroso e gossan foram gerados com sucesso sobre a província de Tete, ampliando a capacidade de mapeamento de alteração para além dos índices clássicos de Fe-óxido e argilas.

Em conjunto, os resultados demonstram que uma arquitetura "cálculo no GEE → mosaicos → cliente" viabiliza análise multidomínio à escala nacional com tempos de resposta compatíveis com uso interativo.

---

## 5. Limitações

O sistema apresenta limitações que enquadram a interpretação dos resultados: (i) os índices de alteração baseiam-se em duas bandas SWIR do Sentinel-2, insuficientes para discriminar completamente alterações argílica/fílica/propilítica; (ii) o fator K do RUSLE é constante, subestimando a variabilidade edáfica; (iii) o modelo AHP de água subterrânea não integra ainda a litologia e os pesos, embora fundamentados na literatura, carecem de calibração local com dados de furos; (iv) a limiarização fixa na deteção de cheias pode requerer ajuste por evento; e (v) todos os produtos são modelos de suscetibilidade/favorabilidade e **não substituem trabalho de campo** nem medições diretas. Recomenda-se validação independente antes de qualquer decisão operacional.

---

## 6. Conclusões e trabalho futuro

O GeoMoz Explorer demonstra a viabilidade de uma plataforma integrada de geoanálise para Moçambique, unificando exploração mineral, recursos hídricos e geoperigos sobre a infraestrutura do Google Earth Engine, com uma interface acessível e desempenho interativo à escala nacional. A contribuição principal é metodológica e de engenharia: a orquestração coerente de múltiplas técnicas consagradas (razões de banda, AHP, RUSLE, deteção de mudança SAR, D8/HydroBASINS) num produto operacional e distribuível.

O trabalho futuro inclui: (1) a integração de modelos de **aprendizagem automática** (classificação litológica por imagem e predição a partir de registos de sondagem), consolidando a componente de inteligência artificial; (2) o refinamento do RUSLE com erodibilidade K derivada do SoilGrids; (3) a adição do modelo HAND (*Height Above Nearest Drainage*) à cartografia de cheias; (4) a inclusão da litologia como fator do AHP; e (5) a adoção de PostGIS com mosaicos vetoriais para a carta geológica a 1:250 000. A validação de campo e a calibração com dados locais são prioridades transversais.

---

## Agradecimentos

Ao Google Earth Engine e às agências que disponibilizam abertamente os conjuntos de dados utilizados (ESA/Copernicus, USGS/NASA, UCSB/CHIRPS, WWF/HydroSHEDS, JRC).

---

## Referências

- Crosta, A. P., Sabine, C., & Taranik, J. V. (1998). Hydrothermal alteration mapping at Bodie, California, using AVIRIS hyperspectral data. *Remote Sensing of Environment*.
- Funk, C., et al. (2015). The climate hazards infrared precipitation with stations (CHIRPS). *Scientific Data*, 2, 150066.
- Gorelick, N., Hancher, M., Dixon, M., Ilyushchenko, S., Thau, D., & Moore, R. (2017). Google Earth Engine: Planetary-scale geospatial analysis for everyone. *Remote Sensing of Environment*, 202, 18–27.
- Lehner, B., Verdin, K., & Jarvis, A. (2008). New global hydrography derived from spaceborne elevation data (HydroSHEDS). *Eos, Transactions AGU*, 89(10).
- Pekel, J.-F., Cottam, A., Gorelick, N., & Belward, A. S. (2016). High-resolution mapping of global surface water and its long-term changes. *Nature*, 540, 418–422.
- Renard, K. G., Foster, G. R., Weesies, G. A., McCool, D. K., & Yoder, D. C. (1997). *Predicting Soil Erosion by Water: A Guide to Conservation Planning with the RUSLE*. USDA Agriculture Handbook 703.
- Rowan, L. C., & Mars, J. C. (2003). Lithologic mapping using ASTER data. *Remote Sensing of Environment*, 84.
- Saaty, T. L. (1980). *The Analytic Hierarchy Process*. McGraw-Hill.
- UN-SPIDER (2019). *Recommended Practice: Flood Mapping and Damage Assessment Using Sentinel-1 SAR Data*. United Nations Office for Outer Space Affairs.
- Wischmeier, W. H., & Smith, D. D. (1978). *Predicting Rainfall Erosion Losses*. USDA Agriculture Handbook 537.
- Zanaga, D., et al. (2022). ESA WorldCover 10 m 2021 v200.

---

*Documento técnico gerado como parte da documentação do projeto GeoMoz Explorer. Os resultados numéricos referem-se a execuções de validação funcional e devem ser interpretados como demonstrativos, sujeitos a validação independente.*
