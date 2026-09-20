import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { countryName } from "../constants/countries";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { leadsService } from "../services/leadsService";
import { changeHistoryService } from "../services/changeHistoryService";
import { db as supabase } from "../lib/db";
import { getAccessToken } from "../lib/session";
import toast from "react-hot-toast";
import { SourceBadge, LinkedinIcon } from "./SourceBadge";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");
import {
  X, Building2, User, Phone, Mail, Briefcase, Link2, Calendar,
  Clock, Activity, Pencil, ChevronRight, ChevronDown, Tag, Hash,
  ArrowRightLeft, Flame, Thermometer, Snowflake, Globe,
  Plus, PhoneCall, Video, Download, CheckCircle2,
  Zap, FileText, Bell, RefreshCw, History, RotateCcw,
  Lock, LockOpen, Users, Star, Trash2, MapPin, AlertTriangle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const LEAD_STATUSES = [
  { key: "new",       label: "New",       color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
  { key: "contacted", label: "Contacted", color: "#3B82F6", bg: "rgba(59,130,246,0.12)"  },
  { key: "qualified", label: "Qualified", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)"  },
  { key: "proposal",  label: "Proposal",  color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  { key: "converted", label: "Converted", color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  { key: "won",       label: "Won",       color: "#22C55E", bg: "rgba(34,197,94,0.12)"   },
  { key: "lost",      label: "Lost",      color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
];

const DEAL_STAGE_LABELS = {
  new: "New", contacted: "Contacted", meeting_scheduled: "Meeting Scheduled",
  proposal_sent: "Proposal Sent", negotiation: "Negotiation", won: "Won", lost: "Lost",
};

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

function InfoRow({ icon: Icon, label, value, isLink, isEmail, onComposeEmail }) {
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
  follow_up_call:    { label: "Follow-up Call",    icon: PhoneCall,    color: "#3B82F6" },
  follow_up_email:   { label: "Follow-up Email",   icon: Mail,         color: "#6366F1" },
  follow_up_meeting: { label: "Follow-up Meeting", icon: Calendar,     color: "#8B5CF6" },
  virtual_call:      { label: "Virtual Call",       icon: Video,        color: "#06B6D4" },
  meeting:         { label: "Meeting",            icon: Calendar,     color: "#8B5CF6" },
  meeting_person:  { label: "Meeting (In-Person)",icon: Calendar,     color: "#8B5CF6" },
  meeting_virtual: { label: "Meeting (Virtual)",  icon: Video,        color: "#06B6D4" },
  call:            { label: "Call",               icon: PhoneCall,    color: "#3B82F6" },
  phone_call:      { label: "Phone Call",         icon: PhoneCall,    color: "#3B82F6" },
  email:           { label: "Email",              icon: Mail,         color: "#EC4899" },
  email_contact:   { label: "Email Contact",      icon: Mail,         color: "#EC4899" },
  email_sent:      { label: "📧 Email Sent",       icon: Mail,         color: "#6366F1" },
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

const ACT_FORM_TYPES = [
  { key: "follow_up_call",  label: "Follow-up Call",      icon: PhoneCall },
  { key: "follow_up_email", label: "Follow-up Email",     icon: Mail      },
  { key: "call",            label: "Call",                icon: PhoneCall },
  { key: "email",           label: "Email",               icon: Mail      },
  { key: "meeting_person",  label: "Meeting (In Person)", icon: Users     },
  { key: "meeting_virtual", label: "Meeting (Virtual)",   icon: Video     },
  { key: "note",            label: "Note",                icon: FileText  },
];

const TEMP_MAP = {
  hot:  { icon: Flame,       color: "#EF4444", label: "Hot"  },
  warm: { icon: Thermometer, color: "#F59E0B", label: "Warm" },
  cold: { icon: Snowflake,   color: "#3B82F6", label: "Cold" },
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key: "details",  label: "Details",  icon: User    },
  { key: "contacts", label: "Contacts", icon: Users   },
  { key: "timeline", label: "Timeline", icon: Activity },
  { key: "history",  label: "History",  icon: History  },
];

const LEAD_COUNTRIES_MINI = [
  { code: "IN", name: "India",          dial: "+91"  },
  { code: "US", name: "United States",  dial: "+1"   },
  { code: "GB", name: "United Kingdom", dial: "+44"  },
  { code: "AE", name: "UAE",            dial: "+971" },
  { code: "SG", name: "Singapore",      dial: "+65"  },
  { code: "AU", name: "Australia",      dial: "+61"  },
  { code: "CA", name: "Canada",         dial: "+1"   },
  { code: "DE", name: "Germany",        dial: "+49"  },
  { code: "FR", name: "France",         dial: "+33"  },
  { code: "SA", name: "Saudi Arabia",   dial: "+966" },
  { code: "QA", name: "Qatar",          dial: "+974" },
  { code: "MY", name: "Malaysia",       dial: "+60"  },
];
const leadGenId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const LEAD_CONTACT_LABEL = { fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 };

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
function AddActivityForm({ leadId, profile, onSuccess, services = [], existingActivities = [], editingActivity = null, onCancelEdit }) {
  const [saving, setSaving]           = useState(false);
  const [actType, setActType]         = useState("follow_up_call");
  const [actTypeOpen, setActTypeOpen] = useState(false);
  const [remarks, setRemarks]         = useState("");
  const [date, setDate]               = useState("");
  const [time, setTime]               = useState("");
  const actTypeRef = useRef(null);
  const svcOptions = services.length > 0
    ? (services.length === 1 ? services : [...services, "Cumulative"])
    : [];
  const [actService, setActService] = useState(() => svcOptions.length === 1 ? svcOptions[0] : "");
  const coveredServices = existingActivities.map((a) => a.metadata?.service).filter((s) => s && s !== "Cumulative");
  const pureServices = svcOptions.filter((s) => s !== "Cumulative");
  const pendingServices = pureServices.filter((s) => !coveredServices.includes(s));

  useEffect(() => {
    if (!actTypeOpen) return;
    const handle = (e) => { if (!actTypeRef.current?.contains(e.target)) setActTypeOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [actTypeOpen]);

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
      const typeInfo    = ACT_FORM_TYPES.find((t) => t.key === actType);
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
            lead_id:      leadId,
            related_type: "lead",
            related_id:   leadId,
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
      <div style={{ marginBottom: 12 }} ref={actTypeRef}>
        <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>Activity Type</label>
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setActTypeOpen((v) => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "var(--r-sm)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "var(--text)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {(() => { const t = ACT_FORM_TYPES.find((x) => x.key === actType); const TIcon = t?.icon; return TIcon ? <TIcon size={13} strokeWidth={1.8} style={{ color: "var(--accent)" }} /> : null; })()}
              {ACT_FORM_TYPES.find((x) => x.key === actType)?.label || "Select type"}
            </span>
            <ChevronDown size={13} style={{ color: "var(--text-muted)", transform: actTypeOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
          </button>
          {actTypeOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "0 8px 28px rgba(0,0,0,0.18)", padding: "4px 0" }}>
              {ACT_FORM_TYPES.map((t) => {
                const TIcon = t.icon;
                const active = actType === t.key;
                return (
                  <button key={t.key} type="button" onClick={() => { setActType(t.key); setActTypeOpen(false); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: active ? "rgba(59,130,246,0.08)" : "none", border: "none", cursor: "pointer", fontSize: 13, color: active ? "var(--accent)" : "var(--text-2)", fontFamily: "inherit", fontWeight: active ? 600 : 400 }}>
                    <TIcon size={13} strokeWidth={1.8} style={{ color: active ? "var(--accent)" : "var(--text-muted)" }} /> {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
            {svcOptions.map((svc) => (
              <option key={svc} value={svc}>{svc}</option>
            ))}
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
  const key    = activity.type?.toLowerCase().replace(/[^a-z_]/g, "") || "follow_up";
  const info   = ACT_TYPE_MAP[key] || ACT_TYPE_MAP.follow_up;
  const color  = info.color;
  const TIcon  = info.icon;
  const meta   = activity.metadata || {};
  const sched  = meta.scheduled_at;
  const text   = activity.title || activity.description || "";
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
              {meta.service === "Cumulative" ? "Cumulative" : `Service: ${meta.service}`}
            </span>
          )}
          {(activity.user?.full_name || activity.created_by_profile?.full_name) && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              {activity.user?.full_name || activity.created_by_profile?.full_name}
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

/* ─── People Contact Components ─────────────────────────────────────────────── */
function LeadPeopleContactCard({ contact, onSetPrimary, onDelete, isPending, canEdit, onComposeEmail }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: `1.5px solid ${contact.is_primary ? "rgba(139,92,246,0.35)" : "var(--border)"}`, marginBottom: 10, position: "relative" }}>
      {contact.is_primary && (
        <div style={{ position: "absolute", top: 10, right: 12, display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <Star size={10} fill="#8B5CF6" strokeWidth={0} /> POC
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 4, paddingRight: contact.is_primary ? 56 : 0 }}>{contact.name || "Unnamed"}</div>
      {contact.designation && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{contact.designation}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {contact.email && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-2)", flexWrap: "wrap" }}>
            <Mail size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span style={{ color: "var(--accent)" }}>{contact.email}</span>
            {onComposeEmail && (
              <button
                onClick={() => onComposeEmail(contact.email, contact.name)}
                style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 5, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#6366F1", fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Send Email
              </button>
            )}
          </div>
        )}
        {contact.phone && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-2)" }}>
            <Phone size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <a href={`tel:${contact.dial || ""}${contact.phone}`} style={{ color: "#10B981", textDecoration: "none" }}>
              {contact.dial ? `${contact.dial} ` : ""}{contact.phone}
            </a>
          </div>
        )}
        {contact.city && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
            <MapPin size={11} style={{ flexShrink: 0 }} /> {[contact.city, contact.state].filter(Boolean).join(", ")}
          </div>
        )}
      </div>
      {canEdit && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {!contact.is_primary && (
            <button disabled={isPending} onClick={() => onSetPrimary(contact)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, background: "rgba(139,92,246,0.08)", border: "1.5px solid rgba(139,92,246,0.22)", color: "#8B5CF6", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: isPending ? 0.6 : 1 }}>
              <Star size={10} strokeWidth={2} /> Set as POC
            </button>
          )}
          {!contact.is_primary && (
            <button onClick={() => onDelete(contact.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1.5px solid rgba(239,68,68,0.18)", color: "#EF4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              <Trash2 size={10} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddLeadPeopleContactForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({ name: "", designation: "", email: "", phone: "", dial: "+91" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleAdd = () => {
    if (!form.name.trim()) { toast.error("Contact name is required"); return; }
    onAdd({ id: leadGenId(), ...form, is_primary: false });
    setForm({ name: "", designation: "", email: "", phone: "", dial: "+91" });
  };
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: "1.5px solid var(--accent)", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <Plus size={12} strokeWidth={2.5} /> New Contact Person
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>Name *</label>
          <input className="crm-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="John Doe" style={{ padding: "7px 10px", fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>Designation</label>
          <input className="crm-input" value={form.designation} onChange={(e) => set("designation", e.target.value)} placeholder="CTO" style={{ padding: "7px 10px", fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>Email</label>
          <input className="crm-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="john@co.com" style={{ padding: "7px 10px", fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>Phone</label>
          <div style={{ display: "flex", gap: 5 }}>
            <select className="crm-input" value={form.dial} onChange={(e) => set("dial", e.target.value)} style={{ height: 36, width: 130, padding: "0 6px", flexShrink: 0, fontSize: 12 }}>
              {LEAD_COUNTRIES_MINI.map((c) => <option key={c.code} value={c.dial}>{c.name} ({c.dial})</option>)}
            </select>
            <input className="crm-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="9876543210" style={{ padding: "7px 10px", fontSize: 12, flex: 1 }} />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={handleAdd} className="btn-primary" style={{ fontSize: 12, padding: "6px 16px", height: 32 }}>Add</button>
        <button onClick={onCancel} className="btn-secondary" style={{ fontSize: 12, padding: "6px 14px", height: 32 }}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── History Tab ─────────────────────────────────────────────────────────── */
const HISTORY_CFG = {
  contact_name:     { title: "POC Changed",              color: "#8B5CF6", icon: User        },
  poc_changed:      { title: "POC Changed",              color: "#8B5CF6", icon: Users       },
  stage:            { title: "Stage Changed",            color: "#3B82F6", icon: Tag         },
  temperature:      { title: "Temperature Updated",      color: "#F59E0B", icon: Thermometer },
  assigned_to:      { title: "Reassigned",               color: "#06B6D4", icon: User        },
  company_name:     { title: "Company Name Updated",     color: "#6B7280", icon: Building2   },
  form_unlocked:    { title: "Form Unlocked",             color: "#10B981", icon: LockOpen    },
  contact_unlocked: { title: "Form Unlocked",             color: "#10B981", icon: LockOpen    },
  contact_added:    { title: "Contact Added",            color: "#3B82F6", icon: Users          },
  contact_deleted:  { title: "Contact Removed",          color: "#EF4444", icon: Users          },
  conversion:       { title: "Converted to Lead",        color: "#10B981", icon: ArrowRightLeft },
  pipeline_created: { title: "Created in Pipeline",      color: "#6366F1", icon: Zap            },
  created:          { title: "Lead Created",             color: "#6366F1", icon: Zap            },
};

const HIST_TEMP_LABELS  = { hot: "Hot 🔴", warm: "Warm 🟡", cold: "Cold 🔵" };
const HIST_STAGE_LABELS = {
  new: "New", contacted: "Contacted", qualified: "Qualified",
  proposal: "Proposal", converted: "Converted", won: "Won", lost: "Lost",
};

function fmtHistVal(field, value) {
  if (field === "pipeline_created" || field === "created") return value || "—";
  if (!value) return "—";
  if (field === "temperature") return HIST_TEMP_LABELS[value] || value;
  if (field === "stage")       return HIST_STAGE_LABELS[value] || value;
  if (field === "conversion")  return value === "pipeline" ? "Pipeline" : value === "lead" ? "Lead" : value;
  return value;
}

function groupHistoryByDate(records) {
  const groups = {};
  records.forEach((r) => {
    let label;
    try {
      const d = new Date(r.created_at);
      const today = new Date();
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString())     label = "Today";
      else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
      else label = format(d, "d MMM yyyy");
    } catch { label = "Unknown date"; }
    if (!groups[label]) groups[label] = [];
    groups[label].push(r);
  });
  return Object.entries(groups);
}

function HistoryDateDivider({ label }) {
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

function HistoryItem({ record, isLast }) {
  const cfg  = HISTORY_CFG[record.field_name] || { title: record.field_label || "Field changed", color: "#6B7280", icon: RotateCcw };
  const Icon = cfg.icon;
  const oldVal = fmtHistVal(record.field_name, record.old_value);
  const newVal = fmtHistVal(record.field_name, record.new_value);

  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      {!isLast && (
        <div style={{ position: "absolute", left: 15, top: 32, bottom: -4, width: 1, background: "var(--border)" }} />
      )}
      <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: `${cfg.color}14`, border: `1.5px solid ${cfg.color}28`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <Icon size={13} style={{ color: cfg.color }} strokeWidth={1.8} />
      </div>

      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 22 }}>
        {/* Event title */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          {cfg.title}
        </div>

        {/* Before → After — NO strikethrough, clean label layout */}
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

        {/* Optional reason note */}
        {record.note && (
          <div style={{ fontSize: 12, color: "var(--text-2)", padding: "7px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: 8, borderLeft: `3px solid ${cfg.color}` }}>
            {record.note}
          </div>
        )}

        {/* Who + when */}
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
export default function LeadDetailPanel({ lead, onClose, onEdit, onConvert }) {
  const { profile, isSalesHead } = useAuth();
  const qc          = useQueryClient();
  const [activeTab, setActiveTab] = useState("details");
  const [editingActivity, setEditingActivity] = useState(null);
  const navigate = useNavigate();

  const openComposer = (to, toName = "") => navigate("/activities", {
    state: { openEmail: { to, toName, recordId: lead?.id, recordType: "lead", recordName: [lead?.contact_name, lead?.company_name].filter(Boolean).join(" / ") } },
  });

  const extra          = parseJSON(lead?.other_notes);
  const contactLocked  = !!extra.contact_locked;
  // Admin can edit ONLY after unlocking; restricted users never get edit access
  const canEdit        = !contactLocked;
  const canChangePoc   = isSalesHead && !contactLocked;
  const peopleContacts = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
  // Fallback: synthesize from direct record fields so legacy records always show contacts
  const displayContacts = peopleContacts.length > 0 ? peopleContacts : (() => {
    const hasContact = lead?.contact_name || extra.email || extra.phone;
    if (!hasContact) return [];
    return [{ id: "__legacy__", name: lead?.contact_name || "", designation: lead?.designation || "", email: extra.email || "", phone: extra.phone || "", linkedin_url: extra.contact_linkedin_url || "", is_primary: true, __synthetic: true }];
  })();
  const pocHistory     = Array.isArray(extra.poc_history) ? extra.poc_history : [];
  const statusInfo     = LEAD_STATUSES.find((s) => s.key === lead?.stage) || { label: lead?.stage || "—", color: "#6B7280", bg: "rgba(107,114,128,0.12)" };
  const leadId     = lead?.lead_code || (lead?.id ? `LEAD-${lead.id.slice(0, 8).toUpperCase()}` : "—");

  const { data: activities, isLoading: actLoading } = useQuery({
    queryKey: ["unified-timeline-lead", lead?.id],
    queryFn:  () => leadsService.getUnifiedTimeline(lead.id),
    enabled:  !!lead?.id,
    staleTime: 20000,
  });

  const { data: linkedDeal } = useQuery({
    queryKey: ["linked-deal", lead?.id],
    queryFn:  () => leadsService.getLinkedDeal(lead.id),
    enabled:  !!lead?.id,
    staleTime: 30000,
  });

  const { data: historyRecords, isLoading: histLoading } = useQuery({
    queryKey: ["change-history-lead", lead?.id],
    queryFn:  () => changeHistoryService.getForEntity("lead", lead.id),
    enabled:  !!lead?.id && activeTab === "history",
    staleTime: 15000,
  });

  const [showAddContact, setShowAddContact] = useState(false);
  const [showPocSelector, setShowPocSelector] = useState(false);

  const unlockContactsMutation = useMutation({
    mutationFn: async () => {
      const cur = parseJSON(lead.other_notes);
      await leadsService.update(lead.id, { other_notes: JSON.stringify({ ...cur, contact_locked: false }) });
      await changeHistoryService.logContactUnlock({ entityType: "lead", entityId: lead.id, adminName: profile?.full_name, userId: profile?.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["pipeline"] }); qc.invalidateQueries({ queryKey: ["change-history-lead", lead.id] }); toast.success("Form unlocked — you can now edit this record"); },
    onError: (e) => toast.error(e.message || "Failed"),
  });

  const setPocMutation = useMutation({
    mutationFn: async ({ contactId, contactName }) => {
      const cur = parseJSON(lead.other_notes);
      const oldPoc = (cur.people_contacts || []).find((c) => c.is_primary);
      const oldName = oldPoc?.name || lead.contact_name || null;
      const updatedContacts = (cur.people_contacts || []).map((c) => ({ ...c, is_primary: c.id === contactId }));
      const newHistory = [...(cur.poc_history || []), { id: leadGenId(), from_name: oldName || "—", to_name: contactName, changed_by_id: profile?.id, changed_by_name: profile?.full_name || "Unknown", changed_at: new Date().toISOString() }];
      await leadsService.update(lead.id, { contact_name: contactName, other_notes: JSON.stringify({ ...cur, people_contacts: updatedContacts, poc_history: newHistory, contact_locked: true }) });
      await changeHistoryService.logPocChange({ entityType: "lead", entityId: lead.id, oldName, newName: contactName, userId: profile?.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["linked-lead"] }); qc.invalidateQueries({ queryKey: ["change-history-lead", lead.id] }); toast.success("Point of contact updated"); },
    onError: (e) => toast.error(e.message || "Failed"),
  });

  const addContactMutation = useMutation({
    mutationFn: async (newContact) => {
      const cur = parseJSON(lead.other_notes);
      const existing = Array.isArray(cur.people_contacts) ? cur.people_contacts : [];
      const hasPrimary = existing.some((c) => c.is_primary);
      const withPrimary = { ...newContact, is_primary: !hasPrimary };
      const payload = { other_notes: JSON.stringify({ ...cur, people_contacts: [...existing, withPrimary], contact_locked: true }) };
      if (!hasPrimary) payload.contact_name = newContact.name;
      await leadsService.update(lead.id, payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["linked-lead"] }); setShowAddContact(false); toast.success("Contact added"); },
    onError: (e) => toast.error(e.message || "Failed"),
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId) => {
      const cur = parseJSON(lead.other_notes);
      const existing = Array.isArray(cur.people_contacts) ? cur.people_contacts : [];
      const deleted = existing.find((c) => c.id === contactId);
      const remaining = existing.filter((c) => c.id !== contactId);
      if (deleted?.is_primary && remaining.length > 0) remaining[0] = { ...remaining[0], is_primary: true };
      const payload = { other_notes: JSON.stringify({ ...cur, people_contacts: remaining, contact_locked: true }) };
      if (deleted?.is_primary && remaining.length > 0) payload.contact_name = remaining[0].name;
      await leadsService.update(lead.id, payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["linked-lead"] }); toast.success("Contact removed"); },
    onError: (e) => toast.error(e.message || "Failed"),
  });

  useEffect(() => {
    if (!lead?.id) return;
    const channel = supabase
      .channel(`lead-timeline-${lead.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        qc.invalidateQueries({ queryKey: ["unified-timeline-lead", lead.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [lead?.id, qc]);

  if (!lead) return null;

  return (
    <>
    <AnimatePresence>
      <motion.div key="panel-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
      />

      <motion.aside key="panel"
        initial={{ x: "100%", opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 260, mass: 1 }}
        style={{ position: "fixed", right: 0, top: 0, bottom: 0, zIndex: 9991, width: "50vw", minWidth: 520, maxWidth: "100vw", background: "var(--bg)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", boxShadow: "-24px 0 64px rgba(0,0,0,0.18)" }}
      >
        {/* ── Header ── */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Hash size={10} strokeWidth={2.5} /> {leadId}
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 8 }}>
                {lead.company_name || "Unnamed Lead"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 99, background: statusInfo.bg, border: `1px solid ${statusInfo.color}30`, fontSize: 12, fontWeight: 700, color: statusInfo.color }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusInfo.color, boxShadow: `0 0 6px ${statusInfo.color}70`, display: "inline-block" }} />
                  {statusInfo.label}
                </span>
                {lead.temperature && TEMP_MAP[lead.temperature] && (() => {
                  const t = TEMP_MAP[lead.temperature]; const TIcon = t.icon;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 99, background: `${t.color}12`, border: `1px solid ${t.color}28`, fontSize: 12, fontWeight: 700, color: t.color }}>
                      <TIcon size={11} strokeWidth={2} /> {t.label}
                    </span>
                  );
                })()}
                {lead.source && <SourceBadge source={lead.source} />}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
              {/* Unlock button — visible to admins when record is locked */}
              {contactLocked && isSalesHead && (
                <motion.button
                  onClick={(e) => { e.stopPropagation(); unlockContactsMutation.mutate(); }}
                  disabled={unlockContactsMutation.isPending}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}
                  title="Unlock this record to edit"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 10, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.28)", color: "#10B981", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  <LockOpen size={13} strokeWidth={1.8} /> Unlock
                </motion.button>
              )}
              {/* Lock indicator for restricted users */}
              {contactLocked && !isSalesHead && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 12, fontWeight: 600, color: "#EF4444" }}>
                  <Lock size={12} strokeWidth={2} /> Locked
                </span>
              )}
              {isSalesHead && (
                <motion.button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await leadsService.update(lead.id, { stage: "pipeline" });
                      qc.invalidateQueries({ queryKey: ["leads"] });
                      qc.invalidateQueries({ queryKey: ["pipeline"] });
                      toast.success("Lead moved back to Pipeline");
                      onClose();
                    } catch (err) {
                      toast.error(err.message || "Failed to move to pipeline");
                    }
                  }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}
                  title="Move back to Pipeline"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 10, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.28)", color: "#8B5CF6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.1)"; }}>
                  <ArrowRightLeft size={13} strokeWidth={1.8} /> To Pipeline
                </motion.button>
              )}
              {onConvert && !["won", "converted"].includes(lead.stage) && canEdit && (
                <motion.button onClick={(e) => { e.stopPropagation(); onConvert(lead); }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 15px", borderRadius: 10, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.28)", color: "#10B981", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16,185,129,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(16,185,129,0.1)"; }}>
                  <ArrowRightLeft size={13} strokeWidth={1.8} /> Convert
                </motion.button>
              )}
              {canEdit && (
                <motion.button onClick={(e) => { e.stopPropagation(); onEdit(lead); }}
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
          <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
            {TABS.map((tab) => {
              const Icon    = tab.icon;
              const active  = activeTab === tab.key;
              const badge   = tab.key === "timeline" && activities?.length ? activities.length
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

        {/* ── Linked Deal Banner ── */}
        {linkedDeal && (
          <div style={{ padding: "10px 24px", background: "rgba(16,185,129,0.06)", borderBottom: "1px solid rgba(16,185,129,0.15)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <CheckCircle2 size={14} style={{ color: "#10B981", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#10B981" }}>Converted → Deal: </span>
              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>{linkedDeal.title || linkedDeal.company_name}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                {DEAL_STAGE_LABELS[linkedDeal.stage] || linkedDeal.stage}
                {linkedDeal.value ? ` · ₹${Number(linkedDeal.value).toLocaleString("en-IN")}` : ""}
              </span>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(16,185,129,0.15)", color: "#10B981" }}>ACTIVE DEAL</span>
          </div>
        )}


        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 32px" }}>

          {/* ── DETAILS TAB ── */}
          {activeTab === "details" && (
            <div>
              {/* ── Section 1: Company Information ── */}
              <SectionHead label="Company Information" />
              <InfoRow icon={Building2} label="Company Name"     value={lead.company_name} />
              <InfoRow icon={Globe}     label="Website"          value={extra.website} isLink={!!(extra.website)} />
              <InfoRow icon={Link2}     label="Company LinkedIn" value={extra.company_linkedin} isLink={!!(extra.company_linkedin)} />
              <InfoRow icon={Briefcase} label="Industry"         value={extra.industry} />
              {extra.country && <InfoRow icon={Globe}   label="Country" value={countryName(extra.country) || extra.country} />}
              {extra.state   && <InfoRow icon={MapPin}  label="State"   value={extra.state} />}
              {extra.city    && <InfoRow icon={MapPin}  label="Headquarters City"    value={extra.city} />}
              {(extra.services?.length > 0 || extra.custom_service) && (
                <>
                  <SectionHead label="Services" />
                  <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    {[...(extra.services || []), ...(extra.custom_service ? [extra.custom_service] : [])].map((svc, i) => (
                      <div key={svc} style={{ fontSize: 13, padding: "2px 0", color: ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899","#84CC16"][i % 8] }}>{i + 1}. {svc}</div>
                    ))}
                  </div>
                </>
              )}

              {/* ── Section 2: Contact Person ── */}
              <SectionHead label="Contact Person" />
              <InfoRow icon={User}      label="Full Name"       value={lead.contact_name} />
              <InfoRow icon={Briefcase} label="Designation"     value={lead.designation} />
              <InfoRow icon={Mail}      label="Email"           value={extra.email || lead.email} isEmail onComposeEmail={openComposer} />
              <InfoRow icon={Mail}      label="Alternate Email" value={extra.alternate_email}      isEmail onComposeEmail={openComposer} />
              <InfoRow icon={Phone}     label="Phone"           value={extra.phone || lead.phone} />
              <InfoRow icon={Phone}     label="Alternate Phone" value={extra.alternate_phone || extra.alternate_contact} />
              {extra.linkedin_url && (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(10,102,194,0.1)", border: "1px solid rgba(10,102,194,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <LinkedinIcon size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Contact LinkedIn</div>
                    <a href={extra.linkedin_url.startsWith("http") ? extra.linkedin_url : `https://${extra.linkedin_url}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 13, color: "#0A66C2", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500 }}>
                      <LinkedinIcon size={12} /> View Profile <ChevronRight size={11} strokeWidth={2} />
                    </a>
                  </div>
                </div>
              )}

              {/* ── Section 3: Lead Information ── */}
              <SectionHead label="Lead Information" />
              <InfoRow icon={Hash} label="Lead ID"      value={leadId} />
              {lead.created_by_profile?.full_name && <InfoRow icon={User} label="Connected By" value={lead.created_by_profile.full_name} />}
              {lead.assigned_profile?.full_name   && <InfoRow icon={User} label="Assigned To"  value={lead.assigned_profile.full_name} />}
              {lead.source && (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Tag size={13} style={{ color: "var(--text-muted)" }} strokeWidth={1.7} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Lead Source</div>
                    <div style={{ paddingTop: 2 }}><SourceBadge source={lead.source} /></div>
                  </div>
                </div>
              )}
              <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Stage</div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 16px", borderRadius: 99, background: statusInfo.bg, border: `1px solid ${statusInfo.color}30`, fontSize: 13, fontWeight: 700, color: statusInfo.color }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusInfo.color, boxShadow: `0 0 8px ${statusInfo.color}80` }} />
                  {statusInfo.label}
                </span>
              </div>
              {lead.temperature && TEMP_MAP[lead.temperature] && (() => {
                const t = TEMP_MAP[lead.temperature]; const TIcon = t.icon;
                return (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: `${t.color}12`, border: `1px solid ${t.color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <TIcon size={13} style={{ color: t.color }} strokeWidth={1.7} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Lead Temperature</div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{t.label}</span>
                    </div>
                  </div>
                );
              })()}
              {extra.meeting_status && extra.meeting_status !== "—" && (
                <InfoRow icon={Calendar} label="Meeting Status" value={extra.meeting_status} />
              )}
              <InfoRow icon={Clock} label="Created"      value={lead.created_at ? `${fmtDate(lead.created_at)} · ${fmtRelative(lead.created_at)}` : null} />
              <InfoRow icon={Clock} label="Last Updated" value={lead.updated_at ? `${fmtDate(lead.updated_at)} · ${fmtRelative(lead.updated_at)}` : null} />

              {/* ── Notes ── */}
              {lead.remarks && (
                <>
                  <SectionHead label="Notes" />
                  <div style={{ padding: "14px 16px", borderRadius: 12, marginTop: 4, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.7 }}>
                    {lead.remarks}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── CONTACTS TAB ── */}
          {activeTab === "contacts" && (
            <div>
              {/* Lock notice in contacts tab */}
              {contactLocked && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 10, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", marginBottom: 14, fontSize: 12.5, color: "#EF4444", fontWeight: 600 }}>
                  <Lock size={12} strokeWidth={2} />
                  {isSalesHead ? "Form locked — use Unlock button (top right) to enable editing" : "This record is locked — only Super Admin / Sales Head can unlock"}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 7 }}>
                  <Users size={15} strokeWidth={2} style={{ color: "#8B5CF6" }} />
                  Contact Persons
                  {displayContacts.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 99, background: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>{displayContacts.length}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {canChangePoc && (
                    <button onClick={() => { setShowPocSelector((v) => !v); setShowAddContact(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, background: showPocSelector ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.08)", border: `1.5px solid rgba(139,92,246,${showPocSelector ? "0.4" : "0.22"})`, color: "#8B5CF6", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      <ArrowRightLeft size={12} strokeWidth={2.5} /> Change POC
                    </button>
                  )}
                  {canEdit && !showAddContact && (
                    <button onClick={() => { setShowAddContact(true); setShowPocSelector(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, background: "rgba(59,130,246,0.08)", border: "1.5px solid rgba(59,130,246,0.22)", color: "#3B82F6", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      <Plus size={13} strokeWidth={2.5} /> Add Contact
                    </button>
                  )}
                </div>
              </div>

              {/* POC Selector — admin only, always accessible */}
              {canChangePoc && showPocSelector && (
                <div style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: "1.5px solid rgba(139,92,246,0.3)", marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8B5CF6", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <ArrowRightLeft size={13} strokeWidth={2} /> Select New Point of Contact
                  </div>
                  {peopleContacts.length <= 1 && (
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "10px 12px", borderRadius: 9, background: "var(--surface)", border: "1px solid var(--border)", marginBottom: 10 }}>
                      Only one contact person exists. Add more contacts using the <strong>+ Add Contact</strong> button, then change the POC here.
                    </div>
                  )}
                  {peopleContacts.map((c) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 9, marginBottom: 6, background: c.is_primary ? "rgba(139,92,246,0.08)" : "var(--surface)", border: `1px solid ${c.is_primary ? "rgba(139,92,246,0.25)" : "var(--border)"}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                          {c.name}
                          {c.is_primary && <span style={{ fontSize: 10, fontWeight: 800, color: "#8B5CF6", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 99, padding: "1px 7px" }}>Current POC</span>}
                        </div>
                        {c.designation && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>{c.designation}</div>}
                      </div>
                      {!c.is_primary && (
                        <button disabled={setPocMutation.isPending}
                          onClick={() => { setPocMutation.mutate({ contactId: c.id, contactName: c.name }); setShowPocSelector(false); }}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 8, background: "rgba(139,92,246,0.1)", border: "1.5px solid rgba(139,92,246,0.28)", color: "#8B5CF6", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: setPocMutation.isPending ? 0.6 : 1 }}>
                          <Star size={10} strokeWidth={2} /> Set as POC
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setShowPocSelector(false)}
                    style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginTop: 4, fontFamily: "inherit" }}>
                    Cancel
                  </button>
                </div>
              )}

              {canEdit && showAddContact && (
                <AddLeadPeopleContactForm
                  onAdd={(contact) => addContactMutation.mutate(contact)}
                  onCancel={() => setShowAddContact(false)}
                />
              )}

              {displayContacts.length === 0 && !showAddContact ? (
                <div style={{ textAlign: "center", padding: "36px 24px", color: "var(--text-muted)" }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                    <Users size={22} style={{ opacity: 0.3 }} />
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-2)", marginBottom: 4 }}>No contacts added yet</div>
                  <div style={{ fontSize: 12, opacity: 0.5 }}>Add people you work with at this company</div>
                </div>
              ) : displayContacts.length > 0 ? (
                <div>
                  {[...displayContacts]
                    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
                    .map((contact) => (
                      <LeadPeopleContactCard
                        key={contact.id}
                        contact={contact}
                        canEdit={canEdit && !contact.__synthetic}
                        onSetPrimary={(c) => setPocMutation.mutate({ contactId: c.id, contactName: c.name })}
                        onDelete={(id) => deleteContactMutation.mutate(id)}
                        isPending={setPocMutation.isPending}
                        onComposeEmail={(email, name) => openComposer(email, name)}
                      />
                    ))}
                </div>
              ) : null}

              {pocHistory.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "20px 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                    <ArrowRightLeft size={11} /> POC Switch History
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {pocHistory.map((h, i) => (
                      <div key={h.id} style={{ display: "flex", gap: 12, position: "relative" }}>
                        {i < pocHistory.length - 1 && <div style={{ position: "absolute", left: 15, top: 32, bottom: -4, width: 1, background: "var(--border)" }} />}
                        <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: "rgba(139,92,246,0.1)", border: "1.5px solid rgba(139,92,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                          <ArrowRightLeft size={13} style={{ color: "#8B5CF6" }} strokeWidth={1.8} />
                        </div>
                        <div style={{ flex: 1, paddingBottom: i === pocHistory.length - 1 ? 0 : 20 }}>
                          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                            <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>{h.from_name || "—"}</span>
                            <span style={{ margin: "0 6px", color: "var(--text-muted)" }}>→</span>
                            <span style={{ fontWeight: 700, color: "#8B5CF6" }}>{h.to_name}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                            by {h.changed_by_name} · {h.changed_at ? formatDistanceToNow(new Date(h.changed_at), { addSuffix: true }) : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

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
              {linkedDeal && (
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={11} style={{ color: "#10B981" }} />
                  Shows activities from both Lead and linked Deal
                </div>
              )}

              {(() => {
                if (!extra.services?.length || !activities?.length) return null;
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const recentSvcs = activities.filter((a) => new Date(a.created_at) >= sevenDaysAgo).map((a) => a.metadata?.service).filter(Boolean);
                const staleSvcs = extra.services.filter((s) => !recentSvcs.includes(s));
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
              <AddActivityForm leadId={lead.id} profile={profile} services={extra.services || []} existingActivities={activities || []}
                editingActivity={editingActivity}
                onCancelEdit={() => setEditingActivity(null)}
                onSuccess={() => {
                  qc.invalidateQueries({ queryKey: ["unified-timeline-lead", lead.id] });
                  if (linkedDeal?.id) qc.invalidateQueries({ queryKey: ["unified-timeline-deal", linkedDeal.id] });
                  qc.invalidateQueries({ queryKey: ["activities"] });
                  qc.invalidateQueries({ queryKey: ["inactive-lead-summary"] });
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

          {/* ── HISTORY TAB — unified merged chronological timeline ── */}
          {activeTab === "history" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
                <History size={15} strokeWidth={2} style={{ color: "#8B5CF6" }} />
                Activity & Change History
                {(() => { const total = (activities?.length || 0) + (historyRecords?.length || 0); return total > 0 ? <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 99, background: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>{total}</span> : null; })()}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 20 }}>All activities and field changes for this lead.</div>

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

                const groups = groupHistoryByDate(mergedItems);
                return (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {groups.map(([dateLabel, recs], gi) => (
                      <div key={dateLabel}>
                        <HistoryDateDivider label={dateLabel} />
                        {recs.map((item, i) => {
                          const isLast = gi === groups.length - 1 && i === recs.length - 1;
                          return item._type === "activity"
                            ? <ActivityItem key={item.id} activity={item} isLast={isLast} onEdit={(a) => setEditingActivity(a)} />
                            : <HistoryItem key={item.id} record={item} isLast={isLast} />;
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
