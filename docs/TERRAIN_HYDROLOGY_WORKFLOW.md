# Terreno e Hidrologia no GeoMoz

## Utilização
No GIS Workspace, abra **Terreno e Hidrologia**. Escolha um GeoTIFF de elevação com uma banda, uma camada raster do projecto ou Copernicus DEM através da ligação Earth Engine existente. Indique metros ou pés para ficheiros próprios, a resolução em metros e a área contribuinte mínima dos canais em km². Execute a análise; pode cancelá-la sem criar resultados parciais.

São adicionados ao projecto nove GeoTIFFs: DEM preparado, declividade, orientação, relevo sombreado, DEM corrigido, direcção D8, acumulação, canais potenciais e bacias de saída. Desactivar hidrologia produz os primeiros quatro. **Ver no mapa** selecciona o produto. Cada produto permite descarregar GeoTIFF e PNG; o conjunto permite PDF e JSON de proveniência.

A persistência usa a infraestrutura existente do projecto: cache local e, quando autenticado e disponível, Firebase. Confirme o indicador de sincronização antes de tratar a nuvem como backup. PDF/PNG/JSON devem ser descarregados na sessão; os rasters e histórico usam a persistência normal do workspace.

## Motor e método
Integração independente do motor Rust GeoLibre usado pelo RustGIS; não incorpora a aplicação desktop RustGIS nem substitui os outros motores GeoMoz. Dependência fixada em `geolibre-wasm@1.6.0`, executada num Web Worker cancelável. Os binários são incluídos no build e carregados quando se inicia a análise.

1. Verificação de banda, CRS, orientação, NoData, unidades e tamanho.
2. Conversão de elevações para metros, aplicação de scale/offset e reprojecção para UTM da área, com vizinho mais próximo e células da resolução solicitada.
3. Declividade em graus, orientação e hillshade.
4. Preenchimento de depressões e resolução de planos Garbrecht–Martz; ponteiro D8 Whitebox; acumulação em células.
5. Limiar de canais `ceil(km² × 1 000 000 / resolução²)` e bacias até às saídas do DEM.
6. Proveniência com SHA-256 da entrada e dos produtos, CRS, grelha, parâmetros, comandos e tempos.

## Limites
- Até 64 MiB por entrada, 4 194 304 células de origem e 1 048 576 células na análise; timeout de cinco minutos.
- Raster de uma banda, EPSG reconhecido, área local até 6° de longitude dentro da cobertura UTM. Grelhas com rotação ou eixos invertidos são reamostradas para norte; DEM sem CRS ou transformação válida é recusado.
- O recorte local é rectangular; não é uma máscara poligonal. NoData e limites do raster interrompem a contribuição hidrológica exterior.
- As bacias são de saída nas bordas, não bacias delineadas por exutório escolhido. A rede é potencial; não é previsão de inundação.
- Resolução mais fina não acrescenta detalhe à fonte. PNG/PDF usam pré-visualizações reduzidas até 512 pixels por dimensão; análise quantitativa deve usar os GeoTIFFs.
- A fonte GEE usa o endpoint existente de elevação: Copernicus GLO-30 com focal mean de 3 m. Requer sessão Earth Engine e download disponível; áreas grandes devem ser reduzidas.

## Validação desta entrega
- Testes executam os binários WASM reais sobre um DEM controlado: nove produtos, CRS, hashes, códigos D8, acumulação e canais.
- Declividade comparada com solução analítica de um plano conhecido.
- Rejeição de dados inválidos/NoData e parâmetros inválidos; limites de download, timeout e cancelamento; interface sem resultados parciais.
- TypeScript e build de produção verificados. Testes incorporados ao Frontend CI.
- O navegador Chromium local foi impedido pelo ambiente de execução (`socket: Operation not permitted`); não se declara validação visual nem download PDF/PNG em navegador nesta entrega.
- A aquisição GEE e a gravação Firebase autenticadas precisam de verificação com a sessão do utilizador. Testes locais não atestam essas permissões remotas.

## Correcção de desenho e georreferenciação (17-10-2026)
- O desenho mostra pontos desde o primeiro clique/toque, arestas e polígono; permite concluir por botão, desfazer e cancelar. O painel recolhe durante o desenho e regressa ao concluir/cancelar.
- O desenho e a AOI não esperam pelo carregamento das imagens de fundo. A AOI concluída é uma geometria Polygon e integra a camada da área desenhada.
- O recorte rectangular é activado ao desenhar para o fluxo de DEM local/camada; os limites são apresentados no painel.
- Leitura de ModelTransformationTag com GeoTIFF.js, pois GeoLibre 1.6 não a expõe. Reprojecção UTM por inversão afim completa e vizinho mais próximo, incluindo rotação, south-up e west-up. NoData externo à cobertura é preservado.
- Testes com WASM real comparam as células de saída com as células de origem em quatro grelhas (south-up, west-up, rodada e geográfica south-up), incluindo os nove produtos; testes de interacção verificam pontos, conclusão, desfazer e cancelamento enquanto o mapa de fundo carrega.
