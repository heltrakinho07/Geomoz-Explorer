import React, { Component, type ReactNode, type ErrorInfo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import LandingPage from "@/pages/LandingPage";
import Explorer from "@/pages/Explorer";
import HidroWebGisViewer from "@/pages/HidroWebGisViewer";
import { AuthProvider } from "@/hooks/useAuth";
import { GeeAuthProvider } from "@/hooks/useGeeAuth";
import { ProjectProvider } from "@/context/ProjectContext";


interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent: React.ComponentType<{ error: Error; resetErrorBoundary: () => void }>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const Fallback = this.props.FallbackComponent;
      return <Fallback error={this.state.error} resetErrorBoundary={this.resetErrorBoundary} />;
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function ErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 text-center">
      <div className="rounded-lg bg-white dark:bg-slate-900 p-8 shadow-xl max-w-md border border-red-100 dark:border-red-900/50">
        <h2 className="text-xl font-bold text-red-600 mb-4">Ups, algo correu mal!</h2>
        <p className="text-gray-600 dark:text-slate-400 mb-4 text-sm">Ocorreu um erro na interface do mapa.</p>
        <div className="bg-gray-100 dark:bg-slate-800 p-3 rounded text-left text-xs text-gray-800 dark:text-slate-300 mb-6 overflow-auto max-h-32 font-mono">
          {error.message}
        </div>
        <button
          onClick={resetErrorBoundary}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-sky-400 animate-spin" />
          <p className="text-xs text-slate-400 font-medium">A verificar credenciais de acesso…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage initialAuthMode="login" />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <GeeAuthProvider>
        <QueryClientProvider client={queryClient}>
          <ProjectProvider>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Switch>
                <Route path="/">{() => <LandingPage />}</Route>
                <Route path="/login">{() => <LandingPage initialAuthMode="login" />}</Route>
                <Route path="/register">{() => <LandingPage initialAuthMode="register" />}</Route>
                <Route path="/view/hidro">{() => <HidroWebGisViewer />}</Route>
                <Route path="/share/hidro/:id">{(params) => <HidroWebGisViewer id={params.id} />}</Route>
                <Route path="/app">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/explorer">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/mapa">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/estatisticas">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/analises">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/hidrografia">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/agua-subterranea">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/geoperigos">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/geomoz-ai">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/dashboard">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                <Route path="/exportar">{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
                {/* Fallback to Explorer protected for any other direct link */}
                <Route>{() => <ProtectedRoute><Explorer /></ProtectedRoute>}</Route>
              </Switch>
            </ErrorBoundary>
            <Toaster />
          </ProjectProvider>
        </QueryClientProvider>
      </GeeAuthProvider>
    </AuthProvider>
  );
}
