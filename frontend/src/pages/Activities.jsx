import { Fragment, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import EmailComposerModal from "../components/EmailComposerModal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { db as supabase } from "../lib/db";
import { getAccessToken } from "../lib/session";
import { teamService } from "../services/teamService";
import { leadsService } from "../services/leadsService";
import { dealsService } from "../services/dealsService";
import Targets from "./Targets";
import EmailActivityLog from "../components/EmailActivityLog";
import EmailCommunicationCenter from "../components/EmailCommunicationCenter";
import toast from "react-hot-toast";
import { AUTO_COMPLETED_TYPES, CLOSED_STATUSES, deriveStatus } from "../utils/activityStatus";
import {
  Plus, Search, Pencil, Trash2, X, Phone, Mail, FileText, Bell,
  Video, RefreshCw, Clock, Columns, CalendarDays,
  Flag, Circle, CheckCircle2, AlertCircle, SlidersHorizontal,
  CalendarClock, PhoneCall, Send, CheckCheck, ChevronLeft, ChevronRight,
  GripVertical, Link2, ArrowUpRight, RotateCcw, TrendingUp,
  ChevronDown, Users, Download, Upload, Target, Activity, MessageCircle,
  Zap, Star, Coffee, Building2,
} from "lucide-react";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

// ─── Constants ────────────────────────────────────────────────────────────────

// Standard types (shown in create form + filter pills) — matches activityTypes.js
const ACT_TYPES = {
  follow_up_call:  { label: "Follow-up Call",   icon: PhoneCall,    color: "#F59E0B", bg: "#FFFBEB",  border: "#FDE68A" },
  follow_up_email: { label: "Follow-up Email",  icon: Mail,         color: "#6366F1", bg: "#EEF2FF",  border: "#C7D2FE" },
  call:            { label: "Call",              icon: Phone,        color: "#3B82F6", bg: "#EFF6FF",  border: "#BFDBFE" },
  email:           { label: "Email",             icon: Mail,         color: "#EC4899", bg: "#FDF2F8",  border: "#F9A8D4" },
  meeting_virtual: { label: "Virtual Meeting",   icon: Video,        color: "#8B5CF6", bg: "#F5F3FF",  border: "#DDD6FE" },
  meeting_person:  { label: "In-Person Meeting", icon: Users,        color: "#7C3AED", bg: "#F5F3FF",  border: "#DDD6FE" },
  note:               { label: "Note",                 icon: FileText,     color: "#10B981", bg: "#ECFDF5",  border: "#A7F3D0" },
  whatsapp:           { label: "WhatsApp",             icon: MessageCircle, color: "#25D366", bg: "#F0FDF4",  border: "#86EFAC" },
  whatsapp_follow_up: { label: "WhatsApp Follow-up",   icon: MessageCircle, color: "#16A34A", bg: "#DCFCE7",  border: "#4ADE80" },
  break:              { label: "Break",                icon: Coffee,        color: "#64748B", bg: "#F8FAFC",  border: "#CBD5E1" },
  // Legacy types — kept for rendering old DB records
  meeting:         { label: "Meeting",           icon: Video,        color: "#8B5CF6", bg: "#F5F3FF",  border: "#DDD6FE" },
  followup:        { label: "Follow-up",         icon: RefreshCw,    color: "#F59E0B", bg: "#FFFBEB",  border: "#FDE68A" },
  follow_up:       { label: "Follow-up",         icon: RefreshCw,    color: "#F59E0B", bg: "#FFFBEB",  border: "#FDE68A" },
  reminder:        { label: "Reminder",          icon: Bell,         color: "#EF4444", bg: "#FEF2F2",  border: "#FECACA" },
  task:            { label: "Task",              icon: CheckCircle2, color: "#06B6D4", bg: "#ECFEFF",  border: "#A5F3FC" },
};

// Ordered list shown in the create form type selector and filter pills
const DISPLAY_TYPES = ["follow_up_call", "follow_up_email", "email", "call", "break", "meeting_person", "meeting_virtual", "note"];

const DB_TYPE_MAP = {
  "Cold Call": "call", "Demo": "call",
  "Introductory": "call", "Verification": "call", "Other": "call",
  "Meeting": "meeting", "Virtual Meeting": "meeting_virtual",
  "Follow-up Task": "followup", "Follow-up": "followup",
  "Note": "note", "Email": "email", "Reminder": "reminder", "Proposal Sent": "task",
};
const typeKey = (t) => DB_TYPE_MAP[t] || t || "task";

// Manual statuses shown in the form dropdown (auto-computed ones — scheduled/due_today/overdue — are derived from due_date)
const STATUSES = [
  { key: "scheduled",          label: "Scheduled",          color: "#3B82F6", bg: "#EFF6FF", icon: CalendarClock },
  { key: "rescheduled",        label: "Rescheduled",        color: "#8B5CF6", bg: "#F5F3FF", icon: RotateCcw    },
  { key: "completed",          label: "Completed",          color: "#10B981", bg: "#ECFDF5", icon: CheckCircle2 },
  { key: "cancelled",          label: "Cancelled",          color: "#9CA3AF", bg: "#F9FAFB", icon: X            },
  { key: "no_response",        label: "No Response",        color: "#EA580C", bg: "#FFF7ED", icon: Phone        },
  { key: "follow_up_required", label: "Follow-up Required", color: "#D97706", bg: "#FFFBEB", icon: RefreshCw    },
];

// Full display config — covers every possible derived status value, including legacy DB values
const STATUS_CONFIG = {
  scheduled:          { label: "Scheduled",          color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", icon: CalendarClock },
  due_today:          { label: "Due Today",          color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: AlertCircle   },
  overdue:            { label: "Overdue",            color: "#EF4444", bg: "#FEF2F2", border: "#FECACA", icon: AlertCircle   },
  rescheduled:        { label: "Rescheduled",        color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE", icon: RotateCcw     },
  completed:          { label: "Completed",          color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", icon: CheckCircle2  },
  cancelled:          { label: "Cancelled",          color: "#9CA3AF", bg: "#F9FAFB", border: "#E5E7EB", icon: X             },
  no_response:        { label: "No Response",        color: "#EA580C", bg: "#FFF7ED", border: "#FED7AA", icon: Phone         },
  follow_up_required: { label: "Follow-up Required", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: RefreshCw     },
  // Legacy DB values — backward compat for existing records
  done:        { label: "Completed",   color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", icon: CheckCircle2  },
  todo:        { label: "Scheduled",   color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", icon: CalendarClock },
  in_progress: { label: "In Progress", color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", icon: Clock         },
  pending:     { label: "Pending",     color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", icon: Clock         },
};
const STATUS_MAP = STATUS_CONFIG;

const FILTER_STATUSES = [
  { key: "scheduled",          label: "Scheduled",          color: "#3B82F6", bg: "#EFF6FF", icon: CalendarClock, desc: "Planned for a future date"  },
  { key: "due_today",          label: "Due Today",          color: "#D97706", bg: "#FFFBEB", icon: AlertCircle,   desc: "Scheduled for today"        },
  { key: "overdue",            label: "Overdue",            color: "#EF4444", bg: "#FEF2F2", icon: AlertCircle,   desc: "Past due, not completed"    },
  { key: "rescheduled",        label: "Rescheduled",        color: "#8B5CF6", bg: "#F5F3FF", icon: RotateCcw,     desc: "Moved to another date"      },
  { key: "completed",          label: "Completed",          color: "#10B981", bg: "#ECFDF5", icon: CheckCircle2,  desc: "Successfully finished"      },
  { key: "cancelled",          label: "Cancelled",          color: "#9CA3AF", bg: "#F9FAFB", icon: X,             desc: "No longer required"         },
  { key: "no_response",        label: "No Response",        color: "#EA580C", bg: "#FFF7ED", icon: Phone,         desc: "No customer response"       },
  { key: "follow_up_required", label: "Follow-up Required", color: "#D97706", bg: "#FFFBEB", icon: RefreshCw,     desc: "Needs another follow-up"    },
];

const PRIORITIES = [
  { key: "low",    label: "Low",    color: "#6B7280" },
  { key: "medium", label: "Medium", color: "#F59E0B" },
  { key: "high",   label: "High",   color: "#EF4444" },
  { key: "urgent", label: "Urgent", color: "#7C3AED" },
];
const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));

const SMART_FILTERS = [
  { key: "today",           label: "Today",             color: "#3B82F6", bg: "#EFF6FF", icon: CalendarDays,  desc: "Due or created today"         },
  { key: "meetings_today",  label: "Meetings Today",    color: "#8B5CF6", bg: "#F5F3FF", icon: Video,         desc: "Meetings scheduled today"     },
  { key: "meetings_all",    label: "All Meetings",      color: "#7C3AED", bg: "#F5F3FF", icon: Video,         desc: "All meeting activities"       },
  { key: "follow_ups_due",  label: "Follow-ups Due",    color: "#F59E0B", bg: "#FFFBEB", icon: PhoneCall,     desc: "Pending follow-ups"           },
  { key: "calls",           label: "Calls",             color: "#3B82F6", bg: "#EFF6FF", icon: Phone,         desc: "All call activities"          },
  { key: "high_priority",   label: "High Priority",     color: "#EF4444", bg: "#FEF2F2", icon: Zap,           desc: "Urgent or high priority"      },
  { key: "lead_updates",    label: "Lead Activities",   color: "#10B981", bg: "#ECFDF5", icon: TrendingUp,    desc: "Activities linked to leads"   },
  { key: "deal_updates",    label: "Deal Activities",   color: "#F59E0B", bg: "#FFFBEB", icon: Target,        desc: "Activities linked to deals"   },
  { key: "recent",          label: "Recently Added",    color: "#0EA5E9", bg: "#F0F9FF", icon: Star,          desc: "Added in the last 24 hours"   },
  { key: "pipeline_changes",label: "Pipeline Changes",  color: "#7C3AED", bg: "#F5F3FF", icon: Activity,      desc: "Stage change activities"      },
];

const ROLE_RANK = { owner: 4, sales_head: 3, sales_manager: 2, employee: 1, inside_sales: 1 };

const CALL_SUB_TYPES  = ["Cold Call", "Follow-up", "Demo", "Introductory", "Verification", "Other"];
const CALL_RESPONSES  = ["Interested", "Not Interested", "Call Back", "No Response", "Busy", "Wrong Number", "Meeting Scheduled"];

// ─── Service ──────────────────────────────────────────────────────────────────

export const actService = {
  async getAll() {
    const token = await getAccessToken();
    const res = await fetch(`${API}/api/activities?limit=500`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch activities");
    const json = await res.json();
    return json.data || [];
  },
  async create(payload) {
    const token = await getAccessToken();
    const res = await fetch(`${API}/api/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to create activity"); }
    return res.json();
  },
  async update(id, payload) {
    const token = await getAccessToken();
    const res = await fetch(`${API}/api/activities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to update activity"); }
    return res.json();
  },
  async delete(id) {
    const token = await getAccessToken();
    const res = await fetch(`${API}/api/activities/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to delete activity"); }
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseJSON = (s) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const toJSON    = (o) => JSON.stringify(o);

// Strip activity-type prefix from title so Description doesn't duplicate Activity Type
// e.g. "Follow-up Call: Not answered" → "Not answered"
function cleanDescription(title, actType) {
  if (!title) return "";
  const def = ACT_TYPES[typeKey(actType)];
  if (!def) return title;
  const prefixes = [def.label + ": ", def.label + "- ", def.label + " - "];
  for (const p of prefixes) {
    if (title.startsWith(p)) return title.slice(p.length).trim();
  }
  // Also strip if title IS exactly the type label
  if (title.trim().toLowerCase() === def.label.toLowerCase()) return "";
  return title;
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((dt.setHours(0,0,0,0) - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

function fmtIST(d, showTime = false) {
  if (!d) return "—";
  const opts = { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" };
  if (showTime) { opts.hour = "2-digit"; opts.minute = "2-digit"; opts.hour12 = true; }
  return new Date(d).toLocaleString("en-IN", opts);
}

function initials(name) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function groupByTimeline(activities) {
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const nextWeek  = new Date(today); nextWeek.setDate(today.getDate() + 7);
  const groups    = { overdue: [], today: [], tomorrow: [], upcoming: [], later: [], yesterday: [], earlier: [], completed: [] };

  activities.forEach((a) => {
    if (a.status === "done") { groups.completed.push(a); return; }

    if (a.due_date) {
      const d = new Date(a.due_date); d.setHours(0,0,0,0);
      if      (d < today)                               groups.overdue.push(a);
      else if (d.getTime() === today.getTime())         groups.today.push(a);
      else if (d.getTime() === tomorrow.getTime())      groups.tomorrow.push(a);
      else if (d < nextWeek)                            groups.upcoming.push(a);
      else                                              groups.later.push(a);
    } else {
      // No due_date — group by created_at so nothing falls into a "No Date" void
      const cd = a.created_at ? new Date(a.created_at) : null;
      if (!cd) { groups.earlier.push(a); return; }
      const day = new Date(cd); day.setHours(0,0,0,0);
      if      (day.getTime() === today.getTime())     groups.today.push(a);
      else if (day.getTime() === yesterday.getTime()) groups.yesterday.push(a);
      else                                            groups.earlier.push(a);
    }
  });

  groups.completed.sort((a, b) => new Date(b.updated_at||b.created_at) - new Date(a.updated_at||a.created_at));
  groups.earlier.sort((a, b) => new Date(b.created_at||0) - new Date(a.created_at||0));
  return groups;
}

// ─── Status Engine ────────────────────────────────────────────────────────────
// AUTO_COMPLETED_TYPES, CLOSED_STATUSES, deriveStatus now live in ../utils/activityStatus
// (shared with Dashboard.jsx so both pages agree on activity status derivation).

// ─── Group Activities By Entity (Company + POC) ───────────────────────────────
function groupActivitiesByEntity(activities) {
  const groups = new Map();
  for (const a of activities) {
    const key = a.lead_id
      ? String(a.lead_id)
      : a.deal_id
      ? `deal:${a.deal_id}`
      : a.related_id
      ? `${a.related_type || "other"}:${a.related_id}`
      : `solo:${a.id}`;
    if (!groups.has(key)) {
      groups.set(key, { key, companyName: a.lead?.company_name || null, pocName: a.lead?.contact_name || null, events: [], latestEvent: null, latestDate: null });
    }
    const g = groups.get(key);
    g.events.push(a);
    if (!g.companyName && a.lead?.company_name) g.companyName = a.lead.company_name;
    if (!g.pocName     && a.lead?.contact_name) g.pocName     = a.lead.contact_name;
    const d = new Date(a.created_at || 0);
    if (!g.latestDate || d > new Date(g.latestDate)) { g.latestDate = a.created_at; g.latestEvent = a; }
  }

  for (const g of groups.values()) {
    // Sort events: newest first
    g.events.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // Open = not auto-completed AND not in a closed status (done/completed/cancelled)
    const openEvents = g.events.filter(a => !AUTO_COMPLETED_TYPES.has(a.type) && !CLOSED_STATUSES.has(a.status));

    g.currentActivity = openEvents.length > 0 ? openEvents[0] : null;
    g.openEvents      = openEvents;
    g.completedEvents = g.events.filter(a => {
      if (AUTO_COMPLETED_TYPES.has(a.type)) return true;
      const s = a.status || "";
      return s === "done" || s === "completed" || s === "cancelled";
    });

    if (g.currentActivity) {
      g.effectiveStatus = deriveStatus(g.currentActivity); // "overdue" | "pending"
    } else {
      g.effectiveStatus = "completed"; // No open events → all done
    }
  }

  // Sort: most urgent first, then newest-first within bucket
  const PRIORITY = { overdue: 0, due_today: 1, no_response: 2, follow_up_required: 3, rescheduled: 4, scheduled: 5, pending: 5, completed: 9, cancelled: 9 };
  return Array.from(groups.values()).sort((a, b) => {
    const pa = PRIORITY[a.effectiveStatus] ?? 6;
    const pb = PRIORITY[b.effectiveStatus] ?? 6;
    if (pa !== pb) return pa - pb;
    return new Date(b.latestDate || 0) - new Date(a.latestDate || 0);
  });
}

// ─── Micro Components ─────────────────────────────────────────────────────────

function Avatar({ user, size = 24 }) {
  if (!user) return null;
  return user.avatar_url
    ? <img src={user.avatar_url} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} alt="" />
    : <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials(user.full_name)}</div>;
}

function TypeBadge({ type }) {
  const def  = ACT_TYPES[typeKey(type)] || ACT_TYPES.task;
  const Icon = def.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: def.bg, color: def.color, border: `1px solid ${def.border}`, whiteSpace: "nowrap" }}>
      <Icon size={10} strokeWidth={2} />{def.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s    = STATUS_MAP[status] || STATUS_MAP.todo;
  const Icon = s.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      <Icon size={10} strokeWidth={2.2} />{s.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const p = PRIORITY_MAP[priority?.toLowerCase()] || PRIORITY_MAP.medium;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${p.color}12`, color: p.color, border: `1px solid ${p.color}30`, whiteSpace: "nowrap" }}>
      <Flag size={9} fill={p.color} />{p.label}
    </span>
  );
}

// ─── Activity Card ────────────────────────────────────────────────────────────

function ActivityCard({ activity, onEdit, onDelete, onStatusChange, resolveEntity, resolveEntityFull }) {
  const navigate  = useNavigate();
  const { profile } = useAuth();
  const myRank      = ROLE_RANK[profile?.role] || 0;
  const isOwn       = activity.created_by === profile?.id || activity.assigned_to === profile?.id;
  const canEdit     = isOwn || myRank >= 3; // owner(4) / sales_head(3) can edit anyone's
  const canDelete   = profile?.role === "owner" || profile?.role === "admin";
  const def         = ACT_TYPES[typeKey(activity.type)] || ACT_TYPES.task;
  const Icon        = def.icon;
  const desc        = parseJSON(activity.description);
  const notes       = desc.remarks || desc.notes || desc.outcome || desc.agenda || desc.body || "";
  const derived     = deriveStatus(activity);
  const isDone      = derived === "completed" || derived === "cancelled";
  const isOverdue   = derived === "overdue";
  const isDueToday  = derived === "due_today";
  const entity      = resolveEntity(activity.related_type, activity.related_id);
  const { company, contact } = resolveEntityFull ? resolveEntityFull(activity) : { company: null, contact: null };

  const statusCfg   = STATUS_CONFIG[derived] || STATUS_CONFIG.scheduled;
  const accentColor = statusCfg.color;
  const cleanedDesc = cleanDescription(activity.title, activity.type);
  const bodyText    = notes || cleanedDesc || activity.title;

  // Datetime display
  const createdStr = activity.created_at
    ? new Date(activity.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const assignedPerson = (activity.assigned_profile || activity.created_by_profile);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      style={{
        background: "#FFFFFF",
        border: `1.5px solid ${isOverdue ? "#FECACA" : isDone ? "#D1FAE5" : "#E5E7EB"}`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: 14,
        padding: "18px 20px",
        boxShadow: isDone ? "0 1px 4px rgba(0,0,0,0.04)" : isOverdue ? "0 2px 12px rgba(239,68,68,0.08)" : "0 2px 8px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.18s, transform 0.18s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.09)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = isDone ? "0 1px 4px rgba(0,0,0,0.04)" : isOverdue ? "0 2px 12px rgba(239,68,68,0.08)" : "0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "none"; }}
    >
      {/* ── ROW 1: Company + Contact + Actions ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {(company || contact) ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
                {company || "—"}
              </span>
              {contact && (
                <>
                  <span style={{ fontSize: 13, color: "#CBD5E1", fontWeight: 400 }}>·</span>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: "#64748B" }}>{contact}</span>
                </>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activity.title}
            </div>
          )}
        </div>

        {/* Actions — hidden for completed/cancelled (immutable history) */}
        {!isDone && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {canEdit && (
              <button title="Mark done" onClick={(e) => { e.stopPropagation(); onStatusChange(activity.id, "done"); }}
                style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #A7F3D0", background: "#ECFDF5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669", transition: "all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#059669"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "#059669"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#ECFDF5"; e.currentTarget.style.color = "#059669"; e.currentTarget.style.borderColor = "#A7F3D0"; }}>
                <CheckCircle2 size={13} />
              </button>
            )}
            {canEdit && (
              <button title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(activity); }}
                style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", transition: "all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#F1F5F9"; e.currentTarget.style.borderColor = "#CBD5E1"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.borderColor = "#E2E8F0"; }}>
                <Pencil size={12} />
              </button>
            )}
            {canDelete && (
              <button title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(activity.id); }}
                style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444", transition: "all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#EF4444"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "#EF4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.borderColor = "#FECACA"; }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── ROW 2: Type badge + Assigned Employee ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: def.bg, color: def.color, border: `1px solid ${def.border || def.color + "30"}` }}>
          <Icon size={10} strokeWidth={2} />{def.label}
        </span>
        {assignedPerson && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Avatar user={assignedPerson} size={16} />
            <span style={{ fontSize: 11.5, color: "#64748B", fontWeight: 500 }}>{assignedPerson.full_name}</span>
          </span>
        )}
      </div>

      {/* ── ROW 3: Description ── */}
      {bodyText && bodyText !== def.label && (
        <div style={{ fontSize: 13, color: "#374151", marginBottom: 12, lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {bodyText}
        </div>
      )}

      {/* ── ROW 4: Status chip + Date + Entity link ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border || statusCfg.color + "30"}` }}>
          {isOverdue ? <AlertCircle size={9} strokeWidth={2.5} /> : isDone ? <CheckCircle2 size={9} strokeWidth={2.5} /> : <Clock size={9} strokeWidth={2.5} />}
          {statusCfg.label}
        </span>
        {createdStr && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
            <CalendarClock size={10} />{createdStr}
          </span>
        )}
        {entity && (
          <button
            title={`Go to ${activity.related_type}`}
            onClick={(e) => { e.stopPropagation(); if (activity.related_type === "lead") navigate(`/leads`); else if (activity.related_type === "deal") navigate(`/deals`); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", cursor: "pointer", whiteSpace: "nowrap", transition: "background 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#DBEAFE"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#EFF6FF"; }}>
            <Link2 size={9} />{activity.related_type === "lead" ? "Lead" : "Deal"}: {entity}<ArrowUpRight size={9} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Conversation Event Row (inside expanded GroupedConversationCard) ─────────

function ConversationEventRow({ event, isLast, onEdit, onDelete, onStatusChange }) {
  const { profile } = useAuth();
  const myRank    = ROLE_RANK[profile?.role] || 0;
  const isOwn     = event.created_by === profile?.id || event.assigned_to === profile?.id;
  const canEdit   = isOwn || myRank >= 3;
  const canDelete = profile?.role === "owner" || profile?.role === "admin";

  const def      = ACT_TYPES[typeKey(event.type)] || ACT_TYPES.task;
  const Icon     = def.icon;
  const derived  = deriveStatus(event);
  const isDone    = derived === "completed" || derived === "cancelled";
  const isOverdue = derived === "overdue";

  const desc     = parseJSON(event.description);
  const notes    = desc.remarks || desc.notes || desc.outcome || desc.agenda || desc.body || "";
  const bodyText = notes || cleanDescription(event.title, event.type) || event.title;

  // Current Activity Date = when the activity was logged (created_at — system-set, never user-editable)
  const currentActDate = event.created_at;
  // Next Activity Date = user-selected follow-up date stored in next_follow_up_date
  const nextActDate    = event.next_follow_up_date || null;

  const statusCfg = STATUS_CONFIG[derived] || STATUS_CONFIG.scheduled;

  const assignedPerson = event.assigned_profile || event.created_by_profile;

  return (
    <div style={{ display: "flex", gap: 12, paddingTop: 12, paddingBottom: isLast ? 4 : 16, borderBottom: isLast ? "none" : "1px solid #F1F5F9" }}>
      {/* Timeline connector */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: isDone ? `${def.color}10` : `${def.color}18`, border: `1.5px solid ${def.color}${isDone ? "25" : "40"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={13} style={{ color: def.color }} strokeWidth={2} />
        </div>
        {!isLast && <div style={{ width: 1.5, flex: 1, minHeight: 10, background: "#E2E8F0", marginTop: 4 }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Type label + Status chip */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: def.color }}>{def.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border || statusCfg.color + "25"}` }}>{statusCfg.label}</span>
            </div>

            {/* Current Activity Date */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", minWidth: 118 }}>Activity Date</span>
              <span style={{ fontSize: 11.5, color: "#475569", fontWeight: 600 }}>
                {currentActDate
                  ? new Date(currentActDate).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
                  : "—"}
              </span>
            </div>

            {/* Description / Notes */}
            {bodyText && bodyText !== def.label && (
              <div style={{ fontSize: 12.5, color: "#4B5563", lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", marginBottom: 5 }}>{bodyText}</div>
            )}

            {/* Next Activity Date — only when set */}
            {nextActDate && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", minWidth: 118 }}>Next Follow-up</span>
                <span style={{ fontSize: 11.5, color: "#6366F1", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <CalendarClock size={10} />{fmtIST(nextActDate)}
                </span>
              </div>
            )}

            {/* Assigned user */}
            {assignedPerson && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <Avatar user={assignedPerson} size={15} />
                <span style={{ fontSize: 11, color: "#64748B", fontWeight: 500 }}>{assignedPerson.full_name}</span>
              </div>
            )}
          </div>

          {/* Actions — hidden for completed/cancelled */}
          {!isDone && (
            <div style={{ display: "flex", gap: 3, flexShrink: 0, alignItems: "center" }}>
              {canEdit && (
                <button onClick={() => onStatusChange(event.id, "done")} title="Mark done"
                  style={{ height: 26, padding: "0 8px", borderRadius: 7, border: "1.5px solid #A7F3D0", background: "#ECFDF5", color: "#059669", fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", transition: "all 0.12s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#059669"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#ECFDF5"; e.currentTarget.style.color = "#059669"; }}>
                  <CheckCircle2 size={10} strokeWidth={2} /> Done
                </button>
              )}
              {canEdit && (
                <button onClick={() => onEdit(event)} title="Edit"
                  style={{ height: 26, width: 26, borderRadius: 7, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F1F5F9"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>
                  <Pencil size={10} strokeWidth={2} />
                </button>
              )}
              {canDelete && (
                <button onClick={() => onDelete(event.id)} title="Delete"
                  style={{ height: 26, width: 26, borderRadius: 7, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#EF4444", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#EF4444"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#EF4444"; }}>
                  <Trash2 size={10} strokeWidth={2} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Grouped Conversation Card ────────────────────────────────────────────────

function GroupedConversationCard({ group, onEdit, onDelete, onStatusChange, resolveEntityFull }) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const { profile } = useAuth();
  const myRank      = ROLE_RANK[profile?.role] || 0;

  const entityInfo = (!group.companyName && resolveEntityFull && group.latestEvent) ? resolveEntityFull(group.latestEvent) : null;
  const company    = group.companyName || entityInfo?.company || "Standalone Activity";
  const poc        = group.pocName     || entityInfo?.contact || null;

  // currentActivity is the ONE open event that drives status
  const current      = group.currentActivity;
  const history      = group.completedEvents || [];
  const otherOpen    = (group.openEvents || []).filter(e => e.id !== current?.id);

  const es = group.effectiveStatus;
  const statusCfg = STATUS_CONFIG[es] || STATUS_CONFIG.scheduled;
  const SIcon = statusCfg.icon;

  const currentDef   = current ? (ACT_TYPES[typeKey(current.type)] || ACT_TYPES.task) : null;
  const currentNotes = current ? (() => { const d = parseJSON(current.description); return d.remarks || d.notes || d.outcome || d.agenda || d.body || ""; })() : null;
  const currentBody  = currentNotes || (current ? (cleanDescription(current.title, current.type) || current.title) : null);

  const canEditCurrent   = current && (profile?.id === current.created_by || profile?.id === current.assigned_to || myRank >= 3);
  const canDeleteCurrent = current && (profile?.role === "owner" || profile?.role === "admin");

  const isOverdueCurrent  = es === "overdue";
  const isDueTodayCurrent = !isOverdueCurrent && current?.due_date
    && new Date(current.due_date).toDateString() === new Date().toDateString();

  const dueDateStr = current?.due_date
    ? new Date(current.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      style={{
        background: "#FFFFFF",
        border: `1px solid ${es === "overdue" ? "#FCA5A5" : "#E5E7EB"}`,
        borderLeft: `4px solid ${statusCfg.color}`,
        borderRadius: 14,
        boxShadow: es === "overdue" ? "0 2px 12px rgba(239,68,68,0.07)" : "0 2px 8px rgba(0,0,0,0.05)",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div style={{ padding: "13px 16px 11px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, borderBottom: "1px solid #F1F5F9" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
              {company}
            </span>
            {poc && (
              <>
                <span style={{ fontSize: 12, color: "#CBD5E1" }}>·</span>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "#64748B" }}>{poc}</span>
              </>
            )}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border || statusCfg.color + "30"}` }}>
              <SIcon size={9} strokeWidth={2.5} />{statusCfg.label}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 600, background: "#F0F0FF", color: "#6366F1", border: "1px solid #C7D2FE" }}>
              {group.events.length} {group.events.length === 1 ? "activity" : "activities"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Current Activity (always visible — only this drives status) ── */}
      {current && (
        <div style={{
          padding: "12px 16px",
          background: isOverdueCurrent ? "#FFF5F5" : isDueTodayCurrent ? "#FFFBEB" : "#F8FAFF",
          borderBottom: (otherOpen.length > 0 || history.length > 0) ? "1px solid #F1F5F9" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                {currentDef && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: currentDef.bg, color: currentDef.color, border: `1px solid ${currentDef.border || currentDef.color + "30"}` }}>
                    <currentDef.icon size={9} strokeWidth={2} />{currentDef.label}
                  </span>
                )}
                {dueDateStr && (
                  <span style={{ fontSize: 10.5, fontWeight: isOverdueCurrent ? 700 : 600, color: isOverdueCurrent ? "#DC2626" : isDueTodayCurrent ? "#D97706" : "#64748B", display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <CalendarClock size={9} />
                    {isOverdueCurrent ? `Overdue · ${dueDateStr}` : isDueTodayCurrent ? `Today · ${dueDateStr}` : dueDateStr}
                  </span>
                )}
              </div>
              {currentBody && currentBody !== currentDef?.label && (
                <div style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: 4 }}>
                  {currentBody}
                </div>
              )}
              {(current.assigned_profile || current.created_by_profile) && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Avatar user={current.assigned_profile || current.created_by_profile} size={14} />
                  <span style={{ fontSize: 11, color: "#64748B", fontWeight: 500 }}>{(current.assigned_profile || current.created_by_profile).full_name}</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              {canEditCurrent && (
                <button onClick={() => onStatusChange(current.id, "done")} title="Mark done"
                  style={{ height: 26, padding: "0 9px", borderRadius: 7, border: "1.5px solid #A7F3D0", background: "#ECFDF5", color: "#059669", fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", transition: "all 0.12s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#059669"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#ECFDF5"; e.currentTarget.style.color = "#059669"; }}>
                  <CheckCircle2 size={10} strokeWidth={2} /> Done
                </button>
              )}
              {canEditCurrent && (
                <button onClick={() => onEdit(current)} title="Edit"
                  style={{ height: 26, width: 26, borderRadius: 7, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F1F5F9"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>
                  <Pencil size={10} strokeWidth={2} />
                </button>
              )}
              {canDeleteCurrent && (
                <button onClick={() => onDelete(current.id)} title="Delete"
                  style={{ height: 26, width: 26, borderRadius: 7, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#EF4444", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#EF4444"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#EF4444"; }}>
                  <Trash2 size={10} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Other open events (beside currentActivity) ── */}
      {otherOpen.length > 0 && (
        <div style={{ padding: "4px 16px 0" }}>
          {otherOpen.map((event, i) => (
            <ConversationEventRow key={event.id} event={event} isLast={i === otherOpen.length - 1 && history.length === 0} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}

      {/* ── History (completed events) — collapsible ── */}
      {history.length > 0 && (
        <>
          <button
            onClick={() => setHistoryExpanded(v => !v)}
            style={{ width: "100%", padding: "8px 16px", display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", borderTop: "1px solid #F1F5F9", cursor: "pointer", fontFamily: "inherit", color: "#64748B", fontSize: 11.5, fontWeight: 600, transition: "background 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#F8FAFC"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            <ChevronDown size={12} style={{ color: "#94A3B8", transform: historyExpanded ? "rotate(180deg)" : "none", transition: "transform 0.18s", flexShrink: 0 }} />
            {historyExpanded ? "Hide" : "Show"} {history.length} completed {history.length === 1 ? "activity" : "activities"}
          </button>
          {historyExpanded && (
            <div style={{ padding: "4px 16px 12px", borderTop: "1px solid #F1F5F9", background: "#FAFBFF" }}>
              {history.map((event, i) => (
                <ConversationEventRow key={event.id} event={event} isLast={i === history.length - 1} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

// ─── Group Header ─────────────────────────────────────────────────────────────

function GroupHeader({ label, count, color, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "24px 0 10px" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, fontWeight: 800, color: "#111827", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      {sub && <span style={{ fontSize: 12, color: "#6B7280" }}>— {sub}</span>}
      <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}18`, borderRadius: 99, padding: "2px 9px", border: `1px solid ${color}30` }}>{count}</span>
      <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

function TimelineView({ activities, onEdit, onDelete, onStatusChange, onNew, resolveEntity, resolveEntityFull }) {
  const groups = useMemo(() => groupActivitiesByEntity(activities), [activities]);

  if (!activities.length) return <EmptyState onNew={onNew} />;

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <AnimatePresence initial={false}>
          {groups.map((group) => (
            <GroupedConversationCard
              key={group.key}
              group={group}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              resolveEntityFull={resolveEntityFull}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Toolbar Pagination (compact, matches Pipeline/Leads/Deals) ──────────────
function ToolbarPagination({ currentPage, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const end   = Math.min(totalPages, start + 4);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  const b  = { height: 28, minWidth: 28, padding: "0 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.12s" };
  const ba = { ...b, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" };
  const bd = { ...b, opacity: 0.35, cursor: "not-allowed" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <button style={currentPage === 1 ? bd : b} disabled={currentPage === 1} onClick={() => onChange(currentPage - 1)}>‹</button>
      {start > 1 && <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 1px" }}>…</span>}
      {pages.map((p) => <button key={p} style={p === currentPage ? ba : b} onClick={() => onChange(p)}>{p}</button>)}
      {end < totalPages && <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 1px" }}>…</span>}
      <button style={currentPage === totalPages ? bd : b} disabled={currentPage === totalPages} onClick={() => onChange(currentPage + 1)}>›</button>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────

const ACT_TBL_COLS = [
  { key: "company",       label: "Company Name",       default: true  },
  { key: "contact",       label: "Contact Person",     default: true  },
  { key: "act_type",      label: "Activity Type",      default: true  },
  { key: "act_desc",      label: "Description",        default: true  },
  { key: "act_date",      label: "Activity Date",      default: true  },
  { key: "next_act_date", label: "Next Activity Date", default: true  },
  { key: "assigned",      label: "Assigned Employee",  default: true  },
  { key: "act_status",    label: "Activity Status",    default: true  },
  { key: "priority",      label: "Priority",           default: false },
  { key: "lead_deal",     label: "Lead / Deal",        default: false },
  { key: "created_by",    label: "Created By",         default: false },
  { key: "created_on",    label: "Created On",         default: false },
  { key: "last_updated",  label: "Last Updated",       default: false },
];
const ACT_TBL_DEFAULT_HIDDEN = new Set(ACT_TBL_COLS.filter(c => !c.default).map(c => c.key));
const ACT_TBL_LS_PREFIX = "act_cols_v3_"; // keyed per-user inside TableView

function TableView({ activities, onEdit, onDelete, onStatusChange, resolveEntity, resolveEntityFull, onRowClick, pageOffset = 0 }) {
  const { profile } = useAuth();
  const lsKey = `${ACT_TBL_LS_PREFIX}${profile?.id || "anon"}`;

  const [hiddenCols, setHiddenCols] = useState(() => {
    try { const s = localStorage.getItem(lsKey); return s ? new Set(JSON.parse(s)) : new Set(ACT_TBL_DEFAULT_HIDDEN); }
    catch { return new Set(ACT_TBL_DEFAULT_HIDDEN); }
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [sortCol, setSortCol]         = useState(null);
  const [sortDir, setSortDir]         = useState("asc");
  const colMenuRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setColMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const saveHidden    = (next) => { setHiddenCols(next); try { localStorage.setItem(lsKey, JSON.stringify([...next])); } catch {} };
  const toggleCol     = (key) => { const next = new Set(hiddenCols); next.has(key) ? next.delete(key) : next.add(key); saveHidden(next); };
  const resetToDefault = ()   => saveHidden(new Set(ACT_TBL_DEFAULT_HIDDEN));
  const isColVisible   = (key) => !hiddenCols.has(key);

  const handleSort = (key) => {
    if (sortCol === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(key); setSortDir("asc"); }
  };

  const rawGroups = useMemo(() => groupActivitiesByEntity(activities), [activities]);
  const PRIO_RANK_SORT = { urgent: 4, high: 3, medium: 2, low: 1 };

  const groups = useMemo(() => {
    if (!sortCol) return rawGroups;
    return [...rawGroups].sort((a, b) => {
      const ea = a.currentActivity || a.latestEvent;
      const eb = b.currentActivity || b.latestEvent;
      let va, vb;
      switch (sortCol) {
        case "company":       va = a.companyName || ""; vb = b.companyName || ""; break;
        case "contact":       va = a.pocName || ""; vb = b.pocName || ""; break;
        case "act_type":      va = ACT_TYPES[typeKey(ea?.type)]?.label || ""; vb = ACT_TYPES[typeKey(eb?.type)]?.label || ""; break;
        case "act_date":      va = ea?.created_at || ""; vb = eb?.created_at || ""; break;
        case "next_act_date": va = (a.currentActivity || a.latestEvent)?.next_follow_up_date || ""; vb = (b.currentActivity || b.latestEvent)?.next_follow_up_date || ""; break;
        case "act_status":    va = STATUS_CONFIG[deriveStatus(ea || {})]?.label || ""; vb = STATUS_CONFIG[deriveStatus(eb || {})]?.label || ""; break;
        case "priority":      va = PRIO_RANK_SORT[ea?.priority] || 0; vb = PRIO_RANK_SORT[eb?.priority] || 0; break;
        case "created_on":    va = ea?.created_at || ""; vb = eb?.created_at || ""; break;
        case "last_updated":  va = a.latestDate || ""; vb = b.latestDate || ""; break;
        default: return 0;
      }
      if (typeof va === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [rawGroups, sortCol, sortDir]);

  if (!activities.length) return <EmptyState />;

  const TH = "#6B7280";
  const thBase = { padding: "9px 14px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: TH, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", background: "#F9FAFB", userSelect: "none" };
  const thSort = { ...thBase, cursor: "pointer" };

  const SortInd = ({ col }) => sortCol === col
    ? <span style={{ color: "#6366F1", marginLeft: 3, fontSize: 11 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
    : <span style={{ opacity: 0.22, marginLeft: 3, fontSize: 11 }}>↕</span>;

  return (
    <div>
      {/* Column selector */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <div ref={colMenuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setColMenuOpen(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px", borderRadius: 8, background: hiddenCols.size > 0 ? "rgba(99,102,241,0.1)" : "var(--surface-2)", border: `1px solid ${hiddenCols.size > 0 ? "rgba(99,102,241,0.3)" : "var(--border)"}`, fontSize: 12, fontWeight: 600, color: hiddenCols.size > 0 ? "#6366F1" : "var(--text-2)", cursor: "pointer", fontFamily: "inherit" }}>
            <SlidersHorizontal size={12} /> Columns {hiddenCols.size > 0 ? `(${ACT_TBL_COLS.length - hiddenCols.size}/${ACT_TBL_COLS.length})` : ""}
          </button>
          {colMenuOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 400, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.15)", minWidth: 200, padding: "6px 0" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ padding: "5px 12px 7px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TH, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                <span>Columns</span>
                <button onClick={resetToDefault} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#6366F1", fontFamily: "inherit", fontWeight: 700 }}>Reset to Default</button>
              </div>
              {ACT_TBL_COLS.map(col => (
                <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", cursor: "pointer", fontSize: 13, color: isColVisible(col.key) ? "var(--text)" : TH, fontWeight: isColVisible(col.key) ? 600 : 400 }}>
                  <input type="checkbox" checked={isColVisible(col.key)} onChange={() => toggleCol(col.key)} style={{ accentColor: "#6366F1", width: 13, height: 13, cursor: "pointer" }} />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ overflowX: "auto", borderRadius: 12, border: "1.5px solid #E5E7EB", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
            <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
              <th style={{ ...thBase, width: 36, textAlign: "center" }}>#</th>
              {isColVisible("company")       && <th style={thSort} onClick={() => handleSort("company")}>Company Name<SortInd col="company" /></th>}
              {isColVisible("contact")       && <th style={thSort} onClick={() => handleSort("contact")}>Contact Person<SortInd col="contact" /></th>}
              {isColVisible("act_type")      && <th style={thSort} onClick={() => handleSort("act_type")}>Activity Type<SortInd col="act_type" /></th>}
              {isColVisible("act_desc")      && <th style={thBase}>Description</th>}
              {isColVisible("act_date")      && <th style={thSort} onClick={() => handleSort("act_date")}>Activity Date<SortInd col="act_date" /></th>}
              {isColVisible("next_act_date") && <th style={thSort} onClick={() => handleSort("next_act_date")}>Next Activity Date<SortInd col="next_act_date" /></th>}
              {isColVisible("assigned")      && <th style={thBase}>Assigned Employee</th>}
              {isColVisible("act_status")    && <th style={thSort} onClick={() => handleSort("act_status")}>Activity Status<SortInd col="act_status" /></th>}
              {isColVisible("priority")      && <th style={thSort} onClick={() => handleSort("priority")}>Priority<SortInd col="priority" /></th>}
              {isColVisible("lead_deal")     && <th style={thBase}>Lead / Deal</th>}
              {isColVisible("created_by")    && <th style={thBase}>Created By</th>}
              {isColVisible("created_on")    && <th style={thSort} onClick={() => handleSort("created_on")}>Created On<SortInd col="created_on" /></th>}
              {isColVisible("last_updated")  && <th style={thSort} onClick={() => handleSort("last_updated")}>Last Updated<SortInd col="last_updated" /></th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((group, idx) => {
              const current        = group.currentActivity;
              const latestEvent    = group.latestEvent;
              const entityInfo     = (!group.companyName && resolveEntityFull && latestEvent) ? resolveEntityFull(latestEvent) : null;
              const company        = group.companyName || entityInfo?.company || "—";
              const poc            = group.pocName     || entityInfo?.contact || null;

              // displayAct: open activity if one exists, otherwise fall back to the latest logged activity.
              // This ensures completed-only companies still populate Activity Type, Description, Date columns.
              const displayAct     = current || latestEvent;
              const curDef         = displayAct ? (ACT_TYPES[typeKey(displayAct.type)] || ACT_TYPES.task) : null;
              const CurIcon        = curDef?.icon || Clock;
              const curDescRaw     = displayAct ? (() => { const d = parseJSON(displayAct.description); return String(d.notes || d.remarks || d.outcome || d.body || d.agenda || displayAct.title || ""); })() : null;
              const curDesc        = curDescRaw || null;
              // Current Activity Date = when the activity was logged (created_at), same value shown in popup
              const actDate        = displayAct?.created_at;
              const actStatus      = displayAct ? deriveStatus(displayAct) : "completed";
              const assignedPerson = displayAct?.assigned_profile || displayAct?.created_by_profile;
              const nextActDateVal = displayAct?.next_follow_up_date || null;
              const lastUpdated    = group.events.reduce((best, e) => { const t = e.updated_at || e.created_at; return t && (!best || t > best) ? t : best; }, null);

              const asCfg   = STATUS_CONFIG[actStatus] || STATUS_CONFIG.scheduled;
              const asColor = asCfg.color;
              const asBg    = asCfg.bg;
              const asLabel = asCfg.label;
              const AsIcon  = asCfg.icon;

              // daysOverdue counts days past the scheduled due_date (separate from display date)
              const daysOverdue = actStatus === "overdue" && displayAct?.due_date
                ? Math.max(1, Math.ceil((new Date() - new Date(displayAct.due_date)) / (1000 * 60 * 60 * 24)))
                : 0;

              const priorityVal = displayAct?.priority || "medium";
              const PRIO_CFG    = { urgent: { label: "Urgent", color: "#EF4444" }, high: { label: "High", color: "#F97316" }, medium: { label: "Medium", color: "#F59E0B" }, low: { label: "Low", color: "#10B981" } };
              const pCfg        = PRIO_CFG[priorityVal] || PRIO_CFG.medium;

              const linkLabel       = displayAct?.lead?.company_name || displayAct?.related_type || null;
              const createdByPerson = displayAct?.created_by_profile;

              return (
                <tr
                  key={group.key}
                  style={{ borderBottom: "1px solid #F3F4F6", background: idx % 2 === 0 ? "#fff" : "#FAFAFA", cursor: "pointer", transition: "background 0.1s" }}
                  onClick={() => onRowClick && onRowClick(group)}
                  onMouseEnter={e => { e.currentTarget.style.background = "#EEF2FF"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#FAFAFA"; }}
                >
                  <td style={{ padding: "10px 6px", textAlign: "center", fontSize: 11.5, color: "#9CA3AF", fontWeight: 700 }}>{pageOffset + idx + 1}</td>

                  {isColVisible("company") && (
                    <td style={{ padding: "10px 14px", maxWidth: 180 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{company}</span>
                    </td>
                  )}
                  {isColVisible("contact") && (
                    <td style={{ padding: "10px 14px", maxWidth: 140 }}>
                      {poc ? <span style={{ fontSize: 12.5, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{poc}</span>
                           : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                  {isColVisible("act_type") && (
                    <td style={{ padding: "10px 14px" }}>
                      {curDef
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: curDef.bg, color: curDef.color, border: `1px solid ${curDef.border}`, whiteSpace: "nowrap" }}>
                            <CurIcon size={10} />{curDef.label}
                          </span>
                        : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                  {isColVisible("act_desc") && (
                    <td style={{ padding: "10px 14px", maxWidth: 200 }}>
                      {curDesc ? <span style={{ fontSize: 12, color: "#4B5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{curDesc}</span>
                               : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                  {isColVisible("act_date") && (
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {actDate
                        ? <span style={{ fontSize: 11.5, color: actStatus === "overdue" ? "#EF4444" : "#6B7280", display: "flex", alignItems: "center", gap: 4, fontWeight: actStatus === "overdue" ? 700 : 400 }}><CalendarClock size={11} />{fmtIST(actDate)}</span>
                        : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                  {isColVisible("next_act_date") && (
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {nextActDateVal
                        ? <span style={{ fontSize: 11.5, color: "#6366F1", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}><CalendarClock size={11} />{fmtIST(nextActDateVal)}</span>
                        : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                  {isColVisible("assigned") && (
                    <td style={{ padding: "10px 14px" }}>
                      {assignedPerson
                        ? <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Avatar user={assignedPerson} size={20} /><span style={{ fontSize: 12, color: "#4B5563", whiteSpace: "nowrap" }}>{assignedPerson.full_name}</span></div>
                        : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                  {isColVisible("act_status") && (
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: asBg, color: asColor, whiteSpace: "nowrap" }}>
                        <AsIcon size={10} strokeWidth={2.2} />{asLabel}
                      </span>
                      {daysOverdue > 0 && (
                        <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 700, marginTop: 2 }}>{daysOverdue}d overdue</div>
                      )}
                    </td>
                  )}
                  {isColVisible("priority") && (
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: pCfg.color }}>{pCfg.label}</span>
                    </td>
                  )}
                  {isColVisible("lead_deal") && (
                    <td style={{ padding: "10px 14px", maxWidth: 140 }}>
                      {linkLabel ? <span style={{ fontSize: 12, color: "#4B5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{linkLabel}</span>
                                 : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                  {isColVisible("created_by") && (
                    <td style={{ padding: "10px 14px" }}>
                      {createdByPerson
                        ? <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Avatar user={createdByPerson} size={18} /><span style={{ fontSize: 12, color: "#4B5563", whiteSpace: "nowrap" }}>{createdByPerson.full_name}</span></div>
                        : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                  {isColVisible("created_on") && (
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {displayAct?.created_at
                        ? <span style={{ fontSize: 11.5, color: "#6B7280" }}>{fmtIST(displayAct.created_at)}</span>
                        : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                  {isColVisible("last_updated") && (
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {lastUpdated ? <span style={{ fontSize: 11.5, color: "#6B7280" }}>{fmtIST(lastUpdated, true)}</span>
                                   : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

function KanbanBoard({ activities, onEdit, onDelete, onStatusChange, resolveEntity }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, alignItems: "start", paddingBottom: 32 }}>
      {STATUSES.map((s) => {
        const Icon  = s.icon;
        const items = activities.filter((a) => (a.status || "todo") === s.key);
        return (
          <div key={s.key} style={{ background: s.bg, border: `1.5px solid ${s.color}20`, borderRadius: 14, padding: "12px 10px", minHeight: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14, padding: "0 4px" }}>
              <Icon size={14} style={{ color: s.color }} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>{s.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: s.color, background: `${s.color}20`, borderRadius: 99, padding: "1px 7px" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((a) => {
                const def  = ACT_TYPES[typeKey(a.type)] || ACT_TYPES.task;
                const Icon2 = def.icon;
                const entity = resolveEntity(a.related_type, a.related_id);
                return (
                  <div key={a.id} style={{ background: "#FFFFFF", border: `1.5px solid #E5E7EB`, borderLeft: `3px solid ${def.color}`, borderRadius: 10, padding: "10px 11px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", cursor: "pointer" }} onClick={() => onEdit(a)}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 7 }}>
                      <Icon2 size={13} style={{ color: def.color, flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.title}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      <PriorityBadge priority={a.priority} />
                      {a.due_date && <span style={{ fontSize: 10.5, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 2 }}><CalendarClock size={9} />{fmtDate(a.due_date)}</span>}
                    </div>
                    {entity && <div style={{ marginTop: 6, fontSize: 10.5, color: "#1D4ED8", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}><Link2 size={9} />{entity}</div>}
                  </div>
                );
              })}
              {!items.length && <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: "#D1D5DB" }}>Empty</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ activities, onEdit, resolveEntity }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const firstDay  = new Date(month.year, month.month, 1);
  const lastDay   = new Date(month.year, month.month + 1, 0);
  const startDow  = firstDay.getDay();
  const daysByDate = useMemo(() => {
    const map = {};
    activities.forEach((a) => {
      if (!a.due_date) return;
      const k = a.due_date.slice(0, 10);
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return map;
  }, [activities]);

  const weeks = [];
  const cells = Array(startDow).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthLabel = firstDay.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const todayStr   = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => setMonth((m) => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#111827", minWidth: 160, textAlign: "center" }}>{monthLabel}</span>
        <button onClick={() => setMonth((m) => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "#E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} style={{ background: "#F9FAFB", padding: "9px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>{d}</div>
        ))}
        {weeks.flat().map((day, i) => {
          if (!day) return <div key={`e-${i}`} style={{ background: "#F9FAFB", minHeight: 80 }} />;
          const dateKey = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateKey === todayStr;
          const acts    = daysByDate[dateKey] || [];
          return (
            <div key={dateKey} style={{ background: "#FFFFFF", minHeight: 80, padding: "7px 6px", position: "relative" }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? "#FFFFFF" : "#374151", width: 22, height: 22, borderRadius: "50%", background: isToday ? "#3B82F6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>{day}</div>
              {acts.slice(0, 3).map((a) => {
                const def = ACT_TYPES[typeKey(a.type)] || ACT_TYPES.task;
                return (
                  <div key={a.id} onClick={() => onEdit(a)}
                    style={{ fontSize: 10, fontWeight: 600, color: def.color, background: def.bg, border: `1px solid ${def.border}`, borderRadius: 5, padding: "2px 5px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>
                    {a.title}
                  </div>
                );
              })}
              {acts.length > 3 && <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>+{acts.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── User Grouped View ────────────────────────────────────────────────────────

const ROLE_COLORS = {
  owner:         { color: "#7C3AED", bg: "#F5F3FF" },
  sales_head:    { color: "#2563EB", bg: "#EFF6FF" },
  sales_manager: { color: "#0891B2", bg: "#ECFEFF" },
  employee:      { color: "#059669", bg: "#ECFDF5" },
  inside_sales:  { color: "#D97706", bg: "#FFFBEB" },
};

function UserGroupedView({ activities, onEdit, onDelete, onStatusChange, resolveEntity }) {
  const { profile, isManager, isSalesHead } = useAuth();
  const myRank = ROLE_RANK[profile?.role] || 0;
  const [expanded, setExpanded] = useState({});

  const byUser = useMemo(() => {
    const map = {};
    activities.forEach(a => {
      const user = a.created_by_profile || { id: a.created_by || "unknown", full_name: "Unknown", role: null };
      const uid  = user.id || a.created_by || "unknown";
      if (!map[uid]) map[uid] = { user, items: [] };
      map[uid].items.push(a);
    });
    return Object.values(map).sort((a, b) => (ROLE_RANK[b.user.role] || 0) - (ROLE_RANK[a.user.role] || 0));
  }, [activities]);

  const toggle = (uid) => setExpanded(prev => ({ ...prev, [uid]: !prev[uid] }));

  if (!activities.length) return <EmptyState />;

  return (
    <div style={{ paddingBottom: 32, display: "flex", flexDirection: "column", gap: 10 }}>
      {byUser.map(({ user, items }) => {
        const uid      = user.id || "unknown";
        const isOpen   = !!expanded[uid];
        const rc       = ROLE_COLORS[user.role] || { color: "#6B7280", bg: "#F3F4F6" };
        const ROLE_NAMES_ACT = { owner: "Super Admin", sales_head: "Sales Head", sales_manager: "Sales Manager", employee: "Sales Employee", inside_sales: "Inside Sales" };
        const roleLabel = ROLE_NAMES_ACT[user.role] || (user.role || "unknown").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        const doneCount = items.filter(a => a.status === "done").length;

        const byDate = {};
        items.forEach(a => {
          const k = a.created_at ? a.created_at.slice(0, 10) : "no-date";
          if (!byDate[k]) byDate[k] = [];
          byDate[k].push(a);
        });
        const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

        return (
          <div key={uid}>
            <button
              onClick={() => toggle(uid)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: isOpen ? "#F0F7FF" : "#FFFFFF", border: `1.5px solid ${isOpen ? "#BFDBFE" : "#E5E7EB"}`, borderRadius: isOpen ? "12px 12px 0 0" : 12, cursor: "pointer", transition: "all 0.15s", textAlign: "left" }}
            >
              <Avatar user={user} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{user.full_name || "Unknown"}</div>
                <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 1 }}>
                  {items.length} {items.length === 1 ? "activity" : "activities"} · {doneCount} done
                </div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: rc.color, background: rc.bg, padding: "3px 10px", borderRadius: 99, border: `1px solid ${rc.color}20` }}>{roleLabel}</span>
              <ChevronDown size={16} style={{ color: "#9CA3AF", transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none", flexShrink: 0 }} />
            </button>

            {isOpen && (
              <div style={{ border: "1.5px solid #BFDBFE", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden", background: "#FFFFFF" }}>
                {sortedDates.map((dateKey, di) => {
                  const dateActs  = byDate[dateKey];
                  const dateLabel = dateKey === "no-date"
                    ? "No Date"
                    : new Date(dateKey + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
                  return (
                    <div key={dateKey} style={{ borderTop: di > 0 ? "1px solid #F3F4F6" : undefined }}>
                      <div style={{ padding: "7px 18px", background: "#F9FAFB", display: "flex", alignItems: "center", gap: 6 }}>
                        <CalendarClock size={11} style={{ color: "#9CA3AF" }} />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#374151" }}>{dateLabel}</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {dateActs.length} {dateActs.length === 1 ? "activity" : "activities"}</span>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody>
                          {dateActs.map(a => {
                            const def         = ACT_TYPES[typeKey(a.type)] || ACT_TYPES.task;
                            const ActIcon     = def.icon;
                            const isDone      = a.status === "done";
                            const isOverdue   = !isDone && a.due_date && new Date(a.due_date) < new Date();
                            const entity      = resolveEntity(a.related_type, a.related_id);
                            const isOwnRow    = a.created_by === profile?.id || a.assigned_to === profile?.id;
                            const canEdit     = isOwnRow || myRank >= 3;
                            const canDelete   = profile?.role === "owner" || profile?.role === "admin";
                            return (
                              <tr key={a.id}
                                style={{ borderTop: "1px solid #F9FAFB", transition: "background 0.1s" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#F8FAFF"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                              >
                                <td style={{ padding: "8px 18px", width: 110 }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: def.bg, color: def.color, border: `1px solid ${def.border}` }}>
                                    <ActIcon size={9} />{def.label}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 12px" }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? "#9CA3AF" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{a.title}</div>
                                  {entity && <div style={{ fontSize: 10.5, color: "#1D4ED8", display: "flex", alignItems: "center", gap: 2, marginTop: 1 }}><Link2 size={8} />{entity}</div>}
                                </td>
                                <td style={{ padding: "8px 12px", width: 100 }}><StatusBadge status={a.status || "todo"} /></td>
                                <td style={{ padding: "8px 12px", width: 90 }}>
                                  {a.due_date
                                    ? <span style={{ fontSize: 11, color: isOverdue ? "#EF4444" : "#9CA3AF", display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", fontWeight: isOverdue ? 700 : 400 }}><CalendarClock size={10} />{fmtDate(a.due_date)}</span>
                                    : <span style={{ color: "#D1D5DB" }}>—</span>}
                                </td>
                                <td style={{ padding: "8px 12px", width: 96 }}>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    {canEdit && !isDone && (
                                      <button onClick={() => onStatusChange(a.id, "done")} title="Mark done"
                                        style={{ width: 26, height: 26, borderRadius: 7, border: "1.5px solid #D1FAE5", background: "#ECFDF5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981" }}>
                                        <CheckCircle2 size={11} />
                                      </button>
                                    )}
                                    {canEdit && (
                                      <button onClick={() => onEdit(a)}
                                        style={{ width: 26, height: 26, borderRadius: 7, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
                                        <Pencil size={11} />
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button onClick={() => onDelete(a.id)}
                                        style={{ width: 26, height: 26, borderRadius: 7, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444" }}>
                                        <Trash2 size={11} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: "#F3F4F6", border: "2px dashed #D1D5DB", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <Clock size={28} style={{ color: "#D1D5DB" }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 6 }}>No activities yet</div>
      <div style={{ fontSize: 13.5, color: "#6B7280", marginBottom: 24, maxWidth: 320, margin: "0 auto 24px" }}>
        Log a call, schedule a follow-up, send an email or set a reminder to track your interactions.
      </div>
      {onNew && (
        <button onClick={() => onNew("call")} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 20px", borderRadius: 10, background: "#3B82F6", color: "#FFFFFF", fontSize: 13.5, fontWeight: 700, border: "none", cursor: "pointer" }}>
          <Plus size={15} /> Create First Activity
        </button>
      )}
    </div>
  );
}

// ─── Filter Dropdown ─────────────────────────────────────────────────────────

function FilterDropdown({ label, options, value, onChange, searchable = false, right = false }) {
  const [open,    setOpen]   = useState(false);
  const [q,       setQ]      = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) setQ("");
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const active    = !!value;
  const activeOpt = options.find((o) => o.key === value);
  const shown     = searchable && q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 10px 0 12px",
          borderRadius: 9, border: `1.5px solid ${active ? "#3B82F6" : "#E5E7EB"}`,
          background: active ? "#EFF6FF" : "#FFFFFF",
          color: active ? "#1D4ED8" : "#6B7280",
          fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: "pointer",
          whiteSpace: "nowrap", transition: "all 0.15s",
        }}
        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.background = "#F9FAFB"; } }}
        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#FFFFFF"; } }}
      >
        {activeOpt?.icon && (() => { const I = activeOpt.icon; return <I size={12} style={{ color: activeOpt.color || "#3B82F6", flexShrink: 0 }} />; })()}
        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
          {active && activeOpt ? activeOpt.label : label}
        </span>
        {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3B82F6", flexShrink: 0 }} />}
        <ChevronDown size={11} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)",
          left: right ? "auto" : 0, right: right ? 0 : "auto",
          background: "#FFFFFF", border: "1.5px solid #E5E7EB", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.13)", zIndex: 300,
          minWidth: 210, maxHeight: 320,
          display: "flex", flexDirection: "column",
        }}>
          {searchable && (
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input
                  autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  style={{ width: "100%", paddingLeft: 26, height: 30, borderRadius: 7, border: "1.5px solid #E5E7EB", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>
          )}
          <div style={{ overflowY: "auto", padding: 6 }}>
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: "none", background: !value ? "#EFF6FF" : "transparent", color: !value ? "#1D4ED8" : "#6B7280", fontSize: 12.5, fontWeight: !value ? 700 : 400, cursor: "pointer", textAlign: "left" }}
              onMouseEnter={(e) => { if (value) e.currentTarget.style.background = "#F9FAFB"; }}
              onMouseLeave={(e) => { if (value) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flex: 1 }}>All</span>
              {!value && <CheckCheck size={12} style={{ color: "#3B82F6" }} />}
            </button>
            {shown.map((opt) => {
              const isOn  = value === opt.key;
              const OIcon = opt.icon;
              return (
                <button key={opt.key}
                  onClick={() => { onChange(isOn ? "" : opt.key); setOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: "none", background: isOn ? (opt.bg || "#EFF6FF") : "transparent", color: isOn ? (opt.color || "#1D4ED8") : "#374151", fontSize: 12.5, fontWeight: isOn ? 700 : 400, cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}
                  onMouseEnter={(e) => { if (!isOn) e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={(e) => { if (!isOn) e.currentTarget.style.background = "transparent"; }}
                >
                  {OIcon && (
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: isOn ? (opt.color + "20") : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <OIcon size={11} style={{ color: isOn ? opt.color : "#9CA3AF" }} />
                    </div>
                  )}
                  {opt.avatar && <div style={{ flexShrink: 0 }}><Avatar user={opt.avatar} size={20} /></div>}
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>
                  {opt.desc && !isOn && <span style={{ fontSize: 10, color: "#D1D5DB", whiteSpace: "nowrap", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>{opt.desc}</span>}
                  {isOn && <CheckCheck size={12} style={{ flexShrink: 0, color: opt.color || "#3B82F6" }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter Panel (legacy sidebar — kept but unused; inline dropdowns are primary) ──────

function FilterPanel({ filters, onChange, smartFilter, onSmartFilter, teamMembers, onClose }) {
  const activeCount = Object.values(filters).filter(Boolean).length + (smartFilter ? 1 : 0);

  const clearAll = () => {
    onChange({ status: "", priority: "", assignedTo: "" });
    onSmartFilter("");
  };

  const SectionLabel = ({ label }) => (
    <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", marginBottom: 7, marginTop: 4 }}>{label}</div>
  );

  const FilterBtn = ({ icon: Icon, label, desc, color, bg, active, onClick }) => (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${active ? color + "40" : "transparent"}`, background: active ? bg : "transparent", color: active ? color : "#374151", fontSize: 12.5, fontWeight: active ? 700 : 400, cursor: "pointer", marginBottom: 2, transition: "all 0.12s", textAlign: "left" }}>
      <div style={{ width: 22, height: 22, borderRadius: 7, background: active ? color + "18" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={11} style={{ color: active ? color : "#9CA3AF" }} />
      </div>
      <span style={{ flex: 1, lineHeight: 1.3 }}>{label}</span>
      {desc && !active && <span style={{ fontSize: 10, color: "#D1D5DB", textAlign: "right", maxWidth: 80, lineHeight: 1.2 }}>{desc}</span>}
      {active && <CheckCheck size={11} style={{ color, flexShrink: 0 }} />}
    </button>
  );

  return createPortal(
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} exit={{ opacity: 0 }}
        style={{ position: "fixed", inset: 0, background: "#000", zIndex: 399 }}
        onClick={onClose} />
      <motion.div
        initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 300, background: "#FFFFFF", borderLeft: "1px solid #E5E7EB", zIndex: 400, overflowY: "auto", boxShadow: "-6px 0 32px rgba(0,0,0,0.12)" }}
      >
        {/* Header */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#FFFFFF", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SlidersHorizontal size={15} style={{ color: "#6366F1" }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>Filters</span>
            {activeCount > 0 && (
              <span style={{ fontSize: 10.5, background: "#6366F1", color: "#fff", borderRadius: 99, padding: "1px 8px", fontWeight: 700 }}>{activeCount} active</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {activeCount > 0 && (
              <button onClick={clearAll}
                style={{ fontSize: 11.5, color: "#EF4444", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>
                Clear all
              </button>
            )}
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}><X size={14} /></button>
          </div>
        </div>

        <div style={{ padding: "14px 14px 24px" }}>

          {/* ── Quick Filters ── */}
          <SectionLabel label="Quick Filters" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 18 }}>
            {SMART_FILTERS.map((sf) => {
              const on   = smartFilter === sf.key;
              const Icon = sf.icon;
              return (
                <button key={sf.key} onClick={() => onSmartFilter(on ? "" : sf.key)}
                  title={sf.desc}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${on ? sf.color + "50" : "#E5E7EB"}`, background: on ? sf.bg : "#FAFAFA", cursor: "pointer", transition: "all 0.12s", textAlign: "left", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
                    <Icon size={12} style={{ color: on ? sf.color : "#9CA3AF", flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, fontWeight: on ? 700 : 500, color: on ? sf.color : "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sf.label}</span>
                    {on && <CheckCheck size={10} style={{ color: sf.color, flexShrink: 0 }} />}
                  </div>
                  <span style={{ fontSize: 9.5, color: "#9CA3AF", lineHeight: 1.2 }}>{sf.desc}</span>
                </button>
              );
            })}
          </div>

          {/* ── Status ── */}
          <div style={{ height: 1, background: "#F3F4F6", margin: "2px 0 14px" }} />
          <SectionLabel label="Status" />
          {FILTER_STATUSES.map((s) => {
            const on = filters.status === s.key;
            return (
              <FilterBtn key={s.key} icon={s.icon} label={s.label} desc={s.desc} color={s.color} bg={s.bg}
                active={on} onClick={() => onChange({ ...filters, status: on ? "" : s.key })} />
            );
          })}

          {/* ── Priority ── */}
          <div style={{ height: 1, background: "#F3F4F6", margin: "12px 0 14px" }} />
          <SectionLabel label="Priority" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 4 }}>
            {PRIORITIES.map((p) => {
              const on = filters.priority === p.key;
              return (
                <button key={p.key} onClick={() => onChange({ ...filters, priority: on ? "" : p.key })}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${on ? p.color + "40" : "#E5E7EB"}`, background: on ? p.color + "12" : "#FAFAFA", color: on ? p.color : "#374151", fontSize: 12, fontWeight: on ? 700 : 400, cursor: "pointer", transition: "all 0.12s" }}>
                  <Flag size={11} fill={on ? p.color : "#D1D5DB"} style={{ color: on ? p.color : "#D1D5DB", flexShrink: 0 }} />
                  {p.label}
                  {on && <CheckCheck size={10} style={{ marginLeft: "auto", color: p.color }} />}
                </button>
              );
            })}
          </div>

          {/* ── Assigned To ── */}
          {teamMembers.length > 0 && (
            <>
              <div style={{ height: 1, background: "#F3F4F6", margin: "12px 0 14px" }} />
              <SectionLabel label="Assigned To" />
              {teamMembers.map((m) => {
                const on = filters.assignedTo === m.id;
                return (
                  <FilterBtn key={m.id}
                    icon={() => <Avatar user={m} size={14} />}
                    label={m.full_name?.split(" ")[0]}
                    color="#3B82F6" bg="#EFF6FF"
                    active={on}
                    onClick={() => onChange({ ...filters, assignedTo: on ? "" : m.id })} />
                );
              })}
            </>
          )}
        </div>
      </motion.div>
    </>,
    document.body
  );
}

// ─── Activity Details Panel ───────────────────────────────────────────────────

function ActivityDetailsPanel({ group, onClose, onEdit, onDelete, onStatusChange, resolveEntityFull }) {
  const { profile } = useAuth();
  const myRank = ROLE_RANK[profile?.role] || 0;

  const entityInfo = (!group.companyName && resolveEntityFull && group.latestEvent) ? resolveEntityFull(group.latestEvent) : null;
  const company    = group.companyName || entityInfo?.company || "Standalone Activity";
  const poc        = group.pocName     || entityInfo?.contact || null;

  const current    = group.currentActivity;
  const displayAct = current || group.latestEvent;

  const canEdit   = displayAct && (profile?.id === displayAct.created_by || profile?.id === displayAct.assigned_to || myRank >= 3);

  const actStatus  = displayAct ? deriveStatus(displayAct) : "completed";
  const statusCfg  = STATUS_CONFIG[actStatus] || STATUS_CONFIG.scheduled;
  const StatusIcon = statusCfg.icon;

  const def      = displayAct ? (ACT_TYPES[typeKey(displayAct.type)] || ACT_TYPES.task) : null;
  const TypeIcon = def?.icon;

  const daysOverdue = actStatus === "overdue" && displayAct?.due_date
    ? Math.max(1, Math.ceil((new Date() - new Date(displayAct.due_date)) / (1000 * 60 * 60 * 24)))
    : 0;

  const priorityVal = displayAct?.priority || "medium";
  const PCFG = { urgent: { label: "Urgent", color: "#EF4444", bg: "#FEF2F2" }, high: { label: "High", color: "#F97316", bg: "#FFF7ED" }, medium: { label: "Medium", color: "#F59E0B", bg: "#FFFBEB" }, low: { label: "Low", color: "#10B981", bg: "#ECFDF5" } };
  const pCfg = PCFG[priorityVal] || PCFG.medium;

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 450 }} />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 500, maxWidth: "95vw", background: "#FFFFFF", zIndex: 451, boxShadow: "-8px 0 40px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column" }}
      >
        {/* ── Sticky header ── */}
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #E5E7EB", flexShrink: 0, background: "#FFFFFF" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{company}</div>
              {poc && <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{poc}</div>}
              <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                {def && TypeIcon && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: def.bg, color: def.color, border: `1px solid ${def.border}` }}>
                    <TypeIcon size={10} />{def.label}
                  </span>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}>
                  <StatusIcon size={10} strokeWidth={2.2} />{statusCfg.label}{daysOverdue > 0 ? ` · ${daysOverdue}d` : ""}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: pCfg.bg, color: pCfg.color }}>
                  <Flag size={9} fill={pCfg.color} />{pCfg.label}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: 2 }}>
              {canEdit && displayAct && actStatus !== "completed" && actStatus !== "cancelled" && (
                <button
                  onClick={() => { onClose(); onEdit(displayAct); }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#FFFFFF"; }}>
                  <Pencil size={12} /> Edit
                </button>
              )}
              <button onClick={onClose}
                style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
                <X size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Scrollable body — Activity Timeline only ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 32px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.09em", color: "#6B7280", margin: "14px 0 10px", paddingBottom: 6, borderBottom: "1.5px solid #F3F4F6", display: "flex", alignItems: "center", gap: 6 }}>
            Activity Timeline ({group.events.length})
          </div>
          <div>
            {group.events.map((event, i) => (
              <ConversationEventRow
                key={event.id}
                event={event}
                isLast={i === group.events.length - 1}
                onEdit={(act) => { onClose(); onEdit(act); }}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </>,
    document.body
  );
}

// ─── Activity Modal ───────────────────────────────────────────────────────────

// ─── Follow-up Schedule Dialog ────────────────────────────────────────────────

function FollowUpScheduleDialog({ activity, teamMembers, onCompleteOnly, onCompleteAndSchedule, onCancel }) {
  const defaultDate = (() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  })();

  // Default next type: escalate naturally (call → follow_up_call → meeting → note)
  const defaultNextType = (() => {
    const t = typeKey(activity?.type);
    if (t === "call" || t === "follow_up_call") return "follow_up_call";
    if (t === "meeting_person" || t === "meeting_virtual" || t === "meeting") return "follow_up_call";
    return "follow_up_call";
  })();

  const [schedDate,       setSchedDate]       = useState(defaultDate);
  const [schedType,       setSchedType]       = useState(defaultNextType);
  const [schedNotes,      setSchedNotes]      = useState("");
  const [schedPriority,   setSchedPriority]   = useState(activity?.priority || "medium");
  const [schedAssignedTo, setSchedAssignedTo] = useState(activity?.assigned_to || "");
  const [saving,          setSaving]          = useState(false);

  const curDef    = ACT_TYPES[typeKey(activity?.type)] || ACT_TYPES.task;
  const CurIcon   = curDef.icon;
  const company   = activity?.lead?.company_name || activity?.lead?.contact_name || "";

  const handleSchedule = async () => {
    if (!schedDate) { toast.error("Please select a date for the follow-up"); return; }
    setSaving(true);
    try { await onCompleteAndSchedule({ schedDate, schedType, schedNotes, schedPriority, schedAssignedTo }); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ type: "spring", damping: 22, stiffness: 280 }} style={{ maxWidth: 500 }}>

        {/* Header */}
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#ECFDF5", border: "1.5px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <CheckCircle2 size={17} color="#10B981" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>Activity Completed</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 1 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <CurIcon size={11} style={{ color: curDef.color }} />
                <span style={{ color: curDef.color, fontWeight: 700 }}>{curDef.label}</span>
                {company && <span>· {company}</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Current activity completed strip */}
        <div style={{ padding: "10px 20px", background: "#F0FDF4", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={13} color="#10B981" />
          <span style={{ fontSize: 12.5, color: "#15803D", fontWeight: 600 }}>
            {curDef.label} marked as Completed · {fmtIST(new Date().toISOString())}
          </span>
        </div>

        {/* Schedule next section */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6366F1" }}>
            Schedule Next Activity (optional)
          </div>

          {/* Next type selector */}
          <div>
            <label className="crm-label">Next Activity Type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
              {DISPLAY_TYPES.map((key) => {
                const d = ACT_TYPES[key];
                const Icon = d.icon;
                const active = schedType === key;
                return (
                  <button key={key} onClick={() => setSchedType(key)}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${active ? d.color : "#E5E7EB"}`, background: active ? d.bg : "#FFFFFF", color: active ? d.color : "#6B7280", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", transition: "all 0.1s" }}>
                    <Icon size={11} />{d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date + Priority */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="crm-label">Next Activity Date *</label>
              <input className="crm-input" type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <label className="crm-label">Priority</label>
              <select className="crm-input" value={schedPriority} onChange={(e) => setSchedPriority(e.target.value)}>
                {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assigned To */}
          {(teamMembers || []).length > 0 && (
            <div>
              <label className="crm-label">Assigned To</label>
              <select className="crm-input" value={schedAssignedTo} onChange={(e) => setSchedAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {(teamMembers || []).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="crm-label">Notes for Next Activity (optional)</label>
            <textarea className="crm-input" value={schedNotes} onChange={(e) => setSchedNotes(e.target.value)} rows={2} style={{ resize: "vertical" }} placeholder="What needs to happen next?" />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 8, padding: "4px 20px 16px", justifyContent: "flex-end", borderTop: "1px solid #F3F4F6" }}>
          <button onClick={onCancel} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={onCompleteOnly} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Complete Only</button>
          <button onClick={handleSchedule} disabled={saving || !schedDate} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: saving || !schedDate ? "#E5E7EB" : "#6366F1", color: saving || !schedDate ? "#9CA3AF" : "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: saving || !schedDate ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Complete + Schedule Next"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

function ActivityModal({ activity, defaultType = "task", onClose, onSave, teamMembers, leads, deals }) {
  const isEdit = !!activity;
  const desc   = parseJSON(activity?.description);

  const [type,       setType]       = useState(isEdit ? typeKey(activity?.type) : defaultType);
  const [title,      setTitle]      = useState(activity?.title || "");
  const [notes,      setNotes]      = useState(desc.notes || desc.remarks || desc.outcome || desc.body || "");
  const [status,      setStatus]      = useState(() => {
    const s = activity?.status || "scheduled";
    // Map legacy values to new system
    if (s === "todo" || s === "in_progress") return "scheduled";
    if (s === "done") return "completed";
    return STATUSES.find(x => x.key === s) ? s : "scheduled";
  });
  const [priority,    setPriority]    = useState(activity?.priority || "medium");
  const [dueDate,     setDueDate]     = useState(activity?.due_date ? activity.due_date.slice(0, 10) : "");
  const [nextActDate, setNextActDate] = useState(activity?.next_follow_up_date ? new Date(activity.next_follow_up_date).toISOString().slice(0, 10) : "");
  const [assignedTo, setAssignedTo] = useState(activity?.assigned_to || "");
  const [relType,    setRelType]    = useState(activity?.related_type || "");
  const [relId,      setRelId]      = useState(activity?.related_id || "");

  const [callType,    setCallType]    = useState(activity?.type || "Cold Call");
  const [contactNo,   setContactNo]   = useState(desc.contact_no || "");
  const [contactName, setContactName] = useState(desc.name || "");
  const [email,       setEmail]       = useState(desc.email || "");
  const [designation, setDesig]       = useState(desc.designation || "");
  const [response,    setResponse]    = useState(desc.response || "");

  const [attendees, setAttendees] = useState(desc.attendees || "");
  const [location,  setLocation]  = useState(desc.location || "");
  const [agenda,    setAgenda]    = useState(desc.agenda || "");

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    let dbType = type;
    let description = toJSON({ notes });

    if (type === "call" || type === "follow_up_call" || type === "follow_up_email") {
      description = toJSON({ call_sub_type: callType, contact_no: contactNo, name: contactName, email, designation, response, remarks: notes });
    } else if (type === "meeting_virtual" || type === "meeting_person" || type === "meeting") {
      description = toJSON({ attendees, location, agenda, outcome: notes });
    } else if (type === "followup") {
      dbType      = "follow_up";
      description = toJSON({ notes });
    } else if (type === "email") {
      description = toJSON({ to: email, status: "Sent", body: notes });
    } else if (type === "reminder") {
      description = toJSON({ notes });
    }

    const payload = {
      title: title.trim(), type: dbType, description,
      status, priority,
      due_date: dueDate || null,
      next_follow_up_date: nextActDate ? new Date(nextActDate).toISOString() : null,
      assigned_to: assignedTo || null,
      related_type: relType || null,
      related_id: relId || null,
    };
    try { await onSave(payload); } finally { setSaving(false); }
  };

  const def = ACT_TYPES[type] || ACT_TYPES.task;
  const relOptions = relType === "lead" ? leads : relType === "deal" ? deals : [];

  // Edit mode: resolve linked record name and assigned person for read-only display
  const linkedLead         = (isEdit && relType === "lead") ? (leads || []).find(l => l.id === relId) : null;
  const linkedDeal         = (isEdit && relType === "deal") ? (deals || []).find(d => d.id === relId) : null;
  const linkedRecordName   = linkedLead?.company_name || linkedLead?.contact_name || linkedDeal?.company_name || linkedDeal?.title || "";
  const assignedPersonName = isEdit ? ((teamMembers || []).find(m => m.id === assignedTo)?.full_name || "") : "";

  const ReadField = ({ label, value }) => (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9CA3AF", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#374151", fontWeight: 500, lineHeight: 1.45 }}>{value || <span style={{ color: "#D1D5DB" }}>—</span>}</div>
    </div>
  );

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 14 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 600, maxHeight: "92vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#FFFFFF", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: def.bg, border: `1.5px solid ${def.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {(() => { const Icon = def.icon; return <Icon size={15} style={{ color: def.color }} />; })()}
            </div>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: "#111827" }}>{isEdit ? "Edit Activity" : "New Activity"}</div>
              <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 1 }}>Fill in the details below</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}><X size={15} /></button>
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── EDIT MODE: Section 1 — Linked Record (Read Only) ── */}
          {isEdit && (linkedRecordName || contactName || contactNo || email) && (
            <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.09em", color: "#9CA3AF", marginBottom: 10 }}>Linked Record</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {linkedRecordName && <ReadField label="Lead / Company" value={linkedRecordName} />}
                {contactName      && <ReadField label="Contact Person"  value={contactName} />}
                {contactNo        && <ReadField label="Contact No."      value={contactNo} />}
                {email            && <ReadField label="Email"            value={email} />}
                {designation      && <ReadField label="Designation"      value={designation} />}
                {callType && (type === "call" || type === "follow_up_call" || type === "follow_up_email") && (
                  <ReadField label="Call Type" value={callType} />
                )}
              </div>
            </div>
          )}

          {/* ── Activity Type ── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9CA3AF", display: "block", marginBottom: 8 }}>Activity Type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {DISPLAY_TYPES.map((key) => {
                const d      = ACT_TYPES[key];
                const Icon   = d.icon;
                const active = type === key;
                return (
                  <button key={key} onClick={() => setType(key)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 9, border: `1.5px solid ${active ? d.color : "#E5E7EB"}`, background: active ? d.bg : "#FFFFFF", color: active ? d.color : "#6B7280", fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: "pointer", transition: "all 0.12s" }}>
                    <Icon size={12} />{d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Title ── */}
          <div>
            <label className="crm-label">Title *</label>
            <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${def.label} title…`} autoFocus />
          </div>

          {/* ── Call-specific fields ── */}
          {(type === "call" || type === "follow_up_call" || type === "follow_up_email") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Contact details only shown in create mode; in edit mode they're locked in Section 1 */}
              {!isEdit && <>
                <div>
                  <label className="crm-label">Call Type</label>
                  <select className="crm-input" value={callType} onChange={(e) => setCallType(e.target.value)}>
                    {CALL_SUB_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="crm-label">Contact No.</label><input className="crm-input" value={contactNo} onChange={(e) => setContactNo(e.target.value)} placeholder="+91 98765 43210" /></div>
                <div><label className="crm-label">Contact Name</label><input className="crm-input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe" /></div>
                <div><label className="crm-label">Email</label><input className="crm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@acme.com" /></div>
                <div><label className="crm-label">Designation</label><input className="crm-input" value={designation} onChange={(e) => setDesig(e.target.value)} placeholder="CTO" /></div>
              </>}
              {/* Response is always editable — it captures the call outcome */}
              <div style={{ gridColumn: isEdit ? "1/-1" : undefined }}>
                <label className="crm-label">Response</label>
                <select className="crm-input" value={response} onChange={(e) => setResponse(e.target.value)}>
                  <option value="">Select response</option>
                  {CALL_RESPONSES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ── Meeting-specific fields ── */}
          {(type === "meeting" || type === "meeting_virtual" || type === "meeting_person") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label className="crm-label">Attendees</label><input className="crm-input" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="John, Priya, Rahul" /></div>
              <div><label className="crm-label">Location / Link</label><input className="crm-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Zoom / Room 3" /></div>
              <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Agenda</label><textarea className="crm-input" value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={2} style={{ resize: "vertical" }} placeholder="Topics to cover…" /></div>
            </div>
          )}

          {/* ── Notes / Remarks ── */}
          <div>
            <label className="crm-label">{type === "note" ? "Note Content" : type === "email" ? "Email Body" : "Notes / Remarks"}</label>
            <textarea className="crm-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ resize: "vertical" }} placeholder="Add details…" />
          </div>

          {/* ── Status / Priority / Dates ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="crm-label">Status</label>
              <select className="crm-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Priority</label>
              <select className="crm-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            {/* Activity Date only editable in create mode */}
            {!isEdit && (
              <div>
                <label className="crm-label">Activity Date</label>
                <input className="crm-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
            <div style={{ gridColumn: isEdit ? "1/-1" : undefined }}>
              <label className="crm-label">Next Activity Date</label>
              <input className="crm-input" type="date" value={nextActDate} onChange={(e) => setNextActDate(e.target.value)} />
            </div>
          </div>

          {/* ── Assigned To + Link To — create mode only ── */}
          {!isEdit && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="crm-label">Assigned To</label>
                <select className="crm-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="crm-label">Link To</label>
                <select className="crm-input" value={relType} onChange={(e) => { setRelType(e.target.value); setRelId(""); }}>
                  <option value="">None</option>
                  <option value="lead">Lead</option>
                  <option value="deal">Deal</option>
                </select>
              </div>
            </div>
          )}
          {!isEdit && relType && (
            <div>
              <label className="crm-label">{relType === "lead" ? "Select Lead" : "Select Deal"}</label>
              <select className="crm-input" value={relId} onChange={(e) => setRelId(e.target.value)}>
                <option value="">Select…</option>
                {relOptions.map((r) => <option key={r.id} value={r.id}>{r.company_name || r.title || r.contact_name}</option>)}
              </select>
            </div>
          )}

          {/* ── EDIT MODE: Section 3 — System Information (Read Only) ── */}
          {isEdit && (
            <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.09em", color: "#9CA3AF", marginBottom: 10 }}>System Information</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <ReadField label="Current Activity Date" value={fmtIST(activity?.created_at)} />
                <ReadField label="Assigned To"           value={assignedPersonName || "Unassigned"} />
                {relType && <ReadField label="Linked Module" value={relType.charAt(0).toUpperCase() + relType.slice(1)} />}
                {linkedRecordName && <ReadField label="Linked Record" value={linkedRecordName} />}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4, borderTop: "1px solid #F3F4F6", marginTop: 4 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !title.trim()} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: saving || !title.trim() ? "#E5E7EB" : def.color, color: saving || !title.trim() ? "#9CA3AF" : "#FFFFFF", fontSize: 13.5, fontWeight: 700, cursor: saving || !title.trim() ? "not-allowed" : "pointer", transition: "all 0.15s" }}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Activity"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Gmail Sync Log Component ────────────────────────────────────────────────
const GMAIL_API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");
const CRM_MODULE_LABELS = { lead: "Lead", customer: "Customer", pipeline: "Pipeline" };
const STATUS_LABELS     = { classified: "Logged", pending: "Pending", dismissed: "Skipped" };
const STATUS_COLORS     = { classified: "#10B981", pending: "#F59E0B", dismissed: "#9CA3AF" };

function GmailSyncLog({ profile }) {
  const [logs,         setLogs]         = useState([]);
  const [stats,        setStats]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [filterUser,   setFilterUser]   = useState("");
  const [filterFrom,   setFilterFrom]   = useState("");
  const [filterTo,     setFilterTo]     = useState("");
  const [filterRecord, setFilterRecord] = useState("");
  const [filterEmail,  setFilterEmail]  = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [teamMembers,  setTeamMembers]  = useState([]);

  const isAdmin = ["owner", "admin"].includes(profile?.role);

  const apiFetch = useCallback(async (path, opts = {}) => {
    const token = await getAccessToken();
    return fetch(`${GMAIL_API}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterUser)   params.set("user_id",     filterUser);
      if (filterFrom)   params.set("from",         filterFrom);
      if (filterTo)     params.set("to",           filterTo);
      if (filterRecord) params.set("record_name",  filterRecord);
      if (filterEmail)  params.set("email",        filterEmail);
      if (filterModule) params.set("module",       filterModule);
      if (filterStatus) params.set("status",       filterStatus);
      const r = await apiFetch(`/api/email/log?${params.toString()}`);
      if (r.ok) setLogs(await r.json());

      const rs = await apiFetch("/api/email/stats");
      if (rs.ok) setStats(await rs.json());
    } catch {} finally {
      setLoading(false);
    }
  }, [apiFetch, filterUser, filterFrom, filterTo, filterRecord, filterEmail, filterModule, filterStatus]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (!isAdmin) return;
    teamService.getTeamMembers().then((m) => setTeamMembers(m || [])).catch(() => {});
  }, [isAdmin]);

  const inputSt = { padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 12, fontFamily: "inherit", outline: "none" };

  return (
    <div>
      {/* Stats strip */}
      {stats && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { label: "Total Emails Logged", value: stats.total },
            { label: "CRM Records Reached",  value: Object.keys(stats.byRecord || {}).length },
            { label: "Active Senders",        value: Object.keys(stats.byUser   || {}).length },
          ].map((s) => (
            <div key={s.label} style={{ padding: "10px 16px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {isAdmin && (
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} style={inputSt}>
            <option value="">All Users</option>
            {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        )}
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} style={inputSt} title="From date" />
        <input type="date" value={filterTo}   onChange={(e) => setFilterTo(e.target.value)}   style={inputSt} title="To date" />
        <input placeholder="Record name…" value={filterRecord} onChange={(e) => setFilterRecord(e.target.value)} style={{ ...inputSt, minWidth: 130 }} />
        <input placeholder="Email address…" value={filterEmail} onChange={(e) => setFilterEmail(e.target.value)} style={{ ...inputSt, minWidth: 140 }} />
        <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)} style={inputSt}>
          <option value="">All Modules</option>
          <option value="lead">Lead</option>
          <option value="customer">Customer</option>
          <option value="pipeline">Pipeline</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={inputSt}>
          <option value="">All Statuses</option>
          <option value="classified">Logged</option>
          <option value="pending">Pending</option>
          <option value="dismissed">Skipped</option>
        </select>
        <button onClick={fetchLogs} style={{ ...inputSt, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
          <RefreshCw size={12} /> Refresh
        </button>
        {(filterUser || filterFrom || filterTo || filterRecord || filterEmail || filterModule || filterStatus) && (
          <button onClick={() => { setFilterUser(""); setFilterFrom(""); setFilterTo(""); setFilterRecord(""); setFilterEmail(""); setFilterModule(""); setFilterStatus(""); }}
            style={{ ...inputSt, cursor: "pointer", color: "#EF4444", borderColor: "#EF444433" }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontSize: 13 }}>Loading email log…</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontSize: 13 }}>
          No email activities found.{" "}
          {!profile?.id ? "" : "Connect your Gmail in Settings → Email to start tracking."}
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                {["Date & Time", "Sender", "Sender Email", "Recipient", "CRM Record", "Module", "Activity Type", "Reason", "Status"].map((h) => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap", fontSize: 11.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((row, i) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--surface-2)" }}>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                    {row.sent_at ? new Date(row.sent_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                    {row.sender_name || "—"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>
                    {row.from_email || "—"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--text-2)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(row.to_emails || [])[0] || "—"}
                  </td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.crm_record_name || "—"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {row.crm_module ? (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)" }}>
                        {CRM_MODULE_LABELS[row.crm_module] || row.crm_module}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "var(--text-2)" }}>
                    {row.activity_type || "—"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--text-2)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span title={row.reason || ""}>{row.reason || "—"}</span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: `${STATUS_COLORS[row.status]}18`, color: STATUS_COLORS[row.status], border: `1px solid ${STATUS_COLORS[row.status]}33` }}>
                      {STATUS_LABELS[row.status] || row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Email Activities Component ───────────────────────────────────────────────

function EmailActivities({ profile }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ company_name: "", contact_name: "", designation: "", email_id: "", linkedin_url: "" });
  const [search, setSearch] = useState("");
  const fileRef = useRef();

  const { data: emailActs = [], isLoading } = useQuery({
    queryKey: ["email-activities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*, created_by_profile:profiles!activities_created_by_fkey(full_name)")
        .eq("type", "email_contact")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const parseExtra = (desc) => { try { return desc ? JSON.parse(desc) : {}; } catch { return {}; } };

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from("activities").insert({
        type: "email_contact",
        title: payload.company_name,
        description: JSON.stringify(payload),
        user_id: profile?.id,
        created_by: profile?.id,
        status: "todo",
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-activities"] });
      toast.success("Email contact added");
      setShowForm(false);
      setForm({ company_name: "", contact_name: "", designation: "", email_id: "", linkedin_url: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-activities"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const downloadTemplate = () => {
    const csv = "Company Name,Contact Name,Designation,Email ID,LinkedIn URL\n,,,,\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "email-activity-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCSV = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Only CSV files"); e.target.value = ""; return; }
    const text = await file.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast.error("No data rows found"); e.target.value = ""; return; }
    const rawHeaders = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, ""));
    const headerMap = { company_name: rawHeaders.findIndex(h => h.includes("company")), contact_name: rawHeaders.findIndex(h => h.includes("contact")), designation: rawHeaders.findIndex(h => h.includes("design")), email_id: rawHeaders.findIndex(h => h.includes("email")), linkedin_url: rawHeaders.findIndex(h => h.includes("linked")) };
    let ok = 0, fail = 0;
    for (const line of lines.slice(1)) {
      const vals = line.split(",").map(v => v.trim());
      const payload = {
        company_name: headerMap.company_name >= 0 ? vals[headerMap.company_name] || "" : "",
        contact_name: headerMap.contact_name >= 0 ? vals[headerMap.contact_name] || "" : "",
        designation:  headerMap.designation  >= 0 ? vals[headerMap.designation]  || "" : "",
        email_id:     headerMap.email_id     >= 0 ? vals[headerMap.email_id]     || "" : "",
        linkedin_url: headerMap.linkedin_url >= 0 ? vals[headerMap.linkedin_url] || "" : "",
      };
      if (!payload.company_name && !payload.email_id) continue;
      const { error } = await supabase.from("activities").insert({ type: "email_contact", title: payload.company_name || payload.email_id, description: JSON.stringify(payload), user_id: profile?.id, created_by: profile?.id, status: "todo" });
      if (error) fail++; else ok++;
    }
    qc.invalidateQueries({ queryKey: ["email-activities"] });
    toast.success(`Imported ${ok} contacts${fail ? `, ${fail} failed` : ""}`);
    e.target.value = "";
  };

  const filtered = emailActs.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    const ex = parseExtra(a.description);
    return (ex.company_name || "").toLowerCase().includes(q) || (ex.contact_name || "").toLowerCase().includes(q) || (ex.email_id || "").toLowerCase().includes(q);
  });

  const FIELDS = [
    { key: "company_name",  label: "Company Name",  required: true },
    { key: "contact_name",  label: "Contact Person" },
    { key: "designation",   label: "Designation"    },
    { key: "email_id",      label: "Email ID",      type: "email" },
    { key: "linkedin_url",  label: "LinkedIn URL"   },
  ];

  return (
    <div style={{ padding: "0 0 32px" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 240px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…" style={{ paddingLeft: 30, height: 36, width: "100%", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FFFFFF", boxSizing: "border-box", outline: "none" }} />
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={downloadTemplate} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Download size={13} /> Template
        </button>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "1.5px solid #6366F1", background: "#EEF2FF", color: "#4F46E5", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Upload size={13} /> Upload CSV
        </button>
        <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 9, border: "none", background: "#111827", color: "#FFFFFF", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={13} /> Add Email Contact
        </button>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 12, border: "1.5px solid #E5E7EB", overflow: "hidden", background: "#FFFFFF" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1.5px solid #E5E7EB" }}>
              {["#", "Company", "Contact", "Designation", "Email", "LinkedIn", "Added By", "Date", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 48, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No email contacts yet. Add manually or upload a CSV.</td></tr>
            ) : filtered.map((a, idx) => {
              const ex = parseExtra(a.description);
              return (
                <tr key={a.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#111827" }}>{ex.company_name || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13, color: "#374151" }}>{ex.contact_name || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280" }}>{ex.designation || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>
                    {ex.email_id ? <a href={`mailto:${ex.email_id}`} style={{ color: "#3B82F6", textDecoration: "none" }}>{ex.email_id}</a> : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>
                    {ex.linkedin_url ? <a href={ex.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: "#0A66C2", fontWeight: 600, fontSize: 11 }}>View</a> : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280" }}>{a.created_by_profile?.full_name || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 11.5, color: "#9CA3AF" }}>{a.created_at ? new Date(a.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <button onClick={() => { if (window.confirm("Delete this contact?")) deleteMutation.mutate(a.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 4 }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>{filtered.length} contact{filtered.length !== 1 ? "s" : ""}</div>}

      {/* Add form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, width: 440, maxWidth: "94vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#111827" }}>Add Email Contact</h3>
                <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}><X size={18} /></button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {FIELDS.map(f => (
                  <div key={f.key}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
                      {f.label}{f.required && <span style={{ color: "#EF4444" }}> *</span>}
                    </label>
                    <input
                      type={f.type || "text"}
                      value={form[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width: "100%", height: 38, borderRadius: 9, border: "1.5px solid #E5E7EB", padding: "0 12px", fontSize: 13, boxSizing: "border-box", outline: "none" }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
                <button onClick={() => setShowForm(false)} style={{ padding: "8px 18px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button
                  onClick={() => { if (!form.company_name) { toast.error("Company name is required"); return; } createMutation.mutate(form); }}
                  disabled={createMutation.isPending}
                  style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: "#111827", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {createMutation.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Views ────────────────────────────────────────────────────────────────────


const STATUS_TABS = [
  { key: "all",       label: "All"        },
  { key: "mine",      label: "Mine"       },
  { key: "pending",   label: "Pending"    },
  { key: "overdue",   label: "Overdue"    },
  { key: "followups", label: "Follow-ups" },
  { key: "meetings",  label: "Meetings"   },
  { key: "completed", label: "Done"       },
];

export default function Activities() {
  const { profile, isFieldUser, isSalesHead } = useAuth();
  const qc          = useQueryClient();

  const location = useLocation();
  const [pendingCompose,   setPendingCompose]   = useState(null);

  const [activeModule,     setActiveModule]     = useState("tasks"); // "tasks" | "email" | "targets"
  const [emailSubView,     setEmailSubView]     = useState("hub"); // "hub" | "synclog"
  const [search,           setSearch]           = useState("");
  const [typeFilter,       setTypeFilter]       = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all"); // "all" | "mine"
  const [statusFilter,     setStatusFilter]     = useState(""); // "" | "pending" | "in_progress" | "overdue" | "upcoming" | "done"
  const [priorityFilter,   setPriorityFilter]   = useState("");
  const [assignedFilter,   setAssignedFilter]   = useState("");
  const [quickFilter,      setQuickFilter]      = useState("");
  const contentRef = useRef(null); // for scroll-to on card click
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, title, company } | null
  const [showModal,        setShowModal]        = useState(false);
  const [editActivity,     setEditActivity]     = useState(null);
  const [defaultType,      setDefaultType]      = useState("follow_up_call");
  const [followUpDialog,   setFollowUpDialog]   = useState(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState(null);

  const { data: _allActivities = [], isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: actService.getAll,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  // Exclude system-generated entries (email sync, target events) from the activity timeline
  const activities = _allActivities.filter(a =>
    a.type !== "email_contact" &&
    !/^Target (Created|Updated):/.test(a.title || "")
  );
  const { data: teamRaw  } = useQuery({ queryKey: ["team-all"],    queryFn: () => teamService.getAll() });
  const { data: leadsRaw } = useQuery({ queryKey: ["leads-light"], queryFn: () => leadsService.getAll({ limit: 300 }) });
  const { data: dealsRaw } = useQuery({ queryKey: ["deals-light"], queryFn: () => dealsService.getAll({ limit: 300 }) });

  const teamMembers = teamRaw?.data || teamRaw || [];
  const leads       = leadsRaw?.data || [];
  const deals       = dealsRaw?.data || [];

  const resolveEntity = useCallback((relType, relId) => {
    if (!relType || !relId) return null;
    if (relType === "lead") {
      const l = leads.find((x) => x.id === relId);
      return l ? (l.company_name || l.contact_name) : null;
    }
    if (relType === "deal") {
      const d = deals.find((x) => x.id === relId);
      return d ? (d.company_name || d.title) : null;
    }
    return null;
  }, [leads, deals]);

  const resolveEntityFull = useCallback((a) => {
    // Primary: use directly-joined data already on the activity row (fastest, always correct)
    if (a.lead) {
      const extra = (() => { try { return a.lead.other_notes ? JSON.parse(a.lead.other_notes) : {}; } catch { return {}; } })();
      const contacts = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
      const poc = contacts.find((p) => p.is_primary) || contacts[0];
      return { company: a.lead.company_name || null, contact: poc?.name || a.lead.contact_name || null };
    }
    if (a.deal) {
      return { company: a.deal.company_name || a.deal.title || null, contact: a.deal.contact_name || null };
    }
    // Fallback: look up from loaded leads/deals arrays
    const relType = a.related_type;
    const relId   = a.related_id || a.lead_id || a.deal_id;
    if (!relId) return { company: null, contact: null };
    if (relType === "lead" || a.lead_id) {
      const id = a.lead_id || relId;
      const l  = leads.find((x) => x.id === id);
      if (l) {
        const extra = (() => { try { return l.other_notes ? JSON.parse(l.other_notes) : {}; } catch { return {}; } })();
        const contacts = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
        const poc = contacts.find((p) => p.is_primary) || contacts[0];
        return { company: l.company_name || null, contact: poc?.name || l.contact_name || null };
      }
    }
    if (relType === "deal" || a.deal_id) {
      const id = a.deal_id || relId;
      const d  = deals.find((x) => x.id === id);
      if (d) return { company: d.company_name || d.title || null, contact: d.contact_name || null };
    }
    return { company: null, contact: null };
  }, [leads, deals]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["deals"] });
    qc.invalidateQueries({ queryKey: ["deals-all"] });
    qc.invalidateQueries({ queryKey: ["pipeline-items"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  // Real-time subscription — refresh when any activity changes
  useEffect(() => {
    const ch = supabase
      .channel("activities-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        qc.invalidateQueries({ queryKey: ["activities"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Navigate-in from CRM record "Send Email" button
  useEffect(() => {
    if (location.state?.openEmail) {
      setActiveModule("email");
      setEmailSubView("hub");
      setPendingCompose(location.state.openEmail);
      window.history.replaceState({}, "", location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createMutation = useMutation({
    mutationFn: (payload) => actService.create({ ...payload, user_id: profile?.id, created_by: profile?.id }),
    onSuccess: async (data, variables) => {
      invalidate();
      if (variables.type === "Proposal Sent" && variables.related_type === "deal" && variables.related_id) {
        await supabase.from("deals").update({ stage: "proposal_sent", updated_at: new Date().toISOString() }).eq("id", variables.related_id);
        qc.invalidateQueries({ queryKey: ["deals-all"] });
        qc.invalidateQueries({ queryKey: ["deals"] });
        toast.success("Activity created · Deal moved to Proposal Sent");
      } else {
        toast.success("Activity created");
      }
      setShowModal(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }) => actService.update(id, payload),
    onMutate: async ({ id, ...payload }) => {
      await qc.cancelQueries({ queryKey: ["activities"] });
      const prev = qc.getQueryData(["activities"]);
      qc.setQueryData(["activities"], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((a) => a.id === id ? { ...a, ...payload } : a);
      });
      return { prev };
    },
    onError: (e, _, ctx) => {
      if (ctx?.prev) qc.setQueryData(["activities"], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => { toast.success("Activity updated"); setEditActivity(null); },
    onSettled: () => { invalidate(); },
  });

  const deleteMutation = useMutation({
    mutationFn: actService.delete,
    onSuccess: () => { invalidate(); toast.success("Activity deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = useCallback((payload) => {
    if (editActivity) {
      // Auto-advance status: if assigned user updates a "todo" activity → move to "in_progress"
      const isAssignedUser = editActivity.assigned_to === profile?.id;
      const autoStatus = isAssignedUser && (!editActivity.status || editActivity.status === "todo") && !payload.status
        ? { status: "in_progress" } : {};
      return updateMutation.mutateAsync({ id: editActivity.id, ...payload, ...autoStatus });
    }
    return createMutation.mutateAsync(payload);
  }, [editActivity, profile?.id, updateMutation, createMutation]);
  const handleDelete = useCallback((id) => {
    const act = (activities || []).find((a) => a.id === id);
    const company = act
      ? (resolveEntityFull ? resolveEntityFull(act)?.company : null) || act.title || "this activity"
      : "this activity";
    setDeleteConfirm({ id, title: act?.title || "", company });
  }, [activities, resolveEntityFull]);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    deleteMutation.mutate(deleteConfirm.id);
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteMutation]);
  const handleEdit         = useCallback((a) => {
    const ds = deriveStatus(a);
    if (ds === "completed" || ds === "cancelled") {
      toast.error("Completed activities are locked. Create a new activity to record further actions.");
      return;
    }
    setEditActivity(a);
  }, []);

  // Prompt "schedule next activity?" on every manual completion (auto-completed types can't be clicked done)
  const handleStatusChange = useCallback((id, newStatus) => {
    if (newStatus === "done" || newStatus === "completed") {
      const act = activities.find((a) => a.id === id);
      if (act) { setFollowUpDialog(act); return; }
    }
    updateMutation.mutate({ id, status: newStatus, updated_at: new Date().toISOString() });
  }, [updateMutation, activities]);

  const handleFollowUpCompleteOnly = useCallback(() => {
    if (!followUpDialog) return;
    updateMutation.mutate({ id: followUpDialog.id, status: "completed", updated_at: new Date().toISOString() });
    setFollowUpDialog(null);
  }, [followUpDialog, updateMutation]);

  const handleFollowUpCompleteAndSchedule = useCallback(async ({ schedDate, schedType, schedNotes, schedPriority, schedAssignedTo }) => {
    if (!followUpDialog) return;
    const typeDef  = ACT_TYPES[schedType] || ACT_TYPES.follow_up_call;
    const company  = followUpDialog.lead?.company_name || followUpDialog.lead?.contact_name || "";
    // Mark current activity completed + record the scheduled next date on it
    await updateMutation.mutateAsync({
      id:                   followUpDialog.id,
      status:               "completed",
      next_follow_up_date:  schedDate ? new Date(schedDate).toISOString() : null,
      updated_at:           new Date().toISOString(),
    });
    // Create the new scheduled follow-up activity linked to same lead/deal
    await createMutation.mutateAsync({
      type:         schedType,
      title:        `${typeDef.label}${company ? ": " + company : ""}`,
      description:  JSON.stringify({ notes: schedNotes || "" }),
      status:       "scheduled",
      priority:     schedPriority || followUpDialog.priority || "medium",
      due_date:     schedDate || null,
      assigned_to:  schedAssignedTo || followUpDialog.assigned_to || null,
      lead_id:      followUpDialog.lead_id   || null,
      deal_id:      followUpDialog.deal_id   || null,
      related_type: followUpDialog.related_type || (followUpDialog.lead_id ? "lead" : followUpDialog.deal_id ? "deal" : null),
      related_id:   followUpDialog.related_id   || followUpDialog.lead_id || followUpDialog.deal_id || null,
    });
    setFollowUpDialog(null);
    toast.success(`Follow-up scheduled · ${typeDef.label} on ${fmtIST(schedDate)}`);
  }, [followUpDialog, updateMutation, createMutation]);

  const openNew = useCallback((type) => { setDefaultType(type); setEditActivity(null); setShowModal(true); }, []);

  // Summary card click — apply matching filter and scroll to content
  const handleCardClick = useCallback((card) => {
    if (card === "overdue") {
      const next = statusFilter === "overdue" ? "" : "overdue";
      setStatusFilter(next); setQuickFilter("");
    } else if (card === "today") {
      const next = quickFilter === "today" ? "" : "today";
      setQuickFilter(next); setStatusFilter("");
    } else if (card === "done") {
      const next = statusFilter === "done" ? "" : "done";
      setStatusFilter(next); setQuickFilter("");
    }
    setTimeout(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [statusFilter, quickFilter]);

  const now = new Date();

  const isOwnerOrHead = profile?.role === "owner" || profile?.role === "admin";

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const sevenDays  = new Date(now); sevenDays.setDate(now.getDate() + 7); sevenDays.setHours(23,59,59,999);
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);
    const last24h    = new Date(now); last24h.setHours(now.getHours() - 24);

    const FOLLOW_UP_TYPES    = ["follow_up_call", "follow_up_email", "follow_up", "followup"];
    const MEETING_TYPES      = ["meeting_virtual", "meeting_person", "meeting", "virtual_meeting"];
    const CALL_TYPES         = ["call", "follow_up_call", "phone_call"];
    const PIPELINE_CHG_TYPES = ["stage_change", "deal_created"];

    return activities.filter((a) => {
      const tk = typeKey(a.type);

      // Search (title, type, company name, contact name)
      if (q && !a.title?.toLowerCase().includes(q) && !a.type?.toLowerCase().includes(q) && !a.lead?.company_name?.toLowerCase().includes(q) && !a.lead?.contact_name?.toLowerCase().includes(q)) return false;

      // Type
      if (typeFilter && tk !== typeFilter) return false;

      // Priority
      if (priorityFilter && (a.priority || "medium") !== priorityFilter) return false;

      // Assigned to
      if (assignedFilter && a.assigned_to !== assignedFilter && a.created_by !== assignedFilter) return false;

      // Visibility
      if (visibilityFilter === "mine") {
        if (a.created_by !== profile?.id && a.user_id !== profile?.id && a.assigned_to !== profile?.id) return false;
      }

      // Status — deriveStatus() is single source of truth; legacy keys supported for backward compat
      if (statusFilter) {
        const ds = deriveStatus(a);
        if (statusFilter === "upcoming") {
          if (["completed", "cancelled"].includes(ds) || !a.due_date || new Date(a.due_date) < now || new Date(a.due_date) > sevenDays) return false;
        } else if (statusFilter === "pending") {
          if (["completed", "cancelled"].includes(ds)) return false; // legacy
        } else if (statusFilter === "done") {
          if (ds !== "completed") return false; // legacy
        } else {
          if (ds !== statusFilter) return false; // direct match for new status keys
        }
      }

      // Quick filters
      if (quickFilter) {
        if      (quickFilter === "today")            { if (!((a.due_date && new Date(a.due_date) >= todayStart && new Date(a.due_date) <= todayEnd) || (a.created_at && new Date(a.created_at) >= todayStart))) return false; }
        else if (quickFilter === "meetings_today")   { if (!MEETING_TYPES.includes(tk) || !(a.due_date && new Date(a.due_date) >= todayStart && new Date(a.due_date) <= todayEnd)) return false; }
        else if (quickFilter === "meetings_all")     { if (!MEETING_TYPES.includes(tk)) return false; }
        else if (quickFilter === "follow_ups_due")   { if (!FOLLOW_UP_TYPES.includes(tk) || a.status === "done") return false; }
        else if (quickFilter === "calls")            { if (!CALL_TYPES.includes(tk)) return false; }
        else if (quickFilter === "high_priority")    { if (!["high", "urgent"].includes(a.priority)) return false; }
        else if (quickFilter === "lead_updates")     { if (a.related_type !== "lead") return false; }
        else if (quickFilter === "deal_updates")     { if (a.related_type !== "deal") return false; }
        else if (quickFilter === "recent")           { if (!a.created_at || new Date(a.created_at) < last24h) return false; }
        else if (quickFilter === "pipeline_changes") { if (!PIPELINE_CHG_TYPES.includes(tk)) return false; }
      }

      return true;
    });
  }, [activities, search, typeFilter, priorityFilter, assignedFilter, visibilityFilter, statusFilter, quickFilter, profile?.id]);

  // Keep selected group fresh whenever activities are refetched
  const allGroupsFull  = useMemo(() => groupActivitiesByEntity(filtered), [filtered]);
  const selectedGroup  = selectedGroupKey ? (allGroupsFull.find(g => g.key === selectedGroupKey) ?? null) : null;

  // Display order: Overdue -> Due Today -> Scheduled -> Completed. Stable sort — only
  // reorders by group, does not change existing relative ordering within a group.
  const orderedFiltered = useMemo(() => {
    const rank = (a) => {
      const ds = deriveStatus(a);
      if (ds === "overdue") return 0;
      if (ds === "due_today") return 1;
      if (ds === "completed" || ds === "cancelled") return 3;
      return 2; // scheduled + no_response/follow_up_required/rescheduled/pending
    };
    return filtered
      .map((a, i) => ({ a, i }))
      .sort((x, y) => (rank(x.a) - rank(y.a)) || (x.i - y.i))
      .map(({ a }) => a);
  }, [filtered]);

  // ── Table View Pagination ──────────────────────────────────────────────────
  const ACT_PAGE_SIZE = 30;
  const [actPage, setActPage] = useState(1);
  useEffect(() => { setActPage(1); }, [search, typeFilter, priorityFilter, assignedFilter, visibilityFilter, statusFilter, quickFilter]);
  const actTotalPages = Math.ceil(orderedFiltered.length / ACT_PAGE_SIZE);
  const pagedFiltered = orderedFiltered.slice((actPage - 1) * ACT_PAGE_SIZE, actPage * ACT_PAGE_SIZE);

  // Card counts must use deriveStatus() — same logic as the filters — to avoid mismatches
  const _tStart = new Date(); _tStart.setHours(0, 0, 0, 0);
  const _tEnd   = new Date(); _tEnd.setHours(23, 59, 59, 999);
  const overdueCount = activities.filter((a) => deriveStatus(a) === "overdue").length;
  const todayCount   = activities.filter((a) => (a.due_date && new Date(a.due_date) >= _tStart && new Date(a.due_date) <= _tEnd) || (a.created_at && new Date(a.created_at) >= _tStart)).length;
  const doneCount    = activities.filter((a) => deriveStatus(a) === "completed").length;
  const pendingCount = activities.filter((a) => { const ds = deriveStatus(a); return ds !== "completed" && ds !== "cancelled"; }).length;

  const activeFiltersCount = [
    visibilityFilter !== "all",
    statusFilter,
    typeFilter,
    priorityFilter,
    assignedFilter,
    quickFilter,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setVisibilityFilter("all");
    setStatusFilter("");
    setTypeFilter("");
    setPriorityFilter("");
    setAssignedFilter("");
    setQuickFilter("");
    setSearch("");
  };

  return (
    <div style={{ padding: "20px 24px", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Email composer opened via CRM record "Send Email" navigation ── */}
      {pendingCompose && (
        <EmailComposerModal
          to={pendingCompose.to}
          toName={pendingCompose.toName}
          {...(pendingCompose.recordType === "lead"     ? { leadId:     pendingCompose.recordId } : {})}
          {...(pendingCompose.recordType === "deal"     ? { dealId:     pendingCompose.recordId } : {})}
          {...(pendingCompose.recordType === "pipeline" ? { pipelineId: pendingCompose.recordId } : {})}
          recordName={pendingCompose.recordName}
          onClose={() => setPendingCompose(null)}
          onSent={() => setPendingCompose(null)}
        />
      )}

      {/* ── Module tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, flexShrink: 0, background: "#F3F4F6", padding: 4, borderRadius: 12, alignSelf: "flex-start" }}>
        {[
          { key: "tasks",   label: "Activities", icon: Activity },
          { key: "email",   label: "Emails",     icon: Mail     },
          { key: "targets", label: "Targets",    icon: Target   },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveModule(key)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: activeModule === key ? 700 : 500, background: activeModule === key ? "#FFFFFF" : "transparent", color: activeModule === key ? "#111827" : "#6B7280", boxShadow: activeModule === key ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all 0.15s" }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ── Email Activities Module ── */}
      {activeModule === "email" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em" }}>Email Communication Center</h1>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-muted)" }}>Complete customer communication history — view, search, filter and continue conversations</p>
            </div>
            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: 3, background: "var(--surface-2)", padding: 3, borderRadius: 9, border: "1px solid var(--border)" }}>
              {[
                { key: "hub",     label: "Communication Hub" },
                { key: "synclog", label: "Email Log"         },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setEmailSubView(key)}
                  style={{ padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: emailSubView === key ? 700 : 500, background: emailSubView === key ? "#FFFFFF" : "transparent", color: emailSubView === key ? "var(--text)" : "var(--text-muted)", boxShadow: emailSubView === key ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all 0.15s" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {emailSubView === "hub"     && <EmailCommunicationCenter profile={profile} />}
          {emailSubView === "synclog" && <EmailActivityLog profile={profile} />}
        </div>
      )}

      {/* ── Targets Module ── */}
      {activeModule === "targets" && (
        <div style={{ flex: 1, overflowY: "auto", marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24 }}>
          <Targets />
        </div>
      )}

      {/* ── Tasks & Activities Module ── */}
      {activeModule === "tasks" && <>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>{activities.length} total · {pendingCount} pending · {doneCount} completed</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {[
            { key: "overdue", label: "Overdue", value: overdueCount, color: "#EF4444", bg: "#FEF2F2", border: "#FECACA", active: statusFilter === "overdue" },
            { key: "today",   label: "Today",   value: todayCount,   color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", active: quickFilter  === "today"   },
            { key: "done",    label: "Done",    value: doneCount,    color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", active: statusFilter === "done"    },
          ].map(({ key, label, value, color, bg, border, active }) => (
            <button
              key={key}
              onClick={() => handleCardClick(key)}
              title={active ? `Clear ${label} filter` : `Filter by ${label}`}
              style={{
                padding: "6px 14px", background: active ? color : bg,
                border: `2px solid ${active ? color : border}`,
                borderRadius: 11, textAlign: "center", minWidth: 56,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: active ? `0 0 0 3px ${color}30` : "none",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.boxShadow = `0 0 0 2px ${color}40`; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = active ? `0 0 0 3px ${color}30` : "none"; }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, color: active ? "#fff" : color, lineHeight: 1.2 }}>{value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: active ? "#fff" : color, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 1 }}>{label}</div>
            </button>
          ))}
          {isOwnerOrHead && (
            <button
              onClick={() => openNew("follow_up_call")}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 18px", height: 38, borderRadius: 10, background: "#111827", color: "#FFFFFF", fontSize: 13.5, fontWeight: 700, border: "none", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#1F2937"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#111827"; }}
            >
              <Plus size={15} /> Add Activity
            </button>
          )}
        </div>
      </div>

      {/* ── Dropdown Filter Bar ── */}
      <div style={{ flexShrink: 0, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>

          {/* Visibility */}
          <FilterDropdown
            label="Visibility"
            options={[{ key: "mine", label: "Mine", icon: Users, color: "#6366F1", bg: "#EEF2FF" }]}
            value={visibilityFilter === "mine" ? "mine" : ""}
            onChange={(v) => setVisibilityFilter(v || "all")}
          />

          {/* Status */}
          <FilterDropdown
            label="Status"
            options={FILTER_STATUSES.map((s) => ({ key: s.key, label: s.label, icon: s.icon, color: s.color, bg: s.bg }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />

          {/* Activity Type */}
          <FilterDropdown
            label="Type"
            options={DISPLAY_TYPES.map((key) => ({ key, label: ACT_TYPES[key].label, icon: ACT_TYPES[key].icon, color: ACT_TYPES[key].color, bg: ACT_TYPES[key].bg }))}
            value={typeFilter}
            onChange={setTypeFilter}
          />

          {/* Priority */}
          <FilterDropdown
            label="Priority"
            options={PRIORITIES.map((p) => ({ key: p.key, label: p.label, icon: Flag, color: p.color, bg: `${p.color}12` }))}
            value={priorityFilter}
            onChange={setPriorityFilter}
          />

          {/* Quick Filters */}
          <FilterDropdown
            label="Quick Filters"
            options={SMART_FILTERS.map((sf) => ({ key: sf.key, label: sf.label, icon: sf.icon, color: sf.color, bg: sf.bg, desc: sf.desc }))}
            value={quickFilter}
            onChange={setQuickFilter}
          />

          {/* Assigned To — owner / sales_head only */}
          {isOwnerOrHead && teamMembers.length > 0 && (
            <FilterDropdown
              label="Assigned To"
              searchable
              options={teamMembers.map((m) => ({ key: m.id, label: m.full_name, avatar: m, color: "#3B82F6", bg: "#EFF6FF" }))}
              value={assignedFilter}
              onChange={setAssignedFilter}
            />
          )}

          {/* Clear All */}
          {activeFiltersCount > 0 && (
            <button
              onClick={clearAllFilters}
              style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 12px", borderRadius: 9, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <X size={11} /> Clear
              <span style={{ background: "#EF4444", color: "#fff", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 800, minWidth: 16, textAlign: "center" }}>{activeFiltersCount}</span>
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              style={{ paddingLeft: 28, height: 34, width: 170, fontSize: 12.5, border: "1.5px solid #E5E7EB", borderRadius: 9, background: "#FFFFFF", color: "#111827", outline: "none" }}
              placeholder="Search activities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Pagination */}
          <ToolbarPagination currentPage={actPage} totalPages={actTotalPages} onChange={setActPage} />

        </div>

        {/* Active filter summary chips */}
        {activeFiltersCount > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
            {visibilityFilter === "mine" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#EEF2FF", color: "#4F46E5", border: "1.5px solid #C7D2FE" }}>
                <Users size={9} /> Mine
                <button onClick={() => setVisibilityFilter("all")} style={{ background: "none", border: "none", cursor: "pointer", color: "#4F46E5", padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            )}
            {statusFilter && (() => { const s = FILTER_STATUSES.find(x => x.key === statusFilter); return s ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1.5px solid ${s.color}30` }}>
                <s.icon size={9} /> {s.label}
                <button onClick={() => setStatusFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: s.color, padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
            {typeFilter && (() => { const d = ACT_TYPES[typeFilter]; return d ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: d.bg, color: d.color, border: `1.5px solid ${d.border}` }}>
                <d.icon size={9} /> {d.label}
                <button onClick={() => setTypeFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: d.color, padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
            {priorityFilter && (() => { const p = PRIORITY_MAP[priorityFilter]; return p ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${p.color}12`, color: p.color, border: `1.5px solid ${p.color}30` }}>
                <Flag size={9} fill={p.color} /> {p.label}
                <button onClick={() => setPriorityFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: p.color, padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
            {quickFilter && (() => { const sf = SMART_FILTERS.find(x => x.key === quickFilter); return sf ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: sf.bg, color: sf.color, border: `1.5px solid ${sf.color}30` }}>
                <sf.icon size={9} /> {sf.label}
                <button onClick={() => setQuickFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: sf.color, padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
            {assignedFilter && (() => { const m = teamMembers.find(x => x.id === assignedFilter); return m ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#EFF6FF", color: "#1D4ED8", border: "1.5px solid #BFDBFE" }}>
                <Avatar user={m} size={14} /> {m.full_name?.split(" ")[0]}
                <button onClick={() => setAssignedFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#1D4ED8", padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
          </div>
        )}
      </div>

      {/* ── Upcoming 3-day banner ── */}
      {(() => {
        const three = new Date(); three.setDate(three.getDate() + 3); three.setHours(23,59,59,999);
        const upcoming3 = activities.filter((a) =>
          a.status !== "done" &&
          a.due_date &&
          new Date(a.due_date) >= now &&
          new Date(a.due_date) <= three &&
          (!statusFilter || statusFilter === "pending" || statusFilter === "upcoming")
        );
        if (!upcoming3.length) return null;
        const todayItems = upcoming3.filter((a) => new Date(a.due_date).toDateString() === now.toDateString());
        return (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ flexShrink: 0, marginBottom: 10, borderRadius: 12, border: "1.5px solid #FDE68A", background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "#F59E0B18", border: "1.5px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bell size={15} style={{ color: "#D97706" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                {upcoming3.length} task{upcoming3.length > 1 ? "s" : ""} due in the next 3 days
                {todayItems.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: "#EF4444", color: "#fff", borderRadius: 99, padding: "1px 7px" }}>{todayItems.length} today</span>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                {upcoming3.slice(0, 5).map((a) => {
                  const def  = ACT_TYPES[typeKey(a.type)] || ACT_TYPES.task;
                  const Icon = def.icon;
                  const isToday = new Date(a.due_date).toDateString() === now.toDateString();
                  return (
                    <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 600, background: isToday ? "#FEF2F2" : "#FFFFFF", color: isToday ? "#B91C1C" : "#92400E", border: `1.5px solid ${isToday ? "#FECACA" : "#FDE68A"}`, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      <Icon size={9} style={{ color: def.color, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                      <span style={{ flexShrink: 0, opacity: 0.7 }}>· {fmtDate(a.due_date)}</span>
                    </span>
                  );
                })}
                {upcoming3.length > 5 && <span style={{ fontSize: 11, color: "#D97706", fontWeight: 600, alignSelf: "center" }}>+{upcoming3.length - 5} more</span>}
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* ── Content area ── */}
      <div ref={contentRef} style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #E5E7EB", borderTopColor: "#3B82F6", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : (
          <>
            <TableView activities={pagedFiltered} onEdit={handleEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} resolveEntity={resolveEntity} resolveEntityFull={resolveEntityFull} onRowClick={(g) => setSelectedGroupKey(g.key)} pageOffset={(actPage - 1) * ACT_PAGE_SIZE} />
          </>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {(showModal || editActivity) && (
          <ActivityModal
            activity={editActivity}
            defaultType={defaultType}
            onClose={() => { setShowModal(false); setEditActivity(null); }}
            onSave={handleSave}
            teamMembers={teamMembers}
            leads={leads}
            deals={deals}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {followUpDialog && (
          <FollowUpScheduleDialog
            activity={followUpDialog}
            teamMembers={teamMembers}
            onCompleteOnly={handleFollowUpCompleteOnly}
            onCompleteAndSchedule={handleFollowUpCompleteAndSchedule}
            onCancel={() => setFollowUpDialog(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedGroup && (
          <ActivityDetailsPanel
            group={selectedGroup}
            onClose={() => setSelectedGroupKey(null)}
            onEdit={(a) => { setSelectedGroupKey(null); setEditActivity(a); }}
            onDelete={(id) => { handleDelete(id); setSelectedGroupKey(null); }}
            onStatusChange={handleStatusChange}
            resolveEntityFull={resolveEntityFull}
          />
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Dialog ── */}
      {deleteConfirm && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 24 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.16 }}
            style={{ background: "#fff", borderRadius: 18, padding: "28px 32px", maxWidth: 420, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)" }}
          >
            {/* Icon */}
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "#FEF2F2", border: "1.5px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Trash2 size={22} color="#EF4444" strokeWidth={2} />
            </div>
            {/* Title */}
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginBottom: 8, letterSpacing: "-0.02em" }}>Delete Activity?</div>
            {/* Message */}
            <div style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.6, marginBottom: 6 }}>
              You are about to permanently delete the activity for
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
              {deleteConfirm.company}
            </div>
            {deleteConfirm.title && deleteConfirm.title !== deleteConfirm.company && (
              <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 12, fontStyle: "italic" }}>"{deleteConfirm.title}"</div>
            )}
            <div style={{ fontSize: 12.5, color: "#94A3B8", lineHeight: 1.6, marginBottom: 24, padding: "10px 12px", background: "#FFF8F8", borderRadius: 10, border: "1px solid #FECACA" }}>
              This action is permanent and cannot be undone. The activity will be removed from the CRM history.
            </div>
            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ height: 38, padding: "0 20px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#F8FAFC"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{ height: 38, padding: "0 20px", borderRadius: 10, border: "none", background: "#EF4444", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, transition: "background 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#DC2626"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#EF4444"; }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      </> /* end activeModule === "tasks" */}
    </div>
  );
}
