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

import { lazy } from "react";

export const LazyGeoAnalises = lazy(() => import("@/pages/GeoAnalises"));

export const LazyHidroGeoMoz = lazy(() => import("@/pages/HidroGeoMoz"));

export const LazyGeoperigos = lazy(() => import("@/pages/Geoperigos"));

export const LazyAguaSubterranea = lazy(() => import("@/pages/AguaSubterranea"));

export const LazyGeoMozAI = lazy(() => import("@/pages/GeoMozAI"));
