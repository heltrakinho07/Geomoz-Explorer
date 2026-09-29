import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Explorer from "@/pages/Explorer";
import { ErrorBoundary } from "react-error-boundary";
import { AuthProvider } from "@/hooks/useAuth";

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
          <Explorer />
        </ErrorBoundary>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
