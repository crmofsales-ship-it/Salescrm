const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { withOrg, requireOrgRole, orgAtLeast } = require("../middleware/orgContext");

router.use(authenticate, withOrg);

const validateDealContact = (body) => {
  if (!body.company_name?.trim()) return "Company name is required";
  let notes = {};
  try { notes = body.notes ? JSON.parse(body.notes) : {}; } catch { /* ignore */ }
  if (!notes.email?.trim() && !notes.contact?.trim()) return "At least one contact detail (Email or Phone) is required";
  return null;
};

const stripOrg = (body) => { const { organization_id, ...rest } = body; return rest; };

// POST /api/deals — sales_manager+
router.post("/", requireOrgRole("sales_manager"), async (req, res) => {
  const contactErr = validateDealContact(req.body);
  if (contactErr) return res.status(400).json({ error: contactErr });

  const { data, error } = await req.db
    .from("deals")
    .insert({ ...stripOrg(req.body), created_by: req.profile.id, organization_id: req.organizationId })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });

  if (req.body.lead_id) {
    const company = req.body.company_name || req.body.title || "Record";
    req.db.from("activities").insert({
      type: "lifecycle", title: "Converted to Deal",
      description: `${company} was converted from Lead/Pipeline to the Deals module`,
      lead_id: req.body.lead_id, deal_id: data.id, created_by: req.profile.id, status: "done",
      organization_id: req.organizationId,
    }).then(() => {}).catch(() => {});
  }
  res.status(201).json(data);
});

// GET /api/deals
router.get("/", async (req, res) => {
  const { stage, assigned_to, search, limit = 100, offset = 0 } = req.query;
  const { id: profileId } = req.profile;
  const isAdmin = orgAtLeast(req, "admin");

  const applyFilters = (q) => {
    if (!isAdmin) q = q.eq("assigned_to", profileId);
    if (stage) q = q.eq("stage", stage);
    if (assigned_to) q = q.eq("assigned_to", assigned_to);
    if (search) q = q.or(`title.ilike.%${search}%,company_name.ilike.%${search}%`);
    return q.order("updated_at", { ascending: false }).range(Number(offset), Number(offset) + Number(limit) - 1);
  };

  let { data, error, count } = await applyFilters(
    req.db.from("deals").select(
      "*, assigned_profile:profiles!assigned_to(id,full_name,avatar_url), linked_lead:leads!lead_id(lead_code,source,country,industry,other_notes)",
      { count: "exact" }
    )
  );

  if (error) {
    const plain = await applyFilters(req.db.from("deals").select("*", { count: "exact" }));
    if (plain.error) return res.status(400).json({ error: plain.error.message });
    data = plain.data || [];
    count = plain.count;
    const assignedIds = [...new Set(data.filter((d) => d.assigned_to).map((d) => d.assigned_to))];
    if (assignedIds.length) {
      const { data: profiles } = await req.db.from("profiles").select("id,full_name,avatar_url").in("id", assignedIds);
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      data = data.map((d) => ({ ...d, assigned_profile: d.assigned_to ? (profileMap[d.assigned_to] || null) : null }));
    }
  }
  res.json({ data: data || [], count: count || 0 });
});

// GET /api/deals/:id
router.get("/:id", async (req, res) => {
  let { data, error } = await req.db
    .from("deals")
    .select("*, assigned_profile:profiles!assigned_to(id,full_name,avatar_url), linked_lead:leads!lead_id(lead_code,source,country,industry,other_notes)")
    .eq("id", req.params.id).single();
  if (error) {
    const plain = await req.db.from("deals").select("*").eq("id", req.params.id).single();
    if (plain.error) return res.status(404).json({ error: "Deal not found" });
    data = plain.data;
    if (data?.assigned_to) {
      const { data: prof } = await req.db.from("profiles").select("id,full_name,avatar_url").eq("id", data.assigned_to).maybeSingle();
      if (prof) data = { ...data, assigned_profile: prof };
    }
  }
  res.json(data);
});

// PUT /api/deals/:id — sales_manager+
router.put("/:id", requireOrgRole("sales_manager"), async (req, res) => {
  if (req.body.company_name !== undefined || req.body.notes !== undefined) {
    const contactErr = validateDealContact(req.body);
    if (contactErr) return res.status(400).json({ error: contactErr });
  }
  const { data, error } = await req.db
    .from("deals").update({ ...stripOrg(req.body), updated_at: new Date().toISOString() })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PATCH /api/deals/:id — sales_manager+
router.patch("/:id", requireOrgRole("sales_manager"), async (req, res) => {
  const { data, error } = await req.db
    .from("deals").update({ ...stripOrg(req.body), updated_at: new Date().toISOString() })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/deals/:id — admin+
router.delete("/:id", requireOrgRole("admin"), async (req, res) => {
  const { data: deal } = await req.db.from("deals").select("id, lead_id").eq("id", req.params.id).maybeSingle();
  await req.db.from("activities").update({ deal_id: null }).eq("deal_id", req.params.id);
  const { error } = await req.db.from("deals").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  if (deal?.lead_id) {
    req.db.from("leads").update({ stage: "new", updated_at: new Date().toISOString() })
      .eq("id", deal.lead_id).eq("stage", "converted").then(() => {}).catch(() => {});
  }
  req.db.from("notifications").delete().eq("entity_id", req.params.id).eq("entity_type", "deal").then(() => {}).catch(() => {});
  res.json({ success: true });
});

async function revertDeal(req, res, targetStage, label) {
  try {
    const { data: deal, error: fetchErr } = await req.db
      .from("deals").select("id, lead_id, company_name, stage").eq("id", req.params.id).single();
    if (fetchErr || !deal) return res.status(404).json({ error: "Deal not found" });
    if (!deal.lead_id) return res.status(400).json({ error: "This deal has no linked lead record. Cannot revert." });

    const { error: leadErr } = await req.db
      .from("leads").update({ stage: targetStage, updated_at: new Date().toISOString() }).eq("id", deal.lead_id);
    if (leadErr) return res.status(400).json({ error: leadErr.message });

    await req.db.from("activities").update({ deal_id: null }).eq("deal_id", deal.id);
    const { error: dealErr } = await req.db.from("deals").delete().eq("id", deal.id);
    if (dealErr) return res.status(400).json({ error: dealErr.message });

    await req.db.from("change_history").insert({
      entity_type: "lead", entity_id: deal.lead_id,
      field_name: "conversion", field_label: label,
      old_value: "deal", new_value: targetStage === "pipeline" ? "pipeline" : "lead",
      changed_by: req.profile.id, organization_id: req.organizationId,
    });
    await req.db.from("audit_logs").insert({
      user_id: req.profile.id, action: `revert_deal_to_${targetStage === "pipeline" ? "pipeline" : "lead"}`,
      resource: "deal", details: { deal_id: deal.id, lead_id: deal.lead_id, company: deal.company_name },
      organization_id: req.organizationId,
    });
    res.json({ success: true, lead_id: deal.lead_id });
  } catch (e) {
    res.status(500).json({ error: e.message || "Internal error" });
  }
}

router.post("/:id/revert-to-lead", requireOrgRole("admin"), (req, res) => revertDeal(req, res, "new", "Reverted to Lead"));
router.post("/:id/revert-to-pipeline", requireOrgRole("admin"), (req, res) => revertDeal(req, res, "pipeline", "Reverted to Pipeline"));

// POST /api/deals/cleanup-orphaned — admin+
router.post("/cleanup-orphaned", requireOrgRole("admin"), async (req, res) => {
  try {
    const { data: activeDeals } = await req.db
      .from("deals").select("id, lead_id")
      .not("stage", "in", '("won","lost")').not("lead_id", "is", null);
    if (!activeDeals?.length) return res.json({ fixed: 0, message: "No orphaned deals found" });

    const leadIds = activeDeals.map((d) => d.lead_id);
    const { data: existingLeads } = await req.db.from("leads").select("id").in("id", leadIds);
    const existingSet = new Set((existingLeads || []).map((l) => l.id));
    const orphanIds = activeDeals.filter((d) => !existingSet.has(d.lead_id)).map((d) => d.id);
    if (!orphanIds.length) return res.json({ fixed: 0, message: "No orphaned deals found" });

    await req.db.from("activities").update({ deal_id: null }).in("deal_id", orphanIds);
    const { error } = await req.db.from("deals").delete().in("id", orphanIds);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ fixed: orphanIds.length, message: `${orphanIds.length} orphaned deal(s) cleaned up` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
