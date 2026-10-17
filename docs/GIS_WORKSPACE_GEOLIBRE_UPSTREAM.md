# GeoMoz GIS Workspace — código web original do GeoLibre

O motor oficial do [GeoLibre](https://github.com/opengeos/GeoLibre), MIT (Copyright © 2026 Qiusheng Wu), é compilado **directamente do código-fonte** como segunda aplicação web em /gis-workspace/, utilizando a mesma base React/Vite/MapLibre/Whitebox/WASM da versão web, e não uma recriação parcial nem iframe remoto.

## Origem reproduzível e reconhecimento

O commit upstream é explicitamente identificado por SHA na GitHub Action .github/workflows/firebase-deploy.yml e na validação .github/workflows/geolibre-upstream-ci.yml. Não seguir main automaticamente. A aplicação upstream é extraída e compilada em CI com Node >=22, usando npm ci e npm run build. scripts/brand-geolibre-web.mjs copia o resultado publicado para artifacts/geomoz-react/dist/public/gis-workspace, coloca deployment.json (nome GeoMoz GIS Workspace, welcome false, sharing remota desligada), aplica apenas cores de marca e inclui a licença original integral (GEOLIBRE-LICENSE.txt).

Código de origem: https://github.com/opengeos/GeoLibre . Licença: https://github.com/opengeos/GeoLibre/blob/main/LICENSE .

## Navegação

No Firebase Hosting /gis-workspace/ é uma aplicação estática independente. O menu GIS Workspace de GeoMoz navega para essa rota na compilação de produção (VITE_GIS_WORKSPACE_ENGINE=geolibre). /geoprocessamento continua a funcionar com o motor GIS legado para compatibilidade e recuperação das cópias IndexedDB antigas. O botão fixo «← GeoMoz» regressa a /mapa. O bundle tem base /gis-workspace/ para carregar JS, CSS, workers e modelos sem apontar para a raiz do portal.

No desenvolvimento local do portal (onde o bundle GeoLibre não está construído), o menu usa o motor GIS existente; para validar a versão integral, servir o directório de publicação com um servidor HTTP que suporte SPA e caminhos relativos.

## Dados, privacidade e serviços

O GeoLibre gere projectos e dados SIG localmente no navegador por defeito; a aplicação pode usar IndexedDB/Cache Storage internos conforme a implementação upstream. Não é equivalente a nenhuma utilização de armazenamento local. Requests de dados públicos (basemaps, DEM, WMS/WFS, STAC) continuam a contactar serviços externos escolhidos pelo utilizador. O geo-workspace não carrega ficheiros privados no Firestore ou Firebase Storage por defeito e o serviço remoto de partilha do GeoLibre é desactivado na política. **Não está integrado** com a sessão Firebase, contas PRO, snapshots antigos do Workspace ou quotas de nuvem GeoMoz: importar/exportar ficheiros explicitamente ao mudar de motores. Firestore e Firebase Storage existentes não são removidos e continuam reservados para implementação autenticada PRO com validação server-side.

## Actualizar GeoLibre

1. Rever novas versões, licença, dependências, URLs externos, esquema de política e requisitos do upstream.
2. Alterar o SHA fixo nos workflows de CI e deploy, executar CI da aplicação original e testes próprios.
3. Validar no browser DEM Global, importação GeoTIFF/HGT, AOI, análise, projectos, interface, service worker limitado ao subdirectório, geoprocessamento WASM e exportação antes da publicação.
4. Depois do deploy, confirmar /gis-workspace/ no domínio GeoMoz, recursos estáticos sem erro 404 e ausência de tráfego Firebase não autorizado.

**Limitação:** equivalência funcional das ferramentas web upstream não implica integração automática com a biblioteca Python/R GeoMoz, nem com os projectos legados. Ferramentas dependentes de APIs externas, modelos ou credenciais continuam com as limitações próprias do GeoLibre.
