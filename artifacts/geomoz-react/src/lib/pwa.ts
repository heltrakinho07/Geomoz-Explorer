import { useState, useEffect, useCallback } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(canInstall: boolean) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((listener) => listener(true));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installListeners.forEach((listener) => listener(false));
    console.log("[GeoMoz PWA] App installed successfully.");
  });
}

/**
 * Register the Service Worker in production or supporting browsers.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[GeoMoz PWA] Service Worker registered:", reg.scope);

        // Check for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("[GeoMoz PWA] New update available.");
                window.dispatchEvent(new CustomEvent("geomoz_pwa_update_available"));
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn("[GeoMoz PWA] Service Worker registration failed:", err);
      });
  });
}

/**
 * Check if the application is currently running as a standalone installed PWA.
 */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes("android-app://")
  );
}

/**
 * Check if device is iOS (for custom 'Add to Home Screen' instructions).
 */
export function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

/**
 * React hook to manage PWA installation and network status.
 */
export function usePwa() {
  const [canInstall, setCanInstall] = useState<boolean>(Boolean(deferredPrompt));
  const [isStandalone, setIsStandalone] = useState<boolean>(isStandalonePwa());
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);

  useEffect(() => {
    setIsStandalone(isStandalonePwa());

    const updateInstallState = (available: boolean) => setCanInstall(available);
    installListeners.add(updateInstallState);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleUpdate = () => setUpdateAvailable(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("geomoz_pwa_update_available", handleUpdate);

    return () => {
      installListeners.delete(updateInstallState);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("geomoz_pwa_update_available", handleUpdate);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return false;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      deferredPrompt = null;
      setCanInstall(false);
      return true;
    }
    return false;
  }, []);

  return {
    canInstall,
    isStandalone,
    isOnline,
    isIos: isIosDevice(),
    updateAvailable,
    promptInstall,
  };
}
