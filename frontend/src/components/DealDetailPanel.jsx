import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ACTIVITY_TYPES } from "../constants/activityTypes";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { dealsService } from "../services/dealsService";
import { changeHistoryService } from "../services/changeHistoryService";
import { db as supabase } from "../lib/db";
import { getAccessToken } from "../lib/session";
import toast from "react-hot-toast";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");
import {
  X, Building2, User, Phone, Mail, Briefcase, Calendar, Tag,
  Clock, Activity, Pencil, ChevronRight, Hash, Thermometer,
  Plus, PhoneCall, Video, FileText, CheckCircle2,
  Zap, Bell, RefreshCw, Download, Link2, ArrowRightLeft,
  IndianRupee, Target, AlertTriangle, History, RotateCcw, Users,
  Globe, MapPin,
} from "lucide-react";
import { countryName } from "../constants/countries";
import { format, formatDistanceToNow } from "date-fns";

const FUNNEL_STATUSES = [
  { key: "new",               label: "New",               color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
  { key: "contacted",         label: "Contacted",         color: "#3B82F6", bg: "rgba(59,130,246,0.12)"  },
  { key: "meeting_scheduled", label: "Meeting Scheduled", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)"  },
  { key: "proposal_sent",     label: "Proposal Sent",     color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  { key: "negotiation",       label: "Negotiation",       color: "#F97316", bg: "rgba(249,115,22,0.12)"  },
  { key: "won",               label: "Won",               color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  { key: "lost",              label: "Lost",              color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
];

// Static FX rates relative to INR (updated periodically — not live)
const FX_RATES_FROM_INR = {
  INR: 1, USD: 0.01197, EUR: 0.01073, GBP: 0.00921,
  AED: 0.04395, SGD: 0.01596, JPY: 1.832, AUD: 0.01858,
  CAD: 0.01647, CHF: 0.01031, SAR: 0.04487, CNY: 0.08660,
};
const FX_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "د.إ", SGD: "S$", JPY: "¥", AUD: "A$", CAD: "C$", CHF: "Fr", SAR: "﷼", CNY: "¥" };
const FX_LABELS  = { INR: "Indian Rupee", USD: "US Dollar", EUR: "Euro", GBP: "British Pound", AED: "UAE Dirham", SGD: "Singapore Dollar", JPY: "Japanese Yen", AUD: "Australian Dollar", CAD: "Canadian Dollar", CHF: "Swiss Franc", SAR: "Saudi Riyal", CNY: "Chinese Yuan" };

const LEAD_STAGE_LABELS = {
  new: "New", contacted: "Contacted", qualified: "Qualified",
  proposal: "Proposal", converted: "Converted", won: "Won", lost: "Lost",
};

const LEAD_TEMP_COLORS = { hot: "#EF4444", warm: "#F59E0B", cold: "#3B82F6" };

const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };

const fmtDate = (d) => {
  if (!d) return null;
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return null; }
};

const fmtRelative = (d) => {
  if (!d) return null;
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return null; }
};

function downloadICS({ title, description, scheduledAt, uid }) {
  const dt  = new Date(scheduledAt);
  const end = new Date(dt.getTime() + 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Sales CRM//EN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(dt)}`,`DTEND:${fmt(end)}`,
    `SUMMARY:${(title || "").replace(/[,;]/g, " ")}`,
    `DESCRIPTION:${(description || "").replace(/\n/g, "\\n")}`,
    `UID:${uid}@salescrm.app`,
    "END:VEVENT","END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "event.ics" });
  a.click(); URL.revokeObjectURL(a.href);
}

function InfoRow({ icon: Icon, label, value, isLink, isEmail, isPhone, onComposeEmail }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={13} style={{ color: "var(--text-muted)" }} strokeWidth={1.7} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
        {isLink ? (
          <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: "#3B82F6", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
            View <ChevronRight size={11} strokeWidth={2} />
          </a>
        ) : isEmail ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#3B82F6", fontWeight: 500 }}>{value}</span>
            {onComposeEmail && (
              <button
                onClick={() => onComposeEmail(value)}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 6, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                <Mail size={10} strokeWidth={2} /> Send Email
              </button>
            )}
          </div>
        ) : isPhone ? (
          <a href={`tel:${value}`} style={{ fontSize: 13, color: "#3B82F6", textDecoration: "none", fontWeight: 500 }}>{value}</a>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500, lineHeight: 1.5 }}>{value}</div>
        )}
      </div>
    </div>
  );
}

function SectionHead({ label }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 2, marginTop: 20, display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

const ACT_TYPE_MAP = {
  follow_up:       { label: "Follow-up",          icon: PhoneCall,    color: "#3B82F6" },
  followup:        { label: "Follow-up",          icon: RefreshCw,    color: "#F59E0B" },
  follow_up_call:  { label: "Follow-up Call",     icon: PhoneCall,    color: "#3B82F6" },
  follow_up_email: { label: "Follow-up Email",    icon: Mail,         color: "#6366F1" },
  meeting:         { label: "Meeting",            icon: Calendar,     color: "#8B5CF6" },
  meeting_person:  { label: "Meeting (In-Person)",icon: Calendar,     color: "#8B5CF6" },
  meeting_virtual: { label: "Meeting (Virtual)",  icon: Video,        color: "#06B6D4" },
  call:            { label: "Call",               icon: PhoneCall,    color: "#3B82F6" },
  phone_call:      { label: "Phone Call",         icon: PhoneCall,    color: "#3B82F6" },
  email:           { label: "Email",              icon: Mail,         color: "#EC4899" },
  email_contact:   { label: "Email Contact",      icon: Mail,         color: "#EC4899" },
  note:            { label: "Note",               icon: FileText,     color: "#10B981" },
  task:            { label: "Task",               icon: CheckCircle2, color: "#06B6D4" },
  reminder:        { label: "Reminder",           icon: Bell,         color: "#EF4444" },
  proposal:        { label: "Proposal",           icon: Zap,          color: "#F97316" },
  general:         { label: "Note",               icon: FileText,     color: "#6B7280" },
  stage_change:    { label: "Stage Changed",      icon: RefreshCw,    color: "#F59E0B" },
  visit:           { label: "Visit",              icon: Calendar,     color: "#10B981" },
  virtual_meeting: { label: "Virtual Meeting",    icon: Video,        color: "#06B6D4" },
  lifecycle:       { label: "Lifecycle Event",    icon: RefreshCw,    color: "#8B5CF6" },
};


/* ─── Activity source chip ───────────────────────────────────────────────── */
function SourceChip({ activity }) {
  if (activity.related_type === "deal") {
    return <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.2)" }}>DEAL</span>;
  }
  if (activity.lead_id || activity.related_type === "lead") {
    return <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.2)" }}>LEAD</span>;
  }
  return null;
}

/* ─── Add Activity Form ───────────────────────────────────────────────────── */
function AddActivityForm({ dealId, profile, onSuccess, services = [], existingActivities = [], editingActivity = null, onCancelEdit }) {
  const [saving, setSaving]   = useState(false);
  const [actType, setActType] = useState("follow_up_call");
  const [remarks, setRemarks] = useState("");
  const [date, setDate]       = useState("");
  const [time, setTime]       = useState("");

  const svcOptions = services.length > 0
    ? (services.length === 1 ? services : [...services, "Cumulative"])
    : [];
  const [actService, setActService] = useState(() => svcOptions.length === 1 ? svcOptions[0] : "");
  const coveredServices = existingActivities.map((a) => a.metadata?.service).filter((s) => s && s !== "Cumulative");
  const pureServices = svcOptions.filter((s) => s !== "Cumulative");
  const pendingServices = pureServices.filter((s) => !coveredServices.includes(s));

  useEffect(() => {
    if (editingActivity) {
      const meta = editingActivity.metadata || {};
      setActType(editingActivity.type || "follow_up_call");
      setRemarks(meta.remarks || "");
      if (editingActivity.due_date) {
        const d = new Date(editingActivity.due_date);
        setDate(d.toISOString().slice(0, 10));
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        setTime(hh === "00" && mm === "00" ? "" : `${hh}:${mm}`);
      } else { setDate(""); setTime(""); }
      if (meta.service) setActService(meta.service);
    } else {
      setActType("follow_up_call"); setRemarks(""); setDate(""); setTime("");
      setActService(svcOptions.length === 1 ? svcOptions[0] : "");
    }
  }, [editingActivity]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!remarks.trim()) { toast.error("Remarks are required"); return; }
    if (svcOptions.length > 0 && !actService) { toast.error("Please select a service"); return; }
    setSaving(true);
    try {
      const typeInfo    = ACTIVITY_TYPES.find((t) => t.key === actType);
      const typeLabel   = typeInfo?.label || actType;
      const scheduledAt = date ? (time ? `${date}T${time}` : date) : null;
      const token = await getAccessToken();
      if (editingActivity) {
        const res = await fetch(`${API}/api/activities/${editingActivity.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type:        actType,
            title:       `${typeLabel}: ${remarks.trim()}`,
            description: `[${typeLabel}] ${remarks.trim()}`,
            due_date:    scheduledAt || null,
            metadata:    { activity_type: actType, remarks: remarks.trim(), scheduled_at: scheduledAt, ...(actService ? { service: actService } : {}) },
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update activity");
        }
        toast.success("Activity updated");
        onCancelEdit?.();
      } else {
        const res = await fetch(`${API}/api/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            deal_id:      dealId,
            related_type: "deal",
            related_id:   dealId,
            user_id:      profile?.id,
            type:         actType,
            title:        `${typeLabel}: ${remarks.trim()}`,
            description:  `[${typeLabel}] ${remarks.trim()}`,
            status:       scheduledAt ? "todo" : "done",
            priority:     "medium",
            due_date:     scheduledAt || null,
            metadata:     { activity_type: actType, remarks: remarks.trim(), scheduled_at: scheduledAt, ...(actService ? { service: actService } : {}) },
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to log activity");
        }
        toast.success("Activity logged");
        setRemarks(""); setDate(""); setTime(""); setActType("follow_up_call");
        setActService(svcOptions.length === 1 ? svcOptions[0] : "");
      }
      onSuccess?.();
    } catch (err) {
      toast.error("Failed: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: "16px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)", marginBottom: 20 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        {editingActivity ? <Pencil size={13} style={{ color: "var(--accent)" }} strokeWidth={2.5} /> : <Plus size={13} style={{ color: "var(--accent)" }} strokeWidth={2.5} />}
        {editingActivity ? "Edit Activity" : "Log Activity"}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>Activity Type</label>
        <select className="crm-input" value={actType} onChange={(e) => setActType(e.target.value)} style={{ height: 36 }}>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </div>

      {pendingServices.length > 0 && pureServices.length > 1 && (
        <div style={{ marginBottom: 10, padding: "7px 10px", borderRadius: 8, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Pending Services</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {pendingServices.map((svc) => (
              <span key={svc} onClick={() => setActService(svc)} style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 99, background: "rgba(245,158,11,0.1)", color: "#D97706", fontWeight: 600, border: "1px solid rgba(245,158,11,0.25)", cursor: "pointer" }}>
                {svc}
              </span>
            ))}
          </div>
        </div>
      )}
      {svcOptions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>
            Service *
          </label>
          <select
            className="crm-input"
            style={{ height: 36, fontSize: 13, width: "100%", borderColor: svcOptions.length > 1 && !actService ? "rgba(239,68,68,0.5)" : undefined }}
            value={actService}
            onChange={(e) => setActService(e.target.value)}
          >
            {svcOptions.length > 1 && <option value="">Select service...</option>}
            {svcOptions.map((svc) => <option key={svc} value={svc}>{svc}</option>)}
          </select>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>Remarks *</label>
        <textarea className="crm-input" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)}
          placeholder="Notes, outcome, next steps..." style={{ resize: "vertical", width: "100%", boxSizing: "border-box" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>Date</label>
          <input className="crm-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ height: 36 }} />
        </div>
        <div>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>Time</label>
          <input className="crm-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ height: 36 }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {editingActivity && (
          <button type="button" onClick={onCancelEdit}
            style={{ flex: 1, height: 36, fontSize: 12.5, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: "var(--text-muted)", fontWeight: 600 }}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={saving || !remarks.trim()} style={{ flex: 1, height: 36, fontSize: 12.5 }}>
          {saving ? "Saving..." : editingActivity ? "Update Activity" : "Log Activity"}
        </button>
      </div>
    </form>
  );
}

/* ─── Activity Timeline Item ──────────────────────────────────────────────── */
function ActivityItem({ activity, isLast, onEdit }) {
  const key   = activity.type?.toLowerCase().replace(/[^a-z_]/g, "") || "follow_up";
  const info  = ACT_TYPE_MAP[key] || ACT_TYPE_MAP.follow_up;
  const color = info.color;
  const TIcon = info.icon;
  const meta  = activity.metadata || {};
  const sched = meta.scheduled_at;
  const text  = activity.title || activity.description || "";
  const isSystemType = ["stage_change", "deal_created", "email_contact", "email_sent"].includes(activity.type);

  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      {!isLast && (
        <div style={{ position: "absolute", left: 15, top: 32, bottom: -4, width: 1, background: "var(--border)" }} />
      )}
      <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: `${color}14`, border: `1.5px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <TIcon size={13} style={{ color }} strokeWidth={1.8} />
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55, fontWeight: 500, flex: 1 }}>{text}</div>
          {!isSystemType && onEdit && (
            <button type="button" onClick={() => onEdit(activity)} title="Edit activity"
              style={{ flexShrink: 0, padding: "2px 6px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", fontFamily: "inherit" }}>
              <Pencil size={10} strokeWidth={2} />
            </button>
          )}
        </div>
        {sched && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Calendar size={9} strokeWidth={2} />
              {fmtDate(sched)}{sched.length > 10 ? ` · ${format(new Date(sched), "h:mm a")}` : ""}
            </span>
            <button title="Add to Calendar (.ics)"
              onClick={() => downloadICS({ title: text, description: meta.remarks || text, scheduledAt: sched, uid: activity.id })}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--accent)", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <Download size={8} strokeWidth={2} /> .ics
            </button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
          <SourceChip activity={activity} />
          {meta.service && (
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: meta.service === "Cumulative" ? "rgba(139,92,246,0.1)" : "rgba(37,99,235,0.08)", color: meta.service === "Cumulative" ? "#8B5CF6" : "#3B82F6", border: `1px solid ${meta.service === "Cumulative" ? "rgba(139,92,246,0.25)" : "rgba(37,99,235,0.2)"}` }}>
              {meta.service}
            </span>
          )}
          {activity.user?.full_name && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              {activity.user.full_name}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.55 }}>
            {fmtRelative(activity.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", gap: 12 }}>
          <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 13, width: "80%", borderRadius: 6, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 11, width: "45%", borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const DEAL_TABS = [
  { key: "details",  label: "Details",  icon: User     },
  { key: "contacts", label: "Contacts", icon: Users    },
  { key: "timeline", label: "Timeline", icon: Activity  },
  { key: "history",  label: "History",  icon: History  },
];

/* ─── History Tab ─────────────────────────────────────────────────────────── */
const DEAL_HISTORY_CFG = {
  contact_name:  { title: "POC Changed",            color: "#8B5CF6", icon: User           },
  stage:         { title: "Stage Changed",           color: "#3B82F6", icon: Tag            },
  temperature:   { title: "Temperature Updated",     color: "#F59E0B", icon: Thermometer    },
  value:         { title: "Deal Value Updated",      color: "#10B981", icon: IndianRupee    },
  close_date:    { title: "Close Date Changed",      color: "#F97316", icon: Calendar       },
  company_name:  { title: "Company Name Updated",    color: "#6B7280", icon: Building2      },
  assigned_to:   { title: "Reassigned",              color: "#06B6D4", icon: Users          },
  conversion:    { title: "Deal Created from Lead",  color: "#10B981", icon: ArrowRightLeft },
  created:       { title: "Deal Created",            color: "#6366F1", icon: Zap            },
  form_unlocked: { title: "Form Unlocked",           color: "#10B981", icon: RefreshCw      },
  remarks:       { title: "Remarks Updated",         color: "#6B7280", icon: FileText       },
  designation:   { title: "Designation Changed",     color: "#6B7280", icon: Briefcase      },
};

const DEAL_TEMP_LABELS = { hot: "Hot", warm: "Warm", cold: "Cold" };
const DEAL_STAGE_FMT   = {
  new: "New", contacted: "Contacted", meeting_scheduled: "Meeting Scheduled",
  proposal_sent: "Proposal Sent", negotiation: "Negotiation", won: "Won", lost: "Lost",
};

function fmtDealHistVal(field, value) {
  if (!value) return (field === "created" || field === "conversion") ? "—" : "Not set";
  if (field === "temperature") return DEAL_TEMP_LABELS[value] || value;
  if (field === "stage")       return DEAL_STAGE_FMT[value] || value;
  if (field === "value")       return `₹${Number(value).toLocaleString("en-IN")}`;
  if (field === "close_date")  { try { return format(new Date(value), "MMM d, yyyy"); } catch { return value; } }
  if (field === "conversion")  return value === "lead" ? "Lead" : value === "deal" ? "Deal" : value;
  if (field === "created")     return value;
  return value;
}

function groupDealHistoryByDate(records) {
  const groups = {};
  records.forEach((r) => {
    let label;
    try {
      const d = new Date(r.created_at);
      const today = new Date();
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString())          label = "Today";
      else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
      else label = format(d, "d MMM yyyy");
    } catch { label = "Unknown date"; }
    if (!groups[label]) groups[label] = [];
    groups[label].push(r);
  });
  return Object.entries(groups);
}

function DealHistoryDateDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 0 14px" }}>
      <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.09em", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
    </div>
  );
}

function DealHistoryItem({ record, isLast }) {
  const cfg    = DEAL_HISTORY_CFG[record.field_name] || { title: record.field_label || "Field changed", color: "#6B7280", icon: RotateCcw };
  const Icon   = cfg.icon;
  const oldVal = fmtDealHistVal(record.field_name, record.old_value);
  const newVal = fmtDealHistVal(record.field_name, record.new_value);

  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      {!isLast && (
        <div style={{ position: "absolute", left: 15, top: 32, bottom: -4, width: 1, background: "var(--border)" }} />
      )}
      <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: `${cfg.color}14`, border: `1.5px solid ${cfg.color}28`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <Icon size={13} style={{ color: cfg.color }} strokeWidth={1.8} />
      </div>

      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          {cfg.title}
        </div>

        {/* Before → Now — NO strikethrough */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Before</span>
            <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontWeight: 500, padding: "4px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              {oldVal}
            </span>
          </div>

          <span style={{ fontSize: 18, color: "var(--text-muted)", lineHeight: 1, paddingBottom: 2, fontWeight: 200 }}>→</span>

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>Now</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 12px", borderRadius: 8, background: `${cfg.color}12`, border: `1.5px solid ${cfg.color}30`, color: cfg.color }}>
              {newVal}
            </span>
          </div>
        </div>

        {record.note && (
          <div style={{ fontSize: 12, color: "var(--text-2)", padding: "7px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: 8, borderLeft: `3px solid ${cfg.color}` }}>
            {record.note}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {record.changed_by_profile?.full_name && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              {record.changed_by_profile.full_name}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.6 }}>
            {fmtRelative(record.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Panel ──────────────────────────────────────────────────────────── */
export default function DealDetailPanel({ deal, onClose, onEdit }) {
  const { profile, isSalesHead } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("details");
  const [editingActivity, setEditingActivity] = useState(null);
  const navigate = useNavigate();

  const openComposer = (to, toName = "") => navigate("/activities", {
    state: { openEmail: { to, toName, recordId: deal?.id, recordType: "deal", recordName: deal?.contact_name || deal?.title || deal?.company_name || "" } },
  });
  const [calcOpen,   setCalcOpen]   = useState(false);
  const [calcAmount, setCalcAmount] = useState("");
  const [calcFrom,   setCalcFrom]   = useState("INR");

  const extra       = parseJSON(deal?.notes);
  const stageInfo   = FUNNEL_STATUSES.find((s) => s.key === deal?.stage) || { label: deal?.stage || "—", color: "#6B7280", bg: "rgba(107,114,128,0.12)" };
  const dealTitle   = deal?.company_name || deal?.title || "Unnamed Deal";

  // Unified timeline query
  const { data: activities, isLoading: actLoading } = useQuery({
    queryKey: ["unified-timeline-deal", deal?.id],
    queryFn:  () => dealsService.getUnifiedTimeline(deal.id),
    enabled:  !!deal?.id,
    staleTime: 20000,
  });

  const { data: linkedLead } = useQuery({
    queryKey: ["linked-lead", deal?.id],
    queryFn:  () => dealsService.getLinkedLead(deal.id),
    enabled:  !!deal?.id,
    staleTime: 30000,
  });

  const { data: historyRecords, isLoading: histLoading } = useQuery({
    queryKey: ["change-history-deal", deal?.id],
    queryFn:  () => changeHistoryService.getForEntity("deal", deal.id),
    enabled:  !!deal?.id && activeTab === "history",
    staleTime: 15000,
  });

  // Real-time: invalidate timeline whenever any activity changes
  useEffect(() => {
    if (!deal?.id) return;
    const channel = supabase
      .channel(`deal-timeline-${deal.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        qc.invalidateQueries({ queryKey: ["unified-timeline-deal", deal.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [deal?.id, qc]);

  if (!deal) return null;

  const isTerminal = ["won", "lost"].includes(deal.stage);
  const staleDays  = Math.floor((Date.now() - new Date(deal.updated_at || deal.created_at).getTime()) / 86400000);
  const probability = FUNNEL_STATUSES.find((s) => s.key === deal.stage)?.probability ?? null;

  return (
    <>
    <AnimatePresence>
      <motion.div key="deal-panel-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
      />

      <motion.aside key="deal-panel"
        initial={{ x: "100%", opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 260, mass: 1 }}
        style={{ position: "fixed", right: 0, top: 0, bottom: 0, zIndex: 9991, width: "50vw", minWidth: 520, maxWidth: "100vw", background: "var(--bg)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", boxShadow: "-24px 0 64px rgba(0,0,0,0.18)" }}
      >
        {/* ── Header ── */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Hash size={10} strokeWidth={2.5} /> DEAL
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 8 }}>
                {dealTitle}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 99, background: stageInfo.bg, border: `1px solid ${stageInfo.color}30`, fontSize: 12, fontWeight: 700, color: stageInfo.color }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: stageInfo.color, boxShadow: `0 0 6px ${stageInfo.color}70`, display: "inline-block" }} />
                  {stageInfo.label}
                </span>
                {deal.value > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 99, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.22)", fontSize: 12, fontWeight: 700, color: "#10B981" }}>
                    <IndianRupee size={10} strokeWidth={2} />
                    {Number(deal.value).toLocaleString("en-IN")}
                  </span>
                )}
                {deal.temperature && (() => {
                  const TEMP_MAP = {
                    hot:  { color: "#DC2626", bg: "#7F1D1D", text: "#FFFFFF", label: "Hot"  },
                    warm: { color: "#F97316", bg: "#7C2D12", text: "#FFFFFF", label: "Warm" },
                    cold: { color: "#2563EB", bg: "#1E3A8A", text: "#FFFFFF", label: "Cold" },
                  };
                  const t = TEMP_MAP[deal.temperature];
                  if (!t) return null;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 11px", borderRadius: 99, background: t.bg, border: `1.5px solid ${t.color}`, fontSize: 12, fontWeight: 800, color: t.text, letterSpacing: "0.03em" }}>
                      <Thermometer size={10} strokeWidth={2} /> {t.label}
                    </span>
                  );
                })()}
                {!isTerminal && staleDays >= 7 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 99, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 11.5, fontWeight: 700, color: "#EF4444" }}>
                    <AlertTriangle size={10} strokeWidth={2} /> Stuck {staleDays}d
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {isSalesHead && linkedLead && (
                <motion.button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const { error } = await supabase.from("leads").update({ stage: "qualified", updated_at: new Date().toISOString() }).eq("id", linkedLead.id);
                      if (error) throw error;
                      qc.invalidateQueries({ queryKey: ["leads"] });
                      qc.invalidateQueries({ queryKey: ["deals"] });
                      qc.invalidateQueries({ queryKey: ["linked-lead", deal.id] });
                      toast.success("Deal moved back to Lead");
                      onClose();
                    } catch (err) {
                      toast.error(err.message || "Failed to move to lead");
                    }
                  }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}
                  title="Move back to Lead"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 10, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.28)", color: "#8B5CF6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.1)"; }}>
                  <ArrowRightLeft size={13} strokeWidth={1.8} /> To Lead
                </motion.button>
              )}
              {onEdit && (
                <motion.button onClick={(e) => { e.stopPropagation(); onEdit(deal); }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 15px", borderRadius: 10, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.22)", color: "#3B82F6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(37,99,235,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(37,99,235,0.1)"; }}>
                  <Pencil size={13} strokeWidth={1.8} /> Edit
                </motion.button>
              )}
              <motion.button onClick={onClose}
                whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                style={{ width: 36, height: 36, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
                <X size={15} />
              </motion.button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: "flex", gap: 0, marginBottom: -1, marginTop: 14 }}>
            {DEAL_TABS.map((tab) => {
              const Icon   = tab.icon;
              const active = activeTab === tab.key;
              const linkedLeadContacts = (() => {
                try { return JSON.parse(linkedLead?.other_notes || "{}").people_contacts || []; } catch { return []; }
              })();
              const badge  = tab.key === "contacts" && linkedLeadContacts.length ? linkedLeadContacts.length
                           : tab.key === "timeline" && activities?.length ? activities.length
                           : tab.key === "history" ? (() => { const t = (activities?.length || 0) + (historyRecords?.length || 0); return t > 0 ? t : null; })()
                           : null;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "transparent", border: "none", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent", color: active ? "var(--accent)" : "var(--text-muted)", fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  <Icon size={13} strokeWidth={1.8} /> {tab.label}
                  {badge != null && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: active ? "var(--accent-light)" : "var(--surface-2)", color: active ? "var(--accent)" : "var(--text-muted)", border: `1px solid ${active ? "var(--accent)" : "var(--border)"}` }}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Linked Lead Banner ── */}
        {linkedLead && (
          <div style={{ padding: "10px 24px", background: "rgba(59,130,246,0.06)", borderBottom: "1px solid rgba(59,130,246,0.15)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <Link2 size={14} style={{ color: "#3B82F6", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#3B82F6" }}>From Lead: </span>
              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>{linkedLead.company_name || linkedLead.contact_name}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                {LEAD_STAGE_LABELS[linkedLead.stage] || linkedLead.stage}
                {linkedLead.temperature && <span style={{ color: LEAD_TEMP_COLORS[linkedLead.temperature] || "var(--text-muted)", marginLeft: 4 }}>· {linkedLead.temperature.charAt(0).toUpperCase() + linkedLead.temperature.slice(1)}</span>}
              </span>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(59,130,246,0.12)", color: "#3B82F6" }}>ORIGIN LEAD</span>
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 32px" }}>

          {/* ── DETAILS TAB ── */}
          {activeTab === "details" && (
            <div>
              <SectionHead label="Deal Details" />

              {probability !== null && probability > 0 && probability < 100 && (
                <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 5 }}>
                      <Target size={11} strokeWidth={2} /> Win Probability
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: stageInfo.color }}>{probability}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${probability}%` }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      style={{ height: "100%", background: stageInfo.color, borderRadius: 99 }}
                    />
                  </div>
                </div>
              )}

              <InfoRow icon={Building2}   label="Company"        value={deal.company_name || deal.title} />
              <InfoRow icon={User}        label="Contact Name"   value={deal.contact_name} />
              <InfoRow icon={Briefcase}   label="Designation"    value={extra.designation} />
              <InfoRow icon={Phone}       label="Contact No."    value={extra.contact} isPhone />
              {extra.industry && <InfoRow icon={Briefcase} label="Industry" value={extra.industry} />}
              {extra.country  && <InfoRow icon={Globe}     label="Country"  value={countryName(extra.country) || extra.country} />}
              {extra.state    && <InfoRow icon={MapPin}    label="State"    value={extra.state} />}
              {(extra.city || extra.headquarters) && <InfoRow icon={MapPin} label="Headquarters City" value={extra.city || extra.headquarters} />}
              <InfoRow icon={IndianRupee} label="Deal Value"     value={deal.value ? `₹${Number(deal.value).toLocaleString("en-IN")}` : null} />

              {/* ── Currency Converter Calculator ── */}
              <div style={{ borderBottom: "1px solid var(--border)" }}>
                <button
                  onClick={() => {
                    setCalcOpen((p) => !p);
                    if (!calcAmount && deal.value) setCalcAmount(String(deal.value));
                  }}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 12, fontWeight: 700 }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <IndianRupee size={12} strokeWidth={2} />
                    Currency Converter
                  </span>
                  <span style={{ fontSize: 16, lineHeight: 1, color: "var(--text-muted)", transform: calcOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>›</span>
                </button>

                {calcOpen && (() => {
                  const amt = parseFloat(calcAmount) || 0;
                  const fromRate = FX_RATES_FROM_INR[calcFrom] || 1;
                  const amtInInr = amt / fromRate;
                  const targets = Object.keys(FX_RATES_FROM_INR).filter((c) => c !== calcFrom);

                  return (
                    <div style={{ paddingBottom: 14 }}>
                      {/* Controls */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <input
                          type="number"
                          value={calcAmount}
                          onChange={(e) => setCalcAmount(e.target.value)}
                          placeholder="Amount"
                          style={{ flex: 1, height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13, fontWeight: 600, outline: "none" }}
                        />
                        <select
                          value={calcFrom}
                          onChange={(e) => setCalcFrom(e.target.value)}
                          style={{ height: 36, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 12, fontWeight: 700, outline: "none", cursor: "pointer" }}
                        >
                          {Object.keys(FX_RATES_FROM_INR).map((c) => (
                            <option key={c} value={c}>{c} — {FX_LABELS[c]}</option>
                          ))}
                        </select>
                      </div>

                      {/* Conversion grid */}
                      {amt > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {targets.map((cur) => {
                            const converted = amtInInr * FX_RATES_FROM_INR[cur];
                            const symbol    = FX_SYMBOLS[cur] || cur;
                            const isLarge   = converted >= 1000;
                            return (
                              <div key={cur} style={{ padding: "8px 10px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{cur}</span>
                                <span style={{ fontSize: isLarge ? 12.5 : 13.5, fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>
                                  {symbol}{converted >= 1000 ? converted.toLocaleString("en-US", { maximumFractionDigits: 0 }) : converted.toFixed(2)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "8px 0" }}>Enter an amount to convert</div>
                      )}

                      <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)", textAlign: "right" }}>
                        Static rates · Not live market data
                      </div>
                    </div>
                  );
                })()}
              </div>

              <InfoRow icon={Calendar}    label="Expected Close" value={deal.close_date ? fmtDate(deal.close_date) : null} />
              {deal.close_date && !isTerminal && (() => {
                const days = Math.ceil((new Date(deal.close_date) - Date.now()) / 86400000);
                if (days < 0) return <InfoRow icon={AlertTriangle} label="Close Date" value={`${Math.abs(days)} days overdue`} />;
                if (days <= 7) return <InfoRow icon={AlertTriangle} label="Days Remaining" value={`${days} days`} />;
                return null;
              })()}
              {extra.lost_reason && <InfoRow icon={AlertTriangle} label="Lost Reason" value={extra.lost_reason} />}

              {(() => {
                const svcs = extra.services?.length
                  ? extra.services
                  : (linkedLead ? parseJSON(linkedLead?.other_notes || "{}").services : []) || [];
                const customSvc = extra.custom_service || (linkedLead ? parseJSON(linkedLead?.other_notes || "{}").custom_service : "");
                const allSvcs = [...svcs, ...(customSvc ? [customSvc] : [])];
                if (!allSvcs.length) return null;
                return (
                  <>
                    <SectionHead label="Services" />
                    <div style={{ marginTop: 4, marginBottom: 6 }}>
                      {allSvcs.map((svc, i) => (
                        <div key={svc} style={{ fontSize: 13, padding: "2px 0", color: ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899","#84CC16"][i % 8] }}>{i + 1}. {svc}</div>
                      ))}
                    </div>
                  </>
                );
              })()}

              {extra.remarks && (
                <>
                  <SectionHead label="Notes" />
                  <div style={{ padding: "14px 16px", borderRadius: 12, marginTop: 4, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.7 }}>
                    {extra.remarks}
                  </div>
                </>
              )}

              {linkedLead && (linkedLead.email || linkedLead.phone) && (
                <>
                  <SectionHead label="Lead Contact" />
                  <InfoRow icon={Mail} label="Lead Email" value={linkedLead.email} isEmail onComposeEmail={openComposer} />
                  <InfoRow icon={Phone} label="Lead Phone" value={linkedLead.phone} isPhone />
                </>
              )}

              <SectionHead label="Record Info" />
              <InfoRow icon={Clock} label="Created"      value={deal.created_at ? `${fmtDate(deal.created_at)} · ${fmtRelative(deal.created_at)}` : null} />
              <InfoRow icon={Clock} label="Last Updated" value={deal.updated_at ? `${fmtDate(deal.updated_at)} · ${fmtRelative(deal.updated_at)}` : null} />
              {deal.closed_at && (
                <InfoRow icon={Clock} label={deal.stage === "won" ? "Won On" : "Closed On"} value={`${fmtDate(deal.closed_at)} · ${fmtRelative(deal.closed_at)}`} />
              )}
            </div>
          )}

          {/* ── CONTACTS TAB ── */}
          {activeTab === "contacts" && (() => {
            const leadExtra = (() => { try { return JSON.parse(linkedLead?.other_notes || "{}"); } catch { return {}; } })();
            const peopleContacts = Array.isArray(leadExtra.people_contacts) ? leadExtra.people_contacts : [];
            // Fallback: if linked lead has no people_contacts, synthesize from its direct fields
            const linkedLeadFallback = linkedLead && (linkedLead.contact_name || leadExtra.email || leadExtra.phone) ? {
              id:          "deal-contact",
              name:        linkedLead.contact_name || deal?.contact_name || "—",
              email:       leadExtra.email || deal?.customer_email || null,
              phone:       leadExtra.phone || null,
              designation: linkedLead.designation || leadExtra.designation || null,
              linkedin_url: leadExtra.contact_linkedin_url || null,
              is_primary:  true,
            } : null;
            // For deals with no linked lead, still fall back to deal's own contact fields
            const dealOnlyFallback = !linkedLead && (deal?.contact_name || deal?.company_name) ? {
              id:          "deal-contact",
              name:        deal.contact_name || "—",
              email:       deal.customer_email || extra.email || null,
              phone:       extra.contact || null,
              designation: extra.designation || null,
              is_primary:  true,
            } : null;

            if (!deal?.lead_id && !linkedLead) {
              return (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}>
                    <Users size={15} strokeWidth={2} style={{ color: "#8B5CF6" }} />
                    Contacts
                  </div>
                  <div style={{ padding: "18px 16px", borderRadius: 12, background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <AlertTriangle size={15} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 1 }} strokeWidth={2} />
                    <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
                      No linked lead found. Contacts unavailable. Please link this deal to a lead to see contact persons.
                    </div>
                  </div>
                </div>
              );
            }

            const fallback = linkedLeadFallback || dealOnlyFallback;
            const contacts = peopleContacts.length > 0 ? peopleContacts : (fallback ? [fallback] : []);
            const sorted   = [...contacts].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));

            return (
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
                  <Users size={15} strokeWidth={2} style={{ color: "#8B5CF6" }} />
                  Contact Persons
                  {contacts.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 99, background: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>{contacts.length}</span>
                  )}
                </div>
                {linkedLead && (
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}>
                    <Link2 size={11} style={{ color: "#3B82F6" }} />
                    From Lead: {linkedLead.company_name || linkedLead.contact_name}
                  </div>
                )}

                {sorted.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "36px 24px", color: "var(--text-muted)" }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                      <Users size={22} style={{ opacity: 0.3 }} />
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-2)", marginBottom: 4 }}>No contacts available</div>
                    <div style={{ fontSize: 12, opacity: 0.5 }}>Add contacts to the linked lead to see them here</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {sorted.map((c) => (
                      <div key={c.id} style={{ padding: "14px 16px", borderRadius: 12, background: c.is_primary ? "rgba(139,92,246,0.05)" : "var(--surface-2)", border: `1.5px solid ${c.is_primary ? "rgba(139,92,246,0.25)" : "var(--border)"}` }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: c.is_primary ? "rgba(139,92,246,0.12)" : "var(--surface)", border: `1px solid ${c.is_primary ? "rgba(139,92,246,0.3)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <User size={16} style={{ color: c.is_primary ? "#8B5CF6" : "var(--text-muted)" }} strokeWidth={1.8} />
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>{c.name || "—"}</div>
                              {c.designation && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{c.designation}</div>}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: c.is_primary ? "rgba(139,92,246,0.12)" : "var(--surface)", border: `1px solid ${c.is_primary ? "rgba(139,92,246,0.28)" : "var(--border)"}`, color: c.is_primary ? "#8B5CF6" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                            {c.is_primary ? "Primary" : "Secondary"}
                          </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 46 }}>
                          {c.email && (
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#3B82F6", fontWeight: 500 }}>
                                <Mail size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
                                {c.email}
                              </span>
                              <button
                                onClick={() => openComposer(c.email, c.name)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 5, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#6366F1", fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                              >
                                Send Email
                              </button>
                            </div>
                          )}
                          {c.phone && (
                            <a href={`tel:${c.phone}`} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#10B981", textDecoration: "none", fontWeight: 500 }}>
                              <Phone size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
                              {c.phone}
                            </a>
                          )}
                          {!c.email && !c.phone && (
                            <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>No contact details</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── TIMELINE TAB ── */}
          {activeTab === "timeline" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
                <Activity size={15} strokeWidth={2} style={{ color: "var(--accent)" }} />
                Activity Timeline
                {activities?.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 99, background: "var(--accent-light)", color: "var(--accent)" }}>
                    {activities.length}
                  </span>
                )}
              </div>
              {linkedLead && (
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}>
                  <Link2 size={11} style={{ color: "#3B82F6" }} />
                  Shows activities from both Deal and original Lead
                </div>
              )}

              {(() => {
                const dealSvcs = parseJSON(deal?.notes).services || (linkedLead ? parseJSON(linkedLead?.other_notes || "{}").services : []) || [];
                if (!dealSvcs.length || !activities?.length) return null;
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const recentSvcs = activities.filter((a) => new Date(a.created_at) >= sevenDaysAgo).map((a) => a.metadata?.service).filter(Boolean);
                const staleSvcs = dealSvcs.filter((s) => !recentSvcs.includes(s));
                if (!staleSvcs.length) return null;
                return (
                  <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 9, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.18)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <AlertTriangle size={12} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} strokeWidth={2} />
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>No activity in 7 days</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {staleSvcs.map((svc) => (
                          <span key={svc} style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 99, background: "rgba(239,68,68,0.08)", color: "#DC2626", fontWeight: 600, border: "1px solid rgba(239,68,68,0.15)" }}>{svc}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <AddActivityForm dealId={deal.id} profile={profile}
                services={parseJSON(deal?.notes).services || (linkedLead ? parseJSON(linkedLead?.other_notes || "{}").services : []) || []}
                existingActivities={activities || []}
                editingActivity={editingActivity}
                onCancelEdit={() => setEditingActivity(null)}
                onSuccess={() => {
                  qc.invalidateQueries({ queryKey: ["unified-timeline-deal", deal.id] });
                  if (linkedLead?.id) qc.invalidateQueries({ queryKey: ["unified-timeline-lead", linkedLead.id] });
                  qc.invalidateQueries({ queryKey: ["activities"] });
                  qc.invalidateQueries({ queryKey: ["deals-all"] });
                  qc.invalidateQueries({ queryKey: ["my-deals"] });
                  qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
                  qc.invalidateQueries({ queryKey: ["recent-activity"] });
                }}
              />

              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
                Recent Activity
              </div>

              {actLoading ? (
                <ActivitySkeleton />
              ) : !activities?.length ? (
                <div style={{ textAlign: "center", padding: "28px 24px", color: "var(--text-muted)" }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                    <Activity size={20} style={{ opacity: 0.3 }} />
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-2)", marginBottom: 4 }}>No activity yet</div>
                  <div style={{ fontSize: 12, opacity: 0.5 }}>Log the first activity above</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {activities.map((act, i) => (
                    <ActivityItem key={act.id} activity={act} isLast={i === activities.length - 1} onEdit={(a) => setEditingActivity(a)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {activeTab === "history" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
                <History size={15} strokeWidth={2} style={{ color: "#8B5CF6" }} />
                Activity & Change History
                {(() => { const t = (activities?.length || 0) + (historyRecords?.length || 0); return t > 0 ? <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 99, background: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>{t}</span> : null; })()}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 20 }}>
                All activities and field changes for this deal.
              </div>
              {(histLoading || actLoading) ? (
                <ActivitySkeleton />
              ) : (() => {
                const mergedItems = [
                  ...(activities || []).map((a) => ({ ...a, _type: "activity" })),
                  ...(historyRecords || []).map((h) => ({ ...h, _type: "history" })),
                ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                if (!mergedItems.length) {
                  return (
                    <div style={{ textAlign: "center", padding: "28px 24px", color: "var(--text-muted)" }}>
                      <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                        <History size={20} style={{ opacity: 0.3 }} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-2)", marginBottom: 4 }}>No history yet</div>
                      <div style={{ fontSize: 12, opacity: 0.5 }}>Activities and field changes are logged here automatically</div>
                    </div>
                  );
                }

                const groups = groupDealHistoryByDate(mergedItems);
                return (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {groups.map(([dateLabel, recs], gi) => (
                      <div key={dateLabel}>
                        <DealHistoryDateDivider label={dateLabel} />
                        {recs.map((item, i) => {
                          const isLast = gi === groups.length - 1 && i === recs.length - 1;
                          return item._type === "activity"
                            ? <ActivityItem key={item.id} activity={item} isLast={isLast} onEdit={(a) => setEditingActivity(a)} />
                            : <DealHistoryItem key={item.id} record={item} isLast={isLast} />;
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
    </>
  );
}
