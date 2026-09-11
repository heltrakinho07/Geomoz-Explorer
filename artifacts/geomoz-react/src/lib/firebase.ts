import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "geoprocessamento-426809",
};

// Initialize only if we have an API key to avoid crashing the whole app with a blank screen
export const app = firebaseConfig.apiKey ? initializeApp(firebaseConfig) : null as any;
export const auth = app ? getAuth(app) : null as any;
export const googleProvider = new GoogleAuthProvider();
// Enable Earth Engine scope
googleProvider.addScope("https://www.googleapis.com/auth/earthengine");
