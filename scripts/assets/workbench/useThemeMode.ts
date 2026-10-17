import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
export type ThemeMode = "light" | "dark";
type ThemeController={getTheme:()=>ThemeMode;setTheme:(theme:ThemeMode)=>void;toggle:()=>void;subscribe:(callback:()=>void)=>()=>void};
declare global { interface Window { GeoMozTheme?:ThemeController } }
export function getInitialThemeMode():ThemeMode {
  if(typeof window==="undefined")return "light";
  return window.GeoMozTheme?.getTheme()??(document.documentElement.classList.contains("dark")?"dark":"light");
}
const subscribe=(callback:()=>void)=>{
  if(window.GeoMozTheme)return window.GeoMozTheme.subscribe(callback);
  window.addEventListener("geomoz_theme_changed",callback);
  return ()=>window.removeEventListener("geomoz_theme_changed",callback);
};
export function useThemeMode(){
  const themeMode=useSyncExternalStore(subscribe,getInitialThemeMode,()=>"light" as ThemeMode);
  useLayoutEffect(()=>{document.documentElement.classList.toggle("dark",themeMode==="dark");document.documentElement.style.colorScheme=themeMode;},[themeMode]);
  const toggleThemeMode=useCallback(()=>{window.GeoMozTheme?.toggle();},[]);
  return {themeMode,toggleThemeMode};
}
