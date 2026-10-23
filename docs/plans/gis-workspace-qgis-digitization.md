# GeoMoz GIS Workspace — plano de digitalização SIG no fluxo QGIS

**Estado:** plano de implementação faseada; alterações de fase 1 em PR #119, dependentes de validação antes do merge/deploy.
**Princípios:** mapa primeiro, selecção de camada obrigatória, edição reversível, persistência explícita, SVG/Lucide sem emojis, funcionalidades reais e não botões decorativos.

## 1. Diagnóstico técnico do motor actual

- Deploy `main` integra checkout GeoLibre fixado + adaptações `scripts/prepare-geomoz-workbench.mjs`. Não desenvolver um segundo editor independente.
- `GeoMozWorkbenchChrome` apresenta as tarefas Digitalizar, Dados, Análise, Resultados; `GeoMozLayerPanel` apresenta o catálogo.
- `GeoMozLayerCreation` cria camadas GeoJSON vazias; `@geolibre/plugins` fornece editor Geoman, geometria, vértices e sessão guardar/descartar.
- Formulário de atributos do Geoman, tabela de atributos, propriedades, projectos e ferramentas raster/vector já existem no upstream. A integração GeoMoz deve preservá-las.
- Georreferenciamento já fornece pontos de controlo, GDAL/GeoTIFF, erro RMS, SRC e exportação; só digitalizar quando raster de base estiver espacialmente alinhado.
- Novo fluxo proposto no PR #119: campos personalizados, tipo geométrico explícito, botão editar na camada seleccionada, tolerância de snapping, comando de desenho correspondente e atributos ligados à feição. **Não declarar funcional até passar testes reais de desenho, edição, descarte e exportação.**

## 2. Arquitectura de informação (evitar interface poluída)

| Superfície | Conteúdo permanente | Conteúdo contextual / recolhível |
|---|---|---|
| Barra superior (compacta) | Identidade GeoMoz, nome do projecto, Guardar, Desfazer/Refazer, tema | Ajuda, definições e pesquisa Ctrl+K |
| Tarefas | Digitalizar, Dados, Análise, Resultados | Comandos organizados por grupos; sem menus duplicados |
| Catálogo esquerdo | Árvore de camadas, visibilidade, camada activa, reordenação, pesquisa | Simbologia, atributos, estilos, grupo, filtros, exportação — `details` ou inspector |
| Mapa central | Mapa base/raster/vector, cursor, escala, coordenadas, SRC | Barra flutuante de edição **apenas** durante sessão activa |
| Inspector direito | **Fechado por defeito** | Geometria, campos, snapping, propriedades da camada / feição — uma aba de cada vez |
| Painel inferior | **Fechado por defeito** | Tabela de atributos, estatísticas, histórico de processamento, logs |
| Diálogos | Nenhum permanente | Nova camada, georreferenciador, exportar, formulário da nova feição, layout |

**Regra:** o mesmo comando deve ter um único ponto de acesso principal; a pesquisa global pode dar acesso secundário. Em ecrãs pequenos, mostrar apenas catálogo **ou** inspector, não ambos; mapa mantém controlo de navegação.

### Estados da digitalização

`SEM_CAMADA` → `CAMADA_SELECCIONADA` → `EM_EDICAO` → `A_DESENHAR` → `ATRIBUTOS` → `EM_EDICAO` → `GUARDADA` / `DESCARTADA`.

- Sem camada vectorial: botões de edição/desenho desactivados com explicação.
- Na sessão, activar ferramenta conforme geometria; não criar feições numa camada genérica `Sketches`.
- Nova feição: finalizar geometria, abrir atributos, validar campos e confirmar; não fechar automaticamente a sessão.
- `Guardar edições` grava geometria+atributos na camada; `Descartar` restaura estado anterior. `Guardar projecto` é operação separada e explícita.
- Se o utilizador mudar de camada, fechar um projecto ou sair com edições pendentes, pedir confirmação para guardar ou descartar.
- `GeoJSON` segue WGS84 lon/lat; um SRC UTM indicado para exportação deve ser convertido de facto na operação GDAL/PROJ, nunca apenas trocado no metadado.

## 3. Backlog e fases de implementação

| Fase | Prioridade | Entregáveis | Critério de aceitação |
|---|---|---|---|
| **0 · Estabilizar** | P0 | Corrigir duplicação de elementos entre painéis, estados editando/salvando, vínculos de nova feição, rotinas React e sincronização Geoman/GeoJSON | Todos os testes Node + Chromium; sem perdas ao guardar/desfazer; nenhuma alteração de produção com CI falho |
| **1 · Digitalização base** | P0 | Criar camada Ponto/Linha/Polígono; esquema de campos texto/número; seleccionar camada; snapping vértices; desenhar; popup atributos; guardar/descartar; GeoJSON | E2E: três feições por geometria com atributos numéricos e texto; testar descarte, reabertura e exportação |
| **2 · Interface compacta** | P0 | Barra contextual quando editar; assistente progressivo, inspeção em acordeões; largura dinâmica; atalhos; catálogo recolhível; diários/logs não intrusivos | Mapa ocupa >=60% da largura desktop durante edição; sem overflow 390px; sem painel/modal duplicado |
| **3 · Topologia** | P1 | Snapping a vértices, segmentos e intersecções; tolerância px/m; auto-traçado; evitar sobreposição, lacunas, geometrias inválidas; validação antes de guardar | Casos automatizados de 2 polígonos adjacentes e linha que partilha vértices sem gaps acima da tolerância |
| **4 · Edição avançada** | P1 | Mover/adicionar/remover vértices; desfazer/refazer; dividir, fundir, recortar, buracos, multipartes; copiar/colar, selecção por forma | Operações reversíveis e persistidas, sem alteração silenciosa de feições de outras camadas |
| **5 · Dados e SRC** | P1 | Importar/exportar GeoPackage, Shapefile, GeoJSON e KML; projecção real para EPSG/UTM (GDAL/PROJ); CRS do projecto; esquemas, valores nulos, tipos e validação | Reimportar formato exportado preserva geometria, atributos, SRC e contagem de feições |
| **6 · Cartografia temática e geológica** | P1 | Biblioteca de simbologia geológica (falhas, contactos, mergulho/direcção, litologias, unidades), estilo categorizado/graduado/regras, rotulagem e escala | Carta temática completa com legenda coerente e simbologia exportável |
| **7 · Composição e entrega** | P2 | Layout de impressão, escala/norte/grelha/legenda/título, exportação PDF/PNG/SVG, guardar `.geomoz`, recuperação local; cloud só por escolha explícita | Guardar e reabrir projecto conserva camadas, atributos, simbologia, extensão e layout |

## 4. Experiência UX proposta

1. **Dados → Adicionar mapa base** (XYZ/WMS, raster, DEM, carta georreferenciada).
2. **Digitalizar → Nova camada** (modelo opcional, nome, geometria única, campos personalizados; SRC documentado).
3. **Catálogo → Seleccionar camada → lápis Editar**; aparece uma barra compacta **Ponto/Linha/Polígono**, aderência e guardar/descartar.
4. Clicar no mapa, finalizar a geometria através das interacções reais do motor Geoman e preencher atributos num diálogo compacto.
5. **Guardar edições da camada**, depois **Resultados → Guardar projecto/exportar**. A opção não deve implicar armazenamento remoto por defeito.

**Ícones Lucide sugeridos:** `layers-3`, `plus`, `pencil`, `magnet`, `map-pin`, `route`, `pentagon`, `save`, `undo-2`, `redo-2`, `table-2`, `sliders-horizontal`, `panel-left-close`, `panel-right-close`, `download`, `file-up`. Nunca emojis.

## 5. Engenharia e testes

- Preferir patch à árvore TypeScript original do upstream antes de compilar; protecção por âncoras únicas.
- Usar APIs públicas de `@geolibre/core` e do plugin Geoman; estados de desenho e atributos devem ser transaccionais.
- As sessões de edição devem ter uma única autoridade. Guardar o projecto não substitui guardar edições de camada.
- Separar testes unitários de regras geoespaciais, integração de camadas e e2e de navegador.
- Casos críticos: 0 camadas, muitas camadas, imagens grandes, rede offline, mobile, modal aberto + zoom, ficheiro reimportado, geometria autointersectante, SRC incorreto.
- CI bloqueia merge/deploy em falhas. Publicar em `main` apenas depois de aprovação; Firebase Hosting mantém deploy independente da edição GitHub.

## 6. Decisões de produto

- **Local-first** para operações de desenho e Projecto; Firebase/Storage/IndexedDB permanecem disponíveis para funcionalidades PRO opcionais.
- O editor em desktop é prioritário; mobile é sobretudo para leitura, selecção, revisão e captura pontual simplificada.
- Ferramentas especializadas são descobertas por pesquisa, agrupamento e expansão; nunca despejar dezenas de botões permanentes sobre o mapa.
- Sem alegações de suporte completo a QGIS. Cada função passa a disponível só depois de teste end-to-end.
