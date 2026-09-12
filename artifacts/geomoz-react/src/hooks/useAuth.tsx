import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import {
  User,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

function formatAuthError(err: any): string {
  if (!err) return "Ocorreu um erro desconhecido na autenticação.";
  const code = err.code || "";
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      console.warn("Firebase Auth is not initialized. Check your environment variables.");
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const clearError = () => setError(null);

  const signInWithGoogle = async () => {
    if (!auth) return;
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Error signing in with Google", err);
      setError(formatAuthError(err));
      throw err;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!auth) return;
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      console.error("Error signing in with Email", err);
      const msg = formatAuthError(err);
      setError(msg);
      throw new Error(msg);
    }
  };

  const registerWithEmail = async (email: string, password: string, displayName?: string) => {
    if (!auth) return;
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName && cred.user) {
        await updateProfile(cred.user, { displayName });
        // Refresh current user state with display name
        setUser({ ...cred.user, displayName });
      }
    } catch (err: any) {
      console.error("Error registering with Email", err);
      const msg = formatAuthError(err);
      setError(msg);
      throw new Error(msg);
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
      throw new Error(msg);
    }
  };

  const signOut = async () => {
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

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signIn: signInWithGoogle,
        signInWithGoogle,
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
