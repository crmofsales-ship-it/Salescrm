const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { sendWelcomeEmail } = require("../config/mail");
const { authenticate } = require("../middleware/auth");
const { withOrg, requireOrgRole } = require("../middleware/orgContext");

const APP_URL =
  process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost")
    ? process.env.FRONTEND_URL
    : "http://localhost:5173";

// POST /api/auth/add-member — invite a teammate into the caller's organization.
// admin+ only. Uses Supabase Auth admin invite; the accept flow attaches the
// user to the organization via organization_invitations.
router.post("/add-member", authenticate, withOrg, requireOrgRole("admin"), async (req, res) => {
  const { email, name, role = "sales_rep" } = req.body;
  if (!email || !name) return res.status(400).json({ error: "Email and name are required" });
  const lower = email.toLowerCase().trim();

  try {
    // 1. Ensure there's a Supabase auth user (invite if new).
    let { data: list } = await supabase.auth.admin.listUsers();
    let authUser = list?.users?.find((u) => u.email?.toLowerCase() === lower);
    if (!authUser) {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(lower, {
        data: { full_name: name },
        redirectTo: `${APP_URL}/onboarding`,
      });
      if (error) throw error;
      authUser = data.user;
    }

    // 2. Record the org invitation (the handle_new_user trigger creates the profile).
    const { data: invite, error: invErr } = await supabase
      .from("organization_invitations")
      .upsert(
        {
          organization_id: req.organizationId,
          email: lower,
          role,
          invited_by: req.profile.id,
          status: "pending",
          expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
        },
        { onConflict: "organization_id,email" }
      )
      .select()
      .single();
    if (invErr) throw invErr;

    // 3. If the profile already exists, attach membership immediately as invited.
    const { data: prof } = await supabase.from("profiles").select("id").eq("email", lower).maybeSingle();
    if (prof) {
      await supabase.from("organization_members").upsert(
        { organization_id: req.organizationId, user_id: prof.id, role, status: "invited", invited_by: req.profile.id },
        { onConflict: "organization_id,user_id" }
      );
    }

    let emailSent = false;
    try {
      await sendWelcomeEmail({
        to: lower, name, role,
        invitedBy: req.profile.full_name || null,
        inviterEmail: req.profile.email || null,
        acceptUrl: `${APP_URL}/accept-invite?token=${invite.token}`,
      });
      emailSent = true;
    } catch (mailErr) {
      console.error("[add-member] invite email failed:", mailErr.message);
    }

    res.json({ success: true, emailSent, message: `Invitation sent to ${lower}` });
  } catch (err) {
    console.error("add-member error:", err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/auth/me — the caller's profile + memberships
router.get("/me", authenticate, async (req, res) => {
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, status, organization:organizations(*)")
    .eq("user_id", req.profile.id)
    .eq("status", "active");
  res.json({ profile: req.profile, organizations: (memberships || []).map((m) => ({ ...m.organization, role: m.role })) });
});

module.exports = router;
