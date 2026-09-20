import React, { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Building2, Users2, Plug, Upload, Loader2, Check, X, Shield,
  Mail, RefreshCw, Link2, Trash2, AlertCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import { orgService } from "../services/orgService";
import { teamService } from "../services/teamService";
import { apiFetch } from "../lib/session";

const TABS = [
  { key: "general", label: "Organization", icon: Building2 },
  { key: "members", label: "Members", icon: Users2 },
  { key: "integrations", label: "Integrations", icon: Plug },
];
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "sales_rep", label: "Sales Rep" },
];

export default function Organization() {
  const { organization, orgRole, isAdmin, refreshProfile } = useAuth();
  const [tab, setTab] = useState("general");

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        <Shield size={28} style={{ marginBottom: 10 }} />
        <p>Only organization owners and admins can access this area.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 940, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>Organization settings</h1>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "0 0 24px" }}>{organization?.name}</p>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 24 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "10px 14px",
              background: "none", border: "none", borderBottom: `2px solid ${tab === t.key ? "var(--accent)" : "transparent"}`,
              color: tab === t.key ? "var(--text)" : "var(--text-muted)", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            }}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && <GeneralTab organization={organization} orgRole={orgRole} refreshProfile={refreshProfile} />}
      {tab === "members" && <MembersTab orgRole={orgRole} />}
      {tab === "integrations" && <IntegrationsTab organization={organization} />}
    </div>
  );
}

function GeneralTab({ organization, orgRole, refreshProfile }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [form, setForm] = useState({ name: "", website: "", industry: "" });
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (organization) setForm({ name: organization.name || "", website: organization.website || "", industry: organization.industry || "" });
    setLogoPreview(organization?.logo_url || null);
  }, [organization]);

  const pickLogo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2 MB");
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (logoFile) await orgService.uploadLogo(organization.id, logoFile);
      await orgService.updateOrganization(organization.id, form);
      await refreshProfile();
      qc.invalidateQueries();
      toast.success("Organization updated");
    } catch (e) {
      toast.error(e.message || "Could not save");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
        <div onClick={() => fileRef.current?.click()}
          style={{ width: 68, height: 68, borderRadius: 14, border: "1.5px dashed var(--border-2)", overflow: "hidden", cursor: "pointer", display: "grid", placeItems: "center", background: "var(--surface-2)" }}>
          {logoPreview ? <img src={logoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Upload size={18} style={{ color: "var(--text-muted)" }} />}
        </div>
        <div>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} style={{ fontSize: 12.5 }}>Change logo</button>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>PNG, JPG, WebP or SVG · max 2 MB</p>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={pickLogo} />
      </div>

      {["name", "website", "industry"].map((k) => (
        <div key={k} style={{ marginBottom: 14 }}>
          <label className="crm-label" style={{ textTransform: "capitalize" }}>{k}</label>
          <input className="crm-input" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} disabled={k === "name" && orgRole !== "owner"} />
        </div>
      ))}

      <button className="btn-primary" onClick={save} disabled={saving} style={{ marginTop: 6 }}>
        {saving ? <Loader2 size={14} className="spin" /> : "Save changes"}
      </button>
    </div>
  );
}

function MembersTab({ orgRole }) {
  const qc = useQueryClient();
  const [invite, setInvite] = useState({ open: false, email: "", full_name: "", role: "sales_rep" });

  const { data, isLoading } = useQuery({
    queryKey: ["org-members"],
    queryFn: () => teamService.getAll(),
  });
  const members = data?.data || [];

  const inviteMut = useMutation({
    mutationFn: () => teamService.inviteMember(invite),
    onSuccess: () => { toast.success("Invitation sent"); setInvite({ open: false, email: "", full_name: "", role: "sales_rep" }); qc.invalidateQueries({ queryKey: ["org-members"] }); },
    onError: (e) => toast.error(e.message),
  });
  const roleMut = useMutation({
    mutationFn: ({ id, role }) => teamService.updateRole(id, role),
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["org-members"] }); },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: (id) => teamService.removeMember(id),
    onSuccess: () => { toast.success("Member removed"); qc.invalidateQueries({ queryKey: ["org-members"] }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setInvite((s) => ({ ...s, open: true }))} style={{ fontSize: 13 }}>Invite member</button>
      </div>

      {invite.open && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16, background: "var(--surface-2)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div><label className="crm-label">Full name</label><input className="crm-input" value={invite.full_name} onChange={(e) => setInvite((s) => ({ ...s, full_name: e.target.value }))} /></div>
            <div><label className="crm-label">Work email</label><input className="crm-input" type="email" value={invite.email} onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))} /></div>
            <div><label className="crm-label">Role</label>
              <select className="crm-input" value={invite.role} onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value }))}>
                {ROLE_OPTIONS.filter((r) => orgRole === "owner" || r.value !== "admin").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn-primary" onClick={() => inviteMut.mutate()} disabled={inviteMut.isPending || !invite.email}>Send invite</button>
            <button className="btn-secondary" onClick={() => setInvite({ open: false, email: "", full_name: "", role: "sales_rep" })}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {members.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                {(m.full_name || m.email || "?")[0].toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{m.full_name || "—"}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.email}</div>
              </div>
              {m.status === "invited" && <span style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600 }}>Invited</span>}
              {m.role === "owner" ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Owner</span>
              ) : (
                <select className="crm-input" style={{ width: 150, height: 32, fontSize: 12.5 }}
                  value={m.role} onChange={(e) => roleMut.mutate({ id: m.id, role: e.target.value })}>
                  {ROLE_OPTIONS.filter((r) => orgRole === "owner" || r.value !== "admin").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              )}
              {m.role !== "owner" && (
                <button className="btn-ghost" title="Remove" onClick={() => window.confirm(`Remove ${m.full_name || m.email}?`) && removeMut.mutate(m.id)} style={{ padding: 6 }}>
                  <Trash2 size={15} style={{ color: "var(--red)" }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrationsTab({ organization }) {
  const qc = useQueryClient();
  const { data: integrations = [] } = useQuery({
    queryKey: ["org-integrations", organization?.id],
    queryFn: async () => {
      const { data } = await supabase.from("v_organization_integrations").select("*").eq("organization_id", organization.id);
      return data || [];
    },
    enabled: !!organization?.id,
  });
  const gmail = integrations.find((i) => i.provider === "gmail");

  const connect = async () => {
    try {
      const res = await apiFetch("/api/email/auth-url/gmail");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gmail OAuth is not configured on the server.");
      window.location.assign(json.url);
    } catch (e) {
      toast.error(e.message);
    }
  };
  const disconnect = async () => {
    if (!gmail) return;
    const res = await apiFetch(`/api/email/accounts/${gmail.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Gmail disconnected"); qc.invalidateQueries({ queryKey: ["org-integrations"] }); }
    else toast.error("Could not disconnect");
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--surface-2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Mail size={18} style={{ color: "#EA4335" }} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Gmail</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Sync sent email as activities and send from your organization's address.
            </div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
            background: gmail?.status === "connected" ? "var(--green-light)" : "var(--surface-3)",
            color: gmail?.status === "connected" ? "var(--green)" : "var(--text-muted)",
          }}>
            {gmail?.status === "connected" ? "Connected" : "Not connected"}
          </span>
        </div>

        {gmail?.status === "connected" && (
          <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-2)", display: "grid", gap: 4 }}>
            <div><strong>Account:</strong> {gmail.connected_email || "—"}</div>
            <div><strong>Last sync:</strong> {gmail.last_sync_at ? new Date(gmail.last_sync_at).toLocaleString() : "never"}</div>
            {gmail.last_error && <div style={{ color: "var(--red)" }}><AlertCircle size={12} /> {gmail.last_error}</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {gmail?.status === "connected" ? (
            <>
              <button className="btn-secondary" onClick={connect}><RefreshCw size={13} /> Reconnect</button>
              <button className="btn-ghost" onClick={disconnect} style={{ color: "var(--red)" }}>Disconnect</button>
            </>
          ) : (
            <button className="btn-primary" onClick={connect}><Link2 size={13} /> Connect Gmail</button>
          )}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 12 }}>
        Tokens are stored server-side and never exposed to the browser.
      </p>
    </div>
  );
}
