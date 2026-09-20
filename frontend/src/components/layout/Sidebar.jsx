import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "../../lib/db";
import {
  ChevronLeft, ChevronRight, ChevronsUpDown, Check,
  LayoutDashboard, Filter, Database, UserPlus, BriefcaseBusiness,
  Target, CalendarDays, Activity, ClipboardList,
  MessagesSquare, FileText, ChartNoAxesCombined, Users, ShieldCheck, Sparkles, Building2,
} from "lucide-react";


const NAV = [
  {
    section: "Sell",
    items: [
      { to: "/dashboard",  icon: LayoutDashboard,    label: "Overview" },
      { to: "/pipeline",   icon: Database,            label: "Database" },
      { to: "/leads",      icon: UserPlus,           label: "Leads" },
      { to: "/deals",      icon: BriefcaseBusiness,  label: "Deals" },
    ],
  },
  {
    section: "Work",
    items: [
      { to: "/targets",    icon: Target,        label: "Targets" },
      { to: "/meetings",   icon: CalendarDays,  label: "Meetings" },
      { to: "/activities", icon: Activity,      label: "Activities" },
      { to: "/dsr",        icon: ClipboardList, label: "DSR" },
      { to: "/chat",       icon: MessagesSquare, label: "Chat" },
    ],
  },
  {
    section: "Analyze",
    items: [
      { to: "/reports",       icon: FileText,             label: "Reports",       ownerOnly: true },
      { to: "/analytics",     icon: ChartNoAxesCombined,  label: "Analytics" },
      { to: "/team",          icon: Users,                label: "Team" },
      { to: "/security-logs", icon: ShieldCheck,          label: "Security Logs", ownerOnly: true },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { to: "/ai-assistant", icon: Sparkles, label: "Ask your CRM", highlight: true },
    ],
  },
  {
    section: "Admin",
    items: [
      { to: "/organization", icon: Building2, label: "Organization", adminOnly: true },
    ],
  },
];


/* Sidebar palette — deep graphite rail, emerald signal accent */
const SB = {
  bg:       "var(--ink-surface)",
  border:   "var(--ink-border)",
  divider:  "var(--ink-border)",
  text:     "var(--ink-text-2)",
  textHov:  "var(--ink-text)",
  active:   "#FFFFFF",
  activeBg: "rgba(52,211,153,0.14)",
  violet:   "#34D399",
  violetBg: "rgba(52,211,153,0.12)",
};

function SidebarLink({ item, collapsed, badge }) {
  const location = useLocation();
  const isActive = location.pathname === item.to ||
    (item.to !== "/dashboard" && location.pathname.startsWith(item.to));

  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 11,
        height: 34,
        padding: collapsed ? 0 : "0 10px 0 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 8,
        textDecoration: "none",
        marginBottom: 1,
        whiteSpace: "nowrap",
        fontFamily: "var(--font-sans)",
        fontSize: 13.5,
        fontWeight: isActive ? 600 : 500,
        letterSpacing: "-0.006em",
        color: isActive ? "#fff" : SB.text,
        background: isActive ? SB.activeBg : "transparent",
        transition: "color .14s, background .14s",
      }}
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = SB.textHov; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; } }}
      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = SB.text; e.currentTarget.style.background = "transparent"; } }}
    >
      {/* active left bar */}
      {isActive && !collapsed && (
        <span style={{ position: "absolute", left: -8, top: 8, bottom: 8, width: 3, borderRadius: 3, background: SB.violet }} />
      )}

      <item.icon
        size={17}
        strokeWidth={2}
        style={{ flexShrink: 0, color: isActive ? SB.violet : (item.highlight ? SB.violet : "currentColor") }}
      />

      {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}

      {badge > 0 && (
        collapsed ? (
          <span style={{
            position: "absolute", top: 3, right: 3, width: 6, height: 6,
            borderRadius: "50%", background: "var(--red)",
          }} />
        ) : (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
            minWidth: 17, height: 16, padding: "0 4px", borderRadius: 5,
            background: "rgba(255,255,255,0.08)", color: SB.textHov,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {badge > 99 ? "99+" : badge}
          </span>
        )
      )}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { profile, isManager, isAdmin, organization, memberships, switchOrg } = useAuth();
  const normRole = (profile?.role || "").toLowerCase().replace(/[- ]/g, "_");
  const isOwnerOrHead = ["owner", "admin"].includes(normRole);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);

  // Live badge counts
  const { data: pendingTaskCount = 0 } = useQuery({
    queryKey: ["sidebar-task-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .not("status", "in", '("done","cancelled")');
      return count || 0;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: unreadNotifCount = 0 } = useQuery({
    queryKey: ["sidebar-notif-count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("read", false);
      return count || 0;
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const BADGES = { "/tasks": pendingTaskCount, "/targets": 0 };

  return (
    <div className={`sidebar-wrapper${mobileOpen ? " sidebar-mobile-open" : ""}`}>
    <motion.aside
      animate={{ width: collapsed ? 60 : 236, minWidth: collapsed ? 60 : 236 }}
      transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
      style={{
        background: SB.bg,
        borderRight: `1px solid ${SB.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        overflow: "visible",
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Subtle top depth — barely visible, just for depth */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 160,
        background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)",
        pointerEvents: "none",
      }} />

      {/* Branding Header */}
      <div style={{
        height: 72,
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "0 14px" : "0 14px 0 20px",
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
        flexShrink: 0, position: "relative",
        overflow: "hidden",
      }}>
        {/* Violet top cap */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, rgba(52,211,153,0.4) 0%, rgba(52,211,153,0.08) 55%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", zIndex: 1 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: "var(--accent)", color: "var(--on-accent)",
            display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14,
            fontFamily: "var(--font-sans)",
          }}>S</div>
          {!collapsed && (
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14.5, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>Sales CRM</span>
          )}
        </div>

        {/* Collapse button */}
        {!collapsed && (
          <motion.button
            whileHover={{ color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)" }}
            whileTap={{ scale: 0.88 }}
            onClick={() => setCollapsed(true)}
            style={{
              background: "none", border: "none",
              color: "rgba(255,255,255,0.35)",
              cursor: "pointer", padding: "5px 6px",
              borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "color 0.15s, background 0.15s",
            }}
          >
            <ChevronLeft size={13} />
          </motion.button>
        )}
      </div>

      {/* Organization switcher */}
      {organization && !collapsed && (
        <div style={{ padding: "10px 12px 6px", position: "relative" }}>
          <button
            onClick={() => memberships.length > 1 && setOrgMenuOpen((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 9,
              padding: "8px 10px", borderRadius: 9, cursor: memberships.length > 1 ? "pointer" : "default",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#E5E7EB", textAlign: "left",
            }}
          >
            {organization.logo_url
              ? <img src={organization.logo_url} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
              : <span style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(255,255,255,0.12)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{organization.name?.[0]?.toUpperCase()}</span>}
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{organization.name}</span>
            {memberships.length > 1 && <ChevronsUpDown size={13} style={{ opacity: 0.5, flexShrink: 0 }} />}
          </button>
          {orgMenuOpen && (
            <div style={{
              position: "absolute", left: 12, right: 12, top: "100%", marginTop: 4, zIndex: 40,
              background: "#252542", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
              boxShadow: "0 12px 32px rgba(0,0,0,0.5)", overflow: "hidden",
            }}>
              {memberships.map((m) => (
                <button
                  key={m.organization_id}
                  onClick={() => { setOrgMenuOpen(false); if (m.organization_id !== organization.id) switchOrg(m.organization_id); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 11px",
                    background: "none", border: "none", cursor: "pointer", color: "#E5E7EB", fontSize: 12.5, textAlign: "left",
                  }}
                >
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.organization?.name}</span>
                  {m.organization_id === organization.id && <Check size={13} style={{ color: "#A78BFA" }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "10px 8px 8px", overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 0 }} className="custom-scroll">
        {NAV.map((section) => (
          <div key={section.section} style={{ marginBottom: 4 }}>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="nav-section-label"
                >
                  {section.section}
                </motion.div>
              )}
            </AnimatePresence>
            {collapsed && <div style={{ height: 10 }} />}
            {section.items
              .filter((item) => {
                if (item.ownerOnly   && !isOwnerOrHead) return false;
                if (item.adminOnly   && !isAdmin)       return false;
                if (item.managerOnly && !isManager)     return false;
                return true;
              })
              .map((item) => (
                <SidebarLink key={item.to} item={item} collapsed={collapsed} badge={BADGES[item.to] || 0} />
              ))}
          </div>
        ))}

      </nav>


      {/* Expand toggle */}
      <AnimatePresence>
        {collapsed && (
          <motion.button
            key="expand-btn"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            whileHover={{ borderColor: "rgba(59,130,246,0.6)", color: "#60A5FA", background: "#2A2A45" }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setCollapsed(false)}
            style={{
              position: "absolute", top: "50%", right: -12,
              transform: "translateY(-50%)",
              background: "#252542",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "50%",
              width: 24, height: 24,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              color: "rgba(255,255,255,0.32)",
              zIndex: 30,
              boxShadow: "0 2px 12px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)",
              transition: "color 0.15s, background 0.15s, border-color 0.15s",
            }}
          >
            <ChevronRight size={11} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.aside>
    </div>
  );
}
