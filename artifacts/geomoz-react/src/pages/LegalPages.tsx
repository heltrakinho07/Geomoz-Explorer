import GeoMozBrandIcon from "@/components/GeoMozBrandIcon";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, FileText, Mail, ShieldCheck } from "lucide-react";

type Language = "pt" | "en";
type Kind = "privacy" | "terms";
type Section = { heading: string; paragraphs: string[]; bullets?: string[] };
type LegalDocument = { title: string; subtitle: string; introduction: string; highlights: string[]; sections: Section[] };

const documents: Record<Language, Record<Kind, LegalDocument>> = {
  pt: {
    privacy: {
      title: "Política de Privacidade",
      subtitle: "Transparência sobre dados pessoais, análise geoespacial e autorizações Google Earth Engine.",
      introduction: "O GeoMoz Explorer, disponibilizado pela GEOLÍTHICA em Moçambique, utiliza dados para prestar serviços de cartografia e geoprocessamento. A ligação ao Google Earth Engine é opcional e exige uma autorização independente do login no GeoMoz.",
      highlights: ["As credenciais Earth Engine são associadas ao utilizador autenticado.", "Pode desligar a ligação GEE e revogar a autorização Google.", "Não vendemos dados obtidos através das APIs Google."],
      sections: [
        { heading: "1. Responsável e contacto", paragraphs: ["A GEOLÍTHICA é a entidade responsável pela operação do GeoMoz Explorer. Para questões de privacidade, correcção, acesso, exportação ou pedidos de eliminação de dados, escreva para contacto@geolithica.com."] },
        { heading: "2. Dados pessoais e geoespaciais recolhidos", paragraphs: ["Podemos tratar dados de registo e autenticação, como nome, e-mail, identificador Firebase UID e informações técnicas da sessão, consoante o método de entrada escolhido.", "Ao usar o serviço, também podemos tratar projectos, áreas de interesse, coordenadas e geometrias, ficheiros carregados, camadas, configurações, pedidos de processamento, resultados e registos necessários ao funcionamento e à segurança da plataforma.", "Quando autoriza o Earth Engine, podemos tratar o e-mail da conta Google autorizada, ID do projecto Google Cloud, âmbitos OAuth concedidos, tokens de acesso e de renovação (quando emitidos). Se configurar uma conta de serviço própria, poderá fornecer as respectivas credenciais."] },
        { heading: "3. Utilização dos dados recebidos das APIs Google", paragraphs: ["O GeoMoz usa a autorização Google apenas para as funcionalidades por si solicitadas: autenticar a ligação ao Google Earth Engine, consultar imagens de satélite e colecções, gerar visualizações, calcular índices e executar operações geoespaciais no projecto indicado.", "Os tokens são recebidos pelo backend e, quando a persistência está disponível, conservados em armazenamento privado associado ao seu UID verificado, não sendo destinados à visualização por outros utilizadores. A ligação Google Earth Engine é independente da conta escolhida para iniciar sessão no GeoMoz.", "Os dados recebidos das APIs Google não são vendidos, usados para publicidade, nem partilhados para finalidades não relacionadas com as funcionalidades solicitadas. A utilização e transferência desses dados seguem a Google API Services User Data Policy, incluindo os requisitos Limited Use aplicáveis."] },
        { heading: "4. Finalidades e fundamento do tratamento", paragraphs: ["Usamos as informações para registo, autenticação, gestão da conta, execução de análises pedidas pelo utilizador, manutenção de projectos, apoio técnico, melhoria da segurança, prevenção de abuso e cumprimento de obrigações legais. A ligação OAuth Google depende de consentimento voluntário e pode ser desligada."] },
        { heading: "5. Serviços externos e destinatários", paragraphs: ["A plataforma integra serviços de infraestrutura Google, incluindo Firebase Authentication, Cloud Firestore, Firebase Storage, Cloud Run e Earth Engine, consoante a funcionalidade e a respectiva disponibilidade. Poderá apresentar dados provenientes de ESA, NASA e outros fornecedores científicos, sujeitos às condições destes.", "Só partilhamos dados com prestadores necessários à operação do serviço ou quando a lei o exigir. Não disponibilizamos deliberadamente a outros utilizadores os seus tokens privados ou chaves de acesso."] },
        { heading: "6. Protecção e isolamento por conta", paragraphs: ["O sistema procura validar as sessões no servidor, associar credenciais e trabalhos ao respectivo UID autenticado e aplicar regras de acesso. Não envie credenciais em links públicos nem as partilhe com terceiros.", "Nenhum sistema online oferece segurança absoluta. Se detectar actividade suspeita, termine a sessão, revogue as autorizações Google e contacte o suporte."] },
        { heading: "7. Conservação, desconexão e eliminação", paragraphs: ["Conservamos dados enquanto necessários para prestar as funcionalidades utilizadas, administrar a conta, assegurar a segurança e cumprir obrigações legais aplicáveis. O período depende da categoria de dados, sem um prazo único para todos os registos.", "Ao desligar a ligação GEE dentro do GeoMoz, o serviço procura eliminar as credenciais Google guardadas para a sua conta; isto não elimina ficheiros já exportados nem revoga automaticamente permissões registadas na Google.", "Pode solicitar a eliminação dos seus dados e da conta ao endereço de contacto. A resposta terá em conta requisitos legais, cópias de segurança e limitações técnicas aplicáveis."] },
        { heading: "8. Os seus direitos e revogação de acesso Google", paragraphs: ["Pode pedir acesso e correcção dos seus dados, solicitar a eliminação quando aplicável e deixar de utilizar o serviço. Para revogar o acesso, desligue a ligação nas definições do GeoMoz e, separadamente, remova a autorização da aplicação nas permissões da sua Conta Google."] },
        { heading: "9. Cookies e armazenamento local", paragraphs: ["Podemos utilizar mecanismos técnicos de sessão e armazenamento no navegador para autenticação e preferências, incluindo idioma e aparência. Os serviços Google de login podem usar os seus próprios cookies de autenticação."] },
        { heading: "10. Actualizações desta política", paragraphs: ["Podemos actualizar esta política em função de alterações técnicas, operacionais ou legais. A data da versão actual será apresentada nesta página e mudanças relevantes poderão ser comunicadas pelos meios adequados."] },
      ],
    },
    terms: {
      title: "Termos de Serviço",
      subtitle: "Condições de utilização do GeoMoz Explorer e das ferramentas Google Earth Engine.",
      introduction: "Estes termos regulam a utilização do GeoMoz Explorer, operado pela GEOLÍTHICA. Ao usar a plataforma, compromete-se a respeitar estas condições e as regras dos serviços externos integrados.",
      highlights: ["Cada pessoa utiliza a sua própria conta e autorizações.", "O acesso ao Earth Engine depende dos requisitos e permissões Google.", "Os resultados geoespaciais exigem validação técnica independente."],
      sections: [
        { heading: "1. Objecto do serviço", paragraphs: ["O GeoMoz oferece exploração cartográfica, visualização, processamento geoespacial, análise de imagens de satélite e funcionalidades de apoio à investigação e à tomada de decisão. Algumas operações necessitam de conta autenticada, Internet ou acesso a serviços de terceiros."] },
        { heading: "2. Conta e segurança", paragraphs: ["O utilizador deve fornecer informações correctas, proteger a sua palavra-passe e credenciais e evitar o uso não autorizado da sua conta. Não deve aceder a dados de terceiros nem contornar medidas de autenticação ou segurança."] },
        { heading: "3. Google Earth Engine e Google Cloud", paragraphs: ["Para utilizar os módulos dependentes do Earth Engine, precisa de uma conta Google com acesso elegível ao serviço e de um projecto Google Cloud correctamente configurado, com APIs e permissões adequadas.", "O GeoMoz não concede acesso automático ao Earth Engine e não substitui os termos, quotas, regras de registo ou condições de facturação da Google. O utilizador é responsável pelas autorizações e pelos eventuais custos do projecto Google Cloud seleccionado.", "O consentimento OAuth autoriza a execução, em seu nome, das operações pedidas dentro dos âmbitos concedidos. Pode desligar esta autorização nas definições do GeoMoz e revogá-la na sua Conta Google."] },
        { heading: "4. Utilização aceitável", paragraphs: ["Compromete-se a usar a plataforma de forma lícita e a respeitar as licenças de dados, direitos de terceiros e condições dos fornecedores."], bullets: ["Não introduzir malware, explorar vulnerabilidades ou ultrapassar limites técnicos.", "Não aceder a dados, contas ou credenciais de outros utilizadores sem autorização.", "Não enviar conteúdo ilícito ou para o qual não tenha direitos de utilização.", "Respeitar licenças, quotas e políticas de fornecedores de imagens e APIs."] },
        { heading: "5. Dados carregados e resultados", paragraphs: ["Mantém os direitos que possua sobre os seus dados e concede à plataforma as autorizações técnicas necessárias para processar e apresentar os conteúdos de acordo com as operações que solicitar.", "Os resultados dependem da qualidade, resolução, data, cobertura e limitações das fontes. Cabe-lhe verificar metadados, sistemas de coordenadas, hipóteses e precisão antes de reutilizar ou divulgar conclusões."] },
        { heading: "6. Precisão e decisões críticas", paragraphs: ["Os mapas, índices espectrais, modelos, estimativas hidrológicas e resultados de inteligência artificial podem conter erros e incertezas. Não substituem observações de campo, avaliações profissionais ou validação independente em decisões de engenharia, saúde, segurança, ambiente, exploração mineral ou outras áreas de risco elevado."] },
        { heading: "7. Disponibilidade e terceiros", paragraphs: ["Podemos actualizar funcionalidades ou realizar manutenção. O acesso pode ser afectado por indisponibilidade de Google Cloud, Firebase, Earth Engine, redes e fornecedores de dados. Salvo garantias legalmente obrigatórias ou acordos específicos, não garantimos disponibilidade contínua ou ausência de falhas."] },
        { heading: "8. Propriedade intelectual e licenças", paragraphs: ["A marca, os elementos próprios da plataforma e os conteúdos de terceiros permanecem sujeitos aos direitos dos respectivos titulares. A referência a Google, Firebase, Earth Engine, ESA ou NASA não implica patrocínio ou aprovação dessas entidades."] },
        { heading: "9. Suspensão e encerramento", paragraphs: ["Podemos restringir acesso em caso de abuso, risco de segurança, violação destes termos ou obrigação legal. Pode deixar de usar o serviço e solicitar a eliminação da sua conta e dados, nos termos da Política de Privacidade."] },
        { heading: "10. Alterações, lei e contacto", paragraphs: ["Estes termos podem ser revistos quando o serviço ou os requisitos legais mudarem. Na medida permitida, aplica-se a legislação de Moçambique, sem prejuízo de normas imperativas aplicáveis.", "Para dúvidas ou pedidos relacionados com a conta ou estas condições, contacte contacto@geolithica.com."] },
      ],
    },
  },
  en: {
    privacy: {
      title: "Privacy Policy",
      subtitle: "Transparency about personal data, geospatial analysis and Google Earth Engine authorisations.",
      introduction: "GeoMoz Explorer, operated by GEOLÍTHICA in Mozambique, processes information to provide mapping and geospatial services. Earth Engine access is optional and requires separate authorisation from signing in to GeoMoz.",
      highlights: ["Earth Engine credentials are linked to your verified account.", "You can disconnect GEE and revoke Google access.", "We do not sell data obtained through Google APIs."],
      sections: [
        { heading: "1. Operator and contact", paragraphs: ["GEOLÍTHICA operates GeoMoz Explorer. For privacy enquiries, corrections, data access, portability or deletion requests, email contacto@geolithica.com."] },
        { heading: "2. Data we process", paragraphs: ["Depending on your sign-in method, we process account information such as name, email address, Firebase user ID and technical session information.", "When using geospatial tools, we may process projects, locations, coordinates, uploaded files, layers, processing parameters, results and operational or security logs.", "If you connect Earth Engine, we may process the authorised Google account, chosen Cloud project, granted OAuth scopes, access tokens and refresh tokens when issued. You may also supply credentials for your own service account."] },
        { heading: "3. How we use Google API data", paragraphs: ["GeoMoz uses the authorisation you provide solely to execute requested Earth Engine features: access satellite data, compute indices, create map layers and perform geospatial operations in your selected Cloud project.", "Authorisation tokens are sent to the backend and, when persistence is available, stored privately against your verified GeoMoz user ID, rather than shown to other users. Google Earth Engine authorisation is separate from GeoMoz sign-in.", "We do not sell Google API data, use it for advertising or share it for unrelated purposes. Our use and transfer of Google API data comply with the Google API Services User Data Policy, including applicable Limited Use requirements."] },
        { heading: "4. Processing purposes", paragraphs: ["We process data for account registration, authentication, requested features, project management, support, security, abuse prevention and applicable legal obligations. Connecting Google OAuth is voluntary and can be withdrawn."] },
        { heading: "5. Third-party services", paragraphs: ["Features may use Firebase Authentication, Firestore, Firebase Storage, Google Cloud Run and Google Earth Engine. Scientific imagery may come from external providers such as ESA and NASA.", "Information may be shared with providers as necessary to operate requested features or where required by law. We do not deliberately expose your private credentials to other users."] },
        { heading: "6. Security and account isolation", paragraphs: ["GeoMoz aims to verify user sessions server-side, associate resources with individual account IDs and enforce access controls. Do not share private credentials or publish them in public URLs.", "No online service can guarantee absolute security. If you notice suspicious activity, sign out, revoke Google permissions and contact support."] },
        { heading: "7. Retention and deletion", paragraphs: ["Information is retained as necessary for requested features, account administration, security and applicable legal requirements. Retention varies by data type.", "Disconnecting GEE in GeoMoz is designed to remove stored Google credentials for your account, but does not erase previously exported files or automatically revoke access at Google.", "You can request account and data deletion at the contact address. Requests are reviewed subject to legal obligations, backups and technical requirements."] },
        { heading: "8. Your rights and revocation", paragraphs: ["You can request access, correction or deletion where applicable and stop using the service. Disconnect Earth Engine in GeoMoz and separately remove GeoMoz Explorer access in your Google Account's connected-app permissions."] },
        { heading: "9. Cookies and browser storage", paragraphs: ["Essential authentication mechanisms and browser storage may be used for sign-in and preferences such as language or appearance. Google sign-in may use its own cookies."] },
        { heading: "10. Policy changes", paragraphs: ["This notice may change to reflect technical, operational or legal developments. The latest update date will appear on this page."] },
      ],
    },
    terms: {
      title: "Terms of Service",
      subtitle: "Conditions for using GeoMoz Explorer and Google Earth Engine features.",
      introduction: "These terms govern GeoMoz Explorer, operated by GEOLÍTHICA. By using the platform, you agree to these conditions and applicable third-party service terms.",
      highlights: ["Each user manages their own account and permissions.", "Earth Engine access depends on Google eligibility.", "Validate geospatial outputs before critical decisions."],
      sections: [
        { heading: "1. The service", paragraphs: ["GeoMoz provides map exploration, geospatial processing, satellite imagery analysis and research tools. Some features require an authenticated account, an internet connection or third-party services."] },
        { heading: "2. Accounts and security", paragraphs: ["Provide accurate registration information and protect your credentials. Do not access other users' data or bypass security or authentication measures."] },
        { heading: "3. Earth Engine and Google Cloud", paragraphs: ["You need an eligible Google Earth Engine account and a correctly configured Google Cloud project with required APIs and permissions to use dependent features.", "GeoMoz does not grant Earth Engine access or override Google's terms, quotas, registration or billing conditions. You are responsible for your permissions and applicable Google Cloud project costs.", "OAuth consent permits GeoMoz to execute operations you request within the granted scopes. You may disconnect GeoMoz and revoke access in your Google Account."] },
        { heading: "4. Acceptable use", paragraphs: ["Use the service lawfully and respect data licences and third-party rights."], bullets: ["Do not introduce malware, exploit security vulnerabilities or bypass technical restrictions.", "Do not access someone else's account, credentials or data without permission.", "Do not upload unlawful content or content you lack rights to use.", "Respect provider licence terms, quotas and API policies."] },
        { heading: "5. Uploaded content and outputs", paragraphs: ["You retain rights you already hold in uploaded information and authorise GeoMoz to process it as necessary for the features you request.", "Output quality depends on source data, resolution, time period and coverage. Validate metadata, coordinate systems, assumptions and accuracy before sharing or using results."] },
        { heading: "6. Accuracy and critical decisions", paragraphs: ["Maps, spectral indices, estimates, models and AI predictions may be inaccurate. They do not replace field measurements, professional advice or independent validation in safety-critical, health, engineering, environmental or mining decisions."] },
        { heading: "7. Availability and third parties", paragraphs: ["Features may change or be interrupted by maintenance, network issues or outages at Google Cloud, Firebase, Earth Engine and data providers. Except where required by law or specifically agreed, uninterrupted availability is not guaranteed."] },
        { heading: "8. Intellectual property", paragraphs: ["The GeoMoz brand and original platform elements remain with their rights holders. External imagery and datasets retain their own licences. Google, Firebase, Earth Engine, ESA and NASA references do not imply endorsement."] },
        { heading: "9. Suspension and closure", paragraphs: ["Access may be restricted for abuse, security risks, violations or legal duties. You may stop using GeoMoz and request account or data deletion under the Privacy Policy."] },
        { heading: "10. Changes, law and contact", paragraphs: ["These terms may change as the service or law evolves. Mozambican law applies to the extent permitted without prejudice to mandatory protections.", "Contact contacto@geolithica.com with questions or data requests."] },
      ],
    },
  },
};

const UPDATED: Record<Language, string> = { pt: "14 de outubro de 2026", en: "14 October 2026" };

function LegalPage({ kind }: { kind: Kind }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "pt";
    try {
      return window.localStorage.getItem("geomoz_lang") === "en" ? "en" : "pt";
    } catch {
      return "pt";
    }
  });
  const info = documents[language][kind];
  useEffect(() => {
    const title = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const description = meta?.getAttribute("content");
    document.title = info.title + " | GeoMoz Explorer";
    meta?.setAttribute("content", info.subtitle);
    window.scrollTo(0, 0);
    return () => {
      document.title = title;
      if (description !== null && description !== undefined) meta?.setAttribute("content", description);
    };
  }, [info]);

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    try { window.localStorage.setItem("geomoz_lang", next); } catch { /* Optional browser preference. */ }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <a href="/" className="flex items-center gap-3 text-slate-950 dark:text-slate-100 hover:text-sky-700 dark:text-sky-300">
            <GeoMozBrandIcon className="h-11 w-11 rounded-xl" width={44} height={44} />
            <span><span className="block text-base font-extrabold">GeoMoz Explorer</span><span className="text-xs text-slate-500 dark:text-slate-400">GEOLÍTHICA · Geospatial Intelligence</span></span>
          </a>
          <div className="flex items-center gap-4">
            <div role="group" aria-label="Idioma / Language" className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-1">
              {(["pt", "en"] as const).map((code) => (
                <button type="button" key={code} onClick={() => changeLanguage(code)} aria-pressed={language === code} className={"rounded-md px-3 py-1.5 text-xs font-bold uppercase " + (language === code ? "bg-sky-600 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100")}>{code}</button>
              ))}
            </div>
            <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-sky-700 dark:text-sky-300"><ArrowLeft size={17} />{language === "pt" ? "Voltar" : "Back"}</a>
          </div>
        </div>
      </header>
      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-white">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-xs font-bold text-sky-200">
              {kind === "privacy" ? <ShieldCheck size={16} /> : <FileText size={16} />}
              {language === "pt" ? "TRANSPARÊNCIA E CONFIANÇA" : "TRANSPARENCY & TRUST"}
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{info.title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200 sm:text-lg">{info.subtitle}</p>
            <p className="mt-5 text-sm text-slate-300">{language === "pt" ? "Última actualização:" : "Last updated:"} {UPDATED[language]}</p>
          </div>
        </section>
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="mb-10 rounded-2xl border border-sky-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8">
            <p className="max-w-4xl text-base leading-8 text-slate-700 dark:text-slate-300">{info.introduction}</p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {info.highlights.map((highlight) => (
                <div key={highlight} className="flex items-start gap-2.5 rounded-xl bg-sky-50 dark:bg-sky-950 p-4 text-sm leading-6"><CheckCircle2 className="mt-0.5 shrink-0 text-sky-600" size={18} /><span>{highlight}</span></div>
              ))}
            </div>
          </div>
          <div className="grid items-start gap-9 lg:grid-cols-[240px_minmax(0,1fr)]">
            <nav aria-label={language === "pt" ? "Nesta página" : "On this page"} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 lg:sticky lg:top-6">
              <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wide text-slate-950 dark:text-slate-100">{language === "pt" ? "Nesta página" : "On this page"}</h2>
              <ol className="space-y-1">
                {info.sections.map((section, i) => <li key={section.heading}><a className="block rounded-lg px-2 py-2 text-sm leading-5 text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:bg-sky-950 hover:text-sky-700 dark:text-sky-300" href={"#section-" + (i + 1)}>{section.heading}</a></li>)}
              </ol>
            </nav>
            <div className="space-y-5">
              {info.sections.map((section, i) => (
                <section key={section.heading} id={"section-" + (i + 1)} aria-labelledby={"title-" + (i + 1)} className="scroll-mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8">
                  <h2 id={"title-" + (i + 1)} className="text-xl font-bold leading-snug text-slate-950 dark:text-slate-100 sm:text-2xl">{section.heading}</h2>
                  <div className="mt-4 space-y-4 text-[15px] leading-8 text-slate-700 dark:text-slate-300">
                    {section.paragraphs.map((text) => <p key={text}>{text}</p>)}
                    {section.bullets && <ul className="list-disc space-y-1 pl-6">{section.bullets.map((text) => <li key={text}>{text}</li>)}</ul>}
                  </div>
                </section>
              ))}
              {kind === "privacy" && (
                <aside className="rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950 p-6 text-sm leading-7 sm:p-8">
                  <h2 className="text-lg font-bold text-sky-950 dark:text-sky-100">{language === "pt" ? "Gerir as autorizações Google" : "Manage your Google permissions"}</h2>
                  <p className="mt-2">{language === "pt" ? "Pode rever ou revogar o acesso da aplicação directamente na sua Conta Google." : "You may review or revoke this application's access directly in your Google Account."}</p>
                  <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 font-semibold text-sky-800 dark:text-sky-200 underline underline-offset-4">{language === "pt" ? "Permissões da Conta Google" : "Google Account permissions"}<ArrowUpRight size={16} /></a>
                  <p className="mt-3 text-xs">{language === "pt" ? "Consulte também a " : "See also the "}<a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline">Google API Services User Data Policy</a>.</p>
                </aside>
              )}
              <section className="rounded-2xl bg-slate-900 p-7 text-white sm:p-9">
                <div className="flex items-center gap-2 text-sky-300"><Mail size={19} /><span className="text-sm font-bold">GEOLÍTHICA</span></div>
                <h2 className="mt-3 text-2xl font-bold">{language === "pt" ? "Dúvidas ou pedidos?" : "Questions or requests?"}</h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">{language === "pt" ? "Para questões sobre privacidade, acesso, eliminação de dados ou os termos, contacte a equipa GeoMoz." : "For privacy, access, deletion or terms questions, contact the GeoMoz team."}</p>
                <a href="mailto:contacto@geolithica.com" className="mt-5 inline-flex max-w-full items-center gap-2 break-all rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-500"><Mail size={16} />contacto@geolithica.com</a>
              </section>
            </div>
          </div>
        </div>
      </main>
      <footer className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-5 py-7 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:px-8">
          <p>© {new Date().getFullYear()} GEOLÍTHICA · GeoMoz Explorer</p>
          <a href="/" className="inline-flex items-center gap-2 font-semibold text-sky-700 dark:text-sky-300 hover:text-sky-950 dark:text-sky-100"><ArrowLeft size={16} />{language === "pt" ? "Página inicial" : "Homepage"}</a>
        </div>
      </footer>
    </div>
  );
}

export function PrivacyPolicy() { return <LegalPage kind="privacy" />; }
export function TermsOfService() { return <LegalPage kind="terms" />; }
