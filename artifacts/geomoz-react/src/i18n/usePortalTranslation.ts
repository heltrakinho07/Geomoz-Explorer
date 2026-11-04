import { useGeoMozPreferences } from "../hooks/useGeoMozPreferences";
import { portalText, resolvedPortalLocale, type PortalCopyKey } from "./portal";

/** Reactive product translations backed by the exact shared language selected
 * in GeoMoz Explorer and the native GeoLibre/i18next GIS Workspace. This hook
 * never duplicates language persistence; GeoMozPreferences owns it.
 */
export function usePortalTranslation() {
  const preferences = useGeoMozPreferences();
  const language = preferences.language;
  return {
    language,
    translatedLocale: resolvedPortalLocale(language),
    t: (key: PortalCopyKey) => portalText(language, key),
    setLanguage: preferences.setLanguage,
  };
}
