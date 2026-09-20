/**
 * Central org-role hierarchy — single source of truth for RBAC checks.
 * Roles are organization-scoped (see organization_members.role).
 */

// Numeric rank: higher = more authority
const ROLE_RANK = {
  owner: 4,
  admin: 3,
  sales_manager: 2,
  sales_rep: 1,
};

// Roles allowed to create targets
const CAN_CREATE_TARGET = ["owner", "admin", "sales_manager"];

// Roles that can view all targets (unrestricted)
const CAN_VIEW_ALL_TARGETS = ["owner", "admin"];

// A role → the roles it may assign targets TO (never upward).
const ASSIGNABLE_TO = {
  owner: ["admin", "sales_manager", "sales_rep"],
  admin: ["sales_manager", "sales_rep"],
  sales_manager: ["sales_rep"],
  sales_rep: [],
};

function canAssignTo(assignerRole, assigneeRole) {
  return (ASSIGNABLE_TO[assignerRole] || []).includes(assigneeRole);
}

function outranks(roleA, roleB) {
  return (ROLE_RANK[roleA] || 0) > (ROLE_RANK[roleB] || 0);
}

module.exports = { ROLE_RANK, CAN_CREATE_TARGET, CAN_VIEW_ALL_TARGETS, ASSIGNABLE_TO, canAssignTo, outranks };
