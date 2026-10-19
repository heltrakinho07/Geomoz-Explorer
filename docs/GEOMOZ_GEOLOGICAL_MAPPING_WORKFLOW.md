# GeoMoz GIS Workspace — Cartografia geológica e temática

## Fluxo GIS estilo QGIS

1. GIS Workspace → **Dados / Área de estudo → Nova camada**. Escolher modelo geológico ou temático: unidades geológicas (polígonos), falhas/lineamentos (linhas), estruturas (pontos), afloramentos/amostras, ocorrências minerais, uso e cobertura do solo ou camada personalizada.
2. Introduzir o nome e a geometria. O modelo contém campos recomendados, apresentados ao criar a camada. O GeoJSON começa **vazio**; o GeoMoz não gera observações geológicas fictícias.
3. No **Catálogo**, seleccionar a nova camada e clicar **Digitalizar nesta camada**. O GeoEditor inicia uma sessão de edição da camada escolhida. Digitalizar, alterar geometrias, criar novas feições e preencher os atributos no formulário do motor SIG.
4. Escolher **Concluir e guardar edição** para gravar as alterações no estado da camada. **Descartar alterações** cancela a sessão em curso. A edição geométrica avançada e atributos ficam disponíveis pela configuração `GEOMOZ_ROLLOUT.advancedDrawing=true`.
5. Em **Simbologia** escolher cor e contorno ou usar **Estilos avançados** para classes, regras e rótulos quando o painel estiver habilitado na configuração visual.
6. Em **Resultados** preparar layout cartográfico com título, legenda, escala validada, fontes e créditos. Guardar **o projecto** e exportar GeoJSON para uso no QGIS. Persistência local ou exportação requer acção explícita.

## Qualidade científica dos mapas

Os campos de geologia são sugestões de esquema, não classes obrigatórias nem interpretações automáticas. A idade geológica, falhas, litologia e medidas estruturais têm de resultar de dados verificáveis, fontes cartográficas ou interpretação assinalada. O produto permite digitalização, mas **não afirma** validação topológica automática de limites partilhados, snapping de precisão, generalização cartográfica científica, aplicação automática dos símbolos oficiais de cartas geológicas, nem edição simultânea multiutilizador. Essas funcionalidades exigem implementação e testes adicionais.

## Armazenamento e segurança

O editor partilha o estado nativo de camadas GeoJSON do GeoMoz, sem escrita obrigatória em Firestore/Firebase Storage. Estes serviços e o IndexedDB do projecto continuam disponíveis para integrações PRO futuras. O ficheiro GeoJSON é EPSG:4326 e o módulo original mantém controlo sobre projecto, importações, exportação e edição in-place. Não se alteram as permissões de viewers.

## Verificações

Testes Node.js: `scripts/tests/geomoz-cartography.test.mjs` e `scripts/tests/geomoz-workbench-profile.test.mjs`. CI do Workbench: build TypeScript/Vite contra motor SIG fixo e Chromium com criação de camada de falhas, abertura/fecho da edição in-place e regressão do desenho GeoJSON. É necessária QA adicional real para edição de atributos, projecções, topologia e símbolos geológicos complexos antes de declarar equivalência funcional total ao QGIS.