import { db as supabase } from "../lib/db";

export const customersService = {
  async getAll({ search = "", status = "" } = {}) {
    let query = supabase
      .from("customers")
      .select(`
        *,
        assigned_profile:profiles!customers_assigned_to_fkey(id, full_name, avatar_url)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("customers")
      .select(`
        *,
        assigned_profile:profiles!customers_assigned_to_fkey(id, full_name, avatar_url),
        deals(id, title, value, stage),
        leads(id, contact_name, stage)
      `)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(payload) {
    const { data, error } = await supabase
      .from("customers")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from("customers")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
  },

  async getStats() {
    const { data, error } = await supabase.from("customers").select("status, total_value");
    if (error) throw error;
    const total = data?.length || 0;
    const active = data?.filter((c) => c.status === "active").length || 0;
    const totalValue = data?.reduce((s, c) => s + (Number(c.total_value) || 0), 0) || 0;
    return { total, active, totalValue };
  },
};
