import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { COUNTRIES, countryFlag, countryFlagUrl } from "../constants/countries";
import { ACTIVITY_TYPES } from "../constants/activityTypes";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { leadsService } from "../services/leadsService";
import { logExport } from "../services/auditService";
import { useCurrency } from "../context/CurrencyContext";
import { teamService } from "../services/teamService";
import { db as supabase } from "../lib/db";
import LeadDetailPanel from "../components/LeadDetailPanel";
import { changeHistoryService, LEAD_TRACKED_FIELDS } from "../services/changeHistoryService";
import { ActivityEngine } from "../services/activityEngine";
import { ContactSubStatusModal, ContactSubStatusInline } from "../components/ContactSubStatusModal";
import { DuplicateCheckModal } from "../components/DuplicateCheckModal";
import { detectDuplicates, detectDuplicatesFlat, detectExactDuplicates, detectExactDuplicatesFlat } from "../utils/duplicateCheck";
import SkeletonTable from "../components/SkeletonTable";
import { ColumnToggle, TemplateMenu } from "../components/TableControls";
import { useTablePreferences } from "../hooks/useTablePreferences";
import toast from "react-hot-toast";
import { SOURCE_LABELS, LEAD_SOURCES, SourceBadge } from "../components/SourceBadge";

const LEAD_COLUMNS = [
  { key: "id",       label: "ID"          },
  { key: "company",  label: "Company",    required: true },
  { key: "industry", label: "Industry"    },
  { key: "country",  label: "Country"     },
  { key: "poc",      label: "POC"         },
  { key: "source",   label: "Source"      },
  { key: "services", label: "Services"    },
  { key: "website",  label: "Website"     },
  { key: "linkedin", label: "LinkedIn"    },
  { key: "temp",     label: "Lead Status" },
  { key: "status",   label: "Stage"       },
  { key: "date",     label: "Date Added"  },
  { key: "assigned", label: "Assigned"    },
];
import {
  Plus, Search, Pencil, Trash2, X, Users, Download, Upload, Lock, LockOpen,
  Flame, Thermometer, Snowflake, Globe, ArrowRightLeft, ArrowRight, AlertTriangle, Star,
  UserCheck, CheckSquare, Square, ChevronDown, ExternalLink,
  ArrowUpDown, Brain, UserPlus, Filter, CheckCircle2,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };
const toJSON    = (obj) => JSON.stringify(obj);
const leadNanoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmt = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};

// ─── Lead Scoring (0-100) ────────────────────────────────────────────────────
function leadScore(lead) {
  let score = 0;
  // Stage / temperature (max 40)
  const stageMap = { won: 40, converted: 38, proposal: 28, qualified: 22, contacted: 15, new: 8, lost: 0 };
  score += stageMap[lead.stage] ?? 5;

  // Source (max 20)
  const sourceMap = { referral: 20, linkedin: 15, event: 12, exhibition: 12, website: 10, social_media: 7, partner: 6, ads: 5, cold_call: 5, email_campaign: 4, walk_in: 4, other: 3, social: 7, call: 5, email: 4 };
  score += sourceMap[lead.source] ?? 0;

  // Recency (max 15)
  const days = lead.created_at
    ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
    : 999;
  if (days < 7)       score += 15;
  else if (days < 30) score += 10;
  else if (days < 90) score += 5;

  return Math.min(100, score);
}

function scoreColor(s) {
  if (s >= 70) return { color: "#10B981", bg: "#D1FAE5" };
  if (s >= 40) return { color: "#F59E0B", bg: "#FEF3C7" };
  return             { color: "#EF4444", bg: "#FEE2E2" };
}

// ─── Countries (dial code + phone length) ────────────────────────────────────

// ─── Role display labels for assignment dropdowns ─────────────────────────────
const ROLE_DISPLAY = {
  owner:         "Super Admin",
  sales_head:    "Sales Head",
  sales_manager: "Sales Manager",
  inside_sales:  "Inside Sales Employee",
  employee:      "Sales Employee",
};
const ROLE_ORDER = ["owner", "admin", "sales_manager", "sales_rep", "sales_rep"];

function normalizeLinkedInUrl(raw) {
  if (!raw || !raw.trim()) return "";
  const v = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.)?linkedin\.com/i.test(v)) return `https://${v}`;
  return `https://linkedin.com/in/${v.replace(/^@/, "").replace(/^\//, "")}`;
}

// Groups an array of team member objects by role, returning [{role, label, members}]
function groupByRole(members) {
  const map = {};
  for (const m of members) {
    const role = m.role || "sales_rep";
    if (!map[role]) map[role] = [];
    map[role].push(m);
  }
  return ROLE_ORDER
    .filter((r) => map[r]?.length)
    .map((r) => ({ role: r, label: ROLE_DISPLAY[r] || r, members: map[r] }));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Technology", "BFSI", "Healthcare", "Manufacturing", "Retail",
  "Education", "Real Estate", "Telecom", "Energy", "Logistics", "Other",
];

const SAP_SERVICES = [
  "SAP Implementation",
  "SAP Migration ECC→S/4HANA",
  "SAP Version Upgrade",
  "SAP Resource Augmentation",
  "Other Project Services",
];

const TEMPERATURES = [
  { key: "hot",  label: "Hot",  icon: Flame,       color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  { key: "warm", label: "Warm", icon: Thermometer,  color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  { key: "cold", label: "Cold", icon: Snowflake,    color: "#3B82F6", bg: "rgba(59,130,246,0.1)"  },
];

const LEAD_STATUSES = [
  { key: "new",               label: "New",               color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
  { key: "attempted_contact", label: "Attempted Contact", color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  hasSubStatus: true },
  { key: "engaged",           label: "Engaged",           color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  hasSubStatus: true },
  { key: "contacted",         label: "Contacted",         color: "#6366F1", bg: "rgba(99,102,241,0.12)"  },
  { key: "qualified",         label: "Qualified",         color: "#8B5CF6", bg: "rgba(139,92,246,0.12)"  },
  { key: "proposal",          label: "Proposal",          color: "#F97316", bg: "rgba(249,115,22,0.12)"  },
  { key: "converted",         label: "Converted",         color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  { key: "won",               label: "Won",               color: "#22C55E", bg: "rgba(34,197,94,0.12)"   },
  { key: "lost",              label: "Lost",              color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
];

const MEETING_STATUSES = ["—", "Scheduled", "Completed", "Cancelled", "Rescheduled"];


// ─── Notification helpers ─────────────────────────────────────────────────────
async function notifyManagers(editorId, editorName, leadName, leadId, title = "Lead Updated", message = null) {
  try {
    const { data: managers } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["owner", "admin", "sales_manager"])
      .neq("id", editorId);
    if (!managers?.length) return;
    await supabase.from("notifications").insert(
      managers.map((m) => ({
        user_id:     m.id,
        title,
        message:     message || `${editorName} ${title.toLowerCase()} "${leadName}"`,
        type:        "general",
        entity_id:   leadId,
        entity_type: "lead",
        link:        leadId ? `/leads?selected=${leadId}` : null,
        read:        false,
      }))
    );
  } catch { /* non-critical */ }
}

async function notifyUser(userId, title, message, entityId) {
  try {
    await supabase.from("notifications").insert({
      user_id:     userId,
      title,
      message,
      type:        "general",
      entity_id:   entityId,
      entity_type: "lead",
      link:        entityId ? `/leads?selected=${entityId}` : null,
      read:        false,
    });
  } catch { /* non-critical */ }
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

// ─── CSV helpers ──────────────────────────────────────────────────────────────
const LEADS_CSV_HEADERS = [
  "Company", "Contact Name", "Designation", "Email", "Phone", "Country",
  "Source", "Lead Status", "LinkedIn URL",
  "Connect Request", "Connection Accept", "First Comm Date",
  "Meeting Date", "Stage", "Meeting Status", "Remarks",
];

function csvEsc(v) { return `"${(v || "").toString().replace(/"/g, '""')}"`; }

function exportLeadsCSV(rows) {
  const lines = [LEADS_CSV_HEADERS.map(csvEsc).join(",")];
  rows.forEach((l) => {
    const x = parseJSON(l.other_notes);
    const countryObj = COUNTRIES.find((c) => c.code === (x.country || ""));
    lines.push([
      l.company_name, l.contact_name, l.designation,
      x.email, x.phone, countryObj ? countryObj.name : (x.country || ""),
      l.source || x.source, l.temperature,
      x.linkedin_url,
      x.linkedin_connect_request, x.linkedin_connection_accept,
      x.first_comm_date, l.follow_up_date, l.stage,
      x.meeting_status, l.remarks,
    ].map(csvEsc).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "leads.csv" });
  a.click(); URL.revokeObjectURL(a.href);
}

// Converts DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD → YYYY-MM-DD for Postgres
function parseCsvDate(val) {
  if (!val || !String(val).trim()) return null;
  const v = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // already ISO
  const m = v.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const dt = new Date(v);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
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
  return lines.slice(1).map((l) => {
    const v = parseLine(l);
    return Object.fromEntries(headers.map((h, i) => [h, v[i] || ""]));
  });
}

const CSV_STAGE_MAP = {
  new: "new", contacted: "contacted", qualified: "qualified",
  proposal: "proposal", converted: "converted", won: "won", lost: "lost",
  New: "new", Contacted: "contacted", Qualified: "qualified",
  Proposal: "proposal", Converted: "converted", Won: "won", Lost: "lost",
};
const CSV_TEMP_MAP = { hot: "hot", warm: "warm", cold: "cold", Hot: "hot", Warm: "warm", Cold: "cold" };
const CSV_SOURCE_MAP = Object.fromEntries(
  Object.entries(SOURCE_LABELS).map(([k, v]) => [v.toLowerCase(), k])
);

function csvLeadToPayload(row, userId) {
  const rawSource = (row["Source"] || "").trim();
  const source = LEAD_SOURCES.find((s) => s.key === rawSource)?.key
    || CSV_SOURCE_MAP[rawSource.toLowerCase()]
    || null;
  const temperature = CSV_TEMP_MAP[row["Lead Status"]?.trim()] || null;
  const stage = CSV_STAGE_MAP[row["Stage"]?.trim()] || "new";

  return {
    company_name:   row["Company"],
    contact_name:   row["Contact Name"],
    designation:    row["Designation"],
    stage,
    source,
    temperature,
    remarks:        row["Remarks"],
    follow_up_date: parseCsvDate(row["Meeting Date"]),
    other_notes: JSON.stringify({
      email:                      row["Email"],
      phone:                      row["Phone"],
      country: (() => {
        const raw = (row["Country"] || "").trim();
        if (!raw) return "";
        const byCode = COUNTRIES.find((c) => c.code.toLowerCase() === raw.toLowerCase());
        if (byCode) return byCode.code;
        const byName = COUNTRIES.find((c) => c.name.toLowerCase() === raw.toLowerCase());
        return byName ? byName.code : raw;
      })(),
      linkedin_url:               row["LinkedIn URL"],
      linkedin_connect_request:   parseCsvDate(row["Connect Request"]) || row["Connect Request"],
      linkedin_connection_accept: parseCsvDate(row["Connection Accept"]) || row["Connection Accept"],
      first_comm_date:            parseCsvDate(row["First Comm Date"]) || row["First Comm Date"],
      meeting_status:             row["Meeting Status"],
    }),
    created_by: userId,
  };
}

function downloadLeadTemplate() {
  const headers = [
    "Company", "Contact Name", "Designation", "Email", "Phone", "Country",
    "Source", "Lead Status", "LinkedIn URL",
    "Connect Request", "Connection Accept", "First Comm Date",
    "Meeting Date", "Stage", "Meeting Status", "Remarks",
  ];
  const sample = [
    "Acme Corp", "John Doe", "CTO", "john@acme.com", "9876543210", "India",
    "LinkedIn", "Hot", "https://linkedin.com/in/johndoe",
    "2026-01-15", "2026-01-20", "2026-01-22",
    "2026-05-20", "New", "Scheduled", "Interested in SAP implementation",
  ];
  const note = [
    "// Sources: Website LinkedIn Referral Cold Call Email Campaign Event Partner Network Social Media Ads Walk-In Others",
    "// Lead Status (temperature): Hot Warm Cold",
    "// Stage: New Contacted Qualified Proposal Converted Won Lost",
    "// Meeting Status: Scheduled Completed Cancelled Rescheduled",
    "// Country: India United States United Kingdom UAE Singapore Australia etc.",
    "// Dates: YYYY-MM-DD (2026-05-20) or DD-MM-YYYY (20-05-2026) — both formats accepted",
    "// Delete these comment rows before importing",
  ];
  const lines = [
    headers.map(csvEsc).join(","),
    sample.map(csvEsc).join(","),
    ...note.map((n) => csvEsc(n) + "," .repeat(headers.length - 1)),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "lead-import-template.csv" });
  a.click(); URL.revokeObjectURL(a.href);
}

// ─── Bulk Import Validation ───────────────────────────────────────────────────
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[\d\s+\-().]{6,20}$/;

function validateLeadRow(row) {
  const errs = [];
  if (!row["Company"]?.trim() && !row["Contact Name"]?.trim()) errs.push("Company or Contact Name required");
  if (row["Phone"]?.trim()  && !phoneRe.test(row["Phone"].trim()))  errs.push("Invalid phone");
  if (row["Email"]?.trim()  && !emailRe.test(row["Email"].trim()))  errs.push("Invalid email");
  return errs;
}

// ─── Bulk Import Modal ────────────────────────────────────────────────────────
function BulkImportLeadsModal({ onClose, onImport, loading, isAdminUser, teamMembers = [] }) {
  const [preview,    setPreview]    = useState(null);
  const [error,      setError]      = useState("");
  const [assignToId, setAssignToId] = useState("");

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Only CSV files are allowed."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("File too large. Maximum size is 5 MB."); return; }
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSVText(ev.target.result).filter((r) => r["Company"] || r["Contact Name"]);
      if (!rows.length) { setError("No valid rows found. Ensure the 'Company' column is present."); return; }
      setPreview(rows);
    };
    reader.readAsText(file);
  };

  const assignedMember = teamMembers.find((m) => m.id === assignToId);
  const errCount = preview ? preview.filter((r) => validateLeadRow(r).length > 0).length : 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 16, width: 820, maxWidth: "95vw", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.28)" }}>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Bulk Import Leads</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Upload a CSV file — review rows before importing</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}><X size={18} /></button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>

          {/* Assignment section */}
          {isAdminUser ? (
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: "1.5px solid var(--border)", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Users size={11} strokeWidth={2} /> Assign All Imported Leads To
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select value={assignToId} onChange={(e) => setAssignToId(e.target.value)}
                  className="crm-input"
                  style={{ height: 38, fontSize: 13, flex: "1 1 260px", maxWidth: 340 }}>
                  <option value="">— Leave Unassigned —</option>
                  {teamMembers.filter((m) => m.id).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}{m.role ? ` (${ROLE_DISPLAY[m.role] || m.role})` : ""}
                    </option>
                  ))}
                </select>
                {assignedMember ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.22)" }}>
                    <CheckCircle2 size={12} strokeWidth={2.5} />
                    All {preview?.length ? `${preview.length} ` : ""}leads → {assignedMember.full_name}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>No assignee — leads will be unassigned</span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)", marginBottom: 16, fontSize: 12.5, color: "#3B82F6", fontWeight: 600 }}>
              <Users size={13} strokeWidth={2} />
              All imported leads will be automatically assigned to you
            </div>
          )}

          {/* File picker + template */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <Upload size={14} /> Choose CSV
              <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
            </label>
            <button onClick={downloadLeadTemplate} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit" }}>
              <Download size={13} /> Download Template
            </button>
          </div>

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", color: "#EF4444", fontSize: 13, marginBottom: 14 }}>{error}</div>
          )}

          {/* Preview table */}
          {preview && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{preview.length} row{preview.length !== 1 ? "s" : ""} ready to import</span>
                {errCount > 0 && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                    {errCount} validation warning{errCount !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(59,130,246,0.1)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.2)" }}>
                  Lead IDs auto-assigned
                </span>
                {isAdminUser && assignedMember && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.22)" }}>
                    Assigned → {assignedMember.full_name}
                  </span>
                )}
              </div>
              <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      {["Lead ID", "Company", "Contact", "Stage", "Email", "Phone", "Country", "Status"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((row, idx) => {
                      const errs = validateLeadRow(row);
                      const stageVal = CSV_STAGE_MAP[row["Stage"]?.trim()] || "new";
                      const countryRaw = (row["Country"] || "").trim();
                      const countryMatch = COUNTRIES.find((c) => c.code.toLowerCase() === countryRaw.toLowerCase() || c.name.toLowerCase() === countryRaw.toLowerCase());
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: errs.length ? "rgba(239,68,68,0.03)" : undefined }}>
                          <td style={{ padding: "7px 12px" }}>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: "#3B82F6", fontFamily: "monospace", background: "rgba(59,130,246,0.08)", padding: "2px 6px", borderRadius: 4 }}>auto</span>
                          </td>
                          <td style={{ padding: "7px 12px", color: "var(--text)", fontWeight: 600 }}>{row["Company"] || "—"}</td>
                          <td style={{ padding: "7px 12px", color: "var(--text-2)" }}>{row["Contact Name"] || "—"}</td>
                          <td style={{ padding: "7px 12px", color: "var(--text-2)", textTransform: "capitalize" }}>{stageVal.replace(/_/g, " ")}</td>
                          <td style={{ padding: "7px 12px" }}>
                            {row["Email"] ? (
                              <span style={{ color: emailRe.test(row["Email"].trim()) ? "var(--text-2)" : "#EF4444", fontWeight: emailRe.test(row["Email"].trim()) ? 400 : 600 }}>
                                {row["Email"]}{!emailRe.test(row["Email"].trim()) && <span style={{ fontSize: 10, marginLeft: 4 }}>✕</span>}
                              </span>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "7px 12px" }}>
                            {row["Phone"] ? (
                              <span style={{ color: phoneRe.test(row["Phone"].trim()) ? "var(--text-2)" : "#EF4444", fontWeight: phoneRe.test(row["Phone"].trim()) ? 400 : 600 }}>
                                {row["Phone"]}{!phoneRe.test(row["Phone"].trim()) && <span style={{ fontSize: 10, marginLeft: 4 }}>✕</span>}
                              </span>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "7px 12px", color: "var(--text-2)" }}>{countryMatch ? countryMatch.name : (countryRaw || "—")}</td>
                          <td style={{ padding: "7px 12px" }}>
                            {errs.length ? (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.1)", padding: "2px 7px", borderRadius: 99, border: "1px solid rgba(239,68,68,0.2)" }}>
                                {errs.join(" · ")}
                              </span>
                            ) : (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", padding: "2px 7px", borderRadius: 99, border: "1px solid rgba(16,185,129,0.2)" }}>
                                Valid
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {preview.length > 50 && (
                      <tr><td colSpan={8} style={{ padding: "7px 12px", color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>…and {preview.length - 50} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button
            disabled={!preview || loading}
            onClick={() => onImport(preview, assignToId)}
            style={{ padding: "8px 20px", borderRadius: 9, background: preview ? "var(--accent)" : "var(--surface-2)", color: preview ? "#fff" : "var(--text-muted)", border: "none", fontSize: 13, fontWeight: 700, cursor: preview ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {loading ? "Importing…" : `Import ${preview?.length || 0} Lead${(preview?.length || 0) !== 1 ? "s" : ""}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Lead Modal ───────────────────────────────────────────────────────────────
export function LeadModal({ lead, onClose, onSave, teamMembers, canEditContactInfo = true }) {
  const { profile } = useAuth();
  const extra = parseJSON(lead?.other_notes);
  const [selectedTemp, setSelectedTemp] = useState(lead?.temperature || extra.temperature || "");
  const [selectedCountry, setSelectedCountry] = useState(extra.country || "IN");
  const [selectedServices, setSelectedServices] = useState(extra.services || []);
  const [customService, setCustomService] = useState(extra.custom_service || "");
  const [svcOpen, setSvcOpen] = useState(false);
  const [connectedBy, setConnectedBy] = useState(lead?.created_by || "");
  const [supervisorId, setSupervisorId] = useState(extra.supervisor_id || "");
  const isOwner = ["owner", "admin"].includes(profile?.role);

  // Activity fields (only used when creating a new lead)
  const [activityType,    setActivityType]    = useState("follow_up_call");
  const [activityRemarks, setActivityRemarks] = useState("");
  const [activityDate,    setActivityDate]    = useState("");

  // Multi-contact persons with POC selection
  const [persons, setPersons] = useState(() => {
    const existing = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
    if (existing.length > 0) return existing;
    // Backwards compat: seed from legacy single-contact fields
    return [{
      id: leadNanoId(),
      name: lead?.contact_name || "",
      designation: lead?.designation || "",
      email: extra.email || "",
      phone: extra.phone || "",
      is_primary: true,
    }];
  });
  const [pocId, setPocId] = useState(() => {
    const existing = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
    const poc = existing.find((p) => p.is_primary);
    return poc?.id || existing[0]?.id || persons[0]?.id || "";
  });

  const addPerson = () => {
    const id = leadNanoId();
    setPersons((prev) => [...prev, { id, name: "", designation: "", email: "", phone: "", is_primary: false }]);
  };
  const removePerson = (id) => {
    setPersons((prev) => prev.filter((p) => p.id !== id));
    if (pocId === id) setPocId((prev) => persons.find((p) => p.id !== id)?.id || "");
  };
  const updatePerson = (id, field, val) => setPersons((prev) => prev.map((p) => p.id === id ? { ...p, [field]: val } : p));

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      company_name:      lead?.company_name || "",
      industry:          extra.industry || "",
      state:             extra.state || "",
      city:              extra.city || "",
      website:           extra.website || "",
      company_linkedin:  extra.company_linkedin || "",
      linkedin_url:      extra.linkedin_url || "",
      source:            lead?.source || extra.source || "",
      custom_source:     extra.custom_source || "",
      remarks:           lead?.remarks || "",
      stage:             lead?.stage || "new",
      meeting_status:    extra.meeting_status || "—",
      follow_up_date:    lead?.follow_up_date ? lead.follow_up_date.slice(0, 10) : "",
      assigned_to:       lead?.assigned_to || "",
    },
  });

  const watchSource = watch("source");
  const watchStage  = watch("stage");
  const SUB_STATUS_FORM_KEYS = ["attempted_contact", "engaged"];
  const showSubStatus = SUB_STATUS_FORM_KEYS.includes(watchStage);
  const [subStatusReason,  setSubStatusReason]  = useState(extra.contact_sub_status?.reason  || "");
  const [subStatusRemarks, setSubStatusRemarks] = useState(extra.contact_sub_status?.remarks || "");

  const toggleService = (svc) => {
    setSelectedServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
    );
  };

  const handleSave = async (formData) => {
    if (!formData.company_name?.trim()) { toast.error("Company name is required"); return; }
    const activePoc = persons.find((p) => p.id === pocId) || persons[0] || {};
    if (!activePoc.email?.trim() && !activePoc.phone?.trim()) {
      toast.error("Please provide at least one contact detail — Email or Phone is required");
      return;
    }
    // Validate sub-status reason when stage is Attempted Contact or Engaged
    if (SUB_STATUS_FORM_KEYS.includes(formData.stage) && !subStatusReason) {
      toast.error("Please select a reason for the status before saving.");
      return;
    }
    if (selectedServices.includes("Other Project Services") && !customService.trim()) {
      toast.error("Please describe the custom / other service before saving.");
      return;
    }
    const personsWithFlag = persons.map((p) => ({ ...p, is_primary: p.id === pocId }));
    await onSave({
      company_name:   formData.company_name,
      contact_name:   activePoc.name?.trim() || "",
      designation:    activePoc.designation || "",
      source:         formData.source || null,
      temperature:    selectedTemp || null,
      remarks:        formData.remarks,
      stage:          formData.stage,
      follow_up_date: formData.follow_up_date || null,
      assigned_to:    formData.assigned_to || null,
      created_by:     connectedBy || undefined,
      // Activity data — only for new leads, stripped before DB insert
      _activity: !lead ? { type: activityType, remarks: activityRemarks, date: activityDate } : undefined,
      other_notes: toJSON({
        email:            activePoc.email || "",
        phone:            activePoc.phone || "",
        people_contacts:  personsWithFlag,
        industry:         formData.industry || "",
        state:            formData.state || "",
        city:             formData.city || "",
        website:          formData.website,
        company_linkedin: formData.company_linkedin,
        country:          selectedCountry,
        linkedin_url:     formData.linkedin_url,
        meeting_status:   formData.meeting_status,
        custom_source:    formData.source === "other" ? formData.custom_source : "",
        services:         selectedServices,
        custom_service:   selectedServices.includes("Other Project Services") ? customService : "",
        contact_locked:   true,
        supervisor_id:    supervisorId || null,
        contact_sub_status: SUB_STATUS_FORM_KEYS.includes(formData.stage) && subStatusReason
          ? { reason: subStatusReason, remarks: subStatusRemarks || null, updated_at: new Date().toISOString() }
          : (extra.contact_sub_status || null),
      }),
    });
  };

  const SectionDivider = ({ label }) => (
    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, margin: "4px 0 2px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 860, maxHeight: "93vh", overflowY: "auto" }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{lead ? "Edit Lead" : "Add Lead"}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(handleSave)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          {!canEditContactInfo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <Lock size={13} style={{ color: "#EF4444", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 500 }}>Phone & Email are locked for editing — contact your Sales Head or Super Admin to make changes.</span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* ── Lead ID (edit mode only) ── */}
            {lead && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)" }}>
                  <Lock size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 }}>ID:</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", fontFamily: "monospace", letterSpacing: "0.04em" }}>
                    {lead.lead_code ? lead.lead_code.replace(/^LEAD-?/i, "") : "—"}
                  </span>
                </div>
              </div>
            )}

            {/* ── Company ── */}
            <SectionDivider label="Basic Information" />
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Company Name *</label>
              <input className="crm-input" {...register("company_name", { required: "Required" })} placeholder="Acme Corp" />
              {errors.company_name && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.company_name.message}</span>}
            </div>

            {/* ── Company Details ── */}
            <SectionDivider label="Company Details" />
            <div>
              <label className="crm-label">Industry</label>
              <select className="crm-input" {...register("industry")}>
                <option value="">Select industry</option>
                {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Headquarters Country</label>
              <select className="crm-input" value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
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
              <label className="crm-label">Company Website</label>
              <input className="crm-input" {...register("website")} placeholder="https://company.com" />
            </div>
            <div>
              <label className="crm-label">Company LinkedIn</label>
              <input className="crm-input" {...register("company_linkedin")} placeholder="https://linkedin.com/company/..." />
            </div>

            {/* ── Contact Persons with POC selection ── */}
            <SectionDivider label="Contact Person(s) (Optional) — Email or Phone Required" />
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
                Contact Person is <strong>optional</strong>. At least one <strong>Email or Phone</strong> is required for the primary POC.
              </div>
              {persons.map((p, i) => (
                <div key={p.id} style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: `1.5px solid ${pocId === p.id ? "rgba(139,92,246,0.4)" : "var(--border)"}`, marginBottom: 10, position: "relative" }}>
                  {/* POC indicator */}
                  {pocId === p.id && (
                    <div style={{ position: "absolute", top: 10, right: 12, fontSize: 10.5, fontWeight: 800, color: "#8B5CF6", display: "flex", alignItems: "center", gap: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      <Star size={10} fill="#8B5CF6" strokeWidth={0} /> POC
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <label className="crm-label">Name <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
                      <input className="crm-input"
                        style={!canEditContactInfo ? { opacity: 0.6, cursor: "not-allowed" } : {}}
                        disabled={!canEditContactInfo}
                        value={p.name} onChange={(e) => updatePerson(p.id, "name", e.target.value)}
                        placeholder="John Doe" />
                    </div>
                    <div>
                      <label className="crm-label">Designation</label>
                      <input className="crm-input" value={p.designation} onChange={(e) => updatePerson(p.id, "designation", e.target.value)} placeholder="CTO" />
                    </div>
                    <div>
                      <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        Email {!canEditContactInfo && <Lock size={10} style={{ color: "#EF4444" }} />}
                      </label>
                      <input className="crm-input" type="email"
                        style={!canEditContactInfo ? { opacity: 0.6, cursor: "not-allowed" } : {}}
                        disabled={!canEditContactInfo}
                        value={p.email} onChange={(e) => updatePerson(p.id, "email", e.target.value)}
                        placeholder="contact@company.com" />
                    </div>
                    <div>
                      <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        Phone {!canEditContactInfo && <Lock size={10} style={{ color: "#EF4444" }} />}
                      </label>
                      <div style={{ display: "flex", gap: 5 }}>
                        <select className="crm-input"
                          value={p.dial || "+91"}
                          disabled={!canEditContactInfo}
                          onChange={(e) => updatePerson(p.id, "dial", e.target.value)}
                          style={{ height: 40, width: 150, padding: "0 6px", flexShrink: 0, opacity: !canEditContactInfo ? 0.6 : 1, cursor: !canEditContactInfo ? "not-allowed" : "auto" }}>
                          {COUNTRIES.map((c) => <option key={c.code} value={c.dial}>{c.name} ({c.dial})</option>)}
                        </select>
                        <input className="crm-input"
                          style={!canEditContactInfo ? { opacity: 0.6, cursor: "not-allowed" } : {}}
                          disabled={!canEditContactInfo}
                          value={p.phone} onChange={(e) => updatePerson(p.id, "phone", e.target.value)}
                          placeholder="9876543210" />
                      </div>
                    </div>
                    {pocId === p.id && (
                      <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "var(--text-muted)", marginTop: -2 }}>
                        <span style={{ color: "#EF4444", fontWeight: 600 }}>*</span> At least one of Email or Phone is required
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {pocId !== p.id && (
                      <button type="button" onClick={() => setPocId(p.id)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 8, background: "rgba(139,92,246,0.08)", border: "1.5px solid rgba(139,92,246,0.22)", color: "#8B5CF6", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        <Star size={10} strokeWidth={2} /> Set as POC
                      </button>
                    )}
                    {persons.length > 1 && pocId !== p.id && (
                      <button type="button" onClick={() => removePerson(p.id)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1.5px solid rgba(239,68,68,0.18)", color: "#EF4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                        <Trash2 size={10} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" onClick={addPerson} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, height: 32 }}>
                <UserPlus size={12} /> Add Another Contact
              </button>
            </div>

            {/* ── Services ── */}
            <SectionDivider label="Services of Interest" />
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label" style={{ marginBottom: 6 }}>Services (multi-select)</label>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setSvcOpen((v) => !v)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 14px", background: "var(--surface-2)", border: "1.5px solid var(--border)",
                    borderRadius: "var(--r-sm)", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    color: selectedServices.length ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>
                    {selectedServices.length ? selectedServices.join(", ") : "Select services..."}
                  </span>
                  <ChevronDown size={14} style={{ color: "var(--text-muted)", flexShrink: 0, transform: svcOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </button>
                <AnimatePresence>
                  {svcOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-lg)", padding: "4px 0" }}
                    >
                      {SAP_SERVICES.map((svc) => {
                        const checked = selectedServices.includes(svc);
                        return (
                          <label key={svc}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", fontSize: 13, color: checked ? "var(--accent)" : "var(--text-2)", fontWeight: checked ? 600 : 400 }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            <input type="checkbox" checked={checked} onChange={() => toggleService(svc)}
                              style={{ accentColor: "var(--accent)", width: 14, height: 14, flexShrink: 0 }} />
                            {svc}
                          </label>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {selectedServices.includes("Other Project Services") && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} style={{ marginTop: 8 }}>
                  <input className="crm-input" value={customService} onChange={(e) => setCustomService(e.target.value)} placeholder="Describe the custom / other service..." />
                </motion.div>
              )}
            </div>

            {/* ── Initial Activity (new leads only) ── */}
            {!lead && (
              <>
                <SectionDivider label="Initial Activity (Optional)" />
                <div>
                  <label className="crm-label">Activity Type</label>
                  <select className="crm-input" value={activityType} onChange={(e) => setActivityType(e.target.value)}>
                    {ACTIVITY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="crm-label">Activity Date</label>
                  <input className="crm-input" type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="crm-label">Remarks</label>
                  <textarea className="crm-input" rows={2} value={activityRemarks} onChange={(e) => setActivityRemarks(e.target.value)} placeholder="e.g. Initial call scheduled, interested in SAP migration..." style={{ resize: "vertical" }} />
                </div>
              </>
            )}

            {/* ── Lead Classification ── */}
            <SectionDivider label="Lead Classification" />
            <div>
              <label className="crm-label">Lead Source</label>
              <select className="crm-input" {...register("source")}>
                <option value="">Select source</option>
                {LEAD_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            {watchSource === "other" && (
              <div>
                <label className="crm-label">Custom Source</label>
                <input className="crm-input" {...register("custom_source")} placeholder="Describe the source..." />
              </div>
            )}

            {/* ── Stage + Status ── */}
            <SectionDivider label="Status & Stage" />
            <div style={{ gridColumn: showSubStatus ? "1 / -1" : undefined }}>
              <label className="crm-label">Stage</label>
              <select className="crm-input" {...register("stage")} onChange={(e) => { setValue("stage", e.target.value); setSubStatusReason(""); setSubStatusRemarks(""); }}>
                {LEAD_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {showSubStatus && (
                <ContactSubStatusInline
                  status={watchStage}
                  value={subStatusReason}
                  remarks={subStatusRemarks}
                  onChange={setSubStatusReason}
                  onRemarksChange={setSubStatusRemarks}
                />
              )}
            </div>
            <div>
              <label className="crm-label">Meeting Status</label>
              <select className="crm-input" {...register("meeting_status")}>
                {MEETING_STATUSES.map((ms) => <option key={ms} value={ms}>{ms}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Meeting / Follow-up Date</label>
              <input className="crm-input" type="date" {...register("follow_up_date")} />
            </div>

            {/* ── Remarks ── */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Remarks</label>
              <textarea className="crm-input" {...register("remarks")} rows={3} placeholder="Notes, next steps..." style={{ resize: "vertical" }} />
            </div>

            {/* ── LinkedIn & Assignment ── */}
            <SectionDivider label="Social & Assignment" />
            <div>
              <label className="crm-label">Contact LinkedIn URL</label>
              <input className="crm-input" {...register("linkedin_url")} onBlur={(e) => { const n = normalizeLinkedInUrl(e.target.value); if (n !== e.target.value) setValue("linkedin_url", n, { shouldDirty: true }); }} placeholder="https://linkedin.com/in/..." />
            </div>
            {teamMembers?.length > 0 && (
              <div>
                <label className="crm-label">Connected By</label>
                <select className="crm-input" value={connectedBy} onChange={(e) => setConnectedBy(e.target.value)}>
                  <option value="">Select user...</option>
                  {groupByRole(teamMembers).map(({ role, label, members }) => (
                    <optgroup key={role} label={label}>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name} ({label})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
            {isOwner && teamMembers?.length > 0 ? (
              <div>
                <label className="crm-label">Assigned To</label>
                <select className="crm-input" {...register("assigned_to")}>
                  <option value="">Unassigned</option>
                  {groupByRole(teamMembers).map(({ role, label, members }) => (
                    <optgroup key={role} label={label}>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name} ({label})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            ) : lead?.assigned_to ? (
              <div>
                <label className="crm-label">Assigned To</label>
                <div style={{ fontSize: 13.5, color: "var(--text)", padding: "7px 0" }}>
                  {teamMembers?.find((m) => m.id === lead.assigned_to)?.full_name || "—"}
                </div>
              </div>
            ) : null}
            {isOwner && (() => {
              const supervisorMembers = (teamMembers || []).filter((m) => ["owner", "admin"].includes(m.role));
              if (!supervisorMembers.length) return null;
              return (
                <div>
                  <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Lock size={10} style={{ color: "#F59E0B" }} /> Supervised By
                  </label>
                  <select className="crm-input" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
                    <option value="">No Supervisor</option>
                    {supervisorMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name} ({ROLE_DISPLAY[m.role] || m.role})</option>
                    ))}
                  </select>
                </div>
              );
            })()}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : lead ? "Save Changes" : "Add Lead"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}

// ─── Proposal Sent modal ──────────────────────────────────────────────────────
function ProposalSentModal({ lead, onClose }) {
  const { profile } = useAuth();
  const { symbol } = useCurrency();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: {
      title:        `Proposal — ${lead.company_name}`,
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      value:        "",
    },
  });

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      const leadExtra = parseJSON(lead.other_notes);
      const leadEmail = lead.email || leadExtra.email || "";
      const leadPhone = lead.phone || leadExtra.phone || leadExtra.contact || leadExtra.whatsapp || "";

      const { error: dealError } = await supabase.from("deals").insert({
        title:        data.title,
        company_name: data.company_name,
        contact_name: data.contact_name,
        value:        Number(data.value) || 0,
        stage:        "proposal_sent",
        temperature:  lead.temperature || null,
        assigned_to:  lead.assigned_to || profile?.id,
        created_by:   profile?.id,
        lead_id:      lead.id,
        notes:        toJSON({
          email:           leadEmail,
          contact:         leadPhone,
          remarks:         lead.remarks   || leadExtra.remarks || "",
          lead_code:       lead.lead_code || "",
          industry:        leadExtra.industry || "",
          country:         leadExtra.country  || "",
          state:           leadExtra.state    || "",
          city:            leadExtra.city     || "",
          headquarters:    [leadExtra.city, leadExtra.state].filter(Boolean).join(", "),
          services:        leadExtra.services || [],
          custom_service:  leadExtra.custom_service || "",
          website:          leadExtra.website || "",
          company_linkedin: leadExtra.company_linkedin || "",
          linkedin_url:     leadExtra.linkedin_url || "",
          source:    lead.source    || "",
        }),
      });
      if (dealError) throw dealError;

      const { error: leadError } = await supabase.from("leads").update({ stage: "converted" }).eq("id", lead.id);
      if (leadError) throw leadError;

      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Proposal sent! Deal created and lead moved to Proposal stage.");

      // Notify lead creator if different from current user
      if (lead.created_by && lead.created_by !== profile?.id) {
        notifyUser(lead.created_by, "Proposal Sent on Your Lead", `${profile?.full_name} sent a proposal for ${lead.company_name || lead.contact_name}`, lead.id);
      }
      // Notify managers
      if (profile) {
        notifyManagers(profile.id, profile.full_name, lead.company_name || lead.contact_name, lead.id, "Proposal Sent", `${profile.full_name} sent a proposal for ${lead.company_name || lead.contact_name}`);
      }
      onClose();
    } catch (e) {
      toast.error("Failed: " + (e.message || "Unknown error"));
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
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Mark Proposal Sent</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>Creates a deal and moves lead to Proposal stage</p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.08)", borderRadius: 8, border: "1px solid rgba(245,158,11,0.2)", fontSize: 12.5, color: "#92400E", fontWeight: 500 }}>
            Sending proposal to: <strong>{lead.company_name}</strong> — {lead.contact_name}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Deal Title</label>
              <input className="crm-input" {...register("title", { required: true })} />
            </div>
            <div>
              <label className="crm-label">Proposal Value ({symbol})</label>
              <input className="crm-input" type="number" {...register("value")} placeholder="500000" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving} style={{ background: "#F59E0B", borderColor: "#F59E0B" }}>
              {saving ? "Sending..." : "Mark Proposal Sent"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Convert to Deal mini modal ───────────────────────────────────────────────
function ConvertDealModal({ lead, onClose }) {
  const { profile } = useAuth();
  const { symbol } = useCurrency();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: {
      title:        `Deal — ${lead.company_name}`,
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      value:        "",
      stage:        "new",
    },
  });

  const DEAL_STAGES = [
    { key: "new",               label: "New"               },
    { key: "contacted",         label: "Contacted"         },
    { key: "meeting_scheduled", label: "Meeting Scheduled" },
    { key: "proposal_sent",     label: "Proposal Sent"     },
    { key: "negotiation",       label: "Negotiation"       },
  ];

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      const leadExtra = parseJSON(lead.other_notes);
      const leadEmail = lead.email || leadExtra.email || "";
      const leadPhone = lead.phone || leadExtra.phone || leadExtra.contact || leadExtra.whatsapp || "";

      const { data: newDeal, error: dealError } = await supabase.from("deals").insert({
        title:        data.title,
        company_name: data.company_name,
        contact_name: data.contact_name,
        value:        Number(data.value) || 0,
        stage:        data.stage,
        temperature:  lead.temperature || null,
        assigned_to:  lead.assigned_to || profile?.id,
        created_by:   profile?.id,
        lead_id:      lead.id,
        notes:        toJSON({
          email:           leadEmail,
          contact:         leadPhone,
          remarks:         lead.remarks   || leadExtra.remarks || "",
          lead_code:       lead.lead_code || "",
          industry:        leadExtra.industry || "",
          country:         leadExtra.country  || "",
          state:           leadExtra.state    || "",
          city:            leadExtra.city     || "",
          headquarters:    [leadExtra.city, leadExtra.state].filter(Boolean).join(", "),
          services:        leadExtra.services || [],
          custom_service:  leadExtra.custom_service || "",
          website:          leadExtra.website || "",
          company_linkedin: leadExtra.company_linkedin || "",
          linkedin_url:     leadExtra.linkedin_url || "",
          source:    lead.source    || "",
        }),
      }).select().single();
      if (dealError) throw dealError;

      const { error: leadError } = await supabase.from("leads").update({ stage: "converted" }).eq("id", lead.id);
      if (leadError) throw leadError;

      changeHistoryService.logConversion({ entityId: lead.id, dealId: newDeal?.id, fromStage: "lead", toStage: "deal", userId: profile?.id }).catch(() => {});

      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Lead converted to deal!");
      ActivityEngine.leadConverted({ userId: profile?.id, leadId: lead.id, company: lead.company_name || lead.contact_name });

      // Notify lead creator if different from current user
      if (lead.created_by && lead.created_by !== profile?.id) {
        notifyUser(lead.created_by, "Your Lead Was Converted!", `${profile?.full_name} converted ${lead.company_name || lead.contact_name} into a deal.`, lead.id);
      }
      // Notify managers
      if (profile) {
        notifyManagers(profile.id, profile.full_name, lead.company_name || lead.contact_name, lead.id, "Deal Converted", `${profile.full_name} converted lead ${lead.company_name || lead.contact_name} into a deal!`);
      }
      onClose();
      navigate("/deals");
    } catch (e) {
      toast.error("Conversion failed: " + (e.message || "Unknown error. Check DB constraints."));
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
        style={{ maxWidth: 480 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Convert to Deal</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>Lead will be marked as Won</p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", background: "var(--accent-light)", borderRadius: 8, border: "1px solid rgba(37,99,235,0.15)", fontSize: 12.5, color: "var(--accent)", fontWeight: 500 }}>
            Converting: <strong>{lead.company_name}</strong> — {lead.contact_name}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Deal Title</label>
              <input className="crm-input" {...register("title", { required: true })} />
            </div>
            <div>
              <label className="crm-label">Deal Value ({symbol})</label>
              <input className="crm-input" type="number" {...register("value")} placeholder="500000" />
            </div>
            <div>
              <label className="crm-label">Initial Stage</label>
              <select className="crm-input" {...register("stage")}>
                {DEAL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Converting..." : "Convert to Deal"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ stage }) {
  const s = LEAD_STATUSES.find((x) => x.key === stage) || LEAD_STATUSES[0];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 20,
      fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function TempBadge({ temp }) {
  if (!temp) return null;
  const t = TEMPERATURES.find((x) => x.key === temp);
  if (!t) return null;
  const TIcon = t.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: t.bg, color: t.color }}>
      <TIcon size={10} strokeWidth={2} /> {t.label}
    </span>
  );
}

function ScoreBadge({ lead }) {
  const s = leadScore(lead);
  const { color, bg } = scoreColor(s);
  return (
    <span title={`Lead score: ${s}/100`} style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700,
      background: bg, color,
    }}>
      <Star size={9} strokeWidth={2.5} fill={color} />
      {s}
    </span>
  );
}

// ─── Column Filter Dropdown (multi-select + search) ───────────────────────────
function ColFilter({ label, value = [], options, onChange }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => { if (!open) setSearch(""); }, [open]);

  if (!options?.length) return null;
  const isActive = value.length > 0;

  const toggle = (optValue) => {
    onChange(value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]);
  };

  const filteredOpts = search
    ? options
        .filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => {
          const s = search.toLowerCase();
          return (a.label.toLowerCase().startsWith(s) ? 0 : 1) - (b.label.toLowerCase().startsWith(s) ? 0 : 1);
        })
    : options;

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 3 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{ background: isActive ? "rgba(99,102,241,0.18)" : "none", border: "none", cursor: "pointer", padding: "1px 4px", borderRadius: 4, color: isActive ? "#6366F1" : "var(--text-muted)", lineHeight: 1, display: "inline-flex", alignItems: "center", gap: 2 }}
        title={isActive ? `${value.length} filter${value.length > 1 ? "s" : ""} active` : `Filter by ${label}`}
      >
        <Filter size={9} strokeWidth={2.5} />
        {isActive && <span style={{ fontSize: 9, fontWeight: 800 }}>{value.length}</span>}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 400, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.18)", minWidth: 210, maxHeight: 320, display: "flex", flexDirection: "column" }}
        >
          <div style={{ padding: "8px 10px 7px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{label}</span>
              {isActive && (
                <button type="button" onClick={() => { onChange([]); setOpen(false); }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 6px", borderRadius: 4, fontSize: 10, color: "#EF4444", fontFamily: "inherit", fontWeight: 700 }}>
                  Clear all
                </button>
              )}
            </div>
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", boxSizing: "border-box", padding: "5px 9px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, background: "var(--surface-2)", color: "var(--text)", fontFamily: "inherit", outline: "none" }}
            />
          </div>
          <div style={{ overflowY: "auto", padding: "4px 0", flex: 1 }}>
            {filteredOpts.length === 0 ? (
              <div style={{ padding: "14px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>No results</div>
            ) : filteredOpts.map((opt) => {
              const checked = value.includes(opt.value);
              return (
                <label key={opt.value}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", cursor: "pointer", fontSize: 12.5, color: checked ? "var(--accent)" : "var(--text-2)", fontWeight: checked ? 600 : 400, background: checked ? "rgba(99,102,241,0.06)" : "none" }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(opt.value)}
                    style={{ accentColor: "var(--accent)", width: 13, height: 13, flexShrink: 0, cursor: "pointer" }} />
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

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────
function BulkActionBar({ count, teamMembers, onAssign, onStageChange, onDelete, onClear }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [stageOpen,  setStageOpen]  = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "8px 16px", background: "rgba(37,99,235,0.08)",
        border: "1px solid rgba(37,99,235,0.2)", borderRadius: 10, marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
        {count} selected
      </span>
      <div style={{ flex: 1 }} />

      {/* Assign to */}
      <div style={{ position: "relative" }}>
        <button
          className="btn-secondary"
          style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12 }}
          onClick={() => { setAssignOpen((v) => !v); setStageOpen(false); }}
        >
          <UserCheck size={12} /> Assign to <ChevronDown size={11} />
        </button>
        <AnimatePresence>
          {assignOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, boxShadow: "var(--shadow-lg)",
                padding: "4px 0", minWidth: 160,
              }}
            >
              {groupByRole(teamMembers).map(({ role, label, members }) => (
                <div key={role}>
                  <div style={{ padding: "5px 14px 3px", fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {label}
                  </div>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { onAssign(m.id, m.full_name); setAssignOpen(false); }}
                      style={{
                        display: "block", width: "100%", padding: "7px 14px 7px 20px",
                        border: "none", background: "transparent", cursor: "pointer",
                        textAlign: "left", fontSize: 13, color: "var(--text-2)",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      {m.full_name}
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 5 }}>
                        ({ROLE_DISPLAY[m.role] || m.role})
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Change stage */}
      <div style={{ position: "relative" }}>
        <button
          className="btn-secondary"
          style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12 }}
          onClick={() => { setStageOpen((v) => !v); setAssignOpen(false); }}
        >
          <CheckSquare size={12} /> Set Stage <ChevronDown size={11} />
        </button>
        <AnimatePresence>
          {stageOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, boxShadow: "var(--shadow-lg)",
                padding: "4px 0", minWidth: 150,
              }}
            >
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => { onStageChange(s.key, s.label); setStageOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    width: "100%", padding: "8px 14px",
                    border: "none", background: "transparent", cursor: "pointer",
                    textAlign: "left", fontSize: 13, color: s.color,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  {s.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delete */}
      <button
        className="btn-secondary"
        style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12, color: "#EF4444", borderColor: "#EF444440" }}
        onClick={onDelete}
      >
        <Trash2 size={12} /> Delete
      </button>

      {/* Clear */}
      <button
        className="btn-ghost"
        style={{ height: 32, padding: "0 10px", fontSize: 12, color: "var(--text-muted)" }}
        onClick={onClear}
      >
        <X size={12} />
      </button>
    </motion.div>
  );
}

// ─── Enrichment dots ─────────────────────────────────────────────────────────
function EnrichmentDots({ email, phone, linkedin }) {
  const dots = [
    { ok: !!email,   label: "Email",    color: "#3B82F6" },
    { ok: !!phone,   label: "Phone",    color: "#10B981" },
    { ok: !!linkedin,label: "LinkedIn", color: "#0A66C2" },
  ];
  return (
    <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
      {dots.map((d) => (
        <span
          key={d.label}
          title={d.ok ? `${d.label} available` : `No ${d.label}`}
          style={{
            width: 6, height: 6, borderRadius: "50%",
            background: d.ok ? d.color : "var(--border)",
            opacity: d.ok ? 1 : 0.5,
          }}
        />
      ))}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function LeadsStatsBar({ leads }) {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const monthAgo = now - 30 * 86400000;
  const hot = leads.filter((l) => l.stage === "hot" || l.temperature === "hot").length;
  const newThis = leads.filter((l) => l.created_at && new Date(l.created_at).getTime() > weekAgo).length;
  const won = leads.filter((l) => l.stage === "won" && l.updated_at && new Date(l.updated_at).getTime() > monthAgo).length;
  const items = [
    { v: leads.length, l: "total",          c: "var(--accent)" },
    { v: hot,          l: "hot",            c: "#EF4444" },
    { v: newThis,      l: "new this week",  c: "#8B5CF6" },
    { v: won,          l: "won this month", c: "#10B981" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "7px 24px", borderBottom: "1px solid var(--border)", overflowX: "auto", gap: 0 }}>
      {items.map((s, i) => (
        <div key={s.l} style={{ display: "flex", alignItems: "baseline", gap: 5, padding: "2px 18px", flexShrink: 0, ...(i > 0 ? { borderLeft: "1px solid var(--border)" } : {}) }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: s.c, letterSpacing: "-0.03em" }}>{s.v}</span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{s.l}</span>
        </div>
      ))}
    </div>
  );
}

// ─── AI Insight Banner ────────────────────────────────────────────────────────
function AIInsightBanner({ leads }) {
  const hot = leads.filter((l) => ["proposal","converted"].includes(l.stage) || l.temperature === "hot").filter((l) => !["won","lost"].includes(l.stage));
  if (!hot.length) return null;
  const top = hot.reduce((a, b) => leadScore(a) >= leadScore(b) ? a : b, hot[0]);
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="cmd-ai-banner"
      style={{ margin: "12px 24px 0", borderRadius: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}
    >
      <Brain size={14} style={{ flexShrink: 0 }} />
      <span>
        <strong>AI Insight:</strong> {hot.length} hot lead{hot.length > 1 ? "s" : ""} need attention.
        Highest priority: <strong>{top.company_name}</strong> — Score {leadScore(top)}/100.
      </span>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Leads() {
  const { profile, isSalesHead, isOwner, isManager, isFieldUser } = useAuth();
  const canDelete = isSalesHead; // owner + sales_head only per permission matrix
  const qc = useQueryClient();
  const [showForm, setShowForm]           = useState(false);
  const [editLead, setEditLead]           = useState(null);
  const [selectedLead, setSelectedLead]   = useState(null);
  const [convertLead, setConvertLead]     = useState(null);
  const [pendingSubStatus, setPendingSubStatus] = useState(null); // { leadId, newStatus, prevStatus }
  const [pendingDupCreate, setPendingDupCreate] = useState(null); // { payload, duplicates, type }
  const [importSummary, setImportSummary]       = useState(null); // { total, ok, exactDups, partialSimilar, fail, rows }
  const [proposalLead, setProposalLead]   = useState(null);
  const [hideConverted, setHideConverted] = useState(true);
  const [search, setSearch]             = useState("");
  const [filterStage, setFilterStage]   = useState([]);
  const [filterTemp, setFilterTemp]     = useState([]);
  const [sortBy, setSortBy]             = useState("created_desc");
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [filterIndustry,  setFilterIndustry]  = useState([]);
  const [filterCountry,   setFilterCountry]   = useState([]);
  const [filterSource,    setFilterSource]    = useState([]);
  const [filterAssigned,  setFilterAssigned]  = useState([]);
  const [filterDateFrom,  setFilterDateFrom]  = useState("");
  const [filterDateTo,    setFilterDateTo]    = useState("");
  const [filterService,   setFilterService]   = useState([]);
  const [filterLeadId,    setFilterLeadId]    = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);
  const fileRef            = useRef();
  const pendingActivityRef = useRef(null);
  const { hiddenSet, isVisible, toggleColumn, resetColumns, templates, saveTemplate, applyTemplate, deleteTemplate } = useTablePreferences("leads", LEAD_COLUMNS, profile?.id);

  // ── Phone/Email lock setting ──────────────────────────────────────────────
  const { data: lockSetting, refetch: refetchLock } = useQuery({
    queryKey: ["crm-setting-phone-email-lock"],
    queryFn: async () => {
      const { data } = await supabase.from("crm_settings").select("value").eq("key", "phone_email_lock").single();
      return data?.value === "true";
    },
    staleTime: 60000,
  });
  const phoneEmailLocked = lockSetting ?? false;
  const canEditContactInfo = isOwner || isSalesHead || !phoneEmailLocked;

  const toggleLock = async () => {
    const next = !phoneEmailLocked;
    const newVal = next.toString();
    await supabase.from("crm_settings").upsert({ key: "phone_email_lock", value: newVal, updated_by: profile?.id, updated_at: new Date().toISOString() });
    await supabase.from("leads").update({ is_locked: next }).neq("stage", "pipeline");
    await refetchLock();
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(next ? "All leads locked" : "All leads unlocked");
  };

  const SUB_STATUS_KEYS = new Set(["attempted_contact", "engaged"]);

  const handleLeadInlineUpdate = async (id, field, value, subStatusReason = null, subStatusRemarks = null) => {
    const lead = rawLeads.find((l) => l.id === id);

    // If this is a sub-status stage change and no reason provided yet, show modal
    if (field === "stage" && SUB_STATUS_KEYS.has(value) && !subStatusReason) {
      setPendingSubStatus({ leadId: id, newStatus: value, prevStatus: lead?.stage });
      return;
    }

    // Build update payload — include sub-status in other_notes when applicable
    let updatePayload = { [field]: value, updated_at: new Date().toISOString() };
    if (field === "stage" && SUB_STATUS_KEYS.has(value) && subStatusReason) {
      const prevExtra = parseJSON(lead?.other_notes);
      updatePayload.other_notes = JSON.stringify({
        ...prevExtra,
        contact_sub_status: { reason: subStatusReason, remarks: subStatusRemarks || null, updated_at: new Date().toISOString() },
      });
    }

    const { error } = await supabase.from("leads").update(updatePayload).eq("id", id);
    if (error) {
      toast.error("Update failed");
    } else {
      qc.invalidateQueries({ queryKey: ["leads"] });
      if (field === "stage") {
        const statusMeta = LEAD_STATUSES.find((s) => s.key === value);
        const description = subStatusReason
          ? `${lead?.company_name || lead?.contact_name || "Lead"}: status → "${statusMeta?.label || value}" · Reason: ${subStatusReason}${subStatusRemarks ? ` · ${subStatusRemarks}` : ""}`
          : undefined;
        ActivityEngine.leadStageChanged({ userId: profile?.id, leadId: id, company: lead?.company_name || lead?.contact_name, oldStage: lead?.stage, newStage: value, userName: profile?.full_name, description });
      } else if (field === "temperature") {
        ActivityEngine.leadStatusChanged({ userId: profile?.id, leadId: id, company: lead?.company_name || lead?.contact_name, oldStatus: lead?.temperature, newStatus: value, userName: profile?.full_name });
      }
    }
  };

  const handleSubStatusConfirm = (reason, remarks) => {
    if (!pendingSubStatus) return;
    handleLeadInlineUpdate(pendingSubStatus.leadId, "stage", pendingSubStatus.newStatus, reason, remarks);
    setPendingSubStatus(null);
  };

  const handleSubStatusCancel = () => {
    setPendingSubStatus(null);
  };

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

  const assignedToParam = viewFilter === "mine" ? profile?.id : viewFilter === "unassigned" ? "__unassigned__" : undefined;
  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["leads", search, viewFilter, profile?.id],
    queryFn: () => leadsService.getAll({ search, assignedTo: assignedToParam }),
  });

  const { data: teamData } = useQuery({
    queryKey: ["team-all"],
    queryFn: () => teamService.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: leadsService.create,
    onSuccess: async (newLead) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead added successfully!");
      setShowForm(false);
      // Insert initial activity if provided in the form
      const activity = pendingActivityRef.current;
      pendingActivityRef.current = null;
      if (activity?.remarks?.trim()) {
        const actLabel = ACTIVITY_TYPES.find((t) => t.key === activity.type)?.label || activity.type;
        supabase.from("activities").insert({
          type:        activity.type || "note",
          title:       `${actLabel}: ${newLead.company_name || newLead.contact_name}`,
          description: activity.remarks,
          lead_id:     newLead.id,
          due_date:    activity.date || null,
          created_by:  profile?.id,
          status:      "pending",
        }).then(() => {}).catch(() => {});
      }
      if (profile) {
        notifyManagers(profile.id, profile.full_name, newLead.company_name || newLead.contact_name, newLead.id, "New Lead Created", `${profile.full_name} added a new lead: ${newLead.company_name || newLead.contact_name}`);
      }
      // Log creation event to history
      changeHistoryService.logCreation({
        entityType: "lead",
        entityId:   newLead.id,
        label:      "Lead Created",
        details:    newLead.company_name || newLead.contact_name || "New Lead",
        userId:     profile?.id,
      }).catch(() => {});
      ActivityEngine.leadCreated({ userId: profile?.id, leadId: newLead.id, company: newLead.company_name || newLead.contact_name });
    },
    onError: (e) => toast.error("Failed to add lead: " + e.message),
  });

  const bulkImportMutation = useMutation({
    mutationFn: async ({ rows, assignedTo }) => {
      // Determine the next sequential code based on the actual max in the database (MAX+1)
      const { data: codeRows } = await supabase.from("leads").select("lead_code").not("lead_code", "is", null);
      let maxCode = 0;
      (codeRows || []).forEach((r) => {
        const n = parseInt((r.lead_code || "").replace(/\D/g, ""), 10);
        if (!isNaN(n) && n > maxCode) maxCode = n;
      });
      const records = rows.map((r, i) => {
        const leadCode = `LEAD-${String(maxCode + i + 1).padStart(3, "0")}`;
        return {
          stage:          CSV_STAGE_MAP[r["Stage"]?.trim()] || "new",
          company_name:   r["Company"]        || "",
          contact_name:   r["Contact Name"]   || "",
          designation:    r["Designation"]    || null,
          source:         LEAD_SOURCES.find((s) => s.label?.toLowerCase() === r["Source"]?.toLowerCase())?.key || null,
          temperature:    CSV_TEMP_MAP[r["Lead Status"]?.trim()] || null,
          remarks:        r["Remarks"]        || null,
          follow_up_date: parseCsvDate(r["Meeting Date"]),
          lead_code:      leadCode,
          assigned_to:    assignedTo          || profile?.id,
          created_by:     profile?.id,
          other_notes: JSON.stringify({
            email:       r["Email"]        || "",
            phone:       r["Phone"]        || "",
            country: (() => {
              const raw = (r["Country"] || "").trim();
              if (!raw) return "";
              const byCode = COUNTRIES.find((c) => c.code.toLowerCase() === raw.toLowerCase());
              if (byCode) return byCode.code;
              const byName = COUNTRIES.find((c) => c.name.toLowerCase() === raw.toLowerCase());
              return byName ? byName.code : raw;
            })(),
            linkedin_url: r["LinkedIn URL"] || "",
          }),
        };
      });
      const { error } = await supabase.from("leads").insert(records);
      if (error) throw error;
      return records.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`${count} lead${count !== 1 ? "s" : ""} imported!`);
      setShowBulkImport(false);
    },
    onError: (e) => toast.error("Import failed: " + e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => leadsService.update(id, data),
    onSuccess: async (updated, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead updated");
      setEditLead(null);
      setSelectedLead(null);
      if (profile) {
        await notifyManagers(
          profile.id, profile.full_name,
          updated.company_name || updated.contact_name,
          updated.id,
          "Lead Updated",
          `${profile.full_name} (${profile.role}) updated lead: ${updated.company_name || updated.contact_name}`
        );
      }
      // Auto-log: stage change vs general update
      if (vars?.stage && vars.stage !== updated?.stage) {
        ActivityEngine.leadStageChanged({ userId: profile?.id, leadId: updated.id, company: updated.company_name, oldStage: updated?.stage, newStage: vars.stage });
      } else if (vars?.assigned_to && vars.assigned_to !== updated?.assigned_to) {
        ActivityEngine.leadAssigned({ userId: profile?.id, leadId: updated.id, company: updated.company_name });
      } else {
        ActivityEngine.leadUpdated({ userId: profile?.id, leadId: updated.id, company: updated.company_name });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }) => leadsService.delete(id),
    onSuccess: (_, { lead }) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      // Cascade cleanup: refresh all sections that may reference this lead's activities
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["my-pending-activities"] });
      qc.invalidateQueries({ queryKey: ["my-completed-activities"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-activity"] });
      toast.success("Lead deleted");
      if (profile && lead) {
        notifyManagers(profile.id, profile.full_name, lead.company_name || lead.contact_name, lead.id, "Lead Deleted", `${profile.full_name} deleted lead: ${lead.company_name || lead.contact_name}`);
        // Audit trail: record deletion in change_history
        supabase.from("change_history").insert({
          entity_type: "lead",
          entity_id: lead.id,
          field: "record",
          old_value: lead.lead_code || lead.id,
          new_value: "DELETED",
          changed_by: profile.id,
          changed_at: new Date().toISOString(),
        }).catch(() => {});
      }
    },
    onError: (e) => toast.error(e.message),
  });


  const handleSave = async (data) => {
    const { _activity, ...leadData } = data;
    // Store activity for createMutation.onSuccess to consume
    if (_activity) pendingActivityRef.current = _activity;
    const payload = { ...leadData, created_by: leadData.created_by || profile?.id };
    if (editLead) {
      const oldExtra = parseJSON(editLead.other_notes);
      const newExtra = parseJSON(payload.other_notes);
      const changedFields = [];
      if (oldExtra.email !== newExtra.email) changedFields.push("Email");
      if (oldExtra.phone !== newExtra.phone) changedFields.push("Phone");
      const updated = await updateMutation.mutateAsync({ id: editLead.id, ...payload });
      // Auto-log field changes to change_history
      changeHistoryService.logDiff({
        entityType: "lead", entityId: editLead.id,
        oldRecord: editLead, newRecord: updated || payload,
        userId: profile?.id, trackedFields: LEAD_TRACKED_FIELDS,
      });
      // Notify owners/sales_heads when a field user changes contact info
      if (changedFields.length && profile && !["owner","admin"].includes(profile.role)) {
        try {
          const { data: admins } = await supabase.from("profiles")
            .select("id").in("role", ["owner", "admin"]);
          if (admins?.length) {
            const now = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
        const msg = `${profile.full_name} (${profile.role}) changed ${changedFields.join(" & ")} on lead: ${editLead.company_name || editLead.contact_name} — ${now}`;
            const notifRows = admins.map((a) => ({
              user_id: a.id, type: "lead_edit", title: "Contact Info Changed", message: msg, read: false,
              link: `/leads?selected=${editLead.id}`,
            }));
            await supabase.from("notifications").insert(notifRows);
          }
        } catch { /* non-critical */ }
      }
    } else {
      // 1. Strict exact check against visible records (shows record details to user)
      const exactMatches = detectExactDuplicates(payload, rawLeads, { notesKey: "other_notes", phoneKey: "phone" });
      if (exactMatches.length > 0) {
        setPendingDupCreate({ payload, duplicates: exactMatches, type: "exact" });
        return;
      }
      // 2. Cross-role backend check — catches duplicates in records the user can't see
      const dupCheck = await leadsService.checkDuplicate(payload);
      if (dupCheck.duplicate) {
        setPendingDupCreate({ payload, duplicates: [], type: "exact", crossRole: true });
        return;
      }
      // 3. Score-based partial/similar warning
      const { partial } = detectDuplicates(payload, rawLeads, { notesKey: "other_notes", phoneKey: "phone" });
      if (partial.length > 0) {
        setPendingDupCreate({ payload, duplicates: partial, type: "partial" });
        return;
      }
      await createMutation.mutateAsync({ ...payload, is_locked: false });
    }
  };

  const handleDupLeadProceed = async () => {
    const { payload } = pendingDupCreate;
    setPendingDupCreate(null);
    await createMutation.mutateAsync({ ...payload, is_locked: false });
  };

  const handleDupLeadViewExisting = (record) => {
    setPendingDupCreate(null);
    setShowForm(false);
    setEditLead(null);
    setSelectedLead(record);
  };

  const handleDelete = (e, lead) => {
    e.stopPropagation();
    if (!canDelete) { toast.error("Only Super Admin or Sales Head can delete leads"); return; }
    const id = typeof lead === "string" ? lead : lead?.id;
    const leadObj = typeof lead === "object" ? lead : rawLeads.find((l) => l.id === id);
    if (window.confirm("Delete this lead?")) deleteMutation.mutate({ id, lead: leadObj });
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Only CSV files are allowed."); e.target.value = ""; return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large. Maximum size is 5 MB."); e.target.value = ""; return; }
    const text = await file.text();
    const rows = parseCSVText(text).filter((r) => r["Company"] || r["Contact Name"]);
    if (rows.length === 0) { toast.error("No valid rows found"); e.target.value = ""; return; }

    // Fetch ALL leads for cross-role exact duplicate detection (requirement: check all CRM records).
    const { data: existingRaw } = await supabase
      .from("leads")
      .select("id, company_name, contact_name, stage, other_notes, created_at");
    const existing = existingRaw || [];

    let ok = 0, exactDups = 0, partialSimilar = 0, fail = 0;
    const exactDupRows = [], failReasons = [];

    for (const row of rows) {
      const flat = {
        company_name: row["Company"] || "",
        contact_name: row["Contact Name"] || "",
        email: row["Email"] || "",
        phone: row["Phone"] || "",
      };
      // Exact match: silently skip (hard block); partial match: import but flag
      const exactDupList = detectExactDuplicatesFlat(flat, existing, { notesKey: "other_notes", phoneKey: "phone" });
      const { partial } = detectDuplicatesFlat(flat, existing, { notesKey: "other_notes", phoneKey: "phone" });

      if (exactDupList.length > 0) {
        exactDups++;
        exactDupRows.push({
          company: flat.company_name, contact: flat.contact_name,
          email: flat.email, phone: flat.phone,
          matchedWith: exactDupList[0].record.company_name, reasons: exactDupList[0].reasons.join("; "),
        });
        continue;
      }

      const payload = csvLeadToPayload(row, profile?.id);
      const { error: insErr } = await supabase.from("leads").insert(payload);
      if (insErr) {
        fail++;
        failReasons.push(`${flat.company_name || flat.contact_name}: ${insErr.message}`);
      } else {
        ok++;
        if (partial.length > 0) partialSimilar++;
        // Add to existing pool so later rows in the same CSV are also checked
        existing.push({ company_name: flat.company_name, contact_name: flat.contact_name, other_notes: { email: flat.email, phone: flat.phone } });
      }
    }

    if (ok > 0) qc.invalidateQueries({ queryKey: ["leads"] });

    if (ok > 0 || exactDups > 0) {
      const parts = [];
      if (ok > 0) parts.push(`${ok} imported`);
      if (exactDups > 0) parts.push(`${exactDups} exact duplicate${exactDups > 1 ? "s" : ""} skipped`);
      if (partialSimilar > 0) parts.push(`${partialSimilar} similar record${partialSimilar > 1 ? "s" : ""} noted`);
      if (fail > 0) parts.push(`${fail} failed`);
      toast.success(`Import complete: ${parts.join(", ")}`, { duration: 5000 });
    } else {
      toast.error(`Import failed: ${failReasons[0] || "unknown error"}`);
    }
    if (failReasons.length > 0) console.warn("[Import] Failed rows:", failReasons);

    if (exactDups > 0 || partialSimilar > 0) {
      setImportSummary({ total: rows.length, ok, exactDups, partialSimilar, fail, exactDupRows });
    }

    e.target.value = "";
  };

  const rawLeads = leadsData?.data || [];
  const teamMembers = teamData?.data || [];

  // Keep selectedLead in sync when its data refreshes in the cache (mirrors Pipeline's pattern)
  const selectedLeadId = selectedLead?.id;
  useEffect(() => {
    if (!selectedLeadId) return;
    const updated = rawLeads.find((l) => l.id === selectedLeadId);
    if (updated) setSelectedLead(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawLeads, selectedLeadId]);

  // Auto-open detail panel when navigated from a notification link (/leads?selected=<id>)
  useEffect(() => {
    const targetId = pendingSelectRef.current;
    if (!targetId || !rawLeads.length) return;
    const match = rawLeads.find((l) => l.id === targetId);
    if (match) {
      setSelectedLead(match);
      pendingSelectRef.current = null;
      setSearchParams({}, { replace: true });
    }
  }, [rawLeads, setSearchParams]);
  const convertedCount = rawLeads.filter((l) => ["converted","won"].includes(l.stage)).length;

  const leads = useMemo(() => {
    let arr = [...rawLeads];
    if (hideConverted && !filterStage.length) arr = arr.filter((l) => !["converted","won"].includes(l.stage));
    if (filterStage.length)    arr = arr.filter((l) => filterStage.includes(l.stage));
    if (filterTemp.length)     arr = arr.filter((l) => filterTemp.includes(l.temperature));
    if (filterLeadId)          arr = arr.filter((l) => {
      const code = l.lead_code || parseJSON(l.other_notes).display_id || "";
      const num  = filterLeadId.replace(/\D/g, "");
      return code.toLowerCase().includes(filterLeadId.toLowerCase()) || (num && code.includes(num));
    });
    if (filterIndustry.length) arr = arr.filter((l) => filterIndustry.includes(parseJSON(l.other_notes).industry));
    if (filterCountry.length)  arr = arr.filter((l) => filterCountry.includes(parseJSON(l.other_notes).country));
    if (filterSource.length)   arr = arr.filter((l) => filterSource.includes(l.source));
    if (filterAssigned.length) arr = arr.filter((l) => filterAssigned.includes(l.assigned_to));
    if (filterDateFrom) arr = arr.filter((l) => l.created_at && new Date(l.created_at) >= new Date(filterDateFrom));
    if (filterDateTo)   arr = arr.filter((l) => l.created_at && new Date(l.created_at) <= new Date(filterDateTo + "T23:59:59"));
    if (filterService.length) arr = arr.filter((l) => {
      const svcs = parseJSON(l.other_notes).services || [];
      return filterService.some((f) => svcs.includes(f));
    });
    switch (sortBy) {
      case "id_asc":        return arr.sort((a, b) => (parseInt((a.lead_code||"").replace(/\D/g,""),10)||0) - (parseInt((b.lead_code||"").replace(/\D/g,""),10)||0));
      case "id_desc":       return arr.sort((a, b) => (parseInt((b.lead_code||"").replace(/\D/g,""),10)||0) - (parseInt((a.lead_code||"").replace(/\D/g,""),10)||0));
      case "created_desc":  return arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      case "created_asc":   return arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      case "company_asc":   return arr.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || ""));
      default: return arr;
    }
  }, [rawLeads, sortBy, hideConverted, filterStage, filterTemp, filterLeadId, filterIndustry, filterCountry, filterSource, filterAssigned, filterDateFrom, filterDateTo, filterService]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const LEADS_PAGE_SIZE = 30;
  const [leadsPage, setLeadsPage] = useState(1);
  useEffect(() => { setLeadsPage(1); }, [filterStage, filterTemp, filterLeadId, filterIndustry, filterCountry, filterSource, filterAssigned, filterDateFrom, filterDateTo, filterService, hideConverted]);
  const leadsTotalPages = Math.ceil(leads.length / LEADS_PAGE_SIZE);
  const pagedLeads = leads.slice((leadsPage - 1) * LEADS_PAGE_SIZE, leadsPage * LEADS_PAGE_SIZE);

  // ── Bulk helpers ──────────────────────────────────────────────────────────
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  const toggleAll   = () => setSelectedIds(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  const toggleOne   = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleBulkAssign = async (userId, userName) => {
    if (!window.confirm(`Assign ${selectedIds.size} lead(s) to ${userName}?`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").update({ assigned_to: userId }).in("id", ids);
    if (error) { toast.error("Bulk assign failed"); return; }
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`Assigned ${ids.length} leads to ${userName}`);
    setSelectedIds(new Set());
  };

  const handleBulkStage = async (stage, label) => {
    if (!window.confirm(`Change ${selectedIds.size} lead(s) to "${label}"?`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").update({ stage }).in("id", ids);
    if (error) { toast.error("Bulk update failed"); return; }
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`${ids.length} leads → ${label}`);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!canDelete) { toast.error("Only Super Admin or Sales Head can delete leads"); return; }
    if (!window.confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").delete().in("id", ids);
    if (error) { toast.error("Bulk delete failed"); return; }
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`Deleted ${ids.length} leads`);
    setSelectedIds(new Set());
    if (profile) {
      notifyManagers(profile.id, profile.full_name, `${ids.length} leads`, null, "Leads Deleted", `${profile.full_name} bulk deleted ${ids.length} lead(s)`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Page Header ── */}
      <div style={{ padding: "14px 24px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em" }}>Leads</h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.12)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.18)" }}>
              {rawLeads.length} total
            </span>
            {leads.length !== rawLeads.length && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(245,158,11,0.1)", color: "#D97706", border: "1px solid rgba(245,158,11,0.2)" }}>
                {leads.length} shown
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            {isSalesHead && (
              <button
                onClick={toggleLock}
                title={phoneEmailLocked ? "Information Locked — click to unlock" : "Information Unlocked — click to lock"}
                className="btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: 6, height: 34, fontSize: 12.5, color: phoneEmailLocked ? "#EF4444" : "var(--text-2)", borderColor: phoneEmailLocked ? "rgba(239,68,68,0.4)" : undefined }}
              >
                {phoneEmailLocked ? <Lock size={13} style={{ color: "#EF4444" }} /> : <LockOpen size={13} style={{ color: "var(--text-muted)" }} />}
                {phoneEmailLocked ? "Information Locked" : "Information Unlocked"}
              </button>
            )}
            {isSalesHead && (
              <button className="btn-secondary" onClick={downloadLeadTemplate} style={{ display: "flex", alignItems: "center", gap: 5, height: 34, fontSize: 12.5 }} title="Download CSV template"><Download size={12} /> Template</button>
            )}
            {isSalesHead && (
              <button className="btn-secondary" onClick={() => setShowBulkImport(true)} style={{ display: "flex", alignItems: "center", gap: 5, height: 34, fontSize: 12.5 }}><Upload size={12} /> Import</button>
            )}
            {isSalesHead && (
              <button className="btn-secondary" onClick={() => { exportLeadsCSV(leads); logExport(profile?.id, "leads", leads.length); }} disabled={!leads.length} style={{ display: "flex", alignItems: "center", gap: 5, height: 34, fontSize: 12.5 }}><Download size={12} /> Export</button>
            )}
            <ColumnToggle allColumns={LEAD_COLUMNS} hiddenSet={hiddenSet} onToggle={toggleColumn} onReset={resetColumns} />
            <TemplateMenu
              templates={templates}
              onSave={saveTemplate}
              onApply={(tpl) => {
                applyTemplate(tpl);
                if (tpl.sort) setSortBy(tpl.sort);
              }}
              onDelete={deleteTemplate}
              currentFilters={{ }}
              currentSort={sortBy}
              canCreate={true}
            />
            {isSalesHead && (
              <button className="btn-primary" onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, height: 34, fontSize: 12.5, flexShrink: 0 }}><Plus size={13} /> Add Lead</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      {leads.length > 0 && <LeadsStatsBar leads={leads} />}

      {/* ── View Filter Tabs + Right Controls ── */}
      <div style={{ padding: "0 24px", display: "flex", alignItems: "center", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        {/* Left: tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { key: "mine", label: "My Leads" },
            { key: "all",  label: "All Leads" },
            { key: "unassigned", label: "Unassigned" },
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

        <div style={{ flex: 1 }} />

        {/* Right: Show Converted + Date range + Sort */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 2 }}>
          {convertedCount > 0 && (
            <button
              className="btn-ghost"
              onClick={() => setHideConverted((v) => !v)}
              style={{ fontSize: 12, height: 32, padding: "0 10px", display: "flex", alignItems: "center", gap: 5, color: hideConverted ? "var(--text-muted)" : "#10B981", border: `1px solid ${hideConverted ? "var(--border)" : "rgba(16,185,129,0.3)"}`, borderRadius: 8, background: hideConverted ? "transparent" : "rgba(16,185,129,0.06)" }}
            >
              <ArrowRightLeft size={11} strokeWidth={2} />
              {hideConverted ? `Show Converted (${convertedCount})` : "Hide Converted"}
            </button>
          )}
          <ArrowUpDown size={12} style={{ color: "var(--text-muted)" }} />
          <select className="crm-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ width: "auto", height: 32, fontSize: 12 }}>
            <option value="id_asc">ID ↑</option>
            <option value="id_desc">ID ↓</option>
            <option value="created_desc">Newest First</option>
            <option value="created_asc">Oldest First</option>
            <option value="company_asc">Company A–Z</option>
          </select>
          <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", marginLeft: 4 }}>{leads.length} leads</span>
        </div>
      </div>

      {/* ── Toolbar (search + service filter) ── */}
      <div style={{ padding: "8px 24px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)" }}>
        {/* Company/contact search */}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="crm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads..." style={{ paddingLeft: 30, height: 34, fontSize: 12.5 }} />
        </div>

        {/* Lead ID search */}
        <div style={{ position: "relative", flex: "0 0 180px" }}>
          <Search size={11} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: filterLeadId ? "var(--accent)" : "var(--text-muted)" }} />
          <input
            className="crm-input"
            value={filterLeadId}
            onChange={(e) => setFilterLeadId(e.target.value)}
            placeholder="Search ID"
            style={{ paddingLeft: 28, height: 34, fontSize: 12, fontFamily: "monospace", borderColor: filterLeadId ? "var(--accent)" : undefined }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* Pagination — left of Date Filter */}
        <ToolbarPagination currentPage={leadsPage} totalPages={leadsTotalPages} onChange={setLeadsPage} />

        {/* Date range (right-aligned) */}
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Date:</span>
        <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="crm-input" style={{ height: 34, fontSize: 12, width: 128 }} title="From date" />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
        <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="crm-input" style={{ height: 34, fontSize: 12, width: 128 }} title="To date" />
        {(filterDateFrom || filterDateTo) && (
          <button type="button" onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: "#EF4444", lineHeight: 1 }}><X size={12} /></button>
        )}
      </div>

      {/* ── Ownership hint for field users ── */}
      {isFieldUser && (
        <div style={{ padding: "7px 24px", background: "rgba(59,130,246,0.05)", borderBottom: "1px solid rgba(59,130,246,0.12)", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3B82F6" }}>
          <UserCheck size={12} /> You can view all leads. You can edit leads assigned to you.
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
        {/* Bulk action bar */}
        <AnimatePresence>
          {selectedIds.size > 0 && canDelete && (
            <BulkActionBar
              count={selectedIds.size}
              teamMembers={teamMembers}
              onAssign={handleBulkAssign}
              onStageChange={handleBulkStage}
              onDelete={handleBulkDelete}
              onClear={() => setSelectedIds(new Set())}
            />
          )}
        </AnimatePresence>

        {isLoading ? (
          <SkeletonTable cols={8} rows={9} hasCheckbox={canDelete} />
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <Users size={40} />
            <h3>No leads yet</h3>
            <p>Use the Add Lead button above to get started, or import a CSV file</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    {canDelete && (
                      <th style={{ width: 36, padding: "10px 8px" }}>
                        <button
                          onClick={toggleAll}
                          style={{ background: "none", border: "none", cursor: "pointer", color: allSelected ? "var(--accent)" : "var(--text-muted)", display: "flex", padding: 0 }}
                        >
                          {allSelected ? <CheckSquare size={14} strokeWidth={2} /> : <Square size={14} strokeWidth={1.75} />}
                        </button>
                      </th>
                    )}
                    {[
                      { key: "id",       label: "LEAD ID",     filterKey: null },
                      { key: "company",  label: "COMPANY",     filterKey: null },
                      { key: "industry", label: "INDUSTRY",    filterKey: "industry", filterOpts: INDUSTRIES.map((i) => ({ value: i, label: i })) },
                      { key: "country",  label: "COUNTRY",     filterKey: "country",  filterOpts: COUNTRIES.map((c) => ({ value: c.code, label: c.name })) },
                      { key: "poc",      label: "POC",         filterKey: null },
                      { key: "source",   label: "SOURCE",      filterKey: "source",   filterOpts: LEAD_SOURCES.map((s) => ({ value: s.key, label: s.label })) },
                      { key: "services", label: "SERVICES",    filterKey: "services", filterOpts: SAP_SERVICES.map((s) => ({ value: s, label: s })) },
                      { key: "website",  label: "WEBSITE",     filterKey: null },
                      { key: "linkedin", label: "LINKEDIN",    filterKey: null },
                      { key: "temp",   label: "LEAD STATUS", filterKey: "temp",   filterOpts: [{ value: "hot", label: "Hot" }, { value: "warm", label: "Warm" }, { value: "cold", label: "Cold" }] },
                      { key: "status", label: "STAGE",       filterKey: "stage",  filterOpts: LEAD_STATUSES.map((s) => ({ value: s.key, label: s.label })) },
                      { key: "date",     label: "DATE ADDED",  filterKey: null },
                      { key: "assigned", label: "ASSIGNED",    filterKey: "assigned", filterOpts: (isOwner || isSalesHead) ? teamMembers.map((m) => ({ value: m.id, label: m.full_name })) : null },
                    ].filter(({ key }) => key === "company" || isVisible(key)).map(({ key, label, filterKey, filterOpts }) => (
                      <th key={key}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          {label}
                          {filterKey && filterOpts && (
                            <ColFilter
                              label={label}
                              options={filterOpts}
                              value={filterKey === "industry" ? filterIndustry : filterKey === "country" ? filterCountry : filterKey === "source" ? filterSource : filterKey === "assigned" ? filterAssigned : filterKey === "temp" ? filterTemp : filterKey === "stage" ? filterStage : filterKey === "services" ? filterService : []}
                              onChange={(v) => {
                                if (filterKey === "industry") setFilterIndustry(v);
                                else if (filterKey === "country") setFilterCountry(v);
                                else if (filterKey === "source") setFilterSource(v);
                                else if (filterKey === "assigned") setFilterAssigned(v);
                                else if (filterKey === "temp") setFilterTemp(v);
                                else if (filterKey === "stage") setFilterStage(v);
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
                  {pagedLeads.map((l, rowIdx) => {
                    const extra      = parseJSON(l.other_notes);
                    const isSelected = selectedIds.has(l.id);
                    const isNew      = l.created_at && (Date.now() - new Date(l.created_at).getTime()) < 7 * 86400000;
                    const isMine     = l.assigned_to === profile?.id || l.created_by === profile?.id;
                    const isUnassigned = !l.assigned_to;
                    const rowBg      = isSelected ? "rgba(37,99,235,0.06)" : isUnassigned ? "rgba(239,68,68,0.03)" : undefined;
                    return (
                      <motion.tr
                        key={l.id}
                        onClick={() => setSelectedLead(l)}
                        style={{ cursor: "pointer", background: rowBg }}
                        whileHover={{ backgroundColor: isSelected ? "rgba(37,99,235,0.09)" : "var(--surface-2)" }}
                      >
                        {canDelete && (
                          <td style={{ width: 36, padding: "10px 8px" }} onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => toggleOne(l.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: isSelected ? "var(--accent)" : "var(--text-muted)", display: "flex", padding: 0 }}
                            >
                              {isSelected ? <CheckSquare size={14} strokeWidth={2} /> : <Square size={14} strokeWidth={1.75} />}
                            </button>
                          </td>
                        )}
                        {isVisible("id") && (
                          <td style={{ whiteSpace: "nowrap" }}>
                            {l.lead_code ? (
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", letterSpacing: "0.01em" }}>
                                {l.lead_code.replace(/^LEAD-?/i, "")}
                              </span>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                          </td>
                        )}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{l.company_name}</div>
                            {isNew && (
                              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "rgba(139,92,246,0.15)", color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "0.05em" }}>NEW</span>
                            )}
                            {l.is_locked && (
                              <Lock size={10} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} title="Record locked" />
                            )}
                            {(!extra.email && !extra.phone) && (
                              <span title="Missing contact detail — Email or Phone required" style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 5, background: "rgba(245,158,11,0.12)", color: "#D97706", border: "1px solid rgba(245,158,11,0.3)" }}>
                                <AlertTriangle size={8} strokeWidth={2.5} /> Invalid
                              </span>
                            )}
                          </div>
                          <EnrichmentDots email={extra.email} phone={extra.phone} linkedin={extra.linkedin_url} />
                        </td>
                        {isVisible("industry") && (
                          <td>
                            {extra.industry ? (
                              <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{extra.industry}</span>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                          </td>
                        )}
                        {isVisible("country") && (
                          <td>
                            {extra.country ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>
                                <img src={countryFlagUrl(extra.country)} alt={extra.country} style={{ width: 22, height: 16, borderRadius: 2, objectFit: "cover", flexShrink: 0, display: "block" }} loading="lazy" />
                                {COUNTRIES.find((c) => c.code === extra.country)?.name || extra.country}
                              </span>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                          </td>
                        )}
                        {isVisible("poc") && (
                          <td>
                            <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500 }}>{l.contact_name || "—"}</div>
                            {l.designation && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.designation}</div>}
                          </td>
                        )}
                        {isVisible("source") && (
                          <td>
                            {l.source ? <SourceBadge source={l.source} plain /> : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                          </td>
                        )}
                        {isVisible("services") && (
                          <td>
                            {(extra.services?.length > 0 || extra.custom_service) ? (
                              <div style={{ fontSize: 11, lineHeight: 1.7 }}>
                                {[...(extra.services || []), ...(extra.custom_service ? [extra.custom_service] : [])].map((svc, i) => (
                                  <div key={svc} style={{ color: ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899","#84CC16"][i % 8] }}>{i + 1}. {svc}</div>
                                ))}
                              </div>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                          </td>
                        )}
                        {isVisible("website") && (
                          <td>
                            {(() => { const w = parseJSON(l.other_notes).website; return w ? (
                              <a href={w.startsWith("http") ? w : `https://${w}`} target="_blank" rel="noopener noreferrer" title={w}
                                onClick={(ev) => ev.stopPropagation()}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#3B82F6", textDecoration: "none" }}>
                                <Globe size={12} strokeWidth={1.75} />
                                <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 20)}{w.replace(/^https?:\/\//, "").length > 20 ? "…" : ""}</span>
                              </a>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>; })()}
                          </td>
                        )}
                        {isVisible("linkedin") && (
                          <td>
                            {(() => { const li = parseJSON(l.other_notes).company_linkedin || parseJSON(l.other_notes).linkedin_url; return li ? (
                              <a href={li} target="_blank" rel="noopener noreferrer" title={li}
                                onClick={(ev) => ev.stopPropagation()}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#0A66C2", textDecoration: "none" }}>
                                <ExternalLink size={11} strokeWidth={2} />
                                <span>View</span>
                              </a>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>; })()}
                          </td>
                        )}
                        {isVisible("temp") && (
                          <td onClick={(ev) => ev.stopPropagation()}>
                            <span style={{ display: "inline-grid" }}>
                              <span style={{ gridArea: "1/1", fontSize: 11, fontWeight: 700, visibility: "hidden", whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none", paddingRight: 2 }}>
                                {l.temperature ? `${l.temperature === "hot" ? "🔥" : l.temperature === "warm" ? "🌡" : "❄️"} ${l.temperature.charAt(0).toUpperCase() + l.temperature.slice(1)}` : "— Status —"}
                              </span>
                              <select
                                value={l.temperature || ""}
                                onChange={(ev) => handleLeadInlineUpdate(l.id, "temperature", ev.target.value || null)}
                                style={{ gridArea: "1/1", width: "100%", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", fontSize: 11, fontWeight: 700, border: "none", padding: 0, background: "transparent", color: l.temperature === "hot" ? "#EF4444" : l.temperature === "warm" ? "#F59E0B" : l.temperature === "cold" ? "#3B82F6" : "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", outline: "none" }}
                              >
                                <option value="">— Status —</option>
                                <option value="hot">🔥 Hot</option>
                                <option value="warm">🌡 Warm</option>
                                <option value="cold">❄️ Cold</option>
                              </select>
                            </span>
                          </td>
                        )}
                        {isVisible("status") && (
                          <td onClick={(ev) => ev.stopPropagation()}>
                            <span style={{ display: "inline-grid" }}>
                              <span style={{ gridArea: "1/1", fontSize: 11, fontWeight: 700, visibility: "hidden", whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none", paddingRight: 2 }}>
                                {LEAD_STATUSES.find((s) => s.key === l.stage)?.label || l.stage || "— Stage —"}
                              </span>
                              <select
                                value={l.stage || ""}
                                onChange={(ev) => handleLeadInlineUpdate(l.id, "stage", ev.target.value)}
                                style={{ gridArea: "1/1", width: "100%", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", fontSize: 11, fontWeight: 700, border: "none", padding: 0, background: "transparent", color: LEAD_STATUSES.find((s) => s.key === l.stage)?.color || "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", outline: "none" }}
                              >
                                {LEAD_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                              </select>
                            </span>
                          </td>
                        )}
                        {isVisible("date") && (
                          <td style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                            {fmt(parseJSON(l.other_notes).lead_created_at || l.created_at)}
                          </td>
                        )}
                        {isVisible("assigned") && (
                          <td>
                            {(() => {
                              const assignedName = l.assigned_profile?.full_name || (isMine ? profile?.full_name : null);
                              const supervisor = extra.supervisor_id
                                ? (teamData?.data || teamData || []).find((m) => m.id === extra.supervisor_id)
                                : null;
                              return (
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  {assignedName ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{assignedName}</span>
                                    </div>
                                  ) : (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "rgba(239,68,68,0.1)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.2)" }}>
                                      Unassigned
                                    </span>
                                  )}
                                  {supervisor && (
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px 2px 5px", borderRadius: 8, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", width: "fit-content" }}>
                                      <Lock size={9} style={{ color: "#D97706", flexShrink: 0 }} />
                                      <span style={{ fontSize: 11, fontWeight: 700, color: "#B45309" }}>{supervisor.full_name}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}
                        <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", alignItems: "center" }}>
                            {(() => {
                              const canEditThis = isSalesHead || l.assigned_to === profile?.id || l.created_by === profile?.id;
                              const isRecordLocked = l.is_locked && !isSalesHead;
                              if (isRecordLocked) {
                                return (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)", padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                                    <Lock size={10} strokeWidth={2} /> Locked
                                  </span>
                                );
                              }
                              return (
                                <>
                                  {/* Convert to Deal: all users */}
                                  <motion.button
                                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 1px 5px rgba(16,185,129,0.28)" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!extra.email && !extra.phone) {
                                        toast.error("Cannot convert — add a contact Email or Phone to this lead first");
                                        return;
                                      }
                                      setConvertLead(l);
                                    }}
                                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}
                                    title={(!extra.email && !extra.phone) ? "Add Email or Phone before converting" : "Convert to Deal"}>
                                    <ArrowRight size={11} /> Deal
                                  </motion.button>
                                  {/* Edit: admin or own record */}
                                  {canEditThis && (
                                    <motion.button className="btn-ghost"
                                      style={{ padding: "4px 7px" }}
                                      onClick={(e) => { e.stopPropagation(); setEditLead(l); }}
                                      whileHover={{ scale: 1.12, color: "var(--accent)" }} whileTap={{ scale: 0.88 }}>
                                      <Pencil size={13} strokeWidth={1.75} />
                                    </motion.button>
                                  )}
                                  {/* Delete: owner/sales_head only */}
                                  {canDelete && (
                                    <motion.button className="btn-ghost"
                                      style={{ padding: "4px 7px", color: "var(--red)" }}
                                      onClick={(e) => handleDelete(e, l)}
                                      whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}>
                                      <Trash2 size={13} strokeWidth={1.75} />
                                    </motion.button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {selectedLead && (
          <LeadDetailPanel
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onEdit={(lead) => { setSelectedLead(null); setEditLead(lead); }}
            onConvert={(lead) => { setSelectedLead(null); setConvertLead(lead); }}
          />
        )}
        {(showForm || editLead) && (
          <LeadModal
            key={editLead?.id || "new"}
            lead={editLead}
            onClose={() => { setShowForm(false); setEditLead(null); }}
            onSave={handleSave}
            teamMembers={teamMembers}
            canEditContactInfo={editLead ? canEditContactInfo : true}
          />
        )}
        {convertLead && (
          <ConvertDealModal lead={convertLead} onClose={() => setConvertLead(null)} />
        )}
        {proposalLead && (
          <ProposalSentModal lead={proposalLead} onClose={() => setProposalLead(null)} />
        )}
        {showBulkImport && (
          <BulkImportLeadsModal
            onClose={() => setShowBulkImport(false)}
            onImport={(rows, assignedTo) => bulkImportMutation.mutate({ rows, assignedTo })}
            loading={bulkImportMutation.isPending}
            isAdminUser={isSalesHead}
            teamMembers={teamMembers}
          />
        )}
      </AnimatePresence>

      {pendingSubStatus && (
        <ContactSubStatusModal
          status={pendingSubStatus.newStatus}
          onConfirm={handleSubStatusConfirm}
          onCancel={handleSubStatusCancel}
        />
      )}
      {pendingDupCreate && (
        <DuplicateCheckModal
          type={pendingDupCreate.type}
          duplicates={pendingDupCreate.duplicates}
          entityType="lead"
          teamMembers={teamMembers}
          onCancel={() => setPendingDupCreate(null)}
          onProceed={handleDupLeadProceed}
          onViewExisting={handleDupLeadViewExisting}
          crossRole={pendingDupCreate.crossRole || false}
        />
      )}
      {importSummary && (
        <ImportSummaryModal summary={importSummary} onClose={() => setImportSummary(null)} />
      )}
    </div>
  );
}

function ImportSummaryModal({ summary, onClose }) {
  const { total, ok, exactDups, partialSimilar, fail, exactDupRows } = summary;

  const downloadReport = () => {
    const headers = ["Company", "Contact", "Email", "Phone", "Matched With", "Reasons"];
    const rows = exactDupRows.map((r) => [r.company, r.contact, r.email, r.phone, r.matchedWith, r.reasons].map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "duplicate_report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--bg-card, #1e1e2e)", border: "1px solid var(--border)", borderRadius: 12, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Import Summary</h3>
        </div>
        <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
          {[
            { label: "Total Rows", value: total, color: "var(--text)" },
            { label: "Imported",   value: ok,    color: "#10B981" },
            { label: "Exact Duplicates Skipped", value: exactDups, color: "#EF4444" },
            { label: "Similar Records Noted",    value: partialSimilar, color: "#F59E0B" },
            { label: "Failed", value: fail, color: fail > 0 ? "#EF4444" : "var(--text-muted)" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 24px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {exactDupRows.length > 0 && (
            <button onClick={downloadReport} className="btn-secondary" style={{ fontSize: 12.5 }}>Download Duplicate Report</button>
          )}
          <button onClick={onClose} className="btn-primary" style={{ fontSize: 13 }}>Done</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
