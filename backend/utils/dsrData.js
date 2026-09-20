'use strict';
const { supabase } = require("../config/db");

const CALL_TYPES     = new Set(["call","phone_call","outbound_call","inbound_call","follow_up_call"]);
const EMAIL_TYPES    = new Set(["email","email_sent","email_received","follow_up_email","email_contact"]);
const FOLLOWUP_TYPES = new Set(["follow_up","follow_up_call","follow_up_email","followup"]);
const NOTE_TYPES     = new Set(["note","comment","remark","note_added"]);

// leads.other_notes is JSONB but the app writes it via JSON.stringify(), so a
// touched row's value is itself a JSON *string* scalar (needs a second parse);
// an untouched row still holds the plain default object `{}`.
function parseOtherNotes(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return raw;
}

function emptyStats(profile) {
  return {
    profile,
    prospectsAdded:      0,
    leadsCreated:        0,
    newLeadsFromPipeline:0,
    dealsCreated:        0,
    activitiesCompleted: 0,
    activitiesPending:   0,
    activitiesOverdue:   0,
    callsMade:           0,
    emailsSent:          0,
    meetingsScheduled:   0,
    meetingsCompleted:   0,
    tasksCreated:        0,
    tasksCompleted:      0,
    followUpsCompleted:  0,
    followUpsPending:    0,
    nextFollowUps:       0,
    leadsConverted:      0,
    dealsWon:            0,
    dealsLost:           0,
    revenue:             0,
    notesAdded:          0,
    lastActivityAt:      null,
    activityTimeline:    [],
    todayLeads:          [],
    todayDeals:          [],
    todayFollowUps:      [],
    todayNotes:          [],
    pendingActivities:   [],
    overdueActivities:   [],
  };
}

async function collectDsrData(dayStart, dayEnd, todayStr, orgId = null) {
  // When orgId is given, scope every query to that organization. Profile scoping
  // alone covers the per-employee aggregation (statsMap is keyed by org members);
  // the .eq below also keeps raw record lists org-bounded.
  let profQuery = supabase
    .from("profiles")
    .select("id, full_name, email, role, manager_id")
    .not("status", "in", '("deleted","inactive")')
    .order("full_name");
  if (orgId) {
    const { data: mem } = await supabase
      .from("organization_members")
      .select("user_id, role, manager_id")
      .eq("organization_id", orgId)
      .eq("status", "active");
    const memberIds = (mem || []).map((m) => m.user_id);
    profQuery = supabase
      .from("profiles")
      .select("id, full_name, email, role, manager_id")
      .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"])
      .order("full_name");
  }
  const { data: profiles, error: profErr } = await profQuery;

  if (profErr) throw new Error("Profiles fetch failed: " + profErr.message);

  const allProfiles = profiles || [];
  const profileMap  = {};
  allProfiles.forEach(p => { profileMap[p.id] = p; });

  const [
    { data: leadsToday     },
    { data: leadsConverted },
    { data: otherNotesCandidates },
    { data: dealsCreated   },
    { data: dealsWon       },
    { data: dealsLost      },
    { data: actsTimeline   },
    { data: actsCompleted  },
    { data: actsPending    },
    { data: actsOverdue    },
    { data: actsFUPending  },
    { data: actsNextFU     },
    { data: meetingsToday  },
    { data: tasksCreated   },
    { data: tasksCompleted },
  ] = await Promise.all([

    supabase.from("leads")
      .select("id, stage, created_by, assigned_to, created_at, company_name, contact_name, source, email, phone, other_notes")
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    supabase.from("leads")
      .select("id, assigned_to, updated_at, company_name, contact_name")
      .eq("stage", "converted")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    // Candidates for Pipeline → Lead conversions. other_notes is populated for nearly every
    // lead (required contact info at creation), so it can't narrow the set on its own — instead
    // bound by updated_at, which the conversion endpoint always bumps to "now" at conversion
    // time. Only a LOWER bound is safe here: a later, unrelated edit only pushes updated_at
    // further into the future, never earlier, so this can't miss a same-day conversion even
    // when re-generating a report for a past date. The exact lead_created_at match (and date
    // range) is checked in JS below, since other_notes is stored double-JSON-encoded.
    supabase.from("leads")
      .select("id, created_by, assigned_to, company_name, contact_name, other_notes")
      .not("other_notes", "is", null)
      .gte("updated_at", dayStart),

    supabase.from("deals")
      .select("id, title, stage, value, created_by, assigned_to, created_at, company_name, contact_name, expected_close_date")
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    supabase.from("deals")
      .select("id, title, value, assigned_to, updated_at, company_name, contact_name")
      .eq("stage", "won")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    supabase.from("deals")
      .select("id, title, assigned_to, updated_at, company_name, value")
      .eq("stage", "lost")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    supabase.from("activities")
      .select("id, type, status, created_by, lead_id, deal_id, created_at, updated_at, description, note, due_date, lead:leads(company_name, contact_name), deal:deals(title, company_name)")
      .gte("created_at", dayStart).lte("created_at", dayEnd)
      .order("created_at"),

    supabase.from("activities")
      .select("id, type, created_by, updated_at")
      .in("status", ["done","completed"])
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    supabase.from("activities")
      .select("id, type, created_by, due_date, description, lead_id, lead:leads(company_name, contact_name)")
      .eq("status", "pending")
      .gte("due_date", dayStart).lte("due_date", dayEnd),

    supabase.from("activities")
      .select("id, type, created_by, due_date, description, lead_id, lead:leads(company_name, contact_name)")
      .eq("status", "pending")
      .lt("due_date", dayStart),

    supabase.from("activities")
      .select("id, type, created_by, due_date, lead_id, lead:leads(company_name, contact_name)")
      .in("type", [...FOLLOWUP_TYPES])
      .eq("status", "pending")
      .lte("due_date", dayEnd),

    supabase.from("activities")
      .select("id, type, created_by, due_date")
      .in("type", [...FOLLOWUP_TYPES])
      .eq("status", "pending")
      .gt("due_date", dayEnd),

    supabase.from("meetings")
      .select("id, title, customer_name, customer_email, customer_phone, company_name, start_time, end_time, status, meeting_type, meeting_link, location, notes, agenda, meeting_purpose, lead_id, created_by, lead:leads!lead_id(lead_code, company_name, contact_name)")
      .gte("start_time", dayStart).lte("start_time", dayEnd)
      .order("start_time"),

    supabase.from("tasks")
      .select("id, title, status, created_by, assigned_to, created_at, priority, description")
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    supabase.from("tasks")
      .select("id, assigned_to, updated_at, title")
      .eq("status", "done")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),
  ]);

  // Org-scope raw lists to this organization's members (profiles query is already scoped).
  if (orgId) {
    const memberIdSet = new Set(allProfiles.map((p) => p.id));
    const keep = (row) => memberIdSet.has(row.created_by) || memberIdSet.has(row.assigned_to);
    [leadsToday, leadsConverted, otherNotesCandidates, dealsCreated, dealsWon, dealsLost,
     actsTimeline, actsCompleted, actsPending, actsOverdue, actsFUPending, actsNextFU,
     meetingsToday, tasksCreated, tasksCompleted].forEach((arr) => {
      if (!Array.isArray(arr)) return;
      for (let i = arr.length - 1; i >= 0; i--) if (!keep(arr[i])) arr.splice(i, 1);
    });
  }

  const statsMap = {};
  allProfiles.forEach(p => { statsMap[p.id] = emptyStats(p); });

  const bump = (uid, field, by = 1) => {
    if (uid && statsMap[uid]) statsMap[uid][field] += by;
  };
  const trackLast = (uid, ts) => {
    if (!uid || !ts || !statsMap[uid]) return;
    if (!statsMap[uid].lastActivityAt || ts > statsMap[uid].lastActivityAt)
      statsMap[uid].lastActivityAt = ts;
  };

  // Leads / prospects
  (leadsToday || []).forEach(l => {
    const uid = l.created_by || l.assigned_to;
    if (!uid || !statsMap[uid]) return;
    const stage = (l.stage || "").toLowerCase();
    // A row counts as "Prospect Added" for its creation day if it's still a pipeline
    // record OR it was once one — proven by other_notes.lead_created_at, which is only
    // ever stamped by the pipeline→lead conversion flow (requires stage==='pipeline').
    // This keeps the count accurate even after the row is later converted to a lead.
    let wasPipeline = ["pipeline","prospect","awareness"].includes(stage);
    if (!wasPipeline && l.other_notes) wasPipeline = !!parseOtherNotes(l.other_notes).lead_created_at;
    if (wasPipeline) bump(uid, "prospectsAdded");
    else bump(uid, "leadsCreated");
    trackLast(uid, l.created_at);
    statsMap[uid].todayLeads.push({
      id: l.id, companyName: l.company_name || "—", contactName: l.contact_name || "—",
      source: l.source || "—", stage: l.stage || "—", createdAt: l.created_at, isConverted: false,
    });
  });

  // Pipeline → Lead conversions performed today (keyed by conversion date, not creation date)
  (otherNotesCandidates || []).forEach(l => {
    const convertedAt = parseOtherNotes(l.other_notes).lead_created_at;
    if (!convertedAt || convertedAt < dayStart || convertedAt > dayEnd) return;
    const uid = l.created_by || l.assigned_to;
    if (!uid || !statsMap[uid]) return;
    bump(uid, "newLeadsFromPipeline");
  });

  (leadsConverted || []).forEach(l => {
    const uid = l.assigned_to;
    bump(uid, "leadsConverted");
    if (uid && statsMap[uid]) {
      const existing = statsMap[uid].todayLeads.find(x => x.id === l.id);
      if (existing) existing.isConverted = true;
      else statsMap[uid].todayLeads.push({
        id: l.id, companyName: l.company_name || "—", contactName: l.contact_name || "—",
        source: "—", stage: "converted", createdAt: l.updated_at, isConverted: true,
      });
    }
  });

  // Deals
  (dealsCreated || []).forEach(d => {
    const uid = d.created_by || d.assigned_to;
    bump(uid, "dealsCreated");
    trackLast(uid, d.created_at);
    if (uid && statsMap[uid]) {
      statsMap[uid].todayDeals.push({
        id: d.id, name: d.title || "—", companyName: d.company_name || "—",
        contactName: d.contact_name || "—", value: Number(d.value) || 0,
        stage: d.stage || "—", expectedClose: d.expected_close_date,
        status: "active", createdAt: d.created_at,
      });
    }
  });

  (dealsWon || []).forEach(d => {
    bump(d.assigned_to, "dealsWon");
    bump(d.assigned_to, "revenue", Number(d.value) || 0);
    if (d.assigned_to && statsMap[d.assigned_to]) {
      const ex = statsMap[d.assigned_to].todayDeals.find(x => x.id === d.id);
      if (ex) ex.status = "won";
      else statsMap[d.assigned_to].todayDeals.push({
        id: d.id, name: d.title || "—", companyName: d.company_name || "—",
        value: Number(d.value) || 0, stage: "won", status: "won", createdAt: d.updated_at,
      });
    }
  });

  (dealsLost || []).forEach(d => {
    bump(d.assigned_to, "dealsLost");
    if (d.assigned_to && statsMap[d.assigned_to]) {
      const ex = statsMap[d.assigned_to].todayDeals.find(x => x.id === d.id);
      if (ex) ex.status = "lost";
    }
  });

  // Activity timeline
  (actsTimeline || []).forEach(a => {
    const uid = a.created_by;
    if (!uid || !statsMap[uid]) return;
    const t = (a.type || "").toLowerCase();
    const companyName = a.lead?.company_name || a.deal?.company_name || "—";
    const contactName = a.lead?.contact_name || "—";
    const dealName    = a.deal?.title || "—";

    if (CALL_TYPES.has(t))     bump(uid, "callsMade");
    if (EMAIL_TYPES.has(t))    bump(uid, "emailsSent");
    if (NOTE_TYPES.has(t))     bump(uid, "notesAdded");
    if (FOLLOWUP_TYPES.has(t) && (a.status === "done" || a.status === "completed"))
      bump(uid, "followUpsCompleted");

    trackLast(uid, a.created_at);

    statsMap[uid].activityTimeline.push({
      time: a.created_at, type: a.type || "activity", status: a.status || "—",
      description: a.description || a.note || "—", outcome: a.outcome || "—",
      companyName, contactName, dealName, leadId: a.lead_id, dealId: a.deal_id, dueDate: a.due_date,
    });

    if (NOTE_TYPES.has(t)) {
      statsMap[uid].todayNotes.push({
        time: a.created_at, description: a.description || a.note || "—",
        companyName, contactName,
      });
    }
  });

  (actsCompleted || []).forEach(a => { bump(a.created_by, "activitiesCompleted"); });

  (actsPending || []).forEach(a => {
    bump(a.created_by, "activitiesPending");
    if (a.created_by && statsMap[a.created_by]) {
      statsMap[a.created_by].pendingActivities.push({
        id: a.id, type: a.type, dueDate: a.due_date,
        companyName: a.lead?.company_name || "—",
        contactName: a.lead?.contact_name || "—",
        description: a.description || "—",
      });
    }
  });

  (actsOverdue || []).forEach(a => {
    bump(a.created_by, "activitiesOverdue");
    if (a.created_by && statsMap[a.created_by]) {
      const daysOverdue = a.due_date
        ? Math.max(0, Math.floor((new Date(dayStart) - new Date(a.due_date)) / 86400000))
        : 0;
      statsMap[a.created_by].overdueActivities.push({
        id: a.id, type: a.type, dueDate: a.due_date, daysOverdue,
        companyName: a.lead?.company_name || "—",
        contactName: a.lead?.contact_name || "—",
        description: a.description || "—",
      });
    }
  });

  (actsFUPending || []).forEach(a => {
    bump(a.created_by, "followUpsPending");
    if (a.created_by && statsMap[a.created_by]) {
      statsMap[a.created_by].todayFollowUps.push({
        id: a.id, type: a.type, dueDate: a.due_date,
        companyName: a.lead?.company_name || "—",
        contactName: a.lead?.contact_name || "—",
        status: "pending",
      });
    }
  });

  (actsNextFU || []).forEach(a => { bump(a.created_by, "nextFollowUps"); });

  (meetingsToday || []).forEach(m => {
    const uid = m.created_by;
    bump(uid, "meetingsScheduled");
    if ((m.status === "completed" || m.status === "done") && uid) bump(uid, "meetingsCompleted");
    trackLast(uid, m.start_time);
  });

  (tasksCreated   || []).forEach(t => { bump(t.created_by || t.assigned_to, "tasksCreated"); });
  (tasksCompleted || []).forEach(t => { bump(t.assigned_to, "tasksCompleted"); });

  return { date: todayStr, allProfiles, profileMap, statsMap, meetings: meetingsToday || [] };
}

function getScopeProfiles(recipient, allProfiles) {
  const { id, role } = recipient;
  if (role === "owner") return allProfiles;
  if (role === "sales_head") {
    const l1 = new Set(allProfiles.filter(p => p.manager_id === id).map(p => p.id));
    const l2 = new Set(allProfiles.filter(p => l1.has(p.manager_id)).map(p => p.id));
    const all = new Set([id, ...l1, ...l2]);
    return allProfiles.filter(p => all.has(p.id));
  }
  if (role === "sales_manager") {
    const direct = new Set(allProfiles.filter(p => p.manager_id === id).map(p => p.id));
    return allProfiles.filter(p => p.id === id || direct.has(p.id));
  }
  return allProfiles.filter(p => p.id === id);
}

function calcScopeTotals(scopeProfiles, statsMap) {
  const ADDITIVE = [
    "prospectsAdded","leadsCreated","newLeadsFromPipeline","dealsCreated","activitiesCompleted",
    "activitiesPending","activitiesOverdue","callsMade","emailsSent",
    "meetingsScheduled","meetingsCompleted","tasksCreated","tasksCompleted",
    "followUpsCompleted","followUpsPending","nextFollowUps",
    "leadsConverted","dealsWon","dealsLost","revenue","notesAdded",
  ];
  const t = {};
  ADDITIVE.forEach(k => { t[k] = 0; });
  const ids = new Set(scopeProfiles.map(p => p.id));
  for (const [uid, s] of Object.entries(statsMap)) {
    if (!ids.has(uid)) continue;
    ADDITIVE.forEach(k => { t[k] += s[k] || 0; });
  }
  return t;
}

module.exports = { collectDsrData, getScopeProfiles, calcScopeTotals };
