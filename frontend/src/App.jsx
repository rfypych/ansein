import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "./contexts/AuthContext";
import { http } from "./lib/api";
import { Layout } from "./components/Layout";
import { SetupWizard } from "./pages/SetupWizard";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { InvestigationList } from "./pages/InvestigationList";
import { InvestigationDetail } from "./pages/InvestigationDetail";
import { NewInvestigation } from "./pages/NewInvestigation";
import { CopilotPage } from "./pages/CopilotPage";
import { Settings } from "./pages/Settings";
import { Landing } from "./pages/Landing";
import { useEffect } from "react";

function ProtectedRoute({ children }) {
  const isAuthed = useAuthStore((s) => !!s.accessToken);
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
}

function useSetupStatus() {
  return useQuery({
    queryKey: ["setup-status"],
    queryFn: () => http.get("/setup/status"),
    staleTime: 60 * 1000,
    retry: false,
  });
}

export default function App() {
  const location = useLocation();
  const isAuthed = useAuthStore((s) => !!s.accessToken);
  const setupStatus = useSetupStatus();

  // Poll /auth/me when authed to refresh user data
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => http.get("/auth/me"),
    enabled: isAuthed,
    retry: false,
  });

  useEffect(() => {
    if (meQuery.data) {
      useAuthStore.getState().setUser(meQuery.data);
    }
  }, [meQuery.data]);

  // Show setup wizard if needed
  if (setupStatus.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading AnseIn…</div>
      </div>
    );
  }

  if (setupStatus.data?.setup_required && !location.pathname.startsWith("/setup")) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/setup" element={<SetupWizard />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="investigations" element={<InvestigationList />} />
        <Route path="investigations/new" element={<NewInvestigation />} />
        <Route path="investigations/:id" element={<InvestigationDetail />} />
        <Route path="copilot" element={<CopilotPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
