import { supabase } from "../supabaseClient";
import { db, getActiveOrgId } from "../lib/db";

const BUCKET = "crm-files";

export const filesService = {
  async upload(file, folder = "general") {
    const orgId = getActiveOrgId();
    if (!orgId) throw new Error("No active organization");
    const ext = file.name.split(".").pop();
    // First path segment is the tenant key — enforced by storage RLS.
    const name = `${orgId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(name, file);
    if (error) throw error;
    // Private bucket — hand back a signed URL (1 week).
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(name, 60 * 60 * 24 * 7);
    return { path: name, url: signed?.signedUrl || null, name: file.name, size: file.size, type: file.type };
  },

  async signedUrl(path, expiresIn = 3600) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
    return data?.signedUrl || null;
  },

  async getForRecord({ leadId, dealId, customerId, taskId } = {}) {
    let query = db
      .from("files")
      .select(`*, uploaded_by:profiles!files_uploaded_by_fkey(full_name)`)
      .order("created_at", { ascending: false });
    if (leadId) query = query.eq("lead_id", leadId);
    else if (dealId) query = query.eq("deal_id", dealId);
    else if (customerId) query = query.eq("customer_id", customerId);
    else if (taskId) query = query.eq("task_id", taskId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async save(payload) {
    const { data, error } = await db.from("files").insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id, path) {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    const { error } = await db.from("files").delete().eq("id", id);
    if (error) throw error;
  },
};
