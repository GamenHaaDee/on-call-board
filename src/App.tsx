import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSetupStatus } from "@/data/api";
import Index from "./pages/Index.tsx";
import Admin from "./pages/Admin.tsx";
import Setup from "./pages/Setup.tsx";
import Settings from "./pages/Settings.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

/** Bij het eerste gebruik (nog geen rooster) eerst de setup-pagina tonen. */
const RequireSetup = ({ children }: { children: React.ReactNode }) => {
  const status = useSetupStatus();

  if (status.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Bij een onbereikbare backend tonen de pagina's zelf al een foutmelding.
  if (status.data && !status.data.configured) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <RequireSetup>
              <Index />
            </RequireSetup>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireSetup>
              <Admin />
            </RequireSetup>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireSetup>
              <Settings />
            </RequireSetup>
          }
        />
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
