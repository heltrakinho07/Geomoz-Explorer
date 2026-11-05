# GeoMoz — Servidor cartográfico NextGIS Web CE

Este diretório prepara um **serviço autónomo** para publicar camadas
vectoriais/raster, mapas Web, WMS, WFS, OGC API Features e TMS. O motor
original é NextGIS Web CE; a integração no frontend GeoMoz é efectuada
por API, sem substituir o GIS Workspace.

## Instalação segura

Pré-requisito: servidor Linux com Docker Engine e Docker Compose 2.

```bash
cp deploy/nextgis-web/example.env deploy/nextgis-web/.env
docker compose --env-file deploy/nextgis-web/.env \
  -f deploy/nextgis-web/compose.yaml config --quiet
docker compose --env-file deploy/nextgis-web/.env \
  -f deploy/nextgis-web/compose.yaml up -d
```

A aplicação abre **apenas na interface local** em
`http://127.0.0.1:18080`, não na Internet. A imagem oficial documenta
o utilizador inicial `administrator` e a palavra-passe inicial `admin`.
**Altere essas credenciais antes de configurar qualquer acesso externo.**
Também configure utilizadores/grupos, backups, quotas e TLS.

Para inspecionar:

```bash
docker compose --env-file deploy/nextgis-web/.env \
  -f deploy/nextgis-web/compose.yaml logs --tail=100
```

Para parar sem apagar dados:

```bash
docker compose --env-file deploy/nextgis-web/.env \
  -f deploy/nextgis-web/compose.yaml down
```

**Não execute `down -v`** em ambientes com dados reais: apagaria
os volumes. Os volumes persistentes são `ngw_data` e `ngw_backup`;
copie-os para armazenamento externo com política de retenção.

## Publicar com o domínio GeoMoz

1. Escolha um domínio para o serviço, por exemplo `ngw.geolithica.com`.
2. Configure um reverse proxy HTTPS (Nginx/Caddy) para
   `http://127.0.0.1:18080` com limites de upload, timeouts e logs.
3. Alterne as credenciais predefinidas e configure a política de acesso
   no NextGIS Web; disponibilize publicamente só os recursos adequados.
4. Para o catálogo GeoMoz funcionar a partir de `https://geomoz.geolithica.com`,
   configure CORS **somente para o domínio do portal** nas rotas de
   leitura pública `/api/resource/` e de mosaicos
   `/api/component/render/tile`. Aplique também a política a pedidos
   `OPTIONS` se necessário. Não exponha recursos autenticados por
   um proxy sem controlo.
5. No GeoMoz, abra **GIS Workspace → Dados → NextGIS Web** e introduza
   a origem HTTPS (sem `/api` nem credenciais).
6. Escolha um recurso público, adicione-o ao catálogo e guarde o projecto.

**Nota:** Esta configuração não faz deploy automático: exige um servidor
Docker e a configuração manual do domínio, certificados, acessos e backups.
Sem um URL externo HTTPS, o browser GeoMoz não conseguirá consultar
esta instância através da Internet.

## Operação e recuperação

Verifique regularmente as actualizações de segurança do upstream,
registe a versão da imagem aprovada e teste a restauração dos backups.
Não execute actualizações para `latest` sem validar antes num ambiente
de ensaio. Os dados do utilizador só devem ser publicados após a
configuração de papéis e permissões.

Fontes: https://github.com/nextgis/nextgisweb_ce e
https://docs.nextgis.com/docs_ngweb_dev/doc/developer/resource.html.
