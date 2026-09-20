import { db as supabase } from "../lib/db";

export const analyticsService = {
  async getDashboardStats() {
    const [leadsRes, dealsRes, customersRes, tasksRes] = await Promise.all([
      supabase.from("leads").select("id, stage, budget, temperature, created_at", { count: "exact" }),
      supabase.from("deals").select("id, stage, value, created_at"),
      supabase.from("customers").select("id, status", { count: "exact" }),
      supabase.from("tasks").select("id, status"),
    ]);

    const allLeads   = leadsRes.data || [];
    // Separate pre-sales pipeline records and converted leads (those are in Deals now)
    const pipeline   = allLeads.filter((l) => l.stage === "pipeline");
    const leads      = allLeads.filter((l) => l.stage !== "pipeline" && l.stage !== "converted");
    const deals      = dealsRes.data || [];
    const customers  = customersRes.data || [];
    const tasks      = tasksRes.data || [];

    const totalPipeline = pipeline.length;
    const totalLeads    = leads.length;
    const wonDeals      = deals.filter((d) => d.stage === "won");
    const revenue       = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const activeDeals   = deals.filter((d) => !["won", "lost"].includes(d.stage)).length;
    // Conversion rate uses only actual leads (not pipeline entries) as denominator
    const conversionRate = totalLeads > 0 ? Math.round((leads.filter((l) => l.stage === "won").length / totalLeads) * 100) : 0;
    const pendingTasks   = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length;

    const hotLeads = leads.filter((l) => l.stage === "proposal" || l.stage === "converted" || l.temperature === "hot").length;
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
    // Monthly growth tracks lead volume only (pipeline conversions)
    const thisMonthLeads = leads.filter((l) => l.created_at >= thisMonthStart).length;
    const lastMonthLeads = leads.filter((l) => l.created_at >= lastMonthStart && l.created_at <= lastMonthEnd).length;
    const monthlyGrowth  = lastMonthLeads > 0 ? Math.round(((thisMonthLeads - lastMonthLeads) / lastMonthLeads) * 100) : thisMonthLeads > 0 ? 100 : 0;

    return {
      totalPipeline,
      totalLeads,
      revenue,
      activeDeals,
      conversionRate,
      hotLeads,
      monthlyGrowth,
      totalCustomers: customers.length,
      activeCustomers: customers.filter((c) => c.status === "active").length,
      pendingTasks,
      totalDeals: deals.length,
      wonLeads: leads.filter((l) => l.stage === "won").length,
      lostLeads: leads.filter((l) => l.stage === "lost").length,
    };
  },

  async getLeadsByStage() {
    const { data } = await supabase.from("leads").select("stage");
    const stages = ["new","contacted","qualified","proposal","converted","won","lost"];
    return stages.map((stage) => ({
      stage: stage.replace(/_/g," ").replace(/\b\w/g,(c) => c.toUpperCase()),
      count: data?.filter((l) => l.stage === stage).length || 0,
    }));
  },

  async getLeadsBySource() {
    const { data } = await supabase.from("leads").select("source");
    const counts = {};
    data?.forEach((l) => { counts[l.source || "manual"] = (counts[l.source || "manual"] || 0) + 1; });
    return Object.entries(counts).map(([source, count]) => ({ source, count }));
  },

  async getMonthlyLeads(months = 6) {
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    const { data } = await supabase
      .from("leads")
      .select("created_at, stage")
      .gte("created_at", start.toISOString());

    const result = {};
    data?.forEach((l) => {
      const key = l.created_at?.slice(0, 7);
      if (!key) return;
      if (!result[key]) result[key] = { month: key, leads: 0, won: 0 };
      result[key].leads++;
      if (l.stage === "won") result[key].won++;
    });
    return Object.values(result).sort((a, b) => a.month.localeCompare(b.month));
  },

  async getMonthlyRevenue(months = 6) {
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    const { data } = await supabase
      .from("deals")
      .select("value, closed_at")
      .eq("stage", "won")
      .not("closed_at", "is", null)
      .gte("closed_at", start.toISOString());

    const result = {};
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      result[key] = { month: key, revenue: 0 };
    }
    data?.forEach((deal) => {
      const key = deal.closed_at?.slice(0, 7);
      if (key && result[key]) result[key].revenue += Number(deal.value) || 0;
    });
    return Object.values(result);
  },

  async getDealsByStage() {
    const { data } = await supabase.from("deals").select("stage, value");
    // Must match the real deals.stage values (Deals.jsx FUNNEL_STATUSES) so this widget
    // stays in sync with Revenue Over Time and every other deals-stage view in the app.
    const stages = [
      { key: "new",               label: "New" },
      { key: "attempted_contact", label: "Attempted Contact" },
      { key: "engaged",           label: "Engaged" },
      { key: "contacted",         label: "Contacted" },
      { key: "meeting_scheduled", label: "Meeting Scheduled" },
      { key: "proposal_sent",     label: "Proposal Sent" },
      { key: "negotiation",       label: "Negotiation" },
      { key: "won",               label: "Won" },
      { key: "lost",              label: "Lost" },
    ];
    return stages.map(({ key, label }) => {
      const stageDeals = data?.filter((d) => d.stage === key) || [];
      return {
        stage: label,
        count: stageDeals.length,
        value: stageDeals.reduce((s, d) => s + (Number(d.value) || 0), 0),
      };
    });
  },

  async getTeamPerformance() {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role");

    const { data: leads } = await supabase.from("leads").select("assigned_to, stage");
    const { data: deals } = await supabase.from("deals").select("assigned_to, stage, value");
    const { data: tasks } = await supabase.from("tasks").select("assigned_to, status");

    return (profiles || []).map((p) => {
      const pLeads = leads?.filter((l) => l.assigned_to === p.id) || [];
      const pDeals = deals?.filter((d) => d.assigned_to === p.id) || [];
      const pTasks = tasks?.filter((t) => t.assigned_to === p.id) || [];
      const wonDeals = pDeals.filter((d) => d.stage === "won");
      return {
        id: p.id,
        name: p.full_name,
        avatar_url: p.avatar_url,
        role: p.role,
        leads: pLeads.length,
        deals: pDeals.length,
        won: wonDeals.length,
        revenue: wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0),
        tasks: pTasks.length,
        completedTasks: pTasks.filter((t) => t.status === "done").length,
      };
    });
  },

  async getRecentActivity(limit = 20) {
    const { data, error } = await supabase
      .from("activities")
      .select(`*, user:profiles!activities_user_id_fkey(full_name, avatar_url), created_by_profile:profiles!activities_created_by_fkey(id, full_name, avatar_url), assigned_profile:profiles!activities_assigned_to_fkey(id, full_name, avatar_url), lead:leads!activities_lead_id_fkey(id, company_name, contact_name)`)
      .neq("type", "email_contact")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async getTargetProgress() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

    const [leadsMonth, leadsQuarter, leadsYear, meetingsMonth, meetingsQuarter, meetingsYear] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", quarterStart),
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", yearStart),
      supabase.from("meetings").select("id", { count: "exact", head: true }).gte("start_time", monthStart),
      supabase.from("meetings").select("id", { count: "exact", head: true }).gte("start_time", quarterStart),
      supabase.from("meetings").select("id", { count: "exact", head: true }).gte("start_time", yearStart),
    ]);

    return {
      leads: {
        month: leadsMonth.count || 0,
        quarter: leadsQuarter.count || 0,
        year: leadsYear.count || 0,
      },
      meetings: {
        month: meetingsMonth.count || 0,
        quarter: meetingsQuarter.count || 0,
        year: meetingsYear.count || 0,
      },
    };
  }
};
