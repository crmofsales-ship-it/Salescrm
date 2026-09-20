import { useState, useEffect, useCallback, useRef } from "react";
import { getAccessToken } from "../lib/session";
import { teamService } from "../services/teamService";
import toast from "react-hot-toast";
import {
  Search, RefreshCw, Trash2, Edit2, Check, X, ChevronLeft, ChevronRight,
  Mail, Calendar, Filter, Download,
} from "lucide-react";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

const STATUS_LABEL  = { classified: "Logged",   pending: "Pending", dismissed: "Skipped" };
const STATUS_COLOR  = { classified: "#10B981",   pending: "#F59E0B", dismissed: "#9CA3AF" };
const STATUS_BG     = { classified: "#10B98118", pending: "#F59E0B18", dismissed: "#9CA3AF18" };
const MODULE_LABEL  = { lead: "Lead", customer: "Customer", pipeline: "Pipeline" };
const FOLLOWUP_OPTS = [
  { value: "none",    label: "No Follow-up" },
  { value: "pending", label: "Pending"       },
  { value: "done",    label: "Done"          },
];

const DATE_PRESETS = [
  { label: "Today",       value: "today"    },
  { label: "Yesterday",   value: "yesterday"},
  { label: "Last 7 Days", value: "7d"       },
  { label: "Last 30 Days",value: "30d"      },
  { label: "This Month",  value: "month"    },
  { label: "Custom",      value: "custom"   },
];

function datePresetToRange(preset) {
  const now = new Date();
  const d   = (n) => new Date(now.getTime() - n * 86400000).toISOString().split("T")[0];
  const y   = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, "0");
  if (preset === "today")     return { from: d(0), to: d(0) };
  if (preset === "yesterday") return { from: d(1), to: d(1) };
  if (preset === "7d")        return { from: d(7), to: d(0) };
  if (preset === "30d")       return { from: d(30),to: d(0) };
  if (preset === "month")     return { from: `${y}-${m}-01`, to: d(0) };
  return { from: "", to: "" };
}

const PAGE_SIZE = 20;

export default function EmailActivityLog({ profile }) {
  const isAdmin = ["owner", "admin"].includes(profile?.role);
  const canFilter = ["owner", "admin", "sales_manager"].includes(profile?.role);

  const [logs,         setLogs]         = useState([]);
  const [stats,        setStats]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [teamMembers,  setTeamMembers]  = useState([]);
  const [page,         setPage]         = useState(1);
  const [total,        setTotal]        = useState(0);

  // Filters
  const [search,       setSearch]       = useState("");
  const [datePreset,   setDatePreset]   = useState("");
  const [customFrom,   setCustomFrom]   = useState("");
  const [customTo,     setCustomTo]     = useState("");
  const [filterUser,   setFilterUser]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterModule, setFilterModule] = useState("");

  // Inline edit state
  const [editId,       setEditId]       = useState(null);
  const [editReason,   setEditReason]   = useState("");
  const [editFU,       setEditFU]       = useState("");
  const [editFUDate,   setEditFUDate]   = useState("");
  const [savingEdit,   setSavingEdit]   = useState(false);

  // Delete confirm
  const [deleteId,     setDeleteId]     = useState(null);

  const apiFetch = useCallback(async (path, opts = {}) => {
    const token = await getAccessToken();
    return fetch(`${API}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      let from = customFrom, to = customTo;
      if (datePreset && datePreset !== "custom") {
        const r = datePresetToRange(datePreset);
        from = r.from; to = r.to;
      }
      if (filterUser)   params.set("user_id",    filterUser);
      if (from)         params.set("from",        from + "T00:00:00.000Z");
      if (to)           params.set("to",          to   + "T23:59:59.999Z");
      if (filterStatus) params.set("status",      filterStatus);
      if (filterModule) params.set("module",      filterModule);
      if (search)       params.set("record_name", search);

      const [rLogs, rStats] = await Promise.all([
        apiFetch(`/api/email/log?${params.toString()}`),
        apiFetch("/api/email/stats"),
      ]);
      const logsData  = rLogs.ok  ? await rLogs.json()  : [];
      const statsData = rStats.ok ? await rStats.json() : null;

      // client-side search on subject/email too
      const filtered = search
        ? logsData.filter((l) =>
            (l.subject || "").toLowerCase().includes(search.toLowerCase()) ||
            (l.from_email || "").toLowerCase().includes(search.toLowerCase()) ||
            (l.crm_record_name || "").toLowerCase().includes(search.toLowerCase()) ||
            ((l.to_emails || [])[0] || "").toLowerCase().includes(search.toLowerCase())
          )
        : logsData;

      setTotal(filtered.length);
      setLogs(filtered);
      setStats(statsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filterUser, datePreset, customFrom, customTo, filterStatus, filterModule, search]);

  useEffect(() => { fetchLogs(); setPage(1); }, [fetchLogs]);

  useEffect(() => {
    if (!canFilter) return;
    teamService.getAll().then((res) => setTeamMembers(res?.data || [])).catch(() => {});
  }, [canFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paged      = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats derived from logs + backend stats
  const loggedCount    = logs.filter((l) => l.status === "classified").length;
  const pendingCount   = logs.filter((l) => l.status === "pending").length;
  const dismissedCount = logs.filter((l) => l.status === "dismissed").length;

  const startEdit = (log) => {
    setEditId(log.id);
    setEditReason(log.reason || "");
    setEditFU(log.follow_up_status || "none");
    setEditFUDate(log.follow_up_date || "");
  };

  const cancelEdit = () => { setEditId(null); setEditReason(""); setEditFU(""); setEditFUDate(""); };

  const saveEdit = async (id) => {
    setSavingEdit(true);
    try {
      const r = await apiFetch(`/api/email/log/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ reason: editReason, follow_up_status: editFU, follow_up_date: editFUDate || null }),
      });
      if (!r.ok) throw new Error();
      toast.success("Updated");
      setLogs((prev) => prev.map((l) => l.id === id
        ? { ...l, reason: editReason, follow_up_status: editFU, follow_up_date: editFUDate || null }
        : l
      ));
      cancelEdit();
    } catch { toast.error("Update failed"); }
    finally { setSavingEdit(false); }
  };

  const confirmDelete = async (id) => {
    try {
      const r = await apiFetch(`/api/email/log/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); toast.error(e.error || "Delete failed"); return; }
      toast.success("Record deleted");
      setLogs((prev) => prev.filter((l) => l.id !== id));
      setDeleteId(null);
    } catch { toast.error("Delete failed"); }
  };

  const clearFilters = () => {
    setSearch(""); setDatePreset(""); setCustomFrom(""); setCustomTo("");
    setFilterUser(""); setFilterStatus(""); setFilterModule("");
  };

  const hasFilters = search || datePreset || filterUser || filterStatus || filterModule;

  const inp = { padding: "7px 11px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 12.5, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Stats Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[
          { label: "Total Emails", value: total,        color: "#6366F1" },
          { label: "Logged",       value: loggedCount,  color: "#10B981" },
          { label: "Pending",      value: pendingCount, color: "#F59E0B" },
          { label: "Skipped",      value: dismissedCount,color: "#9CA3AF"},
        ].map((s) => (
          <div key={s.label} style={{ padding: "14px 18px", borderRadius: 12, background: "var(--surface-2)", border: "1.5px solid var(--border)" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{ background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1", minWidth: 180 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject, recipient, record…"
              style={{ ...inp, width: "100%", boxSizing: "border-box", paddingLeft: 32 }} />
          </div>

          {/* Date Preset */}
          <select value={datePreset} onChange={(e) => { setDatePreset(e.target.value); if (e.target.value !== "custom") { setCustomFrom(""); setCustomTo(""); } }} style={inp}>
            <option value="">All Dates</option>
            {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          {/* Custom date range */}
          {datePreset === "custom" && (<>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={inp} title="From" />
            <input type="date" value={customTo}   onChange={(e) => setCustomTo(e.target.value)}   style={inp} title="To" />
          </>)}

          {/* Status */}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={inp}>
            <option value="">All Status</option>
            <option value="classified">Logged</option>
            <option value="pending">Pending</option>
            <option value="dismissed">Skipped</option>
          </select>

          {/* Module */}
          <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)} style={inp}>
            <option value="">All Modules</option>
            <option value="lead">Lead</option>
            <option value="customer">Customer</option>
            <option value="pipeline">Pipeline</option>
          </select>

          {/* User filter (admin only) */}
          {canFilter && (
            <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} style={inp}>
              <option value="">All Users</option>
              {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}

          <button onClick={fetchLogs} style={{ ...inp, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none" }}>
            <RefreshCw size={12} /> Refresh
          </button>

          {hasFilters && (
            <button onClick={clearFilters} style={{ ...inp, cursor: "pointer", color: "#EF4444", borderColor: "#EF444433", background: "transparent" }}>
              <X size={12} style={{ display: "inline", marginRight: 4 }} />Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>

        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1.2fr 1.4fr 1fr 1fr 1.2fr 1.2fr 1fr 80px", background: "var(--surface-2)", borderBottom: "1.5px solid var(--border)", padding: "10px 16px", gap: 8 }}>
          {["Subject", "Sender", "Recipient", "CRM Record", "Module", "Type", "Status", "Sent At", ""].map((h) => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading email activities…</div>
        ) : paged.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Mail size={32} style={{ color: "var(--border)", display: "block", margin: "0 auto 12px" }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-2)" }}>No email activities found</div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
              {hasFilters ? "Try clearing filters" : "Connect Gmail in Settings → Email to start tracking"}
            </div>
          </div>
        ) : (
          paged.map((log, i) => {
            const isEditing = editId === log.id;
            const isConfirming = deleteId === log.id;
            return (
              <div key={log.id}>
                {/* Main row */}
                <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1.2fr 1.4fr 1fr 1fr 1.2fr 1.2fr 1fr 80px", padding: "11px 16px", gap: 8, borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--surface-2)", alignItems: "center" }}>
                  {/* Subject */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.subject || "(No Subject)"}</div>
                    {log.reason && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {log.reason}</div>}
                  </div>
                  {/* Sender */}
                  <div style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.sender_name || log.from_email?.split("@")[0] || "—"}
                  </div>
                  {/* Recipient */}
                  <div style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(log.to_emails || [])[0] || "—"}
                  </div>
                  {/* CRM Record */}
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.crm_record_name || "—"}
                  </div>
                  {/* Module */}
                  <div>
                    {log.crm_module ? (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)" }}>
                        {MODULE_LABEL[log.crm_module] || log.crm_module}
                      </span>
                    ) : "—"}
                  </div>
                  {/* Email Type */}
                  <div style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.activity_type || "—"}
                  </div>
                  {/* Status */}
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: STATUS_BG[log.status] || "#9CA3AF18", color: STATUS_COLOR[log.status] || "#9CA3AF", border: `1px solid ${STATUS_COLOR[log.status] || "#9CA3AF"}33` }}>
                      {STATUS_LABEL[log.status] || log.status}
                    </span>
                  </div>
                  {/* Sent At */}
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {log.sent_at ? new Date(log.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button onClick={() => isEditing ? cancelEdit() : startEdit(log)}
                      style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: isEditing ? "#6366F1" : "var(--text-muted)", padding: "4px 6px", display: "flex" }}
                      title="Edit remarks">
                      <Edit2 size={12} />
                    </button>
                    {isAdmin && (
                      <button onClick={() => setDeleteId(isConfirming ? null : log.id)}
                        style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: isConfirming ? "#EF4444" : "var(--text-muted)", padding: "4px 6px", display: "flex" }}
                        title="Delete">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Delete confirm row */}
                {isConfirming && (
                  <div style={{ padding: "10px 16px", background: "#FEF2F2", borderBottom: "1px solid #FECACA", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "#991B1B" }}>Delete this email activity record?</span>
                    <button onClick={() => confirmDelete(log.id)} style={{ padding: "5px 14px", borderRadius: 7, background: "#EF4444", color: "#fff", border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                    <button onClick={() => setDeleteId(null)} style={{ padding: "5px 14px", borderRadius: 7, background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)", fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
                  </div>
                )}

                {/* Edit row */}
                {isEditing && (
                  <div style={{ padding: "12px 16px", background: "rgba(99,102,241,0.03)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 2, minWidth: 200 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>Reason / Remarks</div>
                      <input value={editReason} onChange={(e) => setEditReason(e.target.value)}
                        style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Add reason or remark…" />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>Follow-up Status</div>
                      <select value={editFU} onChange={(e) => setEditFU(e.target.value)} style={inp}>
                        {FOLLOWUP_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    {editFU === "pending" && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>Follow-up Date</div>
                        <input type="date" value={editFUDate} onChange={(e) => setEditFUDate(e.target.value)} style={inp} />
                      </div>
                    )}
                    <button onClick={() => saveEdit(log.id)} disabled={savingEdit}
                      style={{ padding: "7px 16px", borderRadius: 8, background: "#6366F1", color: "#fff", border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                      <Check size={13} /> {savingEdit ? "Saving…" : "Save"}
                    </button>
                    <button onClick={cancelEdit} style={{ padding: "7px 12px", borderRadius: 8, background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 12.5, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: page === 1 ? "not-allowed" : "pointer", color: "var(--text-2)", display: "flex", alignItems: "center" }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ padding: "6px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700 }}>{page}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: page === totalPages ? "not-allowed" : "pointer", color: "var(--text-2)", display: "flex", alignItems: "center" }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
