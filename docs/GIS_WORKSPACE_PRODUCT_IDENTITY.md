# GeoMoz GIS Workspace — identidade de produto e infra-estrutura

## O que o utilizador vê
O GIS Workspace é um módulo do **GeoMoz Explorer**, no domínio \`geomoz.geolithica.com\`, com interface, navegação, projecto actual, catálogo de camadas, ferramentas científicas e temas próprios. O ecrã «Sobre o GeoMoz GIS Workspace» apresenta as páginas institucionais, documentação e política de dados. Textos da interface provenientes das traduções do motor são adaptados **na compilação** para a marca GeoMoz. O título HTML, descrição SEO e nomes PWA também usam GeoMoz.

A ligação à origem do motor é apresentada em «Créditos e licenças de terceiros» (/gis-workspace/third-party-notices.html), mantendo a licença MIT original e o seu copyright intactos. Nunca ocultar ou apagar avisos obrigatórios de licenciamento e atribuições dos fornecedores de mapas.

## Limites da autonomia do projecto

Este módulo tem **interface React mantida pelo GeoMoz** e componentes geocientíficos próprios, mas utiliza ainda infra-estrutura do código aberto [GeoLibre](https://github.com/opengeos/GeoLibre), num commit fixo e auditado. Isto é uma aplicação derivada, não um motor geográfico independente. Os identificadores técnicos \`@geolibre/*\`, variáveis \`GEOLIBRE_APP_BASE\`, ficheiros de configuração, extensão de ficheiro de projecto quando aplicável, importadores, trabalhadores WASM e URLs de dados podem continuar no interior da distribuição porque a sua alteração indiscriminada quebraria compatibilidade e funcionalidades SIG.

Para evoluir para uma plataforma totalmente autónoma, será necessário manter uma cópia/fork do motor sob controlo do GeoMoz, com actualizações de segurança, dependências próprias, testes de interoperabilidade, gestão de projectos e renomeação progressiva de APIs e formatos — preservando a licença e o histórico de direitos de autor.

## Regras de arquitectura e privacidade

1. Interface e identidade: \`scripts/assets/workbench/\`, \`scripts/geomoz-brand-locales.mjs\`, \`scripts/prepare-geomoz-workbench.mjs\` e \`scripts/brand-geolibre-web.mjs\`.
2. Núcleo SIG e tooling: infraestrutura upstream compilada de commit fixo; evitar substituições em bundles JS minificados, monkey-patches do DOM ou remoção de metadados legais.
3. Dados: projecto temporário e processamento local por defeito; guardar/exportar é explícito. Firestore, Firebase Storage e IndexedDB existentes continuam no projecto; qualquer uso PRO de nuvem requer permissões e validação de assinatura no servidor.
4. Ligações e ajuda: os botões da interface apontam para GeoMoz, e o diálogo «Sobre» distingue plataforma e software aberto. O utilizador não é redireccionado ao produto upstream para obter suporte ou verificar actualizações do GeoMoz.
5. Serviços e fornecedores cartográficos externos mantêm as suas atribuições e licenças próprias.

## Garantia de qualidade

- \`node --test scripts/tests/geomoz-brand-locales.test.mjs\`: traduções GeoMoz e protecção de endereços técnicos.
- \`node --test scripts/tests/brand-geolibre-web.test.mjs\`: shell, SEO, PWA, licença MIT e créditos acessíveis.
- CI GeoMoz Workbench: compilação React do motor fixo e teste Chromium do diálogo de ajuda, temas, importação GeoJSON, ferramentas de análise e funções sismológicas.
- Deploy Firebase: verificar HTML, \`deployment.json\`, PWA, CSS, página legal e domínios, antes de considerar publicada.

A mudança de página entre módulos GeoMoz ainda pode recarregar a aplicação React do Workspace; guardar o projecto SIG antes de sair da área de trabalho.
