# GeoMoz GIS Workspace — execução local, inspirada no GeoLibre

## Objectivo

Aceder a `/gis-workspace` abre um ambiente SIG com barra de menus própria, mapa MapLibre, camadas vectoriais/raster, serviços OGC, processamento Turf/DuckDB/Whitebox WASM e ferramentas de terreno.

A interface usa a identidade GeoMoz. Esta integração não instala uma segunda aplicação GeoLibre nem substitui as ferramentas geoespaciais existentes.

## Privacidade e ciclo de vida

- **Modo sessão (predefinição, disponível para todos):** o GIS Workspace não faz `getDoc`, `uploadBytes`, autosave Firestore/Storage, nem escrita automática em IndexedDB/localStorage. Mantém o estado numa referência de memória do separador.
- **Guardar no dispositivo (IndexedDB, opção explícita):** os botões «Guardar no dispositivo» e «Restaurar cópia» armazenam/recuperam o estado SIG e os ficheiros GeoTIFF locais no próprio navegador. O identificador da cópia é separado por UID e projecto (ou por sessão guest). Não há qualquer envio destes dados para Firebase. «Apagar cópia local» exige confirmação e elimina só a cópia IndexedDB desse Workspace, sem afectar a sessão aberta ou os dados cloud. Falhas de quota/armazenamento são apresentadas ao utilizador em vez de se anunciar um backup inexistente. Os dados IndexedDB não se sincronizam entre dispositivos e podem ser eliminados pelo navegador.
- **Infraestrutura reservada:** Firestore, Firebase Storage e IndexedDB existentes permanecem no projecto; não foram removidos os serviços de sincronização anteriores, as regras de acesso ou os conteúdos legados.
- **Guardar projecto:** gera um ficheiro `.geomoz.json` descarregado pelo navegador contendo camadas vectoriais GeoJSON, configurações e referências de serviços. É necessário escolher «Guardar projecto» antes de actualizar ou fechar a página.
- **Abrir projecto:** lê esse ficheiro **localmente**, sem upload. URLs públicas de COG podem ser novamente carregadas; ficheiros GeoTIFF seleccionados do computador **não são incorporados** no JSON — reimporte-os.
- Operações que explicitamente dependem de **serviços externos** (tiles de mapa, DEM AWS, WMS/WFS/WMTS/STAC, GEE, ou processamentos backend opcionais) continuam a contactar esses serviços apenas quando o utilizador as executa. «Sem BD» **não significa offline para downloads remotos**.
- Funcionalidades de contas, autenticação e projectos fora desta guia não são alteradas.
- **Cloud PRO / Premium (em preparação, não vendido nem activado):** `src/services/gisWorkspaceCloudService.ts` preserva os serviços Firestore/Storage e `src/lib/gis-workspace-pro-storage.ts` mantém uma ponte independente que valida a identidade Firebase e custom claims `geomoz_pro` ou `geomozPro` emitidas pelo servidor. A interface indica «Cloud PRO · em preparação» e não efectua upload. A autorização deve ser confirmada em backend e nas Security Rules antes de qualquer disponibilização, juntamente com o sistema de subscrições e quotas. Não confundir uma opção de UI com cobrança ou subscrição já activa.
- **Segurança e comercialização:** o controlo por custom claim do lado do cliente não basta para cobrar ou proteger recursos Pro. Antes de disponibilizar a sincronização Pro, aplicar regras Firestore/Storage que verifiquem a claim, integrar verificação administrativa de pagamentos e testar migração/isolamento dos dados. Não permitir que campos editáveis pelo utilizador atribuam acesso Pro.
- **Dados anteriores:** não executar migrações destrutivas nem limpar documentos Firestore, objectos Storage ou bases IndexedDB existentes. O novo modo sessão não consulta nem apaga esses dados. No modo IndexedDB opcional, «Restaurar cópia» pode ler uma cópia anterior do mesmo UID e projecto, mas pede confirmação antes de substituir o trabalho aberto. A futura recuperação Pro deverá ser iniciada explicitamente pelo titular do projecto, após entitlement e reconciliação de versões, antes de guardar.

## DEM Global — algoritmo do GeoLibre

Comportamento baseado em:

1. [GeoLibre global-dem.ts](https://github.com/opengeos/GeoLibre/blob/main/apps/geolibre-desktop/src/lib/global-dem.ts): selecção dinâmica do zoom até um máximo de 64 mosaicos, `EPSG:4326` para a extensão de entrada, e mosaicos públicos AWS Terrain Tiles.
2. [GeoLibre cog-convert.ts](https://github.com/opengeos/GeoLibre/blob/main/packages/processing/src/cog-convert.ts): codificação de um COG Float32 com `geolibre-wasm/CogBuilder` e overviews, em `EPSG:3857`.

Dados originais em `https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif` (fonte de elevação pública; consulte os termos e a cobertura na fonte original).

Fluxo: **seleccionar AOI** (polígono de estudo) ou **usar a extensão actual do mapa** → **DEM Global** → descarregar tiles GeoTIFF públicos em lotes de até quatro → decodificar com geotiff.js → unir e recortar em RAM → escrever COG Float32 com o `CogBuilder` WebAssembly → adicionar ao motor MapLibre em memória.

O limite de 64 mosaicos implica ajuste da resolução conforme a extensão solicitada; **não se deve anunciar o resultado como sempre 30 m**. A resolução estimada (em metros/píxel na projecção EPSG:3857) é exibida após o carregamento. Uma operação interrompida não cria a camada.

**Diagnóstico:** indisponibilidade AWS, CORS, qualidade/NoData da fonte, memória insuficiente ou falha WASM produzem erro informativo; não se deve substituir por píxeis de elevação inventados. Dados para análise científica devem ser validados quanto à fonte, resolução, datum e NoData.

## Licença e reconhecimento

Integração baseada na metodologia e nas funções públicas do projecto **GeoLibre** de Qiusheng Wu (2026), sob **licença MIT**. Copyright © 2026 Qiusheng Wu. Código upstream: https://github.com/opengeos/GeoLibre ; licença canónica: https://github.com/opengeos/GeoLibre/blob/main/LICENSE .

A adaptação específica é mantida em:
- `src/lib/gis-global-dem.ts`;
- `src/lib/gis-workspace-session.ts`;
- `src/lib/gis-workspace-device-storage.ts` (cópias manuais IndexedDB sem cloud);
- `src/pages/GeoProcessamento.tsx` e `src/pages/Explorer.tsx`.

Esta primeira fase utiliza motores já integrados no GeoMoz e **não** representa a incorporação integral das ferramentas, plugins e interfaces disponíveis no GeoLibre. Importação de projectos com ficheiros COG incorporados, Browser avançado, formatos adicionais e testes com grandes DEMs reais são melhorias futuras.
