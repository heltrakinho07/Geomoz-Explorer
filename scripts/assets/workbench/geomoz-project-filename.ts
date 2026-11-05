/** GeoMoz owns the filename; the compatible project JSON schema stays unchanged. */
export function geomozProjectFileName(name: string): string {
  let stem = name.trim().replace(/\.(?:geomoz(?:\.json)?|geolibre(?:\.json)?|json)$/i, "").trim();
  if (!stem || /^\.+$/.test(stem) || /^Untitled[ _]Project$/i.test(stem)) stem = "Untitled Projecto";
  return `${stem.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, "_").replace(/[. ]+$/, "")}.geomoz`;
}
