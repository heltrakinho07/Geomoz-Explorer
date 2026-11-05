# GeoMoz — Layout de impressão, identidade responsiva e digitalização

## Layout de impressão reutilizável

O GeoMoz Explorer disponibiliza um comando «Layout de impressão» no cabeçalho de cada módulo: Dashboard, Mapa, GeoAnálises, Bacias Hidrográficas, Água Subterrânea, Geoperigos, GeoMoz AI, Documentação, Exportar e o modo GIS Workspace no Explorer.

O componente `src/components/GeoMozPrintLayout.tsx` captura a vista real actualmente montada em `#geomoz-active-module` usando html2canvas. A composição inclui logótipo GeoMoz, título, subtítulo, fontes/créditos, data, notas, legenda editável e rodapé GEOLÍTHICA. Permite A4/A3 vertical/horizontal. «Imprimir / Guardar PDF» chama a impressão do navegador (que suporta «Guardar como PDF»). Não envia dados ou imagens ao Firebase.

Limitações: mapas WebGL/Cesium/MapLibre, WMS e mosaicos externos podem bloquear capturas por CORS ou produzir vistas incompletas. O utilizador é avisado a confirmar visualmente a pré-visualização; se a captura falhar, o botão Imprimir fica desactivado. Escala e CRS são manuais e devem ser conferidos. Seta de norte desactivada por defeito em mapas rodados/3D. A legenda é fornecida pelo utilizador e não inventa classes ou cores. Exportações PDF do dossiê técnico permanecem preservadas.

O modo SIG Web dedicado em `/gis-workspace/` preserva a sua composição cartográfica nativa em «Resultados → Layout de impressão» (comando `project.print-layout`). Não se altera o motor de composição upstream; o nome da ferramenta foi alinhado.

## Identidade GeoMoz em todo o Explorer

- Paleta: marinho #020617, azul profundo #082f49, primário #0284c7, azul-claro #38bdf8. Superfícies claras e tema escuro existente.
- `src/styles/geomoz-system.css` uniformiza cores, foco visível e distribuição responsiva dos módulos Explorer.
- `src/styles/gis-workspace.css` passa de verde/teal a azul GeoMoz, sem alterar rampas raster, simbologia geológica ou cores de dados científicos.
- O layout de impressão adapta o painel de opções a ecrãs pequenos, com pré-visualização rolável.

## Auditoria real da digitalização

Existem duas capacidades diferentes já presentes antes desta alteração:

1. No Mapa 2D, `src/components/MapDraw.tsx` permite delinear AOI como polígono, rectângulo ou linha. Não é um editor completo de atributos de camadas.
2. No GeoMoz GIS Workspace, o comando real `plugin.maplibre-gl-geo-editor` mantém modos de desenho `polygon`, `line`, `rectangle`, `marker` e de edição geométrica `select`, `drag`, `change`, `delete`. A configuração `GEOMOZ_ROLLOUT.advancedDrawing=false` desactiva propriedades/atributos (`showFeatureProperties:false`, `enableAttributeEditing:false`).

O comando passa a ser apresentado como «Digitalizar / editar», com informação clara de que a edição de atributos, topologia e gravação avançada ainda não estão certificadas. Não se activou essa funcionalidade silenciosamente.

## Verificações

- Vitest `src/components/__tests__/GeoMozPrintLayout.test.tsx`: A4/A3, orientação, captura de imagem e bloqueio por erro CORS.
- Testes `scripts/tests/geomoz-workbench-profile.test.mjs`: comandos de impressão e desenho reais e limites de edição avançada.
- CI: compilações React/Vite e GIS Workbench; testar manualmente Chrome/Firefox, pré-visualização móvel, mapas 2D/3D e PDF impresso antes de confirmar fidelidade de cada fornecedor de mapas.
