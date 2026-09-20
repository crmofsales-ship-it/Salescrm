import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";

const AuthContext = createContext(null);

const INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes of genuine inactivity
const ACTIVE_ORG_KEY = "salescrm_active_org";
const DEVICE_KEY = "salescrm_device_id";

// ── role model (org-scoped): owner > admin > sales_manager > sales_rep ──────
const ROLE_RANK = { owner: 4, admin: 3, sales_manager: 2, sales_rep: 1 };

function parseUA() {
  const ua = navigator.userAgent;
  let browser = "Other", browser_version = null;
  if (/Edg\/[\d]/.test(ua)) { browser = "Edge"; browser_version = (ua.match(/Edg\/([\d]+)/) || [])[1] || null; }
  else if (/OPR\/[\d]/.test(ua)) { browser = "Opera"; browser_version = (ua.match(/OPR\/([\d]+)/) || [])[1] || null; }
  else if (/Firefox\/[\d]/.test(ua)) { browser = "Firefox"; browser_version = (ua.match(/Firefox\/([\d]+)/) || [])[1] || null; }
  else if (/Chrome\/[\d]/.test(ua)) { browser = "Chrome"; browser_version = (ua.match(/Chrome\/([\d]+)/) || [])[1] || null; }
  else if (/Version\/[\d]/.test(ua) && /Safari/.test(ua)) { browser = "Safari"; browser_version = (ua.match(/Version\/([\d]+)/) || [])[1] || null; }
  const os =
    /Windows NT 10\.0/.test(ua) ? "Windows 10/11" :
    /Windows/.test(ua) ? "Windows" :
    /Android ([\d.]+)/.test(ua) ? `Android ${(ua.match(/Android ([\d.]+)/) || [])[1] || ""}`.trim() :
    /iPhone|iPad/.test(ua) ? `iOS ${((ua.match(/OS ([\d_]+)/) || [])[1] || "").replace(/_/g, ".")}`.trim() :
    /Mac OS X ([\d_.]+)/.test(ua) ? `macOS ${((ua.match(/Mac OS X ([\d_.]+)/) || [])[1] || "").replace(/_/g, ".")}`.trim() :
    /Linux/.test(ua) ? "Linux" : "Other";
  const device_type = /Mobile|iPhone/.test(ua) && !/iPad/.test(ua) ? "Mobile" : /iPad|Tablet/.test(ua) ? "Tablet" : "Desktop";
  return { browser, browser_version, os, device_type, user_agent: ua.slice(0, 400) };
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);          // supabase auth user
  const [profile, setProfile] = useState(null);    // public.profiles row
  const [memberships, setMemberships] = useState([]); // organization_members rows (+ org)
  const [activeOrgId, setActiveOrgId] = useState(() => localStorage.getItem(ACTIVE_ORG_KEY) || null);
  const [loading, setLoading] = useState(true);
  const loginLogId = useRef(null);
  const inactivityTimer = useRef(null);
  const lastActivity = useRef(Date.now());
  const logoutRef = useRef(null);

  const loadProfileAndOrgs = useCallback(async (authUser) => {
    const { data: prof } = await supabase
      .from("profiles").select("*").eq("user_id", authUser.id).maybeSingle();

    if (prof && (prof.status === "deleted" || prof.status === "inactive")) {
      await supabase.auth.signOut();
      toast.error("Your account is not active. Contact your administrator.");
      return { profile: null, memberships: [] };
    }

    const { data: mems } = await supabase
      .from("organization_members")
      .select("*, organization:organizations(*)")
      .eq("user_id", prof?.id || "00000000-0000-0000-0000-000000000000")
      .eq("status", "active");

    return { profile: prof || null, memberships: mems || [] };
  }, []);

  const logLoginSession = useCallback(async (profileId, orgId) => {
    try {
      const devId = getOrCreateDeviceId();
      const ua = parseUA();
      const { data: existing } = await supabase
        .from("login_logs")
        .select("id")
        .eq("user_id", profileId)
        .eq("device_id", devId)
        .is("logged_out_at", null)
        .order("logged_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) { loginLogId.current = existing.id; return; }
      const { data: row } = await supabase
        .from("login_logs")
        .insert({ user_id: profileId, organization_id: orgId, ...ua, device_id: devId, session_status: "active" })
        .select("id").single();
      if (row?.id) loginLogId.current = row.id;
    } catch { /* non-critical */ }
  }, []);

  const applySession = useCallback(async (session) => {
    if (!session?.user) { setUser(null); setProfile(null); setMemberships([]); setLoading(false); return; }
    setUser(session.user);
    const { profile: prof, memberships: mems } = await loadProfileAndOrgs(session.user);

    // resolve active org
    let orgId = localStorage.getItem(ACTIVE_ORG_KEY);
    if (!mems.some((m) => m.organization_id === orgId)) orgId = mems[0]?.organization_id || null;

    // Expose the ACTIVE-ORG role as profile.role so the many `profile.role`
    // checks across the UI reflect org-scoped permissions, not the global default.
    const activeRole = mems.find((m) => m.organization_id === orgId)?.role;
    setProfile(prof ? { ...prof, role: activeRole || prof.role } : prof);
    setMemberships(mems);
    setActiveOrgId(orgId);
    if (orgId) localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    else localStorage.removeItem(ACTIVE_ORG_KEY);

    if (prof && orgId) logLoginSession(prof.id, orgId);
    setLoading(false);
  }, [loadProfileAndOrgs, logLoginSession]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      applySession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [applySession]);

  // ── inactivity auto-logout ────────────────────────────────────────────────
  useEffect(() => {
    logoutRef.current = logout;
  });
  useEffect(() => {
    if (!user) return;
    lastActivity.current = Date.now();
    const schedule = () => {
      clearTimeout(inactivityTimer.current);
      const remaining = INACTIVITY_MS - (Date.now() - lastActivity.current);
      inactivityTimer.current = setTimeout(() => {
        if (Date.now() - lastActivity.current >= INACTIVITY_MS) {
          toast("Logged out due to inactivity.", { icon: "🔒" });
          logoutRef.current?.("timeout");
        } else schedule();
      }, Math.max(remaining, 1000));
    };
    const onActivity = () => { lastActivity.current = Date.now(); };
    const EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "pointerdown", "input"];
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const iv = setInterval(schedule, 30000);
    schedule();
    return () => { clearInterval(iv); clearTimeout(inactivityTimer.current); EVENTS.forEach((e) => window.removeEventListener(e, onActivity)); };
  }, [user]);

  // ── auth actions ─────────────────────────────────────────────────────────
  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw error;
  };

  const signUp = async ({ email, password, fullName }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    return data;
  };

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw error;
  };

  const logout = async (status = "logged_out") => {
    if (loginLogId.current) {
      try {
        await supabase.from("login_logs")
          .update({ logged_out_at: new Date().toISOString(), session_status: status })
          .eq("id", loginLogId.current);
      } catch { /* non-critical */ }
      loginLogId.current = null;
    }
    localStorage.removeItem(ACTIVE_ORG_KEY);
    sessionStorage.removeItem("dealsView");
    await supabase.auth.signOut();
  };

  const forgotPassword = (email) =>
    supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

  const updatePassword = (password) => supabase.auth.updateUser({ password });

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Not authenticated");
    return data.session.access_token;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const { profile: prof, memberships: mems } = await loadProfileAndOrgs(user);
    const activeRole = mems.find((m) => m.organization_id === activeOrgId)?.role;
    setProfile(prof ? { ...prof, role: activeRole || prof.role } : prof);
    setMemberships(mems);
    return prof;
  }, [user, loadProfileAndOrgs, activeOrgId]);

  const switchOrg = useCallback((orgId) => {
    if (!memberships.some((m) => m.organization_id === orgId)) return;
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    setActiveOrgId(orgId);
    window.location.reload(); // simplest correct way to re-scope all queries
  }, [memberships]);

  // ── derived org context ──────────────────────────────────────────────────
  const activeMembership = memberships.find((m) => m.organization_id === activeOrgId) || null;
  const organization = activeMembership?.organization || null;
  const orgRole = activeMembership?.role || null;

  const rank = ROLE_RANK[orgRole] || 0;
  const isOwner = orgRole === "owner";
  const isAdmin = rank >= ROLE_RANK.admin;
  const isSalesHead = rank >= ROLE_RANK.admin;        // legacy alias
  const isManager = rank >= ROLE_RANK.sales_manager;
  const isFieldUser = orgRole === "sales_rep";
  const isInsideSales = false;                         // legacy alias (folded into sales_rep)
  const hasRole = (roles) => roles.includes(orgRole);
  const can = (minRole) => rank >= (ROLE_RANK[minRole] || 99);

  const value = {
    user, profile, loading,
    memberships, organization, activeOrgId, orgRole, activeMembership,
    needsOnboarding: !!user && !!profile && memberships.length === 0,
    login, signUp, loginWithGoogle, logout, forgotPassword, updatePassword,
    refreshProfile, getToken, switchOrg,
    isOwner, isAdmin, isSalesHead, isManager, isFieldUser, isInsideSales, hasRole, can,
  };

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg, #0b0e14)" }}>
        <div className="scrm-spinner" />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
