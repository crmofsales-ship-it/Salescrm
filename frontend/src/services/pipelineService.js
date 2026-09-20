import { db as supabase } from "../lib/db";

export const pipelineService = {
  async getAll({ search = "", stage = "", temperature = "", assignedTo = "" } = {}) {
    let query = supabase
      .from("pipeline")
      .select(`*, assigned_profile:profiles!pipeline_assigned_to_fkey(id, full_name, avatar_url), created_by_profile:profiles!pipeline_created_by_fkey(id, full_name)`, { count: "exact" })
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(
        `contact_name.ilike.%${search}%,company_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }
    if (stage)       query = query.eq("stage", stage);
    if (temperature) query = query.eq("temperature", temperature);
    if (assignedTo)  query = query.eq("assigned_to", assignedTo);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },

  async create(payload) {
    const { data, error } = await supabase
      .from("pipeline")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from("pipeline")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("pipeline").delete().eq("id", id);
    if (error) throw error;
  },

  // Activities logged against this pipeline entry (e.g. auto-synced emails,
  // manually logged calls/follow-ups) — filtered by related_type/related_id
  // since the activities table has no dedicated pipeline_id column.
  async getUnifiedTimeline(pipelineId) {
    const SEL = "*, user:profiles!activities_user_id_fkey(full_name, avatar_url), created_by_profile:profiles!activities_created_by_fkey(full_name, avatar_url)";
    const { data, error } = await supabase
      .from("activities")
      .select(SEL)
      .eq("related_type", "pipeline")
      .eq("related_id", pipelineId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async convertToLead(pipelineId, convertedById) {
    const { data: p, error: fetchErr } = await supabase
      .from("pipeline")
      .select("*")
      .eq("id", pipelineId)
      .single();
    if (fetchErr) throw fetchErr;

    if (!p.email && !p.phone) {
      throw new Error("Add at least one contact detail (email or phone) before converting.");
    }

    const { data: lead, error: insertErr } = await supabase
      .from("leads")
      .insert({
        company_name:       p.company_name,
        contact_name:       p.contact_name,
        email:              p.email,
        phone:              p.phone,
        source:             p.source,
        stage:              "new",
        temperature:        p.temperature || "warm",
        remarks:            p.remarks,
        other_notes:        p.other_notes || {},
        assigned_to:        p.assigned_to,
        created_by:         p.created_by,
        service_interested: p.service_interested,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const { error: delErr } = await supabase
      .from("pipeline")
      .delete()
      .eq("id", pipelineId);
    if (delErr) throw delErr;

    return lead;
  },
};
