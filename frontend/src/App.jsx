import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { CurrencyProvider } from "./context/CurrencyContext";

// Auth pages (eager load)
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";
import Onboarding from "./pages/Auth/Onboarding";

// Layout
import Layout from "./components/layout/Layout";

// CRM Pages (lazy loaded)
const Dashboard   = lazy(() => import("./pages/Dashboard"));
const Leads       = lazy(() => import("./pages/Leads"));
const Deals       = lazy(() => import("./pages/Deals"));
const Customers   = lazy(() => import("./pages/Customers"));
const Tasks       = lazy(() => import("./pages/Tasks"));
const Meetings    = lazy(() => import("./pages/Meetings"));
const Chat        = lazy(() => import("./pages/Chat"));
const Team        = lazy(() => import("./pages/Team"));
const Settings    = lazy(() => import("./pages/Settings"));
const Activities  = lazy(() => import("./pages/Activities"));
const Reports     = lazy(() => import("./pages/Reports"));
const AIAssistant = lazy(() => import("./pages/AIAssistant"));
const Targets     = lazy(() => import("./pages/Targets"));
const Analytics   = lazy(() => import("./pages/Analytics"));
const Pipeline      = lazy(() => import("./pages/Pipeline"));
const SecurityLogs  = lazy(() => import("./pages/SecurityLogs"));
const DSR           = lazy(() => import("./pages/DSR"));
const Organization  = lazy(() => import("./pages/Organization"));

const AuthLoader = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
    <div style={{ width: 34, height: 34, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite" }} />
  </div>
);

const PageLoader = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200 }}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite" }} />
      <p style={{ color: "var(--text-muted)", fontSize: 12.5, fontWeight: 500 }}>Loading...</p>
    </div>
  </div>
);

// Protected layout — renders Layout + Outlet for all CRM routes
function ProtectedLayout() {
  const { user, loading, needsOnboarding } = useAuth();
  if (loading) return <AuthLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return <Layout />;
}

// Gate for the onboarding flow itself: needs a user, but no organization yet.
function OnboardingRoute() {
  const { user, loading, needsOnboarding } = useAuth();
  if (loading) return <AuthLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!needsOnboarding) return <Navigate to="/dashboard" replace />;
  return <Onboarding />;
}

// Public-only routes (redirect to dashboard if already logged in)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoader />;
  return user ? <Navigate to="/dashboard" replace /> : children;
};

// Owner/sales_head-only route guard
const OwnerOrHeadRoute = ({ children }) => {
  const { profile, loading } = useAuth();
  if (loading) return <AuthLoader />;
  return ["owner", "admin"].includes(profile?.role)
    ? children
    : <Navigate to="/dashboard" replace />;
};

const AdminRoute = ({ children }) => {
  const { isAdmin, loading } = useAuth();
  if (loading) return <AuthLoader />;
  return isAdmin ? children : <Navigate to="/dashboard" replace />;
};

export default function App() {
  return (
    <ErrorBoundary resetKey="root">
    <ThemeProvider>
      <CurrencyProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                borderRadius: "10px",
                fontSize: "13.5px",
                fontFamily: "Inter, sans-serif",
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-lg)",
              },
            }}
          />
          <Routes>
            {/* Auth */}
            <Route path="/login"           element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/signup"          element={<PublicRoute><Signup /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/reset-password"  element={<ResetPassword />} />
            <Route path="/onboarding"      element={<OnboardingRoute />} />

            {/* CRM — all nested under ProtectedLayout which renders <Layout /> */}
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard"   element={<Dashboard />} />
              <Route path="/pipeline"    element={<Pipeline />} />
              <Route path="/leads"       element={<Leads />} />
              <Route path="/deals"       element={<Deals />} />
              <Route path="/customers"   element={<Customers />} />
              <Route path="/tasks"       element={<Tasks />} />
              <Route path="/targets"     element={<Targets />} />
              <Route path="/meetings"    element={<Meetings />} />
              <Route path="/activities"  element={<Activities />} />
              <Route path="/dsr"         element={<DSR />} />
              <Route path="/chat"        element={<Chat />} />
              <Route path="/reports"     element={<OwnerOrHeadRoute><Reports /></OwnerOrHeadRoute>} />
              <Route path="/analytics"   element={<Analytics />} />
              <Route path="/team"        element={<Team />} />
              <Route path="/organization" element={<AdminRoute><Organization /></AdminRoute>} />
              <Route path="/settings"    element={<Settings />} />
              <Route path="/ai-assistant"   element={<AIAssistant />} />
              <Route path="/security-logs"  element={<OwnerOrHeadRoute><SecurityLogs /></OwnerOrHeadRoute>} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </CurrencyProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
