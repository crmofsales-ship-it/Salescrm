import { createPortal } from "react-dom";
import { AlertTriangle, AlertCircle, ShieldOff } from "lucide-react";

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtStage = (s) =>
  (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function getMemberName(id, members) {
  if (!id || !members?.length) return "—";
  const m = members.find((m) => m.id === id || m.user_id === id);
  return m?.full_name || "—";
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

/**
 * DuplicateCheckModal
 *
 * Props:
 *   type          "exact" | "partial"
 *   duplicates    [{ record, reasons }]  — for frontend-detected duplicates
 *   entityType    "lead" | "pipeline" | "deal"
 *   teamMembers   array of profile objects
 *   onCancel      fn — close modal, keep form open
 *   onProceed     fn — Create New Record (partial matches only)
 *   onViewExisting fn(record) — navigate to existing record
 *   crossRole     bool — true when duplicate was detected cross-role by backend
 *                        (user cannot see the existing record)
 */
export function DuplicateCheckModal({
  type,
  duplicates = [],
  entityType = "lead",
  teamMembers = [],
  onCancel,
  onProceed,
  onViewExisting,
  crossRole = false,
}) {
  const isExact = type === "exact";
  const hasDuplicate = crossRole || duplicates?.length > 0;

  if (!hasDuplicate) return null;

  const top = duplicates?.[0];
  const rec = top?.record;
  const stageField = entityType === "pipeline" ? "pipeline_stage" : "stage";

  const ENTITY_LABEL = { lead: "Lead", pipeline: "Prospect", deal: "Deal" };
  const entity = ENTITY_LABEL[entityType] || "Record";

  const accentColor = isExact ? "#EF4444" : "#F59E0B";
  const accentBg    = isExact ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)";
  const accentBorder = isExact ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)";

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: "var(--bg-card, #1e1e2e)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          width: "100%", maxWidth: 520,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            {isExact
              ? <AlertTriangle size={20} color={accentColor} />
              : <AlertCircle size={20} color={accentColor} />}
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              {isExact ? "Duplicate Prospect Found" : "Similar Company Found"}
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {isExact
              ? `An identical ${entity.toLowerCase()} already exists in the CRM. To maintain data quality, duplicate records cannot be created.`
              : `A similar company was found in the existing ${entity.toLowerCase()} records.`}
          </p>
        </div>

        {/* Existing record details — or no-access message for cross-role */}
        <div style={{ padding: "16px 24px" }}>
          {crossRole ? (
            /* Cross-role: user cannot see the record */
            <div style={{
              display: "flex", gap: 12, alignItems: "flex-start",
              padding: "14px 16px", borderRadius: 8,
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}>
              <ShieldOff size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                  This Prospect already exists in the CRM
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
                  You do not have permission to access this record. Contact your Sales Manager,
                  Sales Head, or Super Admin if you believe access is required.
                </div>
              </div>
            </div>
          ) : rec ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase" }}>
                Existing {entity}
              </div>
              <div
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8, padding: "12px 14px",
                  display: "grid", gridTemplateColumns: "1fr 1fr",
                  gap: "10px 20px",
                }}
              >
                <InfoRow label="Company"     value={rec.company_name || rec.title} />
                <InfoRow label="Contact"     value={rec.contact_name} />
                <InfoRow label="Stage"       value={fmtStage(rec[stageField] || rec.stage)} />
                <InfoRow label="Created"     value={fmtDate(rec.created_at)} />
                <InfoRow label="Assigned To" value={getMemberName(rec.assigned_to, teamMembers)} />
                <InfoRow label="Last Updated" value={fmtDate(rec.updated_at)} />
              </div>

              {/* Match reason badges */}
              {top?.reasons?.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {top.reasons.map((r) => (
                    <span
                      key={r}
                      style={{
                        fontSize: 11, fontWeight: 600,
                        padding: "3px 8px", borderRadius: 99,
                        background: accentBg, color: accentColor,
                        border: `1px solid ${accentBorder}`,
                      }}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}

              {duplicates.length > 1 && (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                  +{duplicates.length - 1} more similar {entity.toLowerCase()}{duplicates.length > 2 ? "s" : ""} found
                </p>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 24px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap",
          }}
        >
          <button onClick={onCancel} className="btn-secondary" style={{ fontSize: 13 }}>
            Cancel
          </button>

          {/* View Existing — only when user has access to the record */}
          {!crossRole && rec && (
            <button
              onClick={() => onViewExisting(rec)}
              className="btn-secondary"
              style={{ fontSize: 13, color: "#6366F1", borderColor: "rgba(99,102,241,0.4)" }}
            >
              View Existing {entity}
            </button>
          )}

          {/* For EXACT duplicates: NO create/override button — creation is blocked */}
          {/* For PARTIAL matches: allow creating a new record */}
          {!isExact && (
            <button onClick={onProceed} className="btn-primary" style={{ fontSize: 13 }}>
              Create New Record
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
