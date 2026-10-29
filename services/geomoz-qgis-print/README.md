# GeoMoz — motor PDF cartográfico vectorial PyQGIS

## Objectivo

Produzir mapas **PDF vectoriais** com simbologia GeoJSON, moldura, título,
subtítulo, legenda, norte, créditos e suporte A4/A3. É um serviço independente
de impressão em QGIS, preparado para ser integrado no portal com um gateway
de autenticação e quotas.

O motor do navegador continua disponível em **Publicar → Layout de impressão**
(PNG/PDF/SVG, mapas raster e serviços). Esta fase não o substitui: a impressão
QGIS processa **apenas as camadas vectoriais GeoJSON fornecidas**, não tiles,
WMS ou mapas de fundo WebGL. Não há captura de ecrã.

## Ficheiros

- **job.py**: validação sem dependência do QGIS; GeoJSON em EPSG:4326.
- **render.py**: cria QgsProject/QgsLayout e escreve PDF vectorial.
- **service.py**: API HTTP privada com token interno e processo por job.
- **Dockerfile / compose.yaml**: servidor privado (porta 18085, loopback).
- **tests/**: validação, limites e configuração.

A implementação usa PyQGIS e conceitos de impressão em QGIS. Referência
upstream: https://github.com/nextgis/qgis_headless .
Não foi copiado um bundle C++ do NextGIS nem se afirma que foi instalado.

## Utilização local

1. No GeoMoz, abra **GIS Workspace → Publicar → Pacote PDF QGIS**.
2. Seleccione camadas vectoriais e folha A4/A3. O navegador descarrega
   **geomoz-qgis-impressao.json**, sem enviar dados para terceiros.
3. Num servidor Linux com Docker, execute:

    cd services/geomoz-qgis-print
    cp .env.example .env
    # Substitua o token exemplo por um segredo gerado aleatoriamente!
    docker compose --env-file .env build
    docker compose --env-file .env up -d

4. Envie o pacote pelo endpoint privado a partir do próprio servidor:

    curl --fail -sS -H "Authorization: Bearer SEU_TOKEN_PRIVADO" \
      -H "Content-Type: application/json" \
      --data-binary @geomoz-qgis-impressao.json \
      http://127.0.0.1:18085/v1/print/pdf -o geomoz-mapa.pdf

   Alternativamente, com PyQGIS instalado:

    QT_QPA_PLATFORM=offscreen /usr/bin/python3 render.py \
      geomoz-qgis-impressao.json geomoz-mapa.pdf

5. Verifique o PDF antes de o publicar.

## Limites e segurança

- JSON até 4 MB, 12 camadas, 5 000 feições e 100 000 vértices;
  tempo máximo do processo de 90 segundos.
- Somente GeoJSON local; sem URLs de fornecedores, scripts, QML ou projectos
  QGIS arbitrários na entrada.
- Coordenadas validadas em EPSG:4326.
- Worker com root filesystem read-only, filesystem temporário, limites de
  memória/CPU, sem privilégios adicionais e uma tarefa de cada vez.
- Serviço exposto só em 127.0.0.1 do servidor Docker. O token **nunca**
  deve entrar no JavaScript do navegador ou no GitHub.
- Para acesso público futuro: gateway autenticado, verificação Firebase ID
  Token, quotas e rate limits, CORS restrito, TLS, logging e alertas.
- Antes dessa ligação, a interface apenas descarrega o pacote local;
  não afirma ter gerado um PDF QGIS remoto.

## Validação

A CI executa unittest, valida Docker Compose, compila o Workspace adaptado
e verifica a preparação do pacote. A renderização QGIS requer um ambiente
PyQGIS funcional; é necessário executar ensaios E2E e inspeccionar PDFs
antes de certificar o serviço para produção.

## Direitos e proveniência

QGIS usa GPL. O serviço utiliza bibliotecas PyQGIS instaladas pelo sistema
com os respectivos avisos de licença. Consultar https://github.com/qgis/QGIS .
