import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBecN1965syLWnc6Q2bj7BjtlfCfKxGRLA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "geoprocessamento-426809.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "geoprocessamento-426809",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "geoprocessamento-426809.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "628082413338",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:628082413338:web:dbb487c548fa8bca51e6a3",
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/earthengine");
