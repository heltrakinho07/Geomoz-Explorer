# GeoMoz GIS Workspace — cartografia geológica e temática (digitalização)

## Trabalho no mapa, no estilo QGIS

O GeoMoz GIS Workspace usa agora a gestão completa de camadas do motor SIG aberto, com interface GeoMoz, mantendo o catálogo e o contexto do projecto. O separador «Gestão» apresenta o gestor original de camadas, exportação, tabelas de atributos e operações avançadas. O assistente «Nova camada geológica / temática» cria camadas GeoJSON **vazias** com um esquema de atributos persistente; nunca introduz polígonos fictícios.

1. Crie ou abra um projecto e seleccione a área de estudo.
2. No catálogo, clique em «Nova camada geológica / temática». Escolha entre unidades geológicas (polígonos), falhas/contactos (linhas), observações de campo (pontos) e três camadas temáticas (ponto, linha, polígono). Introduza nome e eventuais campos adicionais de texto, número ou inteiro.
3. Seleccione a camada e clique «Editar geometria» (se houver permissão de edição). O motor original activa automaticamente o editor Geoman e liga a sessão **à camada seleccionada**, não apenas a uma sobreposição visual. Digitalize a geometria; use o comando de guardar geometria para consolidar as feições no estado real da camada. Pode descartar a sessão.
4. Abra «Tabela» para editar os valores, tipos e domínios. O formulário dos campos é guardado na configuração da camada, incluindo campos personalizados; os novos objectos desenhados recebem chaves com valores vazios/nulos, nunca atributos geológicos inventados.
5. Use «Simbologia» ou «Gestão → Propriedades → Estilo» para aplicar cores, classes categóricas/quantitativas, traços, símbolos e rótulos a partir de atributos medidos.
6. Confirme topologia e a consistência das unidades/idades; guarde o projecto no dispositivo e exporte as camadas para GeoJSON ou outros formatos suportados. Use «Resultados → Layout de impressão» para criar a composição cartográfica com escala/CRS correctos e legenda.

## Esquemas científicos

- **Unidades geológicas**: código, unidade, litologia, idade, formação/complexo, descrição, fonte e confiança.
- **Falhas e contactos**: código, tipo, cinemática, rumo e mergulho (graus), fonte e observações.
- **Observações de campo**: código, tipo, litologia, rumo e mergulho, colector, data e observações.
- **Temáticos**: código, classe, valor, unidade (polígonos), fonte e descrição.

**Sistema de coordenadas**: feições digitalizadas são WGS84 (EPSG:4326). Isso não equivale a trabalhar metricamente numa projecção UTM local. É obrigatória a revisão da projecção, precisão cartográfica e fontes antes de publicar mapas técnicos.

## Política de gravação e limites

Os dados ficam no estado local do editor até um comando de guardar ou exportar. O GeoMoz não deve escrever automaticamente em Firestore, Firebase Storage ou tabelas externas. A tabela de atributos e a geometria não são editadas simultaneamente numa mesma sessão: o editor bloqueia a edição de atributos durante a edição geométrica para evitar conflitos; finalize a geometria antes de editar as propriedades. Camadas remotas e vector tiles não são necessariamente editáveis: materialize cópia GeoJSON quando necessário, sujeito a direitos e permissões da fonte.

Esta etapa fornece um ciclo real de cartografia vectorial e temática, **não** equivalência funcional integral ao QGIS Desktop. Validação topológica automática, snapping avançado entre camadas, sistema de regras geológicas cruzadas, construção de legenda normativa de mapas geológicos, georreferenciação de cartas e persistência multiutilizador colaborativa precisam de implementação e QA específicos.

## Testes

- `node --test scripts/tests/geomoz-layer-templates.test.mjs scripts/tests/geomoz-workbench-profile.test.mjs`
- CI Workbench: React/TypeScript, Chromium, criação de uma camada vazia, digitalização de polígono, gravação e exportação de atributos do esquema.
- Confirmar depois da publicação se o carregamento do mesmo projecto no browser restaura atributos, estilos e geométricas. Para operações críticas utilizar ficheiros de projecto e exportações de backup.
