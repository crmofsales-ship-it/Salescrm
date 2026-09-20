const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { withOrg, orgAtLeast, ROLE_RANK } = require("../middleware/orgContext");

router.use(authenticate, withOrg);

const ACTIVITY_TYPES = [
  "call", "meeting", "follow_up", "email", "note",
  "stage_change", "deal_created", "task_created", "general",
  "visit", "virtual_meeting", "phone_call", "email_contact",
  "follow_up_call", "follow_up_email", "meeting_person", "meeting_virtual",
  "followup", "reminder", "task", "proposal",
  "whatsapp", "whatsapp_follow_up",
  "email_sent", "lifecycle",
];

const ALLOWED_COLUMNS = new Set([
  "type", "description", "user_id", "lead_id", "deal_id", "customer_id",
  "task_id", "meeting_id", "metadata", "assigned_to", "title",
  "status", "priority", "due_date", "related_type", "related_id",
  "next_follow_up_date",
]);

// POST /api/activities
router.post("/", async (req, res) => {
  const { type } = req.body;
  if (type && !ACTIVITY_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid activity type: ${type}` });
  }

  const payload = Object.fromEntries(Object.entries(req.body).filter(([k]) => ALLOWED_COLUMNS.has(k)));
  if (!payload.description && payload.title) payload.description = payload.title;
  if (!payload.description) payload.description = payload.type || "Activity logged";
  payload.created_by = req.profile.id;
  payload.organization_id = req.organizationId;

  const { data, error } = await req.db.from("activities").insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });

  const activityTs = data.created_at || new Date().toISOString();
  if (data.lead_id) {
    req.db.from("leads").update({ last_activity_at: activityTs, inactivity_status: "active" })
      .eq("id", data.lead_id).then(() => {}).catch(() => {});
  }
  if (data.deal_id) {
    req.db.from("deals").update({ updated_at: activityTs }).eq("id", data.deal_id).then(() => {}).catch(() => {});
  }
  res.status(201).json(data);
});

// GET /api/activities
router.get("/", async (req, res) => {
  const { type, lead_id, assigned_to, limit = 200, offset = 0 } = req.query;
  const { id: profileId } = req.profile;
  const role = req.orgRole;

  let query = req.db
    .from("activities")
    .select(
      "*, created_by_profile:profiles!activities_created_by_fkey(id,full_name,avatar_url,role), assigned_profile:profiles!activities_assigned_to_fkey(id,full_name,avatar_url), lead:leads(id,contact_name,company_name,stage)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (role === "sales_rep") {
    query = query.or(`created_by.eq.${profileId},assigned_to.eq.${profileId},user_id.eq.${profileId}`);
  } else if (role === "sales_manager") {
    const { data: reports } = await req.db
      .from("organization_members").select("user_id")
      .eq("organization_id", req.organizationId).eq("manager_id", profileId);
    const scopeIds = [profileId, ...(reports || []).map((r) => r.user_id)];
    query = scopeIds.length === 1
      ? query.or(`created_by.eq.${scopeIds[0]},assigned_to.eq.${scopeIds[0]}`)
      : query.or(`created_by.in.(${scopeIds.join(",")}),assigned_to.in.(${scopeIds.join(",")})`);
  }
  // owner / admin: all org activities (RLS already scopes to org)

  if (type) query = query.eq("type", type);
  if (lead_id) query = query.eq("lead_id", lead_id);
  if (assigned_to) query = query.eq("assigned_to", assigned_to);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data, count });
});

// GET /api/activities/lead/:lead_id
router.get("/lead/:lead_id", async (req, res) => {
  const { data, error } = await req.db
    .from("activities")
    .select("*, created_by_profile:profiles!activities_created_by_fkey(id,full_name,avatar_url)")
    .eq("lead_id", req.params.lead_id)
    .order("created_at", { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/activities/:id
router.get("/:id", async (req, res) => {
  const { data, error } = await req.db
    .from("activities")
    .select("*, created_by_profile:profiles!activities_created_by_fkey(id,full_name,avatar_url)")
    .eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: "Activity not found" });
  res.json(data);
});

// PUT /api/activities/:id — own activity always; higher org-rank can edit anyone's
router.put("/:id", async (req, res) => {
  const { data: existing } = await req.db
    .from("activities").select("created_by, assigned_to").eq("id", req.params.id).single();
  if (!existing) return res.status(404).json({ error: "Activity not found" });

  const isOwn = existing.created_by === req.profile.id || existing.assigned_to === req.profile.id;
  if (!isOwn) {
    const { data: creatorMember } = await req.db
      .from("organization_members").select("role")
      .eq("organization_id", req.organizationId).eq("user_id", existing.created_by).maybeSingle();
    const myRank = ROLE_RANK[req.orgRole] || 0;
    const creatorRank = ROLE_RANK[creatorMember?.role] || 0;
    if (myRank < creatorRank) return res.status(403).json({ error: "You cannot edit an activity created by a higher role." });
    if (myRank === 1) return res.status(403).json({ error: "You can only edit your own activities." });
  }

  const { organization_id, ...body } = req.body;
  const { data, error } = await req.db
    .from("activities").update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/activities/:id — admin+ only
router.delete("/:id", async (req, res) => {
  if (!orgAtLeast(req, "admin")) {
    return res.status(403).json({ error: "Only owners and admins can delete activities." });
  }
  const { id: deleterId, full_name: deleterName } = req.profile;

  const { data: existing } = await req.db
    .from("activities")
    .select("id, title, type, related_type, related_id, lead_id, deal_id, created_by")
    .eq("id", req.params.id).single();
  if (!existing) return res.status(404).json({ error: "Activity not found" });

  const { error } = await req.db.from("activities").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  req.db.from("activity_deletion_logs").insert({
    activity_id: existing.id, activity_type: existing.type || null, activity_title: existing.title || null,
    related_type: existing.related_type || null, related_id: existing.related_id || null,
    lead_id: existing.lead_id || null, deal_id: existing.deal_id || null,
    original_creator: existing.created_by || null, deleted_by: deleterId,
    deleter_name: deleterName || null, deleter_role: req.orgRole,
    deleted_at: new Date().toISOString(), organization_id: req.organizationId,
  }).then(() => {}).catch(() => {});

  res.json({ success: true });
});

module.exports = router;
