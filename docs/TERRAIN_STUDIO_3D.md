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
