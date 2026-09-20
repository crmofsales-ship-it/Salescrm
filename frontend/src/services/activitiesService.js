import { db as supabase } from "../lib/db";

export const activitiesService = {
  async getAll({ leadId, dealId, customerId, type, userId, page = 1, limit = 50 } = {}) {
    let query = supabase
      .from("activities")
      .select(`*, user:profiles!activities_user_id_fkey(id, full_name, avatar_url), lead:leads!activities_lead_id_fkey(id, contact_name, company_name), deal:deals!activities_deal_id_fkey(id, title)`, { count: "exact" })
      .order("created_at", { ascending: false });

    if (leadId) query = query.eq("lead_id", leadId);
    if (dealId) query = query.eq("deal_id", dealId);
    if (customerId) query = query.eq("customer_id", customerId);
    if (type) query = query.eq("type", type);
    if (userId) query = query.eq("user_id", userId);

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },

  async create({ type, description, lead_id, deal_id, customer_id, task_id, user_id, metadata = {} }) {
    const { data, error } = await supabase
      .from("activities")
      .insert({ type, description, lead_id, deal_id, customer_id, task_id, user_id, metadata })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) throw error;
  },

  async getLeadActivities(leadId) {
    const { data, error } = await supabase
      .from("activities")
      .select(`*, user:profiles!activities_user_id_fkey(id, full_name, avatar_url)`)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
};
