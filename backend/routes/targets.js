const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { withOrg, orgAtLeast } = require("../middleware/orgContext");
const { CAN_CREATE_TARGET, CAN_VIEW_ALL_TARGETS, canAssignTo } = require("../config/roles");

router.use(authenticate, withOrg);

// Look up a member's org role + manager within the caller's organization.
async function fetchAssignee(req, assigneeId) {
  const { data } = await req.db
    .from("organization_members")
    .select("user_id, role, manager_id")
    .eq("organization_id", req.organizationId)
    .eq("user_id", assigneeId)
    .maybeSingle();
  return data ? { id: data.user_id, role: data.role, manager_id: data.manager_id } : null;
}

async function getDirectReportIds(req, managerId) {
  const { data } = await req.db
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", req.organizationId)
    .eq("manager_id", managerId);
  return (data || []).map((r) => r.user_id);
}

async function validateAssignment(req, assigneeId) {
  if (!assigneeId) return "assigned_to is required.";
  const assignee = await fetchAssignee(req, assigneeId);
  if (!assignee) return "Assignee is not a member of this organization.";

  const callerRole = req.orgRole;
  if (!canAssignTo(callerRole, assignee.role)) {
    return `As ${callerRole}, you cannot assign targets to a ${assignee.role}.`;
  }
  if (callerRole === "sales_manager" && assignee.manager_id !== req.profile.id) {
    return "You can only assign targets to your direct reports.";
  }
  return null;
}

// GET /api/targets
router.get("/", async (req, res) => {
  const role = req.orgRole;
  const { id } = req.profile;
  const { metric, period_type, assigned_to } = req.query;

  let q = req.db.from("targets").select("*").order("created_at", { ascending: false });

  if (role === "sales_rep") {
    q = q.eq("assigned_to", id);
  } else if (role === "sales_manager") {
    const reportIds = await getDirectReportIds(req, id);
    const scopeIds = [id, ...reportIds];
    q = scopeIds.length === 1 ? q.eq("assigned_to", scopeIds[0]) : q.in("assigned_to", scopeIds);
  }
  // owner / admin: all org targets (RLS already limits to org)

  if (metric) q = q.eq("metric", metric);
  if (period_type) q = q.eq("period_type", period_type);
  if (assigned_to && CAN_VIEW_ALL_TARGETS.includes(role)) q = q.eq("assigned_to", assigned_to);

  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data: data || [] });
});

// POST /api/targets
router.post("/", async (req, res) => {
  if (!CAN_CREATE_TARGET.includes(req.orgRole)) {
    return res.status(403).json({ error: "You do not have permission to create targets." });
  }
  const { assigned_to, title, metric, period_type, target_value, start_date, end_date, description } = req.body;

  const assignmentError = await validateAssignment(req, assigned_to);
  if (assignmentError) return res.status(403).json({ error: assignmentError });
  if (!title || !metric || !target_value || !start_date) {
    return res.status(400).json({ error: "title, metric, target_value and start_date are required." });
  }

  const { data, error } = await req.db
    .from("targets")
    .insert({
      title, metric, period_type, target_value: Number(target_value), start_date, end_date, description,
      assigned_to, created_by: req.profile.id, organization_id: req.organizationId,
    })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/targets/:id
router.put("/:id", async (req, res) => {
  const role = req.orgRole;
  const { data: existing, error: fetchErr } = await req.db
    .from("targets").select("created_by, assigned_to").eq("id", req.params.id).single();
  if (fetchErr || !existing) return res.status(404).json({ error: "Target not found." });

  const isPrivileged = CAN_VIEW_ALL_TARGETS.includes(role);
  if (!isPrivileged && existing.created_by !== req.profile.id) {
    return res.status(403).json({ error: "You can only edit targets you created." });
  }

  const { assigned_to, organization_id, ...fields } = req.body;
  const newAssignee = assigned_to || existing.assigned_to;
  if (assigned_to && assigned_to !== existing.assigned_to) {
    const assignmentError = await validateAssignment(req, assigned_to);
    if (assignmentError) return res.status(403).json({ error: assignmentError });
  }

  const { data, error } = await req.db
    .from("targets")
    .update({ ...fields, assigned_to: newAssignee, updated_at: new Date().toISOString() })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/targets/:id
router.delete("/:id", async (req, res) => {
  const { data: existing } = await req.db.from("targets").select("created_by").eq("id", req.params.id).single();
  if (!existing) return res.status(404).json({ error: "Target not found." });
  if (!CAN_VIEW_ALL_TARGETS.includes(req.orgRole) && existing.created_by !== req.profile.id) {
    return res.status(403).json({ error: "You can only delete targets you created." });
  }
  const { error } = await req.db.from("targets").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
