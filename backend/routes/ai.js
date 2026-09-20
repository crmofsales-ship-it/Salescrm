const express = require("express");
const router  = express.Router();
const Groq    = require("groq-sdk");
const { supabase }     = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { withOrg } = require("../middleware/orgContext");

// ── Document RAG: search uploaded project docs ────────────────────────────────
async function searchDocuments(query) {
  try {
    const { count } = await supabase
      .from("ai_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready");
    if (!count || count === 0) return null;

    const { data, error } = await supabase.rpc("search_document_chunks", {
      query_text:  query,
      match_count: 5,
    });
    if (error || !data?.length) return null;

    return data
      .map((c) => `[Source: ${c.document_name}]\n${c.content}`)
      .join("\n\n---\n\n");
  } catch {
    return null;
  }
}

const GROQ_MODEL      = "llama-3.3-70b-versatile";
const MAX_ITERATIONS  = 8;

// Per-user conversation history (in-memory; resets on cold start)
const conversationHistory = {};

// ── Release Notes (version history) ──────────────────────────────────────────
const RELEASE_NOTES = [
  {
    version: "2.4.0",
    date: "June 2026",
    highlights: [
      "SALES CRM ASSISTANT upgraded with 11 modes: CRM Assistant, Sales Copilot, Meeting Assistant, Email Assistant, Analytics, Lead Qualification, Workflow, Release Notes, AI Recommendations, Content Generator, CRM Help",
      "New Prompt Library — save and reuse your favorite prompts",
      "AI Insights panel in right sidebar with live pipeline stats",
      "Voice AI: continuous listening, Hindi/Hinglish support, auto-submit on 3.5s silence",
      "Global CRM Search across leads, prospects, deals, meetings, contacts in one query",
      "AI Recommendations engine — best next actions, lead priority, risk alerts",
      "File AI: PDF, DOCX, XLSX, CSV upload and Q&A",
      "Image AI: visiting card scan, OCR, contact extraction",
      "New write actions: create prospect, schedule meeting, update lead stage, convert lead",
    ],
  },
  {
    version: "2.3.0",
    date: "May 2026",
    highlights: [
      "In-CRM email composer — send Gmail emails directly from leads, deals, and contacts",
      "Gmail activity sync — all sent/received emails appear in activity log",
      "Role-based Daily Sales Report (DSR) emails — automated daily dispatch",
      "Comprehensive inactivity alerts for managers",
      "AI document indexing — upload PDFs and ask questions from them",
    ],
  },
  {
    version: "2.2.0",
    date: "April 2026",
    highlights: [
      "SALES CRM ASSISTANT rebuilt from scratch with full agentic UI and streaming responses",
      "Pipeline module with Kanban view and drag-and-drop stage updates",
      "Deal detail panel with activity timeline",
      "Lead-to-deal conversion flow",
      "Security audit log with role-based visibility",
    ],
  },
  {
    version: "2.1.0",
    date: "March 2026",
    highlights: [
      "Voice AI assistant with Text-to-Speech and Speech-to-Text",
      "Meeting scheduler with Google Calendar-style UI",
      "Targets and KPI tracking module",
      "Analytics dashboard with revenue trends and employee performance",
      "Dark mode support across all modules",
    ],
  },
];

// ── Tool definitions ──────────────────────────────────────────────────────────
const CRM_TOOLS = [
  // ── READ tools ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_leads",
      description: "Query live leads from the CRM. Use whenever the user asks about leads, hot leads, follow-ups, pipeline contacts, or specific companies.",
      parameters: {
        type: "object",
        properties: {
          temperature:   { type: "string", enum: ["hot", "warm", "cold"], description: "Filter by temperature" },
          stage:         { type: "string", description: "Filter by stage: new, contacted, qualified, proposal, negotiation, won, lost" },
          follow_up_due: { type: "boolean", description: "Only leads with follow-up due in next 3 days" },
          search:        { type: "string", description: "Search by contact name or company name" },
          limit:         { type: "number", description: "Max results (default 20, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_prospects",
      description: "Query prospects (companies/contacts being prospected before becoming leads). Use for prospecting pipeline, new prospects, or outreach questions.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status: new, contacted, qualified, converted, lost" },
          search: { type: "string", description: "Search by name or company" },
          limit:  { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deals",
      description: "Query live deals. Use for pipeline value, stale deals, open deals, won revenue, or deal-specific questions.",
      parameters: {
        type: "object",
        properties: {
          stage:      { type: "string", description: "Filter by stage: prospecting, qualification, proposal, negotiation, won, lost" },
          stale_days: { type: "number", description: "Only deals not updated in N days" },
          search:     { type: "string", description: "Search by title or company name" },
          limit:      { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tasks",
      description: "Get pending or overdue tasks.",
      parameters: {
        type: "object",
        properties: {
          overdue_only: { type: "boolean", description: "Only tasks past their due date" },
          priority:     { type: "string", enum: ["high", "medium", "low"], description: "Filter by priority" },
          limit:        { type: "number", description: "Max results (default 15)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activities",
      description: "Get recent sales activities — calls, emails, meetings, demos, notes.",
      parameters: {
        type: "object",
        properties: {
          type:  { type: "string", description: "Filter by type: call, email, meeting, demo, note" },
          limit: { type: "number", description: "Max results (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_meetings",
      description: "Query scheduled meetings — upcoming, past, or by status. Use for meeting prep, today's meetings, or meeting history.",
      parameters: {
        type: "object",
        properties: {
          status:   { type: "string", description: "Filter by status: scheduled, completed, cancelled" },
          upcoming: { type: "boolean", description: "Only future meetings" },
          today:    { type: "boolean", description: "Only today's meetings" },
          limit:    { type: "number", description: "Max results (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description: "Full pipeline stats: stage counts, temperature breakdown, total pipeline value, won revenue, stale deal count, avg AI score. Use for summary or forecast questions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics_summary",
      description: "Comprehensive analytics: revenue trends, conversion rates, employee performance, lead sources, monthly breakdown. Use for analytics questions, reports, or KPIs.",
      parameters: {
        type: "object",
        properties: {
          period_months: { type: "number", description: "Number of months to include (default 6, max 12)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_crm",
      description: "Global search across ALL CRM modules simultaneously: leads, prospects, deals, meetings, and activities. Use when the user searches for a company, person, or topic without specifying a module.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term (company name, contact name, keyword)" },
          limit: { type: "number", description: "Max results per module (default 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_recommendations",
      description: "Generate AI recommendations: top priority leads to call today, deals at risk, employees with low activity, best follow-up targets, pipeline health score. Use for 'what should I do today?' or 'best next action' questions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_release_notes",
      description: "Return Sales CRM version history, release notes, new features, and bug fixes. Use when user asks 'what's new', 'latest updates', 'version history', or 'upcoming features'.",
      parameters: {
        type: "object",
        properties: {
          version: { type: "string", description: "Specific version number (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_performance",
      description: "Team member performance summary: leads assigned, deals won, activities logged, conversion rates. Use for employee performance or team reports.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max team members to return (default 10)" },
        },
      },
    },
  },

  // ── WRITE TOOLS ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_lead",
      description: "Create a new lead in the CRM. Use when user asks to add a new prospect, company, or contact as a lead. Always search first to avoid duplicates.",
      parameters: {
        type: "object",
        properties: {
          company_name:  { type: "string", description: "Company name" },
          contact_name:  { type: "string", description: "Contact person's full name" },
          phone:         { type: "string", description: "Phone number" },
          email:         { type: "string", description: "Email address" },
          source:        { type: "string", description: "Lead source: website, linkedin, referral, cold_call, email_campaign, event, partner, social_media, ads, walk_in, other" },
          temperature:   { type: "string", enum: ["hot", "warm", "cold"], description: "Lead temperature" },
          stage:         { type: "string", description: "Stage: new, contacted, qualified, proposal, negotiation (default: new)" },
          budget:        { type: "number", description: "Budget amount in INR (optional)" },
          remarks:       { type: "string", description: "Additional notes or context" },
        },
        required: ["company_name", "contact_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead",
      description: "Update an existing lead's details, stage, follow-up date, remarks, or temperature. Always search for the lead first to get the lead_id.",
      parameters: {
        type: "object",
        properties: {
          lead_id:        { type: "string", description: "Lead UUID (required)" },
          stage:          { type: "string", description: "New stage: new, contacted, qualified, proposal, negotiation, won, lost" },
          temperature:    { type: "string", enum: ["hot", "warm", "cold"] },
          follow_up_date: { type: "string", description: "Next follow-up date (YYYY-MM-DD)" },
          remarks:        { type: "string", description: "Updated remarks or notes" },
          priority:       { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["lead_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_lead",
      description: "Assign or reassign a lead to a team member. Requires manager role. Always search for the lead first.",
      parameters: {
        type: "object",
        properties: {
          lead_id:       { type: "string", description: "Lead UUID" },
          employee_name: { type: "string", description: "Team member's name to assign to" },
        },
        required: ["lead_id", "employee_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead_stage",
      description: "Move a lead to a new pipeline stage and optionally log a note about the stage change.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "Lead UUID" },
          stage:   { type: "string", description: "New stage: new, contacted, qualified, proposal, negotiation, won, lost" },
          note:    { type: "string", description: "Optional note about why the stage changed" },
        },
        required: ["lead_id", "stage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_activity",
      description: "Log a sales activity — call, meeting, email, note, follow-up, demo, visit, WhatsApp message. Always log an activity after the AI interacts with or reports on a lead or deal.",
      parameters: {
        type: "object",
        properties: {
          type:     { type: "string", description: "Activity type: call, email, note, meeting_person, meeting_virtual, follow_up_call, follow_up_email, whatsapp, task, visit, demo" },
          title:    { type: "string", description: "Short activity title (e.g. 'Follow-up Call with Anjani Kumar')" },
          note:     { type: "string", description: "Detailed notes about the activity outcome" },
          lead_id:  { type: "string", description: "Lead UUID to link this activity to (optional)" },
          deal_id:  { type: "string", description: "Deal UUID to link (optional)" },
          due_date: { type: "string", description: "Due/scheduled date-time ISO 8601 (set for future activities)" },
          status:   { type: "string", enum: ["todo", "done"], description: "todo for scheduled/future, done for past/completed. Notes should always be done." },
        },
        required: ["type", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_follow_up",
      description: "Schedule a follow-up activity for a lead. Use when the user says 'schedule follow-up', 'remind me', 'add follow-up for X days'.",
      parameters: {
        type: "object",
        properties: {
          lead_id:        { type: "string", description: "Lead UUID (optional)" },
          follow_up_date: { type: "string", description: "Follow-up date (YYYY-MM-DD)" },
          follow_up_time: { type: "string", description: "Follow-up time in 24h format (HH:MM, optional — default 10:00)" },
          note:           { type: "string", description: "What the follow-up is about" },
          type:           { type: "string", enum: ["follow_up_call", "follow_up_email", "whatsapp", "meeting_person", "meeting_virtual"], description: "Type of follow-up" },
        },
        required: ["follow_up_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_meeting",
      description: "Schedule a new meeting. Use for formal meetings with clients, demos, review calls.",
      parameters: {
        type: "object",
        properties: {
          title:        { type: "string", description: "Meeting title" },
          company_name: { type: "string", description: "Company name" },
          contact_name: { type: "string", description: "Contact person's name" },
          scheduled_at: { type: "string", description: "Date and time ISO 8601 (YYYY-MM-DDTHH:MM:SS)" },
          location:     { type: "string", description: "Physical location or video link (optional)" },
          agenda:       { type: "string", description: "Meeting agenda or purpose (optional)" },
          lead_id:      { type: "string", description: "Related lead UUID (optional)" },
        },
        required: ["title", "scheduled_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task or reminder in the CRM.",
      parameters: {
        type: "object",
        properties: {
          title:       { type: "string", description: "Task title" },
          description: { type: "string", description: "Detailed task description (optional)" },
          priority:    { type: "string", enum: ["high", "medium", "low"], description: "Task priority (default medium)" },
          due_date:    { type: "string", description: "Due date (YYYY-MM-DD)" },
          lead_id:     { type: "string", description: "Related lead UUID (optional)" },
        },
        required: ["title", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_deal",
      description: "Create a new deal in the CRM pipeline.",
      parameters: {
        type: "object",
        properties: {
          title:        { type: "string", description: "Deal title/name" },
          company_name: { type: "string", description: "Company name" },
          contact_name: { type: "string", description: "Contact person's name (optional)" },
          value:        { type: "number", description: "Deal value in INR (optional)" },
          stage:        { type: "string", description: "Deal stage: prospecting, qualification, proposal, negotiation, won, lost (default: prospecting)" },
          close_date:   { type: "string", description: "Expected close date YYYY-MM-DD (optional)" },
          description:  { type: "string", description: "Deal notes or description (optional)" },
        },
        required: ["title", "company_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal",
      description: "Update an existing deal — stage, value, close date, or notes. Always get the deal_id via get_deals or search_crm first.",
      parameters: {
        type: "object",
        properties: {
          deal_id:     { type: "string", description: "Deal UUID" },
          stage:       { type: "string", description: "New stage" },
          value:       { type: "number", description: "Updated deal value in INR" },
          close_date:  { type: "string", description: "New expected close date (YYYY-MM-DD)" },
          description: { type: "string", description: "Updated notes" },
        },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Compose a professional email to a CRM contact. ALWAYS use this tool when user asks to send an email — it creates a draft for the user to review and confirm before sending. Never write email bodies in plain text — always use this tool.",
      parameters: {
        type: "object",
        properties: {
          to_name:    { type: "string", description: "Recipient's full name" },
          to_email:   { type: "string", description: "Recipient's email address (if known)" },
          to_company: { type: "string", description: "Recipient's company name" },
          subject:    { type: "string", description: "Email subject line" },
          body:       { type: "string", description: "Full email body — professional, formatted, signed from the user's name" },
          lead_id:    { type: "string", description: "Related lead UUID for activity logging (optional)" },
        },
        required: ["to_name", "subject", "body"],
      },
    },
  },
];

// ── Tool executors ────────────────────────────────────────────────────────────
async function executeTool(name, args, ctx) {
  const { profile, db, organizationId, orgRole } = ctx;
  const isManager = ["owner","admin","sales_manager"].includes(orgRole);
  const uid = profile.id;

  // ── get_leads ──────────────────────────────────────────────────────────────
  if (name === "get_leads") {
    let q = supabase
      .from("leads")
      .select("id, contact_name, company_name, stage, temperature, priority, follow_up_date, remarks, ai_score, source, phone, email")
      .order("created_at", { ascending: false })
      .limit(Math.min(args.limit || 20, 50));

    if (!isManager) q = q.eq("assigned_to", uid);
    if (args.temperature) q = q.eq("temperature", args.temperature);
    if (args.stage)       q = q.eq("stage", args.stage);
    if (args.search)      q = q.or(`contact_name.ilike.%${args.search}%,company_name.ilike.%${args.search}%`);
    if (args.follow_up_due) {
      const today = new Date().toISOString().slice(0, 10);
      const in3   = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      q = q.gte("follow_up_date", today).lte("follow_up_date", in3);
    }
    const { data, error } = await q;
    return error ? { error: error.message } : { leads: data || [], count: (data || []).length };
  }

  // ── get_prospects ──────────────────────────────────────────────────────────
  if (name === "get_prospects") {
    let q = supabase
      .from("prospects")
      .select("id, contact_name, company_name, status, source, phone, email, created_at, remarks")
      .order("created_at", { ascending: false })
      .limit(args.limit || 20);

    if (!isManager) q = q.eq("assigned_to", uid);
    if (args.status) q = q.eq("status", args.status);
    if (args.search) q = q.or(`contact_name.ilike.%${args.search}%,company_name.ilike.%${args.search}%`);
    const { data, error } = await q;
    return error ? { error: error.message } : { prospects: data || [], count: (data || []).length };
  }

  // ── get_deals ──────────────────────────────────────────────────────────────
  if (name === "get_deals") {
    let q = supabase
      .from("deals")
      .select("id, title, company_name, stage, value, close_date, updated_at, assigned_to")
      .order("updated_at", { ascending: false })
      .limit(args.limit || 20);

    if (!isManager) q = q.eq("assigned_to", uid);
    if (args.stage)  q = q.eq("stage", args.stage);
    if (args.search) q = q.or(`title.ilike.%${args.search}%,company_name.ilike.%${args.search}%`);
    if (args.stale_days) {
      const cutoff = new Date(Date.now() - args.stale_days * 86400000).toISOString();
      q = q.lt("updated_at", cutoff).not("stage", "in", '("won","lost")');
    }
    const { data, error } = await q;
    return error ? { error: error.message } : { deals: data || [], count: (data || []).length };
  }

  // ── get_tasks ──────────────────────────────────────────────────────────────
  if (name === "get_tasks") {
    let q = supabase
      .from("tasks")
      .select("id, title, status, priority, due_date")
      .not("status", "in", '("done","cancelled")')
      .order("due_date", { ascending: true })
      .limit(args.limit || 15);

    if (args.priority)    q = q.eq("priority", args.priority);
    if (args.overdue_only) q = q.lt("due_date", new Date().toISOString().slice(0, 10));
    const { data, error } = await q;
    return error ? { error: error.message } : { tasks: data || [], count: (data || []).length };
  }

  // ── get_activities ──────────────────────────────────────────────────────────
  if (name === "get_activities") {
    let q = supabase
      .from("activities")
      .select("id, type, title, note, created_at")
      .order("created_at", { ascending: false })
      .limit(args.limit || 10);

    if (args.type) q = q.eq("type", args.type);
    const { data, error } = await q;
    return error ? { error: error.message } : { activities: data || [], count: (data || []).length };
  }

  // ── get_meetings ────────────────────────────────────────────────────────────
  if (name === "get_meetings") {
    let q = supabase
      .from("meetings")
      .select("id, title, company_name, contact_name, scheduled_at, status, location, notes")
      .order("scheduled_at", { ascending: true })
      .limit(args.limit || 10);

    if (!isManager) q = q.eq("created_by", uid);
    if (args.status) q = q.eq("status", args.status);
    if (args.upcoming) q = q.gte("scheduled_at", new Date().toISOString());
    if (args.today) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end   = new Date(); end.setHours(23, 59, 59, 999);
      q = q.gte("scheduled_at", start.toISOString()).lte("scheduled_at", end.toISOString());
    }
    const { data, error } = await q;
    return error ? { error: error.message } : { meetings: data || [], count: (data || []).length };
  }

  // ── get_pipeline_summary ────────────────────────────────────────────────────
  if (name === "get_pipeline_summary") {
    const [lr, dr] = await Promise.all([
      db.from("leads").select("stage, temperature, ai_score"),
      db.from("deals").select("stage, value, updated_at"),
    ]);
    const leads = lr.data || [];
    const deals = dr.data || [];
    const open  = deals.filter((d) => !["won", "lost"].includes(d.stage));
    const won   = deals.filter((d) => d.stage === "won");
    const stale = open.filter((d) => d.updated_at < new Date(Date.now() - 7 * 86400000).toISOString());
    return {
      totalLeads:    leads.length,
      stageCounts:   leads.reduce((a, l) => { a[l.stage] = (a[l.stage] || 0) + 1; return a; }, {}),
      tempCounts:    leads.reduce((a, l) => { a[l.temperature] = (a[l.temperature] || 0) + 1; return a; }, {}),
      avgAiScore:    leads.length ? Math.round(leads.reduce((s, l) => s + (l.ai_score || 0), 0) / leads.length) : 0,
      openDeals:     open.length,
      pipelineValue: open.reduce((s, d) => s + (Number(d.value) || 0), 0),
      wonRevenue:    won.reduce((s, d) => s + (Number(d.value) || 0), 0),
      staleDeals:    stale.length,
    };
  }

  // ── get_analytics_summary ───────────────────────────────────────────────────
  if (name === "get_analytics_summary") {
    const months = Math.min(args.period_months || 6, 12);
    const since  = new Date(Date.now() - months * 30 * 86400000).toISOString();
    const [lr, dr, ar, pr] = await Promise.all([
      db.from("leads").select("stage, temperature, source, ai_score, created_at, assigned_to"),
      db.from("deals").select("stage, value, created_at, assigned_to"),
      db.from("activities").select("type, created_by, created_at").gte("created_at", since),
      db.from("profiles").select("id, full_name, role").eq("status", "active"),
    ]);
    const leads = lr.data || [];
    const deals = dr.data || [];
    const acts  = ar.data || [];
    const profs = pr.data || [];

    const won  = deals.filter(d => d.stage === "won");
    const open = deals.filter(d => !["won","lost"].includes(d.stage));

    const bySource = leads.reduce((a,l) => { if(l.source) a[l.source]=(a[l.source]||0)+1; return a; }, {});
    const topSource = Object.entries(bySource).sort((a,b)=>b[1]-a[1])[0];

    const salesTeam = profs.filter(p => ["sales_rep","sales_manager"].includes(p.role));
    const teamPerf = salesTeam.map(p => {
      const myLeads = leads.filter(l=>l.assigned_to===p.id);
      const myWon   = deals.filter(d=>d.assigned_to===p.id&&d.stage==="won");
      const myActs  = acts.filter(a=>a.created_by===p.id);
      return { name:p.full_name, leads:myLeads.length, won:myWon.length, revenue:myWon.reduce((s,d)=>s+(Number(d.value)||0),0), activities:myActs.length };
    }).sort((a,b)=>b.revenue-a.revenue);

    return {
      period: `Last ${months} months`,
      totalLeads: leads.length,
      hotLeads: leads.filter(l=>l.temperature==="hot").length,
      warmLeads: leads.filter(l=>l.temperature==="warm").length,
      coldLeads: leads.filter(l=>l.temperature==="cold").length,
      totalDeals: deals.length,
      openDeals: open.length,
      wonDeals: won.length,
      lostDeals: deals.filter(d=>d.stage==="lost").length,
      wonRevenue: won.reduce((s,d)=>s+(Number(d.value)||0),0),
      pipelineValue: open.reduce((s,d)=>s+(Number(d.value)||0),0),
      conversionRate: leads.length>0?((won.length/leads.length)*100).toFixed(1)+"%" : "0%",
      avgAiScore: leads.length?Math.round(leads.reduce((s,l)=>s+(l.ai_score||0),0)/leads.length):0,
      topLeadSource: topSource?`${topSource[0]} (${topSource[1]} leads)`:"N/A",
      leadsBySource: bySource,
      topPerformers: teamPerf.slice(0,5),
      totalActivities: acts.length,
      activityBreakdown: acts.reduce((a,x)=>{a[x.type]=(a[x.type]||0)+1;return a;},{}),
    };
  }

  // ── search_crm ──────────────────────────────────────────────────────────────
  if (name === "search_crm") {
    const q    = args.query || "";
    const lim  = args.limit || 5;
    const like = `%${q}%`;

    const [lr, pr, dr, mr] = await Promise.all([
      db.from("leads").select("id,contact_name,company_name,stage,temperature").or(`contact_name.ilike.${like},company_name.ilike.${like}`).limit(lim),
      db.from("prospects").select("id,contact_name,company_name,status").or(`contact_name.ilike.${like},company_name.ilike.${like}`).limit(lim),
      db.from("deals").select("id,title,company_name,stage,value").or(`title.ilike.${like},company_name.ilike.${like}`).limit(lim),
      db.from("meetings").select("id,title,company_name,contact_name,scheduled_at,status").or(`title.ilike.${like},company_name.ilike.${like},contact_name.ilike.${like}`).limit(lim),
    ]);

    const results = {
      query: q,
      leads:     lr.data || [],
      prospects: pr.data || [],
      deals:     dr.data || [],
      meetings:  mr.data || [],
      totalFound: (lr.data?.length||0)+(pr.data?.length||0)+(dr.data?.length||0)+(mr.data?.length||0),
    };
    return results;
  }

  // ── get_ai_recommendations ──────────────────────────────────────────────────
  if (name === "get_ai_recommendations") {
    const today = new Date().toISOString().slice(0,10);
    const [hotR, overdueR, staleR, meetR] = await Promise.all([
      db.from("leads").select("id,contact_name,company_name,temperature,stage,follow_up_date,ai_score").eq("temperature","hot").order("ai_score",{ascending:false}).limit(5),
      db.from("leads").select("id,contact_name,company_name,follow_up_date,stage").lt("follow_up_date",today).not("stage","in",'("won","lost","converted","pipeline")').limit(5),
      db.from("deals").select("id,title,company_name,stage,value,updated_at").not("stage","in",'("won","lost")').lt("updated_at",new Date(Date.now()-7*86400000).toISOString()).limit(5),
      db.from("meetings").select("id,title,company_name,scheduled_at").eq("status","scheduled").gte("scheduled_at",new Date().toISOString()).order("scheduled_at",{ascending:true}).limit(3),
    ]);
    return {
      priorityLeads:    hotR.data || [],
      overdueFollowUps: overdueR.data || [],
      staleDeals:       staleR.data || [],
      upcomingMeetings: meetR.data || [],
      recommendations: [
        hotR.data?.length   ? `Call ${hotR.data.length} hot lead(s) today — highest conversion probability` : null,
        overdueR.data?.length ? `${overdueR.data.length} follow-up(s) are overdue — action needed immediately` : null,
        staleR.data?.length ? `${staleR.data.length} deal(s) haven't been updated in 7+ days — re-engage now` : null,
        meetR.data?.length  ? `${meetR.data.length} meeting(s) coming up — prepare talking points` : null,
      ].filter(Boolean),
    };
  }

  // ── get_release_notes ───────────────────────────────────────────────────────
  if (name === "get_release_notes") {
    if (args.version) {
      const note = RELEASE_NOTES.find(n => n.version === args.version);
      return note || { error: `Version ${args.version} not found` };
    }
    return { releaseNotes: RELEASE_NOTES, latestVersion: RELEASE_NOTES[0].version };
  }

  // ── get_team_performance ────────────────────────────────────────────────────
  if (name === "get_team_performance") {
    const [pr, lr, dr, ar] = await Promise.all([
      db.from("profiles").select("id,full_name,role,avatar_url").eq("status","active").in("role",["sales_rep","sales_manager"]),
      db.from("leads").select("assigned_to,stage,ai_score"),
      db.from("deals").select("assigned_to,stage,value"),
      db.from("activities").select("created_by,type").gte("created_at",new Date(Date.now()-30*86400000).toISOString()),
    ]);
    const profs = (pr.data||[]).slice(0, args.limit||10);
    const perf  = profs.map(p => {
      const myL   = (lr.data||[]).filter(l=>l.assigned_to===p.id);
      const myWon = (dr.data||[]).filter(d=>d.assigned_to===p.id&&d.stage==="won");
      const myA   = (ar.data||[]).filter(a=>a.created_by===p.id);
      return {
        name:       p.full_name,
        role:       p.role,
        leads:      myL.length,
        won:        myWon.length,
        revenue:    myWon.reduce((s,d)=>s+(Number(d.value)||0),0),
        activities: myA.length,
        avgScore:   myL.length?Math.round(myL.reduce((s,l)=>s+(l.ai_score||0),0)/myL.length):0,
        conversion: myL.length>0?((myWon.length/myL.length)*100).toFixed(1)+"%":"0%",
      };
    }).sort((a,b)=>b.revenue-a.revenue);
    return { team: perf, count: perf.length };
  }

  // ── create_lead ──────────────────────────────────────────────────────────────
  if (name === "create_lead") {
    const payload = {
      company_name: args.company_name,
      contact_name: args.contact_name,
      phone:        args.phone || null,
      email:        args.email || null,
      source:       args.source || "other",
      temperature:  args.temperature || "warm",
      stage:        args.stage || "new",
      budget:       args.budget || null,
      remarks:      args.remarks || null,
      assigned_to:  uid,
      created_by:   uid,
      status:       "active",
    };
    payload.organization_id = organizationId;
    const { data, error } = await db.from("leads").insert(payload).select().single();
    if (error) return { error: error.message };
    return { success: true, lead: { id: data.id, lead_code: data.lead_code, company_name: data.company_name, contact_name: data.contact_name, stage: data.stage }, message: `Lead created: ${data.company_name} (${data.lead_code})` };
  }

  // ── update_lead ──────────────────────────────────────────────────────────────
  if (name === "update_lead") {
    const updates = {};
    if (args.stage)          updates.stage          = args.stage;
    if (args.temperature)    updates.temperature    = args.temperature;
    if (args.follow_up_date) updates.follow_up_date = args.follow_up_date;
    if (args.remarks)        updates.remarks        = args.remarks;
    if (args.priority)       updates.priority       = args.priority;
    if (Object.keys(updates).length === 0) return { error: "No fields to update." };
    updates.updated_at = new Date().toISOString();
    const { data, error } = await db.from("leads").update(updates).eq("id", args.lead_id).select("id, company_name, contact_name, stage, temperature").single();
    if (error) return { error: error.message };
    return { success: true, lead: data, message: `Lead updated: ${data.company_name}` };
  }

  // ── assign_lead ──────────────────────────────────────────────────────────────
  if (name === "assign_lead") {
    if (!isManager) return { error: "Only managers and above can reassign leads." };
    const { data: employees } = await db.from("profiles").select("id, full_name, role").ilike("full_name", `%${args.employee_name}%`).limit(5);
    if (!employees?.length) return { error: `No employee found matching: ${args.employee_name}` };
    const employee = employees[0];
    const { data, error } = await db.from("leads").update({ assigned_to: employee.id, updated_at: new Date().toISOString() }).eq("id", args.lead_id).select("id, company_name").single();
    if (error) return { error: error.message };
    return { success: true, message: `Lead "${data.company_name}" assigned to ${employee.full_name}`, lead: data };
  }

  // ── update_lead_stage ────────────────────────────────────────────────────────
  if (name === "update_lead_stage") {
    const { data, error } = await db.from("leads").update({ stage: args.stage, updated_at: new Date().toISOString() }).eq("id", args.lead_id).select("id, company_name, stage").single();
    if (error) return { error: error.message };
    await db.from("activities").insert({
      organization_id: organizationId,
      type: "stage_change", title: `Stage changed to ${args.stage}`,
      description: JSON.stringify({ remarks: args.note || `Stage updated to ${args.stage}` }),
      lead_id: args.lead_id, created_by: uid, status: "done",
      metadata: { to_stage: args.stage, note: args.note || null },
    });
    return { success: true, message: `"${data.company_name}" stage updated to ${args.stage}`, lead: data };
  }

  // ── create_activity ──────────────────────────────────────────────────────────
  if (name === "create_activity") {
    const autoCompleted = ["note", "email_sent", "stage_change", "email_contact"];
    const payload = {
      type:         args.type || "note",
      title:        args.title,
      description:  JSON.stringify({ remarks: args.note || args.title }),
      lead_id:      args.lead_id   || null,
      deal_id:      args.deal_id   || null,
      due_date:     args.due_date  || null,
      status:       args.status || (autoCompleted.includes(args.type) ? "done" : "todo"),
      assigned_to:  uid,
      created_by:   uid,
      related_type: args.lead_id ? "lead" : args.deal_id ? "deal" : null,
      related_id:   args.lead_id || args.deal_id || null,
      metadata:     { activity_type: args.type, remarks: args.note || args.title },
    };
    payload.organization_id = organizationId;
    const { data, error } = await db.from("activities").insert(payload).select("id, type, title, status").single();
    if (error) return { error: error.message };
    return { success: true, activity: data, message: `Activity logged: "${data.title}"` };
  }

  // ── schedule_follow_up ───────────────────────────────────────────────────────
  if (name === "schedule_follow_up") {
    const time = args.follow_up_time || "10:00";
    const scheduledAt = `${args.follow_up_date}T${time}:00`;
    const payload = {
      type:         args.type || "follow_up_call",
      title:        `Follow-up: ${args.note || "Scheduled follow-up"}`,
      description:  JSON.stringify({ remarks: args.note || "Follow-up scheduled" }),
      lead_id:      args.lead_id || null,
      due_date:     scheduledAt,
      status:       "todo",
      assigned_to:  uid,
      created_by:   uid,
      related_type: args.lead_id ? "lead" : null,
      related_id:   args.lead_id || null,
      metadata:     { activity_type: args.type || "follow_up_call", remarks: args.note || "Follow-up scheduled" },
    };
    if (args.lead_id) {
      await db.from("leads").update({ follow_up_date: args.follow_up_date, updated_at: new Date().toISOString() }).eq("id", args.lead_id);
    }
    payload.organization_id = organizationId;
    const { data, error } = await db.from("activities").insert(payload).select("id, type, title, due_date").single();
    if (error) return { error: error.message };
    return { success: true, activity: data, message: `Follow-up scheduled for ${args.follow_up_date} at ${time}` };
  }

  // ── schedule_meeting ─────────────────────────────────────────────────────────
  if (name === "schedule_meeting") {
    const meetingPayload = {
      title:        args.title,
      company_name: args.company_name || null,
      contact_name: args.contact_name || null,
      scheduled_at: args.scheduled_at,
      location:     args.location || null,
      notes:        args.agenda || null,
      status:       "scheduled",
      created_by:   uid,
      lead_id:      args.lead_id || null,
      type:         "general",
    };
    meetingPayload.organization_id = organizationId;
    const { data: meeting, error: mErr } = await db.from("meetings").insert(meetingPayload).select("id, title, scheduled_at, status").single();
    if (mErr) return { error: mErr.message };
    await db.from("activities").insert({
      organization_id: organizationId,
      type: "meeting_person", title: `Meeting Scheduled: ${args.title}`,
      description: JSON.stringify({ remarks: args.agenda || `Meeting with ${args.contact_name || args.company_name}` }),
      lead_id: args.lead_id || null, due_date: args.scheduled_at, status: "todo",
      created_by: uid, assigned_to: uid,
    });
    return { success: true, meeting, message: `Meeting "${meeting.title}" scheduled for ${new Date(meeting.scheduled_at).toLocaleString("en-IN")}` };
  }

  // ── create_task ──────────────────────────────────────────────────────────────
  if (name === "create_task") {
    const { data, error } = await db.from("tasks").insert({
      organization_id: organizationId,
      title:       args.title,
      description: args.description || null,
      priority:    args.priority || "medium",
      due_date:    args.due_date,
      status:      "pending",
      created_by:  uid,
      assigned_to: uid,
      lead_id:     args.lead_id || null,
    }).select("id, title, due_date, priority, status").single();
    if (error) return { error: error.message };
    return { success: true, task: data, message: `Task created: "${data.title}" (due ${data.due_date})` };
  }

  // ── create_deal ──────────────────────────────────────────────────────────────
  if (name === "create_deal") {
    const { data, error } = await db.from("deals").insert({
      organization_id: organizationId,
      title:        args.title,
      company_name: args.company_name,
      contact_name: args.contact_name || null,
      value:        args.value || 0,
      stage:        args.stage || "prospecting",
      close_date:   args.close_date || null,
      description:  args.description || null,
      assigned_to:  uid,
      created_by:   uid,
      status:       "active",
    }).select("id, title, company_name, value, stage").single();
    if (error) return { error: error.message };
    return { success: true, deal: data, message: `Deal created: "${data.title}" for ${data.company_name} (₹${Number(data.value).toLocaleString("en-IN")})` };
  }

  // ── update_deal ──────────────────────────────────────────────────────────────
  if (name === "update_deal") {
    const updates = {};
    if (args.stage)       updates.stage       = args.stage;
    if (args.value)       updates.value       = args.value;
    if (args.close_date)  updates.close_date  = args.close_date;
    if (args.description) updates.description = args.description;
    if (Object.keys(updates).length === 0) return { error: "No fields to update." };
    updates.updated_at = new Date().toISOString();
    const { data, error } = await db.from("deals").update(updates).eq("id", args.deal_id).select("id, title, company_name, stage").single();
    if (error) return { error: error.message };
    return { success: true, deal: data, message: `Deal updated: "${data.title}"` };
  }

  // ── draft_email ── Returns draft; frontend shows confirmation card ────────────
  if (name === "draft_email") {
    return {
      draft:      true,
      to_name:    args.to_name,
      to_email:   args.to_email   || null,
      to_company: args.to_company || null,
      subject:    args.subject,
      body:       args.body,
      lead_id:    args.lead_id || null,
      message:    `Email draft ready for ${args.to_name}. User is reviewing it.`,
    };
  }

  return { error: `Unknown tool: ${name}` };
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(profile, pageContext, docContext) {
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const roleLabel = profile.role === "owner" ? "Super Admin" : (profile.role || "").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());

  const isAIModule = pageContext?.module === "Sales CRM AI";
  const pageSection = pageContext && !isAIModule
    ? `
━━━ CURRENT PAGE CONTEXT ━━━
• Module: ${pageContext.module}
• Page: ${pageContext.page || ""}
• Path: ${pageContext.path || ""}

The user has the **${pageContext.module}** page open right now. When they say "here", "this page", "current records", or similar — they mean ${pageContext.module}. Prioritize ${pageContext.module}-related tools and responses.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const aiModeSection = isAIModule
    ? `
━━━ SALES CRM ASSISTANT MODE ━━━
Mode: ${pageContext.mode || "CRM Assistant"}
${pageContext.modeHint || "Help the user with their CRM."}
Response Language: Always respond in ${pageContext.language || "English"}.
━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  return `You are SALES CRM ASSISTANT — the intelligent enterprise AI agent inside Sales CRM, built for the Indian sales market.

USER: ${profile.full_name} | Role: ${roleLabel} | ${date}
${pageSection}${aiModeSection}

YOU ARE AN AUTONOMOUS CRM AGENT with real-time access to ALL CRM data. ALWAYS call the appropriate tool(s) before answering data questions — never guess or make up numbers. Execute tasks directly — do not ask for permission before using write tools.

READ TOOLS (retrieve CRM data):
• get_leads — leads with temperature, stage, follow-up filters
• get_prospects — prospects pipeline
• get_deals — deals with stage, staleness filters
• get_tasks — pending/overdue tasks
• get_activities — sales activities (calls, emails, demos)
• get_meetings — scheduled meetings
• get_pipeline_summary — full pipeline stats and KPIs
• get_analytics_summary — comprehensive analytics & trends
• search_crm — global search across ALL modules at once
• get_ai_recommendations — smart next-action recommendations
• get_release_notes — version history and what's new
• get_team_performance — team member performance metrics

WRITE TOOLS (execute immediately — no confirmation needed except email):
• create_lead — add a new lead to CRM
• update_lead — update lead details, stage, temperature, follow-up
• assign_lead — reassign a lead to a team member (manager role required)
• update_lead_stage — move a lead to a new stage + log note
• create_activity — log any sales activity (call, note, email, visit, demo)
• schedule_follow_up — schedule a follow-up and update lead's next follow-up date
• schedule_meeting — create a new meeting + auto-log activity
• create_task — create a task or reminder
• create_deal — create a new deal in the pipeline
• update_deal — update deal stage, value, close date
• draft_email — compose an email draft (user reviews and confirms sending separately)

AUTONOMOUS AGENT BEHAVIOR:
- Execute write tools directly without asking for confirmation (except email)
- Chain multiple tools in sequence: search first → then write (always look up lead_id before updating)
- For email requests: ALWAYS call draft_email tool — never write email body in plain text response
- After completing any write operation, summarize clearly what was done
- Example: "Done! I've created a lead for **Ather Energy** (LEAD-007) assigned to you, and scheduled a follow-up call for June 30."
- Address user by first name occasionally
- Use **bold** for company names and key numbers. Bullet points for lists.
- Indian number format: ₹, Lakh, Crore (₹1,00,000 = ₹1 Lakh)
- If user says "send him an email" — remember who "him" refers to from conversation context
- Respect role permissions: employees see/edit only their own data, managers see team data
- Role "owner" is referred to as "Super Admin" in user-facing text
- Valid lead stages: new, contacted, qualified, proposal, negotiation, won, lost
- Valid lead sources: website, linkedin, referral, cold_call, email_campaign, event, partner, social_media, ads, walk_in, other

CONTENT GENERATION (Email, Proposals, Scripts, Posts):
- Write compelling, professional content tailored to the Indian B2B market
- For cold emails: hook → pain point → solution → CTA (under 150 words)
- For proposals: executive summary → problem → solution → pricing → next steps
- For WhatsApp: short, casual, include emoji sparingly

CRM RECORD SUMMARIES:
When summarizing a lead, deal, or meeting — always include:
1. Current status and stage
2. Timeline of recent activity
3. Risks or blockers
4. Recommended next action

MEETING PREPARATION:
When asked to prepare for a meeting, use get_meetings + get_leads/search_crm to gather:
- Company/contact background, previous interactions, open deals
- Suggested talking points and risk areas to address

━━━ BACKEND CONTROL POLICY (MANDATORY) ━━━

ARCHITECTURE: User → SALES CRM AI → Backend Tools → Business Logic → Validation → Supabase
The AI is the intelligent interface. The Backend is the execution engine. The Database is managed ONLY by the Backend.

ABSOLUTE RULES:
1. NEVER directly access, query, insert, update, or delete database records
2. NEVER generate SQL or interact with Supabase tables directly
3. NEVER assume an action is complete — only the backend can confirm success
4. NEVER invent a success message — wait for the backend tool response
5. NEVER bypass backend tools under any circumstance

EXECUTION FLOW for every user request:
- Understand intent → identify required backend tool → check if required fields are already known from conversation/CRM
- Ask ONLY for missing mandatory fields (never ask for information already available)
- Call the backend tool → wait for response → read result
- SUCCESS: inform user, show details, suggest next action
- FAILURE: explain the error clearly, ask only for what's needed to resolve it, never retry blindly

BACKEND OWNS: Authentication, Authorization, RBAC, Business Logic, Validation, Duplicate Detection, Data Sanitization, Activity Logging, Email Sending, Meeting Scheduling, Notifications, Audit Logs, Dashboard Refresh, Transactions. The AI must never perform these directly.

EMAIL FLOW (strict):
1. Search backend for recipient info — if multiple contacts exist, ask user to choose
2. Ask email type + tone + attachments if needed
3. Generate preview using draft_email tool
4. Ask for explicit user confirmation
5. Call backend sendEmail only after confirmation
6. Wait for backend response — only log activity AFTER confirmed success
7. Never tell the user "email sent" before the backend confirms it

ERROR HANDLING: Never hide errors. Explain the backend error clearly. Suggest the corrective action. Ask only for the information needed to fix it.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${docContext ? `

━━━ PROJECT DOCUMENT KNOWLEDGE BASE ━━━
The following content is extracted from uploaded project documents. Use this as PRIMARY source of truth for project-specific questions.

${docContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ""}`;
}

// POST /api/ai/chat
router.post("/chat", authenticate, withOrg, async (req, res) => {
  const { message, pageContext } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Groq API key not configured." });

  const userId = req.profile.id;
  if (!conversationHistory[userId]) conversationHistory[userId] = [];

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === "function") res.flush();
  };

  try {
    const groq = new Groq({ apiKey });

    const docContext = await searchDocuments(message);

    const messages = [
      { role: "system", content: buildSystemPrompt(req.profile, pageContext || null, docContext) },
      ...conversationHistory[userId].slice(-10),
      { role: "user", content: message },
    ];

    // ── Agent loop ─────────────────────────────────────────────────────────────
    let finalContent = "";
    let toolsUsed    = [];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await groq.chat.completions.create({
        model:       GROQ_MODEL,
        messages,
        tools:       CRM_TOOLS,
        tool_choice: "auto",
        temperature: 0.35,
        max_tokens:  2048,
      });

      const choice = response.choices[0];

      if (choice.finish_reason === "tool_calls") {
        const toolCalls = choice.message.tool_calls;
        messages.push(choice.message);

        for (const tc of toolCalls) {
          const toolName = tc.function.name;
          if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);
          send({ type: "tool", name: toolName });
        }

        const results = await Promise.all(
          toolCalls.map(async (tc) => {
            const args   = JSON.parse(tc.function.arguments || "{}") || {};
            const result = await executeTool(tc.function.name, args, { profile: req.profile, db: req.db, organizationId: req.organizationId, orgRole: req.orgRole });
            // Special: emit email draft so frontend can render confirmation card
            if (tc.function.name === "draft_email" && result.draft) {
              send({ type: "email_draft", data: result });
            }
            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) };
          })
        );

        messages.push(...results);
        continue;
      }

      finalContent = choice.message.content || "";
      break;
    }

    if (!finalContent) finalContent = "I couldn't complete the analysis. Please try again.";

    // Stream final answer word by word for smooth UX
    const chunks = finalContent.match(/\S+\s*/g) || [finalContent];
    for (const chunk of chunks) {
      send({ type: "token", content: chunk });
    }

    // Persist conversation (keep last 20 exchanges)
    conversationHistory[userId].push({ role: "user",      content: message });
    conversationHistory[userId].push({ role: "assistant", content: finalContent });
    if (conversationHistory[userId].length > 20) {
      conversationHistory[userId] = conversationHistory[userId].slice(-20);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("SALES CRM ASSISTANT agent error:", err.message);
    const userMsg = /rate.limit|429|quota/i.test(err.message)
      ? "Rate limit reached. Please wait a moment and try again."
      : err.message;
    send({ type: "error", message: userMsg });
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// POST /api/ai/clear-history
router.post("/clear-history", authenticate, withOrg, (req, res) => {
  const userId = req.profile.id;
  if (conversationHistory[userId]) {
    conversationHistory[userId] = [];
  }
  res.json({ success: true });
});

// POST /api/ai/execute-action  — execute confirmed AI actions (currently: send email via Gmail)
router.post("/execute-action", authenticate, withOrg, async (req, res) => {
  const { action_type, data } = req.body;
  if (!action_type || !data) return res.status(400).json({ error: "action_type and data required" });

  if (action_type === "send_email") {
    if (!data.to_email) return res.status(400).json({ error: "Recipient email address is required to send." });
    if (!data.subject)  return res.status(400).json({ error: "Email subject is required." });
    if (!data.body)     return res.status(400).json({ error: "Email body is required." });

    // ── Get user's connected Gmail account ────────────────────────────────────
    const { data: accounts } = await req.db
      .from("email_accounts")
      .select("*")
      .eq("organization_id", req.organizationId)
      .eq("user_id", req.profile.id)
      .eq("is_active", true)
      .eq("provider", "gmail")
      .limit(1);

    if (!accounts?.length) {
      return res.status(400).json({ error: "No Gmail account connected. Please connect Gmail in Settings → Email Integration." });
    }

    const account = accounts[0];

    // ── Get / refresh access token ─────────────────────────────────────────────
    let token;
    try {
      const GMAIL_CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
      const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
      const GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token";

      const needsRefresh = !account.token_expiry || new Date(account.token_expiry) <= new Date(Date.now() + 60000);
      if (needsRefresh) {
        if (!account.refresh_token) throw new Error("Gmail session expired. Please reconnect Gmail in Settings.");
        const r = await fetch(GOOGLE_TOKEN_URL, {
          method:  "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id:     GMAIL_CLIENT_ID,
            client_secret: GMAIL_CLIENT_SECRET,
            refresh_token: account.refresh_token,
            grant_type:    "refresh_token",
          }),
        });
        const refreshData = await r.json();
        if (!refreshData.access_token) throw new Error(refreshData.error_description || "Token refresh failed");
        token = refreshData.access_token;
        const expiry = refreshData.expires_in ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString() : null;
        await supabase.from("email_accounts").update({ access_token: token, token_expiry: expiry }).eq("id", account.id);
      } else {
        token = account.access_token;
      }
    } catch (tokenErr) {
      return res.status(400).json({ error: tokenErr.message });
    }

    // ── Build and send MIME email via Gmail API ────────────────────────────────
    const { data: senderProfile } = await req.db.from("profiles").select("full_name").eq("id", req.profile.id).maybeSingle();
    const senderName  = senderProfile?.full_name || "";
    const fromAddress = account.email;

    const htmlBody   = data.body.includes("<") ? data.body : data.body.replace(/\n/g, "<br>");
    const subjectB64 = `=?UTF-8?B?${Buffer.from(data.subject.trim()).toString("base64")}?=`;
    const mimeMsg    = [
      `From: ${senderName ? `"${senderName}" <${fromAddress}>` : fromAddress}`,
      `To: ${data.to_email.trim()}`,
      `Subject: ${subjectB64}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody,
    ].join("\r\n");
    const raw = Buffer.from(mimeMsg).toString("base64url");

    const sendResp = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ raw }),
    });

    if (!sendResp.ok) {
      const errData = await sendResp.json().catch(() => ({}));
      const errMsg  = errData.error?.message || "Failed to send email";
      if (sendResp.status === 403 || /insufficient|scope/i.test(errMsg)) {
        return res.status(403).json({ error: "Gmail needs additional permissions. Please reconnect Gmail in Settings.", code: "insufficient_scope" });
      }
      return res.status(400).json({ error: errMsg });
    }

    const sentData = await sendResp.json();
    const now      = new Date().toISOString();

    // ── Log email_sync_log + activity ─────────────────────────────────────────
    const { data: logEntry } = await req.db.from("email_sync_log").insert({
      organization_id: req.organizationId,
      email_account_id: account.id,
      user_id:          req.profile.id,
      sender_name:      senderName,
      message_id:       sentData.id || `ai-${Date.now()}`,
      thread_id:        sentData.threadId || null,
      subject:          data.subject.trim(),
      from_email:       fromAddress,
      to_emails:        [data.to_email.trim()],
      sent_at:          now,
      attachment_count: 0,
      snippet:          data.body.replace(/<[^>]*>/g, "").slice(0, 300),
      direction:        "outbound",
      status:           "classified",
      activity_type:    "email_sent",
      reason:           "Sent via Sales CRM AI",
      lead_id:          data.lead_id || null,
      crm_module:       data.lead_id ? "lead" : null,
      crm_record_name:  data.to_company ? `${data.to_name} / ${data.to_company}` : data.to_name,
    }).select().single();

    const { data: activity } = await req.db.from("activities").insert({
      organization_id: req.organizationId,
      type:        "email_sent",
      title:       `Email Sent: ${data.subject.trim()}`,
      description: JSON.stringify({ remarks: data.body }),
      lead_id:     data.lead_id || null,
      status:      "done",
      created_by:  req.profile.id,
      assigned_to: req.profile.id,
      related_type: data.lead_id ? "lead" : null,
      related_id:   data.lead_id || null,
      metadata:    { to_name: data.to_name, to_email: data.to_email, subject: data.subject, sent_at: now, source: "aria_ai" },
    }).select().single();

    if (activity && logEntry) {
      await req.db.from("email_sync_log").update({ activity_id: activity.id }).eq("id", logEntry.id);
    }

    return res.json({ success: true, message: `Email sent to ${data.to_name} (${data.to_email})`, message_id: sentData.id });
  }

  return res.status(400).json({ error: `Unknown action type: ${action_type}` });
});

module.exports = router;
