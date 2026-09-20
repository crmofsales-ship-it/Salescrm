import { supabase } from "../supabaseClient";
import { apiFetch, getAccessToken } from "../lib/session";
import { getActiveOrgId } from "../lib/db";

// Members of the active organization. Shapes rows to look like the legacy
// "profile" objects the Team UI expects (id, full_name, email, role, status).
export const teamService = {
  async getAll({ search = "", role = "" } = {}) {
    const orgId = getActiveOrgId();
    let query = supabase
      .from("organization_members")
      .select("id, role, status, manager_id, created_at, member:profiles!organization_members_user_id_fkey(id, full_name, email, avatar_url, phone, department, online_at)", { count: "exact" })
      .eq("organization_id", orgId)
      .neq("status", "removed")
      .order("created_at", { ascending: false });
    if (role) query = query.eq("role", role);

    const { data, error, count } = await query;
    if (error) throw error;
    let rows = (data || []).map((m) => ({
      ...m.member,
      membership_id: m.id,
      role: m.role,
      status: m.status,
      manager_id: m.manager_id,
      joined_at: m.created_at,
    }));
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) => (r.full_name || "").toLowerCase().includes(s) || (r.email || "").toLowerCase().includes(s));
    }
    return { data: rows, count: count || rows.length };
  },

  async getById(id) {
    const orgId = getActiveOrgId();
    const { data, error } = await supabase
      .from("organization_members")
      .select("id, role, status, manager_id, member:profiles!organization_members_user_id_fkey(*)")
      .eq("organization_id", orgId).eq("user_id", id).maybeSingle();
    if (error) throw error;
    return data ? { ...data.member, role: data.role, status: data.status, manager_id: data.manager_id } : null;
  },

  async updateProfile(id, payload) {
    // Self-service profile fields live on `profiles`.
    const { data, error } = await supabase
      .from("profiles").update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async updateRole(id, role) {
    const res = await apiFetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify({ role }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to update role");
    return res.json();
  },

  async setStatus(id, status) {
    const res = await apiFetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to update status");
    return res.json();
  },
  deactivate(id) { return this.setStatus(id, "suspended"); },
  activate(id) { return this.setStatus(id, "active"); },

  async inviteMember({ email, role, full_name }) {
    const res = await apiFetch("/api/auth/add-member", {
      method: "POST",
      body: JSON.stringify({ email, role, name: full_name }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to invite member");
    return json;
  },

  async removeMember(id) {
    const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to remove member");
    return json;
  },

  async getOnlineUsers() {
    const orgId = getActiveOrgId();
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("organization_members")
      .select("member:profiles!organization_members_user_id_fkey(id, full_name, avatar_url, online_at)")
      .eq("organization_id", orgId).eq("status", "active");
    return (data || [])
      .map((m) => m.member)
      .filter((p) => p && p.online_at && p.online_at >= fiveMinAgo);
  },
};

export { getAccessToken };
