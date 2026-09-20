import { useState, useEffect, useMemo, useCallback } from "react";
import { getAccessToken } from "../lib/session";
import {
  Mail, Search, Send, Reply, Plus, RefreshCw,
  ChevronDown, ChevronUp, Paperclip, ArrowUpRight, ArrowDownLeft,
  Inbox, Clock, Building2, MailOpen,
} from "lucide-react";
import EmailComposerModal from "./EmailComposerModal";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

const MODULE_STYLE = {
  lead:     { bg: "rgba(16,185,129,0.1)",  color: "#059669", border: "rgba(16,185,129,0.25)"  },
  customer: { bg: "rgba(59,130,246,0.1)",  color: "#2563EB", border: "rgba(59,130,246,0.25)"  },
  pipeline: { bg: "rgba(139,92,246,0.1)",  color: "#7C3AED", border: "rgba(139,92,246,0.25)"  },
  deal:     { bg: "rgba(245,158,11,0.1)",  color: "#D97706", border: "rgba(245,158,11,0.25)"  },
};

const EMAIL_TYPE_LABELS = {
  email_sent:       "Sent",
  follow_up_email:  "Follow-up",
  introduction:     "Introduction",
  proposal:         "Proposal",
  pricing:          "Pricing",
  negotiation:      "Negotiation",
  payment:          "Payment",
  support:          "Support",
  reminder:         "Reminder",
  email:            "Email",
  follow_up_call:   "Follow-up",
  cold_outreach:    "Cold Outreach",
};

const TYPE_FILTER_OPTIONS = [
  { key: "follow_up_email", label: "Follow-up"    },
  { key: "proposal",        label: "Proposal"     },
  { key: "pricing",         label: "Pricing"      },
  { key: "payment",         label: "Payment"      },
  { key: "reminder",        label: "Reminder"     },
  { key: "support",         label: "Support"      },
];

function fmtRelative(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)     return "Just now";
  if (diff < 3600000)   return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000)  return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: diff > 31536000000 ? "2-digit" : undefined });
}

function fmtFull(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    + ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtDateOnly(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function ModuleBadge({ module: mod }) {
  const s = MODULE_STYLE[mod] || MODULE_STYLE.lead;
  const label = mod ? mod.charAt(0).toUpperCase() + mod.slice(1) : "—";
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

export default function EmailCommunicationCenter({ profile }) {
  const [conversations, setConversations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState(null);
  const [emails,        setEmails]        = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [search,        setSearch]        = useState("");
  const [filterType,    setFilterType]    = useState("");
  const [expandedId,    setExpandedId]    = useState(null);
  const [composer,      setComposer]      = useState(null);

  // ── Fetch conversation list ──────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const res   = await fetch(`${API}/api/email/conversations`, { headers: { Authorization: `Bearer ${token}` } });
      const json  = await res.json();
      setConversations(json.data || []);
    } catch { /* noop */ }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // ── Fetch emails for selected conversation ───────────────────────────────────
  const fetchEmails = useCallback(async (conv) => {
    setThreadLoading(true);
    setEmails([]);
    setExpandedId(null);
    try {
      const token  = await getAccessToken();
      const params = new URLSearchParams();
      if      (conv.lead_id)     params.set("lead_id",     conv.lead_id);
      else if (conv.customer_id) params.set("customer_id", conv.customer_id);
      else if (conv.pipeline_id) params.set("pipeline_id", conv.pipeline_id);
      else if (conv.deal_id)     params.set("deal_id",     conv.deal_id);

      const res  = await fetch(`${API}/api/email/history?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      const list = Array.isArray(json) ? json : [];
      setEmails([...list].reverse()); // oldest first for chronological display
    } catch { /* noop */ }
    finally   { setThreadLoading(false); }
  }, []);

  useEffect(() => {
    if (selected) fetchEmails(selected);
    else { setEmails([]); setExpandedId(null); }
  }, [selected, fetchEmails]);

  // ── Filtered conversation list ───────────────────────────────────────────────
  const filteredConvs = useMemo(() => {
    const q = search.toLowerCase().trim();
    return conversations.filter(c => {
      if (q && !(
        (c.crm_record_name || "").toLowerCase().includes(q) ||
        (c.primary_email   || "").toLowerCase().includes(q) ||
        (c.last_subject    || "").toLowerCase().includes(q)
      )) return false;
      if (filterType && !(c.email_types || []).includes(filterType)) return false;
      return true;
    });
  }, [conversations, search, filterType]);

  // ── All distinct types across all conversations (for filter chips) ────────────
  const presentTypes = useMemo(() => {
    const set = new Set(conversations.flatMap(c => c.email_types || []));
    return TYPE_FILTER_OPTIONS.filter(o => set.has(o.key));
  }, [conversations]);

  // ── Open composer ──────────────────────────────────────────────────────────────
  function openComposer(mode = "new") {
    if (!selected) return;
    const lastEmail = emails[emails.length - 1];
    let defaultSubject = "";
    if (mode === "reply" && lastEmail?.subject) {
      defaultSubject = lastEmail.subject.match(/^re:/i) ? lastEmail.subject : `Re: ${lastEmail.subject}`;
    }
    setComposer({ mode, defaultSubject });
  }

  const convKey = (c) => `${c.crm_module}::${c.lead_id || c.customer_id || c.pipeline_id || c.deal_id}`;
  const selectedKey = selected ? convKey(selected) : null;

  // ── Stats for header ───────────────────────────────────────────────────────────
  const totalEmails  = conversations.reduce((s, c) => s + c.email_count, 0);
  const followupCount = conversations.filter(c => c.has_followup).length;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 210px)", minHeight: 500, gap: 0, borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)" }}>

      {/* ── LEFT PANEL ─ conversation list ─────────────────────────────────────── */}
      <div style={{ width: 330, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface-2)" }}>

        {/* Stats strip */}
        <div style={{ padding: "12px 14px 0", display: "flex", gap: 8 }}>
          {[
            { label: "Total",       value: conversations.length, color: "var(--text-2)"  },
            { label: "Emails",      value: totalEmails,          color: "var(--accent)"  },
            { label: "Follow-ups",  value: followupCount,        color: "#D97706"        },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, padding: "7px 8px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: "10px 14px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 9, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <Search size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, subject…"
              style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 12, color: "var(--text)", fontFamily: "inherit" }}
            />
          </div>
        </div>

        {/* Type filter chips */}
        {presentTypes.length > 0 && (
          <div style={{ padding: "0 14px 8px", display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button onClick={() => setFilterType("")}
              style={{ padding: "3px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 600, border: "none", cursor: "pointer", background: !filterType ? "var(--accent)" : "var(--surface)", color: !filterType ? "#fff" : "var(--text-muted)", transition: "all 0.12s" }}>
              All
            </button>
            {presentTypes.map(({ key, label }) => (
              <button key={key} onClick={() => setFilterType(filterType === key ? "" : key)}
                style={{ padding: "3px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 600, border: "none", cursor: "pointer", background: filterType === key ? "var(--accent)" : "var(--surface)", color: filterType === key ? "#fff" : "var(--text-muted)", transition: "all 0.12s" }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* List header */}
        <div style={{ padding: "4px 14px 6px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {filteredConvs.length} Conversation{filteredConvs.length !== 1 ? "s" : ""}
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading conversations…</div>
            </div>
          ) : filteredConvs.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <Inbox size={28} strokeWidth={1.25} style={{ color: "var(--text-muted)", margin: "0 auto 10px", display: "block" }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}>No conversations</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                {search || filterType ? "Try adjusting your search or filters." : "Emails sent from CRM or auto-synced from Gmail will appear here."}
              </div>
            </div>
          ) : filteredConvs.map(c => {
            const isSelected = convKey(c) === selectedKey;
            const mod = MODULE_STYLE[c.crm_module] || MODULE_STYLE.lead;
            return (
              <div key={convKey(c)} onClick={() => setSelected(c)}
                style={{ padding: "11px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", borderLeft: `3px solid ${isSelected ? "var(--accent)" : "transparent"}`, background: isSelected ? "var(--accent-light)" : "transparent", transition: "all 0.1s" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 3 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {c.crm_record_name}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>{fmtRelative(c.last_email_at)}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.primary_email || "—"}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }}>
                  {c.last_subject || "—"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ModuleBadge module={c.crm_module} />
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                    {c.email_count} email{c.email_count !== 1 ? "s" : ""}
                  </span>
                  {c.has_followup && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "#D97706", border: "1px solid rgba(245,158,11,0.3)" }}>
                      Follow-up
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Refresh */}
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)" }}>
          <button onClick={fetchConversations}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-muted)", cursor: "pointer", fontSize: 11.5, fontFamily: "inherit", width: "100%", justifyContent: "center", fontWeight: 500 }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL ─ thread view ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {!selected ? (
          /* Empty state */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MailOpen size={28} strokeWidth={1.25} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Select a Conversation</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 360 }}>
                Choose a customer from the left panel to view their complete email history, timeline, and continue the conversation.
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ── Thread header ────────────────────────────────────────────────── */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{selected.crm_record_name}</span>
                    <ModuleBadge module={selected.crm_module} />
                    {selected.has_followup && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "rgba(245,158,11,0.12)", color: "#D97706", border: "1px solid rgba(245,158,11,0.3)" }}>
                        <Clock size={9} style={{ verticalAlign: "middle", marginRight: 3 }} />Follow-up Pending
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5, color: "var(--text-muted)", flexWrap: "wrap" }}>
                    <span>{selected.primary_email}</span>
                    <span>·</span>
                    <span>{selected.email_count} email{selected.email_count !== 1 ? "s" : ""}</span>
                    {selected.first_email_at && (
                      <>
                        <span>·</span>
                        <span>Since {fmtDateOnly(selected.first_email_at)}</span>
                      </>
                    )}
                    {selected.last_email_at && (
                      <>
                        <span>·</span>
                        <span>Last: {fmtRelative(selected.last_email_at)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => openComposer("reply")}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                    <Reply size={13} strokeWidth={2} /> Reply
                  </button>
                  <button onClick={() => openComposer("new")}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                    <Plus size={13} strokeWidth={2.5} /> New Email
                  </button>
                </div>
              </div>

              {/* Email type chips */}
              {(selected.email_types || []).length > 0 && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Types:</span>
                  {selected.email_types.map(t => (
                    <span key={t} style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                      {EMAIL_TYPE_LABELS[t] || t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Timeline ─────────────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {threadLoading ? (
                <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 12 }}>Loading conversation…</div>
              ) : emails.length === 0 ? (
                <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 12 }}>No emails found for this record.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Timeline label */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", paddingBottom: 4 }}>
                    Communication Timeline — {emails.length} email{emails.length !== 1 ? "s" : ""}
                  </div>

                  {emails.map((email, idx) => {
                    const isExpanded = expandedId === email.id;
                    const isOutbound = email.direction !== "inbound";
                    const typeLabel  = EMAIL_TYPE_LABELS[email.activity_type] || email.activity_type;

                    return (
                      <div key={email.id}
                        style={{ borderRadius: 11, border: `1px solid ${isExpanded ? "var(--border-2)" : "var(--border)"}`, background: isExpanded ? "var(--surface-2)" : "var(--surface)", overflow: "hidden", transition: "border-color 0.15s, background 0.15s" }}>

                        {/* Collapsed header */}
                        <div onClick={() => setExpandedId(isExpanded ? null : email.id)}
                          style={{ padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}>

                          {/* Direction icon */}
                          <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isOutbound ? "rgba(37,99,235,0.1)" : "rgba(16,185,129,0.1)", color: isOutbound ? "var(--accent)" : "#059669" }}>
                            {isOutbound
                              ? <ArrowUpRight size={14} strokeWidth={2.5} />
                              : <ArrowDownLeft size={14} strokeWidth={2.5} />}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                                {email.subject || "(No subject)"}
                              </span>
                              {typeLabel && (
                                <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 5, background: "rgba(37,99,235,0.1)", color: "var(--accent)", border: "1px solid rgba(37,99,235,0.18)", whiteSpace: "nowrap" }}>
                                  {typeLabel}
                                </span>
                              )}
                              {email.attachment_count > 0 && (
                                <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--text-muted)" }}>
                                  <Paperclip size={10} /> {email.attachment_count}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {isOutbound
                                ? `From: ${email.sender_name || email.from_email}`
                                : `From: ${email.from_email}`}
                              {email.to_emails?.length > 0 && ` → ${email.to_emails[0]}`}
                            </div>
                            {!isExpanded && email.snippet && (
                              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {email.snippet}
                              </div>
                            )}
                          </div>

                          {/* Date + expand toggle */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 10.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtFull(email.sent_at)}</span>
                            <span style={{ color: "var(--text-muted)" }}>{isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px 14px" }}>
                            {/* Metadata grid */}
                            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 6, columnGap: 16, fontSize: 12, marginBottom: 14 }}>
                              {[
                                ["From",        email.sender_name ? `${email.sender_name} <${email.from_email}>` : email.from_email],
                                ["To",          (email.to_emails || []).join(", ") || "—"],
                                email.cc_emails?.length ? ["CC", email.cc_emails.join(", ")] : null,
                                ["Date",        fmtFull(email.sent_at)],
                                email.activity_type ? ["Type", typeLabel] : null,
                                email.attachment_count > 0 ? ["Attachments", `${email.attachment_count} file${email.attachment_count > 1 ? "s" : ""}`] : null,
                                email.status ? ["Status", email.status.charAt(0).toUpperCase() + email.status.slice(1)] : null,
                              ].filter(Boolean).map(([label, value]) => (
                                <>
                                  <span key={label + "l"} style={{ color: "var(--text-muted)", fontWeight: 700, whiteSpace: "nowrap" }}>{label}:</span>
                                  <span key={label + "v"} style={{ color: "var(--text-2)" }}>{value}</span>
                                </>
                              ))}
                            </div>

                            {/* Body / Snippet */}
                            {email.snippet && (
                              <div style={{ padding: "12px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                {email.snippet}
                              </div>
                            )}

                            {/* Quick reply */}
                            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                              <button onClick={() => openComposer("reply")}
                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                                <Reply size={12} strokeWidth={2} /> Quick Reply
                              </button>
                              <button onClick={() => openComposer("new")}
                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 7, border: "none", background: "rgba(37,99,235,0.1)", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                                <Plus size={12} /> New Email
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* CTA at bottom */}
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                    <button onClick={() => openComposer("new")}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 10, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                      <Send size={13} strokeWidth={2} /> Continue Conversation
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Composer modal ──────────────────────────────────────────────────────── */}
      {composer && selected && (
        <EmailComposerModal
          to={selected.primary_email}
          toName={selected.crm_record_name}
          pipelineId={selected.pipeline_id || null}
          leadId={selected.lead_id     || null}
          dealId={selected.deal_id     || null}
          customerId={selected.customer_id || null}
          assignedTo={null}
          recordName={selected.crm_record_name}
          defaultSubject={composer.defaultSubject}
          autoCompose={composer.mode === "reply"}
          onClose={() => setComposer(null)}
          onSent={() => {
            setComposer(null);
            fetchEmails(selected);
            fetchConversations();
          }}
        />
      )}
    </div>
  );
}
