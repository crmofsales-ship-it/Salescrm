import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, ChevronRight, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getAccessToken } from "../lib/session";
import toast from "react-hot-toast";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

const EMAIL_TYPES = [
  "Follow-up Email",
  "Meeting Email",
  "Proposal Email",
  "Quotation Email",
  "Reminder Email",
  "Support Email",
  "Contract Email",
  "Renewal Email",
  "Internal Communication",
  "General Communication",
  "Other",
];

const LAST_TYPE_KEY = "salescrm_last_email_type";
const SYNC_INTERVAL = 60000; // 60 seconds

export default function EmailActivityPopup() {
  const { profile } = useAuth();
  const [pending,  setPending]  = useState([]);
  const [current,  setCurrent]  = useState(null);
  const [selected, setSelected] = useState(() => localStorage.getItem(LAST_TYPE_KEY) || "Follow-up Email");
  const [reason,   setReason]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const syncRef = useRef(false);

  const apiFetch = useCallback(async (path, opts = {}) => {
    const token = await getAccessToken();
    return fetch(`${API}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
  }, []);

  const fetchPending = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const r = await apiFetch("/api/email/pending");
      if (!r.ok) return;
      const data = await r.json();
      setPending(data);
      setCurrent((prev) => prev ? data.find((d) => d.id === prev.id) || data[0] || null : data[0] || null);
    } catch {}
  }, [profile?.id, apiFetch]);

  const triggerSync = useCallback(async () => {
    if (!profile?.id || syncRef.current) return;
    syncRef.current = true;
    try {
      await apiFetch("/api/email/sync", { method: "POST" });
      await fetchPending();
    } catch {} finally {
      syncRef.current = false;
    }
  }, [profile?.id, apiFetch, fetchPending]);

  // Poll on mount, interval, and window focus
  useEffect(() => {
    if (!profile?.id) return;
    fetchPending();
    triggerSync();
    const interval = setInterval(triggerSync, SYNC_INTERVAL);
    const onFocus = () => triggerSync();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = (excludeId) => {
    const rest = pending.filter((p) => p.id !== excludeId);
    setPending(rest);
    setCurrent(rest[0] || null);
    setReason("");
  };

  const handleClassify = async () => {
    if (!current || !selected || !reason.trim() || loading) return;
    setLoading(true);
    try {
      const r = await apiFetch("/api/email/classify", {
        method: "POST",
        body: JSON.stringify({ id: current.id, activity_type: selected, reason: reason.trim() }),
      });
      if (!r.ok) throw new Error("Failed");
      localStorage.setItem(LAST_TYPE_KEY, selected);
      toast.success(`Activity logged: ${selected}`);
      advance(current.id);
    } catch {
      toast.error("Could not log email activity");
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!current) return;
    const id = current.id;
    advance(id);
    try {
      await apiFetch("/api/email/dismiss", { method: "POST", body: JSON.stringify({ id }) });
    } catch {}
  };

  if (!current) return null;

  const canLog = selected && reason.trim().length > 0;

  return (
    <AnimatePresence>
      <motion.div
        key={current.id}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        exit={{    opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 380, background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)", fontFamily: "inherit",
        }}
      >
        {/* Header */}
        <div style={{ padding: "13px 15px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Mail size={15} style={{ color: "#6366F1" }} strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Select Email Activity Type</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>New sent email detected</div>
          </div>
          {pending.length > 1 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", flexShrink: 0 }}>
              {pending.length} pending
            </span>
          )}
          <button onClick={handleDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex" }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Email info */}
        <div style={{ padding: "10px 15px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {current.subject || "(No Subject)"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
            <span style={{ fontWeight: 600 }}>From:</span> {current.from_email || "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
            <span style={{ fontWeight: 600 }}>To:</span> {(current.to_emails || []).join(", ") || "—"}
          </div>
          {(current.cc_emails || []).length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
              <span style={{ fontWeight: 600 }}>CC:</span> {current.cc_emails.join(", ")}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>
            <span style={{ fontWeight: 600 }}>Sent:</span> {current.sent_at ? new Date(current.sent_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
            {current.attachment_count > 0 && <span style={{ marginLeft: 8 }}>📎 {current.attachment_count} attachment{current.attachment_count > 1 ? "s" : ""}</span>}
          </div>
          {(current.lead_id || current.customer_id || current.pipeline_id || current.deal_id) && (
            <div style={{ fontSize: 11, color: "#10B981", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <Check size={10} strokeWidth={3} />
              Matched to <strong>{current.crm_record_name || "a CRM record"}</strong> ({current.crm_module || "CRM"})
            </div>
          )}
        </div>

        {/* Type selector */}
        <div style={{ padding: "10px 15px 6px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7 }}>
            Activity Type
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflowY: "auto" }}>
            {EMAIL_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setSelected(type)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 11px", borderRadius: 8,
                  border: `1.5px solid ${selected === type ? "#6366F1" : "var(--border)"}`,
                  background: selected === type ? "rgba(99,102,241,0.08)" : "transparent",
                  color: selected === type ? "#6366F1" : "var(--text-2)",
                  fontWeight: selected === type ? 700 : 400,
                  fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
                  textAlign: "left", transition: "border-color 0.1s, background 0.1s",
                }}
              >
                {type}
                {selected === type && <ChevronRight size={12} strokeWidth={2.5} />}
              </button>
            ))}
          </div>
        </div>

        {/* Reason / Comment (required) */}
        <div style={{ padding: "8px 15px 4px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
            Reason / Comment <span style={{ color: "#EF4444" }}>*</span>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you sending this email? (required)"
            rows={2}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "8px 10px", borderRadius: 8, resize: "none",
              border: `1.5px solid ${reason.trim() ? "var(--border)" : "rgba(239,68,68,0.3)"}`,
              background: "var(--surface-2)", color: "var(--text)",
              fontSize: 12.5, fontFamily: "inherit", outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.target.style.borderColor = "#6366F1"; }}
            onBlur={(e)  => { e.target.style.borderColor = reason.trim() ? "var(--border)" : "rgba(239,68,68,0.3)"; }}
          />
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 15px 14px", display: "flex", gap: 8 }}>
          <button
            onClick={handleDismiss}
            style={{ flex: 1, padding: "8px 0", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}
          >
            Skip
          </button>
          <button
            onClick={handleClassify}
            disabled={loading || !canLog}
            title={!reason.trim() ? "Please enter a reason before logging" : ""}
            style={{
              flex: 2, padding: "8px 0", borderRadius: 9,
              background: canLog ? "#6366F1" : "var(--border)",
              color: canLog ? "#fff" : "var(--text-muted)",
              border: "none", fontSize: 12.5, fontWeight: 700,
              cursor: loading ? "wait" : canLog ? "pointer" : "not-allowed",
              fontFamily: "inherit", opacity: loading ? 0.7 : 1,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {loading ? "Saving…" : "Log Activity"}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
