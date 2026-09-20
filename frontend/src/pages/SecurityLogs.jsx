import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { db as supabase } from "../lib/db";
import toast from "react-hot-toast";
import {
  Shield, Monitor, Wifi, WifiOff, AlertTriangle, Search,
  Download, RefreshCw, ChevronDown,
  Smartphone, Laptop, LogOut, MapPin, Globe, Users,
} from "lucide-react";

// ─── Role hierarchy ────────────────────────────────────────────────────────────

const ROLES = [
  { key: "owner",         label: "Super Admin"          },
  { key: "admin",    label: "Sales Head"           },
  { key: "sales_manager", label: "Sales Manager"        },
  { key: "sales_rep",      label: "Sales Employee"       },
  { key: "sales_rep",  label: "Inside Sales Employee"},
];

const ROLE_LEVEL = { owner: 5, sales_head: 4, sales_manager: 3, employee: 2, inside_sales: 1 };

// Roles that a given role can view logs of
function getAllowedViewRoles(normRole) {
  if (normRole === "owner")      return ["owner", "admin", "sales_manager", "sales_rep", "sales_rep"];
  if (normRole === "admin") return ["admin", "sales_manager", "sales_rep", "sales_rep"];
  return []; // lower roles: only their own
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function timeSince(d) {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getStatus(row) {
  if (row.session_status) return row.session_status;
  return row.logged_out_at ? "logged_out" : "active";
}

function initials(name) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const DEVICE_ICON = { Mobile: Smartphone, Desktop: Laptop };

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_MAP = {
  active:     { label: "Online",   color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  logged_out: { label: "Offline",  color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
  inactivity: { label: "Idle Out", color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.logged_out;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px",
      borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, flexShrink: 0,
        animation: status === "active" ? "pulse 2s ease-in-out infinite" : "none" }} />
      {s.label}
    </span>
  );
}

function RoleBadge({ role }) {
  const r = ROLES.find((x) => x.key === role);
  const COLORS = {
    owner:         { color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
    sales_head:    { color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
    sales_manager: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
    employee:      { color: "#1B76D3", bg: "rgba(27,118,211,0.1)" },
    inside_sales:  { color: "#10B981", bg: "rgba(16,185,129,0.1)" },
  };
  const c = COLORS[role] || { color: "#6B7280", bg: "rgba(107,114,128,0.1)" };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 99, color: c.color, background: c.bg, whiteSpace: "nowrap" }}>
      {r?.label || role || "—"}
    </span>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14, flexShrink: 0 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Session Row (inline in expanded table) ───────────────────────────────────

function SessionRow({ session, idx, isHighLevel, onForceLogout }) {
  const status   = getStatus(session);
  const isOnline = status === "active";
  const DevIcon  = DEVICE_ICON[session.device_type] || Monitor;

  return (
    <tr
      style={{ borderBottom: "1px solid #F3F4F6", transition: "background 0.1s" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#F9FAFB"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {/* Session # */}
      <td style={{ padding: "9px 16px", whiteSpace: "nowrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#6366F1", background: "rgba(99,102,241,0.08)", padding: "3px 9px", borderRadius: 99 }}>
          Session {idx + 1}
        </span>
      </td>

      {/* Status */}
      <td style={{ padding: "9px 12px" }}><StatusBadge status={status} /></td>

      {/* Login Time */}
      <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>
        {fmtDate(session.logged_in_at)}
        {session.login_method && (
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>{session.login_method}</div>
        )}
      </td>

      {/* Logout Time */}
      <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
        {isOnline
          ? <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", flexShrink: 0, animation: "pulse 2s ease-in-out infinite" }} />
              Active now
            </span>
          : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(session.logged_out_at)}</span>
        }
      </td>

      {/* IP */}
      <td style={{ padding: "9px 12px" }}>
        {session.ip_address
          ? <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: "var(--text)" }}>
              <Globe size={10} style={{ color: "var(--text-muted)", flexShrink: 0 }} />{session.ip_address}
            </span>
          : <span style={{ color: "var(--text-muted)" }}>—</span>}
      </td>

      {/* Location */}
      <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-2)" }}>
        {(session.city || session.country)
          ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={10} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              {[session.city, session.country].filter(Boolean).join(", ")}
            </span>
          : <span style={{ color: "var(--text-muted)" }}>—</span>}
      </td>

      {/* Device */}
      <td style={{ padding: "9px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <DevIcon size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, color: "var(--text)" }}>{session.device_model || session.device_type || "—"}</div>
            {session.network_type && <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{session.network_type}</div>}
          </div>
        </div>
      </td>

      {/* Browser / OS */}
      <td style={{ padding: "9px 12px" }}>
        <div style={{ fontSize: 12, color: "var(--text)" }}>{[session.browser, session.browser_version].filter(Boolean).join(" v") || "—"}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>{session.os || "—"}</div>
      </td>

      {/* Actions */}
      {isHighLevel && (
        <td style={{ padding: "9px 12px" }}>
          {isOnline && (
            <button
              onClick={() => {
                if (window.confirm("Mark this session as closed?\n\nThis closes the log record only — it does not force the user out of their browser.")) {
                  onForceLogout(session.id);
                }
              }}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.07)", color: "#EF4444", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <LogOut size={10} /> Force Close
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SecurityLogs() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const normRole = (profile?.role || "").toLowerCase().replace(/[- ]/g, "_");
  const isAdmin       = normRole === "owner";
  const isSalesHead   = normRole === "admin";
  const isHighLevel   = isAdmin || isSalesHead;
  const allowedRoles  = getAllowedViewRoles(normRole);

  const [activeTab,     setActiveTab]     = useState("sessions");
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("");
  const [roleFilter,    setRoleFilter]    = useState("");
  const [userFilter,    setUserFilter]    = useState("");
  const [expandedKeys,  setExpandedKeys]  = useState({});

  const toggleExpand = (key) => setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  // Security events query (screenshot alerts — with reason data)
  const { data: securityEvents = [], refetch: refetchEvents } = useQuery({
    queryKey: ["security-events", normRole, profile?.id],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id, user_id, action, details, created_at")
        .like("action", "screen_protection_%")
        .not("action", "eq", "screen_protection_tab_hidden")
        .not("action", "eq", "screen_protection_screen_share_ended")
        .order("created_at", { ascending: false })
        .limit(300);
      if (!isHighLevel) q = q.eq("user_id", profile?.id);
      const { data } = await q;
      return data || [];
    },
    enabled: !!profile?.id,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  // Real-time subscription for screenshot alerts
  useEffect(() => {
    if (!isHighLevel || !profile?.id) return;
    const ch = supabase
      .channel("security-events-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, (payload) => {
        if (payload.new?.action?.startsWith("screen_protection_")) {
          refetchEvents();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isHighLevel, profile?.id, refetchEvents]);

  // Build query — lower roles only fetch their own rows for efficiency
  const { data: allRows = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["security-logs", normRole, profile?.id],
    queryFn: async () => {
      let q = supabase
        .from("login_logs")
        .select("*, user:profiles!login_logs_user_id_fkey(id, full_name, email, avatar_url, role)")
        .order("logged_in_at", { ascending: false })
        .limit(500);

      // Non-admins only see their own rows server-side
      if (!isHighLevel) q = q.eq("user_id", profile?.id);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Apply role-based visibility — admins filter out roles above their level
  const rbacRows = useMemo(() => {
    if (!isHighLevel) return allRows; // already scoped to own rows by query
    return allRows.filter((r) => {
      const userRole = r.user?.role;
      if (isAdmin) {
        // Owner sees subordinate roles only — no owner logs at all (including their own)
        return userRole !== "owner";
      }
      // Sales Head: own logs + subordinates (not owner/other sales_heads)
      return r.user_id === profile?.id || ["sales_manager", "sales_rep", "sales_rep"].includes(userRole);
    });
  }, [allRows, isAdmin, isSalesHead, profile?.id]);

  const forceLogoutMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("login_logs")
        .update({ logged_out_at: new Date().toISOString(), session_status: "logged_out" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["security-logs"] });
      toast.success("Session marked as closed");
    },
    onError: (e) => toast.error(e.message),
  });

  // Unique users for "View by User" dropdown
  const uniqueUsers = useMemo(() => {
    const seen = new Map();
    rbacRows.forEach((r) => { if (r.user?.full_name && !seen.has(r.user_id)) seen.set(r.user_id, r.user); });
    return [...seen.entries()].sort((a, b) => (a[1].full_name || "").localeCompare(b[1].full_name || ""));
  }, [rbacRows]);

  // Roles present in the current dataset for "View by Role" dropdown
  const presentRoles = useMemo(() => {
    const set = new Set(rbacRows.map((r) => r.user?.role).filter(Boolean));
    return ROLES.filter((r) => set.has(r.key) && allowedRoles.includes(r.key));
  }, [rbacRows, allowedRoles]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rbacRows.filter((r) => {
      if (statusFilter && getStatus(r) !== statusFilter) return false;
      if (roleFilter   && r.user?.role !== roleFilter) return false;
      if (userFilter   && r.user_id !== userFilter) return false;
      if (q) {
        const hay = [r.user?.full_name, r.user?.email, r.ip_address, r.city, r.country, r.browser, r.os, r.device_id].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rbacRows, search, statusFilter, roleFilter, userFilter]);

  // Group filtered rows by date → user for the new hierarchical view
  const groupedByDateUser = useMemo(() => {
    const byDate = {};
    filtered.forEach((row) => {
      const dateKey = row.logged_in_at ? row.logged_in_at.slice(0, 10) : "no-date";
      if (!byDate[dateKey]) byDate[dateKey] = {};
      const uid = row.user_id || "unknown";
      if (!byDate[dateKey][uid]) byDate[dateKey][uid] = { user: row.user || { id: uid }, sessions: [] };
      byDate[dateKey][uid].sessions.push(row);
    });
    return Object.entries(byDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, userMap]) => ({
        dateKey,
        users: Object.values(userMap).sort((a, b) => (a.user?.full_name || "").localeCompare(b.user?.full_name || "")),
        sessionCount: Object.values(userMap).reduce((sum, u) => sum + u.sessions.length, 0),
      }));
  }, [filtered]);

  // Stats
  const total         = rbacRows.length;
  const activeCount   = rbacRows.filter((r) => getStatus(r) === "active").length;
  const offlineCount  = rbacRows.filter((r) => getStatus(r) === "logged_out").length;
  const uniqueDevices = new Set(rbacRows.map((r) => r.device_id).filter(Boolean)).size;
  const multiSessions = (() => {
    const c = {};
    rbacRows.filter((r) => getStatus(r) === "active").forEach((r) => { if (r.user_id) c[r.user_id] = (c[r.user_id] || 0) + 1; });
    return Object.values(c).filter((n) => n > 1).length;
  })();

  const exportCSV = () => {
    const hdrs = ["User", "Email", "Role", "IP Address", "City", "Country", "Browser", "OS", "Device Type", "Device Model", "Login Method", "Network", "Status", "Login Time", "Logout Time"];
    const csvRows = filtered.map((r) => [
      r.user?.full_name || "", r.user?.email || "", r.user?.role || "",
      r.ip_address || "", r.city || "", r.country || "",
      r.browser || "", r.os || "", r.device_type || "", r.device_model || "",
      r.login_method || "", r.network_type || "",
      getStatus(r), fmtDate(r.logged_in_at), fmtDate(r.logged_out_at),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[hdrs.join(","), ...csvRows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `security_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const lastRefreshed = dataUpdatedAt ? timeSince(dataUpdatedAt) : "—";
  const pageTitle     = isHighLevel ? "Security Logs" : "My Activity Logs";
  const pageDesc      = isHighLevel
    ? "Login sessions · device tracking · access monitoring"
    : "Your personal login history and active sessions";

  const hasFilters = statusFilter || roleFilter || userFilter || search;

  return (
    <div style={{ padding: "20px 24px", height: "100%", display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(99,102,241,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={20} style={{ color: "#6366F1" }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{pageTitle}</h1>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>
              {pageDesc} · refreshed {lastRefreshed}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => refetch()} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, height: 36 }}>
            <RefreshCw size={12} /> Refresh
          </button>
          {isHighLevel && (
            <button onClick={exportCSV} disabled={!filtered.length} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, height: 36 }}>
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {isHighLevel && (
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          {[
            { key: "sessions", label: "Login Sessions" },
            { key: "events",   label: `Screenshot Alerts${securityEvents.length ? ` (${securityEvents.length})` : ""}` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "9px 18px", border: "none", borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                background: "transparent", color: activeTab === tab.key ? "var(--accent)" : "var(--text-muted)",
                fontWeight: activeTab === tab.key ? 700 : 500, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isHighLevel ? "repeat(5, 1fr)" : "repeat(3, 1fr)", gap: 12, flexShrink: 0 }}>
        <SummaryCard icon={Shield}  label="Total Sessions" value={total}        color="#6366F1" />
        <SummaryCard icon={Wifi}    label="Online / Active" value={activeCount}  color="#10B981" sub={activeCount ? "Currently live" : undefined} />
        <SummaryCard icon={WifiOff} label="Offline"         value={offlineCount} color="#6B7280" />
        {isHighLevel && (
          <>
            <SummaryCard icon={Monitor} label="Unique Devices" value={uniqueDevices} color="#3B82F6" />
            <SummaryCard
              icon={AlertTriangle}
              label="Multi-Device Users"
              value={multiSessions}
              color={multiSessions > 0 ? "#F59E0B" : "#6B7280"}
              sub={multiSessions > 0 ? "Active on 2+ devices" : "None detected"}
            />
          </>
        )}
      </div>

      {/* Role scope note for non-admin admins */}
      {isSalesHead && (
        <div style={{ flexShrink: 0, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 10, padding: "8px 14px", fontSize: 12.5, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 7 }}>
          <Shield size={13} style={{ color: "#6366F1", flexShrink: 0 }} />
          Showing logs for Sales Managers, Sales Employees, and Inside Sales users. Super Admin logs are not visible to your role.
        </div>
      )}
      {!isHighLevel && (
        <div style={{ flexShrink: 0, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 10, padding: "8px 14px", fontSize: 12.5, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 7 }}>
          <Shield size={13} style={{ color: "#6366F1", flexShrink: 0 }} />
          You can view your own login sessions and device activity here.
        </div>
      )}

      {/* ── Screenshot Alerts tab ── */}
      {isHighLevel && activeTab === "events" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Alert stats strip */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "Total Attempts",   val: securityEvents.length,                                                          color: "#6366F1", bg: "rgba(99,102,241,0.08)" },
              { label: "Screenshots",      val: securityEvents.filter((e) => e.action?.includes("screenshot_attempt")).length,  color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
              { label: "Print Attempts",   val: securityEvents.filter((e) => e.action?.includes("print_attempt")).length,       color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
              { label: "Screen Share",     val: securityEvents.filter((e) => e.action?.includes("share_attempt")).length,       color: "#8B5CF6", bg: "rgba(139,92,246,0.08)" },
              { label: "Dismissed (no reason)", val: securityEvents.filter((e) => e.details?.reason === "DISMISSED").length,   color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
            ].map((s) => (
              <div key={s.label} style={{ padding: "8px 16px", borderRadius: 10, background: s.bg, border: `1px solid ${s.color}22`, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.3 }}>{s.label}</span>
              </div>
            ))}
            <button onClick={() => refetchEvents()} className="btn-secondary" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, height: 36, alignSelf: "center" }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {securityEvents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
              <Shield size={40} style={{ opacity: 0.15, display: "block", margin: "0 auto 14px" }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No screenshot attempts detected</div>
              <div style={{ fontSize: 13 }}>All screenshot, print, and screen-share attempts will appear here in real-time.</div>
            </div>
          ) : (
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>SEVERITY</th>
                      <th>USER</th>
                      <th>ROLE</th>
                      <th>EVENT TYPE</th>
                      <th>PAGE / MODULE</th>
                      <th>REASON PROVIDED</th>
                      <th>BROWSER</th>
                      <th>TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {securityEvents.map((ev) => {
                      const d = ev.details || {};
                      const EVENT_MAP = {
                        screen_protection_print_attempt:        { label: "Print / Screenshot",  color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  sev: "Medium" },
                        screen_protection_screenshot_attempt:   { label: "Screenshot Key",       color: "#EF4444", bg: "rgba(239,68,68,0.1)",   sev: "High"   },
                        screen_protection_screen_share_attempt: { label: "Screen Recording",     color: "#EF4444", bg: "rgba(239,68,68,0.1)",   sev: "High"   },
                      };
                      const cfg = EVENT_MAP[ev.action] || {
                        label: (ev.action || "").replace("screen_protection_", "").replace(/_/g, " "),
                        color: "#6B7280", bg: "rgba(107,114,128,0.1)", sev: "Low",
                      };
                      const sevColor = { High: "#EF4444", Medium: "#F59E0B", Low: "#6B7280" }[cfg.sev];
                      const reason = d.reason && d.reason !== "DISMISSED" ? d.reason : null;
                      const dismissed = d.reason === "DISMISSED";
                      return (
                        <tr key={ev.id}>
                          {/* Severity */}
                          <td>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: `${sevColor}15`, color: sevColor, whiteSpace: "nowrap" }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sevColor, flexShrink: 0 }} />
                              {cfg.sev}
                            </span>
                          </td>
                          {/* User */}
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{d.user_name || "—"}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.user_email || "—"}</div>
                          </td>
                          {/* Role */}
                          <td><RoleBadge role={d.role} /></td>
                          {/* Event type */}
                          <td>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>
                              {cfg.label}
                            </span>
                          </td>
                          {/* Page */}
                          <td style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
                            {d.page || "—"}
                          </td>
                          {/* Reason */}
                          <td style={{ maxWidth: 200 }}>
                            {dismissed ? (
                              <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />
                                No reason provided
                              </span>
                            ) : reason ? (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{reason}</div>
                                {d.purpose && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{d.purpose}</div>}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>—</span>
                            )}
                          </td>
                          {/* Browser */}
                          <td style={{ fontSize: 11.5, color: "var(--text-muted)", maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {(d.browser || "").slice(0, 60) || "—"}
                          </td>
                          {/* Timestamp */}
                          <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                            {fmtDate(ev.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toolbar + Sessions (only shown when on sessions tab) */}
      {activeTab !== "events" && (<>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "0 0 240px" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="crm-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isHighLevel ? "Search user, IP, city…" : "Search IP, city, browser…"}
            style={{ paddingLeft: 30, height: 35, fontSize: 12.5 }}
          />
        </div>

        {/* Status filter chips */}
        {[
          { key: "",           label: "All",      color: "var(--text-2)", bg: "var(--surface-2)" },
          { key: "active",     label: "● Online", color: "#10B981",       bg: "rgba(16,185,129,0.1)" },
          { key: "logged_out", label: "Offline",  color: "#6B7280",       bg: "rgba(107,114,128,0.1)" },
          { key: "inactivity", label: "Idle Out", color: "#F59E0B",       bg: "rgba(245,158,11,0.1)" },
        ].map(({ key, label, color, bg }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            style={{
              padding: "4px 13px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              border: `1.5px solid ${statusFilter === key ? color : "var(--border)"}`,
              background: statusFilter === key ? bg : "transparent",
              color: statusFilter === key ? color : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}

        {/* View by Role — admins only */}
        {isHighLevel && presentRoles.length > 0 && (
          <select
            className="crm-input"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ height: 35, fontSize: 12.5, width: "auto", minWidth: 160 }}
          >
            <option value="">View by Role</option>
            {presentRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        )}

        {/* View by User — admins only */}
        {isHighLevel && uniqueUsers.length > 0 && (
          <select
            className="crm-input"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            style={{ height: 35, fontSize: 12.5, width: "auto", minWidth: 160 }}
          >
            <option value="">View by User</option>
            {uniqueUsers.map(([id, u]) => <option key={id} value={id}>{u.full_name}</option>)}
          </select>
        )}

        {hasFilters && (
          <button
            className="btn-secondary"
            style={{ height: 35, fontSize: 12 }}
            onClick={() => { setSearch(""); setStatusFilter(""); setRoleFilter(""); setUserFilter(""); }}
          >
            Clear filters
          </button>
        )}

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {filtered.length} session{filtered.length !== 1 ? "s" : ""} · {groupedByDateUser.reduce((n, d) => n + d.users.length, 0)} user{groupedByDateUser.reduce((n, d) => n + d.users.length, 0) !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grouped View */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 80 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "#6366F1", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
            <Shield size={40} style={{ opacity: 0.15, display: "block", margin: "0 auto 14px" }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No sessions found</div>
            <div style={{ fontSize: 13 }}>Adjust your search or filter, or wait for users to log in</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28, paddingBottom: 32 }}>
            {groupedByDateUser.map(({ dateKey, users, sessionCount }) => {
              const todayStr   = new Date().toISOString().slice(0, 10);
              const yestStr    = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
              const dateLabel  = dateKey === "no-date" ? "Unknown Date"
                : dateKey === todayStr  ? "Today"
                : dateKey === yestStr   ? "Yesterday"
                : new Date(dateKey + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

              return (
                <div key={dateKey}>
                  {/* Date separator */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#6366F1", flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{dateLabel}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#6366F1", background: "rgba(99,102,241,0.1)", borderRadius: 99, padding: "2px 9px", border: "1px solid rgba(99,102,241,0.2)" }}>
                      {sessionCount} session{sessionCount !== 1 ? "s" : ""}
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>· {users.length} user{users.length !== 1 ? "s" : ""}</span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>

                  {/* User rows for this date */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {users.map(({ user, sessions }) => {
                      const uid        = user?.id || "unknown";
                      const groupKey   = `${dateKey}:${uid}`;
                      const isOpen     = !!expandedKeys[groupKey];
                      const onlineCount = sessions.filter((s) => getStatus(s) === "active").length;
                      const hasOnline  = onlineCount > 0;

                      return (
                        <div key={groupKey} style={{ borderRadius: 12, border: `1.5px solid ${isOpen ? "rgba(99,102,241,0.35)" : "var(--border)"}`, overflow: "hidden", background: "var(--surface)" }}>
                          {/* Collapsed user row */}
                          <button
                            onClick={() => toggleExpand(groupKey)}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", background: isOpen ? "rgba(99,102,241,0.04)" : "var(--surface)", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
                          >
                            {/* Avatar */}
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: user?.avatar_url ? "transparent" : "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, color: "#fff", flexShrink: 0, position: "relative", overflow: "hidden" }}>
                              {user?.avatar_url
                                ? <img src={user.avatar_url} style={{ width: 38, height: 38, objectFit: "cover" }} alt="" />
                                : initials(user?.full_name)}
                              {hasOnline && (
                                <span style={{ position: "absolute", bottom: -1, right: -1, width: 10, height: 10, borderRadius: "50%", background: "#10B981", border: "2px solid var(--surface)" }} />
                              )}
                            </div>

                            {/* Name + email */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.full_name || "Unknown"}</div>
                              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>{user?.email || "—"}</div>
                            </div>

                            {/* Role */}
                            {isHighLevel && <RoleBadge role={user?.role} />}

                            {/* Session count */}
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", background: "rgba(99,102,241,0.08)", padding: "3px 11px", borderRadius: 99, whiteSpace: "nowrap" }}>
                              {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
                            </span>

                            {/* Online chip */}
                            {hasOnline && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", padding: "3px 10px", borderRadius: 99, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981", flexShrink: 0, animation: "pulse 2s ease-in-out infinite" }} />
                                {onlineCount} online
                              </span>
                            )}

                            <ChevronDown size={16} style={{ color: "var(--text-muted)", transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none", flexShrink: 0 }} />
                          </button>

                          {/* Expanded session table */}
                          {isOpen && (
                            <AnimatePresence>
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                style={{ borderTop: "1px solid var(--border)", overflowX: "auto" }}
                              >
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <thead>
                                    <tr style={{ background: "var(--surface-2)", borderBottom: "1.5px solid var(--border)" }}>
                                      {["Session", "Status", "Login Time", "Logout Time", "IP Address", "Location", "Device", "Browser / OS", ...(isHighLevel ? ["Actions"] : [])].map((h) => (
                                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
                                          {h === "Session" ? <span style={{ paddingLeft: 4 }}>{h}</span> : h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...sessions]
                                      .sort((a, b) => new Date(a.logged_in_at) - new Date(b.logged_in_at))
                                      .map((session, idx) => (
                                        <SessionRow
                                          key={session.id}
                                          session={session}
                                          idx={idx}
                                          isHighLevel={isHighLevel}
                                          onForceLogout={(id) => forceLogoutMutation.mutate(id)}
                                        />
                                      ))}
                                  </tbody>
                                </table>
                              </motion.div>
                            </AnimatePresence>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}
