import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { getAccessToken } from "../lib/session";
import { db as supabase } from "../lib/db";
import { useCurrency } from "../context/CurrencyContext";
import toast from "react-hot-toast";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Crosshair, Plus, X, TrendingUp, Calendar, Trophy,
  Activity, Briefcase, Trash2, CheckCircle2, AlertCircle,
  Clock, Edit2, Eye, LayoutList, BarChart2, Target,
  ChevronUp, ChevronDown,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────────────

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

// Role hierarchy — mirrors backend/config/roles.js
const ASSIGNABLE_TO_ROLES = {
  owner:         ["admin", "sales_manager", "sales_rep", "sales_rep"],
  sales_head:    ["sales_manager", "sales_rep", "sales_rep"],
  sales_manager: ["sales_rep", "sales_rep"],
  employee:      [],
  inside_sales:  [],
};

async function targetsApi(method, path, body) {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

const METRICS = [
  { key: "leads_created",    label: "Lead Target",           icon: TrendingUp, color: "#8B5CF6", unit: "leads",      autoTrack: true  },
  { key: "pipeline",         label: "Pipeline Target",       icon: BarChart2,  color: "#6366F1", unit: "prospects",  autoTrack: true  },
  { key: "deals_won",        label: "Deal Target (Won)",     icon: Trophy,     color: "#10B981", unit: "deals",      autoTrack: true  },
  { key: "revenue",          label: "Revenue Target",        icon: Briefcase,  color: "#059669", unit: "currency",   autoTrack: true  },
  { key: "calls",            label: "Call Target",           icon: Activity,   color: "#3B82F6", unit: "calls",      autoTrack: true  },
  { key: "follow_ups",       label: "Follow-Up Target",      icon: TrendingUp, color: "#F59E0B", unit: "follow-ups", autoTrack: true  },
  { key: "meetings",         label: "Meeting Target",        icon: Calendar,   color: "#8B5CF6", unit: "meetings",   autoTrack: true  },
  { key: "activities",       label: "Activity Target",       icon: Activity,   color: "#F97316", unit: "activities", autoTrack: true  },
  { key: "emails",           label: "Email Target",          icon: Activity,   color: "#EC4899", unit: "emails",     autoTrack: true  },
  { key: "proposals",        label: "Proposal Target",       icon: Target,     color: "#06B6D4", unit: "proposals",  autoTrack: true  },
  { key: "demos",            label: "Demo Target",           icon: Briefcase,  color: "#7C3AED", unit: "demos",      autoTrack: true  },
  { key: "qualified_leads",  label: "Qualified Leads",       icon: TrendingUp, color: "#0EA5E9", unit: "leads",      autoTrack: true  },
  { key: "deals_proposal",   label: "Deals in Proposal",     icon: Target,     color: "#F97316", unit: "deals",      autoTrack: true  },
  { key: "custom",           label: "Others (Custom)",       icon: Edit2,      color: "#64748B", unit: "items",      autoTrack: false },
];

const PERIOD_TYPES = [
  { key: "daily",       label: "Daily"       },
  { key: "weekly",      label: "Weekly"      },
  { key: "monthly",     label: "Monthly"     },
  { key: "quarterly",   label: "Quarterly"   },
  { key: "half_yearly", label: "Half-Yearly" },
  { key: "yearly",      label: "Yearly"      },
];

const STATUS_CONFIG = {
  achieved: { label: "Achieved", color: "#10B981", bg: "rgba(16,185,129,0.1)",  Icon: CheckCircle2 },
  onTrack:  { label: "On Track", color: "#3B82F6", bg: "rgba(59,130,246,0.1)", Icon: TrendingUp   },
  atRisk:   { label: "At Risk",  color: "#F59E0B", bg: "rgba(245,158,11,0.1)", Icon: Clock        },
  behind:   { label: "Behind",   color: "#EF4444", bg: "rgba(239,68,68,0.1)",  Icon: AlertCircle  },
  overdue:  { label: "Overdue",  color: "#DC2626", bg: "rgba(220,38,38,0.1)",  Icon: AlertCircle  },
};

// ─── Utilities ──────────────────────────────────────────────────────────────────
function metricInfo(key) {
  if (key?.startsWith("custom:")) {
    const label = key.slice(7) || "Custom";
    return { key, label, icon: Edit2, color: "#64748B", unit: "items" };
  }
  return METRICS.find(m => m.key === key) || METRICS[0];
}

function fmtMetric(v, metric, fmtCurrency) {
  if (metric === "revenue") return fmtCurrency ? fmtCurrency(Number(v || 0)) : `${Number(v || 0).toLocaleString("en-IN")}`;
  const info = metricInfo(metric);
  return `${Number(v || 0).toLocaleString("en-IN")} ${info.unit}`;
}

function getStatus(pct, isOverdue) {
  if (pct >= 100)  return STATUS_CONFIG.achieved;
  if (isOverdue)   return STATUS_CONFIG.overdue;
  if (pct >= 60)   return STATUS_CONFIG.onTrack;
  if (pct >= 30)   return STATUS_CONFIG.atRisk;
  return STATUS_CONFIG.behind;
}

async function fetchAllProgress() {
  const [leadsRes, activitiesRes, dealsRes, meetingsRes] = await Promise.all([
    supabase.from("leads").select("id, assigned_to, stage, created_at, updated_at"),
    supabase.from("activities").select("created_by, type, status, lead_id, created_at"),
    supabase.from("deals").select("id, assigned_to, stage, value, created_at, updated_at"),
    supabase.from("meetings").select("created_by, status, start_time, created_at, lead_id, deal_id, outcome, outcome_notes"),
  ]);
  return {
    leads:      leadsRes.data      || [],
    activities: activitiesRes.data || [],
    deals:      dealsRes.data      || [],
    meetings:   meetingsRes.data   || [],
  };
}

function computeProgress(target, progressData) {
  if (!progressData) return 0;
  const { leads, activities, deals, meetings = [] } = progressData;

  // Parse as local midnight/end-of-day to avoid UTC offset exclusions (IST users)
  const start   = new Date(target.start_date + "T00:00:00");
  const end     = new Date(target.end_date   + "T23:59:59");
  const inRange = (d) => { if (!d) return false; const t = new Date(d); return t >= start && t <= end; };

  // Build ownership sets once — reused across metrics
  const assignedLeadIds = new Set(leads.filter(l => l.assigned_to === target.assigned_to).map(l => l.id));
  const assignedDealIds = new Set(deals.filter(d => d.assigned_to === target.assigned_to).map(d => d.id));

  // Checks whether a meeting belongs to the assigned user:
  // 1. They created it, OR 2. it is linked to one of their leads/deals
  const meetingBelongsToUser = (m) =>
    m.created_by === target.assigned_to ||
    (m.lead_id  && assignedLeadIds.has(m.lead_id)) ||
    (m.deal_id  && assignedDealIds.has(m.deal_id));

  if (target.metric === "qualified_leads") {
    return leads.filter(l =>
      l.assigned_to === target.assigned_to &&
      l.stage === "qualified" &&
      inRange(l.updated_at || l.created_at)
    ).length;
  }

  if (target.metric === "meetings") {
    // Count only meetings that are fully completed AND have an outcome/remark submitted.
    // A "Scheduled" status never counts toward achievement.
    const meetingCount = meetings.filter(m =>
      meetingBelongsToUser(m) &&
      ["completed", "done"].includes(m.status) &&
      (m.outcome || m.outcome_notes) &&
      inRange(m.start_time || m.created_at)
    ).length;
    // Fallback: meeting-type activities logged by the user
    const activityCount = activities.filter(a =>
      a.created_by === target.assigned_to &&
      ["meeting", "meeting_person", "meeting_virtual", "follow_up_meeting"].includes(a.type) &&
      inRange(a.created_at)
    ).length;
    return Math.max(meetingCount, activityCount);
  }

  if (target.metric === "activities") {
    // Count all activities created by the user in range (any status — creation = execution in CRM)
    return activities.filter(a =>
      a.created_by === target.assigned_to && inRange(a.created_at)
    ).length;
  }

  if (target.metric === "revenue") {
    return deals
      .filter(d =>
        (d.assigned_to === target.assigned_to || assignedDealIds.has(d.id)) &&
        d.stage === "won" &&
        inRange(d.updated_at || d.created_at)
      )
      .reduce((s, d) => s + (Number(d.value) || 0), 0);
  }

  if (target.metric === "deals_won") {
    return deals.filter(d =>
      d.assigned_to === target.assigned_to &&
      d.stage === "won" &&
      inRange(d.updated_at || d.created_at)
    ).length;
  }

  if (target.metric === "deals_proposal") {
    return deals.filter(d =>
      d.assigned_to === target.assigned_to &&
      ["proposal_sent", "negotiation", "won"].includes(d.stage) &&
      inRange(d.updated_at || d.created_at)
    ).length;
  }

  if (target.metric === "leads_created") {
    return leads.filter(l =>
      l.assigned_to === target.assigned_to &&
      l.stage !== "pipeline" &&
      inRange(l.created_at)
    ).length;
  }

  if (target.metric === "pipeline") {
    return leads.filter(l =>
      l.assigned_to === target.assigned_to &&
      l.stage === "pipeline" &&
      inRange(l.created_at)
    ).length;
  }

  if (target.metric === "calls") {
    return activities.filter(a =>
      a.created_by === target.assigned_to &&
      ["call", "follow_up_call", "phone_call", "cold_call"].includes(a.type) &&
      inRange(a.created_at)
    ).length;
  }

  if (target.metric === "follow_ups") {
    return activities.filter(a =>
      a.created_by === target.assigned_to &&
      ["follow_up_call", "follow_up_email", "follow_up", "followup"].includes(a.type) &&
      inRange(a.created_at)
    ).length;
  }

  if (target.metric === "emails") {
    return activities.filter(a =>
      a.created_by === target.assigned_to &&
      ["email", "follow_up_email", "email_sent"].includes(a.type) &&
      inRange(a.created_at)
    ).length;
  }

  if (target.metric === "proposals") {
    return activities.filter(a =>
      a.created_by === target.assigned_to &&
      ["proposal", "task"].includes(a.type) &&
      inRange(a.created_at)
    ).length + deals.filter(d =>
      d.assigned_to === target.assigned_to &&
      ["proposal_sent"].includes(d.stage) &&
      inRange(d.created_at)
    ).length;
  }

  if (target.metric === "demos") {
    return activities.filter(a =>
      a.created_by === target.assigned_to &&
      ["meeting_virtual", "meeting_person", "meeting"].includes(a.type) &&
      inRange(a.created_at)
    ).length;
  }

  return 0;
}

// Compute today's auto-progress (ignores manual override, for "today's contribution")
function computeTodayContribution(target, progressData) {
  const today = new Date().toISOString().slice(0, 10);
  return computeProgress(
    { ...target, start_date: today, end_date: today, achieved_value: null },
    progressData
  );
}

// ─── StatusBadge ────────────────────────────────────────────────────────────────
function StatusBadge({ pct, isOverdue }) {
  const s = getStatus(pct, isOverdue);
  const Ic = s.Icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
      <Ic size={11} /> {s.label}
    </span>
  );
}

// ─── MiniBar ────────────────────────────────────────────────────────────────────
function MiniBar({ pct }) {
  const color = pct >= 100 ? "#10B981" : pct >= 60 ? "#3B82F6" : pct >= 30 ? "#F59E0B" : "#EF4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden", minWidth: 60 }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 34, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

// ─── CreateEditModal ─────────────────────────────────────────────────────────────
function CreateEditModal({ existing, onClose, onSave, teamMembers }) {
  const isEdit = !!existing;

  const initMetricKey = existing?.metric?.startsWith("custom:") ? "custom" : (existing?.metric || "qualified_leads");
  const initCustomLabel = existing?.metric?.startsWith("custom:") ? existing.metric.slice(7) : "";

  const [selectedMetric,   setSelectedMetric]   = useState(initMetricKey);
  const [customMetricLabel,setCustomMetricLabel] = useState(initCustomLabel);
  const [periodType,       setPeriodType]        = useState(existing?.period_type || "monthly");

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      title:        existing?.title        || "",
      description:  existing?.description  || "",
      target_value: existing?.target_value || "",
      start_date:   existing?.start_date   || new Date().toISOString().slice(0, 10),
      end_date:     existing?.end_date     || "",
      assigned_to:  existing?.assigned_to  || "",
    },
  });

  const startDate = watch("start_date");

  // Auto-apply end date whenever period or start date changes
  useEffect(() => {
    if (!startDate) return;
    const d = new Date(startDate + "T00:00:00");
    if      (periodType === "daily")       { /* same day — leave as-is */ }
    else if (periodType === "weekly")      { d.setDate(d.getDate() + 6); }
    else if (periodType === "monthly")     { d.setMonth(d.getMonth() + 1); d.setDate(d.getDate() - 1); }
    else if (periodType === "quarterly")   { d.setMonth(d.getMonth() + 3); d.setDate(d.getDate() - 1); }
    else if (periodType === "half_yearly") { d.setMonth(d.getMonth() + 6); d.setDate(d.getDate() - 1); }
    else                                   { d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); }
    setValue("end_date", d.toISOString().slice(0, 10));
  }, [startDate, periodType, setValue]);

  const onSubmit = async (data) => {
    if (selectedMetric === "custom" && !customMetricLabel.trim()) {
      toast.error("Please enter a custom metric name");
      return;
    }
    const finalMetric = selectedMetric === "custom" ? `custom:${customMetricLabel.trim()}` : selectedMetric;
    await onSave({ ...data, metric: finalMetric, period_type: periodType, target_value: Number(data.target_value) });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 580, maxHeight: "92vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(37,99,235,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Crosshair size={17} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{isEdit ? "Edit Target" : "Create Target"}</h2>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-muted)" }}>{isEdit ? "Update target details" : "Set up a new sales target"}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 6 }}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Title + Description */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="crm-label">Target Title *</label>
              <input className="crm-input" {...register("title", { required: "Required" })} placeholder="e.g. Q2 Meetings Goal" />
              {errors.title && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.title.message}</span>}
            </div>
            <div>
              <label className="crm-label">Description</label>
              <textarea className="crm-input" {...register("description")} placeholder="Details about this target..." rows={2} style={{ resize: "vertical" }} />
            </div>
          </div>

          {/* Metric */}
          <div>
            <label className="crm-label">Metric *</label>
            <select
              className="crm-input"
              value={selectedMetric}
              onChange={e => setSelectedMetric(e.target.value)}
            >
              <option value="">— Select Target Type —</option>
              {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            {selectedMetric === "custom" && (
              <input
                className="crm-input"
                style={{ marginTop: 8 }}
                value={customMetricLabel}
                onChange={e => setCustomMetricLabel(e.target.value)}
                placeholder="e.g. Product Demos, Cold Calls, Client Visits…"
              />
            )}
          </div>

          {/* Period */}
          <div>
            <label className="crm-label">Period *</label>
            <select
              className="crm-input"
              value={periodType}
              onChange={e => setPeriodType(e.target.value)}
            >
              {PERIOD_TYPES.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="crm-label">Start Date *</label>
              <input className="crm-input" type="date" {...register("start_date", { required: "Required" })} />
              {errors.start_date && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.start_date.message}</span>}
            </div>
            <div>
              <label className="crm-label">End Date <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(auto-calculated)</span></label>
              <input className="crm-input" type="date" {...register("end_date")} />
            </div>
          </div>

          {/* Target Value */}
          <div>
            <label className="crm-label">Target Value *</label>
            <input
              className="crm-input" type="number" min="1"
              {...register("target_value", { required: "Required", min: { value: 1, message: "Must be ≥ 1" } })}
              placeholder={selectedMetric === "revenue" ? "e.g. 500000" : "e.g. 20"}
            />
            {errors.target_value && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.target_value.message}</span>}
          </div>

          {/* Assign To */}
          <div>
            <label className="crm-label">Assign Target To *</label>
            <select className="crm-input" {...register("assigned_to", { required: "Required" })}>
              <option value="">— Select Employee —</option>
              {[
                { role: "owner",         label: "Super Admin"           },
                { role: "admin",    label: "Sales Head"            },
                { role: "sales_manager", label: "Sales Manager"         },
                { role: "sales_rep",      label: "Sales Employee"        },
                { role: "sales_rep",  label: "Inside Sales Employee" },
              ].map(({ role, label }) => {
                const members = teamMembers.filter(m => m.role === role);
                if (!members.length) return null;
                return (
                  <optgroup key={role} label={label}>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </optgroup>
                );
              })}
            </select>
            {errors.assigned_to && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.assigned_to.message}</span>}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4, borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ minWidth: 130 }}>
              {isSubmitting ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : "Create Target")}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── ViewModal ───────────────────────────────────────────────────────────────────
function ViewModal({ target, progressData, teamMembers, onClose, fmtCurrency, symbol }) {
  const metric        = metricInfo(target.metric);
  const Ic            = metric.icon;
  const current       = computeProgress(target, progressData);
  const pct           = target.target_value > 0 ? Math.min(100, Math.round((current / target.target_value) * 100)) : 0;

  useEffect(() => {
    if (pct >= 100) {
      setTimeout(() => toast.success(`🏆 Target Achieved! "${target.title}" is 100% complete.`, { duration: 4000 }), 300);
    }
  }, []); // eslint-disable-line
  const isOverdue     = new Date(target.end_date) < new Date() && pct < 100;
  const assignee      = teamMembers.find(m => m.id === target.assigned_to);
  const creator       = teamMembers.find(m => m.id === target.created_by);
  const barColor      = pct >= 100 ? "#10B981" : pct >= 60 ? "#3B82F6" : pct >= 30 ? "#F59E0B" : "#EF4444";
  const todayContrib  = computeTodayContribution(target, progressData);
  const remaining     = Math.max(0, target.target_value - current);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 480 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${metric.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ic size={19} style={{ color: metric.color }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{target.title}</h2>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{metric.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <StatusBadge pct={pct} isOverdue={isOverdue} />

          {/* Progress block */}
          <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Progress</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: barColor }}>{pct}%</span>
            </div>
            <div style={{ height: 10, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
              <motion.div
                initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                style={{ height: "100%", background: barColor, borderRadius: 99 }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ color: "var(--text-2)" }}>Achieved: <strong>{fmtMetric(current, target.metric, fmtCurrency)}</strong></span>
              <span style={{ color: "var(--text-muted)" }}>Target: {fmtMetric(target.target_value, target.metric, fmtCurrency)}</span>
            </div>
          </div>

          {/* Today's contribution + remaining */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 600, marginBottom: 3 }}>TODAY'S CONTRIBUTION</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                {metric.key === "revenue" ? fmtMetric(todayContrib, "revenue", fmtCurrency) : `${Number(todayContrib).toLocaleString("en-IN")} ${metric.unit}`}
              </div>
            </div>
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#EF4444", fontWeight: 600, marginBottom: 3 }}>REMAINING</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                {pct >= 100 ? "✓ Complete" : metric.key === "revenue" ? fmtMetric(remaining, "revenue", fmtCurrency) : `${Number(remaining).toLocaleString("en-IN")} ${metric.unit}`}
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Assigned To",   value: assignee?.full_name || "—" },
              { label: "Assigned By",   value: creator?.full_name  || "—" },
              { label: "Period",        value: target.period_type ? target.period_type.charAt(0).toUpperCase() + target.period_type.slice(1) : "—" },
              { label: "Target Value",  value: fmtMetric(target.target_value, target.metric, fmtCurrency) },
              { label: "Start Date",    value: new Date(target.start_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) },
              { label: "End Date",      value: new Date(target.end_date).toLocaleDateString("en-IN",   { day: "2-digit", month: "short", year: "numeric" }) },
            ].map(f => (
              <div key={f.label} style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{f.value}</div>
              </div>
            ))}
          </div>

          {target.description && (
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Description</div>
              <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{target.description}</div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}


// ─── TargetTable ─────────────────────────────────────────────────────────────────
function TargetTable({ targets, progressData, teamMembers, canCreate, myId, onView, onEdit, onDelete, fmtCurrency }) {
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  const rows = useMemo(() => targets.map(t => {
    const current   = computeProgress(t, progressData);
    const pct       = t.target_value > 0 ? Math.min(100, Math.round((current / t.target_value) * 100)) : 0;
    const isOverdue = new Date(t.end_date) < new Date() && pct < 100;
    const assignee  = teamMembers.find(m => m.id === t.assigned_to);
    const creator   = teamMembers.find(m => m.id === t.created_by);
    const metric    = metricInfo(t.metric);
    return { ...t, current, pct, isOverdue, assigneeName: assignee?.full_name || "—", creatorName: creator?.full_name || "—", metricLabel: metric.label, metricColor: metric.color };
  }), [targets, progressData, teamMembers]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    let av = a[sortKey] ?? "", bv = b[sortKey] ?? "";
    if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  }), [rows, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const TH = ({ label, sk }) => (
    <th
      onClick={() => sk && handleSort(sk)}
      style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", cursor: sk ? "pointer" : "default", userSelect: "none", background: "var(--surface-2)" }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {label}
        {sk && sortKey === sk && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  );

  if (!sorted.length) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0" }}>
        <Crosshair size={48} style={{ color: "var(--border)", margin: "0 auto 16px", display: "block" }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)", marginBottom: 6 }}>No targets found</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {canCreate ? "No targets match the current filters." : "No targets have been assigned to you yet."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <TH label="#" />
            <TH label="Target Title" sk="title" />
            <TH label="Assigned To" sk="assigneeName" />
            <TH label="Assigned By" sk="creatorName" />
            <TH label="Type" sk="metricLabel" />
            <TH label="Target Value" />
            <TH label="Achieved" />
            <TH label="Progress" sk="pct" />
            <TH label="Period" sk="period_type" />
            <TH label="End Date" sk="end_date" />
            <TH label="Status" sk="pct" />
            <TH label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const isCreator = row.created_by === myId;
            return (
              <tr
                key={row.id}
                style={{ borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                onMouseLeave={e => e.currentTarget.style.background = ""}
              >
                <td style={{ padding: "12px 14px", color: "var(--text-muted)", fontWeight: 600, fontSize: 12 }}>{idx + 1}</td>
                <td style={{ padding: "12px 14px", maxWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: row.metricColor, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</span>
                  </div>
                  {row.description && (
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, paddingLeft: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{row.description}</div>
                  )}
                </td>
                <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                      {(row.assigneeName || "?")[0].toUpperCase()}
                    </div>
                    <span style={{ color: "var(--text-2)" }}>{row.assigneeName}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{row.creatorName}</td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: row.metricColor, background: `${row.metricColor}15`, padding: "2px 8px", borderRadius: 20 }}>
                    {row.metricLabel}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                  {fmtMetric(row.target_value, row.metric, fmtCurrency)}
                </td>
                <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--text-2)" }}>{fmtMetric(row.current, row.metric, fmtCurrency)}</span>
                </td>
                <td style={{ padding: "12px 14px", minWidth: 130 }}>
                  <MiniBar pct={row.pct} />
                </td>
                <td style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: 12, textTransform: "capitalize" }}>{row.period_type}</td>
                <td style={{ padding: "12px 14px", color: row.isOverdue ? "#EF4444" : "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                  {new Date(row.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <StatusBadge pct={row.pct} isOverdue={row.isOverdue} />
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => onView(row)} title="View Details" style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", padding: "4px 6px", color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
                      <Eye size={13} />
                    </button>
                    {isCreator && (
                      <button onClick={() => onEdit(row)} title="Edit Target" style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", padding: "4px 6px", color: "var(--accent)", display: "flex", alignItems: "center" }}>
                        <Edit2 size={13} />
                      </button>
                    )}
                    {isCreator && (
                      <button onClick={() => onDelete(row.id)} title="Delete Target" style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", padding: "4px 6px", color: "#EF4444", display: "flex", alignItems: "center" }}>
                        <Trash2 size={13} />
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
}

// ─── AnalyticsView ────────────────────────────────────────────────────────────────
function AnalyticsView({ targets, progressData, teamMembers, fmtCurrency }) {
  const memberStats = useMemo(() => {
    const map = {};
    for (const t of targets) {
      const current = computeProgress(t, progressData);
      const pct     = t.target_value > 0 ? Math.min(100, Math.round((current / t.target_value) * 100)) : 0;
      if (!map[t.assigned_to]) {
        const m = teamMembers.find(tm => tm.id === t.assigned_to);
        map[t.assigned_to] = { name: (m?.full_name || "Unknown").split(" ")[0], totalPct: 0, count: 0, achieved: 0 };
      }
      map[t.assigned_to].totalPct += pct;
      map[t.assigned_to].count++;
      if (pct >= 100) map[t.assigned_to].achieved++;
    }
    return Object.values(map)
      .map(m => ({ ...m, avgPct: Math.round(m.totalPct / m.count) }))
      .sort((a, b) => b.avgPct - a.avgPct)
      .slice(0, 10);
  }, [targets, progressData, teamMembers]);

  const metricDist = useMemo(() => {
    const map = {};
    for (const t of targets) map[t.metric] = (map[t.metric] || 0) + 1;
    return Object.entries(map).map(([key, value]) => ({ name: metricInfo(key).label, value, color: metricInfo(key).color }));
  }, [targets]);

  const statusDist = useMemo(() => {
    let achieved = 0, onTrack = 0, atRisk = 0, behind = 0, overdue = 0;
    for (const t of targets) {
      const current   = computeProgress(t, progressData);
      const pct       = t.target_value > 0 ? Math.min(100, Math.round((current / t.target_value) * 100)) : 0;
      const isOverdue = new Date(t.end_date) < new Date() && pct < 100;
      if (pct >= 100) achieved++;
      else if (isOverdue) overdue++;
      else if (pct >= 60) onTrack++;
      else if (pct >= 30) atRisk++;
      else behind++;
    }
    return [
      { name: "Achieved", value: achieved, color: "#10B981" },
      { name: "On Track", value: onTrack,  color: "#3B82F6" },
      { name: "At Risk",  value: atRisk,   color: "#F59E0B" },
      { name: "Behind",   value: behind,   color: "#EF4444" },
      { name: "Overdue",  value: overdue,  color: "#DC2626" },
    ].filter(d => d.value > 0);
  }, [targets, progressData]);

  const tipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

  if (!targets.length) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
        <BarChart2 size={48} style={{ margin: "0 auto 16px", display: "block", opacity: 0.3 }} />
        <div style={{ fontSize: 15, fontWeight: 600 }}>No data to analyze</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Create targets to see analytics here</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Row 1: Team performance bar + Metric pie */}
      <div style={{ display: "grid", gridTemplateColumns: memberStats.length > 1 ? "1.6fr 1fr" : "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Team Performance</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Average completion % per member</div>
          {memberStats.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={memberStats} margin={{ top: 0, right: 0, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                <RTooltip contentStyle={tipStyle} formatter={(v) => [`${v}%`, "Avg Completion"]} />
                <Bar dataKey="avgPct" name="Avg Completion" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>By Metric Type</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Distribution of target types</div>
          {metricDist.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={metricDist} cx="50%" cy="42%" innerRadius={50} outerRadius={76} dataKey="value" paddingAngle={4} strokeWidth={0}>
                  {metricDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <RTooltip contentStyle={tipStyle} formatter={(v, n) => [v, n]} />
                <Legend formatter={v => <span style={{ fontSize: 11, color: "var(--text-2)" }}>{v}</span>} iconSize={8} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 2: Status breakdown + Top performers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Status Breakdown</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>All targets by current status</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {statusDist.map(s => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--text-2)", flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: s.color, minWidth: 20 }}>{s.value}</span>
                <div style={{ width: 64, height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round((s.value / targets.length) * 100)}%`, background: s.color, borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 32, textAlign: "right" }}>{Math.round((s.value / targets.length) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
            <Trophy size={15} style={{ color: "#F59E0B" }} /> Top Performers
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Ranked by average completion rate</div>
          {memberStats.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>No data</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {memberStats.slice(0, 6).map((m, i) => {
                const rankColor = i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : i === 2 ? "#B45309" : "var(--text-muted)";
                return (
                  <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${rankColor}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: rankColor, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 13, color: "var(--text-2)", flex: 1, fontWeight: 500 }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.count} target{m.count !== 1 ? "s" : ""}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: m.avgPct >= 100 ? "#10B981" : m.avgPct >= 60 ? "#3B82F6" : m.avgPct >= 30 ? "#F59E0B" : "#EF4444" }}>
                      {m.avgPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────────
export default function Targets() {
  const { profile } = useAuth();
  const { format: fmtCurrency, symbol } = useCurrency();
  const qc = useQueryClient();

  const isOwnerOrHead  = ["owner", "admin"].includes(profile?.role);
  const isManager      = profile?.role === "sales_manager";
  const isFieldUser    = ["sales_rep", "sales_rep"].includes(profile?.role);
  const canCreate      = isOwnerOrHead; // Only Super Admin + Sales Head can create targets

  const [activeTab,    setActiveTab]    = useState("table");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMetric, setFilterMetric] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("");
  const [filterUser,   setFilterUser]   = useState("");
  const [showCreate,   setShowCreate]   = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [viewTarget,   setViewTarget]   = useState(null);

  // ── Team IDs for Sales Manager ─────────────────────────────────────────────
  const { data: myTeamIds = [] } = useQuery({
    queryKey: ["my-team-ids", profile?.id],
    enabled:  isManager && !!profile?.id,
    queryFn:  async () => {
      const { data } = await supabase.from("profiles").select("id").eq("manager_id", profile.id);
      return (data || []).map(m => m.id);
    },
  });

  // ── All team members (for dropdowns, lookups) ───────────────────────────────
  const { data: allMembers = [] } = useQuery({
    queryKey: ["team-members-targets"],
    queryFn:  async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, role, manager_id").order("full_name");
      return data || [];
    },
  });

  // Members visible to current user (for filter dropdowns)
  const visibleMembers = useMemo(() => {
    if (isOwnerOrHead) return allMembers;
    if (isManager) {
      const myIds = new Set([profile.id, ...myTeamIds]);
      return allMembers.filter(m => myIds.has(m.id));
    }
    return allMembers.filter(m => m.id === profile?.id);
  }, [allMembers, isOwnerOrHead, isManager, myTeamIds, profile?.id]);

  // Members the current user is allowed to assign targets TO (RBAC-filtered)
  const assignableMembers = useMemo(() => {
    const allowed = ASSIGNABLE_TO_ROLES[profile?.role] || [];
    if (!allowed.length) return [];
    const base = allMembers.filter(m => allowed.includes(m.role));
    // Sales managers can only assign to their own direct reports
    if (isManager) return base.filter(m => myTeamIds.includes(m.id));
    return base;
  }, [allMembers, profile?.role, isManager, myTeamIds]);

  // ── Targets query ────────────────────────────────────────────────────────────
  const { data: allTargets = [], isLoading } = useQuery({
    queryKey: ["targets", profile?.role, profile?.id, myTeamIds],
    enabled:  !!profile,
    queryFn:  async () => {
      let q = supabase.from("targets").select("*").order("created_at", { ascending: false });
      if (isFieldUser) {
        // Employees see only their own assigned targets
        q = q.eq("assigned_to", profile.id);
      } else if (isManager) {
        // Managers see: targets assigned TO them OR targets created BY them
        q = q.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);
      }
      // Owner/SalesHead: no filter — see everything
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // ── Progress data ────────────────────────────────────────────────────────────
  const { data: progressData } = useQuery({
    queryKey: ["targets-progress"],
    queryFn:  fetchAllProgress,
    refetchInterval: 30000,
    staleTime:       15000,
  });

  // ── Mutations (backend-enforced RBAC) ─────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload) => targetsApi("POST", "/api/targets", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["targets"] });
      setShowCreate(false);
      toast.success("Target created successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => targetsApi("PUT", `/api/targets/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["targets"] });
      setEditTarget(null);
      toast.success("Target updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => targetsApi("DELETE", `/api/targets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["targets"] }); toast.success("Target deleted"); },
    onError:   (e) => toast.error(e.message),
  });

  const handleDelete = (id) => {
    if (window.confirm("Delete this target permanently?")) deleteMutation.mutate(id);
  };

  // ── Real-time: invalidate progress when leads/deals/activities/meetings change ─
  useEffect(() => {
    const channel = supabase
      .channel("targets-live-progress")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        qc.invalidateQueries({ queryKey: ["targets-progress"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => {
        qc.invalidateQueries({ queryKey: ["targets-progress"] });
        qc.invalidateQueries({ queryKey: ["targets"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        qc.invalidateQueries({ queryKey: ["targets-progress"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => {
        qc.invalidateQueries({ queryKey: ["targets-progress"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => allTargets.filter(t => {
    if (filterMetric && t.metric      !== filterMetric) return false;
    if (filterPeriod && t.period_type !== filterPeriod) return false;
    if (filterUser   && t.assigned_to !== filterUser)   return false;
    if (filterStatus) {
      const current   = computeProgress(t, progressData);
      const pct       = t.target_value > 0 ? Math.min(100, Math.round((current / t.target_value) * 100)) : 0;
      const isOverdue = new Date(t.end_date) < new Date() && pct < 100;
      const match = (
        (filterStatus === "achieved" && pct >= 100) ||
        (filterStatus === "ontrack"  && !isOverdue && pct >= 60 && pct < 100) ||
        (filterStatus === "atrisk"   && !isOverdue && pct >= 30 && pct < 60) ||
        (filterStatus === "behind"   && !isOverdue && pct < 30) ||
        (filterStatus === "overdue"  && isOverdue)
      );
      if (!match) return false;
    }
    return true;
  }), [allTargets, filterMetric, filterPeriod, filterUser, filterStatus, progressData]);

  // ── Summary stats ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let achieved = 0, onTrack = 0, atRisk = 0, overdue = 0;
    for (const t of filtered) {
      const current   = computeProgress(t, progressData);
      const pct       = t.target_value > 0 ? Math.min(100, Math.round((current / t.target_value) * 100)) : 0;
      const isOverdue = new Date(t.end_date) < new Date() && pct < 100;
      if (pct >= 100) achieved++;
      else if (isOverdue) overdue++;
      else if (pct >= 60) onTrack++;
      else atRisk++;
    }
    return { total: filtered.length, achieved, onTrack, atRisk, overdue };
  }, [filtered, progressData]);

  const hasFilters = filterStatus || filterMetric || filterPeriod || filterUser;
  const roleLabel  = isOwnerOrHead ? "All Targets" : isManager ? "Team Targets" : "My Targets";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 24px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Crosshair size={20} style={{ color: "var(--accent)" }} />
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Sales Targets</h1>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 20, padding: "2px 10px" }}>
                {roleLabel} · {allTargets.length}
              </span>
            </div>
            <p style={{ margin: "2px 0 0 28px", fontSize: 12.5, color: "var(--text-muted)" }}>
              {isOwnerOrHead ? "Full org-wide target tracking & analytics" : isManager ? "Your team's targets and performance" : "Your assigned targets and progress"}
            </p>
          </div>
          {canCreate && (
            <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ height: 36 }}>
              <Plus size={14} /> Create Target
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { key: "table",     label: "Table View", Icon: LayoutList  },
            ...(!isFieldUser ? [{ key: "analytics", label: "Analytics",  Icon: BarChart2  }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 20px", fontFamily: "inherit", fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 400, color: activeTab === tab.key ? "var(--accent)" : "var(--text-muted)", borderBottom: `2px solid ${activeTab === tab.key ? "var(--accent)" : "transparent"}`, marginBottom: -1, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
            >
              <tab.Icon size={14} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

        {/* ── KPI Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total",    value: stats.total,    color: "#6B7280", Icon: Crosshair   },
            { label: "Achieved", value: stats.achieved, color: "#10B981", Icon: Trophy      },
            { label: "On Track", value: stats.onTrack,  color: "#3B82F6", Icon: TrendingUp  },
            { label: "At Risk",  value: stats.atRisk,   color: "#F59E0B", Icon: AlertCircle },
            { label: "Overdue",  value: stats.overdue,  color: "#EF4444", Icon: Clock       },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${s.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <s.Icon size={18} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <select className="crm-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: "auto", height: 36, fontSize: 13 }}>
            <option value="">All Statuses</option>
            <option value="achieved">Achieved</option>
            <option value="ontrack">On Track</option>
            <option value="atrisk">At Risk</option>
            <option value="behind">Behind</option>
            <option value="overdue">Overdue</option>
          </select>
          <select className="crm-input" value={filterMetric} onChange={e => setFilterMetric(e.target.value)} style={{ width: "auto", height: 36, fontSize: 13 }}>
            <option value="">All Metrics</option>
            {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <select className="crm-input" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} style={{ width: "auto", height: 36, fontSize: 13 }}>
            <option value="">All Periods</option>
            {PERIOD_TYPES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {!isFieldUser && visibleMembers.length > 1 && (
            <select className="crm-input" value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{ width: "auto", height: 36, fontSize: 13 }}>
              <option value="">All Members</option>
              {visibleMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}
          {hasFilters && (
            <button className="btn-ghost" style={{ height: 36, fontSize: 13 }} onClick={() => { setFilterStatus(""); setFilterMetric(""); setFilterPeriod(""); setFilterUser(""); }}>
              <X size={13} /> Clear
            </button>
          )}
          {hasFilters && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Showing {filtered.length} of {allTargets.length}</span>
          )}
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12, color: "var(--text-muted)" }}>
            <div style={{ width: 32, height: 32, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13 }}>Loading targets…</span>
          </div>
        ) : activeTab === "analytics" ? (
          <AnalyticsView
            targets={filtered}
            progressData={progressData}
            teamMembers={allMembers}
            fmtCurrency={fmtCurrency}
          />
        ) : (
          <TargetTable
            targets={filtered}
            progressData={progressData}
            teamMembers={allMembers}
            canCreate={canCreate}
            myId={profile?.id}
            onView={setViewTarget}
            onEdit={setEditTarget}
            onDelete={handleDelete}
            fmtCurrency={fmtCurrency}
          />
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showCreate && (
          <CreateEditModal
            onClose={() => setShowCreate(false)}
            onSave={createMutation.mutateAsync}
            teamMembers={assignableMembers}
          />
        )}
        {editTarget && (
          <CreateEditModal
            existing={editTarget}
            onClose={() => setEditTarget(null)}
            onSave={async (payload) => updateMutation.mutateAsync({ id: editTarget.id, payload })}
            teamMembers={assignableMembers}
          />
        )}
        {viewTarget && (
          <ViewModal
            target={viewTarget}
            progressData={progressData}
            teamMembers={allMembers}
            onClose={() => setViewTarget(null)}
            fmtCurrency={fmtCurrency}
            symbol={symbol}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
