const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { withOrg, requireOrgRole } = require("../middleware/orgContext");

router.use(authenticate, withOrg);

// GET /api/analytics — sales_manager+
router.get("/", requireOrgRole("sales_manager"), async (req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

    const [leadsRes, dealsRes, membersRes, activitiesRes] = await Promise.all([
      req.db.from("leads").select("id, stage, temperature, priority, source, assigned_to, created_at, ai_score"),
      req.db.from("deals").select("id, stage, value, assigned_to, created_at, close_date, closed_at"),
      req.db.from("organization_members")
        .select("role, member:profiles!organization_members_user_id_fkey(id, full_name, avatar_url)")
        .eq("organization_id", req.organizationId).eq("status", "active"),
      req.db.from("activities").select("id, type, created_by, created_at").gte("created_at", sixMonthsAgo),
    ]);

    const leads = leadsRes.data || [];
    const deals = dealsRes.data || [];
    const members = (membersRes.data || []).map((m) => ({ ...m.member, role: m.role })).filter((m) => m.id);
    const activities = activitiesRes.data || [];

    const byStage = leads.reduce((a, l) => ((a[l.stage] = (a[l.stage] || 0) + 1), a), {});
    const byTemp = leads.reduce((a, l) => ((a[l.temperature] = (a[l.temperature] || 0) + 1), a), {});
    const bySource = leads.reduce((a, l) => (l.source && (a[l.source] = (a[l.source] || 0) + 1), a), {});

    const wonDeals = deals.filter((d) => d.stage === "won");
    const lostDeals = deals.filter((d) => d.stage === "lost");
    const wonRevenue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const pipeline = deals.filter((d) => !["won", "lost"].includes(d.stage));
    const pipelineValue = pipeline.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const conversionRate = leads.length ? ((wonDeals.length / leads.length) * 100).toFixed(1) : "0.0";

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }) });
    }
    const monthlyLeads = months.map(({ key, label }) => ({
      month: label,
      leads: leads.filter((l) => l.created_at?.startsWith(key)).length,
      deals: deals.filter((d) => d.created_at?.startsWith(key)).length,
      revenue: wonDeals.filter((d) => (d.closed_at || d.created_at)?.startsWith(key)).reduce((s, d) => s + (Number(d.value) || 0), 0),
    }));

    const salesMembers = members.filter((p) => ["sales_rep", "sales_manager"].includes(p.role));
    const employeePerf = salesMembers.map((p) => {
      const myLeads = leads.filter((l) => l.assigned_to === p.id);
      const myWon = deals.filter((d) => d.assigned_to === p.id && d.stage === "won");
      const myActs = activities.filter((a) => a.created_by === p.id);
      const avgScore = myLeads.length ? Math.round(myLeads.reduce((s, l) => s + (l.ai_score || 0), 0) / myLeads.length) : 0;
      return {
        id: p.id, name: p.full_name, avatar_url: p.avatar_url, role: p.role,
        leads: myLeads.length, won: myWon.length,
        revenue: myWon.reduce((s, d) => s + (Number(d.value) || 0), 0),
        activities: myActs.length, avg_ai_score: avgScore,
        conversion: myLeads.length ? ((myWon.length / myLeads.length) * 100).toFixed(1) : "0.0",
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const byActivity = activities.reduce((a, x) => ((a[x.type] = (a[x.type] || 0) + 1), a), {});

    res.json({
      overview: {
        total_leads: leads.length, total_deals: deals.length,
        won_deals: wonDeals.length, lost_deals: lostDeals.length, pipeline_deals: pipeline.length,
        won_revenue: wonRevenue, pipeline_value: pipelineValue,
        conversion_rate: conversionRate, total_activities: activities.length,
      },
      leads_by_stage: byStage, leads_by_temperature: byTemp, leads_by_source: bySource,
      activities_by_type: byActivity, monthly_trends: monthlyLeads, employee_performance: employeePerf,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
