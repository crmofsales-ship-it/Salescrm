import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { analyticsService } from "../services/analyticsService";
import { meetingsService } from "../services/meetingsService";
import { tasksService } from "../services/tasksService";
import { leadsService } from "../services/leadsService";
import { teamService } from "../services/teamService";
import { LeadModal } from "./Leads";
import { actService } from "./Activities";
import { deriveStatus } from "../utils/activityStatus";
import { db as supabase } from "../lib/db";
import toast from "react-hot-toast";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  UserPlus, IndianRupee, Briefcase, TrendingUp, Building2, ListChecks,
  CalendarDays, CalendarPlus, CalendarCheck, Clock, Activity,
  ChevronRight, ChevronDown, ChevronUp, Plus, Zap, AlertCircle,
  Sparkles, ArrowUpRight, ExternalLink, Flame, PhoneCall, Video,
  Target, Users, ArrowUp, ArrowDown, LayoutDashboard, CheckCircle2,
  Star, Trophy, Bolt, Signal, Workflow, AlertTriangle, GripVertical,
  Mail, FileText, RefreshCw, Phone, Eye, EyeOff, BarChart2, X,
  TrendingDown, Layers, Maximize2, Minimize2, Pin, PinOff,
} from "lucide-react";
import { format, isToday, isTomorrow, isPast, startOfDay, endOfDay, subDays } from "date-fns";

/* ─── Palette ───────────────────────────────────────────────────────────── */
const C = {
  blue:   { solid: "#3B82F6", light: "rgba(59,130,246,0.1)",  grad: ["#2563EB","#60A5FA"] },
  green:  { solid: "#10B981", light: "rgba(16,185,129,0.1)",  grad: ["#059669","#34D399"] },
  amber:  { solid: "#F59E0B", light: "rgba(245,158,11,0.1)",  grad: ["#D97706","#FCD34D"] },
  purple: { solid: "#8B5CF6", light: "rgba(139,92,246,0.1)",  grad: ["#7C3AED","#C4B5FD"] },
  teal:   { solid: "#14B8A6", light: "rgba(20,184,166,0.1)",  grad: ["#0D9488","#5EEAD4"] },
  rose:   { solid: "#F43F5E", light: "rgba(244,63,94,0.1)",   grad: ["#E11D48","#FB7185"] },
  orange: { solid: "#F97316", light: "rgba(249,115,22,0.1)",  grad: ["#EA580C","#FB923C"] },
  indigo: { solid: "#6366F1", light: "rgba(99,102,241,0.1)",  grad: ["#4F46E5","#818CF8"] },
};

/* ─── Activity Types ───────────────────────────────────────────────────── */
const ACT_TYPES = {
  follow_up_call:  { label: "Follow-up Call",  short: "FU Call",   icon: RefreshCw, color: "#F59E0B" },
  follow_up_email: { label: "Follow-up Email", short: "FU Email",  icon: RefreshCw, color: "#06B6D4" },
  call:            { label: "Call",            short: "Call",      icon: Phone,     color: "#3B82F6" },
  email:           { label: "Email",           short: "Email",     icon: Mail,      color: "#EC4899" },
  note:            { label: "Note",            short: "Note",      icon: FileText,  color: "#10B981" },
  meeting_person:  { label: "In-Person",       short: "In-Person", icon: Users,     color: "#8B5CF6" },
  meeting_virtual: { label: "Virtual Meeting", short: "Virtual",   icon: Video,     color: "#6366F1" },
};

function resolveActType(t) {
  if (!t) return "note";
  const s = t.toLowerCase().replace(/[-\s]/g, "_");
  if (s === "follow_up_call" || s === "follow_up") return "follow_up_call";
  if (s === "follow_up_email") return "follow_up_email";
  if (s === "meeting_person"  || s === "in_person" || s === "visit") return "meeting_person";
  if (s === "meeting_virtual" || s === "virtual_meeting" || s === "meeting") return "meeting_virtual";
  if (["call","phone_call","cold_call","demo","introductory","verification","other"].includes(s)) return "call";
  if (s === "email") return "email";
  return "note";
}

function getContextRoute(item) {
  // Explicit pipeline tag (set by activityEngine for CRM auto-logs)
  if (item.entity_type === "pipeline" && item.entity_id)   return `/pipeline?entry=${item.entity_id}`;
  if (item.entity_type === "pipeline")                      return "/pipeline";
  if (item.related_type === "pipeline" && item.related_id)  return `/pipeline?entry=${item.related_id}`;

  // Meetings
  if (item.entity_type === "meeting" || item._cat === "meeting") return "/meetings";

  // Explicit entity references
  if (item.entity_type === "lead" && item.entity_id)  return `/leads?selected=${item.entity_id}`;
  if (item.entity_type === "deal" && item.entity_id)  return `/deals?selected=${item.deal_id || item.entity_id}`;

  // Deal FK — check deal_id first (unambiguous)
  if (item.deal_id) return `/deals?selected=${item.deal_id}`;
  if (item.related_type === "deal" && item.related_id) return `/deals?selected=${item.related_id}`;

  // Lead FK — must distinguish pipeline entries (stage="pipeline") from regular leads.
  // The query joins leads and fetches stage, so item.lead?.stage is available.
  if (item.lead_id) {
    if (item.lead?.stage === "pipeline") return `/pipeline?entry=${item.lead_id}`;
    return `/leads?selected=${item.lead_id}`;
  }
  if (item.related_type === "lead" && item.related_id) return `/leads?selected=${item.related_id}`;

  // Type-based fallback
  const t = (item.type || "").toLowerCase();
  if (["meeting_virtual","meeting_person","meeting"].includes(t)) return "/meetings";

  return "/activities";
}

/* ─── Greeting ─────────────────────────────────────────────────────────── */
const ROLE_LABELS = {
  owner: "Super Admin", sales_head: "Sales Head",
  sales_manager: "Sales Manager", inside_sales: "Inside Sales",
  employee: "Sales Rep",
};
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ─── Counter Hook ─────────────────────────────────────────────────────── */
function useCountUp(target, duration = 800) {
  const [count, setCount] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const n = Number(target) || 0;
    const diff = n - prev.current;
    if (!diff) return;
    const steps = Math.min(40, Math.abs(diff));
    const step = diff / steps;
    let cur = prev.current, frame = 0;
    const t = setInterval(() => {
      frame++;
      cur += step;
      if (frame >= steps) { setCount(n); prev.current = n; clearInterval(t); }
      else setCount(Math.round(cur));
    }, duration / steps);
    return () => clearInterval(t);
  }, [target, duration]);
  return count;
}

/* ─── Widget persistence ──────────────────────────────────────────────── */
function useWidgetPrefs(userId, defaultOrder, defaultCollapsed = []) {
  const orderKey     = `dash_order_${userId}`;
  const colKey       = `dash_collapsed_${userId}`;
  const [order, setOrder_]         = useState(() => {
    try {
      const s = localStorage.getItem(orderKey);
      if (!s) return defaultOrder;
      const saved = JSON.parse(s);
      const newWidgets = defaultOrder.filter(w => !saved.includes(w));
      return newWidgets.length ? [...saved, ...newWidgets] : saved;
    } catch { return defaultOrder; }
  });
  const [collapsed, setCollapsed_] = useState(() => {
    try { const s = localStorage.getItem(colKey); return s ? new Set(JSON.parse(s)) : new Set(defaultCollapsed); }
    catch { return new Set(defaultCollapsed); }
  });

  const setOrder = useCallback((v) => {
    setOrder_(v); localStorage.setItem(orderKey, JSON.stringify(v));
  }, [orderKey]);
  const toggleCollapse = useCallback((id) => {
    setCollapsed_((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(colKey, JSON.stringify([...next]));
      return next;
    });
  }, [colKey]);

  return { order, setOrder, collapsed, toggleCollapse };
}

/* ─── Sortable Widget Shell ─────────────────────────────────────────────── */
function SortableWidget({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 50 : "auto",
      }}
    >
      {children({ dragHandleProps: { ...attributes, ...listeners } })}
    </div>
  );
}

/* ─── Widget Container ──────────────────────────────────────────────────── */
function Widget({ id, title, sub, icon: Icon, iconColor = "#6366F1", collapsed, onToggle,
  dragHandleProps, to, navigate, actions, children, noPad = false }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      transition: "box-shadow 0.15s",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        borderBottom: collapsed ? "none" : "1px solid var(--border)",
        background: "var(--surface)",
        minHeight: 48,
      }}>
        {/* Drag handle */}
        <div {...dragHandleProps} style={{ cursor: "grab", color: "var(--text-muted)", opacity: 0.4, flexShrink: 0, display: "flex", alignItems: "center" }}>
          <GripVertical size={14} />
        </div>

        {Icon && (
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `${iconColor}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={13} style={{ color: iconColor }} strokeWidth={2} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          {sub && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {actions}
          {to && (
            <button onClick={() => navigate(to)} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit", padding: "2px 0" }}>
              All <ChevronRight size={10} />
            </button>
          )}
          <button onClick={() => onToggle(id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", padding: 2 }}>
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>
      {/* Body */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={noPad ? {} : { padding: "14px 16px" }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── KPI Pill (single, hook-safe) ──────────────────────────────────────── */
function KPIPill({ label, value, color, to, loading, navigate, fmt }) {
  const anim    = useCountUp(Number(value) || 0);
  const display = fmt ? fmt(Number(value) || 0) : anim.toLocaleString();
  return (
    <motion.button
      onClick={() => to && navigate(to)}
      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 99, background: "var(--surface)", border: "1.5px solid var(--border)", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "border-color 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}50`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}80`, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
      {loading ? (
        <span style={{ width: 28, height: 14, borderRadius: 4, background: "var(--surface-3)" }} className="skeleton" />
      ) : (
        <span style={{ fontSize: 13.5, fontWeight: 800, color, letterSpacing: "-0.03em" }}>{display}</span>
      )}
    </motion.button>
  );
}

/* ─── KPI Strip ──────────────────────────────────────────────────────────── */
function KPIStrip({ stats, loading, fieldKPIs, isFieldUser, navigate, formatCompact, symbol }) {
  const pills = isFieldUser ? fieldKPIs : [
    { label: "Pipeline",    value: stats?.totalPipeline || 0, color: C.indigo.solid, to: "/pipeline"  },
    { label: "Total Leads", value: stats?.totalLeads    || 0, color: C.blue.solid,   to: "/leads"     },
    { label: "Active Deals",value: stats?.activeDeals   || 0, color: C.amber.solid,  to: "/deals"     },
    { label: "Revenue Won", value: stats?.revenue       || 0, color: C.green.solid,  to: "/reports",  fmt: (v) => formatCompact(v) },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {pills.map((p) => (
        <KPIPill key={p.label} {...p} loading={loading} navigate={navigate} />
      ))}
    </div>
  );
}

/* ─── Smart Activity Strip ──────────────────────────────────────────────── */
function ActivityCard({ item, navigate, index }) {
  const isActivity = item._source === "activity";
  const typeKey    = isActivity ? resolveActType(item.type) : null;
  const actCfg     = typeKey ? ACT_TYPES[typeKey] : null;
  const isMeeting  = item._cat === "meeting";
  const isOverdue  = item._cat === "overdue";
  const isAnytime  = item._cat === "anytime";
  const baseColor  = isOverdue ? "#EF4444" : isMeeting ? "#8B5CF6" : (actCfg?.color || "#3B82F6");
  const ActIcon    = isMeeting ? CalendarDays : (actCfg?.icon || ListChecks);
  const PCOL       = { urgent: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#22C55E" };
  const prioColor  = PCOL[item.priority] || "#6B7280";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.18 }}
      style={{
        display: "flex", alignItems: "center", gap: 0,
        borderRadius: 10, border: `1px solid ${baseColor}20`,
        borderLeft: `3px solid ${baseColor}`,
        background: isOverdue ? `${baseColor}04` : "var(--surface)",
        overflow: "hidden", transition: "background 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${baseColor}06`; e.currentTarget.style.borderColor = `${baseColor}38`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isOverdue ? `${baseColor}04` : "var(--surface)"; e.currentTarget.style.borderColor = `${baseColor}20`; }}
    >
      {/* Type icon */}
      <div style={{ width: 34, height: 34, borderRadius: 8, background: `${baseColor}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, margin: "9px 10px 9px 10px" }}>
        <ActIcon size={14} style={{ color: baseColor }} strokeWidth={2} />
      </div>
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, padding: "9px 0" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          {actCfg && <span style={{ fontSize: 10, fontWeight: 700, color: actCfg.color, background: `${actCfg.color}12`, padding: "1px 6px", borderRadius: 99 }}>{actCfg.short}</span>}
          {isMeeting && <span style={{ fontSize: 10, fontWeight: 700, color: "#8B5CF6", background: "rgba(139,92,246,0.1)", padding: "1px 6px", borderRadius: 99 }}>Meeting</span>}
          {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", display: "flex", alignItems: "center", gap: 3 }}><AlertTriangle size={9} /> Overdue</span>}
          {isAnytime && <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", background: "rgba(107,114,128,0.1)", padding: "1px 6px", borderRadius: 99 }}>No due date</span>}
          {item.due_date && (
            <span style={{ fontSize: 10.5, color: isOverdue ? "#EF4444" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
              <Clock size={9} />
              {isMeeting ? format(new Date(item.due_date), "EEE, MMM d · h:mm a") : format(new Date(item.due_date), "MMM d, h:mm a")}
            </span>
          )}
        </div>
      </div>
      {/* Priority + Open */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", flexShrink: 0 }}>
        {item.priority && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: prioColor, background: `${prioColor}14`, padding: "2px 7px", borderRadius: 99, textTransform: "capitalize" }}>
            {item.priority}
          </span>
        )}
        <motion.button
          whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
          onClick={(e) => { e.stopPropagation(); navigate(isMeeting ? "/meetings" : getContextRoute(item)); }}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, background: `${baseColor}12`, color: baseColor, border: `1px solid ${baseColor}25`, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
        >
          Open <ExternalLink size={10} strokeWidth={2.5} />
        </motion.button>
      </div>
    </motion.div>
  );
}

function SmartActivityStrip({ tasks = [], activities = [], meetings = [], completedActivities = [], navigate }) {
  const [activeTab, setActiveTab] = useState("all");
  const overdueCount = useMemo(() => {
    const allTasks = tasks.filter((t) => !["done","cancelled"].includes(t.status));
    return [
      ...allTasks.filter((t) => t.due_date && isPast(new Date(t.due_date))),
      ...activities.filter((a) => deriveStatus(a) === "overdue"),
    ].length;
  }, [tasks, activities]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (overdueCount > 0) setExpanded(true); }, [overdueCount]);
  const now = new Date();

  const { overdue, todayItems, upcomingItems, meetingItems, undated } = useMemo(() => {
    const allTasks = tasks.filter((t) => !["done","cancelled"].includes(t.status));
    const allActs  = activities;

    const overdue = [
      ...allTasks.filter((t) => t.due_date && isPast(new Date(t.due_date))).map((t) => ({ ...t, _cat: "overdue", _source: "task" })),
      ...allActs.filter((a)  => deriveStatus(a) === "overdue").map((a) => ({ ...a, _cat: "overdue" })),
    ];
    const todayItems = [
      ...allTasks.filter((t) => t.due_date && isToday(new Date(t.due_date)) && !isPast(new Date(t.due_date))).map((t) => ({ ...t, _cat: "today", _source: "task" })),
      ...allActs.filter((a)  => a.due_date && isToday(new Date(a.due_date)) && !isPast(new Date(a.due_date))).map((a) => ({ ...a, _cat: "today" })),
    ];
    const upcomingItems = [
      ...allTasks.filter((t) => t.due_date && !isToday(new Date(t.due_date)) && !isPast(new Date(t.due_date))).map((t) => ({ ...t, _cat: "upcoming", _source: "task" })),
      ...allActs.filter((a)  => a.due_date && !isToday(new Date(a.due_date)) && !isPast(new Date(a.due_date))).map((a) => ({ ...a, _cat: "upcoming" })),
    ];
    const meetingItems = meetings
      .filter((m) => new Date(m.start_time) >= now)
      .map((m) => ({ ...m, _cat: "meeting", _source: "meeting", due_date: m.start_time }));
    const undated = [
      ...allTasks.filter((t) => !t.due_date).map((t) => ({ ...t, _cat: "anytime", _source: "task" })),
      ...allActs.filter((a)  => !a.due_date).map((a) => ({ ...a, _cat: "anytime" })),
    ];

    return { overdue, todayItems, upcomingItems, meetingItems, undated };
  }, [tasks, activities, meetings]);

  const totalPending   = overdue.length + todayItems.length;
  const totalUpcoming  = upcomingItems.length;
  const totalMeetings  = meetingItems.length;
  const hasAnything    = totalPending + totalUpcoming + totalMeetings + undated.length > 0;

  const recentCompleted = completedActivities.slice(0, 20).map((a) => ({ ...a, _cat: "completed" }));

  const tabItems = {
    all:       [...overdue, ...todayItems, ...upcomingItems.slice(0, 5), ...meetingItems.slice(0, 3), ...undated.slice(0, 5)],
    overdue:   overdue,
    today:     todayItems,
    upcoming:  upcomingItems,
    meetings:  meetingItems,
    anytime:   undated,
    completed: recentCompleted,
  };
  const displayItems = tabItems[activeTab] || [];

  const TABS = [
    { key: "all",       label: "All",       count: overdue.length + todayItems.length + upcomingItems.length + meetingItems.length + undated.length },
    { key: "overdue",   label: "Overdue",   count: overdue.length,       color: "#EF4444" },
    { key: "today",     label: "Today",     count: todayItems.length,    color: "#F59E0B" },
    { key: "upcoming",  label: "Upcoming",  count: upcomingItems.length, color: "#3B82F6" },
    { key: "meetings",  label: "Meetings",  count: meetingItems.length,  color: "#8B5CF6" },
    { key: "anytime",   label: "Anytime",   count: undated.length,       color: "#6B7280" },
    { key: "completed", label: "Completed", count: recentCompleted.length, color: "#10B981" },
  ];

  /* Summary chips */
  const chips = [
    overdue.length      && { label: `${overdue.length} Overdue`,       color: "#EF4444", bg: "rgba(239,68,68,0.1)"     },
    todayItems.length   && { label: `${todayItems.length} Due Today`,   color: "#F59E0B", bg: "rgba(245,158,11,0.1)"    },
    upcomingItems.length && { label: `${upcomingItems.length} Upcoming`,color: "#3B82F6", bg: "rgba(59,130,246,0.1)"   },
    meetingItems.length && { label: `${meetingItems.length} Meeting${meetingItems.length > 1 ? "s" : ""}`, color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
    undated.length      && { label: `${undated.length} Anytime`,        color: "#6B7280", bg: "rgba(107,114,128,0.1)"  },
  ].filter(Boolean);

  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
      {/* Summary bar — always visible */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 8, background: hasAnything ? (overdue.length ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)") : "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {hasAnything
            ? <AlertCircle size={14} style={{ color: overdue.length ? "#EF4444" : "#F59E0B" }} />
            : <CheckCircle2 size={14} style={{ color: "#10B981" }} />
          }
        </div>
        {!hasAnything ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: "#10B981" }}>All clear — no pending activities today</span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>My Activities</span>
            <span style={{ color: "var(--border)", fontSize: 12 }}>·</span>
            {chips.map((chip) => (
              <span key={chip.label} style={{ fontSize: 11.5, fontWeight: 700, color: chip.color, background: chip.bg, padding: "2px 9px", borderRadius: 99 }}>{chip.label}</span>
            ))}
          </div>
        )}
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }} style={{ flexShrink: 0, color: "var(--text-muted)" }}>
          <ChevronDown size={15} />
        </motion.div>
      </div>

      {/* Expanded panel */}
      <AnimatePresence initial={false}>
        {expanded && hasAnything && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: "1px solid var(--border)" }}>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 2, padding: "8px 16px", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
                {TABS.filter((t) => t.count > 0 || t.key === "all").map((tab) => (
                  <button
                    key={tab.key}
                    onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 12px", borderRadius: 8, border: "none",
                      fontFamily: "inherit", cursor: "pointer", fontSize: 12, fontWeight: 600,
                      background: activeTab === tab.key ? (tab.color ? `${tab.color}14` : "var(--surface-2)") : "transparent",
                      color: activeTab === tab.key ? (tab.color || "var(--text)") : "var(--text-muted)",
                      flexShrink: 0,
                      transition: "background 0.12s, color 0.12s",
                    }}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: activeTab === tab.key ? (tab.color || "var(--text)") : "var(--text-muted)", background: activeTab === tab.key ? (tab.color ? `${tab.color}18` : "var(--surface-3)") : "var(--surface-2)", padding: "1px 5px", borderRadius: 99, minWidth: 18, textAlign: "center" }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Activity cards */}
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
                {displayItems.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 12.5 }}>
                    <CheckCircle2 size={18} style={{ color: "#10B981", display: "block", margin: "0 auto 6px" }} />
                    Nothing in this category
                  </div>
                ) : displayItems.map((item, i) => (
                  <ActivityCard key={item.id + i} item={item} navigate={navigate} index={i} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── ORG Activities Center ─────────────────────────────────────────────── */

function OrgActivityRow({ item, navigate }) {
  const isMeeting = item._source === "meeting";
  const typeKey   = isMeeting ? "meeting_virtual" : resolveActType(item.type);
  const actCfg    = ACT_TYPES[typeKey] || ACT_TYPES.note;
  const ActIcon   = actCfg.icon;
  const actColor  = actCfg.color;

  const relatedName = item.lead?.company_name || item.lead?.contact_name ||
    item.company_name || (isMeeting ? item.customer_name : null) || item.title || null;
  // Determine module: check related_type first, then lead stage (pipeline entries are leads with stage="pipeline")
  const module = isMeeting                                              ? "Meeting"
    : item.related_type === "pipeline"                                   ? "Pipeline"
    : item.deal_id || item.related_type === "deal"                       ? "Deal"
    : item.lead_id && item.lead?.stage === "pipeline"                    ? "Pipeline"
    : item.lead_id || item.related_type === "lead"                       ? "Lead"
    : null;
  const assignedName = item.assigned_profile?.full_name || item.created_by_profile?.full_name || null;

  const handleOpen = (e) => {
    e.stopPropagation();
    if (isMeeting) { navigate("/meetings"); return; }
    navigate(getContextRoute(item));
  };

  return (
    <div
      style={{ borderRadius: 9, border: "1px solid var(--border)", borderLeft: `3px solid ${actColor}`, background: "var(--surface)", padding: "9px 10px", display: "flex", flexDirection: "column", gap: 5, transition: "background 0.12s, border-color 0.12s" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${actColor}05`; e.currentTarget.style.borderColor = `${actColor}35`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${actColor}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
          <ActIcon size={12} style={{ color: actColor }} strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title || actCfg.label || "Activity"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2, flexWrap: "wrap" }}>
            {relatedName && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{relatedName}</span>}
            {module && <span style={{ fontSize: 9.5, fontWeight: 700, color: actColor, background: `${actColor}12`, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>{module}</span>}
          </div>
        </div>
        <button
          onClick={handleOpen}
          style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, background: `${actColor}14`, color: actColor, border: `1px solid ${actColor}28`, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          Open <ExternalLink size={9} strokeWidth={2.5} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 31, flexWrap: "wrap" }}>
        {item.due_date && (
          <span style={{ fontSize: 10.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
            <Clock size={9} />
            {isToday(new Date(item.due_date))
              ? `Today · ${format(new Date(item.due_date), "h:mm a")}`
              : format(new Date(item.due_date), "MMM d · h:mm a")}
          </span>
        )}
        {assignedName && (
          <span style={{ fontSize: 10.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
            <Users size={9} />
            {assignedName}
          </span>
        )}
      </div>
    </div>
  );
}

function ActivityColumn({ col, expanded, onToggle, navigate }) {
  const { label, items, color, icon: ColIcon } = col;
  const [showAll, setShowAll] = useState(false);
  const MAX = 6;
  const shown = showAll ? items : items.slice(0, MAX);

  return (
    <div style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
      {/* Column header */}
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", cursor: "pointer", userSelect: "none", borderBottom: "1px solid var(--border)", background: expanded ? `${color}06` : "transparent", transition: "background 0.15s" }}
      >
        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ColIcon size={12} style={{ color }} strokeWidth={2.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{label}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color, background: `${color}14`, padding: "2px 8px", borderRadius: 99, minWidth: 24, textAlign: "center", flexShrink: 0 }}>
          {items.length}
        </span>
        <ChevronDown size={12} style={{ color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
      </div>

      {/* Items */}
      {expanded && (
        <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 6, flex: 1, overflowY: "auto", maxHeight: 420 }}>
          {shown.length === 0 ? (
            <div style={{ padding: "18px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              <CheckCircle2 size={16} style={{ color: "#10B981", display: "block", margin: "0 auto 4px" }} />
              All clear
            </div>
          ) : (
            <>
              {shown.map((item, i) => <OrgActivityRow key={`${item.id}-${i}`} item={item} navigate={navigate} />)}
              {!showAll && items.length > MAX && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
                  style={{ fontSize: 11, fontWeight: 700, color, background: `${color}10`, border: `1px solid ${color}20`, borderRadius: 7, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 2 }}
                >
                  +{items.length - MAX} more
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TeamWorkloadTable({ rows }) {
  const COLS = [
    { key: "overdue",   label: "Overdue",   color: "#EF4444" },
    { key: "pending",   label: "Pending",   color: "#F59E0B" },
    { key: "today",     label: "Today",     color: "#3B82F6" },
    { key: "upcoming",  label: "Upcoming",  color: "#8B5CF6" },
    { key: "completed", label: "Completed", color: "#10B981" },
  ];
  if (!rows.length) return <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No team activity data found.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 700, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid var(--border)" }}>Team Member</th>
            {COLS.map((c) => (
              <th key={c.key} style={{ textAlign: "center", padding: "10px 12px", fontWeight: 700, color: c.color, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid var(--border)" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i}
              style={{ borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <td style={{ padding: "11px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: `hsl(${(i * 53 + 200) % 360},55%,55%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                    {(row.full_name || "?")[0].toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{row.full_name || "Unknown"}</span>
                </div>
              </td>
              {COLS.map((c) => (
                <td key={c.key} style={{ textAlign: "center", padding: "11px 12px" }}>
                  {row[c.key] > 0
                    ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, padding: "3px 8px", borderRadius: 99, background: `${c.color}12`, color: c.color, fontWeight: 800, fontSize: 13 }}>{row[c.key]}</span>
                    : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrgActivitiesCenter({ tasks = [], activities = [], completedActivities = [], meetings = [], teamData = [], profile, isSalesHead, navigate }) {
  const now = new Date();

  const teamMembers = useMemo(() => {
    const all = teamData?.data || (Array.isArray(teamData) ? teamData : []);
    return all.filter((m) => m.id !== profile?.id);
  }, [teamData, profile]);

  const [expandedCols, setExpandedCols] = useState({ overdue: true, pending: false, today: true, upcoming: false });
  const [selectedUser, setSelectedUser]   = useState("all");
  const [moduleFilter, setModuleFilter]   = useState("all");   // all | pipeline | lead | deal | meeting
  const [dateFrom,     setDateFrom]       = useState("");
  const [dateTo,       setDateTo]         = useState("");
  const [view,         setView]           = useState("grid");  // grid | workload
  const [filtersOpen,  setFiltersOpen]    = useState(false);

  // Helper: resolve module of an item
  const getModule = (i) => {
    if (i._source === "meeting") return "meeting";
    if (i.related_type === "pipeline") return "pipeline";
    if (i.deal_id || i.related_type === "deal") return "deal";
    if (i.lead_id || i.related_type === "lead") return "lead";
    const t = (i.type || "").toLowerCase();
    if (["deal_won","deal_lost"].includes(t)) return "deal";
    if (["record_created","stage_change","assignment","lead_converted"].includes(t)) return "lead";
    return "activity";
  };

  // Unified pool: tasks + activities + upcoming meetings
  const allItems = useMemo(() => {
    const t = tasks.filter((t) => !["done","completed","cancelled"].includes(t.status)).map((t) => ({ ...t, _source: "task" }));
    const a = activities.map((a) => ({ ...a, _source: "activity" }));
    const m = meetings.filter((m) => new Date(m.start_time) >= now).map((m) => ({
      ...m, _source: "meeting", type: "meeting", due_date: m.start_time,
    }));
    return [...t, ...a, ...m];
  }, [tasks, activities, meetings]);

  // Apply all filters
  const filteredItems = useMemo(() => {
    let items = allItems;

    // User/team filter
    if (isSalesHead && selectedUser !== "all") {
      items = items.filter((i) => i.assigned_to === selectedUser || i.created_by === selectedUser || i.user_id === selectedUser);
    }
    // Module filter
    if (moduleFilter !== "all") {
      items = items.filter((i) => getModule(i) === moduleFilter);
    }
    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom + "T00:00:00");
      items = items.filter((i) => !i.due_date || new Date(i.due_date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59");
      items = items.filter((i) => !i.due_date || new Date(i.due_date) <= to);
    }
    return items;
  }, [allItems, selectedUser, isSalesHead, moduleFilter, dateFrom, dateTo]);

  // Categorise
  const { overdue, pending, today, upcoming } = useMemo(() => ({
    overdue:  filteredItems.filter((i) => i._source === "activity" ? deriveStatus(i) === "overdue" : (i.due_date && isPast(new Date(i.due_date)) && !isToday(new Date(i.due_date)))),
    today:    filteredItems.filter((i) => i.due_date && isToday(new Date(i.due_date))),
    upcoming: filteredItems.filter((i) => i.due_date && !isPast(new Date(i.due_date)) && !isToday(new Date(i.due_date))),
    pending:  filteredItems.filter((i) => !i.due_date),
  }), [filteredItems]);

  // Team workload (managers/admins)
  const workloadRows = useMemo(() => {
    if (!isSalesHead) return [];
    const members = [{ id: profile?.id, full_name: profile?.full_name || "Me" }, ...teamMembers];
    return members.map((m) => {
      const mi = allItems.filter((i) => i.assigned_to === m.id || i.created_by === m.id || i.user_id === m.id);
      const mc = completedActivities.filter((i) => i.assigned_to === m.id || i.created_by === m.id || i.user_id === m.id);
      return {
        ...m,
        overdue:   mi.filter((i) => i._source === "activity" ? deriveStatus(i) === "overdue" : (i.due_date && isPast(new Date(i.due_date)) && !isToday(new Date(i.due_date)))).length,
        pending:   mi.filter((i) => !i.due_date).length,
        today:     mi.filter((i) => i.due_date && isToday(new Date(i.due_date))).length,
        upcoming:  mi.filter((i) => i.due_date && !isPast(new Date(i.due_date)) && !isToday(new Date(i.due_date))).length,
        completed: mc.length,
      };
    }).filter((m) => m.overdue + m.pending + m.today + m.upcoming + m.completed > 0);
  }, [allItems, completedActivities, teamMembers, profile, isSalesHead]);

  const COLS = [
    { key: "overdue",  label: "Overdue",  items: overdue,  color: "#EF4444", icon: AlertTriangle },
    { key: "pending",  label: "Pending",  items: pending,  color: "#F59E0B", icon: Clock         },
    { key: "today",    label: "Today",    items: today,    color: "#3B82F6", icon: CalendarDays   },
    { key: "upcoming", label: "Upcoming", items: upcoming, color: "#8B5CF6", icon: ChevronRight   },
  ];

  const totalOverdue  = overdue.length;
  const grandTotal    = overdue.length + pending.length + today.length + upcoming.length;
  const hasActiveFilters = moduleFilter !== "all" || dateFrom || dateTo || (isSalesHead && selectedUser !== "all");

  const resetFilters = () => { setSelectedUser("all"); setModuleFilter("all"); setDateFrom(""); setDateTo(""); };

  const SEL = { fontSize: 12, fontWeight: 600, border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", background: "var(--surface-2)", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>

      {/* ── Header ── */}
      <div style={{ padding: "13px 18px", borderBottom: filtersOpen ? "none" : "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Activity size={15} style={{ color: "#6366F1" }} strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>ORG Activities</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
              {grandTotal > 0 ? `${grandTotal} open · ${totalOverdue > 0 ? `${totalOverdue} overdue` : "none overdue"}` : "All clear — no open activities"}
            </div>
          </div>
          {totalOverdue > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.1)", padding: "3px 10px", borderRadius: 99, border: "1px solid rgba(239,68,68,0.2)", flexShrink: 0 }}>
              <AlertTriangle size={10} strokeWidth={2.5} /> {totalOverdue} Overdue
            </span>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          {/* Filter toggle */}
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${hasActiveFilters ? "#6366F1" : "var(--border)"}`, background: hasActiveFilters ? "rgba(99,102,241,0.08)" : "var(--surface-2)", color: hasActiveFilters ? "#6366F1" : "var(--text-2)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
          >
            <Signal size={12} strokeWidth={2} /> Filters {hasActiveFilters && `(active)`}
          </button>

          {/* Grid / Workload toggle (admins only) */}
          {isSalesHead && (
            <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
              {[{ k: "grid", l: "Grid" }, { k: "workload", l: "Workload" }].map((v) => (
                <button key={v.k} onClick={() => setView(v.k)}
                  style={{ padding: "6px 13px", fontSize: 11.5, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", background: view === v.k ? "#6366F1" : "var(--surface-2)", color: view === v.k ? "#fff" : "var(--text-muted)", transition: "all 0.12s" }}>
                  {v.l}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Filter Bar (expandable) ── */}
      {filtersOpen && (
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Team member filter — admins only */}
          {isSalesHead && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Assigned To</label>
              <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} style={SEL}>
                <option value="all">All Team</option>
                <option value={profile?.id}>My Activities</option>
                {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          )}

          {/* Module type filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Module</label>
            <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} style={SEL}>
              <option value="all">All Modules</option>
              <option value="pipeline">Pipeline</option>
              <option value="lead">Leads</option>
              <option value="deal">Deals</option>
              <option value="meeting">Meetings</option>
            </select>
          </div>

          {/* Date from */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>From Date</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              style={{ ...SEL, padding: "5px 10px", minWidth: 130 }} />
          </div>

          {/* Date to */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>To Date</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              style={{ ...SEL, padding: "5px 10px", minWidth: 130 }} />
          </div>

          {/* Reset */}
          {hasActiveFilters && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "transparent", userSelect: "none" }}>_</label>
              <button onClick={resetFilters}
                style={{ ...SEL, color: "#EF4444", borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", display: "flex", alignItems: "center", gap: 5 }}>
                <X size={11} strokeWidth={2.5} /> Reset
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Body ── */}
      {view === "workload" && isSalesHead ? (
        <TeamWorkloadTable rows={workloadRows} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {COLS.map((col, i) => (
            <div key={col.key} style={{ borderRight: i < COLS.length - 1 ? "1px solid var(--border)" : "none" }}>
              <ActivityColumn
                col={col}
                expanded={expandedCols[col.key]}
                onToggle={() => setExpandedCols((p) => ({ ...p, [col.key]: !p[col.key] }))}
                navigate={navigate}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── My Activities Widget ──────────────────────────────────────────────── */
function MyActivitiesWidget({ tasks = [], activities = [], navigate, dragHandleProps, collapsed, onToggle }) {
  const merged = useMemo(() => {
    const t = tasks.filter((t) => !["done","cancelled"].includes(t.status)).map((t) => ({ ...t, _source: "task" }));
    const a = activities.map((a) => ({ ...a, _source: "activity" }));
    const all = [...t, ...a];
    all.sort((a, b) => {
      if (!a.due_date) return 1; if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
    return all.slice(0, 10);
  }, [tasks, activities]);

  return (
    <Widget
      id="my-activities" title="My Activities" sub={`${merged.length} open`}
      icon={Activity} iconColor={C.blue.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/activities" navigate={navigate}
      noPad
    >
      {merged.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>
          <CheckCircle2 size={22} style={{ color: "#10B981", marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
          All activities complete!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {merged.map((item, i) => {
            const isActivity = item._source === "activity";
            const typeKey    = isActivity ? resolveActType(item.type) : null;
            const actCfg     = typeKey ? ACT_TYPES[typeKey] : null;
            const isOverdue  = item.due_date && isPast(new Date(item.due_date));
            const pc         = isOverdue ? "#EF4444" : (actCfg?.color || { urgent: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#22C55E" }[item.priority] || "#6B7280");
            const ActIcon    = actCfg?.icon || ListChecks;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(getContextRoute(item))}
                style={{
                  display: "flex", alignItems: "center", gap: 0,
                  borderBottom: i < merged.length - 1 ? "1px solid var(--border)" : "none",
                  cursor: "pointer", overflow: "hidden",
                  background: isOverdue ? "rgba(239,68,68,0.02)" : "transparent",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isOverdue ? "rgba(239,68,68,0.02)" : "transparent"; }}
              >
                <div style={{ width: 3, alignSelf: "stretch", background: pc, flexShrink: 0 }} />
                <div style={{ width: 28, height: 28, borderRadius: 7, background: `${pc}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, margin: "10px 10px 10px 10px" }}>
                  <ActIcon size={12} style={{ color: pc }} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: "10px 12px 10px 0" }}>
                  {item.lead?.company_name ? (
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.lead.company_name}{item.lead.contact_name ? ` — ${item.lead.contact_name}` : ""}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                  )}
                  {(item.assigned_profile || item.created_by_profile) && (
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>
                      👤 {(item.assigned_profile || item.created_by_profile).full_name}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    {actCfg && <span style={{ color: actCfg.color, fontWeight: 700 }}>{actCfg.short || actCfg.label}</span>}
                    {item.due_date && <span style={{ color: isOverdue ? "#EF4444" : "var(--text-muted)" }}>
                      {isOverdue ? "Overdue · " : ""}{format(new Date(item.due_date), "MMM d, h:mm a")}
                    </span>}
                  </div>
                </div>
                <div style={{ padding: "0 12px 0 0", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {item.priority && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: pc, background: `${pc}14`, padding: "2px 6px", borderRadius: 99, textTransform: "capitalize" }}>
                      {item.priority}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </Widget>
  );
}

/* ─── Pipeline Health Widget ─────────────────────────────────────────────── */
function PipelineWidget({ deals = [], navigate, dragHandleProps, collapsed, onToggle, formatCompact }) {
  const STAGES = [
    { key: "new",               label: "New",        color: "#6B7280" },
    { key: "contacted",         label: "Contacted",  color: "#3B82F6" },
    { key: "meeting_scheduled", label: "Meeting",    color: "#8B5CF6" },
    { key: "proposal_sent",     label: "Proposal",   color: "#F59E0B" },
    { key: "negotiation",       label: "Negotiation",color: "#F97316" },
    { key: "won",               label: "Won",        color: "#10B981" },
  ];
  const total = deals.length || 1;
  const hotLeads = deals.filter((d) => !["won","lost"].includes(d.stage)).length;
  return (
    <Widget
      id="pipeline" title="Pipeline Health" sub={`${hotLeads} active deals`}
      icon={LayoutDashboard} iconColor={C.purple.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/deals" navigate={navigate}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {STAGES.map((s) => {
          const count = deals.filter((d) => d.stage === s.key).length;
          const val   = deals.filter((d) => d.stage === s.key).reduce((sum, d) => sum + (Number(d.value) || 0), 0);
          const pct   = Math.round((count / total) * 100);
          return (
            <div key={s.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                  <span style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 500 }}>{s.label}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {val > 0 && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatCompact(val)}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{count}</span>
                </div>
              </div>
              <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 99 }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: [0.4,0,0.2,1] }}
                  style={{ height: "100%", background: s.color, borderRadius: 99 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Widget>
  );
}

/* ─── Upcoming Meetings Widget ─────────────────────────────────────────── */
function MeetingsWidget({ meetings = [], navigate, dragHandleProps, collapsed, onToggle }) {
  const upcoming = meetings.filter((m) => new Date(m.start_time) >= new Date()).slice(0, 5);
  return (
    <Widget
      id="meetings" title="Upcoming Meetings" sub={`${upcoming.length} scheduled`}
      icon={CalendarDays} iconColor={C.teal.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/meetings" navigate={navigate}
      noPad
    >
      {!upcoming.length ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          <CalendarDays size={20} style={{ opacity: 0.4, display: "block", margin: "0 auto 6px" }} />
          No upcoming meetings
        </div>
      ) : upcoming.map((m, i) => {
        const d     = new Date(m.start_time);
        const label = isToday(d) ? `Today · ${format(d, "h:mm a")}` : isTomorrow(d) ? `Tomorrow · ${format(d, "h:mm a")}` : format(d, "EEE, MMM d · h:mm a");
        const isVirtual = (m.type || "").includes("virtual") || (m.title || "").toLowerCase().includes("virtual");
        const MIcon = isVirtual ? Video : Users;
        const mColor = isVirtual ? C.indigo.solid : C.teal.solid;
        return (
          <div key={m.id}
            onClick={() => navigate("/meetings")}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: i < upcoming.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer", transition: "background 0.1s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${mColor}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MIcon size={13} style={{ color: mColor }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={9} /> {label}
              </div>
            </div>
            {m.status && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: m.status === "completed" ? "#10B981" : "#F59E0B", background: m.status === "completed" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>
                {m.status}
              </span>
            )}
          </div>
        );
      })}
    </Widget>
  );
}

/* ─── Stale Deals / Closing Soon Widget ─────────────────────────────────── */
function StaleDealsWidget({ deals = [], navigate, dragHandleProps, collapsed, onToggle, formatCompact }) {
  const stale = useMemo(() => {
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const closingSoon = deals.filter((d) => !["won","lost"].includes(d.stage) && d.close_date && new Date(d.close_date) <= in7);
    const staleItems  = deals.filter((d) => {
      if (["won","lost"].includes(d.stage)) return false;
      return Math.floor((Date.now() - new Date(d.updated_at || d.created_at).getTime()) / 86400000) >= 5;
    }).sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
    const merged = [...closingSoon, ...staleItems.filter((d) => !closingSoon.find((c) => c.id === d.id))];
    return merged.slice(0, 5);
  }, [deals]);

  const count = stale.length;
  return (
    <Widget
      id="stale-deals" title="Deals Needing Action"
      sub={count ? `${count} require attention` : "All deals active"}
      icon={AlertTriangle} iconColor={count ? "#EF4444" : "#10B981"}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/deals" navigate={navigate}
      noPad
    >
      {!count ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "#10B981", fontSize: 12 }}>
          <CheckCircle2 size={20} style={{ display: "block", margin: "0 auto 6px" }} />
          All deals are active
        </div>
      ) : stale.map((d, i) => {
        const days = Math.floor((Date.now() - new Date(d.updated_at || d.created_at).getTime()) / 86400000);
        const isRed = days >= 7 || (d.close_date && new Date(d.close_date) < new Date());
        const bc = isRed ? "#EF4444" : "#F59E0B";
        return (
          <div key={d.id} onClick={() => navigate(`/deals?selected=${d.id}`)}
            style={{ display: "flex", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: i < stale.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer", borderLeft: `3px solid ${bc}`, background: `${bc}04`, transition: "background 0.1s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${bc}08`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = `${bc}04`; }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingLeft: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.company_name || d.title}</div>
              <div style={{ fontSize: 10.5, color: bc, marginTop: 2, fontWeight: 600 }}>
                {d.close_date && new Date(d.close_date) < new Date() ? `Close date overdue` : `No activity ${days}d`}
              </div>
            </div>
            {d.value && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#10B981", flexShrink: 0 }}>{formatCompact(d.value)}</span>}
            <AlertTriangle size={11} style={{ color: bc, flexShrink: 0, marginLeft: 8 }} />
          </div>
        );
      })}
    </Widget>
  );
}

/* ─── Team Activity Feed Widget ──────────────────────────────────────────── */
function TeamFeedWidget({ activities = [], navigate, dragHandleProps, collapsed, onToggle }) {
  const TYPE_COLORS = {
    call: "#3B82F6", follow_up_call: "#F59E0B", follow_up_email: "#6366F1",
    email: "#EC4899", meeting_virtual: "#8B5CF6", meeting_person: "#7C3AED",
    note: "#10B981", whatsapp: "#25D366", whatsapp_follow_up: "#16A34A",
    meeting: "#8B5CF6", followup: "#F59E0B", follow_up: "#F59E0B",
  };
  const TYPE_LABELS = {
    call: "Call", follow_up_call: "Follow-Up Call", follow_up_email: "Follow-Up Email",
    email: "Email", meeting_virtual: "Virtual Meeting", meeting_person: "In-Person Meeting",
    note: "Note", whatsapp: "WhatsApp", whatsapp_follow_up: "WhatsApp Follow-up",
    meeting: "Meeting", followup: "Follow-up", follow_up: "Follow-up",
  };
  const STATUS_COLORS = { done: "#10B981", in_progress: "#3B82F6", todo: "#F59E0B" };

  return (
    <Widget
      id="team-feed" title="Team Activity" sub="Live updates"
      icon={Users} iconColor={C.blue.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/activities" navigate={navigate}
      noPad
    >
      {!activities.length ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          No recent activity
        </div>
      ) : activities.slice(0, 8).map((a, i) => {
        const color = TYPE_COLORS[a.type] || "var(--text-muted)";
        const typeLabel = TYPE_LABELS[a.type] || a.type;
        const company = a.lead?.company_name || null;
        const contact = a.lead?.contact_name || null;
        const employee = a.assigned_profile?.full_name || a.created_by_profile?.full_name || a.user?.full_name || "";
        const statusColor = STATUS_COLORS[a.status] || "#6B7280";
        const statusLabel = a.status === "done" ? "Completed" : a.status === "in_progress" ? "In Progress" : "Pending";
        const dateStr = a.created_at ? format(new Date(a.created_at), "dd-MMM-yyyy hh:mm a") : "";
        const route = a.lead_id ? `/leads?selected=${a.lead_id}` : a.deal_id ? `/deals?selected=${a.deal_id}` : "/activities";

        return (
          <div key={a.id}
            onClick={() => navigate(route)}
            style={{ display: "flex", gap: 0, padding: "12px 16px", borderBottom: i < Math.min(activities.length, 8) - 1 ? "1px solid var(--border)" : "none", borderLeft: `3px solid ${color}`, cursor: "pointer", transition: "background 0.1s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingLeft: 10 }}>
              {/* Company — Contact */}
              {(company || contact) ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 3, flexWrap: "wrap" }}>
                  {company && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{company}</span>}
                  {contact && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>— {contact}</span>}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
              )}
              {/* Employee */}
              {employee && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>👤 {employee}</div>}
              {/* Type + Status */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}14`, padding: "2px 7px", borderRadius: 99 }}>{typeLabel}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: statusColor, background: `${statusColor}14`, padding: "2px 7px", borderRadius: 99 }}>{statusLabel}</span>
                {dateStr && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{dateStr}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </Widget>
  );
}

/* ─── AI Insights Widget ─────────────────────────────────────────────────── */
function InsightsWidget({ stats, tasks, activities, dragHandleProps, collapsed, onToggle }) {
  const insights = useMemo(() => {
    const list = [];
    if (!stats) return list;
    if (stats.hotLeads > 0)         list.push({ icon: Flame,       color: C.orange.solid, text: `${stats.hotLeads} hot lead${stats.hotLeads > 1 ? "s" : ""} need immediate action — schedule demos this week.` });
    if (stats.conversionRate < 15)  list.push({ icon: AlertCircle, color: C.rose.solid,   text: `Conversion at ${stats.conversionRate}%. Focus on lead qualification to improve close rate.` });
    if (stats.conversionRate >= 20) list.push({ icon: TrendingUp,  color: C.green.solid,  text: `${stats.conversionRate}% conversion is above benchmark — excellent performance!` });
    if (stats.pendingTasks > 5)     list.push({ icon: ListChecks,  color: C.amber.solid,  text: `${stats.pendingTasks} open tasks blocking pipeline. Clear backlog to accelerate.` });
    if (stats.monthlyGrowth > 0)    list.push({ icon: ArrowUp,     color: C.green.solid,  text: `Lead volume up ${stats.monthlyGrowth}% vs last month.` });
    if (stats.monthlyGrowth < 0)    list.push({ icon: AlertCircle, color: C.amber.solid,  text: `Lead volume fell ${Math.abs(stats.monthlyGrowth)}%. Review outreach channels.` });
    list.push({ icon: Sparkles, color: C.indigo.solid, text: `Deals with follow-up within 48h close 3× more often.` });
    return list.slice(0, 3);
  }, [stats]);

  return (
    <Widget
      id="insights" title="AI Insights" sub="Data-driven recommendations"
      icon={Sparkles} iconColor={C.violet?.solid || "#7C3AED"}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {insights.map((ins, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
            style={{ display: "flex", gap: 10, padding: "9px 11px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${ins.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ins.icon size={12} style={{ color: ins.color }} strokeWidth={2} />
            </div>
            <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55, margin: 0 }}>{ins.text}</p>
          </motion.div>
        ))}
      </div>
    </Widget>
  );
}

/* ─── Leaderboard Widget ─────────────────────────────────────────────────── */
function LeaderboardWidget({ teamPerf, dragHandleProps, collapsed, onToggle, navigate }) {
  const sorted = useMemo(() => (teamPerf || []).sort((a, b) => b.won - a.won).slice(0, 5), [teamPerf]);
  const maxWon = sorted[0]?.won || 1;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <Widget
      id="leaderboard" title="Team Leaderboard" sub="Ranked by won deals"
      icon={Trophy} iconColor={C.amber.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/team" navigate={navigate}
      noPad
    >
      {!sorted.length ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>No team data</div>
      ) : sorted.map((p, i) => (
        <div key={p.id || p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: i < sorted.length - 1 ? "1px solid var(--border)" : "none", background: i === 0 ? "rgba(245,158,11,0.03)" : "transparent" }}>
          <div style={{ width: 18, fontSize: 13, textAlign: "center", flexShrink: 0 }}>
            {medals[i] || <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>#{i+1}</span>}
          </div>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${C.blue.solid}, ${C.indigo.solid})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
            {p.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            <div style={{ height: 3, background: "var(--surface-3)", borderRadius: 2, marginTop: 4 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(p.won / maxWon) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.07 }} style={{ height: "100%", borderRadius: 2, background: i === 0 ? C.amber.solid : C.blue.solid }} />
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? C.amber.solid : "var(--text)", flexShrink: 0 }}>{p.won}</span>
        </div>
      ))}
    </Widget>
  );
}

/* ─── Revenue Chart Widget ─────────────────────────────────────────────── */
function RevenueWidget({ revenueData = [], monthlyLeads = [], dragHandleProps, collapsed, onToggle, navigate, symbol }) {
  const chartData = (revenueData || []).map((r) => ({
    month: r.month ? format(new Date(r.month + "-01"), "MMM") : r.month,
    revenue: r.revenue || 0,
  }));
  return (
    <Widget
      id="revenue" title="Revenue Trend" sub="Monthly overview"
      icon={IndianRupee} iconColor={C.green.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/reports" navigate={navigate}
    >
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.green.solid} stopOpacity={0.25} />
              <stop offset="100%" stopColor={C.green.solid} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => [`${symbol}${Number(v).toLocaleString()}`, "Revenue"]} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }} />
          <Area type="monotone" dataKey="revenue" stroke={C.green.solid} strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </Widget>
  );
}

/* ─── DSR Snapshot Widget ─────────────────────────────────────────────── */
function DSRSnapshotWidget({ userId, navigate, dragHandleProps, collapsed, onToggle }) {
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd   = endOfDay(new Date()).toISOString();

  const { data: todayActs = [] } = useQuery({
    queryKey: ["dsr-snap-acts", userId],
    queryFn: async () => {
      const { data } = await supabase.from("activities")
        .select("id, type")
        .or(`created_by.eq.${userId},user_id.eq.${userId}`)
        .gte("created_at", todayStart).lte("created_at", todayEnd)
        .neq("type", "email_contact");
      return data || [];
    },
    enabled: !!userId, refetchInterval: 30000,
  });

  const typeCounts = useMemo(() => {
    const map = {};
    todayActs.forEach((a) => { const k = resolveActType(a.type); map[k] = (map[k] || 0) + 1; });
    return map;
  }, [todayActs]);

  const total = todayActs.length;
  const score = Math.min(100, Math.round(Math.min(total * 8, 50) + 50));
  const scoreColor = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <Widget
      id="dsr-snapshot" title="DSR Today" sub={format(new Date(), "EEEE, MMM d")}
      icon={Zap} iconColor="#6366F1"
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/dsr" navigate={navigate}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {/* Score ring */}
        <div style={{ position: "relative", width: 60, height: 60, flexShrink: 0 }}>
          <svg width={60} height={60} style={{ position: "absolute", inset: 0 }}>
            <circle cx={30} cy={30} r={24} fill="none" stroke="var(--border)" strokeWidth={4} />
            <circle cx={30} cy={30} r={24} fill="none" stroke={scoreColor} strokeWidth={4}
              strokeDasharray={`${(score / 100) * 150.8} 150.8`}
              strokeLinecap="round" transform="rotate(-90 30 30)"
              style={{ transition: "stroke-dasharray 0.8s ease", filter: `drop-shadow(0 0 4px ${scoreColor}60)` }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 7.5, color: "var(--text-muted)", fontWeight: 700 }}>SCORE</span>
          </div>
        </div>
        {/* Activity type pills */}
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {Object.entries(ACT_TYPES).map(([key, cfg]) => {
            const cnt = typeCounts[key] || 0;
            const Icon = cfg.icon;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, background: cnt ? `${cfg.color}12` : "var(--surface-2)", border: `1px solid ${cnt ? cfg.color + "30" : "var(--border)"}` }}>
                <Icon size={9} style={{ color: cnt ? cfg.color : "var(--text-muted)" }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: cnt ? cfg.color : "var(--text-muted)" }}>{cnt}</span>
                <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>{cfg.short}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Widget>
  );
}

/* ─── Inactive Lead Alerts Widget ──────────────────────────────────────── */
function InactiveLeadAlertsWidget({ navigate, dragHandleProps, collapsed, onToggle }) {
  const { profile, getToken, isOwner, isSalesHead, isFieldUser } = useAuth();
  const [assignModal,    setAssignModal]    = useState(null); // { leadId, leadName }
  const [assignTo,       setAssignTo]       = useState("");
  const [assigning,      setAssigning]      = useState(false);
  const [empLeadsModal,  setEmpLeadsModal]  = useState(null); // { empId, empName }
  const [empLeads,       setEmpLeads]       = useState([]);
  const [empLeadsLoading, setEmpLeadsLoading] = useState(false);

  const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

  const { data: inactiveData, isLoading, refetch } = useQuery({
    queryKey: ["inactive-lead-summary", profile?.id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API}/api/leads/inactive-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load inactive leads");
      return res.json();
    },
    enabled: !!profile?.id,
    staleTime: 0,
    refetchInterval: 60 * 1000,
  });

  const { data: teamData } = useQuery({
    queryKey: ["team-all"],
    queryFn: () => teamService.getAll(),
    enabled: !!(isOwner || isSalesHead),
    staleTime: 10 * 60 * 1000,
  });

  const counts            = inactiveData?.counts            || { warning7: 0, warning25: 0, autoUnassigned: 0 };
  const myLeads           = inactiveData?.myLeads            || [];
  const unassignedLeads   = inactiveData?.unassignedLeads    || [];
  const teamWarnings      = inactiveData?.teamWarnings       || [];
  const employeeBreakdown = inactiveData?.employeeBreakdown  || [];
  const totalIssues       = counts.warning7 + counts.warning25 + counts.autoUnassigned;
  const isManager     = !isFieldUser && !(isOwner || isSalesHead);

  const assignableMembers = (teamData?.data || []).filter(m =>
    ["sales_rep", "sales_rep", "sales_manager"].includes(m.role)
  );

  const handleAssign = async () => {
    if (!assignTo || !assignModal) return;
    setAssigning(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/leads/${assignModal.leadId}/reassign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: assignTo }),
      });
      if (!res.ok) throw new Error("Reassignment failed");
      toast.success("Lead reassigned");
      setAssignModal(null);
      setAssignTo("");
      refetch();
    } catch (err) {
      toast.error(err.message || "Failed to reassign");
    } finally {
      setAssigning(false);
    }
  };

  const openEmpLeads = async (emp) => {
    setEmpLeadsModal({ empId: emp.id, empName: emp.full_name });
    setEmpLeads([]);
    setEmpLeadsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/leads/inactive-by-employee/${emp.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setEmpLeads(await res.json());
    } catch {}
    setEmpLeadsLoading(false);
  };

  const daysAgo = (ts) => ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : null;

  const StatusBadge = ({ status, lastTs }) => {
    const d     = daysAgo(lastTs);
    const text  = d !== null ? `${d}d inactive` : "No activity";
    const color = status === "warning_25" ? "#F97316" : "#F59E0B";
    const bg    = status === "warning_25" ? "#FFF7ED" : "#FFFBEB";
    return (
      <span style={{ fontSize: 10.5, fontWeight: 700, color, background: bg, padding: "2px 8px", borderRadius: 99, flexShrink: 0 }}>
        {text}
      </span>
    );
  };

  return (
    <Widget
      id="inactive-leads"
      title="Inactive Lead Alerts"
      sub={totalIssues > 0 ? `${totalIssues} lead${totalIssues !== 1 ? "s" : ""} need attention` : "All assigned leads are active"}
      icon={AlertTriangle}
      iconColor="#F59E0B"
      collapsed={collapsed}
      onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      noPad
    >
      {isLoading ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12.5, color: "var(--text-muted)" }}>Loading...</div>
      ) : (
        <div style={{ padding: "12px 16px" }}>
          {/* ── Stat pills ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: totalIssues > 0 ? 14 : 0 }}>
            {[
              { label: "7d Reminder",     value: counts.warning7,       color: "#F59E0B" },
              { label: "25d Warning",     value: counts.warning25,      color: "#F97316" },
              { label: "Auto-Unassigned", value: counts.autoUnassigned, color: "#EF4444" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: `${color}10`, border: `1px solid ${color}25`, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontWeight: 600, marginTop: 3, lineHeight: 1.3 }}>{label}</div>
              </div>
            ))}
          </div>

          {totalIssues === 0 ? (
            <div style={{ textAlign: "center", padding: "10px 0 4px", fontSize: 12, color: "var(--text-muted)" }}>
              No inactive lead alerts. Great work!
            </div>
          ) : (
            <>
              {/* Employee view: my inactive leads */}
              {isFieldUser && myLeads.length > 0 && (
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>My Inactive Leads</div>
                  {myLeads.slice(0, 5).map(lead => (
                    <div key={lead.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lead.company_name || lead.contact_name || "—"}
                        </div>
                        {lead.company_name && lead.contact_name && (
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{lead.contact_name}</div>
                        )}
                      </div>
                      <StatusBadge status={lead.inactivity_status} lastTs={lead.last_activity_at} />
                      <button
                        onClick={() => navigate(`/leads?selected=${lead.id}`)}
                        style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontSize: 11, color: "var(--text-2)", fontFamily: "inherit" }}
                      >
                        View
                      </button>
                    </div>
                  ))}
                  {myLeads.length > 5 && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
                      +{myLeads.length - 5} more —{" "}
                      <span onClick={() => navigate("/leads")} style={{ color: "var(--accent)", cursor: "pointer" }}>view all</span>
                    </div>
                  )}
                </div>
              )}

              {/* Owner/SalesHead view: auto-unassigned leads */}
              {(isOwner || isSalesHead) && unassignedLeads.length > 0 && (
                <div style={{ marginTop: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Auto-Unassigned — Reassign Now</div>
                  {unassignedLeads.slice(0, 6).map(lead => (
                    <div key={lead.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lead.company_name || lead.contact_name || "—"}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                          Prev: {lead.prev_profile?.full_name || "Unknown"} · {lead.last_activity_at ? `${daysAgo(lead.last_activity_at)}d inactive` : "No activity"}
                        </div>
                      </div>
                      <button
                        onClick={() => { setAssignModal({ leadId: lead.id, leadName: lead.company_name || lead.contact_name || "Lead" }); setAssignTo(""); }}
                        style={{ background: "#4F46E5", border: "none", borderRadius: 7, padding: "4px 11px", cursor: "pointer", fontSize: 11.5, color: "#fff", fontFamily: "inherit", fontWeight: 600, flexShrink: 0 }}
                      >
                        Assign
                      </button>
                    </div>
                  ))}
                  {unassignedLeads.length > 6 && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
                      +{unassignedLeads.length - 6} more unassigned leads
                    </div>
                  )}
                </div>
              )}

              {/* Owner/SalesHead: employee-wise inactive lead distribution */}
              {(isOwner || isSalesHead) && employeeBreakdown.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Employee Distribution</div>
                  {employeeBreakdown.slice(0, 8).map(emp => (
                    <div key={emp.id} onClick={() => openEmpLeads(emp)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)", cursor: "pointer", borderRadius: 6, transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.full_name}</div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        {emp.warning7 > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "1px 6px", borderRadius: 99 }}>{emp.warning7}×7d</span>
                        )}
                        {emp.warning25 > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#F97316", background: "#FFF7ED", border: "1px solid #FED7AA", padding: "1px 6px", borderRadius: 99 }}>{emp.warning25}×25d</span>
                        )}
                        {emp.autoUnassigned > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", background: "#FEF2F2", border: "1px solid #FECACA", padding: "1px 6px", borderRadius: 99 }}>{emp.autoUnassigned}×off</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 700, minWidth: 16, textAlign: "right" }}>{emp.total}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Manager view: team warnings summary */}
              {isManager && teamWarnings.length > 0 && (
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Team Inactive Leads</div>
                  {teamWarnings.slice(0, 6).map(lead => (
                    <div key={lead.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lead.company_name || lead.contact_name || "—"}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{lead.assigned_profile?.full_name || "Unassigned"}</div>
                      </div>
                      <StatusBadge status={lead.inactivity_status} lastTs={lead.last_activity_at} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Reassign modal — portalled to avoid overflow:hidden clipping ── */}
      {assignModal && createPortal(
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          onClick={(e) => e.target === e.currentTarget && setAssignModal(null)}
        >
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 24, width: 340, border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 4 }}>Reassign Lead</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>{assignModal.leadName}</div>
            <select
              value={assignTo}
              onChange={e => setAssignTo(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", marginBottom: 16 }}
            >
              <option value="">Select employee...</option>
              {assignableMembers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setAssignModal(null)}
                style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "var(--text-2)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!assignTo || assigning}
                style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: "#4F46E5", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, opacity: (!assignTo || assigning) ? 0.6 : 1 }}
              >
                {assigning ? "Assigning..." : "Assign Lead"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Employee inactive leads modal ── */}
      {empLeadsModal && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setEmpLeadsModal(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: 560, maxWidth: "100%", maxHeight: "80vh", overflow: "auto", border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", flex: 1 }}>
                Inactive Leads — {empLeadsModal.empName}
              </span>
              <button onClick={() => setEmpLeadsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {empLeadsLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>Loading leads…</div>
            ) : empLeads.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>No inactive leads found for this employee.</div>
            ) : (
              empLeads.map(lead => {
                const days = daysAgo(lead.last_activity_at);
                const statusColor = lead.inactivity_status === "auto_unassigned" ? "#EF4444" : lead.inactivity_status === "warning_25" ? "#F97316" : "#F59E0B";
                const statusLabel = lead.inactivity_status === "auto_unassigned" ? "Auto-Unassigned" : lead.inactivity_status === "warning_25" ? "25d Warning" : "7d Reminder";
                return (
                  <div key={lead.id} style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>{lead.company_name || lead.contact_name || "—"}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: "#fff", border: `1px solid ${statusColor}`, padding: "1px 7px", borderRadius: 99 }}>{statusLabel}</span>
                        </div>
                        {lead.company_name && lead.contact_name && (
                          <div style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>{lead.contact_name}</div>
                        )}
                        <div style={{ fontSize: 11.5, color: "#B45309", marginTop: 5, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <span>Last activity: <strong>{days !== null ? `${days}d ago` : "Never"}</strong></span>
                          {lead.stage && <span>Stage: <strong style={{ textTransform: "capitalize" }}>{lead.stage.replace(/_/g, " ")}</strong></span>}
                        </div>
                      </div>
                      <button
                        onClick={() => { setEmpLeadsModal(null); navigate(`/leads?selected=${lead.id}`); }}
                        style={{ flexShrink: 0, padding: "5px 13px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Open
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </Widget>
  );
}

/* ─── Quick Add Modal ──────────────────────────────────────────────────── */
function QuickAddModal({ type, onClose, profile, qc, navigate }) {
  const { symbol } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", company_name: "", value: "", priority: "medium", due_date: "", notes: "", start_time: "" });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (type === "add_prospect") {
        await leadsService.create({ company_name: form.title || "New Prospect", stage: "pipeline", pipeline_stage: "new_prospect", created_by: profile?.id, assigned_to: profile?.id });
        qc.invalidateQueries({ queryKey: ["pipeline"] });
        toast.success("Prospect added!"); navigate("/pipeline");
      } else if (type === "add_task") {
        await supabase.from("tasks").insert({ title: form.title, priority: form.priority, due_date: form.due_date || null, status: "todo", assigned_to: profile?.id, created_by: profile?.id });
        qc.invalidateQueries({ queryKey: ["my-tasks"] });
        toast.success("Task created!");
      } else if (type === "schedule_meeting") {
        if (!form.start_time) { toast.error("Start time required"); setSaving(false); return; }
        await meetingsService.create({ title: form.title || "Meeting", start_time: new Date(form.start_time).toISOString(), notes: form.notes || null, status: "scheduled", created_by: profile?.id });
        qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
        toast.success("Meeting scheduled!");
      }
      onClose();
    } catch (err) { toast.error(err.message || "Failed"); }
    finally { setSaving(false); }
  };

  const titles = { add_prospect: "Add Prospect", add_task: "Quick Add Task", schedule_meeting: "Schedule Meeting" };
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ type: "spring", damping: 22, stiffness: 300 }} style={{ maxWidth: 440 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{titles[type]}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {type === "add_prospect" && (
            <div><label className="crm-label">Prospect / Company Name *</label>
              <input className="crm-input" required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Acme Corp" /></div>
          )}
          {type === "add_task" && (<>
            <div><label className="crm-label">Task Title *</label>
              <input className="crm-input" required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs to be done?" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label className="crm-label">Priority</label>
                <select className="crm-input" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                  {["urgent","high","medium","low"].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select></div>
              <div><label className="crm-label">Due Date</label>
                <input className="crm-input" type="datetime-local" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
            </div>
          </>)}
          {type === "schedule_meeting" && (<>
            <div><label className="crm-label">Meeting Title *</label>
              <input className="crm-input" required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Discovery call" /></div>
            <div><label className="crm-label">Start Time *</label>
              <input className="crm-input" type="datetime-local" required value={form.start_time} onChange={(e) => set("start_time", e.target.value)} /></div>
            <div><label className="crm-label">Notes</label>
              <textarea className="crm-input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Agenda..." style={{ resize: "none" }} /></div>
          </>)}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Create"}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ─── Widget definitions ─────────────────────────────────────────────────── */
// "my-activities" removed — OrgActivitiesCenter above the grid already covers it
const OWNER_WIDGETS    = ["pipeline","meetings","stale-deals","team-feed","insights","leaderboard","revenue","dsr-snapshot","inactive-leads"];
const MANAGER_WIDGETS  = ["pipeline","meetings","stale-deals","team-feed","insights","leaderboard","revenue","dsr-snapshot","inactive-leads"];
const FIELD_WIDGETS    = ["dsr-snapshot","meetings","pipeline","insights","inactive-leads"];

/* ─── Main Dashboard ──────────────────────────────────────────────────── */
export default function Dashboard() {
  const { profile }              = useAuth();
  const { formatCompact, symbol } = useCurrency();
  const navigate                 = useNavigate();
  const qc                       = useQueryClient();

  const normRole    = (profile?.role || "").toLowerCase().replace(/[- ]/g, "_");
  const isFieldUser = ["sales_rep", "sales_rep"].includes(normRole);
  const isManager   = ["sales_manager", "admin", "owner"].includes(normRole);
  const isSalesHead = ["admin", "owner"].includes(normRole);
  const isOwner     = normRole === "owner" || normRole === "admin";

  const defaultWidgets = isSalesHead ? OWNER_WIDGETS : isManager ? MANAGER_WIDGETS : FIELD_WIDGETS;
  const { order, setOrder, collapsed, toggleCollapse } = useWidgetPrefs(profile?.id || "guest", defaultWidgets);
  const [activeId, setActiveId] = useState(null);
  const [quickModal, setQuickModal] = useState(null);
  const [showLeadModal, setShowLeadModal] = useState(false);

  /* ── Data queries ── */
  const { data: stats, isLoading }   = useQuery({ queryKey: ["dashboard-stats"],   queryFn: analyticsService.getDashboardStats,    refetchInterval: 30000, staleTime: 0 });
  const { data: revenueData = [] }   = useQuery({ queryKey: ["monthly-revenue"],   queryFn: () => analyticsService.getMonthlyRevenue(6) });
  const { data: monthlyLeads = [] }  = useQuery({ queryKey: ["monthly-leads"],     queryFn: () => analyticsService.getMonthlyLeads(6) });
  const { data: upcomingMeetings = [] } = useQuery({ queryKey: ["upcoming-meetings"], queryFn: () => meetingsService.getUpcoming(8), staleTime: 0, refetchOnMount: "always", refetchInterval: 60000 });
  const { data: recentActivity = [] }   = useQuery({ queryKey: ["recent-activity"],   queryFn: () => analyticsService.getRecentActivity(12) });
  const { data: teamPerf = [] }         = useQuery({ queryKey: ["team-performance"],  queryFn: analyticsService.getTeamPerformance });
  const { data: tasks } = useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => tasksService.getAll({ assignedTo: profile?.id }),
    enabled: !!profile?.id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const { data: _allActivities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: actService.getAll,
    enabled: !!profile?.id,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const pendingActivities = useMemo(
    () => _allActivities.filter((a) => { const ds = deriveStatus(a); return ds !== "completed" && ds !== "cancelled"; }).map((a) => ({ ...a, _source: "activity" })),
    [_allActivities]
  );
  const completedActivities = useMemo(
    () => _allActivities.filter((a) => deriveStatus(a) === "completed").map((a) => ({ ...a, _source: "activity" })),
    [_allActivities]
  );

  const { data: dealsData = [] }  = useQuery({ queryKey: ["deals-all"], queryFn: () => supabase.from("deals").select("id, stage, value, company_name, title, close_date, updated_at, created_at, assigned_to").then((r) => r.data || []) });
  const { data: myDeals = [] }    = useQuery({ queryKey: ["my-deals", profile?.id], queryFn: () => supabase.from("deals").select("id, stage, value, company_name, title, close_date, updated_at").eq("assigned_to", profile.id).order("updated_at", { ascending: false }).limit(10).then((r) => r.data || []), enabled: !!profile?.id });
  const { data: teamData = [] }   = useQuery({ queryKey: ["team-all"], queryFn: () => teamService.getAll() });
  const { data: lockSetting }     = useQuery({ queryKey: ["crm-setting-phone-email-lock"], queryFn: async () => { const { data } = await supabase.from("crm_settings").select("value").eq("key", "phone_email_lock").single(); return data?.value === "true"; }, staleTime: 60000 });

  /* ── Real-time subscriptions ── */
  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase.channel("dash-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        qc.invalidateQueries({ queryKey: ["activities"] });
        qc.invalidateQueries({ queryKey: ["recent-activity"] });
        qc.invalidateQueries({ queryKey: ["dsr-snap-acts", profile.id] });
        qc.invalidateQueries({ queryKey: ["inactive-lead-summary"] });
        qc.invalidateQueries({ queryKey: ["deals-all"] });
        qc.invalidateQueries({ queryKey: ["my-deals", profile.id] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["my-tasks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["deals-all"] });
        qc.invalidateQueries({ queryKey: ["my-deals", profile.id] });
        qc.invalidateQueries({ queryKey: ["activities"] });
        qc.invalidateQueries({ queryKey: ["my-tasks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["activities"] });
        qc.invalidateQueries({ queryKey: ["my-tasks"] });
        qc.invalidateQueries({ queryKey: ["recent-activity"] });
        qc.invalidateQueries({ queryKey: ["inactive-lead-summary"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => {
        qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
        qc.invalidateQueries({ queryKey: ["activities"] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, qc]);

  /* ── Smart activity reminders ── */
  // Shows a non-intrusive toast when the user has overdue or today-due activities.
  // Throttled to once every 2 hours via sessionStorage so it never spams.
  const reminderFiredRef = useRef(false);
  useEffect(() => {
    if (reminderFiredRef.current || !pendingActivities.length || !profile?.id) return;

    const overdueItems = pendingActivities.filter(
      (a) => deriveStatus(a) === "overdue"
    );
    const todayItems = pendingActivities.filter(
      (a) => a.due_date && isToday(new Date(a.due_date))
    );

    if (overdueItems.length === 0 && todayItems.length === 0) return;

    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const lastShown = parseInt(sessionStorage.getItem(`crm_reminder_${profile.id}`) || "0", 10);
    if (Date.now() - lastShown < TWO_HOURS) return;

    reminderFiredRef.current = true;

    const timer = setTimeout(() => {
      sessionStorage.setItem(`crm_reminder_${profile.id}`, String(Date.now()));

      const parts = [
        overdueItems.length && `${overdueItems.length} overdue`,
        todayItems.length  && `${todayItems.length} due today`,
      ].filter(Boolean).join(" · ");

      toast(
        (t) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 260, maxWidth: 300 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertCircle size={14} style={{ color: "#EF4444" }} strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Activity Reminder</span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "#4B5563", lineHeight: 1.5 }}>
              <strong style={{ color: "#EF4444" }}>{parts}</strong>
              {" "}— please review and take action.
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => { toast.dismiss(t.id); navigate("/activities"); }}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 700, background: "#EF4444", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                Open Activities
              </button>
              <button
                onClick={() => toast.dismiss(t.id)}
                style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, background: "#F3F4F6", color: "#6B7280", border: "1px solid #E5E7EB", cursor: "pointer", fontFamily: "inherit" }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ),
        { duration: 12000, position: "bottom-right", style: { padding: "14px 16px", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" } }
      );
    }, 4000); // 4-second delay after page load — not intrusive

    return () => clearTimeout(timer);
  }, [pendingActivities, profile?.id, navigate]);

  /* ── Orphan cleanup (owner only) ── */
  useEffect(() => {
    if (!isOwner || !profile?.id) return;
    (async () => {
      try {
        const { data: converted } = await supabase.from("leads").select("id").eq("stage", "converted");
        if (converted?.length) {
          const ids = converted.map((l) => l.id);
          const { data: linked } = await supabase.from("deals").select("lead_id").in("lead_id", ids);
          const linkedSet = new Set((linked || []).map((d) => d.lead_id));
          const orphanLeads = ids.filter((id) => !linkedSet.has(id));
          if (orphanLeads.length) await supabase.from("leads").update({ stage: "new", updated_at: new Date().toISOString() }).in("id", orphanLeads);
        }
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      } catch { /* non-critical */ }
    })();
  }, [isOwner, profile?.id]);

  /* ── Derived data ── */
  const myTasks    = (tasks?.data || []).filter((t) => !["done","completed","cancelled","archived"].includes(t.status));
  const pipeDeals  = isFieldUser ? myDeals : dealsData;
  const teamFeed   = isFieldUser ? recentActivity.filter((a) => a.created_by === profile?.id || a.user_id === profile?.id) : recentActivity;

  const myActivitiesCount = myTasks.length + pendingActivities.length;
  const todayActCount     = recentActivity.filter((a) => (a.created_by === profile?.id || a.user_id === profile?.id) && isToday(new Date(a.created_at))).length;

  const fieldKPIs = [
    { label: "My Activities",  value: myActivitiesCount,           color: "#EF4444", to: null },
    { label: "Active Deals",   value: (myDeals.filter((d) => !["won","lost"].includes(d.stage))).length, color: "#3B82F6", to: "/deals" },
    { label: "Done Today",     value: todayActCount,               color: "#22C55E", to: "/activities" },
    { label: "Meetings",       value: (upcomingMeetings || []).length, color: "#8B5CF6", to: "/meetings" },
  ];

  /* ── DnD sensors ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveId(null);
    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const oldIdx = prev.indexOf(active.id);
        const newIdx = prev.indexOf(over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }, [setOrder]);

  const isOwnerOrHeadDash   = ["owner", "admin"].includes(profile?.role);
  const canEditContactInfo   = isOwnerOrHeadDash || !(lockSetting ?? false);

  const createLeadMutation = useMutation({
    mutationFn: leadsService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); toast.success("Lead added!"); setShowLeadModal(false); },
    onError: (e) => toast.error("Failed: " + e.message),
  });

  /* ── Widget renderer ── */
  const renderWidget = (id, dragHandleProps) => {
    const props = { key: id, id, collapsed: collapsed.has(id), onToggle: toggleCollapse, dragHandleProps, navigate };
    switch (id) {
      case "my-activities":
        return <MyActivitiesWidget {...props} tasks={myTasks} activities={pendingActivities} />;
      case "pipeline":
        return <PipelineWidget {...props} deals={pipeDeals} formatCompact={formatCompact} />;
      case "meetings":
        return <MeetingsWidget {...props} meetings={upcomingMeetings} />;
      case "stale-deals":
        return <StaleDealsWidget {...props} deals={pipeDeals} formatCompact={formatCompact} />;
      case "team-feed":
        return isManager ? <TeamFeedWidget {...props} activities={teamFeed} /> : null;
      case "insights":
        return <InsightsWidget {...props} stats={stats} tasks={myTasks} activities={recentActivity} />;
      case "leaderboard":
        return isManager ? <LeaderboardWidget {...props} teamPerf={teamPerf} /> : null;
      case "revenue":
        return isSalesHead ? <RevenueWidget {...props} revenueData={revenueData} monthlyLeads={monthlyLeads} symbol={symbol} /> : null;
      case "dsr-snapshot":
        return <DSRSnapshotWidget {...props} userId={profile?.id} />;
      case "inactive-leads":
        return <InactiveLeadAlertsWidget {...props} />;
      default: return null;
    }
  };

  /* ── Sales Command Center — derived metrics ─────────────────────────────── */
  const openDealRows = (dealsData || []).filter((d) => !["won", "lost"].includes(d.stage));
  const pipelineValue = openDealRows.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const now = Date.now();
  const staleDeals = openDealRows
    .filter((d) => d.updated_at && now - new Date(d.updated_at).getTime() > 14 * 864e5)
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
  const closingSoon = openDealRows
    .filter((d) => d.close_date && new Date(d.close_date).getTime() - now < 7 * 864e5 && new Date(d.close_date).getTime() > now - 864e5)
    .sort((a, b) => new Date(a.close_date) - new Date(b.close_date));
  const overdueActs = (pendingActivities || []).filter((a) => a.due_date && new Date(a.due_date).getTime() < startOfDay(new Date()).getTime());
  const dueTodayActs = (pendingActivities || []).filter((a) => a.due_date && isToday(new Date(a.due_date)));
  const firstName = (profile?.full_name || "there").split(" ")[0];

  const KPIS = [
    { label: "Revenue won", value: `${symbol}${formatCompact(stats?.revenue || 0)}`, delta: stats?.monthlyGrowth, to: "/analytics" },
    { label: "Pipeline value", value: `${symbol}${formatCompact(pipelineValue)}`, sub: `${openDealRows.length} open`, to: "/pipeline" },
    { label: "Open deals", value: stats?.activeDeals ?? 0, to: "/deals" },
    { label: "Win rate", value: `${stats?.conversionRate ?? 0}%`, to: "/analytics" },
    { label: "Pending tasks", value: myTasks.length, sub: overdueActs.length ? `${overdueActs.length} overdue` : null, to: "/tasks" },
  ];

  const attention = [
    { icon: AlertTriangle, tone: "var(--red)", label: "Overdue activities", count: overdueActs.length, to: "/activities" },
    { icon: Clock, tone: "var(--amber)", label: "Deals closing this week", count: closingSoon.length, to: "/deals" },
    { icon: TrendingDown, tone: "var(--amber)", label: "Stale deals (14d+ no update)", count: staleDeals.length, to: "/deals" },
    { icon: CalendarCheck, tone: "var(--accent)", label: "Activities due today", count: dueTodayActs.length, to: "/activities" },
  ].filter((a) => a.count > 0);

  const trend = (revenueData || []).map((r) => ({ m: r.label || r.month || "", v: Number(r.revenue || r.value || 0) }));

  return (
    <div style={{ padding: "26px 28px 48px", maxWidth: 1360, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>Sales command center</div>
          <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.025em", color: "var(--text)", margin: 0 }}>{getGreeting()}, {firstName}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={() => navigate("/reports")}><FileText size={14} /> Reports</button>
          {isSalesHead && <button className="btn-primary" onClick={() => setShowLeadModal(true)}><Plus size={15} /> New lead</button>}
          <button className="btn-primary" onClick={() => setQuickModal("schedule_meeting")} style={isSalesHead ? { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border-2)", boxShadow: "none" } : undefined}>
            <CalendarPlus size={15} /> Meeting
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden", marginBottom: 22 }}>
        {KPIS.map((k) => (
          <button key={k.label} onClick={() => navigate(k.to)} style={{ background: "var(--surface)", border: "none", padding: "16px 18px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, transition: "background .14s" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "var(--surface)"}>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 }}>{k.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>{isLoading ? "—" : k.value}</span>
            <span style={{ fontSize: 11, color: k.sub?.includes("overdue") ? "var(--red)" : "var(--text-muted)", minHeight: 14, fontFamily: k.sub ? "var(--font-mono)" : "inherit" }}>
              {k.sub || (typeof k.delta === "number" ? `${k.delta >= 0 ? "▲" : "▼"} ${Math.abs(k.delta)}% mo` : "")}
            </span>
          </button>
        ))}
      </div>

      {/* Two-column workspace */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 18, alignItems: "start" }}>

        {/* LEFT */}
        <div style={{ display: "grid", gap: 18 }}>
          {/* Needs your attention */}
          <section className="card" style={{ padding: 0 }}>
            <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={15} style={{ color: "var(--accent)" }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--text)" }}>Needs your attention</h2>
            </div>
            {attention.length === 0 ? (
              <div className="empty-state" style={{ padding: "40px 24px" }}>
                <CheckCircle2 />
                <h3>You're all caught up</h3>
                <p>No overdue work, stale deals, or deadlines this week.</p>
              </div>
            ) : (
              <div>
                {attention.map((a) => (
                  <button key={a.label} onClick={() => navigate(a.to)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <a.icon size={15} style={{ color: a.tone }} />
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{a.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: a.tone }}>{a.count}</span>
                    <ChevronRight size={15} style={{ color: "var(--text-muted)" }} />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Revenue trend */}
          {isSalesHead && trend.length > 1 && (
            <section className="card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Revenue trend</h2>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>last {trend.length} mo</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trend} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${symbol}${formatCompact(v)}`, "Revenue"]} />
                  <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2} fill="url(#dashRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </section>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ display: "grid", gap: 18 }}>
          {/* Upcoming meetings */}
          <section className="card" style={{ padding: 0 }}>
            <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}><CalendarDays size={15} style={{ color: "var(--accent)" }} /> Upcoming</h2>
              <button className="btn-ghost" onClick={() => navigate("/meetings")} style={{ fontSize: 12 }}>All</button>
            </div>
            {(upcomingMeetings || []).length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 20px" }}><CalendarDays /><h3>No meetings scheduled</h3><p>Your calendar is clear.</p></div>
            ) : (upcomingMeetings.slice(0, 5).map((m) => (
              <button key={m.id} onClick={() => navigate("/meetings")} style={{ width: "100%", display: "flex", gap: 11, padding: "12px 18px", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", fontWeight: 500, flexShrink: 0, width: 44, paddingTop: 2 }}>
                  {m.start_time ? format(new Date(m.start_time), "HH:mm") : "--:--"}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title || "Meeting"}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.start_time ? format(new Date(m.start_time), "EEE d MMM") : ""}</span>
                </span>
              </button>
            )))}
          </section>

          {/* Recent activity */}
          <section className="card" style={{ padding: 0 }}>
            <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Activity size={15} style={{ color: "var(--accent)" }} /> Recent activity</h2>
            </div>
            {(recentActivity || []).length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 20px" }}><Activity /><h3>Nothing logged yet</h3><p>Activity from your team shows up here.</p></div>
            ) : (recentActivity.slice(0, 7).map((a, i) => (
              <div key={a.id || i} style={{ display: "flex", gap: 11, padding: "11px 18px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginTop: 6, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>{a.description || a.title || a.type}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{a.created_at ? format(new Date(a.created_at), "d MMM · HH:mm") : ""}</span>
                </span>
              </div>
            )))}
          </section>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showLeadModal && (
          <LeadModal
            onClose={() => setShowLeadModal(false)}
            onSave={async (data) => { await createLeadMutation.mutateAsync({ ...data, created_by: profile?.id }); }}
            canEditContactInfo={canEditContactInfo}
            teamMembers={teamData?.data || []}
          />
        )}
        {(quickModal === "add_prospect" || quickModal === "add_task" || quickModal === "schedule_meeting") && (
          <QuickAddModal type={quickModal} onClose={() => setQuickModal(null)} profile={profile} qc={qc} navigate={navigate} />
        )}
      </AnimatePresence>
    </div>
  );
}
