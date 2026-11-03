import { useEffect, useState } from "react";

interface SharedPreferences {
  getLanguage(): string;
  setLanguage(language: string): boolean;
  getReducedMotion(): boolean;
  setReducedMotion(enabled: boolean): void;
  subscribe(callback: () => void): () => void;
}
declare global { interface Window { GeoMozPreferences?: SharedPreferences } }

const read = () => ({
  language: window.GeoMozPreferences?.getLanguage() ?? "pt",
  reducedMotion: window.GeoMozPreferences?.getReducedMotion() ?? false,
});

/** Preferences are browser-local, shared across GeoMoz Explorer and GIS Workspace.
 * They never include authentication, cloud tokens or geospatial project data.
 */
export function useGeoMozPreferences() {
  const [settings, setSettings] = useState(read);
  useEffect(() => {
    const api=window.GeoMozPreferences;
    if (!api) return;
    setSettings(read());
    return api.subscribe(() => setSettings(read()));
  }, []);
  return {
    ...settings,
    setLanguage: (language: string) => {
      if (window.GeoMozPreferences?.setLanguage(language)) setSettings(read());
    },
    setReducedMotion: (enabled: boolean) => {
      window.GeoMozPreferences?.setReducedMotion(enabled);
      setSettings(read());
    },
  };
}
