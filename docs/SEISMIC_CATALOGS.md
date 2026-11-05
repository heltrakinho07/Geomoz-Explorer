# Catálogos sísmicos no GeoMoz GIS Workspace — fase 1

## Estado e fontes

O separador **Sismicidade** do GeoMoz GIS Workspace usa o mesmo renderer e store de camadas do Workbench React com motor GeoLibre. Não é uma segunda janela nem um overlay cartográfico fictício.

- **USGS/NEIC** — endpoint FDSN Event \`https://earthquake.usgs.gov/fdsnws/event/1/query\` com \`format=geojson\`, \`eventtype=earthquake\`, filtros de data, bounding box, magnitude, profundidade e limite máximo de 2 000 registos.
- **ISC** — endpoint \`https://www.isc.ac.uk/fdsnws/event/1/query\` com \`format=text\` e normalização do formato FDSN delimitado por \`|\`.
- **EarthScope** — o serviço antigo \`service.iris.edu/fdsnws/event/1/\` foi desactivado em 1/06/2026. Estações continuam acessíveis em \`https://service.earthscope.org/fdsnws/station/1/\` e formas de onda em \`https://service.earthscope.org/fdsnws/dataselect/1/\`, mas **não** são importadas nesta fase.
- Referências: https://www.earthscope.org/news/retirement-of-the-fdsnws-event-web-service/ ; https://earthquake.usgs.gov/fdsnws/event/1/ .

## Funcionamento

Em GIS Workspace → Sismicidade, selecionar catálogo, área, período, magnitude, intervalo de profundidade e limite. A consulta é directa do browser às APIs oficiais, sem upload automático para Firestore, Firebase Storage ou outra nuvem. Os epicentros são normalizados para pontos GeoJSON com longitude/latitude EPSG:4326, magnitude, magnitudeType, profundidade em km, data UTC, origem e ID de evento. Podem ser inseridos como camada nativa, enquadrados e exportados em GeoJSON/CSV.

Os eventos de fontes distintas são mantidos separadamente: o ISC e USGS podem apresentar localizações e magnitudes diferentes para o mesmo sismo. **Não** se faz deduplicação automática. Um valor de magnitude sem tipo não significa Mw. Valores desconhecidos permanecem nulos. Os resultados têm limites e sinalização de possível truncamento; para séries completas, consultar em janelas curtas e agregar depois.

O botão «Adicionar ao mapa» só aparece habilitado quando a implementação permite \`data:add\`; o modo viewer não apresenta a tarefa. Guardar explicitamente o projecto pelo motor GeoLibre se for necessário persistir o mapa no dispositivo. No caso de um browser impedir pedidos CORS a determinado serviço, a consulta apresenta erro visível — não simula resultados. O ISC poderá necessitar de um **proxy próprio GeoMoz** com validação e caching, a desenvolver caso a política CORS da origem o exija.

## Segurança, desempenho e extensão

\`scripts/assets/workbench/seismic-data.ts\` apenas constrói URLs para dois hosts permitidos; rejeita intervalos, áreas e magnitudes inválidas e respostas excessivas. Não guarda eventos remotamente. Formatos de exportação são gerados com Blob apenas quando solicitados. A UI e o mapper do GeoLibre mantêm a responsabilidade de adicionar, consultar e exportar camadas.

Próxima fase sugerida: filtros espaciais pela AOI do mapa e selecção poligonal, simbologia proporcional a magnitude e classes de profundidade, gráficos magnitude-tempo/hipocentros, Gutenberg–Richter com avaliação da magnitude de completude, perfis sísmicos e API GeoMoz de fallback para ISC com rate limit/caching. Estações EarthScope e miniSEED numa etapa posterior, distintos de catálogo de eventos.

## Testes

- \`node --test scripts/tests/seismic-data.test.mjs\` (Node.js 24).
- \`node scripts/prepare-geomoz-workbench.mjs .geolibre-upstream\` após clone fixo upstream.
- Workflow GeoMoz Workbench CI: compilação original React/Vite, teste Playwright com resposta USGS simulada, confirmação da camada GeoJSON no catálogo, e verificação viewer read-only.
- Após a publicação, ensaiar consultas **reais** pequenas USGS e ISC, carregamento cartográfico e tratamento de CORS com redes diferentes.
