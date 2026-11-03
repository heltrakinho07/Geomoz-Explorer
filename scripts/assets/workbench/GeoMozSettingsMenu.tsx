import { useEffect, useRef, useState } from "react";
import { Settings2, Languages, Sun, Moon, Accessibility, Keyboard, Wrench, Info, ArrowUpRight } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import type { Command } from "../../lib/commands";
import type { ThemeMode } from "../../hooks/useThemeMode";

type PreferencesController = {
  getLanguage: () => string;
  setLanguage: (value: string) => boolean;
  getReducedMotion: () => boolean;
  setReducedMotion: (value: boolean) => void;
  subscribe: (callback: () => void) => () => void;
};
declare global { interface Window { GeoMozPreferences?: PreferencesController } }

const translations: Record<string, Record<string, string>> = {
  pt: { settings:"Configurações", interface:"INTERFACE", language:"Idioma", appearance:"Aparência",
    theme:"Alternar entre modo claro e escuro", motion:"Reduzir animações", motionDetail:"Minimizar transições na interface e no mapa",
    support:"AJUDA E INFORMAÇÕES", shortcuts:"Atalhos de teclado", diagnostics:"Diagnóstico",
    docs:"Documentação GeoMoz", about:"Sobre o GeoMoz", portal:"Voltar ao GeoMoz Explorer",
    partial:"O motor SIG possui traduções próprias. Algumas ferramentas GeoMoz ainda estão em português." },
  en: { settings:"Settings", interface:"INTERFACE", language:"Language", appearance:"Appearance",
    theme:"Switch light/dark appearance", motion:"Reduce animations", motionDetail:"Minimise interface and map transitions",
    support:"HELP AND INFORMATION", shortcuts:"Keyboard shortcuts", diagnostics:"Diagnostics",
    docs:"GeoMoz documentation", about:"About GeoMoz", portal:"Back to GeoMoz Explorer",
    partial:"The GIS engine has its own translations. Some GeoMoz tools are still in Portuguese." },
  es: { settings:"Configuración", interface:"INTERFAZ", language:"Idioma", appearance:"Apariencia",
    theme:"Cambiar modo claro/oscuro", motion:"Reducir animaciones", motionDetail:"Reducir las transiciones en la interfaz y el mapa",
    support:"AYUDA E INFORMACIÓN", shortcuts:"Atajos de teclado", diagnostics:"Diagnóstico",
    docs:"Documentación GeoMoz", about:"Acerca de GeoMoz", portal:"Volver a GeoMoz Explorer",
    partial:"El motor SIG tiene sus propias traducciones. Algunas herramientas GeoMoz siguen en portugués." },
  fr: { settings:"Paramètres", interface:"INTERFACE", language:"Langue", appearance:"Apparence",
    theme:"Changer le thème clair/sombre", motion:"Réduire les animations", motionDetail:"Limiter les transitions de l'interface et de la carte",
    support:"AIDE ET INFORMATIONS", shortcuts:"Raccourcis clavier", diagnostics:"Diagnostic",
    docs:"Documentation GeoMoz", about:"À propos de GeoMoz", portal:"Retour à GeoMoz Explorer",
    partial:"Le moteur SIG dispose de traductions. Certains outils GeoMoz restent en portugais." },
};

export function GeoMozSettingsMenu({themeMode,onToggleThemeMode,onAbout,helpCommands}:{
  themeMode: ThemeMode;
  onToggleThemeMode: () => void;
  onAbout: () => void;
  helpCommands: Command[];
}) {
  const {language, options, setLanguage} = useLanguage();
  const [reducedMotion,setReducedMotion] = useState(
    () => window.GeoMozPreferences?.getReducedMotion() ?? false
  );
  const rootRef = useRef<HTMLDetailsElement>(null);
  const pendingLanguage = useRef<string|null>(null);
  const copy = translations[language] ?? translations.en;
  const label = (key: string) => copy[key] ?? translations.pt[key] ?? key;

  useEffect(() => {
    const api = window.GeoMozPreferences;
    return api?.subscribe(() => setReducedMotion(api.getReducedMotion()));
  }, []);

  // Only persist to the shared preference after i18next has loaded and applied
  // the selected locale. The engine may reject a failed locale chunk request.
  useEffect(() => {
    if(pendingLanguage.current === language) {
      pendingLanguage.current = null;
      window.GeoMozPreferences?.setLanguage(language);
    }
  }, [language]);

  useEffect(() => {
    const syncLanguage = () => {
      const next = window.GeoMozPreferences?.getLanguage();
      if(next && next !== language && options.some(option=>option.code === next)) setLanguage(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (["geomoz_language", "geolibre.desktopSettings", null].includes(event.key)) syncLanguage();
    };
    window.addEventListener("geomoz_preferences_changed",syncLanguage);
    window.addEventListener("storage",onStorage);
    return () => {
      window.removeEventListener("geomoz_preferences_changed",syncLanguage);
      window.removeEventListener("storage",onStorage);
    };
  }, [language, options, setLanguage]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current?.open && !rootRef.current.contains(event.target as Node)) rootRef.current.open = false;
    };
    const onKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && rootRef.current?.open) {
        rootRef.current.open = false;
        rootRef.current.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown",onPointer);
    document.addEventListener("keydown",onKeyboard);
    return () => {
      document.removeEventListener("pointerdown",onPointer);
      document.removeEventListener("keydown",onKeyboard);
    };
  }, []);

  const chooseLanguage = (next: string) => {
    if (!options.some(option=>option.code===next)) return;
    pendingLanguage.current = next;
    setLanguage(next);
  };
  const chooseReducedMotion = (enabled: boolean) => {
    setReducedMotion(enabled);
    window.GeoMozPreferences?.setReducedMotion(enabled);
  };
  const runCommand = (command: Command) => {
    if (command.disabledReason) return;
    rootRef.current!.open = false;
    command.run();
  };
  return (
    <details ref={rootRef} className="gm-module-switch gm-settings" data-testid="geomoz-settings-menu">
      <summary aria-label={label("settings")} title={label("settings")} data-testid="geomoz-settings-trigger">
        <Settings2 size={18} aria-hidden="true"/><span>{label("settings")}</span>
      </summary>
      <nav className="gm-settings-popover" aria-label={label("settings")}>
        <small>{label("interface")}</small>
        <label className="gm-settings-field">
          <span><Languages size={15} aria-hidden="true"/>{label("language")}</span>
          <select data-testid="geomoz-language-selector" aria-label={label("language")}
            value={language} onChange={event=>chooseLanguage(event.target.value)}>
            {options.map(option=><option key={option.code} value={option.code} lang={option.code}>{option.nativeName}</option>)}
          </select>
        </label>
        <button type="button" className="gm-settings-action" data-testid="geomoz-theme-toggle"
          onClick={onToggleThemeMode} aria-label={label("theme")}>
          {themeMode==="dark"?<Sun size={16}/>:<Moon size={16}/>}
          <span>{label("appearance")}</span><strong>{themeMode==="dark"?"☾":"☀"}</strong>
        </button>
        <label className="gm-settings-motion">
          <span><Accessibility size={16}/><span>{label("motion")}<em>{label("motionDetail")}</em></span></span>
          <input data-testid="geomoz-reduced-motion" type="checkbox" checked={reducedMotion}
            onChange={event=>chooseReducedMotion(event.target.checked)}/>
        </label>
        <div className="gm-settings-divider"/>
        <small>{label("support")}</small>
        {helpCommands.map(command=>{
          const isDiagnostics = command.id==="help.diagnostics";
          return <button type="button" className="gm-settings-action" key={command.id} disabled={!!command.disabledReason}
            title={command.disabledReason} onClick={()=>runCommand(command)}>
            {isDiagnostics?<Wrench size={16}/>:<Keyboard size={16}/>}
            <span>{label(isDiagnostics?"diagnostics":"shortcuts")}</span>
          </button>;
        })}
        <a href="/documentacao"><ArrowUpRight size={16}/><span>{label("docs")}</span></a>
        <button type="button" className="gm-settings-action" data-testid="geomoz-about-trigger"
          onClick={()=>{rootRef.current!.open=false;onAbout();}}><Info size={16}/><span>{label("about")}</span></button>
        <a href="/dashboard"><ArrowUpRight size={16}/><span>{label("portal")}</span></a>
        <p className="gm-settings-note">{label("partial")}</p>
      </nav>
    </details>
  );
}
