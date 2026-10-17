# GeoMoz Workbench

A interface de /gis-workspace/ pertence ao GeoMoz. O motor GIS MIT continua fixado em opengeos/GeoLibre f69688ed5be750c496b51b865cee513d910a433f.

## Organização

- Projecto: criar, abrir, guardar, importar projectos e gerir colaboração.
- Dados: importar camadas e consultar catálogos; opções completas no menu secundário.
- Mapa: navegação, medição, pesquisa e apresentação.
- Análise: operações vectoriais, terreno, SQL e ferramentas completas.
- Publicar: composição, gravação e partilha quando configurada.
- Definições: extensões, estilos, perfis e diagnóstico.
- Catálogo: pesquisa, visibilidade efectiva dos grupos, enquadramento, opacidade suportada, tabela e simbologia.
- Resultados: histórico real de execuções, erros e ligações às saídas ainda presentes no mapa.
- Gestão: operações completas do motor, incluindo grupos, exportação, renomeação e ferramentas avançadas.

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

O workflow GeoMoz Workbench CI compila TypeScript e executa o navegador com o resultado da compilação: importa GeoJSON, altera visibilidade e opacidade, executa Buffer, consulta resultados, usa menus completos, verifica persistência do tema e adaptação móvel. As capturas claro/nocturno/móvel ficam no artefacto geomoz-workbench-browser-checks.

Frontend CI mantém a regressão Cesium do módulo interno e verifica também o tema na navegação e nas páginas legais. As verificações da publicação confirmam os ficheiros e a política efectivamente servidos pelo Hosting.
