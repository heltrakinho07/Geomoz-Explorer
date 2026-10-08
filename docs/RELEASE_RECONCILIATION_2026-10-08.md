# GeoMoz Explorer — Reconciliação de branches e plano de estabilização

**Data:** 2026-10-08  
**Base de análise:** `fix/geology-invalid-geometry` (`f2d9c982`)  
**Branch de produção nos workflows:** `main` (`2c3bb826` no momento da auditoria)

## 1. Decisão de gestão de versões

A branch padrão do repositório é `fix/geology-invalid-geometry`, mas os workflows de deploy Firebase Hosting e Cloud Run são accionados por push em `main` (ou manualmente). Por isso:

- **Não interpretar a branch padrão como produção.**
- Não mudar a branch padrão, nem fundir `main` na branch padrão, até reconciliar as diferenças.
- Não executar um merge global das branches de Setembro.
- Evitar deploys automáticos de uma alteração não validada. Preferir PRs por funcionalidade com revisão de testes e smoke tests.

**Diferença GitHub:** `main...fix/geology-invalid-geometry` divergiu: 316 commits exclusivos da branch fix, 252 exclusivos de main; 127 ficheiros no diff de main para fix. Estes contadores são históricos, não medem funcionalidades úteis nem qualidade.

## 2. Recuperação selectiva — prioridades

| Fonte | Comparação com a branch padrão | Decisão |
| --- | --- | --- |
| `feat/geomoz-gis-workspace` | Ahead 18, 12 ficheiros alterados | **Candidato P2:** rever GIS Workspace, AOI, API, segurança de exportação e testes num PR isolado |
| `feat/geomoz-p2-report-maps` | Ahead 13, 8 ficheiros alterados | **Candidato P2:** recuperar melhorias de relatórios cartográficos e validar renderização/segurança |
| `feat/geomoz-p1-report-map-snapshots` | Behind 56, nenhum commit exclusivo | Funcionalidades já pertencem ao histórico da branch padrão; validar comportamento, não refazer merge |
| `feat/analysis-processing-monitor` | Behind 18, nenhum commit exclusivo | Validar o fluxo existente em vez de incorporar a branch |
| `feat/gis-remote-sources` | Diverged, ahead 225, behind 316 | **Não fazer merge integral:** identificar commits pequenos de fontes OGC/WFS/GeoJSON |
| `feat/gis-workspace-data-sources` | Diverged, ahead 269, behind 316 | **Não fazer merge integral:** potencial conjunto de funcionalidades de workspace, mas grande risco de regressão |
| `main` | Diverged, ahead 252 relativamente à branch padrão | Tratar como **linha de produção distinta** até reconciliação e avaliação de deploy |
| `backup/fix-before-sept27-restore-2026-09-29` | Behind 1, nenhum commit exclusivo | Backup histórico anterior ao restauro; não reverter automaticamente |

> Os valores acima são resultados de comparação de branches no GitHub em 2026-10-08. A indicação *ahead* não prova que a funcionalidade esteja funcional.

## 3. P0 — autenticação e segregação de quotas GEE

O PR #36 propõe:
- Verificação criptográfica de Firebase ID Tokens; nenhum JWT é identificado por descodificação sem validação.
- Protecção de `POST /geomoz-api/gee/configure` por autenticação.
- GEE público apenas se `ALLOW_SERVER_GEE_FALLBACK=true` **e** o servidor tiver credenciais de serviço, sem acesso à identidade persistida `default`.
- Ignorar cabeçalhos pessoais não autenticados no status GEE.
- Aplicar o mesmo controlo de acesso à renovação de tiles de bacia.
- Testes de regressão dedicados, com CI em PRs da branch padrão.

### Compatibilidade a confirmar

1. Login Google, login e-mail e Firebase em Web e Electron.
2. Exploração pública de camadas estáticas sem conta.
3. Análises GEE autenticadas com credenciais BYO-GEE.
4. Modo convidado com fallback explícito e bloqueio de utilização sem fallback.
5. Renovação de tiles de bacia, incluindo links partilhados.
6. CORS, limites de pedidos, quotas e concorrência GEE em Cloud Run.
7. Firestore rules: apenas o proprietário lê/escreve as suas credenciais; validar armazenamento de OAuth/refresh tokens em backend seguro.

## 4. P1 — matriz mínima de aceitação funcional

| Área | Smoke test necessário |
| --- | --- |
| Explorer | Província → distrito, layer geológica, cores, hover, filtros, estatísticas e exportação |
| GeoAnálises | NDVI, Fe-óxidos, argilas, linha estrutural e targeting em AOI pequena e grande |
| GeoTerrain | Hillshade, classes topográficas, perfil topográfico A→B, curvas de nível |
| HidroGeoMoz | HydroATLAS/HydroSHEDS; bacia, rede de drenagem e relatórios por geometria |
| GeoPerigos | Índices de risco com fontes, parâmetros e transparência de limitações |
| Relatórios | Renderização PDF/PNG, georreferência, legendas e ausência de acesso a URLs privados |
| Autenticação | Usuário A não acede a tokens, projectos ou resultados pessoais do utilizador B |
| Desktop | Build Electron e endpoint API configurado, sem ecrã branco |
| Infra | Backend health, GEE status, Firebase Hosting, Firestore rules, Cloud Run Jobs |
| CI | Suite pytest, TypeScript typecheck, build de produção, tests GIS |

## 5. Regras para iniciar P2/P3

- Fechar P0 **após** checks verdes e testes funcionais; não fazer merge automático apenas porque o diff compila.
- Criar PR separado para GIS Workspace; integrar apenas os componentes necessários e manter os endpoints da versão segura.
- Seguir com relatórios e fontes remotas sob testes específicos de SSRF, geometria, tamanhos e permissões.
- GeoMoz Agent: execução de ferramentas GIS de lista autorizada, validação de AOI, quotas, auditoria e confirmação para análises de maior custo.
- Medir qualidade científica dos resultados antes de indicar que a solução está pronta para uso profissional.

**Ambiente live:** não confirmado por execução nesta auditoria. A tentativa de consultar os URLs públicos via ferramenta de navegação não estabeleceu conectividade; não inferir que estão online ou offline.
