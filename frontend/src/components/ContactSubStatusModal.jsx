import { useState } from "react";
import { createPortal } from "react-dom";

export const ATTEMPTED_CONTACT_REASONS = [
  "No Answer",
  "Call Busy",
  "Switched Off",
  "Number Unreachable",
  "Wrong Number",
  "Voicemail",
  "Call Disconnected",
  "Email Sent – Awaiting Response",
  "WhatsApp Message Sent – No Reply",
  "LinkedIn Message Sent – No Response",
  "Requested Callback",
  "Contact Not Available",
  "Unable to Connect",
  "Other",
];

export const ENGAGED_REASONS = [
  "Initial Conversation Completed",
  "Interested – Follow-up Required",
  "Requested Product Demo",
  "Requested Pricing",
  "Requested Proposal",
  "Shared Business Requirements",
  "Decision Maker Identified",
  "Meeting Scheduled",
  "Evaluation in Progress",
  "Waiting for Internal Approval",
  "Follow-up Scheduled",
  "Positive Response Received",
  "Needs More Information",
  "Other",
];

const STATUS_META = {
  attempted_contact: { label: "Attempted Contact", color: "#F59E0B", reasons: ATTEMPTED_CONTACT_REASONS },
  engaged:           { label: "Engaged",           color: "#3B82F6", reasons: ENGAGED_REASONS           },
};

export function ContactSubStatusModal({ status, onConfirm, onCancel }) {
  const meta = STATUS_META[status];
  const [reason,  setReason]  = useState("");
  const [remarks, setRemarks] = useState("");
  const [error,   setError]   = useState(false);

  if (!meta) return null;

  const handleConfirm = () => {
    if (!reason) { setError(true); return; }
    onConfirm(reason, remarks.trim() || null);
  };

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, backdropFilter: "blur(2px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div style={{
        background: "var(--surface, #fff)", borderRadius: 14, width: 420, maxWidth: "95vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border, #E2E8F0)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: meta.color, flexShrink: 0,
            }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text, #0F172A)" }}>
              {meta.label}
            </h3>
          </div>
          <p style={{ margin: "6px 0 0 20px", fontSize: 12.5, color: "var(--text-muted, #64748B)", lineHeight: 1.5 }}>
            Select the reason for this status. This will be recorded in the activity log.
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted, #64748B)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Reason <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(false); }}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                border: `1.5px solid ${error ? "#EF4444" : "var(--border, #CBD5E1)"}`,
                fontSize: 13, color: reason ? "var(--text, #0F172A)" : "var(--text-muted, #94A3B8)",
                background: "var(--surface, #fff)", outline: "none",
                fontFamily: "inherit", appearance: "none",
              }}
              autoFocus
            >
              <option value="">— Select a reason —</option>
              {meta.reasons.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {error && (
              <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#EF4444" }}>
                Please select a reason before saving.
              </p>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted, #64748B)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Remarks <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add any additional context or notes..."
              rows={3}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                border: "1.5px solid var(--border, #CBD5E1)",
                fontSize: 13, color: "var(--text, #0F172A)",
                background: "var(--surface, #fff)", outline: "none",
                fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 22px 18px", display: "flex", justifyContent: "flex-end",
          gap: 10, borderTop: "1px solid var(--border, #E2E8F0)",
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "1.5px solid var(--border, #CBD5E1)",
              background: "transparent", fontSize: 13, fontWeight: 600,
              color: "var(--text-muted, #64748B)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: meta.color, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            Save Status
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Inline version for use inside edit forms (no portal)
export function ContactSubStatusInline({ status, value, remarks, onChange, onRemarksChange }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
      <div>
        <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted, #64748B)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
          {meta.label} Reason <span style={{ color: "#EF4444" }}>*</span>
        </label>
        <select
          className="crm-input"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Select a reason —</option>
          {meta.reasons.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted, #64748B)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
          Remarks <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
        </label>
        <textarea
          className="crm-input"
          value={remarks || ""}
          onChange={(e) => onRemarksChange(e.target.value)}
          placeholder="Add context or notes..."
          rows={2}
          style={{ resize: "vertical" }}
        />
      </div>
    </div>
  );
}
