import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import {
  User,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider, db } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { apiFetch } from "../lib/api";

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isGuest: boolean;
  continueAsGuest: () => void;
  signIn: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const GUEST_STORAGE_KEY = "geomoz_guest_session";

export const GUEST_USER: User = {
  uid: "guest_user",
  displayName: "Convidado (Modo Demo)",
  email: "convidado@geomoz.org",
  isAnonymous: true,
  emailVerified: true,
  phoneNumber: null,
  photoURL: null,
  providerId: "anonymous",
  metadata: {} as any,
  providerData: [],
  refreshToken: "",
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => "guest-token",
  getIdTokenResult: async () => ({} as any),
  reload: async () => {},
  toJSON: () => ({}),
};

export function formatAuthError(err: any): string {
  if (!err) return "Ocorreu um erro desconhecido na autenticação.";
  const code = err.code || "";
  const rawMsg = err.message || "";

  if (code === "auth/unauthorized-domain" || rawMsg.includes("unauthorized-domain")) {
    const currentDomain = typeof window !== "undefined" ? window.location.hostname : "o domínio atual";
    return `Domínio '${currentDomain}' não autorizado no Firebase OAuth. Adicione '${currentDomain}' na Consola do Firebase (Authentication > Settings > Authorized Domains). Também pode entrar de imediato no 'Modo Convidado'.`;
  }

  switch (code) {
    case "auth/invalid-email":
      return "O endereço de e-mail introduzido não é válido.";
    case "auth/user-not-found":
      return "Não existe nenhuma conta associada a este e-mail.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "E-mail ou palavra-passe incorretos. Verifique os dados introduzidos.";
    case "auth/email-already-in-use":
      return "Este e-mail já se encontra registado. Experimente iniciar sessão.";
    case "auth/weak-password":
      return "A palavra-passe deve conter pelo menos 6 caracteres.";
    case "auth/popup-closed-by-user":
      return "A janela de início de sessão da Google foi fechada.";
    case "auth/network-request-failed":
      return "Erro de rede. Verifique a sua ligação à Internet.";
    case "auth/too-many-requests":
      return "Demasiadas tentativas falhadas. Aguarde alguns minutos antes de tentar novamente.";
    default:
      return err.message || "Ocorreu uma falha no serviço de autenticação.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(GUEST_STORAGE_KEY) === "true") {
        return GUEST_USER;
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      console.warn("Firebase Auth is not initialized. Check your environment variables.");
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        try {
          localStorage.removeItem(GUEST_STORAGE_KEY);
        } catch {}
        setUser(currentUser);
      } else {
        try {
          if (localStorage.getItem(GUEST_STORAGE_KEY) === "true") {
            setUser(GUEST_USER);
            setLoading(false);
            return;
          }
        } catch {}
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const clearError = () => setError(null);

  const continueAsGuest = () => {
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, "true");
    } catch {}
    setUser(GUEST_USER);
    setError(null);
  };

  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          try {
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const accessToken = credential?.accessToken;
            const uid = result.user.uid;
            const email = result.user.email || "";
            const defaultProject = "geoprocessamento-426809";

            if (accessToken && uid) {
              if (typeof window !== "undefined") {
                localStorage.setItem(`geomoz_gee_user_${uid}_token`, accessToken);
                localStorage.setItem(`geomoz_gee_user_${uid}_project`, defaultProject);
                localStorage.setItem(`geomoz_gee_user_${uid}_account`, email);
                localStorage.setItem(`geomoz_gee_user_${uid}_connected`, "true");
                localStorage.setItem("geomoz_gee_oauth_token", accessToken);
                localStorage.setItem("geomoz_gee_project", defaultProject);
              }

              result.user.getIdToken(false).then((idToken) => {
                const headers: Record<string, string> = { "Content-Type": "application/json" };
                if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
                apiFetch("/geomoz-api/gee/oauth-token", {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    access_token: accessToken,
                    project: defaultProject,
                  }),
                }).catch(() => null);
              }).catch(() => null);

              if (db && uid !== "guest_user") {
                const docRef = doc(db, "users", uid, "settings", "gee");
                setDoc(
                  docRef,
                  {
                    project: defaultProject,
                    account: email,
                    access_token: accessToken,
                    connected: true,
                    connectedAt: new Date().toISOString(),
                  },
                  { merge: true }
                ).catch(() => null);
              }
            }
          } catch (e) {
            console.warn("Redirect credential capture notice:", e);
          }
        }
      })
      .catch((err) => {
        console.warn("getRedirectResult notice:", err);
      });
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) return;
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {}

      // Automatically capture GEE access token from the Google login!
      try {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential?.accessToken;
        const uid = result.user?.uid;
        const email = result.user?.email || "";
        const defaultProject = "geoprocessamento-426809";

        if (accessToken && uid) {
          if (typeof window !== "undefined") {
            localStorage.setItem(`geomoz_gee_user_${uid}_token`, accessToken);
            localStorage.setItem(`geomoz_gee_user_${uid}_project`, defaultProject);
            localStorage.setItem(`geomoz_gee_user_${uid}_account`, email);
            localStorage.setItem(`geomoz_gee_user_${uid}_connected`, "true");
            localStorage.setItem("geomoz_gee_oauth_token", accessToken);
            localStorage.setItem("geomoz_gee_project", defaultProject);
          }

          // Register with backend in background
          result.user.getIdToken(false).then((idToken) => {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
            apiFetch("/geomoz-api/gee/oauth-token", {
              method: "POST",
              headers,
              body: JSON.stringify({
                access_token: accessToken,
                project: defaultProject,
              }),
            }).catch(() => null);
          }).catch(() => null);

          // Persist in Firestore
          if (db && uid !== "guest_user") {
            const docRef = doc(db, "users", uid, "settings", "gee");
            setDoc(
              docRef,
              {
                project: defaultProject,
                account: email,
                access_token: accessToken,
                connected: true,
                connectedAt: new Date().toISOString(),
              },
              { merge: true }
            ).catch(() => null);
          }
        }
      } catch (tokenErr) {
        console.warn("Auto-capturing GEE token during Google login notice:", tokenErr);
      }
    } catch (err: any) {
      console.error("Error signing in with Google", err);
      const msg = formatAuthError(err);
      setError(msg);
      const enriched = new Error(msg);
      (enriched as any).code = err?.code || "";
      (enriched as any).originalMessage = err?.message || "";
      throw enriched;
    }
  };

  const signInWithGoogleRedirect = async () => {
    if (!auth) return;
    setError(null);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err: any) {
      console.error("Error signing in with Google Redirect", err);
      const msg = formatAuthError(err);
      setError(msg);
      throw new Error(msg);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!auth) return;
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {}
    } catch (err: any) {
      console.error("Error signing in with Email", err);
      const msg = formatAuthError(err);
      setError(msg);
      const enriched = new Error(msg);
      (enriched as any).code = err?.code || "";
      throw enriched;
    }
  };

  const registerWithEmail = async (email: string, password: string, displayName?: string) => {
    if (!auth) return;
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {}
      if (displayName && cred.user) {
        await updateProfile(cred.user, { displayName });
        setUser({ ...cred.user, displayName });
      }
    } catch (err: any) {
      console.error("Error registering with Email", err);
      const msg = formatAuthError(err);
      setError(msg);
      const enriched = new Error(msg);
      (enriched as any).code = err?.code || "";
      throw enriched;
    }
  };

  const resetPassword = async (email: string) => {
    if (!auth) return;
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err: any) {
      console.error("Error sending reset password email", err);
      const msg = formatAuthError(err);
      setError(msg);
      const enriched = new Error(msg);
      (enriched as any).code = err?.code || "";
      throw enriched;
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {}
    setUser(null);
    if (!auth) return;
    setError(null);
    try {
      await firebaseSignOut(auth);
    } catch (err: any) {
      console.error("Error signing out", err);
      setError(formatAuthError(err));
    }
  };

  const getIdToken = async () => {
    if (auth && auth.currentUser) {
      return await auth.currentUser.getIdToken(true);
    }
    return null;
  };

  const isGuest = user?.uid === "guest_user";

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isGuest,
        continueAsGuest,
        signIn: signInWithGoogle,
        signInWithGoogle,
        signInWithGoogleRedirect,
        signInWithEmail,
        registerWithEmail,
        resetPassword,
        signOut,
        getIdToken,
        clearError,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
