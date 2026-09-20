"use strict";

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { withOrg, requireOrgRole } = require("../middleware/orgContext");

const slugify = (name) =>
  (name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org") +
  "-" + crypto.randomBytes(3).toString("hex");

// ── GET /api/organizations — orgs the caller belongs to ──────────────────────
router.get("/", authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, status, organization:organizations(*)")
    .eq("user_id", req.profile.id)
    .eq("status", "active");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: (data || []).map((m) => ({ ...m.organization, role: m.role })) });
});

// ── POST /api/organizations — create an org, caller becomes owner ────────────
router.post("/", authenticate, async (req, res) => {
  const { name, industry = null, website = null, timezone = null, currency = "USD" } = req.body;
  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Organization name is required" });

  const { data: org, error } = await supabase
    .from("organizations")
    .insert({ name: name.trim(), slug: slugify(name), created_by: req.profile.id, industry, website, timezone, currency })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });

  const { error: memErr } = await supabase.from("organization_members").insert({
    organization_id: org.id, user_id: req.profile.id, role: "owner", status: "active",
    joined_at: new Date().toISOString(),
  });
  if (memErr) return res.status(500).json({ error: memErr.message });

  await supabase.from("organization_audit_logs").insert({
    organization_id: org.id, actor_id: req.profile.id, action: "organization.created", resource: "organization", resource_id: org.id,
  });
  res.status(201).json({ data: org });
});

// ── GET /api/organizations/:id ──────────────────────────────────────────────
router.get("/:id", authenticate, withOrg, async (req, res) => {
  if (req.params.id !== req.organizationId) return res.status(403).json({ error: "Forbidden" });
  const { data, error } = await supabase.from("organizations").select("*").eq("id", req.organizationId).single();
  if (error) return res.status(404).json({ error: "Not found" });
  res.json({ data });
});

// ── PATCH /api/organizations/:id — admin+ ───────────────────────────────────
router.patch("/:id", authenticate, withOrg, requireOrgRole("admin"), async (req, res) => {
  if (req.params.id !== req.organizationId) return res.status(403).json({ error: "Forbidden" });
  const allowed = (({ name, logo_url, website, industry, timezone, currency, settings }) =>
    ({ name, logo_url, website, industry, timezone, currency, settings }))(req.body);
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const { data, error } = await supabase.from("organizations").update(allowed).eq("id", req.organizationId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await supabase.from("organization_audit_logs").insert({
    organization_id: req.organizationId, actor_id: req.profile.id, action: "organization.updated",
    resource: "organization", resource_id: req.organizationId, details: allowed,
  });
  res.json({ data });
});

// ── Members ────────────────────────────────────────────────────────────────
router.get("/:id/members", authenticate, withOrg, async (req, res) => {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, role, status, joined_at, created_at, member:profiles!organization_members_user_id_fkey(id, full_name, email, avatar_url)")
    .eq("organization_id", req.organizationId)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.patch("/:id/members/:memberId", authenticate, withOrg, requireOrgRole("admin"), async (req, res) => {
  const { role, status } = req.body;
  const patch = {};
  if (role) patch.role = role;
  if (status) patch.status = status;

  // never allow removing / demoting the last active owner
  if ((role && role !== "owner") || status === "removed" || status === "suspended") {
    const { data: target } = await supabase.from("organization_members").select("role").eq("id", req.params.memberId).single();
    if (target?.role === "owner") {
      const { count } = await supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", req.organizationId).eq("role", "owner").eq("status", "active");
      if ((count || 0) <= 1) return res.status(400).json({ error: "An organization must keep at least one owner" });
    }
  }
  const { data, error } = await supabase.from("organization_members")
    .update(patch).eq("id", req.params.memberId).eq("organization_id", req.organizationId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.delete("/:id/members/:memberId", authenticate, withOrg, requireOrgRole("admin"), async (req, res) => {
  const { data: target } = await supabase.from("organization_members").select("role").eq("id", req.params.memberId).single();
  if (target?.role === "owner") {
    const { count } = await supabase.from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", req.organizationId).eq("role", "owner").eq("status", "active");
    if ((count || 0) <= 1) return res.status(400).json({ error: "An organization must keep at least one owner" });
  }
  const { error } = await supabase.from("organization_members")
    .update({ status: "removed" }).eq("id", req.params.memberId).eq("organization_id", req.organizationId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Invitations ────────────────────────────────────────────────────────────
router.post("/:id/invitations", authenticate, withOrg, requireOrgRole("admin"), async (req, res) => {
  const { email, role = "sales_rep" } = req.body;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) return res.status(400).json({ error: "Valid email required" });
  const { data, error } = await supabase.from("organization_invitations")
    .upsert({ organization_id: req.organizationId, email: email.toLowerCase(), role, invited_by: req.profile.id, status: "pending",
              expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), token: crypto.randomBytes(24).toString("hex") },
            { onConflict: "organization_id,email" })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  // TODO: send invite email via config/mail.js with link /accept-invite?token=...
  res.status(201).json({ data });
});

router.post("/invitations/accept", authenticate, async (req, res) => {
  const { token } = req.body;
  const { data: inv } = await supabase.from("organization_invitations")
    .select("*").eq("token", token).eq("status", "pending").maybeSingle();
  if (!inv) return res.status(404).json({ error: "Invitation not found or already used" });
  if (new Date(inv.expires_at) < new Date()) {
    await supabase.from("organization_invitations").update({ status: "expired" }).eq("id", inv.id);
    return res.status(410).json({ error: "Invitation expired" });
  }
  if (inv.email.toLowerCase() !== req.profile.email.toLowerCase())
    return res.status(403).json({ error: "This invitation was sent to a different email" });

  await supabase.from("organization_members").upsert(
    { organization_id: inv.organization_id, user_id: req.profile.id, role: inv.role, status: "active", invited_by: inv.invited_by, joined_at: new Date().toISOString() },
    { onConflict: "organization_id,user_id" });
  await supabase.from("organization_invitations").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", inv.id);
  res.json({ ok: true, organization_id: inv.organization_id });
});

module.exports = router;
