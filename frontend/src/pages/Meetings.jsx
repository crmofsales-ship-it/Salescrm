import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { getAccessToken } from "../lib/session";
import { meetingsService } from "../services/meetingsService";
import { teamService } from "../services/teamService";
import { leadsService } from "../services/leadsService";
import { dealsService } from "../services/dealsService";
import { changeHistoryService } from "../services/changeHistoryService";
import { db as supabase } from "../lib/db";
import toast from "react-hot-toast";
import { format, isToday, isTomorrow, isPast, formatDistanceToNow, startOfDay, endOfDay, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, startOfWeek, endOfWeek, addMonths, subMonths } from "date-fns";
import {
  Plus, X, Pencil, Trash2, Calendar, Clock, MapPin, ExternalLink,
  Users, CheckCircle2, Video, Phone, Building2, Search, Filter,
  CalendarCheck, ChevronDown, FileText, Target, Lock, Globe,
  Link2, AlertCircle, RefreshCw, Trophy, ArrowRight, Briefcase,
  Mail, MessageCircle, UserCheck, Globe2, AtSign, Hash, RotateCcw,
  GitBranch, Copy, ChevronUp, ChevronLeft, Flag, Download, LayoutList, LayoutGrid, CalendarDays, User, ClipboardList,
} from "lucide-react";
import SkeletonTable from "../components/SkeletonTable";
import { ColumnToggle, TemplateMenu } from "../components/TableControls";
import { useTablePreferences } from "../hooks/useTablePreferences";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

const MTG_COLUMNS = [
  { key: "meeting_id", label: "Meeting ID",  required: true },
  { key: "meeting",    label: "Meeting",     required: true },
  { key: "client",     label: "Client" },
  { key: "datetime",   label: "Date & Time", required: true },
  { key: "mode",       label: "Mode" },
  { key: "team",       label: "Team" },
  { key: "status",     label: "Status" },
  { key: "outcome",    label: "Outcome" },
];

function getMeetingCode(n) {
  return `MEET-${String(n).padStart(3, "0")}`;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MEETING_PURPOSES = [
  { key: "follow_up",    label: "Follow-up",            color: "#F59E0B", bg: "rgba(245,158,11,0.1)"   },
  { key: "discovery",    label: "Discovery Call",        color: "#6366F1", bg: "rgba(99,102,241,0.1)"   },
  { key: "demo",         label: "Product Demo",          color: "#3B82F6", bg: "rgba(59,130,246,0.1)"   },
  { key: "negotiation",  label: "Negotiation",           color: "#8B5CF6", bg: "rgba(139,92,246,0.1)"   },
  { key: "proposal",     label: "Proposal Discussion",   color: "#F97316", bg: "rgba(249,115,22,0.1)"   },
  { key: "requirements", label: "Requirement Gathering", color: "#06B6D4", bg: "rgba(6,182,212,0.1)"    },
  { key: "onboarding",   label: "Onboarding",            color: "#10B981", bg: "rgba(16,185,129,0.1)"   },
  { key: "support",      label: "Support Meeting",       color: "#EF4444", bg: "rgba(239,68,68,0.1)"    },
  { key: "internal",     label: "Internal Discussion",   color: "#6B7280", bg: "rgba(107,114,128,0.1)"  },
  { key: "presentation", label: "Client Presentation",   color: "#EC4899", bg: "rgba(236,72,153,0.1)"   },
  { key: "payment",      label: "Payment Discussion",    color: "#84CC16", bg: "rgba(132,204,22,0.1)"   },
  { key: "closing",      label: "Closing Discussion",    color: "#10B981", bg: "rgba(16,185,129,0.1)"   },
  { key: "others",       label: "Others",                color: "#6B7280", bg: "rgba(107,114,128,0.1)"  },
];

const OUTCOMES = [
  { key: "won",       label: "Won",         color: "#10B981", bg: "rgba(16,185,129,0.1)",   icon: Trophy        },
  { key: "positive",  label: "Positive",    color: "#3B82F6", bg: "rgba(59,130,246,0.1)",   icon: CheckCircle2  },
  { key: "neutral",   label: "Neutral",     color: "#6B7280", bg: "rgba(107,114,128,0.1)",  icon: ArrowRight    },
  { key: "negative",  label: "Negative",    color: "#EF4444", bg: "rgba(239,68,68,0.1)",    icon: X             },
  { key: "no_show",   label: "No Show",     color: "#F59E0B", bg: "rgba(245,158,11,0.1)",   icon: AlertCircle   },
];

const STATUS_META = {
  scheduled:   { color: "#3B82F6", bg: "rgba(59,130,246,0.1)",  label: "Scheduled"    },
  completed:   { color: "#10B981", bg: "rgba(16,185,129,0.1)",  label: "Completed"    },
  cancelled:   { color: "#EF4444", bg: "rgba(239,68,68,0.1)",   label: "Cancelled"    },
  rescheduled: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  label: "Rescheduled"  },
};

const TIME_SLOTS = Array.from({ length: 34 }, (_, i) => {
  const total = 7 * 60 + i * 30; // 7:00 AM to 11:30 PM in 30-min steps
  const h = Math.floor(total / 60), m = total % 60;
  if (h >= 24) return null;
  const hh = String(h).padStart(2, "0"), mm = String(m).padStart(2, "0");
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { value: `${hh}:${mm}`, label: `${h12}:${mm} ${period}` };
}).filter(Boolean);

const DURATIONS = [
  { value: 60,  label: "1 Hour"            },
  { value: 90,  label: "1 Hour 30 Minutes" },
  { value: 120, label: "2 Hours"           },
];

const PLATFORM_LABELS = {
  google_meet: "Google Meet",
  teams:       "Microsoft Teams",
  zoom:        "Zoom",
  jitsi:       "Jitsi (Free)",
  custom:      "Custom Link",
};

const TIMEZONES = [
  "Asia/Kolkata", "UTC", "America/New_York", "America/Los_Angeles", "America/Chicago",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore",
  "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "Asia/Karachi", "Asia/Dhaka",
];

const fmt = (d, pattern = "dd MMM yyyy, h:mm a") => {
  if (!d) return "—";
  try { return format(new Date(d), pattern); }
  catch { return d; }
};

const fmtDate = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isToday(date)) return `Today · ${format(date, "h:mm a")}`;
  if (isTomorrow(date)) return `Tomorrow · ${format(date, "h:mm a")}`;
  return format(date, "dd MMM, h:mm a");
};

const getDurationStr = (start, end) => {
  if (!start || !end) return null;
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const generateJitsiRoom = (id) =>
  `https://meet.jit.si/SalesCRM-${id.slice(0, 8).toUpperCase()}`;


// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.scheduled;
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: m.bg, color: m.color }}>{m.label}</span>;
}

function PurposeBadge({ purpose }) {
  if (!purpose) return null;
  const p = MEETING_PURPOSES.find((x) => x.key === purpose);
  if (p && p.key !== "others") return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: p.bg, color: p.color }}>{p.label}</span>;
  // Custom purpose (stored when user selected "Others" and typed a custom value)
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(107,114,128,0.1)", color: "#6B7280" }}>{purpose}</span>;
}

function OutcomeBadge({ outcome }) {
  const o = OUTCOMES.find((x) => x.key === outcome);
  if (!o) return null;
  const Icon = o.icon;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: o.bg, color: o.color, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Icon size={9} /> {o.label}
    </span>
  );
}

function AvatarStack({ attendees = [] }) {
  const shown = attendees.slice(0, 3);
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((a, i) => {
        const u = a.user || a;
        const initials = u?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
        return u?.avatar_url ? (
          <img key={u.id} src={u.avatar_url} alt={initials} title={u.full_name} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--surface)", marginLeft: i > 0 ? -6 : 0 }} />
        ) : (
          <div key={u?.id || i} title={u?.full_name} style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff", border: "2px solid var(--surface)", marginLeft: i > 0 ? -6 : 0 }}>
            {initials}
          </div>
        );
      })}
      {attendees.length > 3 && (
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", border: "2px solid var(--surface)", marginLeft: -6 }}>
          +{attendees.length - 3}
        </div>
      )}
    </div>
  );
}

// ─── Priority ─────────────────────────────────────────────────────────────────

const PRIORITY_META = {
  high:   { label: "High",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  medium: { label: "Medium", color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  low:    { label: "Low",    color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
};

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority];
  if (!m) return null;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: m.bg, color: m.color, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
      <Flag size={8} /> {m.label}
    </span>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ meetings, codeMap, onSelectMeeting }) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const meetingsByDate = useMemo(() => {
    const map = {};
    meetings.forEach((m) => {
      if (!m.start_time) return;
      const key = format(new Date(m.start_time), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return map;
  }, [meetings]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd   = endOfMonth(currentMonth);
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd     = endOfWeek(monthEnd,   { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button className="btn-ghost" style={{ padding: "5px 10px", display: "flex", alignItems: "center", gap: 4 }}
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
          <ChevronUp size={14} style={{ transform: "rotate(-90deg)" }} /> Prev
        </button>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <button className="btn-ghost" style={{ padding: "5px 10px", display: "flex", alignItems: "center", gap: 4 }}
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
          Next <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", padding: "4px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map((day) => {
          const key        = format(day, "yyyy-MM-dd");
          const dayMtgs    = meetingsByDate[key] || [];
          const inMonth    = isSameMonth(day, currentMonth);
          const isTodayDay = isToday(day);
          return (
            <div key={key}
              style={{ minHeight: 84, padding: "6px 7px", borderRadius: 10, border: `1.5px solid ${isTodayDay ? "var(--accent)" : "var(--border)"}`, background: isTodayDay ? "rgba(99,102,241,0.04)" : "var(--surface)", opacity: inMonth ? 1 : 0.3 }}
            >
              <div style={{ fontSize: 12, fontWeight: isTodayDay ? 800 : 500, color: isTodayDay ? "var(--accent)" : "var(--text-2)", marginBottom: 4, textAlign: "right" }}>
                {format(day, "d")}
              </div>
              {dayMtgs.slice(0, 3).map((m) => {
                const sm = STATUS_META[m.status] || STATUS_META.scheduled;
                return (
                  <div key={m.id} onClick={() => onSelectMeeting(m)} title={m.title}
                    style={{ fontSize: 10, fontWeight: 600, padding: "2px 5px", borderRadius: 5, marginBottom: 2, background: sm.bg, color: sm.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                  >
                    {m.start_time ? format(new Date(m.start_time), "HH:mm") : ""} {m.title}
                  </div>
                );
              })}
              {dayMtgs.length > 3 && (
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>+{dayMtgs.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ meetings, codeMap, onSelect, onEdit, onComplete, onDelete, onFollowUp, canDelete }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
      {meetings.map((m) => {
        const sm = STATUS_META[m.status] || STATUS_META.scheduled;
        const isOverdue = m.status === "scheduled" && m.start_time && isPast(new Date(m.start_time));
        return (
          <div key={m.id} onClick={() => onSelect(m)}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${sm.color}`, borderRadius: 12, padding: 16, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <StatusBadge status={m.status} />
                  {m.meeting_purpose && <PurposeBadge purpose={m.meeting_purpose} />}
                  {m.priority && m.priority !== "medium" && <PriorityBadge priority={m.priority} />}
                  {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.08)", padding: "2px 6px", borderRadius: 99 }}>Overdue</span>}
                </div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "2px 7px", borderRadius: 6, fontFamily: "monospace", flexShrink: 0 }}>
                {codeMap[m.id] || "—"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10, paddingLeft: 2 }}>
              {m.customer_name && (
                <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}>
                  <User size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  {m.customer_name}{m.company_name ? ` · ${m.company_name}` : ""}
                </div>
              )}
              {m.start_time && (
                <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}>
                  <Calendar size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  {format(new Date(m.start_time), "EEE, MMM d · HH:mm")}{m.end_time ? ` – ${format(new Date(m.end_time), "HH:mm")}` : ""}
                </div>
              )}
              {(m.meeting_link || m.location) && (
                <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}>
                  {(m.mode === "online" || m.meeting_type !== "in_person")
                    ? <Video size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    : <MapPin size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                  {(m.mode === "online" || m.meeting_type !== "in_person") ? "Online Meeting" : (m.location || "In Person")}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
              {m.status === "scheduled" && (
                <motion.button onClick={(e) => { e.stopPropagation(); onComplete(m); }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 7, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.2)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={10} /> Done
                </motion.button>
              )}
              <motion.button onClick={(e) => { e.stopPropagation(); onFollowUp(m); }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 7, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                <GitBranch size={10} /> Follow-up
              </motion.button>
              <motion.button onClick={(e) => { e.stopPropagation(); onEdit(m); }} className="btn-ghost" style={{ padding: "4px 6px" }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Pencil size={12} strokeWidth={1.75} />
              </motion.button>
              {canDelete && (
                <motion.button onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete this meeting?")) onDelete(m.id); }} className="btn-ghost" style={{ padding: "4px 6px", color: "var(--red)" }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Trash2 size={12} strokeWidth={1.75} />
                </motion.button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Google Maps Places Autocomplete (mounts only when API key is present) ───
function GoogleMapsAutocomplete({ inputId, apiKey, onPlaceSelected }) {
  useEffect(() => {
    if (!apiKey || !inputId) return;
    let autocomplete;
    const init = () => {
      const el = document.getElementById(inputId);
      if (!el || !window.google?.maps?.places) return;
      autocomplete = new window.google.maps.places.Autocomplete(el, { types: ["geocode", "establishment"] });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place?.geometry?.location) {
          onPlaceSelected({
            formattedAddress: place.formatted_address || el.value,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            placeId: place.place_id || null,
          });
        }
      });
    };
    if (window.google?.maps?.places) { init(); return; }
    const scriptId = "gm-places-script";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id  = scriptId;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      s.async = true;
      s.onload = init;
      document.head.appendChild(s);
    } else {
      document.getElementById(scriptId).addEventListener("load", init);
    }
    return () => { if (autocomplete) window.google?.maps?.event?.clearInstanceListeners(autocomplete); };
  }, [inputId, apiKey, onPlaceSelected]);
  return null; // renders nothing — side-effect only
}

// ─── Meeting Form Modal ───────────────────────────────────────────────────────

function MeetingFormModal({ meeting, onClose, onSave, teamMembers = [], leads = [], deals = [], pipeline = [], allMeetings = [], codeMap = {}, reuseFrom = null }) {
  const [mode,           setMode]          = useState(meeting?.mode || "online");
  const [platform,       setPlatform]      = useState(meeting?.meeting_type || "google_meet");
  const [locationLat,    setLocationLat]   = useState(meeting?.location_lat  || null);
  const [locationLng,    setLocationLng]   = useState(meeting?.location_lng  || null);
  const [locationPlaceId, setLocationPlaceId] = useState(meeting?.location_place_id || null);
  const [oauthStatus,    setOauthStatus]   = useState({ google_meet: null, microsoft_teams: null });
  const [oauthLoading,   setOauthLoading]  = useState(false);
  const [purpose,        setPurpose]       = useState(meeting?.meeting_purpose || "");
  const [purposeOther,   setPurposeOther]  = useState("");
  const [purposeError,   setPurposeError]  = useState(false);
  const [attendeeIds,    setAttendeeIds]   = useState(() =>
    meeting?.attendees ? meeting.attendees.map((a) => (a.user || a).id).filter(Boolean) : []
  );
  const [autoJitsi,      setAutoJitsi]     = useState(false);
  const [allDay,         setAllDay]        = useState(false);
  const [externalEmails, setExternalEmails]= useState("");
  const [internalNotes,  setInternalNotes] = useState(meeting?.internal_notes || "");
  const [priority,       setPriority]      = useState(meeting?.priority || "medium");
  const [showReview,       setShowReview]      = useState(false);
  const [platformDropOpen, setPlatformDropOpen] = useState(false);
  const platformDropRef = useRef(null);
  const [teamSearch,     setTeamSearch]    = useState("");
  const [teamDropOpen,   setTeamDropOpen]  = useState(false);
  const teamDropRef = useRef(null);
  const [extDropOpen,    setExtDropOpen]   = useState(false);
  const extDropRef = useRef(null);

  useEffect(() => {
    if (!extDropOpen) return;
    const h = (e) => { if (!extDropRef.current?.contains(e.target)) setExtDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [extDropOpen]);

  /* ── Premium picker UI state (presentational only — values still flow into
        the same fields/handlers as before) ──────────────────────────────── */
  const [durationDropOpen, setDurationDropOpen] = useState(false);
  const durationDropRef = useRef(null);
  const [timeDropOpen,     setTimeDropOpen]     = useState(false);
  const timeDropRef = useRef(null);
  const [timezoneDropOpen, setTimezoneDropOpen] = useState(false);
  const timezoneDropRef = useRef(null);
  const [timezoneSearch,   setTimezoneSearch]   = useState("");
  const [dateDropOpen,     setDateDropOpen]     = useState(false);
  const dateDropRef = useRef(null);
  const [crmActiveIndex,   setCrmActiveIndex]   = useState(-1);
  const [recentCrmSearches, setRecentCrmSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem("crm_recent_meeting_search") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    if (!durationDropOpen) return;
    const h = (e) => { if (!durationDropRef.current?.contains(e.target)) setDurationDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [durationDropOpen]);

  useEffect(() => {
    if (!timeDropOpen) return;
    const h = (e) => { if (!timeDropRef.current?.contains(e.target)) setTimeDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [timeDropOpen]);

  useEffect(() => {
    if (!timezoneDropOpen) return;
    const h = (e) => { if (!timezoneDropRef.current?.contains(e.target)) setTimezoneDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [timezoneDropOpen]);

  useEffect(() => {
    if (!dateDropOpen) return;
    const h = (e) => { if (!dateDropRef.current?.contains(e.target)) setDateDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [dateDropOpen]);

  /* ── Reuse previous meeting state ─────────────────────────────────────── */
  const [showReuse,     setShowReuse]     = useState(!!reuseFrom);
  const [reuseSearch,   setReuseSearch]   = useState("");
  const [reuseDropOpen, setReuseDropOpen] = useState(false);
  const [selectedParent,setSelectedParent]= useState(reuseFrom || null);
  const reuseDropRef = useRef(null);

  useEffect(() => {
    if (!reuseDropOpen) return;
    const h = (e) => { if (!reuseDropRef.current?.contains(e.target)) setReuseDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [reuseDropOpen]);

  useEffect(() => {
    if (!platformDropOpen) return;
    const h = (e) => { if (!platformDropRef.current?.contains(e.target)) setPlatformDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [platformDropOpen]);

  const [meetingTypeDropOpen, setMeetingTypeDropOpen] = useState(false);
  const meetingTypeDropRef = useRef(null);

  useEffect(() => {
    if (!meetingTypeDropOpen) return;
    const h = (e) => { if (!meetingTypeDropRef.current?.contains(e.target)) setMeetingTypeDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [meetingTypeDropOpen]);

  // ── CRM entity lookup ─────────────────────────────────────────────────────
  const parseNotes = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };
  const normalizeEntity = (rec, src) => {
    const x = parseNotes(rec.other_notes);
    return { ...rec, _src: src, email: rec.email || x.email || "", phone: rec.phone || x.phone || x.whatsapp || "" };
  };
  const normalizeDeal = (d) => {
    const n = parseNotes(d.notes);
    return {
      ...d,
      _src:      "deal",
      lead_code: n.lead_code || d.linked_lead?.lead_code || null,
      email:     d.customer_email || n.email || "",
      phone:     n.contact || d.customer_phone || "",
    };
  };

  const allCrmSources = [
    ...leads.map((l) => normalizeEntity(l, "lead")),
    ...pipeline.map((p) => normalizeEntity(p, "pipeline")),
    ...(deals || []).map(normalizeDeal),
  ];

  const resolveInitialEntity = () => {
    if (!meeting?.lead_id) return null;
    return allCrmSources.find((x) => x.id === meeting.lead_id) || null;
  };
  const resolveInitialInput = () => {
    if (!meeting?.lead_id) return "";
    const found = allCrmSources.find((x) => x.id === meeting.lead_id);
    if (!found) return "";
    if (found._src === "deal") return `Deal — ${found.company_name || found.title || ""}`.trim();
    return `${found.lead_code || ""} — ${found.company_name || ""}`.trim().replace(/^—\s*/, "");
  };

  const [leadCodeInput, setLeadCodeInput] = useState(resolveInitialInput);
  const [crmEntity,     setCrmEntity]     = useState(resolveInitialEntity);
  const [lookupStatus,  setLookupStatus]  = useState(meeting?.lead_id ? "found" : "idle");
  const [noPocError,    setNoPocError]    = useState(false);
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const dropdownRef = useRef(null);

  // Click-outside closes lead dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    const handle = (e) => { if (!dropdownRef.current?.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  // Click-outside closes team dropdown
  useEffect(() => {
    if (!teamDropOpen) return;
    const handle = (e) => { if (!teamDropRef.current?.contains(e.target)) setTeamDropOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [teamDropOpen]);

  // ── Normalize any input format → numeric string for comparison
  const normalizeNum = (v) => v.replace(/[^0-9]/g, "").replace(/^0+/, "") || "";

  // ── Filter CRM sources matching the search query (lead code, company, contact, email, phone)
  const filteredSources = leadCodeInput.trim()
    ? allCrmSources.filter((l) => {
        const q       = leadCodeInput.trim().toUpperCase();
        const code    = (l.lead_code || "").toUpperCase();
        const num     = normalizeNum(q);
        const codeNum = normalizeNum(code);
        const phone   = (l.phone || "").replace(/[^0-9]/g, "");
        return (
          code.includes(q) ||
          (num && codeNum === num) ||
          (l.company_name  || "").toUpperCase().includes(q) ||
          (l.contact_name  || "").toUpperCase().includes(q) ||
          (l.email         || "").toUpperCase().includes(q) ||
          (l.title         || "").toUpperCase().includes(q) ||
          (num.length >= 4 && phone.includes(num)) ||
          (l.phone || "").includes(leadCodeInput.trim())
        );
      })
    : allCrmSources.slice(0, 30);

  // ── Date + time slot states ───────────────────────────────────────────────
  const [meetingDate, setMeetingDate] = useState(() => {
    if (!meeting?.start_time) return "";
    return new Date(meeting.start_time).toISOString().split("T")[0];
  });
  const [meetingSlot, setMeetingSlot] = useState(() => {
    if (!meeting?.start_time) return "";
    const d = new Date(meeting.start_time);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(Math.floor(d.getMinutes() / 30) * 30).padStart(2, "0");
    return `${h}:${m}`;
  });
  const [duration, setDuration] = useState(() => {
    if (!meeting?.start_time || !meeting?.end_time) return 60;
    return Math.round((new Date(meeting.end_time) - new Date(meeting.start_time)) / 60000) || 60;
  });
  const [isCustomDuration, setIsCustomDuration] = useState(() => ![60, 90, 120].includes(duration));
  const [calendarCursor, setCalendarCursor] = useState(() => meetingDate ? new Date(`${meetingDate}T00:00:00`) : new Date());

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      title:          meeting?.title          || "",
      company_name:   meeting?.company_name   || "",
      customer_name:  meeting?.customer_name  || "",
      customer_email: meeting?.customer_email || "",
      customer_phone: meeting?.customer_phone || "",
      timezone:       meeting?.timezone       || "Asia/Kolkata",
      meeting_link:   meeting?.meeting_link   || ((meeting?.mode || "online") !== "offline" && (meeting?.meeting_type || "google_meet") === "jitsi" ? generateJitsiRoom(Date.now().toString(36)) : ""),
      location:       meeting?.location       || "",
      agenda:         meeting?.agenda         || "",
      status:         meeting?.status         || "scheduled",
    },
  });

  const watchLink = watch("meeting_link");
  const todayStr  = new Date().toISOString().split("T")[0];

  // Auto-generate Jitsi link when mode switches to online and no link is set (Jitsi platform only)
  useEffect(() => {
    if (mode === "online" && !watchLink && platform === "jitsi") {
      setValue("meeting_link", generateJitsiRoom(Date.now().toString(36)));
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch which OAuth providers (Google Meet / Microsoft Teams) the current user has connected
  useEffect(() => {
    const fetchOauthStatus = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await fetch(`${API}/api/oauth/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const data = await r.json();
          setOauthStatus(data);
        }
      } catch { /* non-fatal: OAuth status is best-effort */ }
    };
    fetchOauthStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lead ID lookup (text input path) ──────────────────────────────────────
  const handleLeadCodeChange = (val) => {
    setLeadCodeInput(val);
    setNoPocError(false);
    setCrmEntity(null);
    setCrmActiveIndex(-1);
    if (!val.trim()) { setLookupStatus("idle"); setDropdownOpen(false); return; }
    // Always show dropdown so partial inputs (e.g. "2") show all matching leads
    setLookupStatus("searching");
    setDropdownOpen(true);
  };

  const selectEntity = (entity) => {
    setCrmEntity(entity);
    if (entity._src === "deal") {
      setLeadCodeInput(`Deal — ${entity.company_name || entity.title || ""}`.trim());
    } else {
      setLeadCodeInput(`${entity.lead_code || ""} — ${entity.company_name || ""}`.trim().replace(/^—\s*/, ""));
    }
    setLookupStatus("found");
    setDropdownOpen(false);
    setNoPocError(false);
    setCrmActiveIndex(-1);
    try {
      const next = [entity.id, ...recentCrmSearches.filter((id) => id !== entity.id)].slice(0, 5);
      setRecentCrmSearches(next);
      localStorage.setItem("crm_recent_meeting_search", JSON.stringify(next));
    } catch { /* non-fatal — recent searches are a convenience only */ }
    // Auto-fill only contact detail fields from CRM record — Meeting Information
    // (title, purpose, agenda) is always entered manually by the user.
    setValue("company_name",   entity.company_name || entity.title || "");
    setValue("customer_name",  entity.contact_name || "");
    setValue("customer_email", entity.email        || "");
    setValue("customer_phone", entity.phone        || "");
  };

  const clearSelection = () => {
    setCrmEntity(null);
    setLeadCodeInput("");
    setLookupStatus("idle");
    setNoPocError(false);
    setDropdownOpen(false);
    setCrmActiveIndex(-1);
  };

  const toggleAttendee = (id) => setAttendeeIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  /* ── Apply a previous meeting's data to the form ─────────────────────── */
  const applyReuseMeeting = useCallback((src) => {
    setSelectedParent(src);
    setReuseDropOpen(false);
    setReuseSearch("");
    setValue("title",          src.title          || "");
    setValue("company_name",   src.company_name   || "");
    setValue("customer_name",  src.customer_name  || "");
    setValue("customer_email", src.customer_email || "");
    setValue("customer_phone", src.customer_phone || "");
    setValue("agenda",         src.agenda         || "");
    setMode(src.mode || "online");
    setPlatform(src.meeting_type && src.meeting_type !== "in_person" ? src.meeting_type : "google_meet");
    setPurpose(src.meeting_purpose || "");
    // Keep notes blank so user can add fresh notes; embed parent ref
    const parentCode = codeMap[src.id] || "MEET-?";
    setInternalNotes(`[Follow-up of ${parentCode}: ${src.title}]\n\n`);
    if (src.customer_email) setExternalEmails("");
    // Re-link CRM entity if lead/deal exists
    const srcEntity = allCrmSources.find((x) => x.id === (src.lead_id || src.deal_id));
    if (srcEntity) selectEntity(srcEntity);
    toast.success(`Pre-filled from ${parentCode}`, { duration: 2500 });
  }, [codeMap, allCrmSources, setValue]);

  // Auto-apply reuseFrom when provided (follow-up workflow)
  const reuseAppliedRef = useRef(false);
  useEffect(() => {
    if (reuseFrom && !reuseAppliedRef.current) {
      reuseAppliedRef.current = true;
      applyReuseMeeting(reuseFrom);
    }
  }, [reuseFrom, applyReuseMeeting]);

  // Filtered reuse meeting list
  const reuseMeetings = useMemo(() => {
    const q = reuseSearch.trim().toLowerCase();
    return allMeetings
      .filter((m) => !q ||
        (codeMap[m.id] || "").toLowerCase().includes(q) ||
        (m.title || "").toLowerCase().includes(q) ||
        (m.company_name || "").toLowerCase().includes(q) ||
        (m.customer_name || "").toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [allMeetings, reuseSearch, codeMap]);

  // OAuth connect/disconnect is now managed in Settings → Email & Calendar Integrations

  const handleGenerateJitsi = () => {
    setValue("meeting_link", generateJitsiRoom(meeting?.id || Date.now().toString(36)));
    setAutoJitsi(true);
  };

  // ── Form submission ────────────────────────────────────────────────────────
  const handleFormSubmit = async (data) => {
    if (!meetingDate) { toast.error("Select a meeting date"); return; }
    if (!allDay && !meetingSlot) { toast.error("Select a meeting time slot"); return; }
    if (!purpose) { setPurposeError(true); toast.error("Select a meeting purpose"); return; }

    const startISO = allDay
      ? new Date(`${meetingDate}T09:00:00`).toISOString()
      : new Date(`${meetingDate}T${meetingSlot}:00`).toISOString();
    const endISO = allDay
      ? new Date(`${meetingDate}T18:00:00`).toISOString()
      : new Date(new Date(startISO).getTime() + duration * 60000).toISOString();

    const externalList = externalEmails.split(",").map((e) => e.trim()).filter(Boolean);
    const teamEmails   = attendeeIds
      .map((id) => teamMembers.find((tm) => tm.id === id)?.email)
      .filter(Boolean);
    const extras = [...new Set([...externalList, ...teamEmails])];

    const finalPurpose = purpose === "others" ? (purposeOther.trim() || "others") : (purpose || null);
    const isDealLink   = crmEntity?._src === "deal";

    // Auto-generate meeting link via OAuth if user has connected provider
    // and no manual link was entered.
    let finalMeetingLink = mode === "online" ? (data.meeting_link || null) : null;
    let calendarEventId  = null; // external event ID to store for later deletion
    let calendarProvider = null;
    if (
      mode === "online" &&
      !finalMeetingLink &&
      (platform === "google_meet" || platform === "teams")
    ) {
      try {
        const token = await getAccessToken();
        if (token) {
          setOauthLoading(true);
          if (platform === "google_meet" && oauthStatus.google_meet?.connected) {
            const r = await fetch(`${API}/api/oauth/google/create-event`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                title:           data.title,
                startTime:       startISO,
                endTime:         endISO,
                description:     data.agenda || "",
                attendeeEmails:  extras,
                requestId:       `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              }),
            });
            const result = await r.json();
            if (result.meetLink) {
              finalMeetingLink = result.meetLink;
              calendarEventId  = result.eventId || null;
              calendarProvider = "google_meet";
              toast.success("Google Meet link generated automatically");
            }
          } else if (platform === "teams" && oauthStatus.microsoft_teams?.connected) {
            const r = await fetch(`${API}/api/oauth/microsoft/create-meeting`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ title: data.title, startTime: startISO, endTime: endISO }),
            });
            const result = await r.json();
            if (result.joinWebUrl) {
              finalMeetingLink = result.joinWebUrl;
              calendarEventId  = result.meetingId || null;
              calendarProvider = "microsoft_teams";
              toast.success("Microsoft Teams link generated automatically");
            }
          }
        }
      } catch (linkErr) {
        console.warn("Auto-generate meeting link failed:", linkErr);
        // Non-fatal — continue with null link
      } finally {
        setOauthLoading(false);
      }
    }

    await onSave({
      title:           data.title,
      customer_name:   data.customer_name  || "",
      customer_email:  data.customer_email || "",
      company_name:    data.company_name   || null,
      customer_phone:  data.customer_phone || null,
      start_time:      startISO,
      end_time:        endISO,
      timezone:        data.timezone,
      meeting_type:     mode === "online" ? platform : "in_person",
      meeting_platform: mode === "online" ? platform : null,
      mode,
      meeting_purpose:  finalPurpose,
      meeting_link:     finalMeetingLink,
      location:         mode === "offline" ? (data.location || null) : null,
      location_lat:     mode === "offline" ? locationLat : null,
      location_lng:     mode === "offline" ? locationLng : null,
      location_place_id: mode === "offline" ? (locationPlaceId || null) : null,
      location_maps_url: mode === "offline" && locationLat && locationLng
        ? `https://maps.google.com/?q=${locationLat},${locationLng}`
        : mode === "offline" && data.location
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.location)}`
        : null,
      agenda:          data.agenda || null,
      internal_notes:  internalNotes || null,
      lead_id:         !isDealLink ? (crmEntity?.id || meeting?.lead_id || null) : null,
      deal_id:         isDealLink  ? crmEntity?.id : null,
      status:          data.status,
      priority:        priority || "medium",
      _extra_emails:   extras,
      _all_day:        allDay,
      _lead_code:      crmEntity?.lead_code || null,
      _calendar_event_id: calendarEventId,
      _calendar_provider: calendarProvider,
    }, attendeeIds);
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const SectionHeader = ({ icon: Icon, label }) => (
    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, margin: "8px 0 2px" }}>
      <div style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={13} style={{ color: "#6366F1" }} />
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );

  // Read-only locked display for CRM-sourced fields
  const LockedField = ({ label, value, missing }) => (
    <div>
      <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        <Lock size={10} style={{ color: "var(--text-muted)" }} />
        {missing && <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 700, marginLeft: 4 }}>MISSING</span>}
      </label>
      <div style={{
        padding: "0 12px", height: 36, borderRadius: 8,
        border: `1px solid ${missing ? "#FCA5A5" : "var(--border)"}`,
        background: missing ? "rgba(239,68,68,0.04)" : "var(--surface-2)",
        color: value ? "var(--text)" : "#EF4444",
        fontSize: 13, display: "flex", alignItems: "center", fontWeight: value ? 600 : 500,
      }}>
        {value || (missing ? "Not set in CRM — update the lead first" : "—")}
      </div>
    </div>
  );

  // Premium calendar-grid date picker (writes the same "yyyy-MM-dd" string meetingDate always expected)
  const MiniCalendar = ({ value, onSelect }) => {
    const monthStart = startOfMonth(calendarCursor);
    const gridStart  = startOfWeek(monthStart);
    const gridEnd    = endOfWeek(endOfMonth(calendarCursor));
    const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const selectedDate = value ? new Date(`${value}T00:00:00`) : null;
    return (
      <div style={{ padding: 16, width: 300 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button type="button" onClick={() => setCalendarCursor((c) => subMonths(c, 1))}
            style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{format(calendarCursor, "MMMM yyyy")}</span>
          <button type="button" onClick={() => setCalendarCursor((c) => addMonths(c, 1))}
            style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "4px 0" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {days.map((day) => {
            const dayStr    = format(day, "yyyy-MM-dd");
            const inMonth   = isSameMonth(day, calendarCursor);
            const isSel     = selectedDate && dayStr === format(selectedDate, "yyyy-MM-dd");
            const isTodayD  = isToday(day);
            const isPastDay = day < startOfDay(new Date());
            return (
              <button key={dayStr} type="button" disabled={isPastDay}
                onClick={() => { if (isPastDay) return; onSelect(dayStr); setCalendarCursor(day); }}
                style={{
                  height: 32, borderRadius: 8, border: "none", cursor: isPastDay ? "not-allowed" : "pointer",
                  fontFamily: "inherit", fontSize: 12.5, fontWeight: isSel ? 800 : 600,
                  color: isSel ? "#fff" : isPastDay ? "var(--text-muted)" : !inMonth ? "var(--text-muted)" : "var(--text)",
                  background: isSel ? "#2563EB" : isTodayD ? "rgba(37,99,235,0.1)" : "transparent",
                  opacity: isPastDay ? 0.35 : inMonth ? 1 : 0.4,
                  outline: isTodayD && !isSel ? "1.5px solid rgba(37,99,235,0.4)" : "none",
                  outlineOffset: -1.5,
                }}>
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const canSubmit = true; // all fields editable — no gate

  // UI-only computed values
  const endTimeLabel = (() => {
    if (!meetingSlot || allDay) return null;
    const [h, m] = meetingSlot.split(":").map(Number);
    const totalMins = h * 60 + m + duration;
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    const ampm = endH >= 12 ? "PM" : "AM";
    const dispH = endH % 12 || 12;
    return `${dispH}:${String(endM).padStart(2, "0")} ${ampm}`;
  })();

  const durationLabel = (() => {
    const h = Math.floor(duration / 60);
    const m = duration % 60;
    return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
  })();

  // Conflict detection: meetings that overlap the selected date+time window
  const conflictMeetings = useMemo(() => {
    if (!meetingDate || !meetingSlot || allDay) return [];
    const startMs = new Date(`${meetingDate}T${meetingSlot}:00`).getTime();
    const endMs   = startMs + duration * 60000;
    return allMeetings.filter((mtg) => {
      if (meeting && mtg.id === meeting.id) return false;
      if (!mtg.start_time) return false;
      const ms = new Date(mtg.start_time).getTime();
      const me = mtg.end_time ? new Date(mtg.end_time).getTime() : ms + 3600000;
      return ms < endMs && me > startMs;
    });
  }, [meetingDate, meetingSlot, duration, allDay, allMeetings, meeting]);

  const externalEmailsList = externalEmails
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const watchedTitle    = watch("title");
  const watchedCompany  = watch("company_name");
  const watchedEmail    = watch("customer_email");
  const watchedLocation = watch("location");
  const watchedLink     = watch("meeting_link");
  const watchedAgenda   = watch("agenda");

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{`
        .mtg-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .mtg-grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; }
        @media (max-width: 1024px) { .mtg-grid-4 { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 640px)  { .mtg-grid-2, .mtg-grid-4 { grid-template-columns: 1fr; } }
      `}</style>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        transition={{ type: "spring", damping: 26, stiffness: 320 }}
        style={{ maxWidth: 1200, width: "96vw", maxHeight: "94vh", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", borderRadius: 18 }}
      >
        {/* ── STICKY HEADER ── */}
        <div style={{ flexShrink: 0, background: "var(--surface)", padding: "22px 32px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CalendarCheck size={22} style={{ color: "#2563EB" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em" }}>
                  {reuseFrom ? "Schedule Follow-up" : meeting ? "Edit Meeting" : "Schedule Meeting"}
                </h2>
                {selectedParent && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", display: "flex", alignItems: "center", gap: 4 }}>
                    <GitBranch size={10} /> Follow-up of {codeMap[selectedParent.id] || "MEET-?"}
                  </span>
                )}
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                {reuseFrom ? `Pre-filled from ${codeMap[reuseFrom.id] || "previous meeting"}` : meeting ? "Update details — a revised iCal invite will be sent" : "Create and schedule a meeting with CRM contacts"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!meeting && !reuseFrom && allMeetings.length > 0 && (
              <button type="button" onClick={() => setShowReuse((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 15px", borderRadius: 10, border: `1px solid ${showReuse ? "#6366F1" : "var(--border)"}`, background: showReuse ? "rgba(99,102,241,0.08)" : "var(--surface-2)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: showReuse ? "#6366F1" : "var(--text-muted)", fontFamily: "inherit", transition: "all 0.15s" }}>
                <RotateCcw size={13} /> Reuse Previous
              </button>
            )}
            <button type="button" onClick={onClose}
              style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text-muted)", fontFamily: "inherit", transition: "all 0.15s" }}>
              Cancel
            </button>
            <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X size={17} />
            </button>
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-2)" }}>
          <form onSubmit={handleSubmit(handleFormSubmit)} style={{ padding: "32px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Reuse Previous Meeting Panel */}
            {showReuse && !reuseFrom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.05),rgba(139,92,246,0.04))", border: "1.5px solid rgba(99,102,241,0.25)", borderRadius: 14, padding: 18, overflow: "hidden" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <RotateCcw size={13} style={{ color: "#6366F1" }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>Reuse a Previous Meeting</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>— auto-fill from a past meeting</span>
                </div>
                <div ref={reuseDropRef} style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none", zIndex: 1 }} />
                  <input
                    value={reuseSearch}
                    onChange={(e) => { setReuseSearch(e.target.value); setReuseDropOpen(true); }}
                    onFocus={() => setReuseDropOpen(true)}
                    placeholder="Search by MEET-001, company, title…"
                    style={{ width: "100%", boxSizing: "border-box", height: 48, paddingLeft: 40, paddingRight: 14, borderRadius: 12, border: "1.5px solid rgba(99,102,241,0.3)", background: "var(--surface)", fontSize: 14, color: "var(--text)", fontFamily: "inherit", outline: "none" }}
                  />
                  {reuseDropOpen && reuseMeetings.length > 0 && (
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid rgba(99,102,241,0.2)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.14)", zIndex: 9999, maxHeight: 280, overflowY: "auto" }}>
                      {reuseMeetings.map((src) => {
                        const code = codeMap[src.id] || "MEET-?";
                        const sm = STATUS_META[src.status] || STATUS_META.scheduled;
                        return (
                          <button key={src.id} type="button" onMouseDown={(e) => { e.preventDefault(); applyReuseMeeting(src); }}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.05)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                            <span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.08)", padding: "2px 7px", borderRadius: 6, flexShrink: 0 }}>{code}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.title || "(no title)"}</div>
                              {src.company_name && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{src.company_name}</div>}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: sm.bg, color: sm.color, flexShrink: 0 }}>{sm.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ─── SECTION 1: CRM LINK ─── */}
            <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(37,99,235,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Link2 size={15} style={{ color: "#2563EB" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>CRM Link</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Connect this meeting to a Lead, Pipeline, or Deal</div>
                </div>
              </div>

              <div ref={dropdownRef} style={{ position: "relative" }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>Search Lead / Pipeline / Deal</label>
                <div style={{ position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: lookupStatus === "found" ? "#2563EB" : "var(--text-muted)", pointerEvents: "none" }} />
                  <input
                    value={leadCodeInput}
                    onChange={(e) => handleLeadCodeChange(e.target.value)}
                    onFocus={() => setDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (!dropdownOpen) return;
                      const list = filteredSources.slice(0, 20);
                      if (e.key === "ArrowDown") { e.preventDefault(); setCrmActiveIndex((i) => Math.min(i + 1, list.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setCrmActiveIndex((i) => Math.max(i - 1, 0)); }
                      else if (e.key === "Enter") { if (crmActiveIndex >= 0 && list[crmActiveIndex]) { e.preventDefault(); selectEntity(list[crmActiveIndex]); } }
                      else if (e.key === "Escape") { setDropdownOpen(false); }
                    }}
                    placeholder="Search Lead ID, Company Name, Contact Person, Email, Phone, Pipeline or Deal…"
                    style={{ width: "100%", boxSizing: "border-box", height: 52, paddingLeft: 44, paddingRight: crmEntity ? 110 : 14, borderRadius: 12, border: `1.5px solid ${lookupStatus === "found" ? "rgba(37,99,235,0.35)" : lookupStatus === "not_found" ? "rgba(239,68,68,0.35)" : "var(--border)"}`, background: lookupStatus === "found" ? "rgba(37,99,235,0.025)" : "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s", boxShadow: dropdownOpen ? "0 0 0 3px rgba(37,99,235,0.08)" : "none" }}
                  />
                  {crmEntity && (
                    <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: crmEntity._src === "deal" ? "rgba(251,146,60,0.12)" : "rgba(37,99,235,0.1)", color: crmEntity._src === "deal" ? "#EA580C" : "#2563EB", textTransform: "uppercase" }}>
                        {crmEntity._src === "deal" ? "Deal" : crmEntity._src === "pipeline" ? "Pipeline" : "Lead"}
                      </span>
                      <button type="button" onClick={clearSelection} style={{ width: 22, height: 22, borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>

                {dropdownOpen && (() => {
                  const q = leadCodeInput.trim().toUpperCase();
                  const list = filteredSources.slice(0, 20);
                  const recentEntities = !q ? recentCrmSearches.map((id) => allCrmSources.find((x) => x.id === id)).filter(Boolean) : [];
                  const recentIds = new Set(recentEntities.map((x) => x.id));
                  const mainList = list.filter((x) => !recentIds.has(x.id));
                  const highlight = (str) => {
                    if (!q || !str) return str || "";
                    const idx = str.toUpperCase().indexOf(q);
                    if (idx === -1) return str;
                    return <>{str.slice(0, idx)}<strong style={{ color: "#2563EB" }}>{str.slice(idx, idx + q.length)}</strong>{str.slice(idx + q.length)}</>;
                  };
                  const Row = ({ item, idx }) => (
                    <button key={item.id} type="button"
                      onMouseDown={(e) => { e.preventDefault(); selectEntity(item); }}
                      onMouseEnter={() => setCrmActiveIndex(idx)}
                      style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", background: idx === crmActiveIndex ? "rgba(37,99,235,0.06)" : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <span style={{ flexShrink: 0, fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: item._src === "deal" ? "#EA580C" : "#2563EB", background: item._src === "deal" ? "rgba(234,88,12,0.08)" : "rgba(37,99,235,0.08)", padding: "2px 7px", borderRadius: 5, marginTop: 2 }}>
                        {item._src === "deal" ? "DEAL" : item._src === "pipeline" ? "PIPE" : (item.lead_code || "—")}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {highlight(item.company_name || item.title || "")}
                        </div>
                        {(item.contact_name || item.email || item.phone) && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {item.contact_name && <span>{highlight(item.contact_name)}</span>}
                            {item.contact_name && (item.email || item.phone) && <span>·</span>}
                            {item.email && <span>{item.email}</span>}
                            {item.email && item.phone && <span>·</span>}
                            {item.phone && <span>{item.phone}</span>}
                          </div>
                        )}
                      </div>
                      <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: item._src === "deal" ? "rgba(251,146,60,0.1)" : "rgba(37,99,235,0.08)", color: item._src === "deal" ? "#EA580C" : "#2563EB", textTransform: "uppercase", marginTop: 2 }}>
                        {item._src}
                      </span>
                    </button>
                  );
                  return (
                    <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.14)", zIndex: 9999, maxHeight: 340, overflowY: "auto" }}>
                      {recentEntities.length > 0 && (
                        <>
                          <div style={{ padding: "8px 16px 4px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                            <RotateCcw size={10} /> Recent Searches
                          </div>
                          {recentEntities.map((item, i) => <Row key={item.id} item={item} idx={i} />)}
                        </>
                      )}
                      {mainList.length > 0 ? (
                        mainList.map((item, i) => <Row key={item.id} item={item} idx={recentEntities.length + i} />)
                      ) : recentEntities.length === 0 && (
                        q ? (
                          <div style={{ padding: "28px 16px", textAlign: "center" }}>
                            <Search size={22} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>No results found</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>No lead, pipeline, or deal matches "{leadCodeInput.trim()}"</div>
                          </div>
                        ) : (
                          <div style={{ padding: "28px 16px", textAlign: "center" }}>
                            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No CRM records available yet</div>
                          </div>
                        )
                      )}
                    </div>
                  );
                })()}

                {noPocError && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 9, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 12.5, color: "#EF4444", fontWeight: 600 }}>
                    No contact person found for this lead. Update the lead in CRM first.
                  </div>
                )}
              </div>
            </div>

            {/* ─── SECTION 2: MEETING TYPE ─── */}
            <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Video size={15} style={{ color: "#10B981" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Meeting Type</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Choose how the meeting will be conducted</div>
                </div>
              </div>

              {/* Meeting Type custom dropdown */}
              {(() => {
                const MTG_TYPES = [
                  { value: "online",  label: "Virtual Meeting",   desc: "Video call, phone, or online collaboration", Icon: Video,  color: "#3B82F6" },
                  { value: "offline", label: "In-Person Meeting", desc: "On-site, office visit, or field meeting",    Icon: MapPin, color: "#10B981" },
                ];
                const selected = MTG_TYPES.find((t) => t.value === mode) || MTG_TYPES[0];
                return (
                  <div ref={meetingTypeDropRef} style={{ position: "relative", marginBottom: 20 }}>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>Meeting Mode</label>
                    <button
                      type="button"
                      onClick={() => setMeetingTypeDropOpen((v) => !v)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, height: 50, padding: "0 14px 0 16px", borderRadius: 12, border: `1.5px solid ${meetingTypeDropOpen ? "rgba(37,99,235,0.4)" : "var(--border)"}`, background: "var(--surface)", cursor: "pointer", fontFamily: "inherit", boxShadow: meetingTypeDropOpen ? "0 0 0 3px rgba(37,99,235,0.08)" : "none", transition: "all 0.15s" }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${selected.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <selected.Icon size={16} style={{ color: selected.color }} />
                      </div>
                      <div style={{ flex: 1, textAlign: "left" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{selected.label}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{selected.desc}</div>
                      </div>
                      <ChevronDown size={16} style={{ color: "var(--text-muted)", flexShrink: 0, transform: meetingTypeDropOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </button>
                    <AnimatePresence>
                      {meetingTypeDropOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
                          style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.14)", zIndex: 9999, overflow: "hidden" }}>
                          {MTG_TYPES.map((t) => (
                            <button key={t.value} type="button"
                              onMouseDown={(e) => { e.preventDefault(); setMode(t.value); setMeetingTypeDropOpen(false); }}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: mode === t.value ? `${t.color}08` : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                              onMouseEnter={(e) => { if (mode !== t.value) e.currentTarget.style.background = "var(--surface-2)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = mode === t.value ? `${t.color}08` : "none"; }}
                            >
                              <div style={{ width: 34, height: 34, borderRadius: 9, background: `${t.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <t.Icon size={17} style={{ color: t.color }} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{t.label}</div>
                                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.desc}</div>
                              </div>
                              {mode === t.value && <CheckCircle2 size={16} style={{ color: t.color, flexShrink: 0 }} />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}

              {/* Virtual: Platform + Link */}
              {mode === "online" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {(() => {
                    const PLATFORMS = [
                      { value: "google_meet", label: "Google Meet",     desc: "Google Workspace video calls",    Icon: Video,   color: "#1A73E8" },
                      { value: "teams",       label: "Microsoft Teams", desc: "Microsoft 365 collaboration",     Icon: Users,   color: "#5558AF" },
                      { value: "zoom",        label: "Zoom",            desc: "Zoom video conferencing",         Icon: Video,   color: "#2D8CFF" },
                      { value: "jitsi",       label: "Jitsi (Free)",    desc: "Open-source, no account needed",  Icon: Globe2,  color: "#F5A623" },
                      { value: "custom",      label: "Custom Link",     desc: "Any other meeting platform",      Icon: Link2,   color: "#6366F1" },
                    ];
                    const selPlatform = PLATFORMS.find((p) => p.value === platform) || PLATFORMS[0];
                    return (
                      <div ref={platformDropRef} style={{ position: "relative" }}>
                        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>Meeting Platform</label>
                        <button
                          type="button"
                          onClick={() => setPlatformDropOpen((v) => !v)}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, height: 50, padding: "0 14px 0 16px", borderRadius: 12, border: `1.5px solid ${platformDropOpen ? "rgba(37,99,235,0.4)" : "var(--border)"}`, background: "var(--surface)", cursor: "pointer", fontFamily: "inherit", boxShadow: platformDropOpen ? "0 0 0 3px rgba(37,99,235,0.08)" : "none", transition: "all 0.15s" }}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${selPlatform.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <selPlatform.Icon size={16} style={{ color: selPlatform.color }} />
                          </div>
                          <div style={{ flex: 1, textAlign: "left" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{selPlatform.label}</div>
                            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{selPlatform.desc}</div>
                          </div>
                          <ChevronDown size={16} style={{ color: "var(--text-muted)", flexShrink: 0, transform: platformDropOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                        </button>
                        <AnimatePresence>
                          {platformDropOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
                              style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.14)", zIndex: 9999, overflow: "hidden" }}>
                              {PLATFORMS.map((p) => (
                                <button key={p.value} type="button"
                                  onMouseDown={(e) => { e.preventDefault(); setPlatform(p.value); setPlatformDropOpen(false); if (p.value === "jitsi" && !watchLink) handleGenerateJitsi(); }}
                                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: platform === p.value ? `${p.color}08` : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                                  onMouseEnter={(e) => { if (platform !== p.value) e.currentTarget.style.background = "var(--surface-2)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = platform === p.value ? `${p.color}08` : "none"; }}
                                >
                                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${p.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <p.Icon size={15} style={{ color: p.color }} />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{p.label}</div>
                                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{p.desc}</div>
                                  </div>
                                  {platform === p.value && <CheckCircle2 size={15} style={{ color: p.color, flexShrink: 0 }} />}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })()}

                  {(platform === "google_meet" || platform === "teams") && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: oauthStatus[platform === "google_meet" ? "google_meet" : "microsoft_teams"]?.connected ? "rgba(16,185,129,0.06)" : "rgba(251,146,60,0.06)", border: `1px solid ${oauthStatus[platform === "google_meet" ? "google_meet" : "microsoft_teams"]?.connected ? "rgba(16,185,129,0.2)" : "rgba(251,146,60,0.2)"}` }}>
                      {oauthStatus[platform === "google_meet" ? "google_meet" : "microsoft_teams"]?.connected ? (
                        <div style={{ fontSize: 12.5, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          <CheckCircle2 size={13} /> {platform === "google_meet" ? "Google Meet" : "Microsoft Teams"} connected — link auto-generates on schedule
                        </div>
                      ) : (
                        <div style={{ fontSize: 12.5, color: "#F59E0B", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          <AlertCircle size={13} /> {platform === "google_meet" ? "Google" : "Microsoft"} not connected — connect in Settings → Integrations, or paste a link below
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                      Meeting Link
                      {platform === "jitsi" && (
                        <button type="button" onClick={handleGenerateJitsi}
                          style={{ marginLeft: 10, fontSize: 11.5, color: "#6366F1", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                          ↻ Generate Jitsi Link
                        </button>
                      )}
                    </label>
                    <input
                      {...register("meeting_link")}
                      placeholder="Meeting link will appear here or enter a custom URL"
                      style={{ width: "100%", boxSizing: "border-box", height: 50, padding: "0 14px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none" }}
                    />
                  </div>
                </div>
              )}

              {/* In-Person: Location */}
              {mode === "offline" && (
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>Location / Venue</label>
                  {import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
                    <GoogleMapsAutocomplete
                      inputId="meeting-location-input"
                      apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                      onPlaceSelected={(place) => {
                        setValue("location", place.formattedAddress);
                        setLocationLat(place.lat);
                        setLocationLng(place.lng);
                        setLocationPlaceId(place.placeId || null);
                      }}
                    />
                  )}
                  <input
                    id="meeting-location-input"
                    {...register("location")}
                    placeholder="Search address or venue name…"
                    onChange={(e) => { if (!e.target.value) { setLocationLat(null); setLocationLng(null); setLocationPlaceId(null); } }}
                    style={{ width: "100%", boxSizing: "border-box", height: 50, padding: "0 14px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none" }}
                  />
                  {locationLat && locationLng && (
                    <>
                      {import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
                        <div style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
                          <img
                            src={`https://maps.googleapis.com/maps/api/staticmap?center=${locationLat},${locationLng}&zoom=15&size=640x180&scale=2&markers=color:red%7C${locationLat},${locationLng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
                            alt="Location preview"
                            style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                          />
                        </div>
                      )}
                      <a href={`https://maps.google.com/?q=${locationLat},${locationLng}${locationPlaceId ? `&query_place_id=${locationPlaceId}` : ""}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 12, fontWeight: 600, color: "#10B981", textDecoration: "none", padding: "5px 10px", borderRadius: 6, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                        <MapPin size={11} /> View on Google Maps ↗
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ─── SECTION 3: CONTACT INFORMATION ─── */}
            <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(99,102,241,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User size={15} style={{ color: "#6366F1" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Contact Information</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Auto-filled from CRM when linked · Editable</div>
                </div>
              </div>
              <div className="mtg-grid-2">
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                    Company Name <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 99, background: "#EF4444", marginLeft: 5 }} />
                  </label>
                  <input {...register("company_name", { required: "Company name is required" })} placeholder="e.g. Acme Corporation" style={{ width: "100%", boxSizing: "border-box", height: 50, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${errors.company_name ? "rgba(239,68,68,0.5)" : "var(--border)"}`, background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none" }} />
                  {errors.company_name && <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><AlertCircle size={11} />{errors.company_name.message}</div>}
                </div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                    Contact Person <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 99, background: "#EF4444", marginLeft: 5 }} />
                  </label>
                  <input {...register("customer_name", { required: "Contact name is required" })} placeholder="Full name" style={{ width: "100%", boxSizing: "border-box", height: 50, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${errors.customer_name ? "rgba(239,68,68,0.5)" : "var(--border)"}`, background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none" }} />
                  {errors.customer_name && <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><AlertCircle size={11} />{errors.customer_name.message}</div>}
                </div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                    Contact Person Email <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 99, background: "#EF4444", marginLeft: 5 }} />
                  </label>
                  <input {...register("customer_email", { required: "Email is required" })} type="email" placeholder="contact@company.com" style={{ width: "100%", boxSizing: "border-box", height: 50, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${errors.customer_email ? "rgba(239,68,68,0.5)" : "var(--border)"}`, background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none" }} />
                  {errors.customer_email && <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><AlertCircle size={11} />{errors.customer_email.message}</div>}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>Contact Number</label>
                  <input {...register("customer_phone")} placeholder="+91 98765 43210" style={{ width: "100%", boxSizing: "border-box", height: 50, padding: "0 14px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none" }} />
                </div>
              </div>
            </div>

            {/* ─── SECTION 4: MEETING INFORMATION ─── */}
            <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(245,158,11,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ClipboardList size={15} style={{ color: "#F59E0B" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Meeting Information</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Agenda, timing, and scheduling details</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={{ display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                    Meeting Purpose <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 99, background: "#EF4444", marginLeft: 5 }} />
                  </label>
                  <select value={purpose} onChange={(e) => { setPurpose(e.target.value); setPurposeError(false); }} style={{ width: "100%", height: 50, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${purposeError ? "rgba(239,68,68,0.5)" : "var(--border)"}`, background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                    <option value="">Select purpose…</option>
                    {MEETING_PURPOSES.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
                  </select>
                  {purpose === "others" && (
                    <input value={purposeOther} onChange={(e) => setPurposeOther(e.target.value)} placeholder="Specify purpose…" style={{ width: "100%", boxSizing: "border-box", height: 50, padding: "0 14px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none", marginTop: 10 }} />
                  )}
                  {purposeError && <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><AlertCircle size={11} />Meeting purpose is required</div>}
                </div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                    Agenda <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 99, background: "#EF4444", marginLeft: 5 }} />
                  </label>
                  <textarea {...register("agenda", { required: "Agenda is required" })} placeholder="What will be discussed? Key topics, goals, expected outcomes…" rows={4} style={{ width: "100%", boxSizing: "border-box", padding: "14px", borderRadius: 12, border: `1.5px solid ${errors.agenda ? "rgba(239,68,68,0.5)" : "var(--border)"}`, background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.55 }} />
                  {errors.agenda && <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><AlertCircle size={11} />{errors.agenda.message}</div>}
                </div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                    Meeting Title <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 99, background: "#EF4444", marginLeft: 5 }} />
                  </label>
                  <input {...register("title", { required: "Title is required" })} placeholder="e.g. Q3 Strategy Review — Acme Corp" style={{ width: "100%", boxSizing: "border-box", height: 50, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${errors.title ? "rgba(239,68,68,0.5)" : "var(--border)"}`, background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none" }} />
                  {errors.title && <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><AlertCircle size={11} />{errors.title.message}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button type="button" onClick={() => setAllDay((v) => !v)}
                    style={{ width: 40, height: 22, borderRadius: 11, background: allDay ? "#2563EB" : "var(--border)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 3, left: allDay ? 21 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </button>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>All-day meeting</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>— no specific time slot</span>
                </div>
                <div className="mtg-grid-2">
                  {/* Meeting Date — premium calendar popover */}
                  <div ref={dateDropRef} style={{ position: "relative" }}>
                    <label style={{ display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                      Meeting Date <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 99, background: "#EF4444", marginLeft: 5 }} />
                    </label>
                    <button type="button" onClick={() => setDateDropOpen((v) => !v)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, height: 50, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${dateDropOpen ? "rgba(37,99,235,0.4)" : "var(--border)"}`, background: "var(--surface)", cursor: "pointer", fontFamily: "inherit", boxShadow: dateDropOpen ? "0 0 0 3px rgba(37,99,235,0.08)" : "none", transition: "all 0.15s" }}>
                      <Calendar size={16} style={{ color: "#2563EB", flexShrink: 0 }} />
                      <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: meetingDate ? 600 : 400, color: meetingDate ? "var(--text)" : "var(--text-muted)" }}>
                        {meetingDate ? new Date(`${meetingDate}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Select date…"}
                      </span>
                      <ChevronDown size={15} style={{ color: "var(--text-muted)", flexShrink: 0, transform: dateDropOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </button>
                    <AnimatePresence>
                      {dateDropOpen && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
                          style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.16)", zIndex: 9999 }}>
                          <MiniCalendar value={meetingDate} onSelect={(d) => { setMeetingDate(d); setDateDropOpen(false); }} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Duration — premium dropdown */}
                  <div ref={durationDropRef} style={{ position: "relative" }}>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>Duration</label>
                    <button type="button" onClick={() => setDurationDropOpen((v) => !v)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, height: 50, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${durationDropOpen ? "rgba(37,99,235,0.4)" : "var(--border)"}`, background: "var(--surface)", cursor: "pointer", fontFamily: "inherit", boxShadow: durationDropOpen ? "0 0 0 3px rgba(37,99,235,0.08)" : "none", transition: "all 0.15s" }}>
                      <Clock size={16} style={{ color: "#2563EB", flexShrink: 0 }} />
                      <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{isCustomDuration ? "Custom" : DURATIONS.find((d) => d.value === duration)?.label}</span>
                      <ChevronDown size={15} style={{ color: "var(--text-muted)", flexShrink: 0, transform: durationDropOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </button>
                    <AnimatePresence>
                      {durationDropOpen && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
                          style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.14)", zIndex: 9999, maxHeight: 260, overflowY: "auto" }}>
                          {DURATIONS.map((d) => (
                            <button key={d.value} type="button" onMouseDown={(e) => { e.preventDefault(); setDuration(d.value); setIsCustomDuration(false); setDurationDropOpen(false); }}
                              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: !isCustomDuration && duration === d.value ? "rgba(37,99,235,0.06)" : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "var(--text)" }}
                              onMouseEnter={(e) => { if (isCustomDuration || duration !== d.value) e.currentTarget.style.background = "var(--surface-2)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = !isCustomDuration && duration === d.value ? "rgba(37,99,235,0.06)" : "none"; }}>
                              {d.label}
                              {!isCustomDuration && duration === d.value && <CheckCircle2 size={15} style={{ color: "#2563EB" }} />}
                            </button>
                          ))}
                          <button type="button" onMouseDown={(e) => { e.preventDefault(); setIsCustomDuration(true); setDurationDropOpen(false); }}
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: isCustomDuration ? "rgba(37,99,235,0.06)" : "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "var(--text)" }}
                            onMouseEnter={(e) => { if (!isCustomDuration) e.currentTarget.style.background = "var(--surface-2)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = isCustomDuration ? "rgba(37,99,235,0.06)" : "none"; }}>
                            Custom
                            {isCustomDuration && <CheckCircle2 size={15} style={{ color: "#2563EB" }} />}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {isCustomDuration && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <input type="number" min={5} step={5} value={duration}
                          onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 0))}
                          style={{ width: "100%", boxSizing: "border-box", height: 42, padding: "0 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--text)", fontFamily: "inherit", outline: "none" }} />
                        <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600, flexShrink: 0 }}>minutes</span>
                      </div>
                    )}
                  </div>
                </div>
                {!allDay && (
                  <div className="mtg-grid-2">
                    {/* Start Time — premium dropdown */}
                    <div ref={timeDropRef} style={{ position: "relative" }}>
                      <label style={{ display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                        Start Time <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 99, background: "#EF4444", marginLeft: 5 }} />
                      </label>
                      <button type="button" onClick={() => setTimeDropOpen((v) => !v)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, height: 50, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${timeDropOpen ? "rgba(37,99,235,0.4)" : "var(--border)"}`, background: "var(--surface)", cursor: "pointer", fontFamily: "inherit", boxShadow: timeDropOpen ? "0 0 0 3px rgba(37,99,235,0.08)" : "none", transition: "all 0.15s" }}>
                        <Clock size={16} style={{ color: "#2563EB", flexShrink: 0 }} />
                        <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: meetingSlot ? 600 : 400, color: meetingSlot ? "var(--text)" : "var(--text-muted)" }}>
                          {TIME_SLOTS.find((s) => s.value === meetingSlot)?.label || "Select time…"}
                        </span>
                        <ChevronDown size={15} style={{ color: "var(--text-muted)", flexShrink: 0, transform: timeDropOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                      </button>
                      <AnimatePresence>
                        {timeDropOpen && (
                          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
                            style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.14)", zIndex: 9999, maxHeight: 280, overflowY: "auto" }}>
                            {TIME_SLOTS.map((s) => (
                              <button key={s.value} type="button" onMouseDown={(e) => { e.preventDefault(); setMeetingSlot(s.value); setTimeDropOpen(false); }}
                                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: meetingSlot === s.value ? "rgba(37,99,235,0.06)" : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "var(--text)" }}
                                onMouseEnter={(e) => { if (meetingSlot !== s.value) e.currentTarget.style.background = "var(--surface-2)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = meetingSlot === s.value ? "rgba(37,99,235,0.06)" : "none"; }}>
                                {s.label}
                                {meetingSlot === s.value && <CheckCircle2 size={15} style={{ color: "#2563EB" }} />}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>End Time (auto)</label>
                      <div style={{ height: 50, padding: "0 14px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--surface-2)", fontSize: 15, color: endTimeLabel ? "var(--text)" : "var(--text-muted)", display: "flex", alignItems: "center", fontWeight: endTimeLabel ? 600 : 400 }}>
                        {endTimeLabel || "Calculated from start + duration"}
                      </div>
                    </div>
                  </div>
                )}
                <div className="mtg-grid-2">
                  {/* Timezone — searchable premium dropdown */}
                  <div ref={timezoneDropRef} style={{ position: "relative" }}>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>Time Zone</label>
                    <button type="button" onClick={() => setTimezoneDropOpen((v) => !v)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, height: 50, padding: "0 14px", borderRadius: 12, border: `1.5px solid ${timezoneDropOpen ? "rgba(37,99,235,0.4)" : "var(--border)"}`, background: "var(--surface)", cursor: "pointer", fontFamily: "inherit", boxShadow: timezoneDropOpen ? "0 0 0 3px rgba(37,99,235,0.08)" : "none", transition: "all 0.15s" }}>
                      <Globe size={16} style={{ color: "#2563EB", flexShrink: 0 }} />
                      <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{watch("timezone")}</span>
                      <ChevronDown size={15} style={{ color: "var(--text-muted)", flexShrink: 0, transform: timezoneDropOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </button>
                    <AnimatePresence>
                      {timezoneDropOpen && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
                          style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.14)", zIndex: 9999, overflow: "hidden" }}>
                          <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                            <input autoFocus value={timezoneSearch} onChange={(e) => setTimezoneSearch(e.target.value)} placeholder="Search timezone…"
                              style={{ width: "100%", boxSizing: "border-box", height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none" }} />
                          </div>
                          <div style={{ maxHeight: 220, overflowY: "auto" }}>
                            {TIMEZONES.filter((tz) => tz.toLowerCase().includes(timezoneSearch.trim().toLowerCase())).map((tz) => (
                              <button key={tz} type="button" onMouseDown={(e) => { e.preventDefault(); setValue("timezone", tz); setTimezoneDropOpen(false); setTimezoneSearch(""); }}
                                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: watch("timezone") === tz ? "rgba(37,99,235,0.06)" : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}
                                onMouseEnter={(e) => { if (watch("timezone") !== tz) e.currentTarget.style.background = "var(--surface-2)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = watch("timezone") === tz ? "rgba(37,99,235,0.06)" : "none"; }}>
                                {tz}
                                {watch("timezone") === tz && <CheckCircle2 size={14} style={{ color: "#2563EB" }} />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>Status</label>
                    <select {...register("status")} style={{ width: "100%", height: 50, padding: "0 14px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                      {Object.entries(STATUS_META).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
                    </select>
                  </div>
                </div>
                {meetingDate && meetingSlot && (
                  <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Clock size={14} style={{ color: "#2563EB", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                      {(() => { try { const d = new Date(`${meetingDate}T${meetingSlot}:00`); return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " at " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } })()}
                      {endTimeLabel && ` → ${endTimeLabel}`}
                      {durationLabel && ` (${durationLabel})`}
                    </span>
                  </div>
                )}
                {conflictMeetings.length > 0 && (
                  <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <AlertCircle size={14} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#EF4444" }}>Schedule Conflict</div>
                      <div style={{ fontSize: 12, color: "#EF4444", marginTop: 2 }}>{conflictMeetings.map((m) => m.title || "Untitled").join(", ")} overlaps this time slot</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ─── SECTION 5: PARTICIPANTS ─── */}
            <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(139,92,246,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Users size={15} style={{ color: "#8B5CF6" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Participants</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Add team members and external contacts</div>
                </div>
              </div>
              <div className="mtg-grid-2">
                {/* Internal Team */}
                <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: 16, border: "1.5px solid var(--border)" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Users size={13} style={{ color: "#8B5CF6" }} />
                    Internal Team
                    {attendeeIds.length > 0 && (<span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "rgba(139,92,246,0.12)", color: "#8B5CF6" }}>{attendeeIds.length} selected</span>)}
                  </div>
                  {attendeeIds.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {attendeeIds.map((id) => {
                        const tm = teamMembers.find((x) => x.id === id);
                        if (!tm) return null;
                        return (
                          <div key={id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px 3px 6px", borderRadius: 99, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
                            <div style={{ width: 20, height: 20, borderRadius: 10, background: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>
                              {(tm.name || tm.email || "?")[0].toUpperCase()}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#8B5CF6" }}>{tm.name || tm.email}</span>
                            <button type="button" onClick={() => toggleAttendee(id)} style={{ width: 14, height: 14, borderRadius: 7, background: "rgba(139,92,246,0.2)", border: "none", cursor: "pointer", color: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 }}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div ref={teamDropRef} style={{ position: "relative" }}>
                    <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none", zIndex: 1 }} />
                    <input value={teamSearch} onChange={(e) => { setTeamSearch(e.target.value); setTeamDropOpen(true); }} onFocus={() => setTeamDropOpen(true)} placeholder="Search team member…" style={{ width: "100%", boxSizing: "border-box", height: 38, paddingLeft: 30, paddingRight: 10, borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none" }} />
                    {teamDropOpen && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.12)", zIndex: 9999, maxHeight: 200, overflowY: "auto" }}>
                        {teamMembers.filter((tm) => { const q = teamSearch.trim().toLowerCase(); return !q || (tm.name || "").toLowerCase().includes(q) || (tm.email || "").toLowerCase().includes(q); }).map((tm) => (
                          <button key={tm.id} type="button"
                            onMouseDown={(e) => { e.preventDefault(); toggleAttendee(tm.id); setTeamSearch(""); setTeamDropOpen(false); }}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: attendeeIds.includes(tm.id) ? "rgba(139,92,246,0.06)" : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                            onMouseEnter={(e) => { if (!attendeeIds.includes(tm.id)) e.currentTarget.style.background = "var(--surface-2)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = attendeeIds.includes(tm.id) ? "rgba(139,92,246,0.06)" : "none"; }}>
                            <div style={{ width: 26, height: 26, borderRadius: 13, background: attendeeIds.includes(tm.id) ? "#8B5CF6" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: attendeeIds.includes(tm.id) ? "#fff" : "var(--text-muted)", flexShrink: 0 }}>
                              {(tm.name || tm.email || "?")[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tm.name || tm.email}</div>
                              {tm.name && tm.email && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{tm.email}</div>}
                            </div>
                            {attendeeIds.includes(tm.id) && <CheckCircle2 size={13} style={{ color: "#8B5CF6", flexShrink: 0 }} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* External Invitees */}
                <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: 16, border: "1.5px solid var(--border)" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Mail size={13} style={{ color: "#2563EB" }} />
                    External Invitees
                    {externalEmailsList.length > 0 && (<span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "rgba(37,99,235,0.12)", color: "#2563EB" }}>{externalEmailsList.length} added</span>)}
                  </div>
                  {externalEmailsList.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {externalEmailsList.map((email) => (
                        <div key={email} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 99, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#2563EB" }}>{email}</span>
                          <button type="button" onClick={() => setExternalEmails((prev) => prev.split(",").map((e) => e.trim()).filter((e) => e && e !== email).join(", "))} style={{ width: 14, height: 14, borderRadius: 7, background: "rgba(37,99,235,0.2)", border: "none", cursor: "pointer", color: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Add emails (comma-separated)</label>
                  <div ref={extDropRef} style={{ position: "relative" }}>
                    <textarea
                      value={externalEmails}
                      onChange={(e) => { setExternalEmails(e.target.value); setExtDropOpen(true); }}
                      onFocus={() => setExtDropOpen(true)}
                      placeholder="john@example.com, jane@company.com"
                      rows={3}
                      style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none", resize: "none" }}
                    />
                    {extDropOpen && (() => {
                      const lastToken = externalEmails.split(",").pop().trim().toLowerCase();
                      if (!lastToken) return null;
                      const crmEmails = allCrmSources.map((x) => x.email).filter(Boolean);
                      const teamEmailsList = teamMembers.map((x) => x.email).filter(Boolean);
                      const suggestions = [...new Set([...crmEmails, ...teamEmailsList])]
                        .filter((e) => e.toLowerCase().includes(lastToken) && !externalEmailsList.includes(e))
                        .slice(0, 6);
                      if (suggestions.length === 0) return null;
                      return (
                        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.12)", zIndex: 9999, overflow: "hidden" }}>
                          {suggestions.map((email) => (
                            <button key={email} type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const parts = externalEmails.split(",").map((x) => x.trim()).filter(Boolean);
                                parts.pop();
                                setExternalEmails([...parts, email].join(", ") + ", ");
                              }}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                              <Mail size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                              {email}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <button type="submit" style={{ display: "none" }} />
          </form>
        </div>

        {/* ── STICKY FOOTER ── */}
        <div style={{ flexShrink: 0, background: "var(--surface)", padding: "18px 32px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
          <button type="button" onClick={onClose}
            style={{ height: 48, padding: "0 24px", borderRadius: 12, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--text-muted)", fontFamily: "inherit", transition: "all 0.15s" }}>
            Cancel
          </button>
          <button type="button" disabled={isSubmitting || oauthLoading}
            onClick={() => { handleSubmit((data) => { if (!meetingDate) { toast.error("Select a meeting date"); return; } if (!allDay && !meetingSlot) { toast.error("Select a meeting time slot"); return; } if (!purpose) { setPurposeError(true); toast.error("Select a meeting purpose"); return; } setShowReview(true); })(); }}
            style={{ height: 48, padding: "0 32px", borderRadius: 12, border: "none", background: isSubmitting || oauthLoading ? "var(--border)" : "linear-gradient(135deg, #2563EB, #1D4ED8)", cursor: isSubmitting || oauthLoading ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px rgba(37,99,235,0.3)", transition: "all 0.15s" }}>
            {isSubmitting || oauthLoading ? (
              <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: 8, animation: "spin 0.8s linear infinite" }} /> Processing…</>
            ) : meeting ? (
              <><CheckCircle2 size={16} /> Save Changes</>
            ) : (
              <>Review <ArrowRight size={16} /></>
            )}
          </button>
        </div>

        {/* ── REVIEW OVERLAY ── */}
        <AnimatePresence>
          {showReview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", background: "var(--surface)", borderRadius: 20, overflow: "hidden" }}
            >
              <div style={{ flexShrink: 0, padding: "18px 28px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(37,99,235,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CalendarCheck size={18} style={{ color: "#2563EB" }} />
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Review Meeting Details</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>Confirm everything before scheduling</div>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-2)", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
                {crmEntity && (
                  <div style={{ background: "var(--surface)", borderRadius: 12, padding: 18, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>CRM Link</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: crmEntity._src === "deal" ? "rgba(234,88,12,0.1)" : "rgba(37,99,235,0.1)", color: crmEntity._src === "deal" ? "#EA580C" : "#2563EB", textTransform: "uppercase" }}>{crmEntity._src}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{crmEntity.company_name || crmEntity.title || "—"}</span>
                      {crmEntity.lead_code && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>({crmEntity.lead_code})</span>}
                    </div>
                  </div>
                )}
                <div style={{ background: "var(--surface)", borderRadius: 12, padding: 18, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 14 }}>Meeting Details</div>
                  <div className="mtg-grid-2">
                    {[
                      { label: "Title",    value: watchedTitle   },
                      { label: "Company",  value: watchedCompany },
                      { label: "Platform", value: mode === "online" ? PLATFORM_LABELS[platform] : "In-Person" },
                      { label: "Duration", value: DURATIONS.find((d) => d.value === duration)?.label || `${duration} min` },
                      { label: "Date",     value: meetingDate ? new Date(`${meetingDate}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—" },
                      { label: "Time",     value: meetingSlot ? TIME_SLOTS.find((s) => s.value === meetingSlot)?.label || meetingSlot : allDay ? "All Day" : "—" },
                      { label: "Timezone", value: watch("timezone") },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 700 }}>{value || "—"}</div>
                      </div>
                    ))}
                    {watchedAgenda && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>Agenda</div>
                        <div style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 600, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{watchedAgenda}</div>
                      </div>
                    )}
                    {mode === "online" && watchedLink && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>Meeting Link</div>
                        <a href={watchedLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#2563EB", fontWeight: 600, wordBreak: "break-all" }}>{watchedLink}</a>
                      </div>
                    )}
                    {mode === "offline" && watchedLocation && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>Location</div>
                        <div style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 700 }}>{watchedLocation}</div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 12, padding: 18, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 14 }}>Participants</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>Internal Team ({attendeeIds.length})</div>
                      {attendeeIds.length === 0 ? (
                        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No team members added</div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {attendeeIds.map((id) => {
                            const tm = teamMembers.find((x) => x.id === id);
                            if (!tm) return null;
                            return (
                              <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 4px", borderRadius: 99, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
                                <div style={{ width: 18, height: 18, borderRadius: 9, background: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{(tm.name || tm.email || "?")[0].toUpperCase()}</div>
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#8B5CF6" }}>{tm.name || tm.email}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {externalEmailsList.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>External Invitees ({externalEmailsList.length})</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {externalEmailsList.map((email) => (
                            <div key={email} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 4px", borderRadius: 99, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)" }}>
                              <div style={{ width: 18, height: 18, borderRadius: 9, background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{email[0].toUpperCase()}</div>
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#2563EB" }}>{email}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ flexShrink: 0, background: "var(--surface)", padding: "18px 32px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button type="button" onClick={() => setShowReview(false)}
                  style={{ height: 48, padding: "0 24px", borderRadius: 12, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--text-muted)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7 }}>
                  <ChevronLeft size={16} /> Back
                </button>
                <button type="button" disabled={isSubmitting || oauthLoading}
                  onClick={() => handleSubmit(handleFormSubmit)()}
                  style={{ height: 48, padding: "0 32px", borderRadius: 12, border: "none", background: isSubmitting || oauthLoading ? "var(--border)" : "linear-gradient(135deg, #2563EB, #1D4ED8)", cursor: isSubmitting || oauthLoading ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}>
                  {isSubmitting || oauthLoading ? (
                    <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: 8, animation: "spin 0.8s linear infinite" }} /> Processing…</>
                  ) : (
                    <><CalendarCheck size={16} /> Schedule Meeting</>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ─── Meeting Detail Panel ─────────────────────────────────────────────────────

function MeetingDetailPanel({ meeting, codeMap, canDelete, onClose, onEdit, onComplete, onDelete, onFollowUp }) {
  if (!meeting) return null;

  const sm        = STATUS_META[meeting.status] || STATUS_META.scheduled;
  const isOverdue = meeting.status === "scheduled" && meeting.start_time && isPast(new Date(meeting.start_time));
  const isOnline  = meeting.mode === "online" || meeting.meeting_type !== "in_person";
  const fmtDT     = (d) => { try { return format(new Date(d), "EEE, MMM d, yyyy"); } catch { return "—"; } };
  const fmtTime   = (d) => { try { return format(new Date(d), "h:mm a"); } catch { return null; } };
  const platformLabel = { google_meet: "Google Meet", teams: "MS Teams", zoom: "Zoom", custom: "Custom Link" };

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 420, maxWidth: "95vw", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "-6px 0 32px rgba(0,0,0,0.12)", zIndex: 40, display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "2px 7px", borderRadius: 6, border: "1px solid rgba(99,102,241,0.18)" }}>
                {codeMap[meeting.id] || "—"}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: sm.bg, color: sm.color }}>{sm.label}</span>
              {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.08)", padding: "2px 6px", borderRadius: 99 }}>Overdue</span>}
              {meeting.priority && <PriorityBadge priority={meeting.priority} />}
            </div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)", lineHeight: 1.3 }}>{meeting.title}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4, flexShrink: 0 }}><X size={18} /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

        {/* Date & Time */}
        <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Date</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{fmtDT(meeting.start_time)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Time (IST)</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              {fmtTime(meeting.start_time) || "—"}{meeting.end_time ? ` – ${fmtTime(meeting.end_time)}` : ""}
            </div>
          </div>
        </div>

        {/* Mode + Link/Location */}
        <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: isOnline && meeting.meeting_link ? 8 : 0 }}>
            {isOnline
              ? <><Video size={13} style={{ color: "#3B82F6" }} /><span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Online Meeting</span><span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>— {platformLabel[meeting.meeting_type] || meeting.meeting_type || ""}</span></>
              : <><MapPin size={13} style={{ color: "#10B981" }} /><span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>In-Person</span></>
            }
          </div>
          {isOnline && meeting.meeting_link && (
            <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--accent)", textDecoration: "none", background: "rgba(99,102,241,0.06)", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.15)", wordBreak: "break-all" }}>
              <ExternalLink size={11} style={{ flexShrink: 0 }} /> {meeting.meeting_link}
            </a>
          )}
          {!isOnline && meeting.location && (
            <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
              <MapPin size={11} style={{ color: "var(--text-muted)" }} /> {meeting.location}
            </div>
          )}
        </div>

        {/* Client */}
        {(meeting.customer_name || meeting.customer_email || meeting.company_name) && (
          <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Client</div>
            {meeting.customer_name && <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>{meeting.customer_name}</div>}
            {meeting.company_name && <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}><Building2 size={11} style={{ color: "var(--text-muted)" }} />{meeting.company_name}</div>}
            {meeting.customer_email && <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}><Mail size={11} style={{ color: "var(--text-muted)" }} />{meeting.customer_email}</div>}
          </div>
        )}

        {/* Purpose + Outcome */}
        {(meeting.meeting_purpose || meeting.outcome) && (
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            {meeting.meeting_purpose && (
              <div style={{ flex: 1, minWidth: 120, background: "var(--surface-2)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Purpose</div>
                <PurposeBadge purpose={meeting.meeting_purpose} />
              </div>
            )}
            {meeting.outcome && (
              <div style={{ flex: 1, minWidth: 120, background: "var(--surface-2)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Outcome</div>
                <OutcomeBadge outcome={meeting.outcome} />
                {meeting.outcome_notes && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.4 }}>{meeting.outcome_notes}</div>}
              </div>
            )}
          </div>
        )}

        {/* Team Attendees */}
        {meeting.attendees?.length > 0 && (
          <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Team Attendees</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {meeting.attendees.map((a, i) => {
                const u = a.user || a;
                return (
                  <div key={u?.id || i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {u?.avatar_url
                      ? <img src={u.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
                      : <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>{(u?.full_name?.[0] || "?").toUpperCase()}</div>
                    }
                    <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 600 }}>{u?.full_name || "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Agenda */}
        {meeting.agenda && (
          <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Agenda</div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{meeting.agenda}</div>
          </div>
        )}

        {/* Internal Notes */}
        {meeting.internal_notes && (
          <div style={{ background: "rgba(245,158,11,0.04)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid rgba(245,158,11,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <Lock size={11} style={{ color: "#B45309" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.06em" }}>Internal Notes</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{meeting.internal_notes}</div>
          </div>
        )}

        {/* CRM Links */}
        {(meeting.lead_id || meeting.deal_id) && (
          <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>CRM Links</div>
            {meeting.linked_lead && (
              <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}>
                <Link2 size={11} style={{ color: "var(--text-muted)" }} />
                Lead: <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#6366F1" }}>{meeting.linked_lead.lead_code}</span>
              </div>
            )}
          </div>
        )}

        {/* Next Follow-up */}
        {meeting.next_follow_up && (
          <div style={{ background: "rgba(59,130,246,0.04)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, border: "1px solid rgba(59,130,246,0.15)", display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar size={13} style={{ color: "#3B82F6" }} />
            <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Follow-up: {format(new Date(meeting.next_follow_up), "MMM d, yyyy")}</span>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {meeting.status === "scheduled" && (
          <button onClick={() => { onComplete(meeting); onClose(); }}
            style={{ flex: 1, minWidth: 80, height: 36, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8, background: "#10B981", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            <CheckCircle2 size={13} /> Done
          </button>
        )}
        <button onClick={() => { onFollowUp(meeting); onClose(); }}
          style={{ flex: 1, minWidth: 80, height: 36, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", cursor: "pointer", fontFamily: "inherit" }}>
          <GitBranch size={13} /> Follow-up
        </button>
        <button onClick={() => { onEdit(meeting); onClose(); }} className="btn-secondary"
          style={{ height: 36, padding: "0 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
          <Pencil size={13} /> Edit
        </button>
        {canDelete && (
          <button onClick={() => { if (window.confirm("Delete this meeting?")) { onDelete(meeting.id); onClose(); } }}
            style={{ height: 36, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer", fontFamily: "inherit" }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Post-Meeting Modal ───────────────────────────────────────────────────────

function PostMeetingModal({ meeting, onClose, onSave }) {
  const [outcome, setOutcome] = useState(meeting?.outcome || "");
  const [notes, setNotes] = useState(meeting?.outcome_notes || "");
  const [nextFollowUp, setNextFollowUp] = useState(meeting?.next_follow_up || "");
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState(`Follow up: ${meeting?.customer_name || ""}`);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!outcome) { toast.error("Select an outcome"); return; }
    setSaving(true);
    try {
      await onSave({ outcome, outcome_notes: notes, next_follow_up: nextFollowUp || null, status: "completed" }, createTask ? taskTitle : null);
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ type: "spring", damping: 22, stiffness: 280 }} style={{ maxWidth: 480 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Post-Meeting Wrap-up</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{meeting?.title} · {meeting?.customer_name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Outcome */}
          <div>
            <label className="crm-label" style={{ marginBottom: 10 }}>How did it go? <span style={{ color: "#EF4444" }}>*</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {OUTCOMES.map((o) => {
                const Icon = o.icon;
                const active = outcome === o.key;
                return (
                  <button key={o.key} type="button" onClick={() => setOutcome(o.key)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${active ? o.color : "var(--border)"}`, background: active ? o.bg : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: active ? 700 : 500, color: active ? o.color : "var(--text-2)", transition: "all 0.15s" }}>
                    <Icon size={15} /> {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="crm-label">Outcome Notes</label>
            <textarea className="crm-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed, decisions made, objections raised..." style={{ resize: "vertical" }} />
          </div>

          {/* Follow-up */}
          <div>
            <label className="crm-label">Next Follow-up Date</label>
            <input className="crm-input" type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
          </div>

          {/* Create task */}
          <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--border)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>Create follow-up task</span>
            </label>
            {createTask && (
              <input className="crm-input" style={{ marginTop: 10, fontSize: 13 }} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title..." />
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Mark as Complete"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Meetings Page ───────────────────────────────────────────────────────

export default function Meetings() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const canDelete = ["owner", "admin", "sales_manager"].includes(profile?.role);

  // Handle OAuth redirect callbacks (oauth_success / oauth_error query params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("oauth_success");
    const error   = params.get("oauth_error");
    const reason  = params.get("reason");
    if (success) {
      const label = success === "google" ? "Google" : "Microsoft";
      toast.success(`${label} account connected! Your meeting links will now be auto-generated.`);
      // Remove query params without a page reload
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      const label = error === "google" ? "Google" : "Microsoft";
      toast.error(`Failed to connect ${label} account${reason ? ` (${reason})` : ""}. Please try again.`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showForm, setShowForm] = useState(false);
  const [editMeeting, setEditMeeting] = useState(null);
  const [postMeeting, setPostMeeting] = useState(null);
  const [followUpMeeting, setFollowUpMeeting] = useState(null);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [viewMode, setViewMode] = useState("table"); // table | list | calendar
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPurpose, setFilterPurpose] = useState("");
  const [filterDate, setFilterDate] = useState("all");
  const { hiddenSet, isVisible, toggleColumn, resetColumns, templates, saveTemplate, applyTemplate, deleteTemplate } = useTablePreferences("meetings", MTG_COLUMNS, profile?.id);

  const { data: meetingsData, isLoading } = useQuery({
    queryKey: ["meetings", filterStatus],
    queryFn: () => meetingsService.getAll({ status: filterStatus }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: teamData } = useQuery({ queryKey: ["team-all"], queryFn: () => teamService.getAll() });

  // Use backend service methods so the auth token is passed and service-role key bypasses Supabase RLS
  const { data: leadsResp } = useQuery({
    queryKey: ["leads-dropdown-full", profile?.id],
    queryFn: () => leadsService.getAll({ limit: 500 }),
    enabled: !!profile?.id,
    staleTime: 60000,
  });

  const { data: pipelineResp } = useQuery({
    queryKey: ["pipeline-dropdown", profile?.id],
    queryFn: () => leadsService.getPipelineEntries(),
    enabled: !!profile?.id,
    staleTime: 60000,
  });

  const { data: dealsResp } = useQuery({
    queryKey: ["deals-dropdown-full", profile?.id],
    queryFn: () => dealsService.getAll(),
    enabled: !!profile?.id,
    staleTime: 60000,
  });

  const leadsData    = leadsResp?.data    || leadsResp    || [];
  const pipelineData = pipelineResp?.data || pipelineResp || [];
  const dealsData    = dealsResp?.data    || dealsResp    || [];

  const allMeetings = useMemo(() => meetingsData?.data || [], [meetingsData]);

  // Build a stable MEET-XXX code map.
  // Priority: use the persisted meeting_code stored in DB (set by meetingsService.create).
  // Fallback: derive from creation-order position for older meetings created before the
  // meeting_code column existed — these get a consistent display code without DB writes.
  const codeMap = useMemo(() => {
    const sorted = [...allMeetings].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    // Walk through in creation order; track the highest seen DB sequence so the
    // fallback positional codes never collide with DB-stored ones.
    let positionCounter = 0;
    const dbCodes = new Set(allMeetings.map((m) => m.meeting_code).filter(Boolean));
    const map = {};
    sorted.forEach((m) => {
      if (m.meeting_code) {
        map[m.id] = m.meeting_code;
      } else {
        // Find next position number that doesn't clash with any DB-stored code
        positionCounter++;
        let candidate = getMeetingCode(positionCounter);
        while (dbCodes.has(candidate)) {
          positionCounter++;
          candidate = getMeetingCode(positionCounter);
        }
        map[m.id] = candidate;
      }
    });
    return map;
  }, [allMeetings]);

  const meetings = useMemo(() => {
    let list = allMeetings;
    if (filterPurpose) list = list.filter((m) => m.meeting_purpose === filterPurpose);
    if (filterDate === "today") list = list.filter((m) => m.start_time && isToday(new Date(m.start_time)));
    if (filterDate === "week")  list = list.filter((m) => m.start_time && new Date(m.start_time) <= addDays(new Date(), 7));
    // Client-side search: meeting code, title, company name, linked lead code
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => {
        const meetCode = (codeMap[m.id] || "").toLowerCase();
        const title    = (m.title || "").toLowerCase();
        const company  = (m.company_name || "").toLowerCase();
        const leadCode = (m.linked_lead?.lead_code || "").toLowerCase();
        return meetCode.includes(q) || title.includes(q) || company.includes(q) || leadCode.includes(q);
      });
    }
    return list;
  }, [allMeetings, filterPurpose, filterDate, search, codeMap]);

  // Stats
  const totalCount     = allMeetings.length;
  const todayCount     = allMeetings.filter((m) => m.start_time && isToday(new Date(m.start_time))).length;
  const upcomingCount  = allMeetings.filter((m) => m.status === "scheduled" && m.start_time && !isPast(new Date(m.start_time))).length;
  const completedCount = allMeetings.filter((m) => m.status === "completed").length;
  const overdueCount   = allMeetings.filter((m) => m.status === "scheduled" && m.start_time && isPast(new Date(m.start_time))).length;

  // Send branded email + iCalendar MIME invite (triggers Gmail RSVP + auto calendar sync)
  const sendMeetingInvite = async (data, isUpdate = false) => {
    const primaryEmail  = data.customer_email;
    const extraEmails   = data._extra_emails || [];
    const allRecipients = [...new Set([primaryEmail, ...extraEmails].filter(Boolean))];
    if (!allRecipients.length) return;

    try {
      const token = await getAccessToken();
      const payload = {
        title:          data.title,
        startTime:      data.start_time,
        endTime:        data.end_time,
        meetingType:    data.meeting_type,
        meetingLink:    data.meeting_link    || null,
        location:       data.location        || null,
        locationMapsUrl: data.location_maps_url || null,
        description:    data.agenda          || null,
        hostName:       profile?.full_name || "Sales Team",
        meetingPurpose: data.meeting_purpose || null,
        companyName:    data.company_name   || null,
        meetingId:      data._meeting_id    || null,
        sequence:       data._sequence      || 0,
        // Named attendees list for iCal ATTENDEE fields
        allAttendees: allRecipients
          .filter((e) => e !== primaryEmail)
          .map((e) => ({ name: e, email: e })),
      };

      // Single API call — backend handles all recipients in one shot
      const r = await fetch(`${API}/api/meetings/invite`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          ...payload,
          customerName:  data.customer_name || "there",
          customerEmail: allRecipients,      // backend accepts array
        }),
      });
      const result = await r.json();
      if (!result.emailSent) {
        const errMsg = result.emailError || "check SMTP settings";
        toast(`Email delivery failed — ${errMsg}`, { icon: "⚠️", duration: 10000 });
      }
      return result.emailSent ?? false;
    } catch {
      toast("Could not reach email server", { icon: "⚠️" });
      return false;
    }
  };

  // Send iCalendar METHOD:CANCEL — removes event from attendee calendars automatically
  const sendCancellationInvite = async (meeting) => {
    const primaryEmail  = meeting.customer_email;
    const extraEmails   = meeting._extra_emails || [];
    const allRecipients = [...new Set([primaryEmail, ...extraEmails].filter(Boolean))];
    if (!allRecipients.length) return;

    try {
      const token = await getAccessToken();
      await fetch(`${API}/api/meetings/cancel-invite`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          customerName:  meeting.customer_name || "there",
          customerEmail: allRecipients,
          title:         meeting.title,
          startTime:     meeting.start_time,
          endTime:       meeting.end_time,
          hostName:      profile?.full_name || "Sales Team",
          meetingId:     meeting.id,
          sequence:      2,
        }),
      });
    } catch {
      // cancellation email failure is non-fatal
    }
  };

  // Strip frontend-only meta fields before sending to DB.
  // meeting_code is generated by the service on create — never overwrite on update.
  const stripMeta = (data) => {
    const { _extra_emails, _contact_method, _all_day, _lead_code, _meeting_id, _sequence, meeting_code, _calendar_event_id, _calendar_provider, ...clean } = data;
    return clean;
  };

  const exportCSV = useCallback(() => {
    const headers = ["Meeting ID","Title","Client","Company","Email","Date","Start Time","End Time","Mode","Status","Purpose","Priority","Outcome","Lead","Created At"];
    const rows = meetings.map((m) => [
      codeMap[m.id] || "",
      m.title || "",
      m.customer_name || "",
      m.company_name || "",
      m.customer_email || "",
      m.start_time ? format(new Date(m.start_time), "yyyy-MM-dd") : "",
      m.start_time ? format(new Date(m.start_time), "HH:mm") : "",
      m.end_time   ? format(new Date(m.end_time),   "HH:mm") : "",
      m.mode === "online" ? "Online" : "In-Person",
      m.status || "",
      m.meeting_purpose || "",
      m.priority || "medium",
      m.outcome || "",
      m.linked_lead?.lead_code || "",
      m.created_at ? format(new Date(m.created_at), "yyyy-MM-dd") : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `meetings-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${meetings.length} meeting${meetings.length !== 1 ? "s" : ""}`);
  }, [meetings, codeMap]);

  const logMeetingActivity = (data, meetingId, type = "scheduled") => {
    const actType = data.mode === "offline" ? "meeting_person" : "meeting_virtual";
    const labels  = { scheduled: "Scheduled", updated: "Updated", cancelled: "Cancelled", rescheduled: "Rescheduled", completed: "Completed", deleted: "Deleted" };
    const row = {
      type:        actType,
      title:       `Meeting ${labels[type] || type}: ${data.title}`,
      description: `${data.customer_name || data.company_name || ""}${data.agenda ? "\n\nAgenda: " + data.agenda : ""}`,
      created_by:  profile?.id,
      status:      type === "cancelled" || type === "deleted" ? "cancelled" : "done",
      meeting_id:  meetingId || null,
      lead_id:     data.lead_id  || null,
      deal_id:     data.deal_id  || null,
      metadata:    data.start_time ? { scheduled_at: data.start_time } : null,
    };
    if (row.lead_id) { row.related_type = "lead"; row.related_id = row.lead_id; }
    else if (row.deal_id) { row.related_type = "deal"; row.related_id = row.deal_id; }
    supabase.from("activities").insert(row).then(() => {}).catch(() => {});
  };

  const logMeetingHistory = (data, type) => {
    const detail = `${data.title}${data.start_time ? " — " + new Date(data.start_time).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : ""}`;
    if (data.lead_id) changeHistoryService.logMeetingEvent({ entityType: "lead",  entityId: data.lead_id, meetingTitle: data.title, eventType: type, details: detail, userId: profile?.id }).catch(() => {});
    if (data.deal_id) changeHistoryService.logMeetingEvent({ entityType: "deal",  entityId: data.deal_id, meetingTitle: data.title, eventType: type, details: detail, userId: profile?.id }).catch(() => {});
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, attendeeIds }) => {
      const meeting = await meetingsService.create({ ...stripMeta(data), created_by: profile?.id }, attendeeIds);
      // Pass meeting.id so backend generates a stable UID: meetingId@salescrm.app
      const emailSent = await sendMeetingInvite({ ...data, _meeting_id: meeting.id, _sequence: 0 }, false);
      logMeetingActivity(data, meeting.id, "scheduled");
      logMeetingHistory(data, "scheduled");
      // Store external calendar event ID so it can be cleaned up on meeting deletion
      if (data._calendar_event_id && data._calendar_provider) {
        getAccessToken().then((token) => {
          if (!token) return;
          fetch(`${API}/api/calendar-sync`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              meetingId:       meeting.id,
              provider:        data._calendar_provider,
              externalEventId: data._calendar_event_id,
              createdBy:       profile?.id,
            }),
          }).catch(() => {});
        }).catch(() => {});
      }
      return { meeting, data, emailSent };
    },
    onSuccess: ({ emailSent }) => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      if (emailSent) {
        toast.success("Meeting scheduled — iCal invite sent, event will appear in attendee's calendar automatically");
      } else {
        toast.success("Meeting scheduled successfully");
      }
      setShowForm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, attendeeIds, prevStatus }) => {
      const meeting = await meetingsService.update(id, stripMeta(data), attendeeIds);
      const isCancelled   = data.status === "cancelled" && prevStatus !== "cancelled";
      const isReschedule  = data.status === "rescheduled" && prevStatus !== "rescheduled";
      if (isCancelled) {
        // METHOD:CANCEL removes the event from all attendee Google Calendars automatically
        await sendCancellationInvite({ ...data, id });
      } else if (isReschedule || data._extra_emails?.length) {
        // METHOD:REQUEST with higher SEQUENCE updates the existing calendar event
        await sendMeetingInvite({ ...data, _meeting_id: id, _sequence: 1 }, true);
      }
      const evtType = isCancelled ? "cancelled" : isReschedule ? "rescheduled" : "updated";
      logMeetingActivity(data, id, evtType);
      logMeetingHistory(data, evtType);
      return meeting;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      qc.invalidateQueries({ queryKey: ["my-pending-activities"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Meeting updated");
      setEditMeeting(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { data: meeting } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
      // Clean up calendar events BEFORE deleting from DB so the sync table is still readable
      try {
        const token = await getAccessToken();
        if (token) {
          await fetch(`${API}/api/calendar-sync/meeting/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch { /* non-fatal — calendar cleanup failure must not block CRM deletion */ }
      await meetingsService.delete(id);
      if (meeting) {
        logMeetingActivity(meeting, id, "deleted");
        logMeetingHistory(meeting, "deleted");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      qc.invalidateQueries({ queryKey: ["my-pending-activities"] });
      qc.invalidateQueries({ queryKey: ["my-completed-activities"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Meeting removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const postMeetingMutation = useMutation({
    mutationFn: async ({ id, updates, taskTitle }) => {
      const { data: meeting } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
      await meetingsService.update(id, updates);
      if (taskTitle) {
        await supabase.from("tasks").insert({ title: taskTitle, assigned_to: profile?.id, created_by: profile?.id, status: "todo", priority: "medium" });
      }
      if (meeting) {
        logMeetingActivity({ ...meeting, ...updates }, id, "completed");
        logMeetingHistory({ ...meeting, ...updates }, "completed");
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("Meeting marked complete!"); setPostMeeting(null); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (data, attendeeIds) => {
    if (editMeeting) await updateMutation.mutateAsync({ id: editMeeting.id, data, attendeeIds, prevStatus: editMeeting.status });
    else await createMutation.mutateAsync({ data, attendeeIds });
  };

  const teamMembers = teamData?.data || teamData || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 24px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarCheck size={20} style={{ color: "var(--accent)" }} />
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Meetings</h1>
            </div>
            <p style={{ margin: "2px 0 0 28px", fontSize: 12.5, color: "var(--text-muted)" }}>Schedule, track, and follow up on all customer meetings</p>
          </div>
          <button className="btn-primary" onClick={() => setShowForm(true)} style={{ height: 36 }}>
            <Plus size={14} /> Schedule Meeting
          </button>
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total",     value: totalCount,     color: "#6B7280", Icon: CalendarCheck },
            { label: "Today",     value: todayCount,     color: "#F59E0B", Icon: Clock         },
            { label: "Upcoming",  value: upcomingCount,  color: "#3B82F6", Icon: Calendar      },
            { label: "Completed", value: completedCount, color: "#10B981", Icon: CheckCircle2  },
            { label: "Overdue",   value: overdueCount,   color: "#EF4444", Icon: AlertCircle   },
          ].map((s) => (
            <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <s.Icon size={17} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            <input
              className="crm-input"
              style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
              placeholder="Search by title or MEET-001…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="crm-input" style={{ width: "auto", height: 36, fontSize: 13 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="crm-input" style={{ width: "auto", height: 36, fontSize: 13 }} value={filterPurpose} onChange={(e) => setFilterPurpose(e.target.value)}>
            <option value="">All Types</option>
            {MEETING_PURPOSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select className="crm-input" style={{ width: "auto", height: 36, fontSize: 13 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
          </select>
          {(search || filterStatus || filterPurpose || filterDate !== "all") && (
            <button className="btn-ghost" style={{ height: 36, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }} onClick={() => { setSearch(""); setFilterStatus(""); setFilterPurpose(""); setFilterDate("all"); }}>
              <X size={13} /> Clear
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {/* View mode toggle */}
            <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", padding: 3, borderRadius: 9, border: "1px solid var(--border)" }}>
              {[
                { key: "table",    Icon: LayoutGrid,   title: "Table View"    },
                { key: "list",     Icon: LayoutList,   title: "List View"     },
                { key: "calendar", Icon: CalendarDays, title: "Calendar View" },
              ].map(({ key, Icon, title }) => (
                <button key={key} title={title} onClick={() => setViewMode(key)}
                  style={{ padding: "5px 8px", borderRadius: 7, background: viewMode === key ? "var(--accent)" : "transparent", border: "none", cursor: "pointer", color: viewMode === key ? "#fff" : "var(--text-muted)", display: "flex", alignItems: "center", transition: "all 0.12s" }}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
            {/* Export CSV */}
            <button onClick={exportCSV} className="btn-ghost" title="Export CSV" style={{ height: 36, padding: "0 10px", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
              <Download size={13} /> Export
            </button>
            {viewMode === "table" && <ColumnToggle allColumns={MTG_COLUMNS} hiddenSet={hiddenSet} onToggle={toggleColumn} onReset={resetColumns} />}
            <TemplateMenu
              templates={templates}
              onSave={saveTemplate}
              onApply={(tpl) => {
                applyTemplate(tpl);
                if (tpl.filters?.status  !== undefined) setFilterStatus(tpl.filters.status);
                if (tpl.filters?.purpose !== undefined) setFilterPurpose(tpl.filters.purpose);
              }}
              onDelete={deleteTemplate}
              currentFilters={{ status: filterStatus, purpose: filterPurpose }}
            />
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable cols={7} rows={7} />
        ) : !meetings.length ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarCheck size={26} style={{ color: "var(--accent)" }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>No meetings yet</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", maxWidth: 340 }}>Schedule your first meeting to start tracking client interactions.</div>
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: 4 }}><Plus size={14} /> Schedule Meeting</button>
          </div>
        ) : viewMode === "calendar" ? (
          <CalendarView meetings={meetings} codeMap={codeMap} onSelectMeeting={setSelectedMeeting} />
        ) : viewMode === "list" ? (
          <ListView
            meetings={meetings}
            codeMap={codeMap}
            onSelect={setSelectedMeeting}
            onEdit={setEditMeeting}
            onComplete={setPostMeeting}
            onDelete={(id) => deleteMutation.mutate(id)}
            onFollowUp={setFollowUpMeeting}
            canDelete={canDelete}
          />
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    {isVisible("meeting_id") && <th style={{ whiteSpace: "nowrap" }}>MEETING ID</th>}
                    <th>MEETING</th>
                    {isVisible("client")   && <th>CLIENT</th>}
                    <th>DATE & TIME</th>
                    {isVisible("mode")     && <th>MODE</th>}
                    {isVisible("team")     && <th>TEAM</th>}
                    {isVisible("status")   && <th>STATUS</th>}
                    {isVisible("outcome")  && <th>OUTCOME</th>}
                    <th style={{ textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {meetings.map((m, i) => {
                      const dur = getDurationStr(m.start_time, m.end_time);
                      const isOverdue = m.status === "scheduled" && m.start_time && isPast(new Date(m.start_time));
                      return (
                        <motion.tr key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.02, duration: 0.16 }}
                          onClick={() => setSelectedMeeting(m)}
                          style={{ cursor: "pointer" }}
                        >
                          {isVisible("meeting_id") && (
                            <td style={{ whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "3px 8px", borderRadius: 7, display: "inline-block", border: "1px solid rgba(99,102,241,0.2)" }}>
                                  {codeMap[m.id] || "—"}
                                </span>
                                {codeMap[m.id] && (
                                  <motion.button
                                    whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(codeMap[m.id]).catch(() => {});
                                      setCopiedId(m.id);
                                      setTimeout(() => setCopiedId(null), 1800);
                                    }}
                                    title="Copy Meeting ID"
                                    style={{ background: "none", border: "none", cursor: "pointer", color: copiedId === m.id ? "#10B981" : "var(--text-muted)", padding: 2, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                                  >
                                    {copiedId === m.id ? <CheckCircle2 size={11} style={{ color: "#10B981" }} /> : <Copy size={11} />}
                                  </motion.button>
                                )}
                              </div>
                            </td>
                          )}
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 3 }}>{m.title}</div>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {m.meeting_purpose && <PurposeBadge purpose={m.meeting_purpose} />}
                              {m.priority && m.priority !== "medium" && <PriorityBadge priority={m.priority} />}
                              {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.08)", padding: "1px 6px", borderRadius: 99 }}>Overdue</span>}
                            </div>
                          </td>
                          {isVisible("client") && (
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-2)" }}>{m.customer_name || "—"}</div>
                              {m.company_name && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.company_name}</div>}
                              {m.customer_email && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.customer_email}</div>}
                            </td>
                          )}
                          <td style={{ whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>{fmtDate(m.start_time)}</div>
                            {dur && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{dur}</div>}
                          </td>
                          {isVisible("mode") && (
                            <td>
                              {m.mode === "online" || m.meeting_type !== "in_person" ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(59,130,246,0.1)", color: "#3B82F6", display: "flex", alignItems: "center", gap: 4 }}>
                                    <Video size={9} /> Online
                                  </span>
                                  {m.meeting_link && <a href={m.meeting_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }} onClick={(e) => e.stopPropagation()}><ExternalLink size={12} /></a>}
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "#10B981", display: "flex", alignItems: "center", gap: 4, width: "fit-content" }}>
                                  <MapPin size={9} /> In Person
                                </span>
                              )}
                            </td>
                          )}
                          {isVisible("team")    && <td><AvatarStack attendees={m.attendees || []} /></td>}
                          {isVisible("status")  && <td><StatusBadge status={m.status} /></td>}
                          {isVisible("outcome") && <td>{m.outcome ? <OutcomeBadge outcome={m.outcome} /> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}</td>}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                              {m.status === "scheduled" && (
                                <motion.button onClick={() => setPostMeeting(m)} title="Mark Complete" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.22)", cursor: "pointer", fontFamily: "inherit" }}>
                                  <CheckCircle2 size={11} /> Done
                                </motion.button>
                              )}
                              <motion.button onClick={() => setFollowUpMeeting(m)} title="Schedule Follow-up Meeting" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.22)", cursor: "pointer", fontFamily: "inherit" }}>
                                <GitBranch size={11} /> Follow-up
                              </motion.button>
                              <motion.button onClick={() => setEditMeeting(m)} className="btn-ghost" style={{ padding: "4px 6px" }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                <Pencil size={13} strokeWidth={1.75} />
                              </motion.button>
                              {canDelete && (
                                <motion.button onClick={() => { if (window.confirm("Delete this meeting?")) deleteMutation.mutate(m.id); }} className="btn-ghost" style={{ padding: "4px 6px", color: "var(--red)" }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                  <Trash2 size={13} strokeWidth={1.75} />
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

      {/* ── Meeting Detail Panel ── */}
      <AnimatePresence>
        {selectedMeeting && (
          <>
            <motion.div key="detail-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 39 }}
              onClick={() => setSelectedMeeting(null)}
            />
            <MeetingDetailPanel
              key="detail-panel"
              meeting={selectedMeeting}
              codeMap={codeMap}
              canDelete={canDelete}
              onClose={() => setSelectedMeeting(null)}
              onEdit={(m) => { setEditMeeting(m); setSelectedMeeting(null); }}
              onComplete={(m) => { setPostMeeting(m); setSelectedMeeting(null); }}
              onDelete={(id) => { deleteMutation.mutate(id); setSelectedMeeting(null); }}
              onFollowUp={(m) => { setFollowUpMeeting(m); setSelectedMeeting(null); }}
            />
          </>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {(showForm || editMeeting) && (
          <MeetingFormModal
            key="form"
            meeting={editMeeting}
            onClose={() => { setShowForm(false); setEditMeeting(null); }}
            onSave={handleSave}
            teamMembers={teamMembers}
            leads={leadsData || []}
            deals={dealsData || []}
            pipeline={pipelineData || []}
            allMeetings={allMeetings}
            codeMap={codeMap}
          />
        )}
        {followUpMeeting && (
          <MeetingFormModal
            key="followup"
            meeting={null}
            onClose={() => setFollowUpMeeting(null)}
            onSave={async (data, attendeeIds) => {
              await createMutation.mutateAsync({ data, attendeeIds });
              setFollowUpMeeting(null);
            }}
            teamMembers={teamMembers}
            leads={leadsData || []}
            deals={dealsData || []}
            pipeline={pipelineData || []}
            allMeetings={allMeetings}
            codeMap={codeMap}
            reuseFrom={followUpMeeting}
          />
        )}
        {postMeeting && (
          <PostMeetingModal
            key="post"
            meeting={postMeeting}
            onClose={() => setPostMeeting(null)}
            onSave={(updates, taskTitle) => postMeetingMutation.mutateAsync({ id: postMeeting.id, updates, taskTitle })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
