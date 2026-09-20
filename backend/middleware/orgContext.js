"use strict";

const { supabase, supabaseAsUser } = require("../config/db");

const ROLE_RANK = { owner: 4, admin: 3, sales_manager: 2, sales_rep: 1 };

// Resolves the caller's active organization from the X-Organization-Id header
// (falls back to their sole membership) and verifies membership.
// Attaches: req.organizationId, req.orgRole, req.membership,
//           req.db  — a Supabase client scoped to the calling user (RLS-enforced),
//           req.isOrgAdmin — convenience boolean (admin or owner).
// Must run after authenticate().
const withOrg = async (req, res, next) => {
  if (!req.profile) return res.status(401).json({ error: "Unauthorized" });

  const requested =
    req.headers["x-organization-id"] ||
    req.query.organization_id ||
    req.body?.organization_id ||
    null;

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", req.profile.id)
    .eq("status", "active");

  if (error) return res.status(500).json({ error: "Could not resolve organization" });
  if (!memberships?.length) return res.status(403).json({ error: "You do not belong to any organization" });

  const membership = requested
    ? memberships.find((m) => m.organization_id === requested)
    : memberships[0];

  if (!membership) return res.status(403).json({ error: "Not a member of the requested organization" });

  req.organizationId = membership.organization_id;
  req.orgRole = membership.role;
  req.membership = membership;
  req.isOrgAdmin = (ROLE_RANK[membership.role] || 0) >= ROLE_RANK.admin;
  req.db = req.token ? supabaseAsUser(req.token) : supabase;
  next();
};

// Guard: require at least the given org role. Use after withOrg().
const requireOrgRole = (minRole) => (req, res, next) => {
  if (!req.orgRole) return res.status(401).json({ error: "Unauthorized" });
  if ((ROLE_RANK[req.orgRole] || 0) < (ROLE_RANK[minRole] || 99)) {
    return res.status(403).json({ error: `Forbidden: requires ${minRole} or higher` });
  }
  next();
};

// Returns true if the caller's org role meets the minimum.
const orgAtLeast = (req, minRole) => (ROLE_RANK[req.orgRole] || 0) >= (ROLE_RANK[minRole] || 99);

module.exports = { withOrg, requireOrgRole, orgAtLeast, ROLE_RANK };
