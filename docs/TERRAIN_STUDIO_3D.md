# GeoMoz 3D Terrain Studio — primeira implementação

## Acesso
- **Catálogo de GeoAnálises > Relevo, Topografia e Morfologia > Gerar mapa 3D**
- **GIS Workspace > Raster · Gerar terreno 3D a partir de DEM**

O visualizador abre um modal dedicado sem substituir o mapa existente.

## Fontes e processamento
1. **GeoTIFF/COG local:** o utilizador autenticado envia um ficheiro de até 32 MB para `POST /geomoz-api/terrain/mesh`. O servidor usa Rasterio numa execução isolada do ciclo assíncrono, lê a banda 1, reprojeta para UTM adequado (ou EPSG:3857 para latitudes extremas), reamostra para uma pré-visualização de 193 × 193 e devolve um JSON com CRS, extensão métrica, estatísticas e alturas. O ficheiro não é persistido.
2. **Copernicus GLO-30 pelo GEE:** em GeoAnálises, uma AOI definida e uma sessão GEE válida permitem usar `POST /geomoz-api/terrain/gee-mesh`. O servidor usa o mecanismo já existente `get_index_download_url("elevation")`, adaptando a escala da pré-visualização à extensão da AOI. O URL de download é obtido e descarregado apenas pelo backend, com limites de tamanho e de origem.
3. **Renderer:** WebGL2 (módulo `terrain-webgl.ts`) constrói uma grelha métrica, descarta triângulos com NoData, calcula normais e aplica iluminação direccional. Controlo orbital por rato, zoom e exagero vertical.
4. **Texturas:** paletas hipsométricas ou cinzentos; uma imagem PNG/JPG/WebP opcional só deve ser aplicada se representar exactamente a mesma extensão e orientação do DEM. A aplicação não tenta registar automaticamente imagens não georreferenciadas.
5. **Exportação:** PNG da vista actual e PDF paisagem com perspectiva, CRS, fonte e exagero vertical. O PDF não indica escala métrica invariável, pois uma vista em perspectiva não tem escala uniforme.

## Segurança e limites
- Ambos os endpoints exigem autenticação; a variante GEE também exige as credenciais do Earth Engine.
- Uma região GEE explícita é obrigatória. Não é permitido descarregar um DEM global sem delimitação.
- Limites: 32 MB por GeoTIFF, 100 milhões de células na fonte, grelha final de 193² e texturas até 16 MB.
- O sistema preserva as células NoData: não substitui elevações desconhecidas por zero ou valores fictícios.
- A resolução do raster de origem não deve ser confundida com a resolução da pré-visualização. Exportações PNG/PDF são visualizações, não produtos raster analíticos.
- Recomenda-se impor limites adicionais na infraestrutura (proxy/Cloud Run) e executar testes de carga antes de expor o serviço a grandes volumes.

## Testes
```bash
python -m pytest geomoz-explorer/tests/test_terrain_dem.py -v
pnpm run typecheck
pnpm --dir artifacts/geomoz-react test
```

## Referências para evolução
- [milos-agathon/forge3d](https://github.com/milos-agathon/forge3d): motor nativo Rust/Python com renderização científica, potencial futuro serviço de exportação de alta qualidade.
- [milos-agathon/forge3d-web](https://github.com/milos-agathon/forge3d-web): runtime WebGPU/WASM. A documentação upstream classifica a cobertura física dos navegadores como não comprovada; não está incluído no caminho crítico desta primeira versão.
- [milos-agathon/3d-digital-elevation-maps](https://github.com/milos-agathon/3d-digital-elevation-maps): referência visual Rayshader/Rayvista. Sem licença explícita no tutorial; não se copiou código.
- A malha WebGL2 desta fase é uma implementação original do GeoMoz. Não se copiou código dos repositórios Rayshader sem licença explícita.

## Próxima fase
- Integração com o gestor central de camadas e o projecto `.geomoz` para carregar automaticamente GeoTIFF já presentes no Workspace.
- Texturas Sentinel-2 ou Landsat georreferenciadas automaticamente (reprojecção/alinhamento).
- Terreno por tiles com vários níveis de detalhe para AOIs extensas.
- Exportação GLB/glTF e renderizador Forge3D opcional em worker/GPU, apenas após testes de compatibilidade/licenciamento.
- Internacionalização completa das strings do novo módulo.

## Avanços de integração (11/2026)
- **Sessão partilhada no Explorer:** as vistas de GeoAnálises e GIS Workspace reutilizam a mesma malha de pré-visualização, enquanto o utilizador e o projecto activo não mudarem. O estado é descartado na mudança de identidade/projecto; não existe gravação automática do raster em Firestore.
- **AOI e GEE também no GIS Workspace:** a opção de gerar Copernicus GLO-30 usa a área de estudo seleccionada no projecto e as credenciais GEE já autenticadas.
- **Cenas portáteis .geomoz:** o comando «Guardar .geomoz» cria um ficheiro local auto-suficiente com a grelha simplificada, CRS, limites métricos, estatísticas e visualização. «Reabrir cena 3D» valida o ficheiro antes de o desenhar. Esta extensão representa exclusivamente uma *cena de pré-visualização*, não um projecto GIS completo, nem o GeoTIFF original, nem uma textura externa.
- **Textura raster georreferenciada:** `POST /geomoz-api/terrain/rgb-texture` recebe GeoTIFF RGB com CRS e as dimensões/extensão da malha, projecta as três bandas para a mesma grelha com Rasterio e devolve PNG RGBA para renderização. Pixels sem dados na textura revelam o relevo hipsométrico em vez de produzirem uma superfície preta.
- **Maior segurança no download do GEE:** cada URL, incluindo redireccionamentos, é verificado contra destinos HTTPS Google permitidos. A descarga é limitada a 32 MB; arquivos ZIP exportados pelo GEE são descompactados de forma limitada e não são escritos no sistema de ficheiros.
- **Exportação PDF:** mantém a proporção da vista, inclui nome do projecto e indica explicitamente a inexistência de escala constante em perspectiva.

### Comandos de validação
```bash
python -m pytest geomoz-explorer/tests/test_terrain_dem.py geomoz-explorer/tests/test_terrain_texture.py -v
pnpm --dir artifacts/geomoz-react exec vitest run src/lib/__tests__/terrain-scene.test.ts
pnpm run typecheck
pnpm run build
```

### Restrições explícitas
- Para importar uma ortofoto/Sentinel-2 como GeoTIFF RGB, as bandas 1/2/3 devem representar R/G/B. É necessária georreferenciação válida; PNG sem referência só pode ser aplicado com alinhamento manual prévio.
- O modelo é reamostrado para visualização, não para medições científicas de detalhe.
- Forge3D-Web permanece numa via experimental separada; ainda não é uma dependência de produção.


## Integração nativa GIS Workspace → Terreno 3D (fase 2026-11-04)

- **Sem iframe e sem mensagens entre aplicações:** `GeoMozTerrainWorkspace` é um componente React nativo do GIS Workbench, ligado ao mesmo `useAppStore` do GeoLibre. A sessão, as camadas, a selecção e o mapa 2D permanecem em memória.
- **DEM existente sem segunda importação:** `terrainRasterLayerOptions` identifica as camadas COG/GeoTIFF com fonte exportável. O navegador descarrega, com limite de 32 MB em streaming, os bytes da mesma origem já associada à camada. `geomoz-native-terrain-dem.ts` lê a banda altimétrica com geotiff.js e calcula a pré-visualização com proj4. Preserva NoData e aceita CRS EPSG:4326, 3857 e UTM WGS84 32601–32660 / 32701–32760. Outros CRS precisam de conversão prévia nas ferramentas Raster.
- **Um único motor 3D:** os ficheiros `terrain-webgl.ts`, `terrain-analysis.ts` e `terrain-scene.ts` do Explorer são incorporados no build do GeoLibre a partir das mesmas fontes. A vista 3D renderiza directamente num canvas WebGL2.
- **Picking real de terreno:** quando o utilizador activa A ou B, o renderer intersecta o clique com os triângulos projectados da malha, calcula a cota da superfície e converte as coordenadas métricas em longitude/latitude.
- **Linha A→B sobreposta ao 3D:** os perfis seleccionados são amostrados na malha e representados em linhas e pontos directamente no WebGL, acima da superfície.
- **Devolução ao projecto:** o botão «Adicionar perfil ao projecto SIG» cria uma camada GeoJSON MultiLineString com altitudes; «Adicionar curvas ao catálogo SIG» cria a camada GeoJSON de curvas de nível. Ambas usam `useAppStore().addGeoJsonLayer` e permanecem no projecto 2D após fechar a vista 3D.
- **Exportações:** cena de pré-visualização `.geomoz`, PNG/PDF da vista 3D; perfil CSV/PNG/PDF e curvas GeoJSON.

### Critérios de validade e limites

- A geometria de perfis e curvas resulta de uma **grelha de pré-visualização 193 × 193**, não da resolução original do DEM. Para resultados finais, gerar curvas e declives no módulo Raster sobre o GeoTIFF original.
- Restrições: ficheiro até 32 MB, fonte até 100 milhões de pixels, número e tamanho de curvas limitados. O raster original não é duplicado em Firestore nem em Cloud Run.
- Rotação/skew de GeoTIFF, CRS sem identificação EPSG válida e projeções diferentes das explicitadas requerem conversão ou reprojectação prévia.
- O GEE autenticado continua acessível ao módulo Terreno 3D do GeoMoz Explorer; a nova execução puramente local no GIS Workbench não reutiliza credenciais pessoais Google/GEE.
- Escalabilidade COG por janelas/tiles e LOD, texturas Sentinel/Landsat automáticas, persistência da cena no projecto completo e GLB/glTF permanecem a desenvolver.

### Testes integrados

O pipeline `GeoMoz Workbench CI` compila o motor GIS upstream e executa `scripts/integration/geomoz-raster-browser.cjs`, que deve verificar o uso de um DEM real do catálogo, a criação do canvas WebGL, a consulta da superfície, o perfil A→B, as curvas de nível e a preservação da camada original. O frontend executa os testes de geometria, precisão, NoData e picking do renderer.


## Fase de visualização avançada — Sentinel-2 RGB, GLB e LOD

- **Sentinel-2 SR harmonizado (GeoMoz Explorer):** ao carregar um DEM e autenticar o Earth Engine, use «Aplicar Sentinel-2 RGB ao terreno». O servidor seleciona as imagens dos últimos 12 meses, aplica máscara SCL (nuvens/água/solo) já utilizada pelo módulo de análises espectrais, faz uma composição mediana RGB B4/B3/B2 e exporta uma imagem GeoTIFF de 3 bandas na **mesma grelha UTM/metric** do DEM; a transformação e o CRS são explicitamente fornecidos. O raster RGB é então reprojetado para a malha e convertido em PNG RGBA. NoData permanece transparente. Nenhuma imagem é persistida no servidor.
- **Segurança GEE:** o endpoint `/geomoz-api/terrain/gee-rgb-texture` exige Firebase e credenciais GEE do utilizador. Downloads seguem o mesmo verificador de hosts Google, streaming e limite de 32 MB do DEM. A composição é serializada com outros pedidos GEE, validando dimensões da grelha, CRS, datas, nuvens e uma AOI até 300 km por lado.
- **GLB (glTF 2.0):** o botão «GLB 3D» exporta a malha em **metros locais**, com altura relativa à menor elevação e factor de exagero vertical. Omite os triângulos NoData, incorpora atributos de CRS, coordenadas e datum vertical em `extras` e, quando a textura actual é RGB, inclui a imagem no único ficheiro GLB. Sem textura, usa cores hipsométricas por vértice. O modelo não está georreferenciado por um formato glTF universal: os `extras` GeoMoz preservam a georreferenciação para futura reimportação.
- **LOD de renderização:** «Automático» alterna entre índices de detalhe completo, 2 e 4 consoante o zoom. «Detalhe máximo», «Equilibrado» e «Rápido» permitem escolha manual. Triângulos de baixa resolução não atravessam células NoData. O LOD reduz o **número de triângulos desenhados**, mas não aumenta a resolução da malha de pré-visualização nem permite abrir DEM >32 MB; blocos COG com carregamento progressivo continuam para fase posterior.
- **Compartilhamento:** o motor WebGL, o exportador GLB e as rotinas de LOD são o mesmo código-fonte nos módulos Explorer e GIS Workspace. A fonte `terrain-glb.ts` é copiada com import ajustado no build do GeoLibre.
- **Testes:** `terrain-glb.test.ts` verifica cabeçalho GLB, chunks JSON/BIN, máscaras NoData, textura binária, tamanho do DEM 193×193 e níveis de detalhe. `test_terrain_satellite.py` executa verificação de grelha, períodos, filtros e pedido GEE simulado, sem credenciais reais. A autenticação real do GEE exige validação manual.
