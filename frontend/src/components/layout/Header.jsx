import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  ChevronDown, Settings, LogOut, Menu,
  Shield, Bell, CheckSquare, Clock, Users, Calendar, X,
  CalendarCheck, MessageSquare, Briefcase, Target, CheckCheck, Trash2,
  Sun, Moon, Monitor, Activity, AlertCircle, Building2, Brain,
} from "lucide-react";
import { db as supabase } from "../../lib/db";
import { notificationsService } from "../../services/notificationsService";
import { format, isPast, isToday } from "date-fns";
import toast from "react-hot-toast";
import { useARIA } from "../../context/ARIAContext";

const ROLE_LABELS = { owner: "Owner", admin: "Admin", sales_manager: "Sales Manager", sales_rep: "Sales Rep" };

const PAGE_TITLES = {
  "/dashboard":    { label: "",                sub: "" },
  "/pipeline":     { label: "Database",        sub: "All records" },
  "/leads":        { label: "Leads",           sub: "Lead management" },
  "/deals":        { label: "Deal Pipeline",   sub: "Revenue tracking & forecasting" },
  "/customers":    { label: "Customer Hub",    sub: "Account management" },
  "/tasks":        { label: "Task Center",     sub: "" },
  "/meetings":     { label: "Meetings",        sub: "Schedule & manage calls" },
  "/chat":         { label: "Team Chat",       sub: "Real-time collaboration" },
  "/analytics":    { label: "Analytics",       sub: "Performance metrics" },
  "/team":         { label: "Team",            sub: "Manage your team" },
  "/settings":     { label: "Settings",        sub: "Account & preferences" },
  "/activities":   { label: "Activities",       sub: "Tasks, emails & targets" },
  "/dsr":          { label: "DSR",               sub: "Daily Sales Report & Performance Analytics" },
  "/reports":      { label: "Reports",         sub: "Analytics & insights" },
  "/ai-assistant": { label: "AI Sidekick",     sub: "Your intelligent sales partner" },
  "/targets":      { label: "Targets",         sub: "Track team KPIs & sales goals" },
  "/security-logs":{ label: "Security Logs",   sub: "Audit trail & access logs" },
  "/organization": { label: "Organization",   sub: "Members, roles & integrations" },
};

const PRIORITY_C = { urgent: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#22C55E" };
const MEET_TYPE_COLOR = { google_meet: "#1B76D3", teams: "#6264A7", in_person: "#10B981" };
const MEET_TYPE_ICON  = { google_meet: "📹", teams: "💼", in_person: "🤝" };

const NOTIF_ICONS = {
  meeting_reminder:  { icon: CalendarCheck, color: "#3B82F6" },
  lead_assigned:     { icon: Users,         color: "#6366F1" },
  task_due:          { icon: CheckSquare,   color: "#F59E0B" },
  task_assigned:     { icon: Briefcase,     color: "#8B5CF6" },
  chat_message:      { icon: MessageSquare, color: "#10B981" },
  pipeline_update:   { icon: Target,        color: "#6366F1" },
  security_alert:    { icon: Shield,        color: "#EF4444" },
  system:            { icon: Bell,          color: "#6B7280" },
};

// ── localStorage-persisted dismissal (survives refresh, resets each day) ──────
const STORAGE_KEY = "ccrm_dismissed_alerts";

function getDismissedSet() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const today = new Date().toDateString();
    if (stored.date !== today) return new Set();
    return new Set(stored.ids || []);
  } catch { return new Set(); }
}

function persistDismissed(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: new Date().toDateString(), ids: [...set] }));
}

// ── Relative time ──────────────────────────────────────────────────────────────
function timeAgo(d) {
  if (!d) return "";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60)  return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return format(new Date(d), "MMM d");
}

const THEME_OPTIONS = [
  { key: "light",  icon: Sun,     title: "Light mode" },
  { key: "system", icon: Monitor, title: "System theme" },
  { key: "dark",   icon: Moon,    title: "Dark mode" },
];

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "Good Morning";
  if (h >= 12 && h < 17) return "Good Afternoon";
  if (h >= 17 && h < 21) return "Good Evening";
  return "Good Night";
}

function getGreetingPrefs(profileId) {
  try {
    const raw = localStorage.getItem(`salescrm_greeting_prefs_${profileId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function Header({ onMobileMenu }) {
  const { profile, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isOpen: ariaOpen, togglePanel } = useARIA();
  const navigate = useNavigate();
  const location = useLocation();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotif, setShowNotif]       = useState(false);
  const [tab, setTab]                   = useState("alerts");

  // Today's alerts — dynamic, localStorage-dismissed
  const [alerts, setAlerts]             = useState({ tasks: [], followUps: [], meetings: [] });
  const [dismissed, setDismissed]       = useState(getDismissedSet);
  const [alertsLoading, setAlertsLoading] = useState(false);

  // DB notifications — real-time, persisted read/unread
  const [dbNotifs, setDbNotifs]         = useState([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const subRef = useRef(null);

  const userMenuRef = useRef(null);
  const notifRef    = useRef(null);

  const pageInfo = PAGE_TITLES[location.pathname] || { label: location.pathname.slice(1), sub: "" };
  const initials  = profile?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U";
  const isFieldUser    = ["sales_rep", "sales_rep"].includes(profile?.role);
  const isOwnerOrHead  = ["owner", "admin"].includes(profile?.role);
  const isDashboard    = location.pathname === "/dashboard";
  const firstName      = profile?.full_name?.split(" ")[0] || "there";
  const roleLabel      = ROLE_LABELS[profile?.role] || "Employee";
  const greetingPrefs  = profile?.id ? getGreetingPrefs(profile.id) : null;
  const greetingText   = greetingPrefs?.customEnabled && greetingPrefs?.message?.trim()
    ? greetingPrefs.message.trim()
    : `${getTimeGreeting()}, ${firstName}`;

  const [unassignedCounts, setUnassignedCounts] = useState({ leads: 0, deals: 0 });

  // ── Dynamic alerts ──────────────────────────────────────────────────────────

  const fetchAlerts = useCallback(async () => {
    if (!profile?.id) return;
    setAlertsLoading(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, priority, due_date, status")
        .eq("assigned_to", profile.id)
        .not("status", "in", '("done","cancelled")')
        .lte("due_date", `${todayStr}T23:59:59`)
        .order("due_date", { ascending: true })
        .limit(10);

      let leadsQuery = supabase
        .from("leads")
        .select("id, contact_name, company_name, follow_up_date, stage")
        .eq("follow_up_date", todayStr)
        .not("stage", "in", '("won","lost","pipeline")')
        .order("follow_up_date", { ascending: true })
        .limit(8);
      if (isFieldUser) leadsQuery = leadsQuery.eq("assigned_to", profile.id);
      const { data: followUps } = await leadsQuery;

      const { data: meetings } = await supabase
        .from("meetings")
        .select("id, title, start_time, meeting_type, meeting_link, customer_name")
        .eq("status", "scheduled")
        .gte("start_time", `${todayStr}T00:00:00`)
        .lte("start_time", `${todayStr}T23:59:59`)
        .order("start_time", { ascending: true })
        .limit(5);

      setAlerts({ tasks: tasks || [], followUps: followUps || [], meetings: meetings || [] });
    } catch (e) {
      console.error("Alert fetch error:", e.message);
    } finally {
      setAlertsLoading(false);
    }
  }, [profile?.id, isFieldUser]);

  // ── Unassigned items (owner/sales_head only) ────────────────────────────────

  const fetchUnassigned = useCallback(async () => {
    if (!isOwnerOrHead) return;
    try {
      const [{ count: leads }, { count: deals }] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true })
          .is("assigned_to", null)
          .not("stage", "in", '("won","lost","converted","pipeline")'),
        supabase.from("deals").select("id", { count: "exact", head: true })
          .is("assigned_to", null),
      ]);
      setUnassignedCounts({ leads: leads || 0, deals: deals || 0 });
    } catch {}
  }, [isOwnerOrHead]);

  // ── DB notifications ────────────────────────────────────────────────────────

  const fetchDbNotifs = useCallback(async () => {
    if (!profile?.id) return;
    setNotifsLoading(true);
    try {
      const data = await notificationsService.getUnread(profile.id, 30);
      setDbNotifs(data);
    } catch (e) {
      console.error("Notif fetch error:", e.message);
    } finally {
      setNotifsLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchAlerts();
    fetchDbNotifs();
    fetchUnassigned();
    const interval = setInterval(() => { fetchAlerts(); fetchUnassigned(); }, 5 * 60 * 1000);

    // Real-time subscription for new notifications
    if (subRef.current) supabase.removeChannel(subRef.current);
    subRef.current = notificationsService.subscribeToUser(profile.id, (payload) => {
      if (payload.new) {
        setDbNotifs((p) => [payload.new, ...p]);
        toast(`${payload.new.title}`, { icon: "🔔", duration: 4000 });
      }
    });

    return () => {
      clearInterval(interval);
      if (subRef.current) supabase.removeChannel(subRef.current);
    };
  }, [fetchAlerts, fetchDbNotifs, fetchUnassigned, profile?.id]);

  useEffect(() => {
    const h = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
      if (notifRef.current    && !notifRef.current.contains(e.target))    setShowNotif(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Alert dismiss (localStorage-persisted) ──────────────────────────────────

  const dismiss = (key) => {
    setDismissed((prev) => {
      const next = new Set([...prev, key]);
      persistDismissed(next);
      return next;
    });
  };

  // ── DB notification actions ─────────────────────────────────────────────────

  const handleNotifClick = async (notif) => {
    if (!notif.read) {
      await notificationsService.markRead(notif.id).catch(() => {});
      setDbNotifs((p) => p.map((n) => n.id === notif.id ? { ...n, read: true } : n));
    }
    if (notif.link) { navigate(notif.link); setShowNotif(false); }
  };

  const handleDismissNotif = async (id) => {
    await notificationsService.dismiss(id).catch(() => {});
    setDbNotifs((p) => p.filter((n) => n.id !== id));
  };

  const handleMarkAllRead = async () => {
    await notificationsService.markAllRead(profile.id).catch(() => {});
    setDbNotifs((p) => p.map((n) => ({ ...n, read: true })));
    toast.success("All notifications marked as read");
  };

  const handleClearAll = async () => {
    await notificationsService.dismissAll(profile.id).catch(() => {});
    setDbNotifs([]);
    toast.success("All notifications cleared");
  };

  // ── Counts ──────────────────────────────────────────────────────────────────

  const visibleTasks     = alerts.tasks.filter((t) => !dismissed.has(`task-${t.id}`));
  const visibleFollowUps = alerts.followUps.filter((l) => !dismissed.has(`lead-${l.id}`));
  const visibleMeetings  = alerts.meetings.filter((m) => !dismissed.has(`meet-${m.id}`));
  const alertCount       = visibleTasks.length + visibleFollowUps.length + visibleMeetings.length;

  const unreadDbCount   = dbNotifs.filter((n) => !n.read).length;
  const unassignedCount = unassignedCounts.leads + unassignedCounts.deals;
  const totalBadge      = alertCount + unreadDbCount + (isOwnerOrHead ? unassignedCount : 0);

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const NotifRow = ({ onClick, onDismiss, left, title, sub, right }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
      <div style={{ flexShrink: 0 }}>{left}</div>
      <div style={{ flex: 1, minWidth: 0 }} onClick={onClick}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}>{sub}</div>
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} title="Dismiss"
        style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 3, borderRadius: 5, display: "flex", alignItems: "center", opacity: 0.5, transition: "opacity 0.15s" }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}>
        <X size={12} />
      </button>
    </div>
  );

  const SectionHead = ({ icon: Icon, label, color = "var(--text-muted)" }) => (
    <div style={{ padding: "8px 16px 4px", fontSize: 10.5, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
      <Icon size={11} strokeWidth={2} /> {label}
    </div>
  );

  return (
    <header style={{ height: 56, background: "var(--header-bg)", borderBottom: "1px solid var(--header-border)", display: "flex", alignItems: "center", paddingLeft: 22, paddingRight: 18, gap: 10, position: "sticky", top: 0, zIndex: 10, flexShrink: 0, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>

      <button className="mobile-menu-btn" onClick={onMobileMenu}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 4, display: "none", alignItems: "center" }}>
        <Menu size={20} strokeWidth={1.8} />
      </button>

      {isDashboard ? (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap", letterSpacing: "-0.03em", lineHeight: 1.2 }}>{greetingText}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", letterSpacing: "-0.01em", fontWeight: 500, marginTop: 1 }}>
            <span style={{ fontWeight: 600, color: "var(--text-2)", padding: "1px 7px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 10 }}>{roleLabel}</span>
          </div>
        </div>
      ) : pageInfo.label ? (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap", letterSpacing: "-0.03em", lineHeight: 1.2 }}>{pageInfo.label}</div>
          {pageInfo.sub && <div style={{ fontSize: 10.5, color: "var(--text-muted)", letterSpacing: "-0.01em", fontWeight: 400 }}>{pageInfo.sub}</div>}
        </div>
      ) : null}

      <div style={{ flex: 1 }} />

      {/* ── Dashboard action buttons ── */}
      {isDashboard && (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn-secondary"
            onClick={() => navigate("/activities")}
            style={{ height: 32, display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "0 12px" }}
          >
            <Activity size={13} /> My Activities
          </button>
          <button
            className="btn-primary"
            onClick={() => navigate("/pipeline?create=1")}
            style={{
              height: 32, display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, padding: "0 14px",
              background: "linear-gradient(135deg, #4F46E5, #6366F1)",
              boxShadow: "0 2px 8px rgba(99,102,241,0.35)",
              borderRadius: 8,
            }}
          >
            <Building2 size={13} strokeWidth={2} /> Add Prospect
          </button>
        </div>
      )}

      {/* ── Sales AI Brain Icon ── */}
      <motion.button
        onClick={location.pathname === "/ai-assistant" ? undefined : togglePanel}
        title={location.pathname === "/ai-assistant" ? "Sales Assistant" : ariaOpen ? "Close Sales Assistant Panel" : "Open Sales Assistant Agent"}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, borderRadius: 9,
          background: ariaOpen || location.pathname === "/ai-assistant"
            ? "linear-gradient(135deg,#4F46E5,#7C3AED)"
            : "linear-gradient(135deg,rgba(79,70,229,0.12),rgba(124,58,237,0.08))",
          border: "1px solid rgba(99,102,241,0.25)",
          cursor: location.pathname === "/ai-assistant" ? "default" : "pointer",
          flexShrink: 0,
          boxShadow: ariaOpen || location.pathname === "/ai-assistant" ? "0 2px 12px rgba(99,102,241,0.4)" : "none",
          transition: "all 0.18s",
          position: "relative",
        }}
      >
        <Brain size={15} strokeWidth={1.75} style={{ color: ariaOpen || location.pathname === "/ai-assistant" ? "#fff" : "#A78BFA" }} />
        {ariaOpen && location.pathname !== "/ai-assistant" && (
          <span style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, borderRadius: "50%", background: "#10B981", border: "2px solid var(--header-bg)" }} />
        )}
      </motion.button>

      {/* ── Theme Toggle ── */}
      <div style={{ display: "flex", alignItems: "center", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 3, gap: 1 }}>
        {THEME_OPTIONS.map(({ key, icon: Icon, title }) => (
          <motion.button
            key={key}
            title={title}
            onClick={() => setTheme(key)}
            whileTap={{ scale: 0.88 }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
              background: theme === key ? "var(--surface)" : "transparent",
              color: theme === key ? "var(--accent)" : "var(--text-muted)",
              boxShadow: theme === key ? "var(--shadow-xs)" : "none",
              transition: "all 0.15s",
            }}
          >
            <Icon size={13} strokeWidth={1.9} />
          </motion.button>
        ))}
      </div>

      {/* ── Notification Bell ── */}
      <div style={{ position: "relative" }} ref={notifRef}>
        <motion.button
          className={`icon-btn${showNotif ? " active" : ""}`}
          onClick={() => { setShowNotif((v) => !v); setShowUserMenu(false); if (!showNotif) { fetchAlerts(); fetchDbNotifs(); fetchUnassigned(); } }}
          title="Notifications"
          style={{ position: "relative" }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.88 }}
        >
          <Bell size={16} strokeWidth={1.75} />
          {totalBadge > 0 && (
            <span style={{ position: "absolute", top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid var(--header-bg)", padding: "0 3px" }}>
              {totalBadge > 9 ? "9+" : totalBadge}
            </span>
          )}
        </motion.button>

        <AnimatePresence>
          {showNotif && (
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 4 }} transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
              className="dropdown-menu" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 370, zIndex: 50, maxHeight: 520, display: "flex", flexDirection: "column" }}>

              {/* Panel header */}
              <div style={{ padding: "10px 16px 8px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: "var(--text)", letterSpacing: "-0.02em" }}>Notifications</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {unreadDbCount > 0 && (
                      <button onClick={handleMarkAllRead} title="Mark all read"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 6 }}>
                        <CheckCheck size={12} /> All read
                      </button>
                    )}
                    {dbNotifs.length > 0 && (
                      <button onClick={handleClearAll} title="Clear all notifications"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 11, display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 6 }}>
                        <Trash2 size={11} /> Clear
                      </button>
                    )}
                    <button onClick={() => { fetchAlerts(); fetchDbNotifs(); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 4px", fontSize: 14, lineHeight: 1 }}>↻</button>
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 0, background: "var(--surface-2)", borderRadius: 8, padding: 3, border: "1px solid var(--border)" }}>
                  {[
                    { key: "alerts", label: "Today's Alerts", count: alertCount + (isOwnerOrHead ? unassignedCount : 0) },
                    { key: "inbox",  label: "Inbox",          count: unreadDbCount },
                  ].map((t) => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, background: tab === t.key ? "var(--accent)" : "transparent", color: tab === t.key ? "#fff" : "var(--text-muted)", transition: "all 0.15s" }}>
                      {t.label}
                      {t.count > 0 && <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: tab === t.key ? "rgba(255,255,255,0.3)" : "rgba(99,102,241,0.2)", color: tab === t.key ? "#fff" : "var(--accent)", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{t.count}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ overflowY: "auto", flex: 1 }}>

                {/* ── Today's Alerts tab ── */}
                {tab === "alerts" && (
                  alertsLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
                    </div>
                  ) : (
                    <>
                      {/* Pinned: Unassigned Items — owner/sales_head only */}
                      {isOwnerOrHead && unassignedCount > 0 && (
                        <div style={{ margin: "8px 12px 0", padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <AlertCircle size={13} style={{ color: "#EF4444", flexShrink: 0 }} strokeWidth={2} />
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#EF4444" }}>Unassigned Items</span>
                              <span style={{ fontSize: 10, fontWeight: 800, background: "#EF4444", color: "#fff", borderRadius: 99, padding: "1px 6px" }}>{unassignedCount}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            {unassignedCounts.leads > 0 && (
                              <button onClick={() => { navigate("/leads?filter=unassigned"); setShowNotif(false); }}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                <Users size={11} /> {unassignedCounts.leads} Lead{unassignedCounts.leads !== 1 ? "s" : ""}
                              </button>
                            )}
                            {unassignedCounts.deals > 0 && (
                              <button onClick={() => { navigate("/deals?filter=unassigned"); setShowNotif(false); }}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                <Briefcase size={11} /> {unassignedCounts.deals} Deal{unassignedCounts.deals !== 1 ? "s" : ""}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {alertCount === 0 ? (
                        <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5, marginTop: isOwnerOrHead && unassignedCount > 0 ? 8 : 0 }}>
                          <Bell size={26} style={{ margin: "0 auto 10px", display: "block", opacity: 0.15 }} />
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>All clear for today!</div>
                          <div style={{ fontSize: 11 }}>No pending tasks, follow-ups, or meetings.</div>
                        </div>
                      ) : (
                      <>
                      {visibleMeetings.length > 0 && (
                        <>
                          <SectionHead icon={Calendar} label="Today's Meetings" color="#3B82F6" />
                          {visibleMeetings.map((m) => {
                            const tc = MEET_TYPE_COLOR[m.meeting_type] || "#10B981";
                            return (
                              <NotifRow key={m.id}
                                onClick={() => { navigate("/meetings"); setShowNotif(false); }}
                                onDismiss={() => dismiss(`meet-${m.id}`)}
                                left={<span style={{ fontSize: 16 }}>{MEET_TYPE_ICON[m.meeting_type] || "🤝"}</span>}
                                title={m.title}
                                sub={<><Clock size={9} /> {format(new Date(m.start_time), "h:mm a")}{m.customer_name ? ` · ${m.customer_name}` : ""}</>}
                                right={m.meeting_link && (
                                  <button onClick={(e) => { e.stopPropagation(); window.open(m.meeting_link, "_blank", "noopener"); }}
                                    style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: tc, padding: "3px 8px", borderRadius: 6, border: "none", cursor: "pointer" }}>Join</button>
                                )}
                              />
                            );
                          })}
                        </>
                      )}
                      {visibleTasks.length > 0 && (
                        <>
                          <SectionHead icon={CheckSquare} label="Tasks Due" />
                          {visibleTasks.map((task) => {
                            const overdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date));
                            const pc = PRIORITY_C[task.priority] || "#6B7280";
                            return (
                              <NotifRow key={task.id}
                                onClick={() => { navigate("/tasks"); setShowNotif(false); }}
                                onDismiss={() => dismiss(`task-${task.id}`)}
                                left={<div style={{ width: 8, height: 8, borderRadius: "50%", background: pc, marginTop: 1 }} />}
                                title={task.title}
                                sub={<><Clock size={9} /> {overdue ? "Overdue · " : "Due today · "}{task.due_date ? format(new Date(task.due_date), "MMM d") : "—"}</>}
                                right={<span style={{ fontSize: 10, fontWeight: 700, color: pc, background: `${pc}18`, padding: "2px 7px", borderRadius: 99, textTransform: "capitalize" }}>{task.priority}</span>}
                              />
                            );
                          })}
                        </>
                      )}
                      {visibleFollowUps.length > 0 && (
                        <>
                          <SectionHead icon={Users} label="Lead Follow-ups" />
                          {visibleFollowUps.map((lead) => (
                            <NotifRow key={lead.id}
                              onClick={() => { navigate("/leads"); setShowNotif(false); }}
                              onDismiss={() => dismiss(`lead-${lead.id}`)}
                              left={<div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B", marginTop: 1 }} />}
                              title={`${lead.contact_name || "Contact"}${lead.company_name ? ` · ${lead.company_name}` : ""}`}
                              sub="Follow-up scheduled today"
                              right={<span style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", background: "rgba(245,158,11,0.12)", padding: "2px 7px", borderRadius: 99, textTransform: "capitalize" }}>{lead.stage || "Lead"}</span>}
                            />
                          ))}
                        </>
                      )}
                    </>
                      )}
                    </>
                  )
                )}

                {/* ── Inbox (DB notifications) tab ── */}
                {tab === "inbox" && (
                  notifsLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
                    </div>
                  ) : dbNotifs.length === 0 ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>
                      <CheckCheck size={26} style={{ margin: "0 auto 10px", display: "block", opacity: 0.15 }} />
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>You're all caught up</div>
                      <div style={{ fontSize: 11 }}>No notifications in your inbox.</div>
                    </div>
                  ) : (
                    dbNotifs.map((notif) => {
                      const meta = NOTIF_ICONS[notif.type] || NOTIF_ICONS.system;
                      const Icon = meta.icon;
                      return (
                        <div key={notif.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: notif.read ? "transparent" : "rgba(99,102,241,0.03)", transition: "background 0.1s" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = notif.read ? "transparent" : "rgba(99,102,241,0.03)"}
                          onClick={() => handleNotifClick(notif)}>
                          {/* Icon */}
                          <div style={{ width: 30, height: 30, borderRadius: 9, background: meta.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                            <Icon size={14} style={{ color: meta.color }} />
                          </div>
                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: notif.read ? 500 : 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {notif.title}
                            </div>
                            {notif.body && (
                              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{notif.body}</div>
                            )}
                            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                              <Clock size={9} /> {timeAgo(notif.created_at)}
                              {!notif.read && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#6366F1", flexShrink: 0 }} />}
                              {notif.priority === "high" && <span style={{ fontSize: 9, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.1)", padding: "1px 5px", borderRadius: 99 }}>HIGH</span>}
                            </div>
                          </div>
                          {/* Dismiss */}
                          <button onClick={(e) => { e.stopPropagation(); handleDismissNotif(notif.id); }}
                            style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: 5, opacity: 0.5, transition: "opacity 0.15s" }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}>
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })
                  )
                )}
              </div>

              {/* Footer */}
              {tab === "alerts" && alertCount > 0 && (
                <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 6 }}>
                  {visibleTasks.length > 0 && (
                    <button onClick={() => { navigate("/tasks"); setShowNotif(false); }}
                      style={{ flex: 1, height: 30, fontSize: 11.5, fontWeight: 600, color: "var(--accent)", background: "rgba(99,102,241,0.1)", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>Tasks</button>
                  )}
                  {visibleMeetings.length > 0 && (
                    <button onClick={() => { navigate("/meetings"); setShowNotif(false); }}
                      style={{ flex: 1, height: 30, fontSize: 11.5, fontWeight: 600, color: "#3B82F6", background: "rgba(59,130,246,0.10)", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>Meetings</button>
                  )}
                  {visibleFollowUps.length > 0 && (
                    <button onClick={() => { navigate("/leads"); setShowNotif(false); }}
                      style={{ flex: 1, height: 30, fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>Leads</button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0, opacity: 0.7 }} />

      {/* ── User menu ── */}
      <div style={{ position: "relative" }} ref={userMenuRef}>
        <motion.button onClick={() => { setShowUserMenu((v) => !v); setShowNotif(false); }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: showUserMenu ? "var(--surface-2)" : "transparent", border: "none", cursor: "pointer", padding: "5px 8px 5px 4px", borderRadius: 11, fontFamily: "inherit", transition: "background 0.13s" }}
          whileHover={{ background: "var(--surface-2)" }}
          whileTap={{ scale: 0.97 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#2563EB,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", overflow: "hidden", flexShrink: 0, boxShadow: "0 2px 8px rgba(37,99,235,0.35)" }}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt={initials} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 9 }} /> : initials}
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.25, letterSpacing: "-0.015em" }}>{profile?.full_name?.split(" ")[0] || "User"}</div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "capitalize" }}>{ROLE_LABELS[profile?.role] || "Employee"}</div>
          </div>
          <motion.div animate={{ rotate: showUserMenu ? 180 : 0 }} transition={{ duration: 0.18 }}>
            <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {showUserMenu && (
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 5 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="dropdown-menu" style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 238, zIndex: 50, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#2563EB,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, color: "#fff", flexShrink: 0, boxShadow: "0 2px 8px rgba(37,99,235,0.35)", overflow: "hidden" }}>
                    {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} /> : initials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.full_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.email}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)", fontSize: 10.5, fontWeight: 700, color: "#A78BFA", letterSpacing: "0.02em" }}>
                    <Shield size={9} strokeWidth={2.2} />
                    {ROLE_LABELS[profile?.role] || "Employee"}
                  </span>
                </div>
              </div>
              <div style={{ padding: "6px 0" }}>
                <button className="dropdown-item" onClick={() => { navigate("/settings"); setShowUserMenu(false); }} style={{ gap: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Settings size={13} strokeWidth={1.7} style={{ color: "var(--text-2)" }} />
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", lineHeight: 1.2 }}>Settings</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Account & preferences</div>
                  </div>
                </button>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", padding: "6px 0 4px" }}>
                <button className="dropdown-item danger" onClick={handleLogout} style={{ gap: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(251,113,133,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <LogOut size={13} strokeWidth={1.7} />
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>Sign out</div>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
