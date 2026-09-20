import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { teamService } from "../services/teamService";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Plus, Search, X, Edit2, Users, Shield, UserCheck, UserX, Trash2, ChevronDown } from "lucide-react";

const ROLES = [
  { key: "owner",         label: "Owner",          desc: "Full control — billing, members, integrations, all data",
    color: "#7C3AED", bg: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.22)", badgeBg: "rgba(124,58,237,0.12)", dot: "#A78BFA" },
  { key: "admin",         label: "Admin",          desc: "Manage members, settings, integrations & all CRM data",
    color: "#DC2626", bg: "rgba(220,38,38,0.07)",  border: "rgba(220,38,38,0.2)",  badgeBg: "rgba(220,38,38,0.1)",  dot: "#F87171" },
  { key: "sales_manager", label: "Sales Manager",  desc: "Manage the sales team, pipelines, reports & targets",
    color: "#1D4ED8", bg: "rgba(29,78,216,0.07)",  border: "rgba(29,78,216,0.2)",  badgeBg: "rgba(29,78,216,0.1)",  dot: "#60A5FA" },
  { key: "sales_rep",     label: "Sales Rep",      desc: "Own assigned leads, contacts, deals, activities & tasks",
    color: "#059669", bg: "rgba(5,150,105,0.07)",  border: "rgba(5,150,105,0.2)",  badgeBg: "rgba(5,150,105,0.1)",  dot: "#34D399" },
];

const ROLE_LEVEL = { owner: 4, admin: 3, sales_manager: 2, sales_rep: 1 };

function getAssignableRoles(myRole) {
  if (myRole === "owner") return ROLES;
  if (myRole === "admin") return ROLES.filter((r) => ["sales_manager", "sales_rep"].includes(r.key));
  return [];
}

function canManageMember(myRole, targetRole, isMe) {
  if (isMe) return false;
  if (myRole !== "owner" && myRole !== "admin") return false;
  return (ROLE_LEVEL[myRole] || 0) > (ROLE_LEVEL[targetRole] || 0);
}

function RoleBadge({ role }) {
  const r = ROLES.find((x) => x.key === role);
  if (!r) return null;
  return (
    <span style={{ background: r.badgeBg, color: r.color, fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, border: `1px solid ${r.border}`, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
      {r.label}
    </span>
  );
}

function InviteModal({ onClose, onInvite, allowedRoles }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { email: "", role: allowedRoles[0]?.key || "sales_rep" },
  });

  const buildPayload = (data) => ({
    ...data,
    email: data.email.trim().toLowerCase(),
  });

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Invite Team Member</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => onInvite(buildPayload(d)))} style={{ padding: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="crm-label">Full Name *</label>
              <input className="crm-input" {...register("full_name", { required: "Required" })} placeholder="Jane Smith" />
              {errors.full_name && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.full_name.message}</span>}
            </div>

            <div>
              <label className="crm-label">Work Email *</label>
              <input
                className="crm-input"
                type="email"
                {...register("email", {
                  required: "Required",
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address" },
                })}
                placeholder="jane.smith@company.com"
              />
              {errors.email && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.email.message}</span>}
            </div>

            <div>
              <label className="crm-label">Phone</label>
              <input className="crm-input" {...register("phone")} placeholder="+91 98765 43210" />
            </div>

            <div>
              <label className="crm-label">Assign Role *</label>
              <select
                className="crm-input"
                {...register("role", { required: "Required" })}
                style={{ marginTop: 4 }}
              >
                {allowedRoles.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
              {errors.role && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.role.message}</span>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditRoleModal({ member, onClose, onSave, allowedRoles }) {
  const [role, setRole] = useState(member.role);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Change Role</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#F8FAFC", borderRadius: 10, marginBottom: 18 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg, #1B76D3, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white", flexShrink: 0 }}>
              {member.full_name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{member.full_name}</div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>{member.email}</div>
            </div>
          </div>

          <label className="crm-label">Select New Role</label>
          <select
            className="crm-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ marginTop: 4 }}
          >
            {allowedRoles.map((r) => (
              <option key={r.key} value={r.key}>{r.label} — {r.desc}</option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onSave(member.id, role)} disabled={role === member.role}>
              Save Role
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Team() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [showInvite, setShowInvite]       = useState(false);
  const [editMember, setEditMember]       = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [search, setSearch]               = useState("");
  const [filterRole, setFilterRole]       = useState("");
  const [credentials, setCredentials]     = useState(null);
  const [openSections, setOpenSections]   = useState(() => new Set(ROLES.map((r) => r.key)));

  const toggleSection = (key) => setOpenSections((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const myRole = profile?.role;
  const assignableRoles = getAssignableRoles(myRole);
  const canInvite = assignableRoles.length > 0;

  const { data: teamData, isLoading } = useQuery({
    queryKey: ["team", search, filterRole],
    queryFn: () => teamService.getAll({ search, role: filterRole }),
  });

  const inviteMutation = useMutation({
    mutationFn: teamService.inviteMember,
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setShowInvite(false);
      const name = vars.full_name || vars.name;
      if (res?.tempPassword) {
        setCredentials({ name, email: vars.email, tempPassword: res.tempPassword });
      }
      if (res?.emailSent) toast.success(`Invitation sent to ${vars.email}`);
      else toast.success("Member added successfully!");
    },
    onError: (e) => {
      if (!e.response) {
        const backendUrl = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");
        if (backendUrl.includes("localhost")) {
          toast.error("Backend not configured for production. Set VITE_API_URL to your deployed backend URL and redeploy.", { duration: 8000 });
        } else {
          toast.error(`Could not reach server at ${backendUrl}. Make sure the backend is running.`, { duration: 6000 });
        }
      } else {
        toast.error(e.response?.data?.error || e.response?.data?.message || "Invitation failed. Please try again.");
      }
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => teamService.updateRole(id, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Role updated"); setEditMember(null); },
    onError: (e) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, active }) => active ? teamService.activate(id) : teamService.deactivate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Status updated"); },
  });

  const removeMutation = useMutation({
    mutationFn: (id) => teamService.removeMember(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Member removed"); setConfirmRemove(null); },
    onError: (e) => toast.error(e.message),
  });

  const members = teamData?.data || [];
  const online = members.filter((m) => m.online_at && new Date(m.online_at) > new Date(Date.now() - 5 * 60 * 1000)).length;
  const roleCounts = ROLES.map((r) => ({ ...r, count: members.filter((m) => m.role === r.key).length }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Toolbar */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Online</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{online}</span>
          </div>
          <div style={{ width: 1, height: 16, background: "var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Users size={13} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Total</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{teamData?.count || 0}</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="crm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members..." style={{ paddingLeft: 30, fontSize: 13, height: 36, width: 210 }} />
        </div>
        <select className="crm-input" value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={{ width: "auto", fontSize: 13, height: 36 }}>
          <option value="">All Roles</option>
          {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        {canInvite && (
          <button className="btn-primary" onClick={() => setShowInvite(true)}>
            <Plus size={14} /> Invite Member
          </button>
        )}
      </div>

      {/* Collapsible Role Sections */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite", margin: "0 auto 10px" }} />
            Loading team members...
          </div>
        ) : members.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <Users size={36} style={{ color: "var(--border-2)", margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-muted)" }}>No members found</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ROLES.map((roleInfo) => {
              const roleMembers = members.filter((m) => m.role === roleInfo.key);
              if (roleMembers.length === 0) return null;
              const isOpen = openSections.has(roleInfo.key);

              return (
                <div key={roleInfo.key} className="card" style={{ overflow: "hidden", borderColor: isOpen ? roleInfo.border : "var(--border)", transition: "border-color 0.15s" }}>
                  {/* Section Header */}
                  <button
                    onClick={() => toggleSection(roleInfo.key)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 20px",
                      background: isOpen ? roleInfo.bg : "transparent",
                      border: "none",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      borderBottom: isOpen ? `1px solid ${roleInfo.border}` : "none",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = roleInfo.bg; }}
                    onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Color accent bar */}
                    <span style={{ width: 4, height: 32, borderRadius: 99, background: roleInfo.color, flexShrink: 0, opacity: 0.9 }} />

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      {/* Role label pill */}
                      <span style={{
                        fontSize: 12.5, fontWeight: 800, color: roleInfo.color,
                        background: roleInfo.badgeBg, border: `1.5px solid ${roleInfo.border}`,
                        padding: "3px 12px", borderRadius: 99, letterSpacing: "-0.01em",
                        whiteSpace: "nowrap",
                      }}>
                        {roleInfo.label}
                      </span>

                      {/* Member count */}
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, color: roleInfo.color,
                        background: roleInfo.badgeBg, padding: "2px 8px", borderRadius: 99,
                        border: `1px solid ${roleInfo.border}`,
                      }}>
                        {roleMembers.length}
                      </span>

                      {/* Desc — only on wider screens */}
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 400, letterSpacing: "-0.005em" }}>{roleInfo.desc}</span>
                    </div>

                    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.18 }} style={{ color: roleInfo.color, flexShrink: 0, opacity: 0.7 }}>
                      <ChevronDown size={15} />
                    </motion.div>
                  </button>

                  {/* Members List */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        style={{ overflow: "hidden" }}
                      >
                        <div style={{ overflowX: "auto" }}>
                          <table className="crm-table">
                            <tbody>
                              {roleMembers.map((member, i) => {
                                const isOnline = member.online_at && new Date(member.online_at) > new Date(Date.now() - 5 * 60 * 1000);
                                const isMe = member.id === profile?.id;
                                const canManage = canManageMember(myRole, member.role, isMe);

                                return (
                                  <tr key={member.id} style={{ borderBottom: i < roleMembers.length - 1 ? "1px solid var(--border)" : "none" }}>
                                    {/* Employee */}
                                    <td style={{ minWidth: 220 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <div style={{ position: "relative", flexShrink: 0 }}>
                                          {member.avatar_url ? (
                                            <img src={member.avatar_url} alt={member.full_name} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
                                          ) : (
                                            <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg, ${roleInfo.color}cc, ${roleInfo.color}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 800, color: "white", flexShrink: 0 }}>
                                              {member.full_name?.[0]?.toUpperCase()}
                                            </div>
                                          )}
                                          <div style={{ position: "absolute", bottom: 0, right: 0, width: 9, height: 9, borderRadius: "50%", background: isOnline ? "#10B981" : "var(--border-2)", border: "2px solid var(--surface)" }} />
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 5 }}>
                                            {member.full_name}
                                            {isMe && <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, background: "var(--accent-light)", padding: "1px 6px", borderRadius: 99 }}>you</span>}
                                          </div>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Email */}
                                    <td style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 220 }}>{member.email || "—"}</span>
                                    </td>

                                    {/* Phone */}
                                    <td style={{ fontSize: 12.5, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                                      {member.phone || <span style={{ color: "var(--text-muted)" }}>—</span>}
                                    </td>

                                    {/* Status */}
                                    <td>
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: member.status === "active" ? "#10B981" : "#EF4444", background: member.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.08)", padding: "3px 10px", borderRadius: 99, whiteSpace: "nowrap", border: `1px solid ${member.status === "active" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.15)"}` }}>
                                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: member.status === "active" ? "#10B981" : "#EF4444", flexShrink: 0 }} />
                                        {member.status === "active" ? "Active" : "Inactive"}
                                      </span>
                                    </td>

                                    {/* Last Active */}
                                    <td style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: isOnline ? "#10B981" : "var(--border-2)", flexShrink: 0 }} />
                                        {isOnline ? <span style={{ color: "#10B981", fontWeight: 600 }}>Online now</span> : member.online_at ? `Last seen ${format(new Date(member.online_at), "MMM d")}` : "Never"}
                                      </div>
                                    </td>

                                    {/* Actions */}
                                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                      {canManage && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
                                          <button
                                            onClick={() => statusMutation.mutate({ id: member.id, active: member.status !== "active" })}
                                            className="btn-ghost"
                                            style={{ padding: "4px 7px" }}
                                            title={member.status === "active" ? "Deactivate" : "Activate"}
                                          >
                                            {member.status === "active" ? <UserX size={13} /> : <UserCheck size={13} />}
                                          </button>
                                          <button className="btn-ghost" style={{ padding: "4px 7px" }} onClick={() => setEditMember(member)} title="Change role">
                                            <Edit2 size={13} />
                                          </button>
                                          <button className="btn-ghost" style={{ padding: "4px 7px", color: "var(--red)" }} onClick={() => setConfirmRemove(member)} title="Remove member">
                                            <Trash2 size={13} />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvite={(data) => inviteMutation.mutateAsync(data)}
          allowedRoles={assignableRoles}
        />
      )}
      {editMember && (
        <EditRoleModal
          member={editMember}
          onClose={() => setEditMember(null)}
          onSave={(id, role) => roleMutation.mutateAsync({ id, role })}
          allowedRoles={getAssignableRoles(myRole)}
        />
      )}

      {credentials && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 460 }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Member Added</h2>
              <button onClick={() => setCredentials(null)} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: "#475569", margin: "0 0 18px" }}>
                <strong style={{ color: "#10B981" }}>✓ {credentials.name}</strong> has been added. Share these login credentials with them:
              </p>
              <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", marginBottom: 18 }}>
                {[["Login Email", credentials.email], ["Temporary Password", credentials.tempPassword]].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #F1F5F9" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", fontFamily: label === "Temporary Password" ? "monospace" : "inherit", marginTop: 2 }}>{value}</div>
                    </div>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 12, padding: "4px 10px", color: "#1B76D3" }}
                      onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copied!`); }}
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderLeft: "4px solid #F59E0B", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#78350F", marginBottom: 20 }}>
                Ask them to change their password after first login.
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn-primary" onClick={() => setCredentials(null)}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmRemove && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmRemove(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#EF4444" }}>Remove Member</h2>
              <button onClick={() => setConfirmRemove(null)} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: "#475569", margin: "0 0 8px" }}>
                Are you sure you want to remove <strong style={{ color: "#0F172A" }}>{confirmRemove.full_name}</strong>?
              </p>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>
                This will delete their profile from the CRM. They will no longer be able to log in.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
                <button className="btn-secondary" onClick={() => setConfirmRemove(null)}>Cancel</button>
                <button
                  className="btn-primary"
                  style={{ background: "#EF4444" }}
                  onClick={() => removeMutation.mutate(confirmRemove.id)}
                  disabled={removeMutation.isPending}
                >
                  {removeMutation.isPending ? "Removing..." : "Yes, Remove"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
