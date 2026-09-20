import { useState, useEffect, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import WelcomePopup from "../WelcomePopup";
import CommandPalette from "../CommandPalette";
import ErrorBoundary from "../ErrorBoundary";
import SecurityMonitor from "../SecurityMonitor";
import EmailActivityPopup from "../EmailActivityPopup";
import { ARIAProvider } from "../../context/ARIAContext";
import ARIAPanel from "../aria/ARIAPanel";

function PageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite" }} />
        <p style={{ color: "var(--text-muted)", fontSize: 12.5, fontWeight: 500 }}>Loading...</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const [collapsed, setCollapsed]   = useState(() => localStorage.getItem("sb_collapsed") === "1");

  useEffect(() => {
    localStorage.setItem("sb_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen]       = useState(false);
  const location = useLocation();

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <ARIAProvider>
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 40,
          }}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <Header onMobileMenu={() => setMobileOpen(true)} onCommandPalette={() => setCmdOpen(true)} />
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "var(--bg)" }}>
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <WelcomePopup />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <SecurityMonitor />
      <EmailActivityPopup />
      <ARIAPanel />
    </div>
    </ARIAProvider>
  );
}
