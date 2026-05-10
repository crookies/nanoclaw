import { useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, LogOut, MessageSquare, Moon, Sun, Zap, Wifi, WifiOff } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";
import { Messages } from "@/pages/Messages";
import { AgentSessions } from "@/pages/AgentSessions";
import { SessionDetail } from "@/pages/SessionDetail";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
});

function Sidebar() {
  const wsConnected = useDashboardStore((s) => s.wsConnected);
  useWebSocket();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark"),
  );

  function toggleTheme() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("crookery-theme", next ? "dark" : "light");
    setIsDark(next);
  }

  async function handleLogout() {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    qc.removeQueries({ queryKey: ["auth-me"] });
    navigate("/login", { replace: true });
  }

  const nav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/messages", label: "Communications", icon: MessageSquare },
  ];

  return (
    <aside className="flex w-56 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
        <Zap className="h-5 w-5 text-secondary" />
        <span className="text-sm font-bold text-foreground tracking-tight flex-1">Crookery</span>
        <button
          onClick={toggleTheme}
          title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-border flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {wsConnected ? (
            <>
              <Wifi className="h-3 w-3 text-secondary" /> Temps réel actif
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-destructive" /> Reconnexion...
            </>
          )}
        </span>
        <button
          onClick={handleLogout}
          title="Se déconnecter"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}

function Layout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/agents/:agentId" element={<AgentSessions />} />
          <Route path="/agents/:agentId/sessions/:sessionId" element={<SessionDetail />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
