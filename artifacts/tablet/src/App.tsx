import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeviceProvider, useDevice } from "@/contexts/device-context";
import { SetupPage } from "@/pages/setup";
import { HomePage } from "@/pages/home";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function AppShell() {
  const { appState, onSetupComplete } = useDevice();

  if (appState === "loading") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0e0b08" }}
      >
        {/* Subtle fade-in pulse while checking auth */}
        <div
          className="h-16 w-16 rounded-full animate-pulse"
          style={{ background: "rgba(180,130,90,0.2)" }}
        />
      </div>
    );
  }

  if (appState === "setup") {
    return <SetupPage onComplete={onSetupComplete} />;
  }

  return <HomePage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DeviceProvider>
        <AppShell />
      </DeviceProvider>
    </QueryClientProvider>
  );
}
