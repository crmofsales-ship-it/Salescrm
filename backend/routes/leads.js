const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { withOrg, requireOrgRole, orgAtLeast } = require("../middleware/orgContext");
const { sendSensitiveFieldAlert } = require("../config/mail");

// All lead routes require an authenticated user with an active organization.
// req.db is scoped to that user; Postgres RLS enforces org isolation.
router.use(authenticate, withOrg);

const calcAiScore = (budget, source) => {
  let score = 40;
  if (budget > 100000) score += 30;
  else if (budget > 50000) score += 20;
  else if (budget > 10000) score += 10;
  if (source === "referral") score += 25;
  else if (source === "website") score += 10;
  return Math.min(score, 100);
};

async function nextLeadCode(db) {
  const { data } = await db.from("leads").select("lead_code").not("lead_code", "is", null);
  let max = 0;
  (data || []).forEach((r) => {
    const n = parseInt((r.lead_code || "").replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return `LEAD-${String(max + 1).padStart(3, "0")}`;
}

// GET /api/leads
router.get("/", async (req, res) => {
  const { stage, temperature, source, assigned_to, search, limit = 100, offset = 0 } = req.query;
  const { id: profileId } = req.profile;
  const isAdmin = orgAtLeast(req, "admin");

  const applyLeadFilters = (q) => {
    if (!isAdmin) q = q.eq("assigned_to", profileId);
    if (stage) q = q.eq("stage", stage);
    else q = q.neq("stage", "converted").neq("stage", "pipeline");
    if (temperature) q = q.eq("temperature", temperature);
    if (source) q = q.eq("source", source);
    if (assigned_to && isAdmin) q = q.eq("assigned_to", assigned_to);
    if (search) q = q.or(`contact_name.ilike.%${search}%,company_name.ilike.%${search}%`);
    return q.order("created_at", { ascending: false }).range(Number(offset), Number(offset) + Number(limit) - 1);
  };

  let { data, error, count } = await applyLeadFilters(
    req.db.from("leads").select(
      "*, assigned_profile:profiles!assigned_to(id,full_name,avatar_url,email), created_by_profile:profiles!created_by(id,full_name)",
      { count: "exact" }
    )
  );

  if (error) {
    const plain = await applyLeadFilters(req.db.from("leads").select("*", { count: "exact" }));
    if (plain.error) return res.status(400).json({ error: plain.error.message });
    data = plain.data || [];
    count = plain.count;
    const assignedIds = [...new Set(data.filter((l) => l.assigned_to).map((l) => l.assigned_to))];
    if (assignedIds.length) {
      const { data: profiles } = await req.db.from("profiles").select("id,full_name,avatar_url,email").in("id", assignedIds);
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      data = data.map((l) => ({ ...l, assigned_profile: l.assigned_to ? (profileMap[l.assigned_to] || null) : null }));
    }
  }

  res.json({ data: data || [], count: count || 0 });
});

// POST /api/leads
router.post("/", async (req, res) => {
  const { budget, source, assigned_to, ...rest } = req.body;
  delete rest.organization_id;
  const { id: profileId } = req.profile;

  if (!rest.company_name?.trim()) return res.status(400).json({ error: "Company name is required" });
  let notes = {};
  try { notes = rest.other_notes ? JSON.parse(rest.other_notes) : {}; } catch { /* ignore */ }
  if (!notes.email?.trim() && !notes.phone?.trim()) {
    return res.status(400).json({ error: "At least one contact detail (Email or Phone) is required" });
  }

  const ai_score = calcAiScore(Number(budget) || 0, source);
  const lead_code = await nextLeadCode(req.db);
  const finalAssignedTo = req.orgRole === "sales_rep" ? profileId : (assigned_to || profileId);

  const { data, error } = await req.db
    .from("leads")
    .insert({
      ...rest, contact_name: rest.contact_name ?? "", budget: Number(budget) || 0, source,
      ai_score, lead_code, assigned_to: finalAssignedTo, created_by: profileId,
      organization_id: req.organizationId,
    })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });

  req.db.from("activities").insert({
    type: "note",
    title: `Lead created: ${data.contact_name || data.company_name || lead_code}`,
    description: `Lead created: ${data.contact_name || data.company_name || lead_code}`,
    lead_id: data.id, created_by: profileId, status: "done", organization_id: req.organizationId,
  }).then(() => {}).catch(() => {});

  res.status(201).json(data);
});

// POST /api/leads/bulk
router.post("/bulk", requireOrgRole("sales_manager"), async (req, res) => {
  const leads = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "Body must be a non-empty array of leads" });
  }
  const { data: codeData } = await req.db.from("leads").select("lead_code").not("lead_code", "is", null);
  let maxCode = 0;
  (codeData || []).forEach((r) => {
    const n = parseInt((r.lead_code || "").replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > maxCode) maxCode = n;
  });
  const enriched = leads.map((l, i) => {
    const { organization_id, ...clean } = l;
    return {
      ...clean,
      ai_score: calcAiScore(Number(l.budget) || 0, l.source),
      lead_code: `LEAD-${String(maxCode + i + 1).padStart(3, "0")}`,
      created_by: req.profile.id,
      assigned_to: l.assigned_to || req.profile.id,
      organization_id: req.organizationId,
    };
  });
  const { data, error } = await req.db.from("leads").insert(enriched).select();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ inserted: data.length, data });
});

// ── Exact-duplicate helpers ─────────────────────────────────────────────────
const _normStr = (v) => (v || "").trim().toLowerCase();
const _normPhone = (v) => (v || "").replace(/\D/g, "").slice(-10);
function _parseNotes(rec, key) {
  const v = rec[key];
  if (!v) return {};
  if (typeof v === "object" && !Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return {}; }
}
function _extractDupFields(rec, notesKey, phoneKey) {
  const n = _parseNotes(rec, notesKey);
  return {
    company: _normStr(rec.company_name || rec.title || ""),
    contact: _normStr(rec.contact_name || ""),
    email: _normStr(n.email || ""),
    phone: _normPhone(n[phoneKey] || ""),
    linkedin: _normStr(n.linkedin || ""),
    website: _normStr(n.website || ""),
  };
}
function findExactDuplicate(newRecord, existingRecords, { notesKey = "other_notes", phoneKey = "phone" } = {}) {
  const nf = _extractDupFields(newRecord, notesKey, phoneKey);
  if (!nf.company || (!nf.email && !nf.phone)) return null;
  for (const rec of existingRecords) {
    const ef = _extractDupFields(rec, notesKey, phoneKey);
    if (!ef.company || ef.company !== nf.company) continue;
    if (nf.contact && ef.contact && nf.contact !== ef.contact) continue;
    if (nf.email && ef.email && nf.email !== ef.email) continue;
    if (nf.phone && ef.phone && nf.phone !== ef.phone) continue;
    if (nf.linkedin && ef.linkedin && nf.linkedin !== ef.linkedin) continue;
    if (nf.website && ef.website && nf.website !== ef.website) continue;
    const emailMatch = nf.email && ef.email && nf.email === ef.email;
    const phoneMatch = nf.phone && ef.phone && nf.phone === ef.phone;
    if (!emailMatch && !phoneMatch) continue;
    return rec;
  }
  return null;
}

// POST /api/leads/check-duplicate — checks all leads in the org
router.post("/check-duplicate", async (req, res) => {
  const { id: profileId } = req.profile;
  const isAdmin = orgAtLeast(req, "admin");
  const { data: allLeads, error } = await req.db
    .from("leads").select("id, company_name, contact_name, other_notes, assigned_to");
  if (error) return res.status(500).json({ error: "Failed to check duplicates" });

  const dup = findExactDuplicate(req.body, allLeads || []);
  if (!dup) return res.status(200).json({ duplicate: false });

  const isVisible = isAdmin || dup.assigned_to === profileId;
  return res.status(409).json({ duplicate: true, crossRole: !isVisible, existingRecordId: dup.id });
});

// GET /api/leads/inactive-summary
router.get("/inactive-summary", async (req, res) => {
  try {
    const { id: userId } = req.profile;
    const isAdmin = orgAtLeast(req, "admin");

    let scopeIds = null;
    if (req.orgRole === "sales_manager") {
      const { data: reports } = await req.db.from("profiles").select("id").eq("manager_id", userId);
      scopeIds = [userId, ...(reports || []).map((r) => r.id)];
    } else if (!isAdmin) {
      scopeIds = [userId];
    }

    let q = req.db
      .from("leads")
      .select("id, company_name, contact_name, assigned_to, stage, last_activity_at, inactivity_status, previous_assigned_to, unassigned_at")
      .not("stage", "in", '("won","lost","converted","pipeline")')
      .order("last_activity_at", { ascending: true, nullsFirst: true });
    if (scopeIds) q = q.in("assigned_to", scopeIds);

    const { data: leads, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    if (!leads?.length) {
      return res.json({ counts: { warning7: 0, warning25: 0, autoUnassigned: 0 }, myLeads: [], unassignedLeads: [], teamWarnings: [] });
    }

    const profileIds = [...new Set([
      ...leads.map((l) => l.assigned_to).filter(Boolean),
      ...leads.map((l) => l.previous_assigned_to).filter(Boolean),
    ])];
    const { data: profiles } = profileIds.length
      ? await req.db.from("profiles").select("id, full_name, email").in("id", profileIds)
      : { data: [] };
    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    const enriched = leads.map((l) => ({
      ...l,
      assigned_profile: l.assigned_to ? profileMap[l.assigned_to] : null,
      prev_profile: l.previous_assigned_to ? profileMap[l.previous_assigned_to] : null,
    }));

    const activeLeads = enriched.filter((l) => l.inactivity_status !== "auto_unassigned");
    const unassignedLeads = enriched.filter((l) => l.inactivity_status === "auto_unassigned");
    const counts = {
      warning7: activeLeads.filter((l) => l.inactivity_status === "warning_7").length,
      warning25: activeLeads.filter((l) => l.inactivity_status === "warning_25").length,
      autoUnassigned: unassignedLeads.length,
    };
    const isFieldUser = req.orgRole === "sales_rep";
    const myLeads = isFieldUser
      ? activeLeads.filter((l) => l.assigned_to === userId && ["warning_7", "warning_25"].includes(l.inactivity_status))
      : [];
    const teamWarnings = !isFieldUser
      ? activeLeads.filter((l) => l.inactivity_status && l.inactivity_status !== "active")
      : [];

    let employeeBreakdown = [];
    if (isAdmin) {
      const byEmp = {};
      for (const lead of enriched) {
        const empId = lead.assigned_to || lead.previous_assigned_to;
        if (!empId) continue;
        const status = lead.inactivity_status;
        if (!["warning_7", "warning_25", "auto_unassigned"].includes(status)) continue;
        if (!byEmp[empId]) byEmp[empId] = { id: empId, full_name: profileMap[empId]?.full_name || "Unknown", warning7: 0, warning25: 0, autoUnassigned: 0, total: 0 };
        if (status === "warning_7") byEmp[empId].warning7++;
        else if (status === "warning_25") byEmp[empId].warning25++;
        else if (status === "auto_unassigned") byEmp[empId].autoUnassigned++;
        byEmp[empId].total++;
      }
      employeeBreakdown = Object.values(byEmp).sort((a, b) => b.total - a.total);
    }
    res.json({ counts, myLeads, unassignedLeads: isAdmin ? unassignedLeads : [], teamWarnings, employeeBreakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/inactive-by-employee/:employeeId — admin+
router.get("/inactive-by-employee/:employeeId", requireOrgRole("admin"), async (req, res) => {
  try {
    const { data: leads, error } = await req.db
      .from("leads")
      .select("id, company_name, contact_name, assigned_to, previous_assigned_to, stage, last_activity_at, inactivity_status")
      .or(`assigned_to.eq.${req.params.employeeId},previous_assigned_to.eq.${req.params.employeeId}`)
      .in("inactivity_status", ["warning_7", "warning_25", "auto_unassigned"])
      .order("last_activity_at", { ascending: true, nullsFirst: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(leads || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/:id
router.get("/:id", async (req, res) => {
  const { data, error } = await req.db
    .from("leads")
    .select("*, assigned_profile:profiles!leads_assigned_to_fkey(id,full_name,avatar_url)")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: "Lead not found" });
  res.json(data);
});

const TRACKED_FIELDS = ["stage", "temperature", "priority", "assigned_to", "follow_up_date"];
const ALLOWED_UPDATE_FIELDS = [
  "contact_name", "company_name", "designation", "email", "phone",
  "stage", "temperature", "priority", "source", "remarks",
  "follow_up_date", "assigned_to", "pipeline_stage", "other_notes",
  "budget", "lead_code",
];
const pickAllowed = (body) =>
  Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_UPDATE_FIELDS.includes(k)));

async function logLeadChanges(db, orgId, leadId, oldLead, newBody, profileId) {
  const changes = TRACKED_FIELDS.filter((f) => newBody[f] !== undefined && String(oldLead[f] ?? "") !== String(newBody[f]));
  for (const field of changes) {
    await db.from("activities").insert({
      type: "note",
      title: `${field} updated: ${oldLead[field] ?? "—"} → ${newBody[field]}`,
      description: `${field}: ${oldLead[field] ?? "—"} → ${newBody[field]}`,
      lead_id: leadId, created_by: profileId, status: "done", organization_id: orgId,
    });
  }
}

async function updateLead(req, res) {
  const safeBody = pickAllowed(req.body);
  const { data: oldLead } = await req.db.from("leads").select(TRACKED_FIELDS.join(",")).eq("id", req.params.id).single();
  const { data, error } = await req.db
    .from("leads")
    .update({ ...safeBody, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (oldLead) logLeadChanges(req.db, req.organizationId, req.params.id, oldLead, safeBody, req.profile.id).catch(() => {});
  res.json(data);
}

// PUT / PATCH /api/leads/:id — admin+
router.put("/:id", requireOrgRole("admin"), updateLead);
router.patch("/:id", requireOrgRole("admin"), updateLead);

// DELETE /api/leads/:id — admin+
router.delete("/:id", requireOrgRole("admin"), async (req, res) => {
  const { data: lead } = await req.db.from("leads").select("contact_name,company_name,lead_code").eq("id", req.params.id).single();
  const { error } = await req.db.from("leads").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  req.db.from("notifications").delete().eq("entity_id", req.params.id).eq("entity_type", "lead").then(() => {}).catch(() => {});
  if (lead) {
    req.db.from("activities").insert({
      type: "note",
      title: `Lead deleted: ${lead.company_name || lead.contact_name || lead.lead_code}`,
      description: `Lead deleted: ${lead.company_name || lead.contact_name || lead.lead_code}`,
      created_by: req.profile.id, status: "done", organization_id: req.organizationId,
    }).then(() => {}).catch(() => {});
  }
  res.json({ success: true, deleted: lead || null });
});

// POST /api/leads/sensitive-edit-alert
router.post("/sensitive-edit-alert", async (req, res) => {
  const { leadName, companyName, editorName, editorRole, editedFields } = req.body;
  if (!editedFields?.length) return res.json({ success: true, sent: 0 });

  const { data: admins, error } = await req.db
    .from("organization_members")
    .select("member:profiles!organization_members_user_id_fkey(id, full_name, email)")
    .eq("organization_id", req.organizationId)
    .in("role", ["owner", "admin"]);
  if (error) return res.status(400).json({ error: error.message });

  const recipients = (admins || []).map((r) => r.member).filter((m) => m?.email);
  if (!recipients.length) return res.json({ success: true, sent: 0 });

  const results = await Promise.allSettled(
    recipients.map((m) =>
      sendSensitiveFieldAlert({ to: m.email, toName: m.full_name, editorName, editorRole, leadName, companyName, editedFields })
    )
  );
  res.json({ success: true, sent: results.filter((r) => r.status === "fulfilled").length });
});

// POST /api/leads/:id/convert-to-lead
router.post("/:id/convert-to-lead", async (req, res) => {
  try {
    const { data: lead, error: fetchErr } = await req.db
      .from("leads")
      .select("id, stage, company_name, contact_name, email, phone, other_notes")
      .eq("id", req.params.id).single();
    if (fetchErr || !lead) return res.status(404).json({ error: "Record not found" });
    if (lead.stage !== "pipeline") return res.status(400).json({ error: "Only pipeline records can be converted to leads" });

    let notes = {};
    try { notes = lead.other_notes ? JSON.parse(lead.other_notes) : {}; } catch { /* ignore */ }
    const hasEmail = !!(lead.email?.trim() || notes.email?.trim());
    let hasPhone = !!(lead.phone?.trim() || notes.phone?.trim() || notes.whatsapp?.trim());
    if (!hasPhone && Array.isArray(notes.people_contacts)) hasPhone = notes.people_contacts.some((p) => p?.phone?.trim());
    let hasEmailFull = hasEmail;
    if (!hasEmailFull && Array.isArray(notes.people_contacts)) hasEmailFull = notes.people_contacts.some((p) => p?.email?.trim());

    if (!hasEmailFull && !hasPhone) {
      return res.status(400).json({
        error: "Lead conversion requires at least one contact method. Please add either a Contact Number or an Email Address before converting this Pipeline record into a Lead.",
        code: "MISSING_CONTACT", missing_fields: ["email", "phone"],
      });
    }

    const now = new Date().toISOString();
    const updatedNotes = JSON.stringify({ ...notes, lead_created_at: now });
    const { data, error } = await req.db
      .from("leads").update({ stage: "new", updated_at: now, other_notes: updatedNotes })
      .eq("id", req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    req.db.from("activities").insert({
      type: "note",
      title: `Converted to Lead: ${data.company_name || data.contact_name || data.lead_code}`,
      description: `Pipeline record converted to active lead by ${req.profile.full_name || "team member"}`,
      lead_id: data.id, created_by: req.profile.id, status: "done", organization_id: req.organizationId,
    }).then(() => {}).catch(() => {});
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leads/cleanup-orphans — owner only
router.post("/cleanup-orphans", requireOrgRole("owner"), async (req, res) => {
  try {
    const { data: convertedLeads } = await req.db.from("leads").select("id").eq("stage", "converted");
    if (!convertedLeads?.length) return res.json({ fixed: 0, message: "No orphaned leads found" });
    const leadIds = convertedLeads.map((l) => l.id);
    const { data: linkedDeals } = await req.db.from("deals").select("lead_id").in("lead_id", leadIds);
    const linkedLeadIds = new Set((linkedDeals || []).map((d) => d.lead_id));
    const orphanIds = leadIds.filter((id) => !linkedLeadIds.has(id));
    if (!orphanIds.length) return res.json({ fixed: 0, message: "No orphaned leads found" });
    const { error } = await req.db.from("leads").update({ stage: "new", updated_at: new Date().toISOString() }).in("id", orphanIds);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ fixed: orphanIds.length, message: `${orphanIds.length} orphaned lead(s) restored to active state` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leads/:id/reassign — admin+
router.post("/:id/reassign", requireOrgRole("admin"), async (req, res) => {
  const { assigned_to: newAssignedTo } = req.body;
  if (!newAssignedTo) return res.status(400).json({ error: "assigned_to is required" });

  const { data: lead, error: fetchErr } = await req.db
    .from("leads")
    .select("id, assigned_to, inactivity_status, previous_assigned_to, company_name, contact_name")
    .eq("id", req.params.id).single();
  if (fetchErr || !lead) return res.status(404).json({ error: "Lead not found" });

  const { data, error } = await req.db
    .from("leads")
    .update({
      assigned_to: newAssignedTo, inactivity_status: "active",
      previous_assigned_to: lead.previous_assigned_to || lead.assigned_to,
      updated_at: new Date().toISOString(),
    })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });

  req.db.from("lead_inactivity_logs").insert({
    lead_id: req.params.id, event_type: "reassigned", assigned_to_at_event: lead.assigned_to,
    new_assigned_to: newAssignedTo, triggered_by: req.profile.id,
    notes: `Manually reassigned by ${req.profile.full_name || req.profile.email}`,
    organization_id: req.organizationId,
  }).then(() => {}).catch(() => {});

  req.db.from("notifications").delete()
    .eq("entity_id", req.params.id).eq("entity_type", "lead").eq("type", "general")
    .then(() => {}).catch(() => {});

  req.db.from("notifications").insert({
    user_id: newAssignedTo, type: "lead_assigned", title: "Lead Assigned to You",
    message: `"${lead.company_name || lead.contact_name || "A lead"}" has been assigned to you.`,
    data: { lead_id: req.params.id }, entity_id: req.params.id, entity_type: "lead", read: false,
    organization_id: req.organizationId,
  }).then(() => {}).catch(() => {});

  res.json(data);
});

module.exports = router;
