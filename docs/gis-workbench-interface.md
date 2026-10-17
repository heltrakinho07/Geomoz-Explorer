# GeoMoz Workbench

A interface de /gis-workspace/ pertence ao GeoMoz. O motor GIS MIT continua fixado em opengeos/GeoLibre f69688ed5be750c496b51b865cee513d910a433f.

## Organização

- Área de estudo: desenho/importação da área, navegação, medição e localização.
- Dados: ficheiros vectoriais/GeoPackage, raster/DEM, CSV e serviços WMS/WFS/XYZ/WMTS.
- Análise: operações vectoriais essenciais e ferramentas de terreno seleccionadas.
- Resultados: execuções reais, erros, saídas e composição do mapa.
- Projecto na barra superior: criar, abrir, guardar, recuperar e exportar.
- Catálogo: pesquisa, visibilidade efectiva dos grupos, enquadramento, opacidade suportada, tabela, simbologia e propriedades.
- Propriedades: nome, ordem, grupo e exportação GeoJSON, respeitando o modo de leitura e as permissões.

Os comandos rápidos vêm do mesmo registo filtrado por capacidades e privilégios que os menus. Não executam cliques no DOM nem contornam indisponibilidades. A tabela respeita a capacidade de consulta da camada. Os diálogos, controlos do mapa, painéis de extensões, colaboração e ferramentas continuam a usar as suas APIs originais.

## Compilação

1. Fazer checkout limpo da revisão fixada em .geolibre-upstream.
2. Executar node scripts/prepare-geomoz-workbench.mjs .geolibre-upstream.
3. Instalar o lockfile do motor com npm ci e compilar com GEOLIBRE_APP_BASE=/gis-workspace/.
4. Empacotar com scripts/brand-geolibre-web.mjs; este preserva os recursos, workers e licença MIT.

A preparação valida os pontos de integração no código fonte e falha se a revisão não corresponder. Os componentes próprios ficam em scripts/assets/workbench. Nunca se altera JavaScript minificado. Os workflows de PR e publicação usam exactamente a mesma preparação.

## Tema global

artifacts/geomoz-react/public/geomoz-theme.js inicializa o tema antes de React. A preferência explícita geomoz_theme prevalece; sem escolha explícita, acompanha o sistema operativo. A API window.GeoMozTheme sincroniza os hooks React, outras abas, a página inicial, o portal, o Workbench e as páginas legais estáticas. Armazenamento bloqueado não impede a interface de funcionar. O modo nocturno altera as superfícies e controlos; as cores científicas das camadas mantêm o seu significado.

## Validação

O workflow GeoMoz Workbench CI compila TypeScript e executa o navegador com o resultado da compilação: importa GeoJSON, altera visibilidade e opacidade, executa Buffer, consulta resultados, verifica os menus curados, verifica persistência do tema e adaptação móvel. As capturas claro/nocturno/móvel ficam no artefacto geomoz-workbench-browser-checks.

Frontend CI mantém a regressão Cesium do módulo interno e verifica também o tema na navegação e nas páginas legais. As verificações da publicação confirmam os ficheiros e a política efectivamente servidos pelo Hosting.


## Perfil essencial GeoMoz

A experiência principal tem quatro etapas: Área de estudo → Dados → Análise → Resultados. O menu Projecto permanece na barra superior para abrir, guardar e recuperar o trabalho. Resultados abre o histórico no catálogo; a composição do mapa e a exportação de camadas continuam disponíveis.

A política única está em `scripts/assets/workbench/geomoz-workbench-profile.ts`. É um filtro de produto aplicado depois das verificações existentes de capacidades, privilégios e compatibilidade. Não concede permissões. As preferências de complexidade guardadas pelo utilizador não podem contornar este filtro.

SQL/Python/modelador, catálogos e formatos especializados, ferramentas não curadas, navegação rodoviária, efeitos, ligações a visualizadores externos, gestor de extensões e gestão completa ficam ocultos. Os registos, leitores, algoritmos, callbacks e componentes originais permanecem no código. `GEOMOZ_ROLLOUT` permite reintroduzir grupos após adaptação e revisão; não há interruptor por URL ou localStorage.

O mesmo filtro abrange a faixa superior, pesquisa fixa e dinâmica, atalhos, menus de dados, listas dos diálogos, reexecução de ferramentas no histórico e menu de contexto. O Browser genérico e o arranque automático do S3 deixam de ocupar o catálogo. Nenhum projecto, camada, histórico ou preferência existente é apagado.

As propriedades próprias mantêm renomeação, ordem, grupo e exportação GeoJSON com os guardas de colaboração, permissões e modo de leitura. O painel completo original continua montado e oculto. O tema global permanece partilhado com todo o sistema.

O editor de área oferece polígono, linha, rectângulo e ponto, com selecção, deslocação, edição de vértices e remoção. Modos avançados e volumetria 3D, incluindo o formulário de altura, ficam ocultos através de advancedDrawing; os modos e atributos originais são preservados.

A integração de sismicidade USGS/ISC publicada em paralelo é preservada em Dados → Catálogos sísmicos. Os clientes, estilos e testes de sismicidade continuam activos; não foi criada uma quinta etapa no fluxo principal.
