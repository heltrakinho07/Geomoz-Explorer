import React, { Component, type ReactNode, type ErrorInfo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import LandingPage from "@/pages/LandingPage";
import Explorer from "@/pages/Explorer";
import { AuthProvider } from "@/hooks/useAuth";

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
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-50 p-4 text-center">
      <div className="rounded-lg bg-white p-8 shadow-xl max-w-md border border-red-100">
        <h2 className="text-xl font-bold text-red-600 mb-4">Ups, algo correu mal!</h2>
        <p className="text-gray-600 mb-4 text-sm">Ocorreu um erro na interface do mapa.</p>
        <div className="bg-gray-100 p-3 rounded text-left text-xs text-gray-800 mb-6 overflow-auto max-h-32 font-mono">
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

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <Switch>
            <Route path="/">{() => <LandingPage />}</Route>
            <Route path="/login">{() => <LandingPage initialAuthMode="login" />}</Route>
            <Route path="/register">{() => <LandingPage initialAuthMode="register" />}</Route>
            <Route path="/app">{() => <Explorer />}</Route>
            <Route path="/explorer">{() => <Explorer />}</Route>
            <Route path="/mapa">{() => <Explorer />}</Route>
            <Route path="/estatisticas">{() => <Explorer />}</Route>
            <Route path="/analises">{() => <Explorer />}</Route>
            <Route path="/hidrografia">{() => <Explorer />}</Route>
            <Route path="/agua-subterranea">{() => <Explorer />}</Route>
            <Route path="/geoperigos">{() => <Explorer />}</Route>
            <Route path="/geomoz-ai">{() => <Explorer />}</Route>
            <Route path="/dashboard">{() => <Explorer />}</Route>
            <Route path="/exportar">{() => <Explorer />}</Route>
            {/* Fallback to Explorer for any other direct link */}
            <Route>{() => <Explorer />}</Route>
          </Switch>
        </ErrorBoundary>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
