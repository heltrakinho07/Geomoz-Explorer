# GeoMoz — Superutilizador e Centro de Administração

## Estrutura funcional

- Rota: https://geomoz.geolithica.com/administracao
- Backend autenticado: /geomoz-api/admin/*
- Autorização efectiva: Firebase Admin verifica ID token (assinatura, revogação e conta desactivada) e consulta as custom claims actuais no servidor em cada operação. Nenhuma conta obtém direitos administrativos apenas por email, URL, campo React ou Firestore.
- Perfis: superadmin (gestão integral), admin (consulta e elegibilidade Academic), support (consulta), user (sem acesso administrativo).
- Collections Firestore: platformConfig/commerce, billing/{uid}, adminAudit/{eventId}, billingPayments/{id}, billingProjectQuota/{uid}. As regras cliente impedem escritas em billing e acesso directo à configuração e auditoria.
- Auditoria: actor UID, acção, alvo, detalhes e data. Concessão manual de plano e audit são escritos no mesmo batch.
- Pagamentos: o painel não consegue marcar pagamentos PayZeno como aprovados, adulterar eventos assinados nem contornar GEOMOZ_BILLING_ENABLED.

## Criar o primeiro superutilizador (uma só vez)

1. Criar/iniciar sessão com a conta que será superutilizador em Firebase Authentication, projecto geoprocessamento-426809.
2. Num computador de confiança com Python e firebase-admin, usar ADC com permissões Firebase Auth. Executar primeiro uma simulação:

    python geomoz-explorer/scripts/bootstrap_superadmin.py --email CONTA_REAL_DO_SUPERUTILIZADOR

3. Confirmar que projecto, email e UID apresentados pertencem à conta escolhida. Só então aplicar:

    python geomoz-explorer/scripts/bootstrap_superadmin.py --email CONTA_REAL_DO_SUPERUTILIZADOR --apply

4. Terminar sessão, voltar a entrar e abrir /administracao. A ligação «Administração GeoMoz» só aparece nas Definições após autorização do servidor.
5. Nunca colocar credenciais privadas Firebase numa conversa ou código público. Não é necessário criar senha administrativa no frontend.

O script não aceita criar o superadmin por uma API HTTP. A conta tem de existir e estar activa. Direitos adicionais são guardados nas custom claims, preservando outras claims.

## Gestão de utilizadores

- Listagem paginada Firebase Auth; pesquisa por email exacto.
- Bloqueio/reativação e revogação dos refresh tokens.
- Elevação/diminuição de perfis support/admin; protecção da própria conta e de superadmins.
- Elegibilidade Academic aprovada por admin ou superadmin. A análise documental continua manual.
- Atribuição manual auditada e justificada de Community/Academic/Pro/Teams/Enterprise; validade máxima de 36 meses. Concessões não geram pagamentos PayZeno.

## Gestão de planos

platformConfig/commerce.plans é a fonte server-side das tarifas e quotas. API pública /geomoz-api/billing/catalog e a página /planos consultam esta configuração; checkout usa o preço do servidor. Pagamentos já iniciados conservam o preço da sua sessão. Quotas de projectos e função central de créditos usam estes valores.

Community é fixo; Enterprise continua sob proposta. Suspender novas subscrições de um plano não cancela contratos existentes.

## Gestão de módulos

Módulos configuráveis: GIS Workspace, GeoMoz AI, Hidrologia, Terrain Studio 3D, Detecção Remota e Catálogos Sísmicos. Rotas React e endpoints FastAPI mapeados de IA, hidrologia, terreno e detecção remota usam flags Firestore. Cache por instância: 12 segundos.

Limitação: GIS Workspace servido como aplicação estática em /gis-workspace e integrações/serviços externos não são bloqueados completamente apenas com uma flag. Exigem controlo nos próprios serviços.

## Operação, testes e limitações

- CI verifica claims, sessão revogada, protecção de superadmin, validação de concessões e módulos.
- Não activar GEOMOZ_BILLING_ENABLED=true sem testes autorizados de pagamento real.
- Validar regras Firestore, fluxos de aprovação, alterações de quotas, módulos, auditoria e rollback em ambiente de ensaio.
- Ainda falta implementar integralmente: quotas transversais de armazenamento, workers cloud, seats Teams, faturação/IVA, MFA obrigatória, segunda conta superadmin para recuperação, métricas financeiras completas, paginação de transacções, bloqueio do motor externo do GIS Workspace e reconciliação financeira PayZeno em produção.
- Esta versão é a infraestrutura administrativa operacional inicial, não um ERP completo.
