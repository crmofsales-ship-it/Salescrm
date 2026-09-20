import { useState, useRef, useEffect } from "react";
import { COUNTRIES, findCountry, countryName, countryFlag, countryFlagUrl } from "../constants/countries";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { DndContext, closestCenter, DragOverlay, useDraggable, useDroppable, useSensors, useSensor, MouseSensor, TouchSensor, PointerSensor } from "@dnd-kit/core";
import { useAuth } from "../context/AuthContext";
import { dealsService } from "../services/dealsService";
import { logExport } from "../services/auditService";
import { useCurrency } from "../context/CurrencyContext";
import { db as supabase } from "../lib/db";
import toast from "react-hot-toast";
import {
  Plus, Search, Pencil, Trash2, X, TrendingUp, Download, Upload,
  LayoutList, Columns, MoreVertical, CheckCircle2, XCircle, Calendar,
  Clock, IndianRupee, AlertTriangle, Building2, Trophy,
  Flame, Thermometer, Snowflake, Lock, LockOpen, Undo2, ArrowRightLeft,
  Filter, ArrowUpDown, ArrowUp, ArrowDown, Globe, ExternalLink, ChevronDown,
} from "lucide-react";
import { getAccessToken } from "../lib/session";
import SkeletonTable from "../components/SkeletonTable";
import { ColumnToggle, TemplateMenu } from "../components/TableControls";
import { useTablePreferences } from "../hooks/useTablePreferences";
import DealDetailPanel from "../components/DealDetailPanel";
import { ContactSubStatusModal, ATTEMPTED_CONTACT_REASONS, ENGAGED_REASONS } from "../components/ContactSubStatusModal";
import { DuplicateCheckModal } from "../components/DuplicateCheckModal";
import { detectDuplicates, detectExactDuplicates } from "../utils/duplicateCheck";

const DEAL_SUB_STATUS_META = {
  attempted_contact: { label: "Attempted Contact Reason", reasons: ATTEMPTED_CONTACT_REASONS },
  engaged:           { label: "Engaged Reason",           reasons: ENGAGED_REASONS           },
};

function ContactSubStatusInlineDeal({ status, value, remarks, onChange, onRemarksChange }) {
  const meta = DEAL_SUB_STATUS_META[status];
  if (!meta) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <label className="crm-label">{meta.label} <span style={{ color: "#EF4444" }}>*</span></label>
        <select className="crm-input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select a reason —</option>
          {meta.reasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className="crm-label">Remarks <span style={{ fontSize: 10, fontWeight: 400 }}>(optional)</span></label>
        <textarea className="crm-input" value={remarks || ""} onChange={(e) => onRemarksChange(e.target.value)} placeholder="Add context..." rows={2} style={{ resize: "vertical" }} />
      </div>
    </div>
  );
}
import { changeHistoryService, DEAL_TRACKED_FIELDS } from "../services/changeHistoryService";
import { SourceBadge } from "../components/SourceBadge";
import { ActivityEngine } from "../services/activityEngine";

const SAP_SERVICES = [
  "SAP Implementation", "SAP Migration ECC→S/4HANA", "SAP Version Upgrade",
  "SAP Resource Augmentation", "Other Project Services",
];

const DEAL_COLUMNS = [
  { key: "deal_id",  label: "ID",                required: true },
  { key: "company",  label: "Company",           required: true },
  { key: "industry", label: "Industry"                         },
  { key: "country",  label: "Country"                          },
  { key: "contact",  label: "POC"                              },
  { key: "source",   label: "Source"                           },
  { key: "services", label: "Services"                         },
  { key: "website",  label: "Website"                          },
  { key: "linkedin", label: "LinkedIn"                         },
  { key: "stage",    label: "Stage",             required: true },
  { key: "value",    label: "Deal Value"                       },
  { key: "assigned", label: "Assigned"                         },
  { key: "created",  label: "Date"                             },
];

// ─── View Preference Modal ────────────────────────────────────────────────────
function ViewPreferenceModal({ onSelect }) {
  return (
    <div className="modal-overlay">
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 440 }}
      >
        <div style={{ padding: "24px 28px" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <TrendingUp size={32} style={{ color: "var(--accent)", marginBottom: 10 }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Select View</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)" }}>How would you like to view your deals?</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button
              onClick={() => onSelect("kanban")}
              style={{ padding: "18px 14px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", textAlign: "center", transition: "all 0.14s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-light)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-2)"; }}
            >
              <Columns size={28} style={{ color: "var(--accent)", marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Kanban View</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 }}>Drag-and-drop cards<br />Visual sales workflow</div>
            </button>
            <button
              onClick={() => onSelect("list")}
              style={{ padding: "18px 14px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", textAlign: "center", transition: "all 0.14s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-light)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-2)"; }}
            >
              <LayoutList size={28} style={{ color: "var(--accent)", marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Table View</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 }}>Sortable columns<br />Filters &amp; export</div>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };
const toJSON    = (obj) => JSON.stringify(obj);


function dealHealth(deal) {
  const ts = deal.updated_at || deal.created_at;
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days < 3)  return { color: "#10B981", label: "Active",  days };
  if (days < 7)  return { color: "#F59E0B", label: "At Risk", days };
  return           { color: "#EF4444", label: "Stale",   days };
}

function closingSoon(deal) {
  if (!deal.close_date || ["won","lost"].includes(deal.stage)) return null;
  const days = Math.ceil((new Date(deal.close_date) - Date.now()) / 86400000);
  if (days < 0)  return { label: `${Math.abs(days)}d overdue`, color: "#EF4444", bg: "#FEE2E2" };
  if (days <= 3) return { label: `${days}d left`,              color: "#EF4444", bg: "#FEE2E2" };
  if (days <= 7) return { label: `${days}d left`,              color: "#F59E0B", bg: "#FEF3C7" };
  return null;

}

// ─── Stage config ─────────────────────────────────────────────────────────────
const FUNNEL_STATUSES = [
  { key: "new",               label: "New",               color: "#6B7280", bg: "#F3F4F6",  dark: "rgba(107,114,128,0.12)", probability: 5,   hasSubStatus: false },
  { key: "attempted_contact", label: "Attempted Contact", color: "#F59E0B", bg: "#FEF3C7",  dark: "rgba(245,158,11,0.12)",  probability: 8,   hasSubStatus: true  },
  { key: "engaged",           label: "Engaged",           color: "#3B82F6", bg: "#DBEAFE",  dark: "rgba(59,130,246,0.12)",  probability: 12,  hasSubStatus: true  },
  { key: "contacted",         label: "Contacted",         color: "#6366F1", bg: "#EEF2FF",  dark: "rgba(99,102,241,0.12)",  probability: 15  },
  { key: "meeting_scheduled", label: "Meeting Scheduled", color: "#8B5CF6", bg: "#EDE9FE",  dark: "rgba(139,92,246,0.12)",  probability: 30  },
  { key: "proposal_sent",     label: "Proposal Sent",     color: "#F59E0B", bg: "#FEF3C7",  dark: "rgba(245,158,11,0.12)",  probability: 50  },
  { key: "negotiation",       label: "Negotiation",       color: "#F97316", bg: "#FFEDD5",  dark: "rgba(249,115,22,0.12)",  probability: 70  },
  { key: "won",               label: "Won",               color: "#10B981", bg: "#D1FAE5",  dark: "rgba(16,185,129,0.12)",  probability: 100 },
  { key: "lost",              label: "Lost",              color: "#EF4444", bg: "#FEE2E2",  dark: "rgba(239,68,68,0.12)",   probability: 0   },
];

const STUCK_DAYS = 7;

const TEMP_CONFIG = {
  hot:  { color: "#FF000D", text: "#CC0010", bg: "#FFF1F1", badgeBg: "#FFE0E0", border: "#FF4D4F", glow: "rgba(255,0,13,0.12)",   label: "Hot",  icon: Flame       },
  warm: { color: "#FFD600", text: "#92400E", bg: "#FFFBEB", badgeBg: "#FEF3C7", border: "#FACC15", glow: "rgba(250,204,21,0.15)", label: "Warm", icon: Thermometer },
  cold: { color: "#0066FF", text: "#1D4ED8", bg: "#EFF6FF", badgeBg: "#DBEAFE", border: "#3B82F6", glow: "rgba(59,130,246,0.12)", label: "Cold", icon: Snowflake   },
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────
const CSV_HEADERS = ["Status","Company Name","Headquarters City","Contact Name","Designation","Contact No","Value","Close Date","Remarks"];
function csvEsc(v) { return `"${(v||"").toString().replace(/"/g,'""')}"`; }
function exportCSV(rows) {
  const lines = [CSV_HEADERS.map(csvEsc).join(",")];
  rows.forEach((d) => {
    const x = parseJSON(d.notes);
    lines.push([d.stage, d.company_name||d.title, x.city || x.headquarters, d.contact_name, x.designation, x.contact, d.value||"", d.close_date||"", x.remarks].map(csvEsc).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "deals.csv" });
  a.click(); URL.revokeObjectURL(a.href);
}
function parseCSVText(text) {
  const parseLine = (line) => {
    const res = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (line[i] === ',' && !inQ) { res.push(cur.trim()); cur = ""; }
      else cur += line[i];
    }
    res.push(cur.trim()); return res;
  };
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((l) => { const v = parseLine(l); return Object.fromEntries(headers.map((h,i) => [h, v[i]||""])); });
}
function csvToPayload(row, userId) {
  return {
    title: row["Company Name"], company_name: row["Company Name"], contact_name: row["Contact Name"],
    stage: row["Status"] || "new",
    value: row["Value"] ? Number(row["Value"]) : null,
    close_date: row["Close Date"] || null,
    notes: JSON.stringify({ city: row["Headquarters City"] || row["Headquarters"] || "", designation: row["Designation"], contact: row["Contact No"], remarks: row["Remarks"] }),
    created_by: userId,
  };
}

function downloadDealTemplate() {
  const headers = ["Lead ID","Company Name","Industry","Country","POC (Contact Name)","Source","Stage","Deal Value","Assigned To","Date","Designation","Contact No","Remarks"];
  const sample  = ["LEAD-0012","Acme Corp","Information Technology","India","John Doe","referral","new","500000","","2026-12-31","CTO","9876543210","Interested in SAP implementation"];
  const note = [
    "// Lead ID: LEAD-XXXX format (e.g. LEAD-0012)",
    "// Stage: new contacted meeting_scheduled proposal_sent negotiation won lost",
    "// Source: referral website event cold_call linkedin other",
    "// Deal Value: numeric (e.g. 500000)",
    "// Conversion Date: YYYY-MM-DD format",
    "// Delete these comment rows before importing",
  ];
  const lines = [
    headers.map(csvEsc).join(","),
    sample.map(csvEsc).join(","),
    ...note.map((n) => csvEsc(n) + ",".repeat(headers.length - 1)),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "deal-import-template.csv" });
  a.click(); URL.revokeObjectURL(a.href);
}

// ─── Toolbar Pagination (compact, inline in toolbar) ─────────────────────────
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

// ─── Pipeline Stats Bar ───────────────────────────────────────────────────────
function PipelineStatsBar({ deals }) {
  const { formatCompact } = useCurrency();
  const fmtVal = (v) => { const n = Number(v); return n ? formatCompact(n) : null; };
  const active = deals.filter((d) => !["won","lost"].includes(d.stage));
  const wonDeals = deals.filter((d) => d.stage === "won");
  const now = new Date();
  const wonMTD = wonDeals
    .filter((d) => { const dt = new Date(d.closed_at || d.updated_at); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear(); })
    .reduce((s, d) => s + (Number(d.value) || 0), 0);
  const totalPipeline = active.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const weightedForecast = active.reduce((s, d) => {
    const prob = FUNNEL_STATUSES.find((x) => x.key === d.stage)?.probability || 0;
    return s + (Number(d.value) || 0) * prob / 100;
  }, 0);
  const avgDeal = active.length ? totalPipeline / active.length : 0;
  const atRisk = active.filter((d) => dealHealth(d).label !== "Active").length;

  const items = [
    { v: fmtVal(totalPipeline) || "—", l: "Pipeline",        c: "var(--accent)" },
    { v: fmtVal(weightedForecast) || "—", l: "WTD Forecast", c: "#8B5CF6" },
    { v: fmtVal(wonMTD) || "—",     l: "Won This Month",     c: "#10B981" },
    { v: fmtVal(avgDeal) || "—",    l: "Avg Deal Size",      c: "#3B82F6" },
    { v: atRisk,                    l: "At Risk",             c: atRisk > 0 ? "#EF4444" : "var(--text-muted)" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "7px 20px", borderBottom: "1px solid var(--border)", overflowX: "auto", gap: 0, flexShrink: 0 }}>
      {items.map((s, i) => (
        <div key={s.l} style={{ display: "flex", alignItems: "baseline", gap: 5, padding: "2px 18px", flexShrink: 0, ...(i > 0 ? { borderLeft: "1px solid var(--border)" } : {}) }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: s.c, letterSpacing: "-0.03em" }}>{s.v}</span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{s.l}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ stage }) {
  const s = FUNNEL_STATUSES.find((x) => x.key === stage);
  if (!s) return <span style={{ color: "var(--text-muted)" }}>{stage || "—"}</span>;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99,
      fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
      {s.label}
    </span>
  );
}

// ─── Lost Reason Modal ────────────────────────────────────────────────────────
const LOST_REASONS = ["Price too high","Chose competitor","No budget","No decision made","Wrong timing","Requirements not met","Other"];

function LostReasonModal({ deal, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 420 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Mark as Lost</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{deal.company_name || deal.title}</p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="crm-label">Lost Reason</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {LOST_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  style={{
                    padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: reason === r ? "#FEE2E2" : "var(--surface-2)",
                    color: reason === r ? "#EF4444" : "var(--text-2)",
                    border: `1.5px solid ${reason === r ? "#EF444460" : "var(--border)"}`,
                    transition: "all 0.14s",
                  }}
                >{r}</button>
              ))}
            </div>
          </div>
          {reason === "Other" && (
            <div>
              <label className="crm-label">Specify reason</label>
              <input className="crm-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Enter reason..." />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              style={{ background: "#EF4444", borderColor: "#EF4444" }}
              disabled={!reason}
              onClick={() => onConfirm(reason === "Other" ? (custom || "Other") : reason)}
            >Mark Lost</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Deal Modal ───────────────────────────────────────────────────────────────
function DealModal({ deal, onClose, onSave, teamMembers = [], canReassign = false }) {
  const { symbol } = useCurrency();
  const extra = parseJSON(deal?.notes);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      stage:        deal?.stage || "new",
      temperature:  deal?.temperature || "",
      company_name: deal?.company_name || deal?.title || "",
      industry:     extra.industry || "",
      country:      findCountry(extra.country)?.code || "",
      state:        extra.state || "",
      city:         extra.city || extra.headquarters || "",
      contact_name: deal?.contact_name || "",
      designation:  extra.designation || "",
      email:        extra.email || "",
      contact:      extra.contact || "",
      value:        deal?.value || "",
      close_date:   deal?.close_date || "",
      remarks:      extra.remarks || "",
      assigned_to:  deal?.assigned_to || "",
    },
  });
  const selectedStage = watch("stage");
  const selectedTemp  = watch("temperature");

  const DEAL_SUB_STATUS_KEYS = ["attempted_contact", "engaged"];
  const showDealSubStatus = DEAL_SUB_STATUS_KEYS.includes(selectedStage);
  const [dealSubStatusReason,  setDealSubStatusReason]  = useState(extra.contact_sub_status?.reason  || "");
  const [dealSubStatusRemarks, setDealSubStatusRemarks] = useState(extra.contact_sub_status?.remarks || "");

  const [selectedServices, setSelectedServices] = useState(() => extra.services || []);
  const [customService, setCustomService] = useState(extra.custom_service || "");
  const [svcOpen, setSvcOpen] = useState(false);
  const toggleService = (svc) =>
    setSelectedServices((p) => p.includes(svc) ? p.filter((s) => s !== svc) : [...p, svc]);

  const handleSave = async (fd) => {
    if (!fd.email?.trim() && !fd.contact?.trim()) {
      toast.error("Please provide at least one contact detail — Email or Phone is required");
      return;
    }
    if (DEAL_SUB_STATUS_KEYS.includes(fd.stage) && !dealSubStatusReason) {
      toast.error("Please select a reason for the status before saving.");
      return;
    }
    if (selectedServices.includes("Other Project Services") && !customService.trim()) {
      toast.error("Please describe the custom / other service before saving.");
      return;
    }
    const subStatus = DEAL_SUB_STATUS_KEYS.includes(fd.stage) && dealSubStatusReason
      ? { reason: dealSubStatusReason, remarks: dealSubStatusRemarks || null, updated_at: new Date().toISOString() }
      : (extra.contact_sub_status || undefined);
    await onSave({
      title:        fd.company_name,
      company_name: fd.company_name,
      contact_name: fd.contact_name,
      stage:        fd.stage,
      temperature:  fd.temperature || null,
      value:        fd.value ? Number(fd.value) : null,
      close_date:   fd.close_date || null,
      assigned_to:  fd.assigned_to || null,
      notes: toJSON({ ...extra, country: fd.country, state: fd.state, city: fd.city, designation: fd.designation, email: fd.email, contact: fd.contact, remarks: fd.remarks, lead_code: extra.lead_code || undefined, source: extra.source || undefined, industry: fd.industry || "", services: selectedServices.length ? selectedServices : undefined, custom_service: selectedServices.includes("Other Project Services") ? customService : "", contact_sub_status: subStatus }),
    });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 780 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{deal?.id ? "Edit Deal" : "Add Deal"}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(handleSave)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Stage picker */}
          <div>
            <label className="crm-label">Stage *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {FUNNEL_STATUSES.map((s) => (
                <label key={s.key} style={{ cursor: "pointer" }}>
                  <input type="radio" value={s.key} {...register("stage")} style={{ display: "none" }} />
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 99,
                    fontSize: 12, fontWeight: 600,
                    background: selectedStage === s.key ? s.bg : "var(--surface-2)",
                    color: selectedStage === s.key ? s.color : "var(--text-muted)",
                    border: `1.5px solid ${selectedStage === s.key ? s.color + "60" : "var(--border)"}`,
                    cursor: "pointer", transition: "all 0.14s",
                  }}>
                    {selectedStage === s.key && <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />}
                    {s.label}
                    {selectedStage === s.key && s.probability > 0 && (
                      <span style={{ fontSize: 10, opacity: 0.75 }}>{s.probability}%</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {showDealSubStatus && (
              <div style={{ marginTop: 10 }}>
                <ContactSubStatusInlineDeal
                  status={selectedStage}
                  value={dealSubStatusReason}
                  remarks={dealSubStatusRemarks}
                  onChange={(v) => { setDealSubStatusReason(v); }}
                  onRemarksChange={setDealSubStatusRemarks}
                />
              </div>
            )}
          </div>
          {/* Temperature picker */}
          <div>
            <label className="crm-label">Temperature</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {Object.entries(TEMP_CONFIG).map(([key, t]) => {
                const TIcon  = t.icon;
                const active = selectedTemp === key;
                return (
                  <label key={key} style={{ cursor: "pointer" }}>
                    <input type="radio" value={key} {...register("temperature")} style={{ display: "none" }} />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 18px", borderRadius: 99, fontSize: 12.5, fontWeight: 800, cursor: "pointer", transition: "all 0.15s", background: active ? t.bg : "var(--surface-2)", color: active ? t.text : "var(--text-muted)", border: `1.5px solid ${active ? t.border : "var(--border)"}`, letterSpacing: active ? "0.03em" : "normal" }}>
                      <TIcon size={12} strokeWidth={2} /> {t.label}
                    </span>
                  </label>
                );
              })}
              <label style={{ cursor: "pointer", alignSelf: "center" }}>
                <input type="radio" value="" {...register("temperature")} style={{ display: "none" }} />
                <span style={{ fontSize: 11.5, color: selectedTemp ? "var(--text-muted)" : "var(--accent)", padding: "6px 10px", cursor: "pointer", borderRadius: 8, textDecoration: "underline" }}>
                  {selectedTemp ? "Clear" : "None"}
                </span>
              </label>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="crm-label">Company Name *</label>
              <input className="crm-input" {...register("company_name", { required: "Required" })} placeholder="Acme Corp" />
              {errors.company_name && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.company_name.message}</span>}
            </div>
            <div>
              <label className="crm-label">Industry</label>
              <select className="crm-input" {...register("industry")}>
                <option value="">Select industry</option>
                {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Country</label>
              <select className="crm-input" {...register("country")}>
                <option value="">Select Country</option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">State / Province</label>
              <input className="crm-input" {...register("state")} placeholder="e.g. Maharashtra" />
            </div>
            <div>
              <label className="crm-label">Headquarters City</label>
              <input className="crm-input" {...register("city")} placeholder="e.g. Mumbai" />
            </div>
            <div>
              <label className="crm-label">Contact Name</label>
              <input className="crm-input" {...register("contact_name")} placeholder="John Doe" />
            </div>
            <div>
              <label className="crm-label">Designation</label>
              <input className="crm-input" {...register("designation")} placeholder="CTO" />
            </div>
            <div>
              <label className="crm-label">Email <span style={{ color: "#EF4444" }}>*</span> <span style={{ fontSize: 10.5, fontWeight: 400, color: "var(--text-muted)" }}>(or Phone)</span></label>
              <input className="crm-input" type="email" {...register("email")} placeholder="contact@company.com" />
            </div>
            <div>
              <label className="crm-label">Phone <span style={{ fontSize: 10.5, fontWeight: 400, color: "var(--text-muted)" }}>(or Email)</span></label>
              <input className="crm-input" {...register("contact")} placeholder="+91 98765 43210" />
            </div>
            <div>
              <label className="crm-label">Deal Value ({symbol})</label>
              <div style={{ position: "relative" }}>
                <IndianRupee size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input className="crm-input" type="number" min="0" step="1" {...register("value", { min: 0, valueAsNumber: true })} placeholder="500000" style={{ paddingLeft: 28 }} onKeyDown={(e) => ["e","E","+","-","."].includes(e.key) && e.preventDefault()} />
              </div>
            </div>
            <div>
              <label className="crm-label">Expected Close Date</label>
              <input className="crm-input" type="date" {...register("close_date")} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Remarks</label>
              <textarea className="crm-input" {...register("remarks")} rows={3} placeholder="Deal notes..." style={{ resize: "vertical" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">SAP Services</label>
              <button type="button" onClick={() => setSvcOpen((o) => !o)}
                style={{ width: "100%", height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>
                <span style={{ color: selectedServices.length ? "var(--text)" : "var(--text-muted)" }}>
                  {selectedServices.length ? selectedServices.join(", ") : "Select SAP services..."}
                </span>
                <ChevronDown size={14} style={{ color: "var(--text-muted)", transform: svcOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {svcOpen && (
                <div style={{ marginTop: 4, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
                  {SAP_SERVICES.map((svc) => {
                    const checked = selectedServices.includes(svc);
                    return (
                      <label key={svc} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: checked ? "rgba(99,102,241,0.06)" : "transparent", transition: "background 0.12s" }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleService(svc)} style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
                        <span style={{ fontSize: 13, color: checked ? "var(--accent)" : "var(--text)", fontWeight: checked ? 600 : 400 }}>{svc}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {selectedServices.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                  {selectedServices.map((svc) => (
                    <span key={svc} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, padding: "2px 9px", borderRadius: 99, background: "rgba(99,102,241,0.08)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.2)" }}>
                      {svc}
                      <button type="button" onClick={() => toggleService(svc)} style={{ display: "inline-flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--accent)", lineHeight: 1 }}>
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {selectedServices.includes("Other Project Services") && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} style={{ marginTop: 8 }}>
                  <input className="crm-input" value={customService} onChange={(e) => setCustomService(e.target.value)} placeholder="Describe the custom / other service..." />
                </motion.div>
              )}
            </div>
            {canReassign && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="crm-label">Assign To</label>
                <select className="crm-input" {...register("assigned_to")}>
                  <option value="">— Auto (creator) —</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : deal?.id ? "Save Changes" : "Add Deal"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Quick Action Menu ────────────────────────────────────────────────────────
function QuickMenu({ deal, onEdit, onMarkWon, onMarkLost, onDelete, onClose, onLock, onUnlock, onRevertLead, onRevertPipeline, canDelete, isSalesHead, canRevert, isFieldUser, currentUserId }) {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const isLocked = deal.is_locked;
  const canEditThis = isSalesHead || deal.assigned_to === currentUserId || deal.created_by === currentUserId;
  const items = [
    ...(!isLocked && canEditThis ? [
      { label: "Edit",      icon: Pencil,       action: () => { onEdit(deal); onClose(); }, color: "var(--text-2)" },
      { label: "Mark Won",  icon: CheckCircle2, action: () => { onMarkWon(deal); onClose(); }, color: "#10B981", disabled: deal.stage === "won" },
      { label: "Mark Lost", icon: XCircle,      action: () => { onMarkLost(deal); onClose(); }, color: "#EF4444", disabled: deal.stage === "lost" },
      ...(canDelete ? [{ label: "Delete", icon: Trash2, action: () => { onDelete(deal.id); onClose(); }, color: "#EF4444", danger: true }] : []),
    ] : isSalesHead && isLocked ? [
      { label: "Edit",      icon: Pencil,       action: () => { onEdit(deal); onClose(); }, color: "var(--text-2)" },
      { label: "Mark Won",  icon: CheckCircle2, action: () => { onMarkWon(deal); onClose(); }, color: "#10B981", disabled: deal.stage === "won" },
      { label: "Mark Lost", icon: XCircle,      action: () => { onMarkLost(deal); onClose(); }, color: "#EF4444", disabled: deal.stage === "lost" },
      ...(canDelete ? [{ label: "Delete", icon: Trash2, action: () => { onDelete(deal.id); onClose(); }, color: "#EF4444", danger: true }] : []),
    ] : []),
    ...(isSalesHead ? [
      isLocked
        ? { label: "Unlock Record", icon: LockOpen, action: () => { onUnlock(deal.id); onClose(); }, color: "#10B981" }
        : { label: "Lock Record",   icon: Lock,     action: () => { onLock(deal.id); onClose(); },   color: "var(--text-muted)" },
    ] : []),
    ...(canRevert && deal.lead_id ? [
      { label: "Revert → Lead",     icon: Undo2,          action: () => { onRevertLead(deal); onClose(); },     color: "#6366F1" },
      { label: "Revert → Pipeline", icon: ArrowRightLeft, action: () => { onRevertPipeline(deal); onClose(); }, color: "#10B981" },
    ] : []),
  ];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -4 }}
      transition={{ duration: 0.12 }}
      style={{
        position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 10, boxShadow: "var(--shadow-lg)",
        padding: "4px 0", minWidth: 150,
      }}
    >
      {items.map(({ label, icon: Icon, action, color, danger, disabled }) => (
        <button
          key={label}
          onClick={(e) => { e.stopPropagation(); if (!disabled) action(); }}
          disabled={disabled}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "8px 14px", border: "none",
            background: "transparent", cursor: disabled ? "not-allowed" : "pointer",
            color: disabled ? "var(--text-muted)" : color,
            fontSize: 13, fontWeight: 500, textAlign: "left",
            opacity: disabled ? 0.5 : 1,
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? "#FEE2E240" : "var(--surface-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Icon size={13} strokeWidth={1.8} />
          {label}
        </button>
      ))}
    </motion.div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function DealCard({ deal, onEdit, onMarkWon, onMarkLost, onDelete, onOpen, onLock, onUnlock, onRevertLead, onRevertPipeline, isDragging = false, canDelete = false, isSalesHead = false, canRevert = false, isFieldUser = false, currentUserId = null }) {
  const { formatCompact } = useCurrency();
  const fmtVal = (v) => { const n = Number(v); return n ? formatCompact(n) : null; };
  const extra  = parseJSON(deal.notes);
  const s      = FUNNEL_STATUSES.find((x) => x.key === deal.stage) || FUNNEL_STATUSES[0];
  const health = dealHealth(deal);
  const val    = fmtVal(deal.value);
  const temp   = TEMP_CONFIG[deal.temperature];
  const [menuOpen, setMenuOpen] = useState(false);

  const isTerminal  = ["won", "lost"].includes(deal.stage);
  const staleDays   = Math.floor((Date.now() - new Date(deal.updated_at || deal.created_at).getTime()) / 86400000);
  const isPremium   = Number(deal.value) >= 500000;
  const heatClass   = !isTerminal ? (staleDays >= 7 ? "deal-critical" : staleDays >= 3 ? "deal-at-risk" : "") : "";
  const premClass   = isPremium && !isTerminal ? "deal-premium" : "";
  const heatClasses = [heatClass, premClass].filter(Boolean).join(" ");

  const accentColor = temp ? temp.color : s.color;
  const cardStyle = {
    background:  temp ? temp.bg : "#F9FAFB",
    borderColor: temp ? temp.border : "#E5E7EB",
    borderLeft:  `4px solid ${accentColor}`,
    boxShadow:   temp
      ? `0 2px 14px ${temp.glow}, 0 1px 3px rgba(0,0,0,0.05)`
      : "0 1px 4px rgba(0,0,0,0.07)",
  };
  const textColor  = "#111827";
  const mutedColor = "#4B5563";
  const subMuted   = "#6B7280";
  const trackBg    = "rgba(0,0,0,0.06)";
  const divider    = "#E5E7EB";

  return (
    <div
      className={`kanban-card${heatClasses ? ` ${heatClasses}` : ""}`}
      onClick={(e) => { if (!e.defaultPrevented) onOpen?.(deal); }}
      style={{
        opacity: isDragging ? 0.35 : 1,
        cursor: isDragging ? "grabbing" : "pointer",
        position: "relative",
        transition: "box-shadow 0.2s, transform 0.15s",
        ...cardStyle,
      }}
    >
      {/* Top row: company + menu */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: textColor, flex: 1, lineHeight: 1.35, display: "flex", alignItems: "flex-start", gap: 5 }}>
          {deal.company_name || deal.title || "—"}
          {deal.is_locked && <Lock size={10} strokeWidth={2} style={{ color: subMuted, flexShrink: 0, marginTop: 2 }} title="Record locked" />}
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setMenuOpen((v) => !v); }}
            className="icon-action-btn"
            title="Actions"
            style={{ opacity: 0.7, color: mutedColor }}
          >
            <MoreVertical size={12} strokeWidth={2} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <QuickMenu
                deal={deal}
                onEdit={onEdit}
                onMarkWon={onMarkWon}
                onMarkLost={onMarkLost}
                onDelete={onDelete}
                onLock={onLock}
                onUnlock={onUnlock}
                onRevertLead={onRevertLead}
                onRevertPipeline={onRevertPipeline}
                onClose={() => setMenuOpen(false)}
                canDelete={canDelete}
                isSalesHead={isSalesHead}
                canRevert={canRevert}
                isFieldUser={isFieldUser}
                currentUserId={currentUserId}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Temperature badge */}
      {temp && (() => {
        const TempIcon = temp.icon;
        return (
          <div style={{ marginBottom: 7 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 99, background: temp.badgeBg, color: temp.text, border: `1.5px solid ${temp.border}`, letterSpacing: "0.03em" }}>
              <TempIcon size={9} strokeWidth={2.5} /> {temp.label}
            </span>
          </div>
        );
      })()}

      {/* Contact */}
      {deal.contact_name && (
        <div style={{ fontSize: 12, color: mutedColor, marginBottom: 6, fontWeight: 500 }}>
          {deal.contact_name}{extra.designation ? ` · ${extra.designation}` : ""}
        </div>
      )}

      {/* Value + close date row */}
      {(val || deal.close_date) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          {val && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 12, fontWeight: 800, color: "#059669",
              background: "#D1FAE5", border: "1px solid rgba(5,150,105,0.25)",
              padding: "3px 9px", borderRadius: 7,
              letterSpacing: "-0.01em",
            }}>
              {val}
            </span>
          )}
          {deal.close_date && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 11, color: subMuted,
            }}>
              <Calendar size={10} strokeWidth={1.8} />
              {new Date(deal.close_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      )}

      {/* Close-date urgency badge */}
      {(() => { const cs = closingSoon(deal); return cs ? (
        <div style={{ marginBottom: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: cs.color, background: `${cs.color}18`, border: `1px solid ${cs.color}35`, padding: "2px 8px", borderRadius: 6 }}>
            <Calendar size={9} strokeWidth={2} /> {cs.label}
          </span>
        </div>
      ) : null; })()}

      {/* Stuck deal indicator */}
      {!isTerminal && staleDays >= STUCK_DAYS && (
        <div style={{ marginBottom: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "#DC2626", background: "#FEE2E2", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(220,38,38,0.25)" }}>
            <AlertTriangle size={9} strokeWidth={2} /> Stuck {staleDays}d
          </span>
        </div>
      )}

      {/* Probability bar */}
      {s.probability > 0 && s.probability < 100 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: subMuted }}>Win probability</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: accentColor }}>{s.probability}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 99, background: trackBg, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${s.probability}%`, background: `linear-gradient(90deg, ${accentColor}80, ${accentColor})`, borderRadius: 99, transition: "width 0.5s", boxShadow: `0 0 6px ${accentColor}60` }} />
          </div>
        </div>
      )}

      {/* Remarks */}
      {extra.remarks && (
        <div style={{
          fontSize: 11.5, color: subMuted, lineHeight: 1.5,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: "100%", marginBottom: 8,
        }} title={extra.remarks}>{extra.remarks}</div>
      )}

      {/* Assignment badge */}
      {(() => {
        const isMine = currentUserId && deal.assigned_to === currentUserId;
        const isUnassigned = !deal.assigned_to;
        if (isMine) return (
          <div style={{ marginBottom: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "#EDE9FE", color: "#7C3AED", border: "1px solid rgba(124,58,237,0.25)" }}>Mine</span>
          </div>
        );
        if (isUnassigned) return (
          <div style={{ marginBottom: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "#FEE2E2", color: "#DC2626", border: "1px solid rgba(220,38,38,0.25)" }}>Unassigned</span>
          </div>
        );
        const name = deal.assigned_profile?.full_name;
        return (
          <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {name ? name.charAt(0) : "?"}
            </div>
            <span style={{ fontSize: 10.5, color: mutedColor }}>{name ? name.split(" ")[0] : "Assigned"}</span>
          </div>
        );
      })()}

      {/* Footer: health indicator + HQ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, paddingTop: 8, borderTop: `1px solid ${divider}` }}>
        {(extra.city || extra.headquarters) && (
          <span style={{ fontSize: 10.5, color: subMuted }}>📍 {extra.city || extra.headquarters}</span>
        )}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto",
          fontSize: 10.5, fontWeight: 600, color: health.color,
          padding: "2px 7px", borderRadius: 6,
          background: `${health.color}18`,
        }}>
          <Clock size={9} strokeWidth={2} />
          {health.days === 0 ? "Today" : `${health.days}d`}
          {health.label === "Stale" && <AlertTriangle size={9} strokeWidth={2} />}
        </span>
      </div>
    </div>
  );
}

// ─── Draggable + Droppable ────────────────────────────────────────────────────
function DraggableDeal({ deal, onEdit, onMarkWon, onMarkLost, onDelete, onOpen, onLock, onUnlock, onRevertLead, onRevertPipeline, canDelete, isSalesHead, canRevert, isFieldUser, didDrag, currentUserId }) {
  const canEditThis = isSalesHead || deal.assigned_to === currentUserId || deal.created_by === currentUserId;
  const dragDisabled = deal.is_locked ? !isSalesHead : !canEditThis;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id, data: { deal },
    disabled: dragDisabled,
  });
  const style = transform ? { transform: `translate(${transform.x}px,${transform.y}px)`, zIndex: isDragging ? 999 : "auto" } : {};
  const safeOpen = didDrag ? undefined : onOpen;
  const dragProps = dragDisabled ? {} : { ...listeners, ...attributes };
  return (
    <div ref={setNodeRef} style={style} {...dragProps}>
      <DealCard deal={deal} onEdit={onEdit} onMarkWon={onMarkWon} onMarkLost={onMarkLost} onDelete={onDelete} onOpen={safeOpen} onLock={onLock} onUnlock={onUnlock} onRevertLead={onRevertLead} onRevertPipeline={onRevertPipeline} isDragging={isDragging} canDelete={canDelete} isSalesHead={isSalesHead} canRevert={canRevert} isFieldUser={isFieldUser} currentUserId={currentUserId} />
    </div>
  );
}

function KanbanColumn({ status, deals, onEdit, onMarkWon, onMarkLost, onDelete, onAdd, onOpen, onLock, onUnlock, onRevertLead, onRevertPipeline, canDelete, isSalesHead, canRevert, isFieldUser, didDrag, currentUserId }) {
  const { formatCompact } = useCurrency();
  const fmtVal = (v) => { const n = Number(v); return n ? formatCompact(n) : null; };
  const { setNodeRef, isOver } = useDroppable({ id: status.key });
  const totalVal    = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const weightedVal = status.probability > 0 && status.probability < 100
    ? deals.reduce((s, d) => s + (Number(d.value) || 0) * status.probability / 100, 0)
    : 0;

  return (
    <div
      ref={setNodeRef}
      style={{
        width: 248, minWidth: 248, flexShrink: 0,
        border: isOver ? `1.5px solid ${status.color}` : "1.5px solid var(--border)",
        borderRadius: 14,
        display: "flex", flexDirection: "column",
        transition: "border-color 0.15s, background 0.15s",
        background: isOver ? status.dark : "var(--surface-2)",
        maxHeight: "calc(100vh - 160px)",
      }}
    >
      {/* Column header */}
      <div style={{
        padding: "12px 14px 10px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: status.color,
              boxShadow: `0 0 8px ${status.color}80`,
            }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{status.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
              background: status.bg, color: status.color,
            }}>{deals.length}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 1 }}>{status.probability}%</span>
          </div>
          {totalVal > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", paddingLeft: 14 }}>
              {fmtVal(totalVal)}
              {weightedVal > 0 && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · ~{fmtVal(weightedVal)}</span>}
            </span>
          )}
        </div>
        <button
          onClick={() => onAdd(status.key)}
          className="icon-action-btn"
          title="Add deal"
          style={{ color: status.color, opacity: 0.7 }}
        >
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* Cards */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "8px 8px 10px",
        display: "flex", flexDirection: "column", gap: 6,
        minHeight: 80,
      }}>
        {deals.map((d) => (
          <DraggableDeal key={d.id} deal={d} onEdit={onEdit} onMarkWon={onMarkWon} onMarkLost={onMarkLost} onDelete={onDelete} onOpen={onOpen} onLock={onLock} onUnlock={onUnlock} onRevertLead={onRevertLead} onRevertPipeline={onRevertPipeline} canDelete={canDelete} isSalesHead={isSalesHead} canRevert={canRevert} isFieldUser={isFieldUser} didDrag={didDrag} currentUserId={currentUserId} />
        ))}
        {deals.length === 0 && (
          <div style={{
            border: "2px dashed var(--border)", borderRadius: 10,
            padding: "20px 12px", textAlign: "center",
            color: "var(--text-muted)", fontSize: 12,
          }}>
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Won Deal → Customer Modal ─────────────────────────────────────────────────
const INDUSTRIES = ["Technology", "BFSI", "Healthcare", "Manufacturing", "Retail", "Education", "Real Estate", "Telecom", "Other"];

const DEAL_SOURCES = [
  { value: "website",        label: "Website" },
  { value: "linkedin",       label: "LinkedIn" },
  { value: "referral",       label: "Referral" },
  { value: "cold_call",      label: "Cold Call" },
  { value: "email_campaign", label: "Email Campaign" },
  { value: "event",          label: "Event / Conference" },
  { value: "partner",        label: "Partner Network" },
  { value: "social_media",   label: "Social Media" },
  { value: "ads",            label: "Ads" },
  { value: "walk_in",        label: "Walk-In" },
  { value: "other",          label: "Others" },
];

function WonToCustomerModal({ deal, onClose }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: {
      industry:    "",
      headquarters: "",
      turnover:    "",
      website:     "",
    },
  });

  const toJSON = (obj) => JSON.stringify(obj);

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      const contacts = [];
      if (deal.contact_name) {
        contacts.push({ id: Math.random().toString(36).slice(2), role: "Primary Contact", name: deal.contact_name, designation: "", email: "", phone: "", linkedin: "" });
      }
      const { error } = await supabase.from("customers").insert({
        company_name: deal.company_name || deal.title,
        industry:     data.industry || null,
        city:         data.headquarters || null,
        deal_id:      deal.id,
        created_by:   profile?.id,
        notes:        toJSON({
          turnover: data.turnover,
          website: data.website,
          contacts,
          deal_value: deal.value,
          source_deal: deal.title,
        }),
      });
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success(`${deal.company_name || deal.title} added to Customers!`);
      onClose();
    } catch (e) {
      toast.error("Failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 460 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Add to Customers</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>Won deal → Customer record</p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.08)", borderRadius: 9, border: "1px solid rgba(16,185,129,0.22)", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Trophy size={16} style={{ color: "#10B981", flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{deal.company_name || deal.title}</div>
              {deal.contact_name && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{deal.contact_name}</div>}
              {deal.value > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: "#10B981", marginTop: 2 }}>Deal Value: ₹{Number(deal.value).toLocaleString("en-IN")}</div>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="crm-label">Industry</label>
              <select className="crm-input" {...register("industry")}>
                <option value="">Select...</option>
                {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Headquarters</label>
              <input className="crm-input" {...register("headquarters")} placeholder="Mumbai, India" />
            </div>
            <div>
              <label className="crm-label">Annual Turnover</label>
              <input className="crm-input" {...register("turnover")} placeholder="₹500 Cr" />
            </div>
            <div>
              <label className="crm-label">Website</label>
              <input className="crm-input" {...register("website")} placeholder="https://..." />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
              style={{ background: "#10B981", borderColor: "#10B981" }}
            >
              {saving ? "Adding..." : "Add to Customers"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Revert Deal Modal ────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

function RevertDealModal({ deal, targetModule, onClose, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const isToLead     = targetModule === "lead";
  const label        = isToLead ? "Lead" : "Pipeline";
  const color        = isToLead ? "#6366F1" : "#10B981";
  const route        = isToLead ? "revert-to-lead" : "revert-to-pipeline";

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const token = await getAccessToken();
      const res   = await fetch(`${API_BASE}/api/deals/${deal.id}/${route}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to revert to ${label}`);
      }
      toast.success(`Deal moved back to ${label} module`);
      onSuccess();
    } catch (e) {
      toast.error(e.message || "Revert failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 440 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}14`, border: `1.5px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Undo2 size={16} style={{ color }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Revert to {label}</h2>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-muted)" }}>Move this deal back to the {label} module</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "12px 16px", background: `${color}08`, borderRadius: 10, border: `1px solid ${color}20` }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{deal.company_name || deal.title}</div>
            {deal.contact_name && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{deal.contact_name}</div>}
          </div>
          <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.07)", borderRadius: 8, border: "1px solid rgba(245,158,11,0.2)", fontSize: 12.5, color: "#92400E" }}>
            <strong>What happens:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Deal is removed from the Deals module</li>
              <li>Record moves back to {label} (same Lead ID preserved)</li>
              <li>All history, notes, and activities are retained</li>
              <li>This action is logged in the audit trail</li>
            </ul>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="button"
              disabled={saving}
              onClick={handleConfirm}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "none", background: color, color: "#fff", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
            >
              <Undo2 size={13} /> {saving ? "Reverting..." : `Move to ${label}`}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Column Filter Dropdown ───────────────────────────────────────────────────
function ColFilter({ label, value = [], options, onChange }) {
  const [open, setOpen]         = useState(false);
  const [colSearch, setColSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => { if (!open) setColSearch(""); }, [open]);

  if (!options?.length) return null;
  const isActive = value.length > 0;
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const filtered = colSearch
    ? options.filter((o) => o.label.toLowerCase().includes(colSearch.toLowerCase()))
        .sort((a, b) => {
          const s = colSearch.toLowerCase();
          return (a.label.toLowerCase().startsWith(s) ? 0 : 1) - (b.label.toLowerCase().startsWith(s) ? 0 : 1);
        })
    : options;

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 3 }}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{ background: isActive ? "rgba(99,102,241,0.18)" : "none", border: "none", cursor: "pointer", padding: "1px 4px", borderRadius: 4, color: isActive ? "#6366F1" : "var(--text-muted)", lineHeight: 1, display: "inline-flex", alignItems: "center", gap: 2 }}
        title={isActive ? `${value.length} filter${value.length > 1 ? "s" : ""} active` : `Filter by ${label}`}
      >
        <Filter size={9} strokeWidth={2.5} />
        {isActive && <span style={{ fontSize: 9, fontWeight: 800 }}>{value.length}</span>}
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 400, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.18)", minWidth: 210, maxHeight: 320, display: "flex", flexDirection: "column" }}
        >
          <div style={{ padding: "8px 10px 7px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{label}</span>
              {isActive && <button type="button" onClick={() => { onChange([]); setOpen(false); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 6px", borderRadius: 4, fontSize: 10, color: "#EF4444", fontFamily: "inherit", fontWeight: 700 }}>Clear all</button>}
            </div>
            <input type="text" autoFocus value={colSearch} onChange={(e) => setColSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`} onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", boxSizing: "border-box", padding: "5px 9px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, background: "var(--surface-2)", color: "var(--text)", fontFamily: "inherit", outline: "none" }}
            />
          </div>
          <div style={{ overflowY: "auto", padding: "4px 0", flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "14px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>No results</div>
            ) : filtered.map((opt) => {
              const checked = value.includes(opt.value);
              return (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", cursor: "pointer", fontSize: 12.5, color: checked ? "var(--accent)" : "var(--text-2)", fontWeight: checked ? 600 : 400, background: checked ? "rgba(99,102,241,0.06)" : "none" }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(opt.value)} style={{ accentColor: "var(--accent)", width: 13, height: 13, flexShrink: 0, cursor: "pointer" }} />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}

/* ─── Numeric range filter for column headers ──────────────────────────────── */
function ColRangeFilter({ min, max, onMinChange, onMaxChange }) {
  const [open, setOpen]       = useState(false);
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);
  const ref = useRef(null);

  useEffect(() => { setLocalMin(min); }, [min]);
  useEffect(() => { setLocalMax(max); }, [max]);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const isActive = min !== "" || max !== "";
  const handleApply = () => { onMinChange(localMin); onMaxChange(localMax); setOpen(false); };
  const handleClear = () => { setLocalMin(""); setLocalMax(""); onMinChange(""); onMaxChange(""); setOpen(false); };

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 3 }}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{ background: isActive ? "rgba(99,102,241,0.18)" : "none", border: "none", cursor: "pointer", padding: "1px 4px", borderRadius: 4, color: isActive ? "#6366F1" : "var(--text-muted)", lineHeight: 1, display: "inline-flex", alignItems: "center", gap: 2 }}
        title={isActive ? "Value range filter active" : "Filter by value range"}
      >
        <Filter size={9} strokeWidth={2.5} />
        {isActive && <span style={{ fontSize: 9, fontWeight: 800 }}>1</span>}
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 400, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.18)", minWidth: 190, padding: "12px" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Value Range</span>
            {isActive && <button type="button" onClick={handleClear} style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 6px", borderRadius: 4, fontSize: 10, color: "#EF4444", fontFamily: "inherit", fontWeight: 700 }}>Clear</button>}
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Min Value</label>
            <input autoFocus type="number" min="0" step="1" value={localMin} onChange={(e) => setLocalMin(e.target.value)}
              placeholder="0" className="crm-input" style={{ height: 32, fontSize: 12, width: "100%", boxSizing: "border-box" }}
              onKeyDown={(e) => ["e","E","+","-"].includes(e.key) && e.preventDefault()}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Max Value</label>
            <input type="number" min="0" step="1" value={localMax} onChange={(e) => setLocalMax(e.target.value)}
              placeholder="Any" className="crm-input" style={{ height: 32, fontSize: 12, width: "100%", boxSizing: "border-box" }}
              onKeyDown={(e) => ["e","E","+","-"].includes(e.key) && e.preventDefault()}
            />
          </div>
          <button type="button" onClick={handleApply} className="btn-primary" style={{ width: "100%", height: 32, fontSize: 12 }}>Apply</button>
        </div>
      )}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Deals() {
  const { profile, isFieldUser, isSalesHead, isManager } = useAuth();
  const { formatCompact, symbol } = useCurrency();
  const fmtVal = (v) => { const n = Number(v); return n ? formatCompact(n) : null; };
  const canDelete  = ["owner", "admin"].includes(profile?.role);
  const canAddDeal = ["owner", "admin"].includes(profile?.role);
  const isOwner    = profile?.role === "owner";
  const qc = useQueryClient();
  const [view, setView]             = useState(() => sessionStorage.getItem("dealsView") || "kanban");
  const [showViewPref, setShowViewPref] = useState(() => !sessionStorage.getItem("dealsView"));
  const [showForm, setShowForm]     = useState(false);
  const [editDeal, setEditDeal]     = useState(null);
  const [pendingDealSubStatus, setPendingDealSubStatus] = useState(null); // { dealId, newStatus, prevStatus }
  const [pendingDupCreate,     setPendingDupCreate]     = useState(null); // { payload, duplicates, type }
  const [defaultStage, setDefaultStage] = useState("new");
  const [search, setSearch]         = useState("");
  const [filterStage,    setFilterStage]    = useState([]);
  const [filterCountry,  setFilterCountry]  = useState([]);
  const [dealsSortBy,    setDealsSortBy]    = useState("created_at");
  const [dealsSortDir,   setDealsSortDir]   = useState("desc");
  const [filterIndustry, setFilterIndustry] = useState([]);
  const [filterSource,   setFilterSource]   = useState([]);
  const [filterAssigned, setFilterAssigned] = useState([]);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo,   setFilterDateTo]   = useState("");
  const [filterLeadId,   setFilterLeadId]   = useState("");
  const [filterValueMin, setFilterValueMin] = useState("");
  const [filterValueMax, setFilterValueMax] = useState("");
  const [filterService,  setFilterService]  = useState([]);
  const [infoLocked, setInfoLocked] = useState(() => localStorage.getItem("deals_info_locked") === "1");
  const [activeId, setActiveId]     = useState(null);
  const [activeDeal, setActiveDeal] = useState(null);
  const [didDrag, setDidDrag]       = useState(false);

  // Require 8px movement before drag activates — prevents click from triggering stage change
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,  { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const [lostDeal, setLostDeal]     = useState(null);
  const [wonCustomerDeal, setWonCustomerDeal] = useState(null);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [revertDeal, setRevertDeal] = useState(null); // { deal, targetModule: "lead"|"pipeline" }
  const [selectedDeals, setSelectedDeals] = useState(new Set());

  const canRevert = ["owner", "admin"].includes(profile?.role);
  const fileRef = useRef();

  // Always show view preference picker when Deals is opened

  const { hiddenSet, isVisible, toggleColumn, resetColumns, templates, saveTemplate, applyTemplate, deleteTemplate } = useTablePreferences("deals", DEAL_COLUMNS, profile?.id);

  const [searchParams, setSearchParams] = useSearchParams();
  const pendingSelectRef = useRef(searchParams.get("selected"));
  const [viewFilter, setViewFilter] = useState(() => {
    const f = searchParams.get("filter");
    return f === "unassigned" ? "unassigned" : "all";
  });

  useEffect(() => {
    const f = searchParams.get("filter");
    if (f === "unassigned") {
      setViewFilter("unassigned");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Non-admin roles default to "mine" and cannot access "all" or "unassigned"
  useEffect(() => {
    if (!profile?.role) return;
    const adminRoles = ["owner", "admin"];
    if (!adminRoles.includes(profile.role) && viewFilter !== "mine") {
      setViewFilter("mine");
    }
  }, [profile?.role]);

  const assignedToParam = viewFilter === "mine" ? profile?.id : viewFilter === "unassigned" ? "__unassigned__" : undefined;
  const { data: dealsData, isLoading, isError } = useQuery({
    queryKey: ["deals", search, viewFilter, profile?.id],
    queryFn: () => dealsService.getAll({ search, assignedTo: assignedToParam }),
    enabled: !!profile?.id,
    retry: 1,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members-basic"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, role").eq("status", "active").order("full_name");
      return data || [];
    },
    enabled: isManager,
  });

  const createMutation = useMutation({
    mutationFn: dealsService.create,
    onSuccess: (newDeal) => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Deal added");
      setShowForm(false);
      // Log creation event to history
      changeHistoryService.logCreation({
        entityType: "deal",
        entityId:   newDeal?.id,
        label:      "Deal Created",
        details:    newDeal?.company_name || newDeal?.title || "New Deal",
        userId:     profile?.id,
      }).catch(() => {});
      ActivityEngine.dealCreated({ userId: profile?.id, dealId: newDeal?.id, company: newDeal?.company_name || newDeal?.title });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => dealsService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deals"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); toast.success("Updated"); setEditDeal(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: dealsService.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["my-pending-activities"] });
      qc.invalidateQueries({ queryKey: ["my-completed-activities"] });
      qc.invalidateQueries({ queryKey: ["recent-activity"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const lockDealMutation = useMutation({
    mutationFn: (id) => dealsService.lockRecord(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["deals"] }); qc.invalidateQueries({ queryKey: ["deals-all"] }); qc.invalidateQueries({ queryKey: ["my-deals"] }); toast.success("Deal locked"); },
    onError:    (e) => toast.error(e.message),
  });

  const unlockDealMutation = useMutation({
    mutationFn: (id) => dealsService.unlockRecord(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["deals"] }); qc.invalidateQueries({ queryKey: ["deals-all"] }); qc.invalidateQueries({ queryKey: ["my-deals"] }); toast.success("Deal unlocked — editing is now enabled"); },
    onError:    (e) => toast.error(e.message),
  });

  const handleSave = async (data) => {
    // Auto-assign to creator if no assignee is explicitly selected
    const assigned_to = data.assigned_to || profile?.id;
    const payload = { ...data, created_by: profile?.id, assigned_to };
    if (editDeal) {
      const updated = await updateMutation.mutateAsync({ id: editDeal.id, ...payload });
      changeHistoryService.logDiff({
        entityType: "deal", entityId: editDeal.id,
        oldRecord: editDeal, newRecord: updated || payload,
        userId: profile?.id, trackedFields: DEAL_TRACKED_FIELDS,
      });
    } else {
      const finalPayload = { ...payload, stage: data.stage || defaultStage, is_locked: isFieldUser };
      // Strict exact duplicate check — blocks creation entirely
      const exactMatches = detectExactDuplicates(finalPayload, rawDeals, { notesKey: "notes", phoneKey: "contact" });
      if (exactMatches.length > 0) {
        setPendingDupCreate({ payload: finalPayload, duplicates: exactMatches, type: "exact" });
        return;
      }
      // Score-based partial/similar warning — allows proceed
      const { partial } = detectDuplicates(finalPayload, rawDeals, { notesKey: "notes", phoneKey: "contact" });
      if (partial.length > 0) {
        setPendingDupCreate({ payload: finalPayload, duplicates: partial, type: "partial" });
        return;
      }
      await createMutation.mutateAsync(finalPayload);
    }
  };

  const handleDupDealProceed = async () => {
    const { payload } = pendingDupCreate;
    setPendingDupCreate(null);
    await createMutation.mutateAsync(payload);
  };

  const handleDupDealViewExisting = (record) => {
    setPendingDupCreate(null);
    setShowForm(false);
    setEditDeal(null);
    setSelectedDeal(record);
  };

  const handleMarkWon = (deal) => {
    updateMutation.mutate({ id: deal.id, stage: "won", closed_at: new Date().toISOString() });
    toast.success("Deal marked as Won");
    ActivityEngine.dealWon({ userId: profile?.id, dealId: deal.id, company: deal.company_name || deal.title, value: deal.value });
  };

  const handleMarkLost = (deal) => {
    setLostDeal(deal);
  };

  const confirmLost = (reason) => {
    const extra = parseJSON(lostDeal.notes);
    updateMutation.mutate({
      id: lostDeal.id,
      stage: "lost",
      closed_at: new Date().toISOString(),
      notes: toJSON({ ...extra, lost_reason: reason }),
    });
    toast.success("Deal marked as Lost");
    ActivityEngine.dealLost({ userId: profile?.id, dealId: lostDeal.id, company: lostDeal.company_name || lostDeal.title, reason });
    setLostDeal(null);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Only CSV files are allowed."); e.target.value = ""; return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large. Maximum size is 5 MB."); e.target.value = ""; return; }
    const rows = parseCSVText(await file.text());
    let ok = 0, fail = 0;
    for (const row of rows) {
      if (!row["Company Name"]) continue;
      try { await createMutation.mutateAsync(csvToPayload(row, profile?.id)); ok++; }
      catch { fail++; }
    }
    toast.success(`Imported ${ok} deals${fail ? `, ${fail} failed` : ""}`);
    e.target.value = "";
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null); setActiveDeal(null);
    if (!over) return;
    const newStage = over.id;
    const deal = deals.find((d) => d.id === active.id);
    if (!deal || deal.stage === newStage || !FUNNEL_STATUSES.find((s) => s.key === newStage)) return;

    // Field users and managers cannot move deals backward in the pipeline
    if (!isSalesHead) {
      const currentIdx = FUNNEL_STATUSES.findIndex((s) => s.key === deal.stage);
      const newIdx     = FUNNEL_STATUSES.findIndex((s) => s.key === newStage);
      if (newIdx < currentIdx) {
        toast.error("Deals can only be moved forward in the pipeline.");
        return;
      }
    }

    if (newStage === "lost") { setLostDeal(deal); return; }

    // Sub-status stages require reason — show modal before committing
    if (["attempted_contact", "engaged"].includes(newStage)) {
      setPendingDealSubStatus({ dealId: deal.id, newStatus: newStage, prevStatus: deal.stage, deal });
      return;
    }

    const update = { id: active.id, stage: newStage };
    if (newStage === "won") update.closed_at = new Date().toISOString();
    updateMutation.mutate(update);
    toast.success(`Moved to ${FUNNEL_STATUSES.find(s=>s.key===newStage)?.label}`);
    if (newStage === "won") {
      ActivityEngine.dealWon({ userId: profile?.id, dealId: deal.id, company: deal.company_name || deal.title, value: deal.value });
    } else {
      ActivityEngine.dealStageChanged({ userId: profile?.id, dealId: deal.id, company: deal.company_name || deal.title, oldStage: deal.stage, newStage });
    }
  };

  const confirmDealSubStatus = (reason, remarks) => {
    if (!pendingDealSubStatus) return;
    const { dealId, newStatus, prevStatus, deal } = pendingDealSubStatus;
    const prevExtra = parseJSON(deal?.notes);
    updateMutation.mutate({
      id: dealId, stage: newStatus,
      notes: toJSON({ ...prevExtra, contact_sub_status: { reason, remarks: remarks || null, updated_at: new Date().toISOString() } }),
    });
    toast.success(`Moved to ${FUNNEL_STATUSES.find(s => s.key === newStatus)?.label}`);
    ActivityEngine.dealStageChanged({ userId: profile?.id, dealId, company: deal?.company_name || deal?.title, oldStage: prevStatus, newStage: newStatus });
    setPendingDealSubStatus(null);
  };

  const openAddForStage = (stageKey) => {
    setDefaultStage(stageKey);
    setEditDeal(null);
    setShowForm(true);
  };

  const setViewPersist = (v) => { setView(v); };
  const toggleInfoLock = async () => {
    const next = !infoLocked;
    setInfoLocked(next);
    localStorage.setItem("deals_info_locked", next ? "1" : "0");
    await supabase.from("crm_settings").upsert({ key: "deals_info_lock", value: next.toString(), updated_by: profile?.id, updated_at: new Date().toISOString() });
    await supabase.from("deals").update({ is_locked: next });
    qc.invalidateQueries({ queryKey: ["deals"] });
    qc.invalidateQueries({ queryKey: ["deals-all"] });
    qc.invalidateQueries({ queryKey: ["my-deals"] });
    toast.success(next ? "All deals locked" : "All deals unlocked");
  };
  const selectViewPref = (v) => {
    setView(v);
    sessionStorage.setItem("dealsView", v);
    setShowViewPref(false);
  };

  // ── Row Selection (admin-only) ──────────────────────────────────────────────
  const toggleSelectDeal = (id) => {
    setSelectedDeals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rawDeals = dealsData?.data || [];

  // Keep selectedDeal in sync when its data refreshes in the cache (mirrors Pipeline's pattern)
  const selectedDealId = selectedDeal?.id;
  useEffect(() => {
    if (!selectedDealId) return;
    const updated = rawDeals.find((d) => d.id === selectedDealId);
    if (updated) setSelectedDeal(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawDeals, selectedDealId]);

  // Auto-open detail panel when navigated from a task/notification link (/deals?selected=<id>)
  useEffect(() => {
    const targetId = pendingSelectRef.current;
    if (!targetId || !rawDeals.length) return;
    const match = rawDeals.find((d) => d.id === targetId);
    if (match) {
      setSelectedDeal(match);
      pendingSelectRef.current = null;
      setSearchParams({}, { replace: true });
    }
  }, [rawDeals, setSearchParams]);

  // Full country list for ColFilter — same source of truth as forms
  const countryOpts = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));

  // Front-end filtering (arrays for stage/country/industry/source/assigned, string for leadId/date)
  const deals = rawDeals.filter((d) => {
    const extra = parseJSON(d.notes);
    const rawCountry   = d.linked_lead?.country  || extra.country  || "";
    const dealCountry  = findCountry(rawCountry)?.code || rawCountry;
    const dealIndustry = d.linked_lead?.industry || extra.industry || "";
    const dealSource   = d.linked_lead?.source   || extra.source   || "";
    if (filterStage.length    && !filterStage.includes(d.stage)) return false;
    if (filterCountry.length  && !filterCountry.includes(dealCountry)) return false;
    if (filterIndustry.length && !filterIndustry.some((i) => dealIndustry.toLowerCase() === i.toLowerCase())) return false;
    if (filterSource.length   && !filterSource.includes(dealSource)) return false;
    if (filterAssigned.length && !filterAssigned.includes(d.assigned_to)) return false;
    if (filterDateFrom && new Date(d.created_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo   && new Date(d.created_at) > new Date(filterDateTo + "T23:59:59")) return false;
    if (filterLeadId) {
      const xtra = parseJSON(d.notes);
      const code = (xtra.lead_code || d.linked_lead?.lead_code || "").toLowerCase();
      const num  = filterLeadId.replace(/\D/g, "");
      if (!code.includes(filterLeadId.toLowerCase()) && !(num && code.includes(num))) return false;
    }
    if (filterValueMin !== "" && Number(d.value) < Number(filterValueMin)) return false;
    if (filterValueMax !== "" && Number(d.value) > Number(filterValueMax)) return false;
    if (filterService.length) {
      const svcs = parseJSON(d.notes).services || parseJSON(d.linked_lead?.other_notes).services || [];
      if (!filterService.some((f) => svcs.includes(f))) return false;
    }
    return true;
  }).sort((a, b) => {
    if (dealsSortBy === "lead_code") {
      const av = parseInt(((parseJSON(a.notes).lead_code || a.linked_lead?.lead_code || "")).replace(/\D/g, ""), 10) || 0;
      const bv = parseInt(((parseJSON(b.notes).lead_code || b.linked_lead?.lead_code || "")).replace(/\D/g, ""), 10) || 0;
      return dealsSortDir === "asc" ? av - bv : bv - av;
    }
    return dealsSortDir === "asc"
      ? new Date(a.created_at) - new Date(b.created_at)
      : new Date(b.created_at) - new Date(a.created_at);
  });

  // ── Pagination (table view only) ──────────────────────────────────────────
  const DEALS_PAGE_SIZE = 30;
  const [dealsPage, setDealsPage] = useState(1);
  useEffect(() => { setDealsPage(1); }, [filterStage, filterCountry, filterIndustry, filterSource, filterAssigned, filterDateFrom, filterDateTo, filterLeadId, filterValueMin, filterValueMax, filterService, dealsSortBy, dealsSortDir]);
  const dealsTotalPages = Math.ceil(deals.length / DEALS_PAGE_SIZE);
  const pagedDeals = deals.slice((dealsPage - 1) * DEALS_PAGE_SIZE, dealsPage * DEALS_PAGE_SIZE);

  const totalPipelineValue = deals
    .filter((d) => !["won", "lost"].includes(d.stage))
    .reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Page Header ── */}
      <div style={{ padding: "14px 24px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em" }}>Deals</h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.12)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.18)" }}>
              {rawDeals.length} total
            </span>
            {deals.length !== rawDeals.length && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(245,158,11,0.1)", color: "#D97706", border: "1px solid rgba(245,158,11,0.2)" }}>
                {deals.length} shown
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImport} />
            {(isOwner || isSalesHead) && (
              <button
                onClick={toggleInfoLock}
                title={infoLocked ? "Information Locked — click to unlock" : "Information Unlocked — click to lock"}
                className="btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: 6, height: 34, fontSize: 12.5, color: infoLocked ? "#EF4444" : "var(--text-2)", borderColor: infoLocked ? "rgba(239,68,68,0.35)" : undefined }}
              >
                {infoLocked ? <Lock size={13} style={{ color: "#EF4444" }} /> : <LockOpen size={13} style={{ color: "var(--text-muted)" }} />}
                {infoLocked ? "Information Locked" : "Information Unlocked"}
              </button>
            )}
            {(isOwner || isSalesHead) && (
              <button className="btn-secondary" onClick={downloadDealTemplate} style={{ display: "flex", alignItems: "center", gap: 5, height: 34, fontSize: 12.5 }} title="Download CSV template"><Download size={12} /> Template</button>
            )}
            {(isOwner || isSalesHead) && (
              <button className="btn-secondary" onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 5, height: 34, fontSize: 12.5 }}><Upload size={12} /> Import</button>
            )}
            {(isOwner || isSalesHead) && (
              <button className="btn-secondary" onClick={() => { exportCSV(deals); logExport(profile?.id, "deals", deals.length); }} disabled={!deals.length} style={{ display: "flex", alignItems: "center", gap: 5, height: 34, fontSize: 12.5 }}><Download size={12} /> Export</button>
            )}
            <div style={{ display: "flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 2, gap: 1 }}>
              {[{ v: "list", icon: LayoutList }, { v: "kanban", icon: Columns }].map(({ v, icon: Icon }) => (
                <button
                  key={v}
                  onClick={() => setViewPersist(v)}
                  style={{
                    background: view === v ? "var(--surface)" : "transparent",
                    border: view === v ? "1px solid var(--border)" : "1px solid transparent",
                    borderRadius: 6, padding: "5px 8px", cursor: "pointer",
                    color: view === v ? "var(--text)" : "var(--text-muted)",
                    boxShadow: view === v ? "var(--shadow-xs)" : "none",
                    transition: "all 0.14s",
                  }}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
            <ColumnToggle allColumns={DEAL_COLUMNS} hiddenSet={hiddenSet} onToggle={toggleColumn} onReset={resetColumns} />
            {!isFieldUser && (
              <TemplateMenu
                templates={templates}
                onSave={saveTemplate}
                onApply={(tpl) => {
                  applyTemplate(tpl);
                }}
                onDelete={deleteTemplate}
                currentFilters={{ }}
                canCreate={!isFieldUser}
              />
            )}
            {canAddDeal && (
              <button className="btn-primary" onClick={() => { setDefaultStage("new"); setEditDeal(null); setShowForm(true); }} style={{ display: "flex", alignItems: "center", height: 34, gap: 6, fontSize: 12.5, flexShrink: 0 }}>
                <Plus size={13} /> Add Deal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      {deals.length > 0 && <PipelineStatsBar deals={deals} />}

      {/* ── View Filter Tabs ── */}
      <div style={{ padding: "0 20px", display: "flex", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        {[
          { key: "mine", label: "My Deals" },
          ...(isOwner || isSalesHead ? [{ key: "all", label: "All Deals" }, { key: "unassigned", label: "Unassigned" }] : []),
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setViewFilter(tab.key)}
            style={{
              padding: "10px 18px", border: "none", borderBottom: viewFilter === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
              background: "transparent", color: viewFilter === tab.key ? "var(--accent)" : "var(--text-muted)",
              fontWeight: viewFilter === tab.key ? 700 : 500, fontSize: 12.5, cursor: "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", flexWrap: "wrap" }}>
        {/* Search company/contact */}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="crm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, contact..." style={{ paddingLeft: 30, height: 34, fontSize: 12.5 }} />
        </div>

        {/* Lead ID search */}
        <div style={{ position: "relative", flex: "0 0 160px" }}>
          <Search size={11} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: filterLeadId ? "var(--accent)" : "var(--text-muted)" }} />
          <input className="crm-input" value={filterLeadId} onChange={(e) => setFilterLeadId(e.target.value)} placeholder="Search ID" style={{ paddingLeft: 28, height: 34, fontSize: 12, fontFamily: "monospace", borderColor: filterLeadId ? "var(--accent)" : undefined }} />
        </div>

        {(filterStage.length || filterCountry.length || filterIndustry.length || filterSource.length || filterAssigned.length || filterLeadId || filterDateFrom || filterDateTo || filterValueMin !== "" || filterValueMax !== "" || filterService.length) && (
          <button className="btn-secondary" style={{ height: 34, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
            onClick={() => { setFilterStage([]); setFilterCountry([]); setFilterIndustry([]); setFilterSource([]); setFilterAssigned([]); setFilterLeadId(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterValueMin(""); setFilterValueMax(""); setFilterService([]); }}>
            <X size={12} /> Clear Filters
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Pagination — left of Date Filter */}
        <ToolbarPagination currentPage={dealsPage} totalPages={dealsTotalPages} onChange={setDealsPage} />

        {/* Date range filter — right-aligned */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>From:</span>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="crm-input" style={{ height: 34, fontSize: 12, width: 136, borderColor: filterDateFrom ? "var(--accent)" : undefined }} title="From date" />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>To:</span>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="crm-input" style={{ height: 34, fontSize: 12, width: 136, borderColor: filterDateTo ? "var(--accent)" : undefined }} title="To date" />
          {(filterDateFrom || filterDateTo) && (
            <button type="button" onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: "#EF4444", lineHeight: 1 }}><X size={12} /></button>
          )}
        </div>
      </div>

      {/* ── Active Filter Pills ── */}
      {(filterStage.length || filterIndustry.length || filterCountry.length || filterSource.length || filterAssigned.length || filterDateFrom || filterDateTo || filterValueMin !== "" || filterValueMax !== "" || filterService.length) && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "6px 20px 8px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
          {filterStage.map((key) => { const s = FUNNEL_STATUSES.find((x) => x.key === key); return <span key={key} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Stage: {s?.label || key}<button type="button" onClick={() => setFilterStage((p) => p.filter((k) => k !== key))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>; })}
          {filterIndustry.map((v) => <span key={v} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Industry: {v}<button type="button" onClick={() => setFilterIndustry((p) => p.filter((x) => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>)}
          {filterCountry.map((v) => { const cn = COUNTRIES.find((c) => c.code === v); return <span key={v} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Country: {cn?.name || v}<button type="button" onClick={() => setFilterCountry((p) => p.filter((x) => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>; })}
          {filterSource.map((v) => { const s = DEAL_SOURCES.find((x) => x.value === v); return <span key={v} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Source: {s?.label || v}<button type="button" onClick={() => setFilterSource((p) => p.filter((x) => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>; })}
          {filterAssigned.map((v) => { const m = teamMembers.find((x) => x.id === v); return <span key={v} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Assigned: {m?.full_name || "User"}<button type="button" onClick={() => setFilterAssigned((p) => p.filter((x) => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>; })}
          {filterService.map((v) => <span key={v} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(37,99,235,0.1)", color: "#3B82F6", border: "1px solid rgba(37,99,235,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Service: {v}<button type="button" onClick={() => setFilterService((p) => p.filter((x) => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#3B82F6", lineHeight: 1 }}><X size={9} /></button></span>)}
          {filterDateFrom && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>From: {filterDateFrom}<button type="button" onClick={() => setFilterDateFrom("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>}
          {filterDateTo && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>To: {filterDateTo}<button type="button" onClick={() => setFilterDateTo("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>}
          {filterValueMin !== "" && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Value ≥ {Number(filterValueMin).toLocaleString()}<button type="button" onClick={() => setFilterValueMin("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>}
          {filterValueMax !== "" && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Value ≤ {Number(filterValueMax).toLocaleString()}<button type="button" onClick={() => setFilterValueMax("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>}
        </div>
      )}

      {/* ── Selection Action Bar ── */}
      {(isOwner || isSalesHead) && selectedDeals.size > 0 && (
        <div style={{ padding: "8px 20px", background: "rgba(99,102,241,0.06)", borderBottom: "1px solid rgba(99,102,241,0.18)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#6366F1" }}>{selectedDeals.size} deal{selectedDeals.size > 1 ? "s" : ""} selected</span>
          {canDelete && (
            <button
              className="btn-secondary"
              style={{ height: 30, fontSize: 12, display: "flex", alignItems: "center", gap: 5, color: "#EF4444", borderColor: "rgba(239,68,68,0.3)" }}
              onClick={() => {
                if (window.confirm(`Delete ${selectedDeals.size} deal${selectedDeals.size > 1 ? "s" : ""}? This cannot be undone.`)) {
                  [...selectedDeals].forEach((id) => deleteMutation.mutate(id));
                  setSelectedDeals(new Set());
                }
              }}
            >
              <Trash2 size={11} /> Delete Selected
            </button>
          )}
          <button className="btn-secondary" style={{ height: 30, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }} onClick={() => setSelectedDeals(new Set())}>
            <X size={11} /> Clear
          </button>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ display: "flex", gap: 12, padding: 20 }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{ width: 248, height: 400, borderRadius: 14 }} />
            ))}
          </div>
        ) : isError ? (
          <div className="empty-state">
            <TrendingUp size={40} />
            <h3>Could not load deals</h3>
            <p>Check your connection and try refreshing the page</p>
          </div>
        ) : deals.length === 0 ? (
          <div className="empty-state">
            <TrendingUp size={40} />
            <h3>{search || filterStage.length || filterCountry.length || filterIndustry.length || filterSource.length || filterAssigned.length || filterLeadId || filterDateFrom || filterDateTo || filterValueMin !== "" || filterValueMax !== "" || filterService.length ? "No deals match your filters" : "No deals in the funnel"}</h3>
            <p>{search || filterStage.length || filterCountry.length || filterIndustry.length || filterSource.length || filterAssigned.length || filterLeadId || filterDateFrom || filterDateTo || filterValueMin !== "" || filterValueMax !== "" || filterService.length ? "Try adjusting your filters" : "Add your first deal to start tracking progress"}</p>
          </div>
        ) : view === "kanban" ? (
          /* ── KANBAN ── */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => { setActiveId(active.id); setActiveDeal(active.data.current?.deal); setDidDrag(true); }}
            onDragEnd={(e) => { handleDragEnd(e); setTimeout(() => setDidDrag(false), 50); }}
            onDragCancel={() => { setActiveId(null); setActiveDeal(null); setTimeout(() => setDidDrag(false), 50); }}
          >
            <div style={{ display: "flex", gap: 12, padding: "16px 20px", overflowX: "auto", height: "100%", alignItems: "flex-start" }}>
              {FUNNEL_STATUSES.map((status) => (
                <KanbanColumn
                  key={status.key}
                  status={status}
                  deals={deals.filter((d) => d.stage === status.key)}
                  onEdit={setEditDeal}
                  onMarkWon={handleMarkWon}
                  onMarkLost={handleMarkLost}
                  onDelete={(id) => { if (window.confirm("Delete this deal?")) deleteMutation.mutate(id); }}
                  onAdd={openAddForStage}
                  onOpen={setSelectedDeal}
                  onLock={(id) => lockDealMutation.mutate(id)}
                  onUnlock={(id) => unlockDealMutation.mutate(id)}
                  onRevertLead={(deal) => setRevertDeal({ deal, targetModule: "lead" })}
                  onRevertPipeline={(deal) => setRevertDeal({ deal, targetModule: "pipeline" })}
                  canDelete={canDelete}
                  isSalesHead={isSalesHead}
                  canRevert={canRevert}
                  isFieldUser={isFieldUser}
                  didDrag={didDrag}
                  currentUserId={profile?.id}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDeal && (
                <div style={{ transform: "rotate(1.5deg) scale(1.03)", opacity: 0.97, width: 248, boxShadow: "0 20px 50px rgba(0,0,0,0.22), 0 6px 16px rgba(0,0,0,0.12)", borderRadius: 12 }}>
                  <DealCard deal={activeDeal} onEdit={() => {}} onMarkWon={() => {}} onMarkLost={() => {}} onDelete={() => {}} currentUserId={profile?.id} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          /* ── TABLE ── */
          <div style={{ padding: "16px 20px", overflowY: "auto", height: "100%" }}>
            {isLoading ? (
              <SkeletonTable cols={9} rows={8} />
            ) : (
              <div className="card" style={{ overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table className="crm-table">
                    <thead>
                      <tr>
                        {(isOwner || isSalesHead) && (() => {
                          const allSelected = deals.length > 0 && deals.every((d) => selectedDeals.has(d.id));
                          const someSelected = !allSelected && deals.some((d) => selectedDeals.has(d.id));
                          return (
                            <th style={{ width: 36, padding: "8px 6px 8px 16px" }}>
                              <input type="checkbox" checked={allSelected}
                                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                                onChange={() => {
                                  if (allSelected) setSelectedDeals(new Set());
                                  else setSelectedDeals(new Set(deals.map((d) => d.id)));
                                }}
                                style={{ accentColor: "var(--accent)", width: 14, height: 14, cursor: "pointer" }}
                              />
                            </th>
                          );
                        })()}
                        <th style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                          onClick={() => { if (dealsSortBy === "lead_code") setDealsSortDir(d => d === "asc" ? "desc" : "asc"); else { setDealsSortBy("lead_code"); setDealsSortDir("asc"); } }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            ID
                            <span style={{ display: "inline-flex", flexDirection: "column", gap: 1, opacity: dealsSortBy === "lead_code" ? 1 : 0.3 }}>
                              <ArrowUp   size={8} strokeWidth={2.5} style={{ color: dealsSortBy === "lead_code" && dealsSortDir === "asc"  ? "var(--accent)" : "currentColor" }} />
                              <ArrowDown size={8} strokeWidth={2.5} style={{ color: dealsSortBy === "lead_code" && dealsSortDir === "desc" ? "var(--accent)" : "currentColor" }} />
                            </span>
                          </span>
                        </th>
                        {[
                          { key: "company",  label: "COMPANY",    required: true, filterKey: null },
                          { key: "industry", label: "INDUSTRY",   filterKey: "industry", filterOpts: INDUSTRIES.map((i) => ({ value: i, label: i })) },
                          { key: "country",  label: "COUNTRY",    filterKey: "country",  filterOpts: countryOpts },
                          { key: "contact",  label: "POC",        filterKey: null },
                          { key: "source",   label: "SOURCE",     filterKey: "source",   filterOpts: DEAL_SOURCES },
                          { key: "services", label: "SERVICES",   filterKey: "services", filterOpts: SAP_SERVICES.map((s) => ({ value: s, label: s })) },
                          { key: "website",  label: "WEBSITE",    filterKey: null },
                          { key: "linkedin", label: "LINKEDIN",   filterKey: null },
                          { key: "stage",    label: "STAGE",      required: true, filterKey: "stage", filterOpts: FUNNEL_STATUSES.map((s) => ({ value: s.key, label: s.label })) },
                          { key: "value",    label: "DEAL VALUE", filterKey: "value_range" },
                          { key: "assigned", label: "ASSIGNED",   filterKey: "assigned", filterOpts: (isOwner || isSalesHead) ? teamMembers.map((m) => ({ value: m.id, label: m.full_name })) : null },
                          { key: "created",  label: "DATE",       filterKey: null },
                        ].filter(({ key, required }) => required || isVisible(key)).map(({ key, label, filterKey, filterOpts }) => (
                          <th key={key}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                              {label}
                              {filterKey === "value_range" && (
                                <ColRangeFilter
                                  min={filterValueMin}
                                  max={filterValueMax}
                                  onMinChange={setFilterValueMin}
                                  onMaxChange={setFilterValueMax}
                                />
                              )}
                              {filterKey && filterKey !== "value_range" && filterOpts?.length > 0 && (
                                <ColFilter
                                  label={label}
                                  options={filterOpts}
                                  value={filterKey === "industry" ? filterIndustry : filterKey === "country" ? filterCountry : filterKey === "source" ? filterSource : filterKey === "stage" ? filterStage : filterKey === "assigned" ? filterAssigned : filterKey === "services" ? filterService : []}
                                  onChange={(v) => {
                                    if (filterKey === "industry") setFilterIndustry(v);
                                    else if (filterKey === "country") setFilterCountry(v);
                                    else if (filterKey === "source") setFilterSource(v);
                                    else if (filterKey === "stage") setFilterStage(v);
                                    else if (filterKey === "assigned") setFilterAssigned(v);
                                    else if (filterKey === "services") setFilterService(v);
                                  }}
                                />
                              )}
                            </span>
                          </th>
                        ))}
                        <th style={{ textAlign: "right" }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deals.length === 0 ? (
                        <tr><td colSpan={(isOwner || isSalesHead) ? 12 : 11} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                            <TrendingUp size={28} style={{ opacity: 0.25 }} />
                            <span style={{ fontWeight: 600, fontSize: 13.5 }}>No deals found</span>
                            <span style={{ fontSize: 12, opacity: 0.6 }}>Try adjusting your filters or add a new deal</span>
                          </div>
                        </td></tr>
                      ) : pagedDeals.map((d, rowIdx) => {
                        const extra        = parseJSON(d.notes);
                        const isMine       = d.assigned_to === profile?.id;
                        const isUnassigned = !d.assigned_to;
                        const dealCode      = (extra.lead_code || d.linked_lead?.lead_code || "").replace(/^LEAD-?/i, "") || "—";
                        const srcLabel      = extra.source   || d.linked_lead?.source   || "—";
                        const industryLabel = extra.industry || d.linked_lead?.industry || "—";
                        const countryLabel  = countryName(d.linked_lead?.country || extra.country) || "—";
                        const createdLabel  = d.created_at ? new Date(d.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—";
                        const isChecked    = selectedDeals.has(d.id);
                        return (
                          <tr key={d.id} onClick={() => setSelectedDeal(d)} style={{ cursor: "pointer", background: isChecked ? "rgba(99,102,241,0.04)" : isUnassigned ? "rgba(239,68,68,0.03)" : undefined }}>
                            {(isOwner || isSalesHead) && (
                              <td style={{ width: 36, padding: "8px 6px 8px 16px" }} onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" checked={isChecked} onChange={() => toggleSelectDeal(d.id)}
                                  style={{ accentColor: "var(--accent)", width: 14, height: 14, cursor: "pointer" }}
                                />
                              </td>
                            )}
                            <td style={{ whiteSpace: "nowrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", letterSpacing: "0.01em" }}>
                                {dealCode}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{d.company_name || d.title || "—"}</span>
                                {d.is_locked && <Lock size={10} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} title="Record locked" />}
                                {(!extra.email && !extra.contact) && (
                                  <span title="Missing contact detail — Email or Phone required" style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 5, background: "rgba(245,158,11,0.12)", color: "#D97706", border: "1px solid rgba(245,158,11,0.3)" }}>
                                    <AlertTriangle size={8} strokeWidth={2.5} /> Invalid
                                  </span>
                                )}
                              </div>
                              {extra.lost_reason && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>Lost: {extra.lost_reason}</div>}
                            </td>
                            {isVisible("industry") && (
                              <td>
                                {industryLabel !== "—" ? (
                                  <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{industryLabel}</span>
                                ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                              </td>
                            )}
                            {isVisible("country") && (
                              <td>
                                {countryLabel !== "—" ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>
                                    <img src={countryFlagUrl(findCountry(d.linked_lead?.country || extra.country)?.code || "")} alt={countryLabel} style={{ width: 22, height: 16, borderRadius: 2, objectFit: "cover", flexShrink: 0, display: "block" }} loading="lazy" />
                                    {countryLabel}
                                  </span>
                                ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                              </td>
                            )}
                            {isVisible("contact")  && (
                              <td>
                                <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500 }}>{d.contact_name || "—"}</div>
                                {!infoLocked && extra.contact && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{extra.contact}</div>}
                                {infoLocked && extra.contact && <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}><Lock size={9} /> Hidden</div>}
                              </td>
                            )}
                            {isVisible("source") && (
                              <td>{srcLabel !== "—" ? <SourceBadge source={srcLabel} plain /> : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}</td>
                            )}
                            {isVisible("services") && (() => {
                              const svcs = parseJSON(d.notes).services || parseJSON(d.linked_lead?.other_notes).services || [];
                              const customSvc = parseJSON(d.notes).custom_service || parseJSON(d.linked_lead?.other_notes).custom_service;
                              return (
                                <td>
                                  {(svcs.length > 0 || customSvc) ? (
                                    <div style={{ fontSize: 11, lineHeight: 1.7 }}>
                                      {[...svcs, ...(customSvc ? [customSvc] : [])].map((svc, i) => (
                                        <div key={svc} style={{ color: ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899","#84CC16"][i % 8] }}>{i + 1}. {svc}</div>
                                      ))}
                                    </div>
                                  ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                                </td>
                              );
                            })()}
                            {isVisible("website") && (
                              <td>
                                {extra.website ? (
                                  <a href={extra.website.startsWith("http") ? extra.website : `https://${extra.website}`} target="_blank" rel="noopener noreferrer" title={extra.website}
                                    onClick={(ev) => ev.stopPropagation()}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#3B82F6", textDecoration: "none" }}>
                                    <Globe size={11} strokeWidth={1.75} />
                                    <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{extra.website.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 18)}{extra.website.replace(/^https?:\/\//, "").length > 18 ? "…" : ""}</span>
                                  </a>
                                ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                              </td>
                            )}
                            {isVisible("linkedin") && (
                              <td>
                                {(extra.company_linkedin || extra.linkedin_url || d.linked_lead?.company_linkedin) ? (
                                  <a href={extra.company_linkedin || extra.linkedin_url || d.linked_lead?.company_linkedin} target="_blank" rel="noopener noreferrer"
                                    onClick={(ev) => ev.stopPropagation()}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#0A66C2", textDecoration: "none" }}>
                                    <ExternalLink size={10} strokeWidth={2} />
                                    <span>View</span>
                                  </a>
                                ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                              </td>
                            )}
                            <td><StatusBadge stage={d.stage} /></td>
                            {isVisible("value")    && (
                              <td>
                                {(isOwner || isSalesHead || isMine) ? (
                                  d.value ? <span style={{ fontSize: 12.5, fontWeight: 700, color: "#10B981" }}>{fmtVal(d.value)}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>
                                ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}><Lock size={9} /> Hidden</span>}
                              </td>
                            )}
                            {isVisible("assigned") && (
                              <td>
                                {isMine ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#16A34A", border: "1px solid rgba(34,197,94,0.22)" }}>Mine</span>
                                ) : !d.assigned_to ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "rgba(239,68,68,0.1)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.18)" }}>Unassigned</span>
                                ) : (
                                  <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{d.assigned_profile?.full_name ?? "Assigned"}</span>
                                )}
                              </td>
                            )}
                            {isVisible("created") && (
                              <td style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{createdLabel}</td>
                            )}
                            <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                                {d.is_locked && !isSalesHead ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)", padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                                    <Lock size={10} strokeWidth={2} /> Locked
                                  </span>
                                ) : (
                                  <>
                                    <motion.button className="btn-ghost" title="Edit" style={{ padding: "4px 8px" }} onClick={() => setEditDeal(d)} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><Pencil size={13} strokeWidth={1.75} /></motion.button>
                                    {d.stage !== "won"  && <motion.button className="btn-ghost" title="Mark Won" style={{ padding: "4px 8px", color: "#10B981" }} onClick={() => handleMarkWon(d)} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><CheckCircle2 size={13} strokeWidth={1.75} /></motion.button>}
                                    {d.stage === "won"  && <motion.button className="btn-ghost" title="Add to Customers" style={{ padding: "4px 7px", fontSize: 10.5, fontWeight: 700, color: "#10B981", display: "flex", alignItems: "center", gap: 3, background: "rgba(16,185,129,0.08)", borderRadius: 6, border: "1px solid rgba(16,185,129,0.2)" }} onClick={() => setWonCustomerDeal(d)} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}><Building2 size={11} /> Customer</motion.button>}
                                    {d.stage !== "lost" && isSalesHead && <motion.button className="btn-ghost" title="Mark Lost" style={{ padding: "4px 8px", color: "#EF4444" }} onClick={() => handleMarkLost(d)} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><XCircle size={13} strokeWidth={1.75} /></motion.button>}
                                    {canDelete && <motion.button className="btn-ghost" title="Delete" style={{ padding: "4px 8px", color: "var(--red)" }} onClick={() => { if (window.confirm("Delete?")) deleteMutation.mutate(d.id); }} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><Trash2 size={13} strokeWidth={1.75} /></motion.button>}
                                    {canRevert && d.lead_id && (
                                      <div style={{ display: "flex", gap: 2 }}>
                                        <motion.button className="btn-ghost" title="Revert to Lead" style={{ padding: "3px 7px", fontSize: 10, fontWeight: 700, color: "#6366F1", display: "flex", alignItems: "center", gap: 3, background: "rgba(99,102,241,0.08)", borderRadius: 6, border: "1px solid rgba(99,102,241,0.2)" }} onClick={() => setRevertDeal({ deal: d, targetModule: "lead" })} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}>
                                          <Undo2 size={10} /> Lead
                                        </motion.button>
                                        <motion.button className="btn-ghost" title="Revert to Pipeline" style={{ padding: "3px 7px", fontSize: 10, fontWeight: 700, color: "#10B981", display: "flex", alignItems: "center", gap: 3, background: "rgba(16,185,129,0.08)", borderRadius: 6, border: "1px solid rgba(16,185,129,0.2)" }} onClick={() => setRevertDeal({ deal: d, targetModule: "pipeline" })} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}>
                                          <Undo2 size={10} /> Pipeline
                                        </motion.button>
                                      </div>
                                    )}
                                  </>
                                )}
                                {(isOwner || isSalesHead) && (
                                  <motion.button className="btn-ghost" title={d.is_locked ? "Unlock deal" : "Lock deal"} style={{ padding: "4px 8px", color: d.is_locked ? "#10B981" : "var(--text-muted)" }}
                                    onClick={() => d.is_locked ? unlockDealMutation.mutate(d.id) : lockDealMutation.mutate(d.id)}
                                    whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}>
                                    {d.is_locked ? <LockOpen size={13} strokeWidth={1.75} /> : <Lock size={13} strokeWidth={1.75} />}
                                  </motion.button>
                                )}
                              </div>
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
      </div>

      {/* ── View Preference Modal ── */}
      <AnimatePresence>
        {showViewPref && <ViewPreferenceModal onSelect={selectViewPref} />}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {(showForm || editDeal) && (
          <DealModal
            deal={editDeal ? editDeal : { stage: defaultStage }}
            onClose={() => { setShowForm(false); setEditDeal(null); }}
            onSave={handleSave}
            teamMembers={teamMembers}
            canReassign={isManager}
          />
        )}
        {lostDeal && (
          <LostReasonModal
            deal={lostDeal}
            onClose={() => setLostDeal(null)}
            onConfirm={confirmLost}
          />
        )}
        {wonCustomerDeal && (
          <WonToCustomerModal
            deal={wonCustomerDeal}
            onClose={() => setWonCustomerDeal(null)}
          />
        )}
        {revertDeal && (
          <RevertDealModal
            deal={revertDeal.deal}
            targetModule={revertDeal.targetModule}
            onClose={() => setRevertDeal(null)}
            onSuccess={() => {
              setRevertDeal(null);
              qc.invalidateQueries({ queryKey: ["deals"] });
              qc.invalidateQueries({ queryKey: ["leads"] });
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Deal Detail Panel ── */}
      {selectedDeal && (
        <DealDetailPanel
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onEdit={(d) => { setSelectedDeal(null); setEditDeal(d); }}
        />
      )}

      {pendingDealSubStatus && (
        <ContactSubStatusModal
          status={pendingDealSubStatus.newStatus}
          onConfirm={confirmDealSubStatus}
          onCancel={() => setPendingDealSubStatus(null)}
        />
      )}
      {pendingDupCreate && (
        <DuplicateCheckModal
          type={pendingDupCreate.type}
          duplicates={pendingDupCreate.duplicates}
          entityType="deal"
          teamMembers={teamMembers}
          onCancel={() => setPendingDupCreate(null)}
          onProceed={handleDupDealProceed}
          onViewExisting={handleDupDealViewExisting}
          crossRole={false}
        />
      )}
    </div>
  );
}
