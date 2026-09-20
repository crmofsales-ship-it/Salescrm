import { useState } from "react";
import { X, Send, Mail, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { getAccessToken } from "../lib/session";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

export default function EmailComposerModal({
  to,
  toName = "",
  pipelineId = null,
  leadId = null,
  dealId = null,
  customerId = null,
  assignedTo = null,
  recordName = "",
  defaultSubject = "",
  autoCompose = false,
  onClose,
  onSent,
}) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState(autoCompose ? "compose" : "confirm");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const canSend =
    profile?.role === "owner" ||
    profile?.role === "admin" ||
    profile?.role === "sales_manager" ||
    !assignedTo ||
    assignedTo === profile?.id;

  const handleSend = async () => {
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    if (!body.trim()) { toast.error("Message body is required"); return; }

    setSending(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${API}/api/email/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body: body.replace(/\n/g, "<br>"),
          pipeline_id: pipelineId || undefined,
          lead_id:     leadId     || undefined,
          deal_id:     dealId     || undefined,
          customer_id: customerId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "insufficient_scope") {
          toast.error(
            "Please reconnect your Gmail account in Settings to enable email sending.",
            { duration: 7000 }
          );
        } else {
          toast.error(data.error || `Server error (${res.status}). Please try again.`);
        }
        return;
      }
      toast.success("Email sent successfully!");
      onSent?.();
      onClose();
    } catch (err) {
      if (err?.message?.includes("auth")) {
        toast.error("Session expired. Please refresh the page and try again.");
      } else {
        toast.error("Could not reach the server. Check your connection or try again.");
      }
      console.error("[EmailComposer] send error:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10001,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div style={{
        width: "min(580px, 100%)", background: "var(--surface)", borderRadius: 16,
        boxShadow: "0 24px 80px rgba(0,0,0,0.35)", border: "1px solid var(--border)",
        display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "15px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.22)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Mail size={16} style={{ color: "#6366F1" }} strokeWidth={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              {step === "confirm" ? "Send Email" : "Compose Email"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {step === "confirm" ? "Contact via CRM Email" : `To: ${toName ? `${toName} <${to}>` : to}`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)",
              border: "1px solid var(--border)", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0,
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Confirmation Step */}
        {step === "confirm" && (
          <div style={{ padding: "24px 24px 20px" }}>
            {!canSend ? (
              <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                <AlertCircle size={32} style={{ color: "#EF4444", margin: "0 auto 12px", display: "block" }} strokeWidth={1.5} />
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>No Permission</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  You can only send emails to records assigned to you.
                </div>
                <button
                  onClick={onClose}
                  style={{
                    marginTop: 20, padding: "9px 22px", borderRadius: 9,
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                    color: "var(--text-2)", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
                  Do you want to contact this customer via Email?
                </div>
                <div style={{
                  padding: "12px 16px", borderRadius: 10,
                  background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: 22,
                }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>RECIPIENT</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{toName || to}</div>
                  {toName && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{to}</div>}
                  {recordName && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Record: {recordName}</div>}
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    onClick={onClose}
                    style={{
                      padding: "9px 18px", borderRadius: 9, background: "var(--surface-2)",
                      border: "1px solid var(--border)", color: "var(--text-2)", fontSize: 13,
                      fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setStep("compose")}
                    style={{
                      padding: "9px 22px", borderRadius: 9, background: "#6366F1",
                      border: "none", color: "#fff", fontSize: 13, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Continue
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Compose Step */}
        {step === "compose" && (
          <>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {/* To */}
              <div style={{
                padding: "11px 20px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", width: 44, flexShrink: 0, letterSpacing: "0.06em" }}>TO</span>
                <div style={{ flex: 1, fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                  {toName ? `${toName} <${to}>` : to}
                </div>
              </div>

              {/* Subject */}
              <div style={{
                padding: "11px 20px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", width: 44, flexShrink: 0, letterSpacing: "0.06em" }}>SUBJ</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter subject..."
                  autoFocus
                  style={{
                    flex: 1, fontSize: 13.5, color: "var(--text)", background: "transparent",
                    border: "none", outline: "none", fontFamily: "inherit", fontWeight: 500,
                  }}
                />
              </div>

              {/* Body */}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message here..."
                style={{
                  display: "block", width: "100%", minHeight: 270,
                  padding: "16px 20px", fontSize: 13.5, color: "var(--text)",
                  background: "transparent", border: "none", outline: "none",
                  fontFamily: "inherit", lineHeight: 1.75, resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 20px", borderTop: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            }}>
              <button
                onClick={onClose}
                style={{
                  padding: "9px 18px", borderRadius: 9, background: "var(--surface-2)",
                  border: "1px solid var(--border)", color: "var(--text-2)", fontSize: 13,
                  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                style={{
                  padding: "9px 22px", borderRadius: 9,
                  background: sending ? "rgba(99,102,241,0.5)" : "#6366F1",
                  border: "none", color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 7,
                }}
              >
                <Send size={13} strokeWidth={2} />
                {sending ? "Sending…" : "Send Email"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
