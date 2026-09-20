import { db as supabase } from "../lib/db";
import { getAccessToken } from "../lib/session";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

export const leadsService = {
  // Fetches through backend API so server-side RBAC is enforced per role
  async getAll({ search = "", stage = "", temperature = "", source = "", assignedTo = "", page = 1, limit = 200 } = {}) {
    const token = await getAccessToken();
    const params = new URLSearchParams({ limit, offset: (page - 1) * limit });
    if (search)      params.set("search", search);
    if (stage)       params.set("stage", stage);
    if (temperature) params.set("temperature", temperature);
    if (source)      params.set("source", source);
    if (assignedTo && assignedTo !== "__unassigned__") params.set("assigned_to", assignedTo);

    const res = await fetch(`${API}/api/leads?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch leads");
    const json = await res.json();

    let data = json.data || [];

    // Handle unassigned filter client-side (not passed to API to avoid conflicting with RBAC filters)
    if (assignedTo === "__unassigned__") {
      data = data.filter((l) => !l.assigned_to);
    }

    return { data, count: json.count ?? data.length };
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("leads")
      .select(`*, assigned_profile:profiles!leads_assigned_to_fkey(id, full_name, avatar_url, email)`)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(payload) {
    const { data, error } = await supabase
      .from("leads")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async checkDuplicate(payload) {
    const token = await getAccessToken();
    const res = await fetch(`${API}/api/leads/check-duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 409) return await res.json();
    return { duplicate: false };
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from("leads")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) throw error;
  },

  // ── Pipeline support (same table, stage = 'pipeline') ──────────────────────
  // Routes through backend so server-side RBAC is enforced (non-admins see only their own records)
  async getPipelineEntries({ search = "", temperature = "", source = "", assignedTo = "" } = {}) {
    const token = await getAccessToken();
    const params = new URLSearchParams({ stage: "pipeline", limit: 500 });
    if (search)      params.set("search", search);
    if (temperature) params.set("temperature", temperature);
    if (source)      params.set("source", source);
    if (assignedTo && assignedTo !== "__unassigned__") params.set("assigned_to", assignedTo);

    const res = await fetch(`${API}/api/leads?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch pipeline entries");
    const json = await res.json();

    let data = json.data || [];
    if (assignedTo === "__unassigned__") {
      data = data.filter((e) => !e.assigned_to);
    }
    return { data, count: json.count ?? data.length };
  },

  async convertPipelineToLead(entry) {
    // Route through backend so contact validation is enforced server-side
    const token = await getAccessToken();
    const res = await fetch(`${API}/api/leads/${entry.id}/convert-to-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Conversion failed");
    return json;
  },

  async checkDuplicate(companyName, email, phone) {
    // Check if a non-pipeline record exists with same company/email/phone
    let q = supabase.from("leads").select("id, stage, company_name").neq("stage", "pipeline");
    if (email) {
      const { data } = await supabase.from("leads").select("id, stage, company_name")
        .neq("stage", "pipeline").ilike("other_notes", `%${email}%`).limit(1);
      if (data?.length) return { found: true, record: data[0] };
    }
    if (companyName) {
      const { data } = await q.ilike("company_name", companyName).limit(1);
      if (data?.length) return { found: true, record: data[0] };
    }
    return { found: false };
  },

  async updateStage(id, stage) {
    return this.update(id, { stage });
  },

  async updatePipelineStage(id, pipelineStage) {
    const { data, error } = await supabase
      .from("leads")
      .update({ pipeline_stage: pipelineStage, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getStageCount() {
    const { data, error } = await supabase
      .from("leads")
      .select("stage")
      .not("stage", "is", null);
    if (error) throw error;
    const counts = { new: 0, contacted: 0, qualified: 0, proposal: 0, won: 0, lost: 0 };
    data?.forEach((l) => { if (counts[l.stage] !== undefined) counts[l.stage]++; });
    return counts;
  },

  async getActivities(leadId) {
    const { data, error } = await supabase
      .from("activities")
      .select(`*, user:profiles!activities_user_id_fkey(full_name, avatar_url)`)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Unified timeline: activities from this lead + any linked deals, both old and new schema
  async getUnifiedTimeline(leadId) {
    const { data: linkedDeals } = await supabase.from("deals").select("id").eq("lead_id", leadId);
    const dealIds = (linkedDeals || []).map((d) => d.id);

    const SEL = "*, user:profiles!activities_user_id_fkey(full_name, avatar_url), created_by_profile:profiles!activities_created_by_fkey(full_name, avatar_url)";
    const queries = [
      supabase.from("activities").select(SEL).eq("lead_id", leadId),
      supabase.from("activities").select(SEL).eq("related_type", "lead").eq("related_id", leadId),
    ];
    if (dealIds.length) {
      queries.push(supabase.from("activities").select(SEL).eq("related_type", "deal").in("related_id", dealIds));
    }

    const [actResults, { data: meetings }] = await Promise.all([
      Promise.all(queries),
      supabase.from("meetings").select("id,title,mode,status,start_time,end_time,customer_name,company_name,agenda,created_at,lead_id,deal_id").eq("lead_id", leadId),
    ]);

    const all = actResults.flatMap((r) => r.data || []);
    const seen = new Set();
    const deduped = all.filter((a) => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });

    // Inject synthetic items for meetings that never got an activity log
    const loggedMeetingIds = new Set(deduped.map((a) => a.meeting_id).filter(Boolean));
    const synthetic = (meetings || [])
      .filter((m) => !loggedMeetingIds.has(m.id))
      .map((m) => ({
        id: `mtg-${m.id}`,
        type: m.mode === "offline" ? "meeting_person" : "meeting_virtual",
        title: `Meeting Scheduled: ${m.title}`,
        description: `${m.customer_name || m.company_name || ""}${m.agenda ? "\n\nAgenda: " + m.agenda : ""}`,
        status: m.status || "done",
        created_at: m.created_at,
        metadata: { scheduled_at: m.start_time },
        user: null,
        created_by_profile: null,
      }));

    return [...deduped, ...synthetic].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getLinkedDeal(leadId) {
    const { data } = await supabase
      .from("deals")
      .select("id, title, company_name, stage, value")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  },

  async lockRecord(id) {
    const { data, error } = await supabase.from("leads").update({ is_locked: true  }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async unlockRecord(id) {
    const { data, error } = await supabase.from("leads").update({ is_locked: false }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
};
