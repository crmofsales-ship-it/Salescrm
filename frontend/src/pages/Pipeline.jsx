import { useState, useMemo, useEffect, useRef } from "react";
import { COUNTRIES, countryFlagUrl } from "../constants/countries";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { leadsService } from "../services/leadsService";
import { logExport } from "../services/auditService";
import { teamService } from "../services/teamService";
import { changeHistoryService } from "../services/changeHistoryService";
import { ActivityEngine } from "../services/activityEngine";
import PipelineDetailPanel from "../components/PipelineDetailPanel";
import { ContactSubStatusModal } from "../components/ContactSubStatusModal";
import { DuplicateCheckModal } from "../components/DuplicateCheckModal";
import { detectDuplicates, detectExactDuplicates } from "../utils/duplicateCheck";
import { db as supabase } from "../lib/db";
import toast from "react-hot-toast";
import {
  Plus, Search, Pencil, Trash2, X, Star,
  ArrowRightLeft, ArrowRight, ChevronDown, Mail, Phone, Globe, Users, MessageCircle,
  Link2, ExternalLink, ArrowUp, ArrowDown, Building2, CalendarDays,
  Lock, LockOpen, Upload, Download, Filter, CheckCircle2,
  CheckSquare, Square, UserCheck,
} from "lucide-react";

// ── Branded source / contact icon components ────────────────────────────────
// All fill="currentColor" so the parent span's `color` drives the tint.

const LinkedinIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-label="LinkedIn">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const WhatsAppIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-label="WhatsApp">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

// Globe / Website — clean stroke-based (Lucide-style, fills as brand)
const WebsiteIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Website">
    <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

// Email envelope
const EmailIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Email">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>
  </svg>
);

// Phone / Call
const PhoneCallIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Phone">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.07 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.11a16 16 0 0 0 5.8 5.8l1.16-1.16a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z"/>
  </svg>
);

// Referral — people/share
const ReferralIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Referral">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// Calendar / Event
const EventIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Event">
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>
  </svg>
);

// Partner / Building
const PartnerIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Partner">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>
  </svg>
);

// Social Media — share nodes
const SocialMediaIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Social Media">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
  </svg>
);

// Ads / Megaphone
const AdsIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Ads">
    <path d="M3 11l19-9-9 19-2-8-8-2z"/>
  </svg>
);

// Walk-In / MapPin
const WalkInIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Walk-In">
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

// Other / Link
const OtherIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Other">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

// Official Google "G" multicolor logo
const GoogleIcon = ({ size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-label="Google">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────
const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };
const toJSON    = (obj) => JSON.stringify(obj);
const nanoid    = () => Math.random().toString(36).slice(2, 10);

const PIPELINE_STAGES = [
  { key: "new_prospect",       label: "New Prospect",       color: "#6366F1", bg: "rgba(99,102,241,0.08)",   border: "rgba(99,102,241,0.2)"   },
  { key: "attempted_contact",  label: "Attempted Contact",  color: "#F59E0B", bg: "rgba(245,158,11,0.08)",   border: "rgba(245,158,11,0.2)"   },
  { key: "engaged",            label: "Engaged",            color: "#3B82F6", bg: "rgba(59,130,246,0.08)",   border: "rgba(59,130,246,0.2)"   },
  { key: "qualified",          label: "Qualified",          color: "#10B981", bg: "rgba(16,185,129,0.08)",   border: "rgba(16,185,129,0.2)"   },
  { key: "not_interested",     label: "Not Interested",     color: "#6B7280", bg: "rgba(107,114,128,0.06)",  border: "rgba(107,114,128,0.15)" },
];

const CONTACT_TYPES = [
  { key: "linkedin",  label: "LinkedIn",  icon: LinkedinIcon,  color: "#0A66C2", placeholder: "https://linkedin.com/in/..." },
  { key: "email",     label: "Email",     icon: Mail,          color: "#6366F1", placeholder: "name@company.com" },
  { key: "phone",     label: "Phone",     icon: Phone,         color: "#10B981", placeholder: "+91 98765 43210" },
  { key: "whatsapp",  label: "WhatsApp",  icon: WhatsAppIcon,  color: "#25D366", placeholder: "+91 98765 43210" },
  { key: "website",   label: "Website",   icon: Globe,         color: "#3B82F6", placeholder: "https://company.com" },
  { key: "referral",  label: "Referral",  icon: Users,         color: "#8B5CF6", placeholder: "Referred by John Doe" },
  { key: "other",     label: "Other",     icon: Link2,         color: "#6B7280", placeholder: "Any contact detail" },
];

const CONTACT_CONTEXTS = ["Cold Outreach", "Inbound", "Referral", "Event", "Campaign", "Direct"];

const LEAD_SOURCES = [
  { key: "website",        label: "Website" },
  { key: "linkedin",       label: "LinkedIn" },
  { key: "referral",       label: "Referral" },
  { key: "cold_call",      label: "Cold Call" },
  { key: "email_campaign", label: "Email Campaign" },
  { key: "event",          label: "Event / Conference" },
  { key: "partner",        label: "Partner Network" },
  { key: "social_media",   label: "Social Media" },
  { key: "ads",            label: "Ads" },
  { key: "walk_in",        label: "Walk-In" },
  { key: "other",          label: "Others" },
];

const SAP_SERVICES = [
  "SAP Implementation", "SAP Migration ECC→S/4HANA", "SAP Version Upgrade",
  "SAP Resource Augmentation", "Other Project Services",
];

const INDUSTRIES = [
  "Technology", "BFSI", "Healthcare", "Manufacturing", "Retail",
  "Education", "Real Estate", "Telecom", "Energy", "Logistics", "Other",
];


const fmt = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};

const SOURCE_LABELS = {
  website: "Website", linkedin: "LinkedIn", google: "Google", referral: "Referral",
  cold_call: "Cold Call", email_campaign: "Email Campaign",
  event: "Event/Conference", partner: "Partner Network",
  social_media: "Social Media", ads: "Ads", walk_in: "Walk-In", other: "Others",
};

// Country flag emoji from ISO 3166-1 alpha-2 code
const countryFlag = (code) => {
  if (!code || code.length !== 2) return "";
  try {
    return String.fromCodePoint(
      code.toUpperCase().charCodeAt(0) + 0x1F1A5,
      code.toUpperCase().charCodeAt(1) + 0x1F1A5,
    );
  } catch { return ""; }
};

// Source icon + color mapping
const SOURCE_CONFIG = {
  website:        { icon: WebsiteIcon,     color: "#3B82F6" },
  linkedin:       { icon: LinkedinIcon,    color: "#0A66C2" },
  google:         { icon: GoogleIcon,      color: "#4285F4" },
  referral:       { icon: ReferralIcon,    color: "#8B5CF6" },
  cold_call:      { icon: PhoneCallIcon,   color: "#10B981" },
  email_campaign: { icon: EmailIcon,       color: "#EC4899" },
  event:          { icon: EventIcon,       color: "#F59E0B" },
  partner:        { icon: PartnerIcon,     color: "#14B8A6" },
  social_media:   { icon: SocialMediaIcon, color: "#6366F1" },
  ads:            { icon: AdsIcon,         color: "#F97316" },
  walk_in:        { icon: WalkInIcon,      color: "#22C55E" },
  other:          { icon: OtherIcon,       color: "#6B7280" },
};

// Strip "LEAD-" prefix for compact display (e.g. "LEAD-001" → "001")
const fmtCode = (code) => (code ? code.replace(/^LEAD-?/i, "") : "—");

/**
 * Returns true if the pipeline entry has at least one valid contact method
 * (email OR phone/whatsapp) from ANY of the supported storage locations.
 * Used for both UI gating and pre-conversion validation.
 */
function pipelineHasContact(entry) {
  const extra    = parseJSON(entry?.other_notes);
  const contacts = Array.isArray(entry?.contacts) ? entry.contacts : [];

  // 1. Top-level other_notes email / phone
  if (extra.email?.trim())   return true;
  if (extra.phone?.trim())   return true;
  if (extra.whatsapp?.trim()) return true;

  // 2. Contacts array rows typed "email" or "phone"
  if (contacts.some((c) =>
    (c.type === "email" || c.type === "phone" || c.type === "whatsapp") &&
    c.value?.trim()
  )) return true;

  // 3. People-contacts list (POC / additional contacts)
  const people = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
  if (people.some((p) => p?.email?.trim() || p?.phone?.trim())) return true;

  return false;
}

const CONVERSION_BLOCKED_MSG =
  "Lead conversion requires at least one contact method. Please add either a Contact Number or an Email Address before converting this Pipeline record into a Lead.";

export const PIPELINE_TRACKED_FIELDS = ["contact_name", "pipeline_stage", "assigned_to", "company_name"];

const ROLE_DISPLAY = {
  owner: "Super Admin", sales_head: "Sales Head", sales_manager: "Sales Manager",
  employee: "Sales Employee", inside_sales: "Inside Sales Employee",
};
const ROLE_ORDER = ["owner", "admin", "sales_manager", "sales_rep", "sales_rep"];
function groupByRole(members) {
  const groups = {};
  ROLE_ORDER.forEach((r) => { groups[r] = []; });
  members.forEach((m) => { if (groups[m.role]) groups[m.role].push(m); else groups["sales_rep"] = [...(groups["sales_rep"]||[]), m]; });
  return ROLE_ORDER.filter((r) => groups[r]?.length > 0).map((r) => ({ role: r, label: ROLE_DISPLAY[r] || r, members: groups[r] }));
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function ContactTypeIcon({ type, size = 12 }) {
  const ct = CONTACT_TYPES.find((c) => c.key === type);
  if (!ct) return null;
  const Icon = ct.icon;
  return (
    <span title={ct.label} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, background: ct.color + "18", color: ct.color }}>
      <Icon size={size} />
    </span>
  );
}

function StageBadge({ stageKey }) {
  const s = PIPELINE_STAGES.find((x) => x.key === stageKey) || PIPELINE_STAGES[0];
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function Avatar({ name, avatarUrl, size = 24 }) {
  const initials = name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  return avatarUrl ? (
    <img src={avatarUrl} alt={initials} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ─── Contact Method Row (in form) ─────────────────────────────────────────────
function ContactMethodRow({ contact, index, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  const ct   = CONTACT_TYPES.find((c) => c.key === contact.type) || CONTACT_TYPES[0];
  const Icon = ct.icon;
  const isLinkedIn = contact.type === "linkedin";

  return (
    <motion.div layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      style={{ display: "grid", gridTemplateColumns: "140px 1fr 130px auto", gap: 8, alignItems: "start", padding: "10px 12px", background: "var(--surface-2)", borderRadius: 9, border: "1px solid var(--border)" }}>
      <div>
        <select className="crm-input" style={{ height: 34, fontSize: 12, padding: "0 8px" }} value={contact.type} onChange={(e) => onChange(index, "type", e.target.value)}>
          {CONTACT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: ct.color }}>
          <Icon size={12} />
        </div>
        <input className="crm-input" style={{ paddingLeft: 28, height: 34, fontSize: 12 }} placeholder={ct.placeholder} value={contact.value} onChange={(e) => onChange(index, "value", e.target.value)} />
        {isLinkedIn && contact.value && (
          <button type="button" onClick={() => window.open(contact.value, "_blank")} title="Open LinkedIn"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#0A66C2", padding: 2 }}>
            <ExternalLink size={11} />
          </button>
        )}
      </div>
      <div>
        <select className="crm-input" style={{ height: 34, fontSize: 11, padding: "0 6px" }} value={contact.context} onChange={(e) => onChange(index, "context", e.target.value)}>
          <option value="">Context...</option>
          {CONTACT_CONTEXTS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 2, paddingTop: 1 }}>
        <button type="button" onClick={() => onMoveUp(index)} disabled={index === 0}
          style={{ background: "none", border: "none", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.3 : 1, padding: 4, color: "var(--text-muted)" }}><ArrowUp size={11} /></button>
        <button type="button" onClick={() => onMoveDown(index)} disabled={index === total - 1}
          style={{ background: "none", border: "none", cursor: index === total - 1 ? "default" : "pointer", opacity: index === total - 1 ? 0.3 : 1, padding: 4, color: "var(--text-muted)" }}><ArrowDown size={11} /></button>
        <button type="button" onClick={() => onRemove(index)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--red)" }}><X size={12} /></button>
      </div>
    </motion.div>
  );
}

// ─── Pipeline Form Modal ───────────────────────────────────────────────────────
function PipelineFormModal({ entry, onClose, onSave, teamMembers = [], canAssign = false }) {
  const extra = entry ? parseJSON(entry.other_notes) : {};
  const [selectedCountry, setSelectedCountry] = useState(extra.country || "IN");
  const [supervisorId, setSupervisorId] = useState(extra.supervisor_id || "");
  const [selectedServices, setSelectedServices] = useState(extra.services || []);
  const [customService, setCustomService] = useState(extra.custom_service || "");
  const [svcOpen, setSvcOpen] = useState(false);

  // Additional contact methods (LinkedIn, WhatsApp, etc. — not the contact person level)
  const [contacts, setContacts] = useState(() => {
    if (entry?.contacts && Array.isArray(entry.contacts) && entry.contacts.length) {
      return entry.contacts.filter((c) => c.type !== "email" && c.type !== "phone");
    }
    if (extra.linkedin_url) return [{ id: nanoid(), type: "linkedin", value: extra.linkedin_url, context: "" }];
    return [];
  });

  // Multi-person contacts with POC
  const [persons, setPersons] = useState(() => {
    const existing = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
    if (existing.length > 0) return existing;
    return [{
      id: nanoid(),
      name: entry?.contact_name || "",
      designation: entry?.designation || "",
      email: extra.email || "",
      phone: extra.phone || "",
      linkedin_url: extra.contact_linkedin_url || "",
      is_primary: true,
    }];
  });
  const [pocId, setPocId] = useState(() => {
    const existing = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
    const poc = existing.find((p) => p.is_primary);
    return poc?.id || existing[0]?.id || persons[0]?.id || "";
  });

  const addPerson = () => {
    const id = nanoid();
    setPersons((prev) => [...prev, { id, name: "", designation: "", email: "", phone: "", linkedin_url: "", is_primary: false }]);
  };
  const removePerson = (id) => {
    setPersons((prev) => prev.filter((p) => p.id !== id));
    if (pocId === id) setPocId(persons.find((p) => p.id !== id)?.id || "");
  };
  const updatePerson = (id, field, val) => setPersons((prev) => prev.map((p) => p.id === id ? { ...p, [field]: val } : p));

  const addContact    = () => setContacts((p) => [...p, { id: nanoid(), type: "linkedin", value: "", context: "" }]);
  const removeContact = (i) => setContacts((p) => p.filter((_, idx) => idx !== i));
  const moveUp        = (i) => { if (i === 0) return; setContacts((p) => { const a = [...p]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a; }); };
  const moveDown      = (i) => { setContacts((p) => { if (i >= p.length - 1) return p; const a = [...p]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a; }); };
  const changeContact = (i, field, val) => setContacts((p) => p.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  const toggleService = (svc) => setSelectedServices((p) => p.includes(svc) ? p.filter((s) => s !== svc) : [...p, svc]);

  const SectionDivider = ({ label }) => (
    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, margin: "12px 0 4px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text)", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, height: 1.5, background: "var(--border)" }} />
    </div>
  );

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      company_name:     entry?.company_name || "",
      company_number:   extra.company_number || "",
      website:          extra.website || "",
      company_linkedin: extra.company_linkedin || "",
      industry:         extra.industry || "",
      source:           entry?.source || extra.source || "",
      custom_source:    extra.custom_source || "",
      remarks:          entry?.remarks || "",
      assigned_to:      entry?.assigned_to || "",
      follow_up_date:   entry?.follow_up_date ? entry.follow_up_date.slice(0, 10) : "",
      pipeline_stage:   entry?.pipeline_stage || "new_prospect",
      city:             extra.city || "",
      state:            extra.state || "",
    },
  });

  const watchSource = watch("source");

  const handleSave = async (formData) => {
    if (selectedServices.includes("Other Project Services") && !customService.trim()) {
      toast.error("Please describe the custom / other service before saving.");
      return;
    }
    const filledPersons = persons.filter((p) => p.name?.trim());
    const activePoc = filledPersons.find((p) => p.id === pocId) || filledPersons[0] || {};
    const personsWithFlag = filledPersons.map((p) => ({ ...p, is_primary: p.id === (activePoc.id || pocId) }));
    const linkedInContact = contacts.find((c) => c.type === "linkedin");
    await onSave({
      company_name:   formData.company_name,
      contact_name:   activePoc.name?.trim() || "",
      designation:    activePoc.designation || null,
      source:         formData.source || null,
      remarks:        formData.remarks,
      stage:          "pipeline",
      pipeline_stage: formData.pipeline_stage,
      assigned_to:    formData.assigned_to || null,
      follow_up_date: formData.follow_up_date || null,
      email:          activePoc.email || null,
      phone:          activePoc.phone || null,
      contacts,
      other_notes: toJSON({
        email:                activePoc.email || "",
        phone:                activePoc.phone || "",
        people_contacts:      personsWithFlag,
        country:              selectedCountry,
        city:                 formData.city || "",
        state:                formData.state || "",
        company_number:       formData.company_number || "",
        website:              formData.website || "",
        company_linkedin:     formData.company_linkedin || "",
        linkedin_url:         linkedInContact?.value || "",
        contact_linkedin_url: activePoc.linkedin_url || "",
        industry:             formData.industry || "",
        custom_source:        formData.source === "other" ? formData.custom_source : "",
        services:             selectedServices,
        custom_service:       selectedServices.includes("Other Project Services") ? customService : "",
        contact_locked:       true,
        supervisor_id:        supervisorId || null,
      }),
    });
  };

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ type: "spring", damping: 22, stiffness: 280 }} style={{ maxWidth: 880, maxHeight: "93vh", overflowY: "auto" }}>

        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              {entry ? "Edit Prospect" : "Add Prospect"}
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
              Add what you have — contact info can be completed later
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(handleSave)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* ── 1. Company Information ── */}
            <SectionDivider label="1 · Company Information" />
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Company Name <span style={{ color: "#EF4444" }}>*</span></label>
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
              <label className="crm-label">Headquarters Country</label>
              <select className="crm-input" value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)}>
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

            {/* ── 2. Company Presence ── */}
            <SectionDivider label="2 · Company Presence" />
            <div>
              <label className="crm-label">Company Website</label>
              <input className="crm-input" {...register("website")} placeholder="https://company.com" />
            </div>
            <div>
              <label className="crm-label">Company LinkedIn</label>
              <input className="crm-input" {...register("company_linkedin")} placeholder="https://linkedin.com/company/..." />
            </div>

            {/* ── 3. Contact Person (POC) ── */}
            <SectionDivider label="3 · Contact Person (POC)" />
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
                Optional — add contact details now or complete later. Mark one person as the primary <strong>POC</strong>.
              </div>
              {persons.map((p) => (
                <div key={p.id} style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: `1.5px solid ${pocId === p.id ? "rgba(139,92,246,0.4)" : "var(--border)"}`, marginBottom: 10, position: "relative" }}>
                  {pocId === p.id && (
                    <div style={{ position: "absolute", top: 10, right: 12, fontSize: 10.5, fontWeight: 800, color: "#8B5CF6", display: "flex", alignItems: "center", gap: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      <Star size={10} fill="#8B5CF6" strokeWidth={0} /> POC
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <label className="crm-label">Name</label>
                      <input className="crm-input" value={p.name} onChange={(e) => updatePerson(p.id, "name", e.target.value)} placeholder="John Doe" />
                    </div>
                    <div>
                      <label className="crm-label">Designation</label>
                      <input className="crm-input" value={p.designation} onChange={(e) => updatePerson(p.id, "designation", e.target.value)} placeholder="CTO / Director" />
                    </div>
                    <div>
                      <label className="crm-label">Email</label>
                      <input className="crm-input" type="email" value={p.email} onChange={(e) => updatePerson(p.id, "email", e.target.value)} placeholder="contact@company.com" />
                    </div>
                    <div>
                      <label className="crm-label">Phone</label>
                      <div style={{ display: "flex", gap: 5 }}>
                        <select className="crm-input" value={p.dial || "+91"} onChange={(e) => updatePerson(p.id, "dial", e.target.value)} style={{ height: 40, width: 150, padding: "0 6px", flexShrink: 0 }}>
                          {COUNTRIES.map((c) => <option key={c.code} value={c.dial}>{c.name} ({c.dial})</option>)}
                        </select>
                        <input className="crm-input" value={p.phone} onChange={(e) => updatePerson(p.id, "phone", e.target.value)} placeholder="9876543210" />
                      </div>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="crm-label">Contact LinkedIn URL</label>
                      <input className="crm-input" type="url" value={p.linkedin_url || ""} onChange={(e) => updatePerson(p.id, "linkedin_url", e.target.value)} onBlur={(e) => { const n = normalizeLinkedInUrl(e.target.value); if (n !== (p.linkedin_url || "")) updatePerson(p.id, "linkedin_url", n); }} placeholder="https://linkedin.com/in/username" />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
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
                <Plus size={12} /> Add Another Contact
              </button>
            </div>

            {/* ── 4. SAP Services Required ── */}
            <SectionDivider label="4 · SAP Services Required" />
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label" style={{ marginBottom: 6 }}>Select all applicable services</label>
              <div style={{ position: "relative" }}>
                <button type="button" onClick={() => setSvcOpen((v) => !v)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: "var(--r-sm)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: selectedServices.length ? "var(--text)" : "var(--text-muted)" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>
                    {selectedServices.length ? selectedServices.join(", ") : "Select services..."}
                  </span>
                  <ChevronDown size={14} style={{ color: "var(--text-muted)", flexShrink: 0, transform: svcOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </button>
                <AnimatePresence>
                  {svcOpen && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
                      style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-lg)", padding: "4px 0" }}>
                      {SAP_SERVICES.map((svc) => {
                        const checked = selectedServices.includes(svc);
                        return (
                          <label key={svc} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", fontSize: 13, color: checked ? "var(--accent)" : "var(--text-2)", fontWeight: checked ? 600 : 400 }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleService(svc)} style={{ accentColor: "var(--accent)", width: 14, height: 14, flexShrink: 0 }} />
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

            {/* ── 5. Lead Details ── */}
            <SectionDivider label="5 · Lead Details" />
            <div>
              <label className="crm-label">Source</label>
              <select className="crm-input" {...register("source")}>
                <option value="">Select source</option>
                {LEAD_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Pipeline Stage</label>
              <select className="crm-input" {...register("pipeline_stage")}>
                {PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            {watchSource === "other" && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="crm-label">Custom Source</label>
                <input className="crm-input" {...register("custom_source")} placeholder="Describe the source..." />
              </div>
            )}
            <div>
              <label className="crm-label">Follow-up Date</label>
              <input className="crm-input" type="date" {...register("follow_up_date")} />
            </div>

            {/* ── 6. Assignment ── */}
            <SectionDivider label="6 · Assignment" />
            {canAssign && teamMembers.length > 0 ? (
              <div>
                <label className="crm-label">Assign To</label>
                <select className="crm-input" {...register("assigned_to")}>
                  <option value="">Unassigned</option>
                  {groupByRole(teamMembers).map(({ role, label, members }) => (
                    <optgroup key={role} label={label}>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name} ({ROLE_DISPLAY[m.role] || m.role})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            ) : entry?.assigned_to ? (
              <div>
                <label className="crm-label">Assigned To</label>
                <div style={{ fontSize: 13.5, color: "var(--text)", padding: "7px 0" }}>
                  {teamMembers.find((m) => m.id === entry.assigned_to)?.full_name || "—"}
                </div>
              </div>
            ) : null}
            {canAssign && (() => {
              const supervisorMembers = teamMembers.filter((m) => ["owner", "admin"].includes(m.role));
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
            <div style={{ gridColumn: (canAssign && teamMembers.length > 0) || entry?.assigned_to ? undefined : "1 / -1" }}>
              <label className="crm-label">Remarks / Notes</label>
              <textarea className="crm-input" {...register("remarks")} rows={3} placeholder="Notes, context, next steps..." style={{ resize: "vertical" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : entry ? "Save Changes" : "Add Prospect"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}

// ─── Convert Modal ─────────────────────────────────────────────────────────────
function ConvertModal({ entry, onClose, onConfirm, loading }) {
  const extra        = parseJSON(entry?.other_notes);
  const contactCount = entry?.contacts?.length || 0;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ type: "spring", damping: 22, stiffness: 280 }} style={{ maxWidth: 400 }}>
        <div style={{ padding: "20px 24px 24px" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <ArrowRightLeft size={20} style={{ color: "#10B981" }} />
          </div>
          <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Move Prospect to Leads</h2>
          <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text)" }}>{entry?.company_name}</strong> will be moved to the <strong style={{ color: "#10B981" }}>Leads</strong> section and removed from the Pipeline table.
          </p>
          <div style={{ padding: "10px 14px", background: "var(--surface-2)", borderRadius: 9, border: "1px solid var(--border)", marginBottom: 8, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 5 }}>
            {contactCount > 0 && <div style={{ color: "var(--text-2)" }}><span style={{ color: "var(--text-muted)" }}>Contact methods:</span> {contactCount} saved</div>}
            {extra.email && <div style={{ color: "var(--text-2)" }}><span style={{ color: "var(--text-muted)" }}>Email:</span> {extra.email}</div>}
            {extra.phone && <div style={{ color: "var(--text-2)" }}><span style={{ color: "var(--text-muted)" }}>Phone:</span> {extra.phone}</div>}
          </div>
          <div style={{ padding: "8px 10px", background: "rgba(239,68,68,0.05)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.18)", marginBottom: 18, fontSize: 12, color: "#DC2626", display: "flex", gap: 6, alignItems: "flex-start" }}>
            <ArrowRightLeft size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            This action moves the record — it will no longer appear in Pipeline.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button onClick={onConfirm} disabled={loading} className="btn-primary" style={{ background: "#10B981", borderColor: "#10B981" }}>
              {loading ? "Moving…" : "Move to Leads"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Column Filter Dropdown (multi-select + search) ───────────────────────────
function ColFilter({ label, value = [], options, onChange }) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
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
          {/* Header + search */}
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
          {/* Options list */}
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

// ─── Column definitions ────────────────────────────────────────────────────────
const ALL_COLS = [
  { key: "id",       label: "ID"          },
  { key: "company",  label: "Company"     },
  { key: "industry", label: "Industry"    },
  { key: "country",  label: "Country"     },
  { key: "poc",      label: "POC"         },
  { key: "source",   label: "Source"      },
  { key: "services", label: "Services"    },
  { key: "website",  label: "Website"     },
  { key: "linkedin", label: "LinkedIn"    },
  { key: "stage",    label: "Stage"       },
  { key: "assigned", label: "Assigned To" },
  { key: "date",     label: "Date Added"  },
];
const LS_COL_KEY = "pipeline_visible_cols_v1";
const DEFAULT_COLS = ALL_COLS.map((c) => c.key);

function ColsToggle({ visible, onChange, userId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const saveKey = userId ? `pipeline_visible_cols_${userId}_v1` : LS_COL_KEY;

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = (key) => {
    const next = visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key];
    onChange(next);
    try { localStorage.setItem(saveKey, JSON.stringify(next)); } catch {}
  };

  return (
    <span ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 12px", borderRadius: 8, background: visible.length < ALL_COLS.length ? "rgba(99,102,241,0.1)" : "var(--surface-2)", border: `1px solid ${visible.length < ALL_COLS.length ? "rgba(99,102,241,0.3)" : "var(--border)"}`, fontSize: 12.5, color: visible.length < ALL_COLS.length ? "#6366F1" : "var(--text-2)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
        <Filter size={12} strokeWidth={2} />
        Columns {visible.length < ALL_COLS.length ? `(${visible.length}/${ALL_COLS.length})` : ""}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 400, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.18)", minWidth: 180, padding: "6px 0" }}
          onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: "5px 12px 7px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <span>Visible Columns</span>
            <button type="button" onClick={() => { onChange(DEFAULT_COLS); try { localStorage.removeItem(saveKey); } catch {} }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--accent)", fontFamily: "inherit", fontWeight: 700 }}>
              Reset
            </button>
          </div>
          {ALL_COLS.map((col) => (
            <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", cursor: "pointer", fontSize: 13, color: visible.includes(col.key) ? "var(--text)" : "var(--text-muted)", fontWeight: visible.includes(col.key) ? 600 : 400 }}>
              <input type="checkbox" checked={visible.includes(col.key)} onChange={() => toggle(col.key)}
                style={{ accentColor: "var(--accent)", width: 13, height: 13, flexShrink: 0, cursor: "pointer" }} />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </span>
  );
}

// ─── Toolbar Pagination (compact, lives inline in the filter bar) ─────────────
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

// ─── Main Pipeline Page ────────────────────────────────────────────────────────
// ── CSV helpers ───────────────────────────────────────────────────────────────
const CSV_TEMPLATE_HEADERS = ["Company Name","Contact Name","Designation","Pipeline Stage","Source","Industry","Headquarters Country","Headquarters State","Headquarters City","Contact LinkedIn URL","Email","Phone","Website","Notes"];
const CSV_TEMPLATE_ROW     = ["Acme Corp","Jane Doe","Director","new_prospect","linkedin","Technology","India","Maharashtra","Mumbai","https://linkedin.com/in/janedoe","jane@acme.com","+91 9876543210","https://acme.com","Interested in SAP"];

function downloadCSVTemplate() {
  const rows = [CSV_TEMPLATE_HEADERS, CSV_TEMPLATE_ROW];
  const csv  = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a    = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "pipeline_template.csv" });
  a.click(); URL.revokeObjectURL(a.href);
}

function exportPipelineCSV(entries) {
  const headers = ["Company","Contact","Designation","Stage","Source","Industry","Email","Phone","Website","Added Date","Assigned To"];
  const rows    = entries.map((e) => {
    const extra = parseJSON(e.other_notes);
    return [
      e.company_name || "", e.contact_name || "", e.designation || "",
      e.pipeline_stage || "new_prospect", e.source || "", extra.industry || "",
      extra.email || "", extra.phone || "", extra.website || "",
      e.created_at ? new Date(e.created_at).toLocaleDateString() : "",
      e.assigned_profile?.full_name || "",
    ];
  });
  const csv  = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a    = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `pipeline_export_${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
}

function parseCSVLine(line) {
  const vals = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1, val = "";
      while (j < line.length) {
        if (line[j] === '"' && line[j + 1] === '"') { val += '"'; j += 2; }
        else if (line[j] === '"') { j++; break; }
        else { val += line[j++]; }
      }
      vals.push(val.trim());
      if (line[j] === ',') j++;
      i = j;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { vals.push(line.slice(i).trim()); break; }
      vals.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  if (line.endsWith(',')) vals.push('');
  return vals;
}

function parseCSVRows(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const vals = parseCSVLine(line);
    const row  = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  }).filter((r) => r.company_name);
}

// ─── BulkImportModal ──────────────────────────────────────────────────────────
const phoneRe  = /^[\d\s+\-().]{6,20}$/;
function validateRow(row) {
  const errs = [];
  if (row.phone && !phoneRe.test(row.phone.trim())) errs.push("Invalid phone");
  return errs;
}

function normalizeSource(raw) {
  if (!raw || !raw.trim()) return null;
  const lower = raw.trim().toLowerCase();
  const slug  = lower.replace(/[\s\-/]+/g, "_");
  const byKey = LEAD_SOURCES.find((x) => x.key === lower || x.key === slug);
  if (byKey) return byKey.key;
  const byLabel = LEAD_SOURCES.find((x) => x.label.toLowerCase() === lower);
  if (byLabel) return byLabel.key;
  const aliases = {
    "cold_calling":"cold_call","cold calling":"cold_call","cold-call":"cold_call","cold-calling":"cold_call",
    "email campaigns":"email_campaign","email_campaigns":"email_campaign",
    "social":"social_media","social media":"social_media","social_media_ads":"social_media",
    "ad":"ads","advertisement":"ads","paid ads":"ads","google":"ads","google ads":"ads",
    "walk-in":"walk_in","walk in":"walk_in",
    "partner network":"partner","partners":"partner",
    "event / conference":"event","events":"event","conference":"event","exhibition":"event","trade show":"event",
    "ref":"referral","referred":"referral","word of mouth":"referral",
    "web":"website","organic":"website",
    "call":"cold_call","phone call":"cold_call",
    "email":"email_campaign","newsletter":"email_campaign",
  };
  return aliases[lower] ?? null;
}

function normalizePipelineStage(raw) {
  if (!raw || !raw.trim()) return "new_prospect";
  const lower = raw.trim().toLowerCase();
  const slug  = lower.replace(/[\s\-]+/g, "_");
  const byKey = PIPELINE_STAGES.find((x) => x.key === lower || x.key === slug);
  if (byKey) return byKey.key;
  const byLabel = PIPELINE_STAGES.find((x) => x.label.toLowerCase() === lower);
  if (byLabel) return byLabel.key;
  const aliases = {
    "new":"new_prospect","prospect":"new_prospect","new prospect":"new_prospect","fresh":"new_prospect",
    "attempted":"attempted_contact","attempt":"attempted_contact","attempted contact":"attempted_contact",
    "contacted":"attempted_contact","in progress":"attempted_contact",
    "engage":"engaged","in contact":"engaged","active":"engaged",
    "qualify":"qualified","interested":"qualified",
    "not interested":"not_interested","not_interested":"not_interested",
    "disqualified":"not_interested","closed_lost":"not_interested","dead":"not_interested",
  };
  return aliases[lower] ?? "new_prospect";
}

function normalizeLinkedInUrl(raw) {
  if (!raw || !raw.trim()) return "";
  const v = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.)?linkedin\.com/i.test(v)) return `https://${v}`;
  const slug = v.replace(/^@/, "").replace(/^\//, "");
  return `https://linkedin.com/in/${slug}`;
}

// ── Multi-contact CSV support ───────────────────────────────────────────────
// Contact-related columns may hold semicolon-separated values to describe more
// than one contact for the same company row, mapped positionally. Contact Name
// is the anchor field — its value count sets the number of contact slots.
// Designation/Email/Phone/LinkedIn are optional per contact: a shorter list (or
// an entirely blank column) just leaves those positions empty; only a LONGER
// list than Contact Name's is a real mismatch (there'd be no slot to map it to).
const CONTACT_FIELD_LABELS = { name: "Contact Name", designation: "Designation", email: "Email", phone: "Phone", linkedin: "LinkedIn URL" };
const OPTIONAL_CONTACT_FIELDS = ["designation", "email", "phone", "linkedin"];

function splitContactField(raw) {
  if (!raw || !raw.trim()) return null;
  return raw.split(";").map((s) => s.trim());
}

// Returns { contacts, error }. `contacts` is the people_contacts array (position 0 is
// always the Primary Contact / POC), matching today's single-contact shape exactly when
// no semicolons are present.
function buildContactsFromRow(r) {
  const fields = {
    name:        splitContactField(r.contact_name),
    designation: splitContactField(r.designation),
    email:       splitContactField(r.email),
    phone:       splitContactField(r.phone),
    linkedin:    splitContactField(r.contact_linkedin_url),
  };

  const names = fields.name || [];
  const count = names.length; // Contact Name is the anchor field

  const overflow = OPTIONAL_CONTACT_FIELDS.filter((k) => fields[k] && fields[k].length > count);
  if (overflow.length) {
    const detail = overflow.map((k) => `${CONTACT_FIELD_LABELS[k]}: ${fields[k].length} value(s) vs Contact Name: ${count}`).join(", ");
    return { contacts: [], error: `Some contact fields have more semicolon-separated values than Contact Name, so they can't be mapped to a contact (${detail}).` };
  }

  const contacts = [];
  for (let i = 0; i < count; i++) {
    const name  = names[i]           || "";
    const email = fields.email?.[i]  || "";
    const phone = fields.phone?.[i]  || "";
    if (!name && !email && !phone) continue; // fully blank slot (e.g. a stray ";;") — skip without failing the row
    contacts.push({
      id:           `${Date.now()}-${Math.random()}-${i}`,
      name,
      designation:  fields.designation?.[i] || "",
      email,
      phone,
      linkedin_url: fields.linkedin?.[i] || "",
      is_primary:   contacts.length === 0,
    });
  }
  return { contacts, error: null };
}

const ROLE_BADGE = { owner: "Super Admin", sales_head: "Sales Head", sales_manager: "Sales Manager", employee: "Sales Executive", inside_sales: "Inside Sales" };

function BulkImportModal({ onClose, onImport, loading, isAdminUser, teamMembers = [], importResult, onResultDone }) {
  const [preview,    setPreview]    = useState(null);
  const [error,      setError]      = useState("");
  const [assignToId, setAssignToId] = useState(""); // "" = unassigned (admin default)

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Only CSV files are allowed."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("File too large. Maximum size is 5 MB."); return; }
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSVRows(ev.target.result);
      if (!rows.length) { setError("No valid rows found. Ensure Company Name column is present."); return; }
      setPreview(rows);
    };
    reader.readAsText(file);
  };

  const assignedMember = teamMembers.find((m) => m.id === assignToId);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 16, width: 780, maxWidth: "95vw", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.28)" }}>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Bulk Import Prospects</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Upload a CSV file — review rows before importing</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}><X size={18} /></button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>

          {/* ── Assignment Section ── */}
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
                      {m.full_name}{m.role ? ` (${ROLE_BADGE[m.role] || m.role})` : ""}
                    </option>
                  ))}
                </select>
                {assignedMember ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.22)" }}>
                    <CheckCircle2 size={12} strokeWidth={2.5} />
                    All {preview?.length ? `${preview.length} ` : ""}leads → {assignedMember.full_name}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                    No assignee selected — leads will be unassigned
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", marginBottom: 16, fontSize: 12.5, color: "#6366F1", fontWeight: 600 }}>
              <Users size={13} strokeWidth={2} />
              All imported leads will be automatically assigned to you
            </div>
          )}

          {/* ── File picker ── */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <Upload size={14} /> Choose CSV
              <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
            </label>
            <button onClick={downloadCSVTemplate} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit" }}>
              <Download size={13} /> Download Template
            </button>
          </div>

          {error && <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", color: "#EF4444", fontSize: 13, marginBottom: 14 }}>{error}</div>}

          {importResult && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981", fontSize: 12.5, fontWeight: 700 }}>
                  ✓ {importResult.imported} Imported Successfully
                </span>
                {importResult.failed.length > 0 && (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", color: "#EF4444", fontSize: 12.5, fontWeight: 700 }}>
                    ✕ {importResult.failed.length} Failed
                  </span>
                )}
              </div>
              {importResult.failed.length > 0 && (
                <div style={{ borderRadius: 10, border: "1px solid rgba(239,68,68,0.2)", overflow: "hidden" }}>
                  <div style={{ background: "rgba(239,68,68,0.06)", padding: "8px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#EF4444", borderBottom: "1px solid rgba(239,68,68,0.15)" }}>
                    Failed Rows — Review &amp; Fix
                  </div>
                  {importResult.failed.map(({ rowNum, company, reason }) => (
                    <div key={rowNum} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 10, padding: "8px 14px", borderBottom: "1px solid rgba(239,68,68,0.08)", fontSize: 12.5, alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.08)", padding: "2px 6px", borderRadius: 4, textAlign: "center" }}>Row {rowNum}</span>
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{company}</span>
                      <span style={{ color: "#EF4444", fontSize: 11.5 }}>{reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!importResult && preview && (() => {
            const errCount = preview.filter((r) => validateRow(r).length > 0).length;
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{preview.length} row{preview.length !== 1 ? "s" : ""} ready to import</span>
                  {errCount > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>{errCount} validation warning{errCount !== 1 ? "s" : ""}</span>}
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)" }}>IDs auto-assigned</span>
                  {/* Assignment summary badge */}
                  {isAdminUser && assignedMember && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.22)" }}>
                      Assigned → {assignedMember.full_name}
                    </span>
                  )}
                  {!isAdminUser && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)" }}>
                      Auto-assigned to you
                    </span>
                  )}
                </div>
                <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-2)" }}>
                        {["Lead ID","Company","Contact","Stage","Country","Industry","Phone"].map((h) => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 50).map((row, idx) => {
                        const errs = validateRow(row);
                        return (
                          <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: errs.length ? "rgba(239,68,68,0.03)" : undefined }}>
                            <td style={{ padding: "7px 12px" }}>
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#6366F1", fontFamily: "monospace", background: "rgba(99,102,241,0.08)", padding: "2px 6px", borderRadius: 4 }}>auto</span>
                            </td>
                            <td style={{ padding: "7px 12px", color: "var(--text)", fontWeight: 600 }}>{row.company_name || "—"}</td>
                            <td style={{ padding: "7px 12px", color: "var(--text-2)" }}>{row.contact_name || "—"}</td>
                            <td style={{ padding: "7px 12px", color: "var(--text-2)" }}>{row.pipeline_stage || "new_prospect"}</td>
                            <td style={{ padding: "7px 12px", color: "var(--text-2)" }}>
                              {(row.headquarters_country || row.country) ? (() => {
                                const raw = (row.headquarters_country || row.country).trim();
                                const match = COUNTRIES.find((c) => c.code.toLowerCase() === raw.toLowerCase() || c.name.toLowerCase() === raw.toLowerCase());
                                return match ? match.name : raw;
                              })() : "—"}
                            </td>
                            <td style={{ padding: "7px 12px", color: "var(--text-2)" }}>{row.industry || "—"}</td>
                            <td style={{ padding: "7px 12px" }}>
                              {row.phone ? (
                                <span style={{ color: phoneRe.test(row.phone.trim()) ? "var(--text-2)" : "#EF4444", fontWeight: phoneRe.test(row.phone.trim()) ? 400 : 600 }}>
                                  {row.phone}
                                  {!phoneRe.test(row.phone.trim()) && <span style={{ fontSize: 10, marginLeft: 4 }}>✕</span>}
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {preview.length > 50 && (
                        <tr><td colSpan={7} style={{ padding: "7px 12px", color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>…and {preview.length - 50} more rows</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>

        {/* footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          {importResult ? (
            <button onClick={onResultDone} style={{ padding: "8px 24px", borderRadius: 9, background: "var(--accent)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button
                disabled={!preview || loading}
                onClick={() => onImport(preview, assignToId)}
                style={{ padding: "8px 20px", borderRadius: 9, background: preview ? "var(--accent)" : "var(--surface-2)", color: preview ? "#fff" : "var(--text-muted)", border: "none", fontSize: 13, fontWeight: 700, cursor: preview ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                {loading ? "Importing…" : `Import ${preview?.length || 0} Prospect${(preview?.length || 0) !== 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Pipeline Bulk Action Bar ────────────────────────────────────────────────
function PipelineBulkActionBar({ count, teamMembers = [], isAdmin, onAssign, onStageChange, onDelete, onConvert, onLock, onUnlock, onClear }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [stageOpen,  setStageOpen]  = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "8px 16px", background: "rgba(99,102,241,0.08)",
        border: "1px solid rgba(99,102,241,0.22)", borderRadius: 10, marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: "#6366F1" }}>{count} selected</span>
      <div style={{ flex: 1 }} />

      {/* Assign to — admin only */}
      {isAdmin && (
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
                    <div style={{ padding: "5px 14px 3px", fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                    {members.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { onAssign(m.id, m.full_name); setAssignOpen(false); }}
                        style={{ display: "block", width: "100%", padding: "7px 14px 7px 20px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--text-2)" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        {m.full_name}
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 5 }}>({ROLE_DISPLAY[m.role] || m.role})</span>
                      </button>
                    ))}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Set Pipeline Stage */}
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
                padding: "4px 0", minWidth: 170,
              }}
            >
              {PIPELINE_STAGES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => { onStageChange(s.key, s.label); setStageOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 14px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontSize: 13, color: s.color }}
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

      {/* Lock / Unlock — admin only */}
      {isAdmin && (
        <>
          <button
            className="btn-secondary"
            style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12, color: "#F59E0B", borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.07)", fontWeight: 600 }}
            onClick={onLock}
          >
            <Lock size={12} /> Lock
          </button>
          <button
            className="btn-secondary"
            style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12, color: "#10B981", borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.07)", fontWeight: 600 }}
            onClick={onUnlock}
          >
            <LockOpen size={12} /> Unlock
          </button>
        </>
      )}

      {/* Convert to Lead */}
      <button
        className="btn-secondary"
        style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12, color: "#10B981", borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.07)", fontWeight: 700 }}
        onClick={onConvert}
      >
        <ArrowRight size={12} /> Lead
      </button>

      {/* Delete */}
      <button
        className="btn-secondary"
        style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12, color: "#EF4444", borderColor: "#EF444440" }}
        onClick={onDelete}
      >
        <Trash2 size={12} /> Delete
      </button>

      {/* Clear */}
      <button className="btn-ghost" style={{ height: 32, padding: "0 10px", fontSize: 12, color: "var(--text-muted)" }} onClick={onClear}>
        <X size={12} />
      </button>
    </motion.div>
  );
}

export default function Pipeline() {
  const { profile, isFieldUser, isSalesHead, isOwner } = useAuth();
  const canDelete = isSalesHead; // Only owner + sales_head can delete
  const qc = useQueryClient();
  const navigate = useNavigate();

  // ── Bulk selection ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toggleOne = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleBulkAssign = async (userId, userName) => {
    if (!window.confirm(`Assign ${selectedIds.size} prospect(s) to ${userName}?`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").update({ assigned_to: userId }).in("id", ids);
    if (error) { toast.error("Bulk assign failed"); return; }
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    toast.success(`Assigned ${ids.length} prospects to ${userName}`);
    setSelectedIds(new Set());
  };

  const handleBulkStage = async (stage, label) => {
    if (!window.confirm(`Change ${selectedIds.size} prospect(s) to "${label}"?`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").update({ pipeline_stage: stage }).in("id", ids);
    if (error) { toast.error("Bulk update failed"); return; }
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    toast.success(`${ids.length} prospects → ${label}`);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!canDelete) { toast.error("No permission to delete"); return; }
    if (!window.confirm(`Delete ${selectedIds.size} prospect(s)? This cannot be undone.`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").delete().in("id", ids);
    if (error) { toast.error("Bulk delete failed"); return; }
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    toast.success(`Deleted ${ids.length} prospects`);
    setSelectedIds(new Set());
  };

  const handleBulkLock = async () => {
    if (!window.confirm(`Lock ${selectedIds.size} prospect(s)? Contact info will be hidden from non-admin users.`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").update({ is_locked: true }).in("id", ids);
    if (error) { toast.error("Bulk lock failed"); return; }
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`${ids.length} prospect${ids.length !== 1 ? "s" : ""} locked`);
    setSelectedIds(new Set());
  };

  const handleBulkUnlock = async () => {
    if (!window.confirm(`Unlock ${selectedIds.size} prospect(s)? Contact info will become visible to all users.`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").update({ is_locked: false }).in("id", ids);
    if (error) { toast.error("Bulk unlock failed"); return; }
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`${ids.length} prospect${ids.length !== 1 ? "s" : ""} unlocked`);
    setSelectedIds(new Set());
  };

  const handleBulkConvert = async () => {
    const ids = [...selectedIds];

    // Validate contact info for every selected record before converting
    const selected      = filteredEntries.filter((e) => ids.includes(e.id));
    const validEntries  = selected.filter((e) =>  pipelineHasContact(e));
    const blocked       = selected.filter((e) => !pipelineHasContact(e));

    if (blocked.length > 0 && validEntries.length === 0) {
      // All selected records are missing contact info — block entirely
      toast.error(
        `Cannot convert: all ${blocked.length} selected prospect(s) are missing both Contact Number and Email Address. ${CONVERSION_BLOCKED_MSG}`,
        { duration: 7000 }
      );
      return;
    }

    if (blocked.length > 0) {
      // Some are valid, some are not — ask user what to do
      const names = blocked.slice(0, 3).map((e) => e.company_name || "Unnamed").join(", ");
      const more  = blocked.length > 3 ? ` and ${blocked.length - 3} more` : "";
      const proceed = window.confirm(
        `${blocked.length} prospect(s) cannot be converted because they are missing both Contact Number and Email Address:\n\n${names}${more}\n\nConvert only the ${validEntries.length} prospect(s) that have contact information?`
      );
      if (!proceed) return;
    } else {
      if (!window.confirm(`Convert ${validEntries.length} prospect(s) to Leads? They will move to the Leads section.`)) return;
    }

    const validIds = validEntries.map((e) => e.id);
    const { error } = await supabase
      .from("leads")
      .update({ stage: "new", updated_at: new Date().toISOString() })
      .in("id", validIds);
    if (error) { toast.error("Bulk convert failed: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`${validIds.length} prospect(s) converted to Leads`);
    setSelectedIds(new Set());
    navigate("/leads");
  };

  // ── Global pipeline lock ──────────────────────────────────────────────────
  const { data: pipelineLockSetting, refetch: refetchPipelineLock } = useQuery({
    queryKey: ["crm-setting-pipeline-lock"],
    queryFn: async () => {
      const { data } = await supabase.from("crm_settings").select("value").eq("key", "pipeline_lock").single();
      return data?.value === "true";
    },
    staleTime: 60000,
  });
  const pipelineLocked = pipelineLockSetting ?? false;
  const togglePipelineLock = async () => {
    const next = !pipelineLocked;
    const newVal = next.toString();
    await supabase.from("crm_settings").upsert({ key: "pipeline_lock", value: newVal, updated_by: profile?.id, updated_at: new Date().toISOString() });
    await supabase.from("leads").update({ is_locked: next }).eq("stage", "pipeline");
    await refetchPipelineLock();
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    toast.success(next ? "All pipeline records locked" : "All pipeline records unlocked");
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm,       setShowForm]       = useState(false);
  const [editEntry,      setEditEntry]      = useState(null);
  const [convertEntry,   setConvertEntry]   = useState(null);
  const [selectedEntry,  setSelectedEntry]  = useState(null);
  const [pendingSubStatus, setPendingSubStatus] = useState(null); // { entryId, newStage, prevStage }
  const [pendingDupCreate, setPendingDupCreate] = useState(null); // { payload, duplicates, type }
  const [search,          setSearch]          = useState("");
  const [filterStage,     setFilterStage]     = useState([]);
  const [filterIndustry,  setFilterIndustry]  = useState([]);
  const [filterCountry,   setFilterCountry]   = useState([]);
  const [filterSource,    setFilterSource]    = useState([]);
  const [filterAssigned,  setFilterAssigned]  = useState([]);
  const [filterDateFrom,  setFilterDateFrom]  = useState("");
  const [filterDateTo,    setFilterDateTo]    = useState("");
  const [filterService,   setFilterService]   = useState([]);
  const [filterMissingContact, setFilterMissingContact] = useState(false);
  const [leadIdSearch,    setLeadIdSearch]    = useState("");
  const [visibleCols,     setVisibleCols]     = useState(() => { try { const s = localStorage.getItem(LS_COL_KEY); return s ? JSON.parse(s) : DEFAULT_COLS; } catch { return DEFAULT_COLS; } });
  // Load user-specific column prefs when profile becomes available
  useEffect(() => {
    if (!profile?.id) return;
    const userKey = `pipeline_visible_cols_${profile.id}_v1`;
    try { const s = localStorage.getItem(userKey); if (s) setVisibleCols(JSON.parse(s)); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);
  const [sortBy,          setSortBy]          = useState("lead_code");
  const [sortDir,         setSortDir]         = useState("asc");
  const [showImport,      setShowImport]      = useState(false);
  const [importResult,    setImportResult]    = useState(null);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setShowForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);


  const toggleSort = (col) => {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const { data: pipelineData, isLoading } = useQuery({
    queryKey: ["pipeline", search],
    queryFn:  () => leadsService.getPipelineEntries({ search }),
  });

  const { data: teamData } = useQuery({
    queryKey: ["team-all"],
    queryFn:  () => teamService.getAll(),
  });

  // Count of leads created per pipeline entry (pipeline_id grouping)
  const { data: leadsCountMap = {} } = useQuery({
    queryKey: ["pipeline-leads-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("pipeline_id")
        .not("pipeline_id", "is", null)
        .neq("stage", "pipeline");
      const map = {};
      (data || []).forEach((r) => { if (r.pipeline_id) map[r.pipeline_id] = (map[r.pipeline_id] || 0) + 1; });
      return map;
    },
    staleTime: 30000,
  });

  const allEntries = useMemo(() => pipelineData?.data || [], [pipelineData]);

  // Keep selectedEntry in sync when its data refreshes in the cache
  const selectedEntryId = selectedEntry?.id;
  useEffect(() => {
    if (!selectedEntryId) return;
    const updated = allEntries.find((e) => e.id === selectedEntryId);
    if (updated) setSelectedEntry(updated);
  }, [allEntries, selectedEntryId]);

  // Open a specific entry when ?entry=<id> is in the URL (e.g. from Dashboard Open button)
  useEffect(() => {
    const entryId = searchParams.get("entry");
    if (!entryId || !allEntries.length) return;
    const entry = allEntries.find((e) => e.id === entryId);
    if (entry) {
      setSelectedEntry(entry);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, allEntries, setSearchParams]);


  const filteredEntries = useMemo(() => {
    let rows = filterStage.length
      ? allEntries.filter((e) => filterStage.includes(e.pipeline_stage || "new_prospect"))
      : [...allEntries];

    // Lead ID search — partial match anywhere in code: "1", "12", "123", "lead-", "LEAD-001"
    if (leadIdSearch.trim()) {
      const q = leadIdSearch.trim().toLowerCase();
      rows = rows.filter((e) => (e.lead_code || "").toLowerCase().includes(q));
    }

    if (filterIndustry.length) rows = rows.filter((e) => filterIndustry.includes(parseJSON(e.other_notes).industry));
    if (filterCountry.length)  rows = rows.filter((e) => filterCountry.includes(parseJSON(e.other_notes).country));
    if (filterSource.length)   rows = rows.filter((e) => filterSource.includes(e.source || parseJSON(e.other_notes).source));
    if (filterAssigned.length) rows = rows.filter((e) => filterAssigned.includes(e.assigned_to));
    if (filterDateFrom) rows = rows.filter((e) => e.created_at && new Date(e.created_at) >= new Date(filterDateFrom));
    if (filterDateTo)   rows = rows.filter((e) => e.created_at && new Date(e.created_at) <= new Date(filterDateTo + "T23:59:59"));
    if (filterService.length) rows = rows.filter((e) => {
      const svcs = parseJSON(e.other_notes).services || [];
      return filterService.some((f) => svcs.includes(f));
    });
    if (filterMissingContact) rows = rows.filter((e) => !pipelineHasContact(e));

    rows.sort((a, b) => {
      let av, bv;
      if (sortBy === "lead_code") {
        av = parseInt((a.lead_code || "").replace(/\D/g, ""), 10) || 0;
        bv = parseInt((b.lead_code || "").replace(/\D/g, ""), 10) || 0;
        return sortDir === "asc" ? av - bv : bv - av;
      }
      if (sortBy === "company_name") { av = (a.company_name || "").toLowerCase(); bv = (b.company_name || "").toLowerCase(); }
      else if (sortBy === "pipeline_stage") { av = a.pipeline_stage || ""; bv = b.pipeline_stage || ""; }
      else if (sortBy === "assigned") { av = (a.assigned_profile?.full_name || "").toLowerCase(); bv = (b.assigned_profile?.full_name || "").toLowerCase(); }
      else { av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [allEntries, filterStage, filterIndustry, filterCountry, filterSource, filterAssigned, filterDateFrom, filterDateTo, filterService, filterMissingContact, sortBy, sortDir, leadIdSearch]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const PIPELINE_PAGE_SIZE = 30;
  const [pipelinePage, setPipelinePage] = useState(1);
  useEffect(() => { setPipelinePage(1); }, [filterStage, filterIndustry, filterCountry, filterSource, filterAssigned, filterDateFrom, filterDateTo, filterService, filterMissingContact, leadIdSearch]);
  const pipelineTotalPages = Math.ceil(filteredEntries.length / PIPELINE_PAGE_SIZE);
  const pagedEntries = filteredEntries.slice((pipelinePage - 1) * PIPELINE_PAGE_SIZE, pipelinePage * PIPELINE_PAGE_SIZE);

  const allSelected = filteredEntries.length > 0 && selectedIds.size === filteredEntries.length;
  const toggleAll   = () => setSelectedIds(allSelected ? new Set() : new Set(filteredEntries.map((e) => e.id)));

  const entriesByStage = useMemo(() => {
    const map = {};
    PIPELINE_STAGES.forEach((s) => { map[s.key] = []; });
    allEntries.forEach((e) => {
      const key = e.pipeline_stage || "new_prospect";
      if (map[key]) map[key].push(e);
    });
    return map;
  }, [allEntries]);

  const totalCount = pipelineData?.count || 0;
  const readyCount = allEntries.filter(pipelineHasContact).length;

  const createMutation = useMutation({
    mutationFn: (data) => leadsService.create({ ...data, created_by: profile?.id, is_locked: false, assigned_to: data.assigned_to || profile?.id }),
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      toast.success("Prospect added!");
      setShowForm(false);
      ActivityEngine.prospectCreated({ userId: profile?.id, leadId: lead?.id, company: lead?.company_name });
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkImportMutation = useMutation({
    mutationFn: async ({ rows, assignedTo }) => {
      const { supabase: sb } = await import("../supabaseClient");
      let imported = 0;
      const failed = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];

        const { contacts, error: contactErr } = buildContactsFromRow(r);
        if (contactErr) {
          failed.push({ rowNum: i + 2, company: r.company_name || `Row ${i + 2}`, reason: contactErr });
          continue;
        }
        const primary = contacts[0] || null;

        const record = {
          stage:          "pipeline",
          company_name:   r.company_name,
          contact_name:   primary?.name        || "",
          designation:    primary?.designation || null,
          pipeline_stage: normalizePipelineStage(r.pipeline_stage),
          source:         normalizeSource(r.source),
          assigned_to:    assignedTo       || profile?.id,
          created_by:     profile?.id,
          is_locked:      false,
          other_notes: JSON.stringify({
            email:                primary?.email        || "",
            phone:                primary?.phone        || "",
            website:              r.website  || "",
            industry:             r.industry || "",
            country: (() => {
              const raw = (r.headquarters_country || r.country || "").trim();
              if (!raw) return "";
              const byCode = COUNTRIES.find((c) => c.code.toLowerCase() === raw.toLowerCase());
              if (byCode) return byCode.code;
              const byName = COUNTRIES.find((c) => c.name.toLowerCase() === raw.toLowerCase());
              return byName ? byName.code : raw;
            })(),
            state:                r.headquarters_state || r.state || "",
            city:                 r.headquarters_city  || r.city  || "",
            contact_linkedin_url: primary?.linkedin_url || "",
            notes:                r.notes    || "",
            people_contacts:      contacts,
            // CSV-imported records must stay editable immediately (unlike the manual
            // Add Prospect form, which intentionally locks contact editing on creation)
            // so the assigned user can complete/fix data right away — no separate
            // "Unlock" step required. This only affects contact_locked, not is_locked
            // (the row-level Lock/Unlock button), which CSV import never touches.
            contact_locked:       false,
          }),
        };
        const { error } = await sb.from("leads").insert([record]);
        if (error) {
          failed.push({ rowNum: i + 2, company: r.company_name || `Row ${i + 2}`, reason: error.message });
        } else {
          imported++;
        }
      }
      return { imported, failed };
    },
    onSuccess: ({ imported, failed }) => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      setImportResult({ imported, failed });
      if (failed.length === 0) {
        toast.success(`${imported} prospect${imported !== 1 ? "s" : ""} imported!`);
        setShowImport(false);
        setImportResult(null);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const lockMutation = useMutation({
    mutationFn: (id) => leadsService.lockRecord(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["pipeline"] }); qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Record locked"); },
    onError:    (e) => toast.error(e.message),
  });

  const unlockMutation = useMutation({
    mutationFn: (id) => leadsService.unlockRecord(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["pipeline"] }); qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Record unlocked"); },
    onError:    (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => leadsService.update(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      toast.success("Prospect updated");
      setEditEntry(null);
      ActivityEngine.prospectUpdated({ userId: profile?.id, leadId: vars?.id, company: vars?.company_name });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: leadsService.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["my-pending-activities"] });
      qc.invalidateQueries({ queryKey: ["my-completed-activities"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-activity"] });
      toast.success("Prospect removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const PIPELINE_SUB_STATUS_KEYS = new Set(["attempted_contact", "engaged"]);

  const handleInlineUpdate = async (id, field, value, subStatusReason = null, subStatusRemarks = null) => {
    const entry = allEntries.find((e) => e.id === id);

    // Intercept sub-status pipeline stage changes
    if (field === "pipeline_stage" && PIPELINE_SUB_STATUS_KEYS.has(value) && !subStatusReason) {
      setPendingSubStatus({ entryId: id, newStage: value, prevStage: entry?.pipeline_stage });
      return;
    }

    // Include sub-status in other_notes when applicable
    let updatePayload = { [field]: value, updated_at: new Date().toISOString() };
    if (field === "pipeline_stage" && PIPELINE_SUB_STATUS_KEYS.has(value) && subStatusReason) {
      const prevExtra = (() => { try { return entry?.other_notes ? JSON.parse(entry.other_notes) : {}; } catch { return {}; } })();
      updatePayload.other_notes = JSON.stringify({
        ...prevExtra,
        contact_sub_status: { reason: subStatusReason, remarks: subStatusRemarks || null, updated_at: new Date().toISOString() },
      });
    }

    const { error } = await supabase.from("leads").update(updatePayload).eq("id", id);
    if (error) {
      toast.error("Update failed");
    } else {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      if (field === "pipeline_stage") {
        ActivityEngine.pipelineStageChanged({ userId: profile?.id, leadId: id, company: entry?.company_name, oldStage: entry?.pipeline_stage, newStage: value, userName: profile?.full_name });
      } else if (field === "source") {
        ActivityEngine.pipelineSourceChanged({ userId: profile?.id, leadId: id, company: entry?.company_name, oldSource: entry?.source, newSource: value, userName: profile?.full_name });
      } else if (field === "assigned_to") {
        ActivityEngine.leadAssigned({ userId: profile?.id, leadId: id, company: entry?.company_name });
      }
    }
  };

  const handlePipelineSubStatusConfirm = (reason, remarks) => {
    if (!pendingSubStatus) return;
    handleInlineUpdate(pendingSubStatus.entryId, "pipeline_stage", pendingSubStatus.newStage, reason, remarks);
    setPendingSubStatus(null);
  };

  const convertMutation = useMutation({
    mutationFn: (entry) => leadsService.convertPipelineToLead(entry),
    onSuccess: (lead) => {
      changeHistoryService.logConversion({
        entityId:  lead.id,
        fromStage: "pipeline",
        toStage:   "lead",
        userId:    profile?.id,
      });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["pipeline-leads-counts"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`${lead.company_name} moved to Leads`);
      setConvertEntry(null);
      setSelectedEntry(null);
      ActivityEngine.prospectConverted({ userId: profile?.id, leadId: lead?.id, company: lead?.company_name });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (data) => {
    if (editEntry) {
      await updateMutation.mutateAsync({ id: editEntry.id, ...data });
      changeHistoryService.logDiff({
        entityType:     "pipeline",
        entityId:       editEntry.id,
        oldRecord:      editEntry,
        newRecord:      data,
        userId:         profile?.id,
        trackedFields:  PIPELINE_TRACKED_FIELDS,
      });
    } else {
      // 1. Strict exact check against visible records (shows record details)
      const exactMatches = detectExactDuplicates(data, allEntries, { notesKey: "other_notes", phoneKey: "phone" });
      if (exactMatches.length > 0) {
        setPendingDupCreate({ payload: data, duplicates: exactMatches, type: "exact" });
        return;
      }
      // 2. Cross-role backend check — catches duplicates in records the user can't see
      const dupCheck = await leadsService.checkDuplicate(data);
      if (dupCheck.duplicate) {
        setPendingDupCreate({ payload: data, duplicates: [], type: "exact", crossRole: true });
        return;
      }
      // 3. Score-based partial/similar warning
      const { partial } = detectDuplicates(data, allEntries, { notesKey: "other_notes", phoneKey: "phone" });
      if (partial.length > 0) {
        setPendingDupCreate({ payload: data, duplicates: partial, type: "partial" });
        return;
      }
      // lead_code is assigned by the database trigger (fn_set_lead_code) on INSERT
      await createMutation.mutateAsync(data);
    }
  };

  const handleDupPipelineProceed = async () => {
    const { payload } = pendingDupCreate;
    setPendingDupCreate(null);
    await createMutation.mutateAsync(payload);
  };

  const handleDupPipelineViewExisting = (record) => {
    setPendingDupCreate(null);
    setShowForm(false);
    setEditEntry(null);
    setSelectedEntry(record);
  };

  const handleConvertClick = (e) => {
    if (!pipelineHasContact(e)) {
      toast.error(CONVERSION_BLOCKED_MSG, { duration: 6000 });
      return;
    }
    setConvertEntry(e);
  };

  const handleDeleteConfirm = (e) => {
    if (window.confirm(`Delete ${e.company_name}?`)) deleteMutation.mutate(e.id);
  };

  const teamMembers = teamData?.data || teamData || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>

      {/* ── Header ── */}
      <div style={{ padding: "14px 24px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em" }}>Pre-Sales Pipeline</h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.12)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.18)" }}>
              {totalCount} total
            </span>
            {filteredEntries.length !== totalCount && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(245,158,11,0.1)", color: "#D97706", border: "1px solid rgba(245,158,11,0.2)" }}>
                {filteredEntries.length} shown
              </span>
            )}
            {readyCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.2)" }}>
                {readyCount} ready to convert
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            {(isOwner || isSalesHead) && (
              <button
                onClick={togglePipelineLock}
                title={pipelineLocked ? "Information Locked — click to unlock" : "Information Unlocked — click to lock"}
                className="btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: 6, height: 34, fontSize: 12.5, color: pipelineLocked ? "#EF4444" : "var(--text-2)", borderColor: pipelineLocked ? "rgba(239,68,68,0.4)" : undefined }}
              >
                {pipelineLocked ? <Lock size={13} style={{ color: "#EF4444" }} /> : <LockOpen size={13} style={{ color: "var(--text-muted)" }} />}
                {pipelineLocked ? "Information Locked" : "Information Unlocked"}
              </button>
            )}
            <button onClick={downloadCSVTemplate} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: 5, height: 34, fontSize: 12.5 }} title="Download CSV import template">
              <Download size={12} /> Template
            </button>
            <button onClick={() => setShowImport(true)} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: 5, height: 34, fontSize: 12.5 }}>
              <Upload size={12} /> Import
            </button>
            {isSalesHead && (
              <button onClick={() => { exportPipelineCSV(filteredEntries); logExport(profile?.id, "pipeline", filteredEntries.length); }} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: 5, height: 34, fontSize: 12.5 }}>
                <Download size={12} /> Export
              </button>
            )}
            <ColsToggle visible={visibleCols} onChange={setVisibleCols} userId={profile?.id} />
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, height: 34, fontSize: 12.5, flexShrink: 0 }}>
              <Plus size={13} /> Add Prospect
            </button>
          </div>
        </div>

        {/* Stage filter strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, borderTop: "1px solid var(--border)", marginTop: 2 }}>
          {PIPELINE_STAGES.map((s, i) => (
            <button key={s.key} onClick={() => setFilterStage((prev) => prev.includes(s.key) ? prev.filter((k) => k !== s.key) : [...prev, s.key])}
              style={{ display: "flex", alignItems: "baseline", gap: 5, padding: "8px 14px", flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: filterStage.includes(s.key) ? `2px solid ${s.color}` : "2px solid transparent", ...(i > 0 ? { borderLeft: "1px solid var(--border)" } : {}) }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: filterStage.includes(s.key) ? s.color : "var(--text)", letterSpacing: "-0.03em" }}>
                {entriesByStage[s.key]?.length || 0}
              </span>
              <span style={{ fontSize: 11, color: filterStage.includes(s.key) ? s.color : "var(--text-muted)" }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="crm-input" style={{ paddingLeft: 32, height: 34, fontSize: 13 }} placeholder="Search company, contact..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ position: "relative", flex: "0 0 180px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: leadIdSearch ? "var(--accent)" : "var(--text-muted)" }} />
          <input className="crm-input" style={{ paddingLeft: 32, height: 34, fontSize: 12, fontFamily: "monospace", borderColor: leadIdSearch ? "var(--accent)" : undefined }} placeholder="Search ID" value={leadIdSearch} onChange={(e) => setLeadIdSearch(e.target.value)} title="Search by ID — accepts LEAD-0012, LEAD-12, or just 12" />
        </div>
        {/* Source dropdown filter */}
        <select
          className="crm-input"
          style={{ height: 34, fontSize: 12, width: "auto", minWidth: 0, paddingLeft: 10, paddingRight: 28 }}
          value={filterSource.length === 1 ? filterSource[0] : ""}
          onChange={(e) => setFilterSource(e.target.value ? [e.target.value] : [])}
          title="Filter by Source"
        >
          <option value="">All Sources</option>
          {LEAD_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {/* Missing Contact Information toggle — no phone/email on primary or any additional contact */}
        <button
          type="button"
          onClick={() => setFilterMissingContact((v) => !v)}
          title="Show only records with no Contact Number and no Email Address for any contact"
          className={filterMissingContact ? "" : "btn-secondary"}
          style={{
            height: 34, fontSize: 12, display: "flex", alignItems: "center", gap: 5, padding: "0 12px",
            borderRadius: 8, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            ...(filterMissingContact
              ? { background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)", fontWeight: 700 }
              : {}),
          }}
        >
          <Filter size={12} /> Missing Contact Information
        </button>
        {(search || leadIdSearch || filterStage.length || filterIndustry.length || filterCountry.length || filterSource.length || filterService.length || filterAssigned.length || filterDateFrom || filterDateTo || filterMissingContact) && (
          <button className="btn-secondary" style={{ height: 34, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }} onClick={() => { setSearch(""); setLeadIdSearch(""); setFilterStage([]); setFilterIndustry([]); setFilterCountry([]); setFilterSource([]); setFilterService([]); setFilterAssigned([]); setFilterDateFrom(""); setFilterDateTo(""); setFilterMissingContact(false); }}>
            <X size={12} /> Clear Filters
          </button>
        )}
        {/* Pagination + Date range — right-aligned */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
          <ToolbarPagination currentPage={pipelinePage} totalPages={pipelineTotalPages} onChange={setPipelinePage} />
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Date:</span>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="crm-input" style={{ height: 34, fontSize: 12, width: 136 }} title="From date" />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="crm-input" style={{ height: 34, fontSize: 12, width: 136 }} title="To date" />
          </div>
        </div>
        {(filterStage.length || filterIndustry.length || filterCountry.length || filterSource.length || filterAssigned.length || filterDateFrom || filterDateTo || filterMissingContact) && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", width: "100%", paddingTop: 4 }}>
            {filterMissingContact && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Missing Contact Information<button type="button" onClick={() => setFilterMissingContact(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#EF4444", lineHeight: 1 }}><X size={9} /></button></span>}
            {filterStage.map((key) => { const s = PIPELINE_STAGES.find((x) => x.key === key); return <span key={key} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Stage: {s?.label || key}<button type="button" onClick={() => setFilterStage((p) => p.filter((k) => k !== key))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>; })}
            {filterIndustry.map((v) => <span key={v} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Industry: {v}<button type="button" onClick={() => setFilterIndustry((p) => p.filter((x) => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>)}
            {filterCountry.map((v) => { const c = COUNTRIES.find((x) => x.code === v); return <span key={v} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Country: {c?.name || v}<button type="button" onClick={() => setFilterCountry((p) => p.filter((x) => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>; })}
            {filterSource.map((v) => { const s = LEAD_SOURCES.find((x) => x.key === v); return <span key={v} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Source: {s?.label || v}<button type="button" onClick={() => setFilterSource((p) => p.filter((x) => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>; })}
            {filterAssigned.map((v) => { const m = teamMembers.find((x) => x.id === v); return <span key={v} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>Assigned: {m?.full_name || "User"}<button type="button" onClick={() => setFilterAssigned((p) => p.filter((x) => x !== v))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>; })}
            {filterDateFrom && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>From: {filterDateFrom}<button type="button" onClick={() => setFilterDateFrom("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>}
            {filterDateTo && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 4 }}>To: {filterDateTo}<button type="button" onClick={() => setFilterDateTo("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", lineHeight: 1 }}><X size={9} /></button></span>}
          </div>
        )}
      </div>

      {/* Field user info banner */}
      {isFieldUser && (
        <div style={{ padding: "7px 24px", background: "rgba(59,130,246,0.05)", borderBottom: "1px solid rgba(59,130,246,0.12)", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3B82F6" }}>
          You can view all prospects. You can edit prospects assigned to you.
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>

        {/* Bulk action bar */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <PipelineBulkActionBar
              count={selectedIds.size}
              teamMembers={teamMembers}
              isAdmin={isOwner || isSalesHead}
              onAssign={handleBulkAssign}
              onStageChange={handleBulkStage}
              onDelete={handleBulkDelete}
              onConvert={handleBulkConvert}
              onLock={handleBulkLock}
              onUnlock={handleBulkUnlock}
              onClear={() => setSelectedIds(new Set())}
            />
          )}
        </AnimatePresence>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite" }} />
          </div>
        ) : !filteredEntries.length ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Building2 size={26} style={{ color: "#6366F1" }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>No prospects found</div>
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add First Prospect</button>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden", marginTop: 12 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead style={{ position: "sticky", top: 0, zIndex: 4, background: "var(--surface)" }}>
                  <tr>
                    {/* Checkbox select-all — admin only */}
                    {isSalesHead && (
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
                      { colKey: "id",       label: "ID",          col: "lead_code",      filterKey: null         },
                      { colKey: "company",  label: "COMPANY",     col: "company_name",   filterKey: null         },
                      { colKey: "industry", label: "INDUSTRY",    col: null,             filterKey: "industry",  filterOpts: INDUSTRIES.map((i) => ({ value: i, label: i })) },
                      { colKey: "country",  label: "COUNTRY",     col: null,             filterKey: "country",   filterOpts: COUNTRIES.map((c) => ({ value: c.code, label: c.name })) },
                      { colKey: "poc",      label: "POC",         col: null,             filterKey: null         },
                      { colKey: "source",   label: "SOURCE",      col: null,             filterKey: "source",    filterOpts: LEAD_SOURCES.map((s) => ({ value: s.key, label: s.label })) },
                      { colKey: "services", label: "SERVICES",    col: null,             filterKey: "services",  filterOpts: SAP_SERVICES.map((s) => ({ value: s, label: s })) },
                      { colKey: "website",  label: "WEBSITE",     col: null,             filterKey: null         },
                      { colKey: "linkedin", label: "LINKEDIN",    col: null,             filterKey: null         },
                      { colKey: "stage",    label: "STAGE",       col: "pipeline_stage", filterKey: "stage",     filterOpts: PIPELINE_STAGES.map((s) => ({ value: s.key, label: s.label })) },
                      { colKey: "assigned", label: "ASSIGNED TO", col: "assigned",       filterKey: "assigned",  filterOpts: (isOwner || isSalesHead) ? teamMembers.map((m) => ({ value: m.id, label: m.full_name })) : null },
                      { colKey: "date",     label: "DATE ADDED",  col: "created_at",     filterKey: null         },
                    ].filter(({ colKey }) => visibleCols.includes(colKey)).map(({ colKey, label, col, filterKey, filterOpts }) => (
                      <th
                        key={colKey}
                        onClick={col ? () => toggleSort(col) : undefined}
                        style={{ cursor: col ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          {label}
                          {col && (
                            <span style={{ display: "inline-flex", flexDirection: "column", gap: 1, opacity: sortBy === col ? 1 : 0.3 }}>
                              <ArrowUp   size={8} strokeWidth={2.5} style={{ color: sortBy === col && sortDir === "asc"  ? "var(--accent)" : "currentColor" }} />
                              <ArrowDown size={8} strokeWidth={2.5} style={{ color: sortBy === col && sortDir === "desc" ? "var(--accent)" : "currentColor" }} />
                            </span>
                          )}
                          {filterKey && filterOpts && (
                            <ColFilter
                              label={label}
                              options={filterOpts}
                              value={filterKey === "industry" ? filterIndustry : filterKey === "country" ? filterCountry : filterKey === "source" ? filterSource : filterKey === "assigned" ? filterAssigned : filterKey === "stage" ? filterStage : filterKey === "services" ? filterService : []}
                              onChange={(v) => {
                                if (filterKey === "industry") setFilterIndustry(v);
                                else if (filterKey === "country") setFilterCountry(v);
                                else if (filterKey === "source") setFilterSource(v);
                                else if (filterKey === "assigned") setFilterAssigned(v);
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
                  <AnimatePresence initial={false}>
                    {pagedEntries.map((e, i) => {
                      const extra      = parseJSON(e.other_notes);
                      const contacts   = Array.isArray(e.contacts) ? e.contacts : [];
                      const uniqueTypes = [...new Set(contacts.map((c) => c.type))];
                      const hasContact  = pipelineHasContact(e);
                      const isSelected  = selectedEntry?.id === e.id;
                      const isBulkSelected = selectedIds.has(e.id);
                      return (
                        <motion.tr
                          key={e.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ delay: i * 0.02, duration: 0.16 }}
                          onClick={() => setSelectedEntry(isSelected ? null : e)}
                          style={{
                            cursor: "pointer",
                            background: isBulkSelected ? "rgba(99,102,241,0.06)" : isSelected ? "var(--surface-2)" : undefined,
                            borderLeft: isSelected ? "3px solid var(--accent)" : isBulkSelected ? "3px solid rgba(99,102,241,0.5)" : "3px solid transparent",
                          }}
                        >
                          {/* Row checkbox — admin only */}
                          {isSalesHead && (
                            <td style={{ width: 36, padding: "10px 8px" }} onClick={(ev) => ev.stopPropagation()}>
                              <button
                                onClick={() => toggleOne(e.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: isBulkSelected ? "var(--accent)" : "var(--text-muted)", display: "flex", padding: 0 }}
                              >
                                {isBulkSelected ? <CheckSquare size={14} strokeWidth={2} /> : <Square size={14} strokeWidth={1.75} />}
                              </button>
                            </td>
                          )}
                          {visibleCols.includes("id") && (
                          <td style={{ whiteSpace: "nowrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", letterSpacing: "0.01em" }}>
                              {fmtCode(e.lead_code)}
                            </span>
                          </td>
                          )}
                          {visibleCols.includes("company") && (
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{e.company_name || "—"}</span>
                              {e.is_locked && <Lock size={10} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} title="Record locked" />}
                            </div>
                            {!hasContact && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                                ⚠ Missing Contact Info
                              </span>
                            )}
                            {leadsCountMap[e.id] > 0 && (
                              <span style={{ display: "inline-block", marginTop: 3, fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.22)" }}>
                                {leadsCountMap[e.id]} lead{leadsCountMap[e.id] !== 1 ? "s" : ""} created
                              </span>
                            )}
                            {extra.website && (
                              <a href={extra.website} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
                                style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
                                {extra.website.replace(/^https?:\/\//, "").slice(0, 28)}
                              </a>
                            )}
                            {extra.company_number && (
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{extra.company_number}</div>
                            )}
                          </td>
                          )}
                          {visibleCols.includes("industry") && (
                          <td>
                            {extra.industry ? (
                              <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{extra.industry}</span>
                            ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                          </td>
                          )}
                          {visibleCols.includes("country") && (
                          <td>
                            {extra.country ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>
                                <img src={countryFlagUrl(extra.country)} alt={extra.country} style={{ width: 22, height: 16, borderRadius: 2, objectFit: "cover", flexShrink: 0, display: "block" }} loading="lazy" />
                                {COUNTRIES.find((c) => c.code === extra.country)?.name || extra.country}
                              </span>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                          </td>
                          )}
                          {visibleCols.includes("poc") && (
                          <td>
                            <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500 }}>{e.contact_name || "—"}</div>
                            {e.designation && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.designation}</div>}
                          </td>
                          )}
                          {visibleCols.includes("source") && (() => {
                            const src = e.source || extra.source || "";
                            const cfg = SOURCE_CONFIG[src];
                            const srcColor = cfg?.color || "#6366F1";
                            const SrcIcon = cfg?.icon;
                            const srcLabel = src ? (LEAD_SOURCES.find(s => s.key === src)?.label || src) : "— Source —";
                            return (
                              <td onClick={(ev) => ev.stopPropagation()}>
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  {SrcIcon && <span style={{ display: "inline-flex", color: srcColor, flexShrink: 0 }}><SrcIcon size={13} /></span>}
                                  <span style={{ display: "inline-grid" }}>
                                    <span style={{ gridArea: "1/1", fontSize: 11, fontWeight: 600, visibility: "hidden", whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none", paddingRight: 2 }}>{srcLabel}</span>
                                    <select
                                      value={src}
                                      onChange={(ev) => handleInlineUpdate(e.id, "source", ev.target.value || null)}
                                      style={{ gridArea: "1/1", width: "100%", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", fontSize: 11, fontWeight: 600, border: "none", padding: 0, background: "transparent", color: src ? srcColor : "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", outline: "none" }}
                                    >
                                      <option value="">— Source —</option>
                                      {LEAD_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                    </select>
                                  </span>
                                </div>
                              </td>
                            );
                          })()}
                          {visibleCols.includes("services") && (
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
                          {visibleCols.includes("website") && (
                          <td>
                            {extra.website ? (
                              <a href={extra.website.startsWith("http") ? extra.website : `https://${extra.website}`} target="_blank" rel="noopener noreferrer" title={extra.website}
                                onClick={(ev) => ev.stopPropagation()}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#3B82F6", textDecoration: "none", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                <WebsiteIcon size={12} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{extra.website.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 22)}{extra.website.replace(/^https?:\/\//, "").length > 22 ? "…" : ""}</span>
                              </a>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                          </td>
                          )}
                          {visibleCols.includes("linkedin") && (
                          <td>
                            {extra.company_linkedin ? (
                              <a href={extra.company_linkedin} target="_blank" rel="noopener noreferrer" title={extra.company_linkedin}
                                onClick={(ev) => ev.stopPropagation()}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#0A66C2", textDecoration: "none", maxWidth: 120 }}>
                                <LinkedinIcon size={12} />
                                <span>View</span>
                                <ExternalLink size={9} strokeWidth={2} />
                              </a>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                          </td>
                          )}
                          {visibleCols.includes("stage") && (() => {
                            const stg = PIPELINE_STAGES.find(s => s.key === (e.pipeline_stage || "new_prospect")) || PIPELINE_STAGES[0];
                            return (
                              <td onClick={(ev) => ev.stopPropagation()}>
                                <span style={{ display: "inline-grid" }}>
                                  <span style={{ gridArea: "1/1", fontSize: 11, fontWeight: 700, visibility: "hidden", whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none", paddingRight: 2 }}>{stg.label}</span>
                                  <select
                                    value={e.pipeline_stage || "new_prospect"}
                                    onChange={(ev) => handleInlineUpdate(e.id, "pipeline_stage", ev.target.value)}
                                    style={{ gridArea: "1/1", width: "100%", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", fontSize: 11, fontWeight: 700, border: "none", padding: 0, background: "transparent", color: stg.color, cursor: "pointer", fontFamily: "inherit", outline: "none" }}
                                  >
                                    {PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                  </select>
                                </span>
                              </td>
                            );
                          })()}
                          {visibleCols.includes("assigned") && (
                          <td>
                            {(() => {
                              const rowExtra  = parseJSON(e.other_notes);
                              const supervisor = rowExtra.supervisor_id ? teamMembers.find((m) => m.id === rowExtra.supervisor_id) : null;
                              return (
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  {e.assigned_profile ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                      <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{e.assigned_profile.full_name}</span>
                                      {(e.assigned_to === profile?.id || e.created_by === profile?.id) && (
                                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: "#EDE9FE", color: "#7C3AED", border: "1px solid rgba(124,58,237,0.25)" }}>Mine</span>
                                      )}
                                    </div>
                                  ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
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
                          {visibleCols.includes("date") && (
                          <td style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmt(e.created_at)}</td>
                          )}
                          {/* Actions */}
                          <td style={{ textAlign: "right" }} onClick={(ev) => ev.stopPropagation()}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                              {(() => {
                                const canEditThis = isSalesHead || e.assigned_to === profile?.id || e.created_by === profile?.id;
                                if (e.is_locked && !isSalesHead) return (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)", padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                                    <Lock size={10} strokeWidth={2} /> Locked
                                  </span>
                                );
                                if (!canEditThis) return null;
                                return (
                                  <>
                                    <motion.button
                                      onClick={() => hasContact ? handleConvertClick(e) : toast.error(CONVERSION_BLOCKED_MSG, { duration: 6000 })}
                                      title={hasContact ? "Convert to Lead" : "⚠ Contact Number or Email required to convert"}
                                      whileHover={hasContact ? { scale: 1.03, y: -1 } : {}}
                                      whileTap={hasContact ? { scale: 0.96 } : {}}
                                      style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        padding: "5px 13px", borderRadius: 8,
                                        fontSize: 12, fontWeight: 700, letterSpacing: "-0.01em",
                                        background: hasContact ? "linear-gradient(135deg, #059669 0%, #10B981 100%)" : "var(--surface-2)",
                                        color: hasContact ? "#fff" : "var(--text-muted)",
                                        border: hasContact ? "1px solid rgba(16,185,129,0.4)" : "1px solid var(--border)",
                                        cursor: hasContact ? "pointer" : "not-allowed",
                                        fontFamily: "inherit",
                                        boxShadow: hasContact ? "0 2px 10px rgba(16,185,129,0.28), inset 0 1px 0 rgba(255,255,255,0.12)" : "none",
                                        transition: "box-shadow 0.15s ease",
                                        whiteSpace: "nowrap",
                                      }}>
                                      <ArrowRight size={12} strokeWidth={2.5} /> Lead
                                    </motion.button>
                                    <motion.button onClick={() => { setEditEntry(e); setSelectedEntry(null); }} className="btn-ghost" style={{ padding: "4px 7px" }} whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}>
                                      <Pencil size={13} strokeWidth={1.75} />
                                    </motion.button>
                                    {canDelete && (
                                      <motion.button onClick={() => handleDeleteConfirm(e)} className="btn-ghost" style={{ padding: "4px 7px", color: "var(--red)" }} whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}>
                                        <Trash2 size={13} strokeWidth={1.75} />
                                      </motion.button>
                                    )}
                                  </>
                                );
                              })()}
                              {isSalesHead && (
                                <motion.button onClick={() => e.is_locked ? unlockMutation.mutate(e.id) : lockMutation.mutate(e.id)}
                                  title={e.is_locked ? "Unlock record" : "Lock record"}
                                  className="btn-ghost" style={{ padding: "4px 7px", color: e.is_locked ? "var(--green)" : "var(--text-muted)" }}
                                  whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}>
                                  {e.is_locked ? <LockOpen size={13} strokeWidth={1.75} /> : <Lock size={13} strokeWidth={1.75} />}
                                </motion.button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {(showForm || editEntry) && (
          <PipelineFormModal key="form" entry={editEntry} onClose={() => { setShowForm(false); setEditEntry(null); }} onSave={handleSave} teamMembers={teamMembers} canAssign={isOwner || isSalesHead} />
        )}
        {convertEntry && (
          <ConvertModal key="convert" entry={convertEntry} onClose={() => setConvertEntry(null)} onConfirm={() => convertMutation.mutate(convertEntry)} loading={convertMutation.isPending} />
        )}
        {showImport && (
          <BulkImportModal
            key="import"
            onClose={() => { setShowImport(false); setImportResult(null); }}
            onImport={(rows, adminPickedId) => {
              // Non-admins: always assign to self. Admins: use their selection (may be empty = unassigned).
              const assignedTo = (isOwner || isSalesHead) ? (adminPickedId || null) : (profile?.id || null);
              bulkImportMutation.mutate({ rows, assignedTo });
            }}
            loading={bulkImportMutation.isPending}
            isAdminUser={isOwner || isSalesHead}
            teamMembers={teamMembers}
            importResult={importResult}
            onResultDone={() => { setShowImport(false); setImportResult(null); }}
          />
        )}
      </AnimatePresence>

      {/* ── Detail Panel ── */}
      <AnimatePresence>
        {selectedEntry && (
          <PipelineDetailPanel
            key={selectedEntry.id}
            entry={selectedEntry}
            pipelineLocked={pipelineLocked}
            onClose={() => setSelectedEntry(null)}
            onEdit={(e) => { setEditEntry(e); setSelectedEntry(null); }}
            onConvert={handleConvertClick}
          />
        )}
      </AnimatePresence>

      {pendingSubStatus && (
        <ContactSubStatusModal
          status={pendingSubStatus.newStage}
          onConfirm={handlePipelineSubStatusConfirm}
          onCancel={() => setPendingSubStatus(null)}
        />
      )}
      {pendingDupCreate && (
        <DuplicateCheckModal
          type={pendingDupCreate.type}
          duplicates={pendingDupCreate.duplicates}
          entityType="pipeline"
          teamMembers={teamMembers}
          onCancel={() => setPendingDupCreate(null)}
          onProceed={handleDupPipelineProceed}
          onViewExisting={handleDupPipelineViewExisting}
          crossRole={pendingDupCreate.crossRole || false}
        />
      )}
    </div>
  );
}
