# GeoMoz GIS Workspace — conector NextGIS Web

Integração nativa de recursos públicos NextGIS Web, desenvolvida para o GIS Workspace
que utiliza o motor GeoLibre/MapLibre.

## Fluxo de trabalho

1. Abrir **GIS Workspace → Dados → NextGIS Web**.
2. Indicar **a origem HTTPS** de um servidor NextGIS Web público, por exemplo
   \`https://demo.nextgis.com\` (o servidor tem de permitir leitura pública e CORS).
3. Navegar pelos grupos de recursos e escolher um mapa ou estilo publicável.
4. Seleccionar **Adicionar**. A camada entra no catálogo GeoMoz como camada
   raster XYZ nativa, com o URL de origem, ID de recurso, nome e atribuição.
5. Controlar a ordem, visibilidade e opacidade no catálogo. Guardar o projecto
   localmente para conservar as referências aos recursos remotos.

## Compatibilidade

Usa os endpoints NextGIS Web documentados:

- \`GET /api/resource/?parent=<id>\` — lista de recursos de um grupo.
- \`GET /api/resource/<id>/export?format=GeoJSON&srs=4326&zipped=False\` — exportação vectorial.
- \`GET /api/component/render/tile?z={z}&x={x}&y={y}&resource=<style-id>\`
  — mosaicos da camada/mapa publicados.

Os recursos importáveis incluem \`mapserver_style\`, \`qgis_vector_style\`,
\`raster_style\`, \`wmsclient_layer\` e \`webmap\`. Os recursos \`vector_layer\` e \`postgis_layer\` também podem ser exportados em GeoJSON e importados localmente. Camadas de dados sem
estilo próprio não são anunciadas como mosaicos renderizáveis; aparecem como vectores importáveis.

A importação vectorial força EPSG:4326, valida coordenadas e feições e rejeita respostas com mais de **8 MB ou 5 000 feições**, para evitar bloquear o navegador. A camada importada é editável e processável no motor nativo GeoMoz, sem sincronização automática com o servidor de origem.

## Segurança e dados

- Não são enviados dados locais do utilizador para o NextGIS Web.
- A consulta não transmite cookies nem credenciais e não usa proxy Firebase.
- Apenas ligações HTTPS de origem pública, sem utilizador/password em URL.
- A API do servidor de origem deve permitir CORS e os recursos devem ter
  permissões de leitura públicas.
- URLs e nomes de recursos são validados; textos de atribuição são escapados.
- O servidor remoto continua responsável por disponibilidade, autenticação
  e condições de uso dos seus mapas.
- Os pedidos de catálogo são canceláveis; erros remotos não eliminam as
  restantes camadas do projecto.
- Esta fase não publica automaticamente dados privados nem cria um novo
  servidor NextGIS Web.

## Integração de código

- Adaptador: \`artifacts/geomoz-react/src/lib/nextgis-web.ts\`.
- Janela: \`scripts/assets/workbench/GeoMozNextgisWebCatalog.tsx\`.
- Preparação do motor fixado: \`scripts/prepare-geomoz-workbench.mjs\`.
- Testes Vitest e Node adicionados aos workflows Frontend/Workbench CI.

Esta integração usa os protocolos HTTP/REST do NextGIS Web e a API de
camadas nativas do GeoLibre. Não incorpora o servidor GPL NextGIS Web no
bundle da aplicação React.

Referências técnicas:

- https://docs.nextgis.com/docs_ngweb_dev/doc/developer/resource.html
- https://docs.nextgis.com/docs_ngweb/source/services.html
