const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { withOrg, requireOrgRole, orgAtLeast, ROLE_RANK } = require("../middleware/orgContext");

router.use(authenticate, withOrg);

// Shape a member row like the legacy /api/users response the frontend expects.
const shape = (m) => ({
  id: m.member?.id,
  membership_id: m.id,
  full_name: m.member?.full_name,
  email: m.member?.email,
  avatar_url: m.member?.avatar_url,
  role: m.role,           // org role
  status: m.status,       // membership status
  manager_id: m.manager_id,
  created_at: m.created_at,
});

// GET /api/users — members of the caller's organization
router.get("/", async (req, res) => {
  const { role, status, search } = req.query;
  let query = req.db
    .from("organization_members")
    .select("id, role, status, manager_id, created_at, member:profiles!organization_members_user_id_fkey(id, full_name, email, avatar_url)")
    .eq("organization_id", req.organizationId)
    .neq("status", "removed")
    .order("created_at", { ascending: false });
  if (role) query = query.eq("role", role);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  let rows = (data || []).map(shape);
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((r) => (r.full_name || "").toLowerCase().includes(s) || (r.email || "").toLowerCase().includes(s));
  }
  res.json(rows);
});

// GET /api/users/:id — a single member of the org
router.get("/:id", async (req, res) => {
  const { data, error } = await req.db
    .from("organization_members")
    .select("id, role, status, manager_id, created_at, member:profiles!organization_members_user_id_fkey(id, full_name, email, avatar_url)")
    .eq("organization_id", req.organizationId)
    .eq("user_id", req.params.id)
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: "User not found" });
  res.json(shape(data));
});

// PUT /api/users/:id — change a member's org role / status / manager — admin+
router.put("/:id", requireOrgRole("admin"), async (req, res) => {
  const { role: newRole, status, manager_id } = req.body;

  const { data: target } = await req.db
    .from("organization_members").select("id, role")
    .eq("organization_id", req.organizationId).eq("user_id", req.params.id).maybeSingle();
  if (!target) return res.status(404).json({ error: "User not found in this organization" });

  // cannot assign a role at or above your own (owners excepted)
  if (newRole && req.orgRole !== "owner" && (ROLE_RANK[newRole] || 0) >= (ROLE_RANK[req.orgRole] || 0)) {
    return res.status(403).json({ error: "Cannot assign a role at or above your own" });
  }
  // protect the last owner
  if (target.role === "owner" && (newRole && newRole !== "owner" || status === "suspended")) {
    const { count } = await supabase.from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", req.organizationId).eq("role", "owner").eq("status", "active");
    if ((count || 0) <= 1) return res.status(400).json({ error: "An organization must keep at least one owner" });
  }

  const patch = {};
  if (newRole) patch.role = newRole;
  if (status) patch.status = status;
  if (manager_id !== undefined) patch.manager_id = manager_id;

  const { data, error } = await req.db
    .from("organization_members").update(patch)
    .eq("id", target.id).select("id, role, status, manager_id").single();
  if (error) return res.status(400).json({ error: error.message });

  // profile-level fields (name / avatar) still allowed for self-managed data only
  if (req.body.full_name || req.body.avatar_url) {
    const p = {};
    if (req.body.full_name) p.full_name = req.body.full_name;
    if (req.body.avatar_url) p.avatar_url = req.body.avatar_url;
    await req.db.from("profiles").update(p).eq("id", req.params.id);
  }
  res.json(data);
});

// DELETE /api/users/:id — remove a member from the organization — admin+
router.delete("/:id", requireOrgRole("admin"), async (req, res) => {
  if (req.profile.id === req.params.id) return res.status(403).json({ error: "Cannot remove your own membership" });

  const { data: target } = await req.db
    .from("organization_members").select("id, role, status")
    .eq("organization_id", req.organizationId).eq("user_id", req.params.id).maybeSingle();
  if (!target) return res.status(404).json({ error: "User not found in this organization" });
  if (target.status === "removed") return res.status(409).json({ error: "User already removed" });

  if (target.role === "owner") {
    const { count } = await supabase.from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", req.organizationId).eq("role", "owner").eq("status", "active");
    if ((count || 0) <= 1) return res.status(400).json({ error: "An organization must keep at least one owner" });
  }

  const { error } = await req.db
    .from("organization_members").update({ status: "removed" }).eq("id", target.id);
  if (error) return res.status(400).json({ error: error.message });

  // If the user now belongs to no active organization, ban the auth account.
  const { data: prof } = await supabase.from("profiles").select("user_id").eq("id", req.params.id).maybeSingle();
  if (prof?.user_id) {
    const { count: other } = await supabase.from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.params.id).eq("status", "active");
    if ((other || 0) === 0) {
      try { await supabase.auth.admin.updateUserById(prof.user_id, { ban_duration: "876000h" }); } catch { /* status is the gate */ }
      await supabase.from("profiles").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", req.params.id);
    }
  }
  res.json({ success: true });
});

module.exports = router;
