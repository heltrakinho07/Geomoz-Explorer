# Verificação de branding Google OAuth — GeoMoz Explorer

## Projecto e URLs oficiais

- Google Cloud project: `geoprocessamento-426809`.
- Página inicial: `https://geomoz.geolithica.com/`.
- Política de privacidade: `https://geomoz.geolithica.com/privacy`.
- Termos de serviço: `https://geomoz.geolithica.com/terms`.
- Domínio autorizado a adicionar na consola: `geolithica.com` (abrange o subdomínio `geomoz.geolithica.com`).
- E-mail de contacto publicado: `contacto@geolithica.com`.

As páginas `/privacy` e `/terms` estão agora em HTML estático dentro de `artifacts/geomoz-react/public/`. O Firebase Hosting serve estes ficheiros em URLs sem `.html` porque `hosting.cleanUrls=true`. Não dependem de sessão, autenticação, React ou JavaScript para o Google ler o conteúdo.

## Passo manual obrigatório: provar a propriedade do domínio

1. Inicie sessão na **Google Search Console** (https://search.google.com/search-console/) **com a mesma Conta Google que é proprietário ou editor do projecto `geoprocessamento-426809`**.
2. Adicione uma propriedade de tipo **Domínio**: `geolithica.com`. A propriedade de domínio verificada cobre `geomoz.geolithica.com`.
3. Copie **o valor TXT de verificação único que a Search Console apresenta**, no formato `google-site-verification=...`. Não use valores ilustrativos e não substitua TXT usados por e-mail.
4. No provedor DNS efectivo de `geolithica.com`, crie o TXT para o domínio raiz (normalmente `@`, mas confirme o campo Nome/Host do provedor), com o valor fornecido pelo Google.
5. Depois de propagar o DNS, clique em **Verificar** na Search Console. Se o Google não reconhecer a propriedade, confirme que foi registado o TXT no DNS autoritativo e tente novamente.
6. Certifique-se de que **a conta proprietária/editor do Google Cloud também é proprietária verificada da propriedade na Search Console**. Se quem validou foi outra conta, conceda acesso adequado na Search Console ou efectue a validação com a conta correcta.
7. Se o verificador continuar a não detectar `geomoz.geolithica.com`, poderá adicionar também uma propriedade do tipo Prefixo de URL `https://geomoz.geolithica.com/` e verificar a propriedade, usando a mesma conta.

Nenhum passo do GitHub ou do Firebase, por si só, prova a propriedade do domínio ao Google. O token DNS precisa de ser emitido pela sua Search Console.

## Publicação e testes depois do merge

O workflow `.github/workflows/firebase-deploy.yml` faz a publicação da branch `main` para o Firebase Hosting. Confira que a execução terminou com sucesso. O deploy pode falhar se os secrets GitHub/conta de serviço Firebase não estiverem configurados.

Depois, sem autenticação, confirme:
- `https://geomoz.geolithica.com/` mostra o nome GeoMoz Explorer, descrição das suas funcionalidades e link visível para a política.
- `https://geomoz.geolithica.com/privacy` mostra título, pelo menos dez secções, finalidades, acesso a dados Google, conservação, divulgação, contacto, revogação.
- `https://geomoz.geolithica.com/terms` é uma página pública.
- Opcional (terminal): `curl -fsSL https://geomoz.geolithica.com/privacy | grep 'Google Earth Engine'` deve encontrar o texto directamente no HTML.

## Repetir verificação do branding

1. Em https://console.cloud.google.com/auth/branding?project=geoprocessamento-426809, confirme nome da aplicação **GeoMoz Explorer**, e-mail de suporte, links exactos das páginas acima e domínio autorizado `geolithica.com`.
2. Aguarde as **24 horas solicitadas pelo aviso do Google após verificar a propriedade**.
3. Seleccione **Corrigi os problemas** e **Pedir nova verificação da sua marca** (em vez de alegar que a rejeição está incorrecta).
4. Se voltar a falhar apesar dos testes estarem correctos, contacte a equipa de verificação do Google com o URL da Search Console verificado, URLs públicos e capturas do conteúdo. Não partilhe tokens OAuth, chaves ou credenciais.

Referências: [Requisitos de verificação Google](https://support.google.com/cloud/answer/13464321) e [Configuração Firebase Hosting](https://firebase.google.com/docs/hosting/full-config).
