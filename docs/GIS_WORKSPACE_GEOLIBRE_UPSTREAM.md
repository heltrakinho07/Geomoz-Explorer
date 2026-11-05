# GeoMoz GIS Workspace — código web original do GeoLibre

O motor oficial do [GeoLibre](https://github.com/opengeos/GeoLibre), MIT (Copyright © 2026 Qiusheng Wu), é compilado **directamente do código-fonte** como segunda aplicação web em /gis-workspace/, utilizando a mesma base React/Vite/MapLibre/Whitebox/WASM da versão web, e não uma recriação parcial nem iframe remoto.

## Origem reproduzível e reconhecimento

O commit upstream é explicitamente identificado por SHA na GitHub Action .github/workflows/firebase-deploy.yml e na validação .github/workflows/geolibre-upstream-ci.yml. Não seguir main automaticamente. A aplicação upstream é extraída e compilada em CI com Node >=22, usando npm ci e npm run build. scripts/brand-geolibre-web.mjs copia o resultado publicado para artifacts/geomoz-react/dist/public/gis-workspace, coloca deployment.json (nome GeoMoz GIS Workspace, welcome false, sharing remota desligada), aplica apenas cores de marca e inclui a licença original integral (GEOLIBRE-LICENSE.txt).

Código de origem: https://github.com/opengeos/GeoLibre . Licença: https://github.com/opengeos/GeoLibre/blob/main/LICENSE .

## Navegação

No Firebase Hosting /gis-workspace/ é uma aplicação estática independente. O menu GIS Workspace de GeoMoz navega para essa rota na compilação de produção (VITE_GIS_WORKSPACE_ENGINE=geolibre). /geoprocessamento continua a funcionar com o motor GIS legado para compatibilidade e recuperação das cópias IndexedDB antigas. O topo apresenta navegação permanente entre módulos GeoMoz; deixou de existir o botão flutuante de saída. Embora a aplicação use o mesmo domínio e esteja visualmente integrada, o motor GeoLibre continua a ser um bundle React independente (não é ainda o mesmo runtime que o Explorer). A navegação entre módulos provoca uma nova carga de página. Antes de mudar de módulo, guardar explicitamente o projecto GIS. O bundle tem base /gis-workspace/ para carregar JS, CSS, workers e modelos sem apontar para a raiz do portal.

No desenvolvimento local do portal (onde o bundle GeoLibre não está construído), o menu usa o motor GIS existente; para validar a versão integral, servir o directório de publicação com um servidor HTTP que suporte SPA e caminhos relativos.

## Dados, privacidade e serviços

O GeoLibre gere projectos e dados SIG localmente no navegador por defeito; a aplicação pode usar IndexedDB/Cache Storage internos conforme a implementação upstream. Não é equivalente a nenhuma utilização de armazenamento local. Requests de dados públicos (basemaps, DEM, WMS/WFS, STAC) continuam a contactar serviços externos escolhidos pelo utilizador. O geo-workspace não carrega ficheiros privados no Firestore ou Firebase Storage por defeito e o serviço remoto de partilha do GeoLibre é desactivado na política. **Não está integrado** com a sessão Firebase, contas PRO, snapshots antigos do Workspace ou quotas de nuvem GeoMoz: importar/exportar ficheiros explicitamente ao mudar de motores. Firestore e Firebase Storage existentes não são removidos e continuam reservados para implementação autenticada PRO com validação server-side.

## Actualizar GeoLibre

1. Rever novas versões, licença, dependências, URLs externos, esquema de política e requisitos do upstream.
2. Alterar o SHA fixo nos workflows de CI e deploy, executar CI da aplicação original e testes próprios.
3. Validar no browser DEM Global, importação GeoTIFF/HGT, AOI, análise, projectos, interface, service worker limitado ao subdirectório, geoprocessamento WASM e exportação antes da publicação.
4. Depois do deploy, confirmar /gis-workspace/ no domínio GeoMoz, recursos estáticos sem erro 404 e ausência de tráfego Firebase não autorizado.

**Limitação:** equivalência funcional das ferramentas web upstream não implica integração automática com a biblioteca Python/R GeoMoz, nem com os projectos legados. Ferramentas dependentes de APIs externas, modelos ou credenciais continuam com as limitações próprias do GeoLibre.

## Identidade visual GeoMoz

O empacotamento preserva os ficheiros JavaScript, WASM, processamento e estrutura de UI do GeoLibre; aplica apenas a camada `scripts/assets/geolibre-geomoz-theme.css` na publicação. A cor primária de GeoMoz é **#0284c7**, com azul-claro **#38bdf8**, azul-marinho **#020617** e azul-escuro **#082f49**; a versão escura respeita a preferência do utilizador. A barra de menus e os painéis usam essas cores, mas não se altera qualquer rampa de elevação, simbologia geológica, paleta raster ou interpretação de dados.

O tema é carregado depois das folhas originais e utiliza as variáveis HSL sem conversões para hex dentro das variáveis `--primary`, `--background` etc. Não são feitas substituições generalizadas das classes Tailwind compiladas ou das cores científicas.

O script copia os favicons do GeoMoz para a aplicação GeoLibre, muda o nome e as cores do `manifest.webmanifest` para «GeoMoz GIS Workspace» e preserva o âmbito isolado `/gis-workspace/`. O stylesheet inclui uma versão baseada no hash de conteúdo para evitar cache de CSS antigo, além de estilos acessíveis para foco, dispositivos móveis e movimento reduzido.

Ao alterar a identidade no futuro, editar **somente** `scripts/assets/geolibre-geomoz-theme.css` e os ícones oficiais em `artifacts/geomoz-react/public`, executar `node --test scripts/tests/brand-geolibre-web.test.mjs` e validar o build original no CI.


## Interface QGIS-like e navegação integrada

- `scripts/assets/geomoz-gis-shell.html` é o cabeçalho GeoMoz comum, com separadores para Painel, Mapa, GIS Workspace, GeoAnálises, Hidrografia e GeoMoz AI (todos no mesmo domínio). Ao abrir a rota SIG, o estado visual é **GIS Workspace** activo, sem «Voltar ao GeoMoz».
- `scripts/assets/geolibre-geomoz-theme.css` reorganiza o chrome em camadas: header GeoMoz azul-marinho, barra compacta de ferramentas SIG, barra original de menus em cinza/branco QGIS-like, painéis dockados e barra de coordenadas. Os painéis, o renderer cartográfico e as rampas científicas continuam a ser os originais.
- `scripts/assets/geomoz-gis-shell.js` delega os ícones de acesso rápido nos **menus React originais** Project, Add Data, Edit, View, Processing, Controls, Plugins e Settings. Assim a navegação visual não recria os processamentos nem ignora permissões, modais e opções internas. Em caso de layout ou tradução diferente, o menu original continua disponível.
- A UI responde a dispositivos móveis, mantém os temas claro/escuro e as opções do GeoLibre. O mapa/globo e a opção 2D/3D são controlados pelo motor original; alterar o modo de projeção por defeito requer uma alteração upstream testada à parte.
- Não são representadas unidades locais tipo C:/D: como acessíveis automaticamente num navegador: o Browser usa apenas origens que o GeoLibre realmente suporta no browser (ficheiros carregados, serviços remotos e stores locais).
- Os testes `scripts/tests/geomoz-gis-shell.test.mjs` verificam os menus nativos e os links GeoMoz; os testes de empacotamento verificam a presença do shell na página final. O deploy verifica também `geomoz-shell.js` no Firebase Hosting.
