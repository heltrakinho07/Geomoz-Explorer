/**
 * Lazy-loaded page components for code splitting.
 *
 * Each page below is a heavy module that should only be loaded on demand.
 * Using React.lazy() + Suspense, the bundler (Vite) will create separate
 * JavaScript chunks, loaded only when the user navigates to that tab.
 *
 * Usage:
 *   import { LazyGeoAnalises, LazyHidroGeoMoz, ... } from "@/lib/lazy-pages";
 *   <Suspense fallback={<LoadingFallback />}>
 *     <LazyGeoAnalises ... />
 *   </Suspense>
 */

import { lazy, type ComponentType } from "react";

function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error: any) {
      console.warn("[GeoMoz] Dynamic chunk import failed, verifying version...", error);
      const isChunkError =
        error?.message?.includes("dynamically imported module") ||
        error?.message?.includes("Loading chunk") ||
        error?.message?.includes("Importing a module script failed") ||
        error?.message?.includes("Failed to fetch");

      if (isChunkError && typeof window !== "undefined") {
        const hasRefreshed = sessionStorage.getItem("geomoz_chunk_refresh");
        if (!hasRefreshed) {
          sessionStorage.setItem("geomoz_chunk_refresh", "true");
          if ("caches" in window) {
            try {
              const keys = await caches.keys();
              await Promise.all(keys.map((k) => caches.delete(k)));
            } catch {}
          }
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw error;
    }
  });
}

export const LazyGeoAnalises = lazyWithRetry(() => import("@/pages/GeoAnalises"));

export const LazyHidroGeoMoz = lazyWithRetry(() => import("@/pages/HidroGeoMoz"));

export const LazyGeoperigos = lazyWithRetry(() => import("@/pages/Geoperigos"));

export const LazyAguaSubterranea = lazyWithRetry(() => import("@/pages/AguaSubterranea"));

export const LazyGeoMozAI = lazyWithRetry(() => import("@/pages/GeoMozAI"));

export const LazyGeoProcessamento = lazyWithRetry(() => import("@/pages/GeoProcessamento"));
