import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "react-router-dom";
import { db as supabase } from "../lib/db";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { ShieldAlert, Send } from "lucide-react";

// Roles whose screenshot attempts are monitored
const PROTECTED_ROLES = ["sales_manager", "sales_rep", "sales_rep"];

// Friendly page names for notifications/logs
const PAGE_NAMES = {
  "/dashboard": "Dashboard", "/pipeline": "Pipeline", "/leads": "Leads",
  "/deals": "Deals", "/activities": "Activities", "/meetings": "Meetings",
  "/targets": "Targets", "/analytics": "Analytics", "/reports": "Reports",
  "/dsr": "DSR", "/team": "Team", "/chat": "Chat",
  "/security-logs": "Security Logs", "/settings": "Settings",
};

async function logSecurityEvent(profile, eventType, extra = {}) {
  if (!profile?.id) return;
  try {
    await supabase.from("audit_logs").insert({
      user_id:  profile.id,
      action:   `screen_protection_${eventType}`,
      resource: "screen",
      details: {
        user_name:  profile.full_name,
        user_email: profile.email,
        role:       profile.role,
        event:      eventType,
        timestamp:  new Date().toISOString(),
        browser:    navigator.userAgent.slice(0, 200),
        ...extra,
      },
    });
  } catch { /* non-critical */ }
}

async function notifyAdmins(profile, eventType, pageLabel, reason = "") {
  if (!profile) return;
  try {
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["owner", "admin"]);
    if (!admins?.length) return;

    const time = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
    });
    const eventLabel = {
      screenshot_attempt:   "screenshot attempt",
      print_attempt:        "print/screenshot via print",
      screen_share_attempt: "screen recording attempt",
    }[eventType] || "screen capture attempt";

    const title = `Screenshot Attempt — ${profile.full_name || "User"}`;
    const body  = `${profile.full_name || "A user"} made a ${eventLabel} in ${pageLabel} at ${time}.${reason && reason !== "DISMISSED" ? ` Reason: "${reason}"` : reason === "DISMISSED" ? " (No reason provided — dismissed)" : ""}`;

    await Promise.all(
      admins.map((admin) =>
        supabase.from("notifications").insert({
          user_id:     admin.id,
          type:        "security_alert",
          title,
          body,
          link:        "/security-logs",
          entity_type: "security",
          priority:    "urgent",
          read:        false,
          dismissed:   false,
        })
      )
    );
  } catch { /* non-critical */ }
}

/* ─── Screenshot Reason Modal ────────────────────────────────────────────────── */
function ScreenshotReasonModal({ visible, onSubmit, onDismiss }) {
  const [reason,    setReason]    = useState("");
  const [purpose,   setPurpose]   = useState("");
  const [notes,     setNotes]     = useState("");
  const [submitting,setSubmitting]= useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setSubmitting(true);
    await onSubmit({ reason, purpose, notes });
    setSubmitting(false);
    setReason(""); setPurpose(""); setNotes("");
  };

  if (!visible) return null;

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      background: "rgba(15,23,42,0.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{
          maxWidth: 480, width: "90%",
          background: "var(--surface, #fff)",
          borderRadius: 18,
          padding: "28px 32px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.45)",
          border: "1px solid rgba(239,68,68,0.28)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 22 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ShieldAlert size={24} style={{ color: "#EF4444" }} />
          </div>
          <div>
            <h3 style={{ margin: "0 0 5px", fontSize: 17, fontWeight: 800, color: "var(--text, #111)", letterSpacing: "-0.02em" }}>
              Screenshot Justification Required
            </h3>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted, #64748b)", lineHeight: 1.55 }}>
              This action is monitored. Please provide a valid reason — your request will be reviewed by your administrator.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Reason */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Reason for Screenshot *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 9,
                border: `1px solid ${reason ? "var(--border)" : "rgba(239,68,68,0.45)"}`,
                background: "var(--surface-2, #f8fafc)", color: "var(--text)",
                fontSize: 13, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <option value="">Select a reason…</option>
              <option value="Client Presentation">Client Presentation</option>
              <option value="Internal Reporting">Internal Reporting</option>
              <option value="Bug / Issue Report">Bug / Issue Report</option>
              <option value="Training Material">Training Material</option>
              <option value="Documentation">Documentation</option>
              <option value="Manager Request">Manager Request</option>
              <option value="Compliance Audit">Compliance Audit</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Business justification */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Business Justification
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Brief description of business need…"
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 9,
                border: "1px solid var(--border)",
                background: "var(--surface-2, #f8fafc)", color: "var(--text)",
                fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional remarks…"
              rows={2}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 9,
                border: "1px solid var(--border)",
                background: "var(--surface-2, #f8fafc)", color: "var(--text)",
                fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onDismiss}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-muted)", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
            <button type="submit" disabled={!reason || submitting}
              style={{
                flex: 2, padding: "10px 0", borderRadius: 9, border: "none",
                background: reason && !submitting ? "#EF4444" : "rgba(239,68,68,0.3)",
                color: "#fff", fontSize: 13.5, fontWeight: 700,
                cursor: reason && !submitting ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                transition: "background 0.15s",
              }}>
              {submitting ? "Submitting…" : <><Send size={14} /> Submit & Proceed</>}
            </button>
          </div>
        </form>

        <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted, #94a3b8)", marginTop: 14, marginBottom: 0 }}>
          This request is logged and forwarded to your administrator for review.
        </p>
      </motion.div>
    </div>,
    document.body
  );
}

/* ─── Main SecurityMonitor ───────────────────────────────────────────────────── */
export default function SecurityMonitor() {
  const { profile } = useAuth();
  const location    = useLocation();

  const [modalVisible, setModalVisible] = useState(false);
  const [pendingEvent, setPendingEvent]  = useState(null);
  const warnedRef = useRef(new Set());

  const normRole    = (profile?.role || "").toLowerCase().replace(/[- ]/g, "_");
  const isProtected = PROTECTED_ROLES.includes(normRole);

  const currentPage = PAGE_NAMES[location.pathname]
    || location.pathname.split("/").filter(Boolean).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" / ")
    || "CRM";

  const triggerProtection = useCallback((eventType, meta = {}) => {
    if (!isProtected) return;
    const key = `${eventType}-${Math.floor(Date.now() / 3000)}`;
    if (warnedRef.current.has(key)) return;
    warnedRef.current.add(key);
    setPendingEvent({ eventType, meta });
    setModalVisible(true);
  }, [isProtected]);

  const handleModalSubmit = useCallback(async ({ reason, purpose, notes }) => {
    if (!pendingEvent) return;
    const { eventType, meta } = pendingEvent;
    await logSecurityEvent(profile, eventType, {
      ...meta, page: currentPage, reason, purpose, notes,
    });
    await notifyAdmins(profile, eventType, currentPage, reason);
    toast.success("Request logged and sent to admin for review.", {
      duration: 4000, style: { fontWeight: 600 },
    });
    setModalVisible(false);
    setPendingEvent(null);
  }, [pendingEvent, profile, currentPage]);

  const handleModalDismiss = useCallback(async () => {
    if (pendingEvent) {
      await logSecurityEvent(profile, pendingEvent.eventType, {
        ...pendingEvent.meta, page: currentPage, reason: "DISMISSED",
      });
      await notifyAdmins(profile, pendingEvent.eventType, currentPage);
    }
    setModalVisible(false);
    setPendingEvent(null);
  }, [pendingEvent, profile, currentPage]);

  /* ── 1. Print / Screenshot via print dialog ──────────────────────────────── */
  useEffect(() => {
    if (!isProtected) return;
    const onBeforePrint = () => triggerProtection("print_attempt", { method: "print_dialog" });
    window.addEventListener("beforeprint", onBeforePrint);
    const mql = window.matchMedia?.("print");
    const mqlHandler = (e) => { if (e.matches) onBeforePrint(); };
    mql?.addEventListener?.("change", mqlHandler);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      mql?.removeEventListener?.("change", mqlHandler);
    };
  }, [isProtected, triggerProtection]);

  /* ── 2. Screenshot keyboard shortcuts ────────────────────────────────────── */
  useEffect(() => {
    if (!isProtected) return;
    const SCREENSHOT_KEYS = new Set(["PrintScreen", "F13"]);
    const onKeyDown = (e) => {
      const isPrtSc = SCREENSHOT_KEYS.has(e.code);
      const isSnip  = e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
      if (isPrtSc || isSnip) {
        triggerProtection("screenshot_attempt", { key: e.code, method: "keyboard_shortcut" });
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [isProtected, triggerProtection]);

  /* ── 3. Screen share / recording via getDisplayMedia intercept ───────────── */
  useEffect(() => {
    if (!isProtected) return;
    if (!navigator.mediaDevices?.getDisplayMedia) return;
    const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async function (...args) {
      triggerProtection("screen_share_attempt", { method: "getDisplayMedia" });
      try {
        const stream = await original(...args);
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () =>
            logSecurityEvent(profile, "screen_share_ended", { method: "getDisplayMedia" })
          );
        });
        return stream;
      } catch (err) { throw err; }
    };
    return () => { if (original) navigator.mediaDevices.getDisplayMedia = original; };
  }, [isProtected, triggerProtection, profile]);

  /* ── 4. CSS: suppress content in print media ─────────────────────────────── */
  useEffect(() => {
    if (!isProtected) return;
    const style = document.createElement("style");
    style.id = "crm-no-print";
    style.textContent = `@media print { body > * { visibility: hidden !important; } body::after { visibility: visible !important; content: "This document is confidential. Printing is not permitted."; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: bold; color: #EF4444; } }`;
    document.head.appendChild(style);
    return () => document.getElementById("crm-no-print")?.remove();
  }, [isProtected]);

  if (!profile || !isProtected) return null;

  return (
    <ScreenshotReasonModal
      visible={modalVisible}
      onSubmit={handleModalSubmit}
      onDismiss={handleModalDismiss}
    />
  );
}
