/** Pinned, self-hosted Cesium runtime. No Ion credentials or CDN dependency. */
export type CesiumSDK = typeof import("cesium");
declare global {
  interface Window { Cesium?: CesiumSDK; CESIUM_BASE_URL?: string }
}
let pending: Promise<CesiumSDK> | null = null;
export function loadCesium(): Promise<CesiumSDK> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const base = import.meta.env.BASE_URL + "cesium/1.127.0/";
    window.CESIUM_BASE_URL = base;
    if (!document.getElementById("geomoz-cesium-css")) {
      const css = document.createElement("link");
      css.id = "geomoz-cesium-css"; css.rel = "stylesheet"; css.href = base + "Widgets/widgets.css";
      document.head.append(css);
    }
    const script = document.createElement("script");
    script.src = base + "Cesium.js"; script.async = true;
    const timer = setTimeout(() => { script.remove(); pending = null;
      reject(new Error("O CesiumJS demorou demasiado a carregar. Tente novamente.")); }, 45000);
    script.onload = () => { clearTimeout(timer);
      if (window.Cesium) resolve(window.Cesium);
      else { pending = null; reject(new Error("Não foi possível iniciar o CesiumJS.")); }
    };
    script.onerror = () => { clearTimeout(timer); script.remove(); pending = null;
      reject(new Error("Falha ao carregar os recursos locais do CesiumJS. Tente novamente.")); };
    document.head.append(script);
  });
  return pending;
}
