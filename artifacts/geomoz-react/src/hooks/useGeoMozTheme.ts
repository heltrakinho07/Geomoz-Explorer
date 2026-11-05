import {useSyncExternalStore} from "react";
export type GeoMozTheme = "light" | "dark";
declare global {
  interface Window {
    GeoMozTheme?: {
      getTheme:()=>GeoMozTheme;
      setTheme:(theme:GeoMozTheme)=>void;
      toggle:()=>void;
      subscribe:(callback:()=>void)=>()=>void;
    };
  }
}
function snapshot():GeoMozTheme {
  return window.GeoMozTheme?.getTheme() ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");
}
function subscribe(callback:()=>void) {
  if(window.GeoMozTheme) return window.GeoMozTheme.subscribe(callback);
  window.addEventListener("geomoz_theme_changed",callback);
  return ()=>window.removeEventListener("geomoz_theme_changed",callback);
}
export function useGeoMozTheme() {
  const theme=useSyncExternalStore(subscribe,snapshot,()=>"light" as GeoMozTheme);
  const setTheme=(next:GeoMozTheme)=>{
    if(window.GeoMozTheme)window.GeoMozTheme.setTheme(next);
    else {
      document.documentElement.classList.toggle("dark",next==="dark");
      document.documentElement.style.colorScheme=next;
      try{localStorage.setItem("geomoz_theme",next);}catch{}
      window.dispatchEvent(new CustomEvent("geomoz_theme_changed",{detail:next}));
    }
  };
  return {theme,setTheme,toggleTheme:()=>setTheme(theme==="dark"?"light":"dark")};
}
