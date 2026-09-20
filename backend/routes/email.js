const express = require("express");
const router  = express.Router();
const { supabase } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { withOrg, orgAtLeast } = require("../middleware/orgContext");

const GMAIL_CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const BACKEND_URL         = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL        = (process.env.FRONTEND_URL || "http://localhost:5173");
const GMAIL_REDIRECT_URI  = `${BACKEND_URL}/api/email/callback/gmail`;
const GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token";
const GMAIL_API           = "https://www.googleapis.com/gmail/v1/users/me";


// ── Helper: refresh Gmail access token if expired ──────────────────────────────
async function refreshGmailToken(account) {
  if (!account.refresh_token) throw new Error("No refresh token");
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
  const data = await r.json();
  if (!data.access_token) throw new Error(data.error_description || "Token refresh failed");
  const expiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
  await supabase.from("email_accounts").update({
    access_token: data.access_token,
    token_expiry: expiry,
  }).eq("id", account.id);
  return data.access_token;
}

// ── Helper: get valid access token (refresh if needed) ────────────────────────
async function getValidToken(account) {
  if (account.token_expiry && new Date(account.token_expiry) > new Date(Date.now() + 60000)) {
    return account.access_token;
  }
  return refreshGmailToken(account);
}

// ── Helper: Gmail API call ─────────────────────────────────────────────────────
async function gmailFetch(path, token) {
  const r = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gmail API error ${r.status}`);
  }
  return r.json();
}

// ── Helper: CRM mapping — match recipient email across leads, customers, pipeline, deals
async function mapEmailToCRM(db, toEmails) {
  for (const raw of toEmails) {
    const email = raw.replace(/^.*<(.+)>$/, "$1").trim().toLowerCase();
    if (!email) continue;

    // 1. Check leads
    const { data: lead } = await db.from("leads")
      .select("id, contact_name, company_name")
      .ilike("email", email)
      .limit(1).maybeSingle();
    if (lead) {
      return {
        leadId: lead.id, dealId: null, customerId: null, pipelineId: null,
        crmModule: "lead",
        crmRecordName: [lead.contact_name, lead.company_name].filter(Boolean).join(" / "),
      };
    }

    // 2. Check customers
    const { data: customer } = await db.from("customers")
      .select("id, contact_name, company_name")
      .ilike("email", email)
      .limit(1).maybeSingle();
    if (customer) {
      return {
        leadId: null, dealId: null, customerId: customer.id, pipelineId: null,
        crmModule: "customer",
        crmRecordName: [customer.contact_name, customer.company_name].filter(Boolean).join(" / "),
      };
    }

    // 3. Check pipeline
    const { data: pipe } = await db.from("pipeline")
      .select("id, contact_name, company_name")
      .ilike("email", email)
      .limit(1).maybeSingle();
    if (pipe) {
      return {
        leadId: null, dealId: null, customerId: null, pipelineId: pipe.id,
        crmModule: "pipeline",
        crmRecordName: [pipe.contact_name, pipe.company_name].filter(Boolean).join(" / "),
      };
    }

    // 4. Check deals — contact email lives in the JSON `notes` field (no plain
    // email column on deals), so it can't be queried with .ilike() like the
    // tables above. Fetch candidates and match in JS instead.
    const { data: dealRows } = await db.from("deals")
      .select("id, contact_name, company_name, title, notes")
      .not("notes", "is", null)
      .limit(1000);
    const deal = (dealRows || []).find((d) => {
      try {
        return (JSON.parse(d.notes || "{}").email || "").trim().toLowerCase() === email;
      } catch {
        return false;
      }
    });
    if (deal) {
      return {
        leadId: null, dealId: deal.id, customerId: null, pipelineId: null,
        crmModule: "deal",
        crmRecordName: deal.contact_name || deal.company_name || deal.title || "",
      };
    }
  }

  // No CRM match
  return { leadId: null, dealId: null, customerId: null, pipelineId: null, crmModule: null, crmRecordName: null };
}

// ── GET /api/email/accounts ─ list connected accounts ─────────────────────────
router.get("/accounts", authenticate, withOrg, async (req, res) => {
  const { data, error } = await req.db
    .from("email_accounts")
    .select("id, provider, email, is_active, last_sync_at, created_at")
    .eq("organization_id", req.organizationId)
    .eq("user_id", req.profile.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// ── GET /api/email/auth-url/gmail ─ returns OAuth URL as JSON for JS redirect ─
router.get("/auth-url/gmail", authenticate, withOrg, (req, res) => {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    return res.status(503).json({ error: "Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET." });
  }
  const params = new URLSearchParams({
    client_id:     GMAIL_CLIENT_ID,
    redirect_uri:  GMAIL_REDIRECT_URI,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
    access_type:   "offline",
    prompt:        "consent",
    state:         `${req.profile.id}:${req.organizationId}`,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// ── GET /api/email/connect/gmail ─ OAuth redirect (legacy / direct navigation) ─
router.get("/connect/gmail", authenticate, withOrg, (req, res) => {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    return res.status(503).json({ error: "Gmail OAuth not configured." });
  }
  const params = new URLSearchParams({
    client_id:     GMAIL_CLIENT_ID,
    redirect_uri:  GMAIL_REDIRECT_URI,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
    access_type:   "offline",
    prompt:        "consent",
    state:         `${req.profile.id}:${req.organizationId}`,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ── GET /api/email/callback/gmail ─ OAuth callback from Google ────────────────
router.get("/callback/gmail", async (req, res) => {
  const { code, state, error: oauthErr } = req.query;
  const [userId, orgId] = String(state || "").split(":");
  const failUrl = `${FRONTEND_URL}/settings?email_sync_error=1`;
  if (oauthErr || !code || !userId || !orgId) return res.redirect(failUrl);

  try {
    // Exchange code for tokens
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        redirect_uri:  GMAIL_REDIRECT_URI,
        grant_type:    "authorization_code",
      }),
    });
    const tokens = await tokenResp.json();
    if (!tokens.access_token) throw new Error(tokens.error_description || "No access token");

    // Get Gmail profile (email address)
    const gmailProfile = await gmailFetch("/profile", tokens.access_token);
    const email        = gmailProfile.emailAddress;

    // Any Google account may be connected as the organization's sending identity.

    // Google only returns refresh_token on first authorization.
    // Never overwrite an existing refresh_token with null — doing so breaks token refresh after expiry.
    const accountPayload = {
      user_id:      userId,
      organization_id: orgId,
      provider:     "gmail",
      email,
      access_token: tokens.access_token,
      token_expiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      history_id:   gmailProfile.historyId?.toString() || null,
      last_sync_at: new Date().toISOString(),
      is_active:    true,
    };
    if (tokens.refresh_token) accountPayload.refresh_token = tokens.refresh_token;

    // Callback is unauthenticated (Google redirect) — use the service-role client.
    await supabase.from("email_accounts").upsert(accountPayload, { onConflict: "user_id,email" });

    // Mirror into the org-scoped integration record used by the new Integrations UI.
    await supabase.from("organization_integrations").upsert({
      organization_id: orgId, provider: "gmail", status: "connected",
      connected_email: email, display_name: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || undefined,
      token_expiry: accountPayload.token_expiry,
      history_id: accountPayload.history_id,
      last_sync_at: accountPayload.last_sync_at, last_error: null,
      connected_by: userId,
    }, { onConflict: "organization_id,provider" });

    res.redirect(`${FRONTEND_URL}/settings?email_sync_connected=gmail`);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err.message);
    res.redirect(failUrl);
  }
});

// ── DELETE /api/email/accounts/:id ─ disconnect an account ───────────────────
router.delete("/accounts/:id", authenticate, withOrg, async (req, res) => {
  const { error } = await req.db.from("email_accounts")
    .update({ is_active: false })
    .eq("id", req.params.id)
    .eq("user_id", req.profile.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ── POST /api/email/sync ─ pull recent sent emails for the current user ───────
router.post("/sync", authenticate, withOrg, async (req, res) => {
  if (!GMAIL_CLIENT_ID) return res.json({ synced: 0, reason: "not_configured" });

  const { data: accounts } = await req.db.from("email_accounts")
    .select("*")
    .eq("user_id", req.profile.id)
    .eq("is_active", true)
    .eq("provider", "gmail");

  if (!accounts?.length) return res.json({ synced: 0 });

  // Get sender's display name once
  const { data: senderProfile } = await req.db.from("profiles")
    .select("full_name").eq("id", req.profile.id).maybeSingle();
  const senderName = senderProfile?.full_name || "";

  let totalSynced = 0;

  for (const account of accounts) {
    try {
      const token = await getValidToken(account);

      // Fetch sent emails since last sync (or last 24 h for first sync).
      // Gmail's after:/before: search operators only support day-granularity
      // dates (YYYY/MM/DD) — a raw Unix timestamp is not parsed as a date and
      // silently matches nothing. Use a day-level floor as a coarse search
      // filter, then filter precisely by each message's actual Date header below.
      const sinceDate = account.last_sync_at
        ? new Date(account.last_sync_at)
        : new Date(Date.now() - 24 * 3600 * 1000);
      const searchFloor = new Date(sinceDate.getTime() - 24 * 3600 * 1000);
      const gmailDate = (d) =>
        `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;

      const listData = await gmailFetch(
        `/messages?q=${encodeURIComponent(`in:sent after:${gmailDate(searchFloor)}`)}&maxResults=25`,
        token
      );
      const messages = listData.messages || [];

      for (const msg of messages) {
        try {
          const msgData = await gmailFetch(
            `/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=Date`,
            token
          );

          const hdrMap = {};
          (msgData.payload?.headers || []).forEach((h) => { hdrMap[h.name.toLowerCase()] = h.value; });

          const toEmails  = (hdrMap["to"]  || "").split(",").map((e) => e.trim()).filter(Boolean);
          const ccEmails  = (hdrMap["cc"]  || "").split(",").map((e) => e.trim()).filter(Boolean);
          const bccEmails = (hdrMap["bcc"] || "").split(",").map((e) => e.trim()).filter(Boolean);
          const sentAt    = hdrMap["date"] ? new Date(hdrMap["date"]).toISOString() : new Date().toISOString();
          const attachCount = (msgData.payload?.parts || []).filter((p) => p.filename).length;

          // The Gmail search above is only day-granular — precisely exclude
          // messages already covered by a previous sync.
          if (new Date(sentAt) <= sinceDate) continue;

          // Auto-map to CRM record across leads / customers / pipeline / deals
          const { leadId, dealId, customerId, pipelineId, crmModule, crmRecordName } = await mapEmailToCRM(req.db, toEmails);

          // Only log emails that match a CRM record — non-CRM emails are skipped
          if (!leadId && !customerId && !pipelineId && !dealId) continue;

          const { error: upsertErr } = await req.db.from("email_sync_log").upsert({
            organization_id:  req.organizationId,
            email_account_id: account.id,
            user_id:          req.profile.id,
            sender_name:      senderName,
            message_id:       msg.id,
            thread_id:        msgData.threadId,
            subject:          hdrMap["subject"] || "(No Subject)",
            from_email:       hdrMap["from"]    || account.email,
            to_emails:        toEmails,
            cc_emails:        ccEmails,
            bcc_emails:       bccEmails,
            sent_at:          sentAt,
            attachment_count: attachCount,
            snippet:          (msgData.snippet || "").slice(0, 300),
            direction:        "outbound",
            status:           "pending",
            lead_id:          leadId,
            deal_id:          dealId,
            customer_id:      customerId,
            pipeline_id:      pipelineId,
            crm_module:       crmModule,
            crm_record_name:  crmRecordName,
          }, { onConflict: "email_account_id,message_id", ignoreDuplicates: true });

          if (!upsertErr) totalSynced++;
        } catch (msgErr) {
          console.warn("Email parse error:", msgErr.message);
        }
      }

      // Update last_sync_at
      const newProfile = await gmailFetch("/profile", token);
      await req.db.from("email_accounts").update({
        last_sync_at: new Date().toISOString(),
        history_id:   newProfile.historyId?.toString() || account.history_id,
      }).eq("id", account.id);

    } catch (accErr) {
      console.error(`Sync failed for ${account.email}:`, accErr.message);
    }
  }

  res.json({ synced: totalSynced });
});

// ── GET /api/email/pending ─ CRM-matched emails waiting for classification ────
router.get("/pending", authenticate, withOrg, async (req, res) => {
  const { data, error } = await req.db.from("email_sync_log")
    .select("*")
    .eq("user_id", req.profile.id)
    .eq("status", "pending")
    .eq("direction", "outbound")
    .order("sent_at", { ascending: false })
    .limit(5);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// ── POST /api/email/classify ─ user picks type + reason → creates activity ───
router.post("/classify", authenticate, withOrg, async (req, res) => {
  const { id, activity_type, reason } = req.body;
  if (!id || !activity_type) return res.status(400).json({ error: "id and activity_type are required" });
  if (!reason || !reason.trim()) return res.status(400).json({ error: "reason is required" });

  const { data: log, error: fetchErr } = await req.db.from("email_sync_log")
    .select("*")
    .eq("id", id)
    .eq("user_id", req.profile.id)
    .single();
  if (fetchErr || !log) return res.status(404).json({ error: "Email not found" });

  const title = `📧 ${activity_type}: ${log.subject || "(No Subject)"}`;
  const desc  = [
    `To: ${(log.to_emails || []).join(", ")}`,
    log.cc_emails?.length ? `CC: ${log.cc_emails.join(", ")}` : null,
    reason.trim()         ? `Reason: ${reason.trim()}`        : null,
    log.snippet           ? `\n${log.snippet}`                : null,
    log.attachment_count > 0 ? `Attachments: ${log.attachment_count}` : null,
    `Thread: ${log.thread_id || log.message_id}`,
  ].filter(Boolean).join("\n");

  // Determine related_type / related_id across all mapped modules
  const related_type = log.lead_id ? "lead" : log.customer_id ? "customer" : log.pipeline_id ? "pipeline" : log.deal_id ? "deal" : null;
  const related_id   = log.lead_id || log.customer_id || log.pipeline_id || log.deal_id || null;

  const { data: activity, error: actErr } = await req.db.from("activities").insert({
    organization_id: req.organizationId,
    type:         "email_sent",
    title,
    description:  desc,
    status:       "done",
    created_by:   req.profile.id,
    user_id:      req.profile.id,
    lead_id:      log.lead_id      || null,
    deal_id:      log.deal_id      || null,
    customer_id:  log.customer_id  || null,
    related_type,
    related_id,
    metadata: {
      email_type:       activity_type,
      reason:           reason.trim(),
      message_id:       log.message_id,
      thread_id:        log.thread_id,
      subject:          log.subject,
      to_emails:        log.to_emails,
      attachment_count: log.attachment_count,
      sent_at:          log.sent_at,
      crm_module:       log.crm_module,
      crm_record_name:  log.crm_record_name,
    },
  }).select().single();

  if (actErr) return res.status(400).json({ error: actErr.message });

  await req.db.from("email_sync_log").update({
    status:        "classified",
    activity_type,
    activity_id:   activity.id,
    reason:        reason.trim(),
  }).eq("id", id);

  res.json({ success: true, activity });
});

// ── POST /api/email/dismiss ─ skip without creating an activity ───────────────
router.post("/dismiss", authenticate, withOrg, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  await req.db.from("email_sync_log")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("user_id", req.profile.id);
  res.json({ success: true });
});

// ── GET /api/email/log ─ Email Activity Log with role-based visibility ─────────
router.get("/log", authenticate, withOrg, async (req, res) => {
  const { user_id: filterUser, from, to, record_name, email, module, status: filterStatus } = req.query;
  const role = req.orgRole;

  let query = req.db.from("email_sync_log")
    .select("*")
    .in("status", ["classified", "pending", "dismissed"])
    .order("sent_at", { ascending: false })
    .limit(200);

  // Role-based visibility: employees/inside_sales see only their own
  const isRestricted = role === "sales_rep";
  if (isRestricted) {
    query = query.eq("user_id", req.profile.id);
  } else if (role === "sales_manager") {
    // Sales manager sees own + their team — simplified to own for now
    query = query.eq("user_id", req.profile.id);
  }

  // Optional filters
  if (filterUser  && !isRestricted) query = query.eq("user_id", filterUser);
  if (from)        query = query.gte("sent_at", from);
  if (to)          query = query.lte("sent_at", to);
  if (record_name) query = query.ilike("crm_record_name", `%${record_name}%`);
  if (email)       query = query.or(`from_email.ilike.%${email}%`);
  if (module)      query = query.eq("crm_module", module);
  if (filterStatus) query = query.eq("status", filterStatus);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// ── GET /api/email/stats ─ email count summary per user / per CRM record ──────
router.get("/stats", authenticate, withOrg, async (req, res) => {
  const role = req.orgRole;

  let query = req.db.from("email_sync_log")
    .select("user_id, sender_name, lead_id, customer_id, pipeline_id, crm_module, crm_record_name, status")
    .eq("status", "classified");

  const isRestricted = role === "sales_rep" || role === "sales_manager";
  if (isRestricted) query = query.eq("user_id", req.profile.id);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });

  const rows = data || [];

  // Aggregate by user
  const byUser = {};
  rows.forEach(({ user_id, sender_name }) => {
    if (!byUser[user_id]) byUser[user_id] = { name: sender_name || user_id, count: 0 };
    byUser[user_id].count++;
  });

  // Aggregate by CRM record
  const byRecord = {};
  rows.forEach(({ lead_id, customer_id, pipeline_id, crm_module, crm_record_name }) => {
    const key = lead_id || customer_id || pipeline_id;
    if (!key) return;
    if (!byRecord[key]) byRecord[key] = { name: crm_record_name, module: crm_module, count: 0 };
    byRecord[key].count++;
  });

  res.json({ total: rows.length, byUser, byRecord });
});

// ── PATCH /api/email/log/:id ─ update remarks / follow-up (any authenticated user on own records)
router.patch("/log/:id", authenticate, withOrg, async (req, res) => {
  const { reason, follow_up_date, follow_up_status } = req.body;
  const role = req.orgRole;
  const isAdmin = orgAtLeast({orgRole: role}, "sales_manager");

  // Build update payload — only allow the fields the user sent
  const update = {};
  if (reason           !== undefined) update.reason           = reason;
  if (follow_up_date   !== undefined) update.follow_up_date   = follow_up_date || null;
  if (follow_up_status !== undefined) update.follow_up_status = follow_up_status;

  if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });

  // Employees can only edit their own records; admins can edit anyone's
  let query = req.db.from("email_sync_log").update(update).eq("id", req.params.id);
  if (!isAdmin) query = query.eq("user_id", req.profile.id);

  const { error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ── DELETE /api/email/log/:id ─ restricted to owner / sales_head / super admin
router.delete("/log/:id", authenticate, withOrg, async (req, res) => {
  const role = req.orgRole;
  if (!orgAtLeast({orgRole: role}, "admin")) {
    return res.status(403).json({ error: "Only Sales Head or Super Admin can delete email activity records." });
  }
  const { error } = await req.db.from("email_sync_log").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ── POST /api/email/send ─ compose and send email via Gmail ───────────────────
router.post("/send", authenticate, withOrg, async (req, res) => {
  const { to, subject, body, lead_id, deal_id, customer_id, pipeline_id } = req.body;

  // Validation
  if (!to?.trim())      return res.status(400).json({ error: "Recipient email is required" });
  if (!subject?.trim()) return res.status(400).json({ error: "Subject is required" });
  if (!body?.trim())    return res.status(400).json({ error: "Message body is required" });
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(to.trim())) return res.status(400).json({ error: "Invalid recipient email address" });
  if (!lead_id && !deal_id && !customer_id && !pipeline_id) {
    return res.status(400).json({ error: "A CRM record must be linked to send email" });
  }

  // Assignment check — owners / sales_head / sales_manager bypass; others must be assigned
  const role = req.orgRole;
  const canBypass = orgAtLeast({orgRole: role}, "sales_manager");
  if (!canBypass) {
    let assignedTo = null;
    try {
      if (pipeline_id) {
        const { data } = await req.db.from("pipeline").select("assigned_to").eq("id", pipeline_id).single();
        assignedTo = data?.assigned_to;
      } else if (lead_id) {
        const { data } = await req.db.from("leads").select("assigned_to").eq("id", lead_id).single();
        assignedTo = data?.assigned_to;
      } else if (deal_id) {
        const { data } = await req.db.from("deals").select("assigned_to").eq("id", deal_id).single();
        assignedTo = data?.assigned_to;
      } else if (customer_id) {
        const { data } = await req.db.from("customers").select("assigned_to").eq("id", customer_id).single();
        assignedTo = data?.assigned_to;
      }
    } catch { /* non-fatal — treat as unassigned */ }
    if (assignedTo && assignedTo !== req.profile.id) {
      return res.status(403).json({ error: "You are not assigned to this record." });
    }
  }

  // Get connected Gmail account
  const { data: accounts } = await req.db.from("email_accounts")
    .select("*")
    .eq("user_id", req.profile.id)
    .eq("is_active", true)
    .eq("provider", "gmail")
    .limit(1);
  if (!accounts?.length) {
    return res.status(400).json({ error: "No connected email account. Please connect Gmail in Settings." });
  }

  const account = accounts[0];
  let token;
  try {
    token = await getValidToken(account);
  } catch (tokenErr) {
    console.error("Gmail token error for user", req.profile.id, ":", tokenErr.message);
    const noRefresh = tokenErr.message === "No refresh token";
    return res.status(400).json({
      error: noRefresh
        ? "Your Gmail session has expired and cannot be refreshed. Please disconnect and reconnect your Gmail account in Settings → Email Integration."
        : `Gmail authentication error: ${tokenErr.message}. Please reconnect Gmail in Settings.`,
      code: noRefresh ? "no_refresh_token" : "token_error",
    });
  }

  // Get sender details
  const { data: senderProfile } = await req.db.from("profiles")
    .select("full_name").eq("id", req.profile.id).maybeSingle();
  const senderName  = senderProfile?.full_name || "";
  const fromAddress = account.email;

  // Build MIME email with HTML content
  const htmlBody   = body.includes("<") ? body : body.replace(/\n/g, "<br>");
  const subjectB64 = `=?UTF-8?B?${Buffer.from(subject.trim()).toString("base64")}?=`;
  const mimeMsg    = [
    `From: ${senderName ? `"${senderName}" <${fromAddress}>` : fromAddress}`,
    `To: ${to.trim()}`,
    `Subject: ${subjectB64}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
  ].join("\r\n");
  const raw = Buffer.from(mimeMsg).toString("base64url");

  // Send via Gmail API
  const sendResp = await fetch(`${GMAIL_API}/messages/send`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!sendResp.ok) {
    const errData = await sendResp.json().catch(() => ({}));
    const errMsg  = errData.error?.message || "Failed to send email";
    if (
      sendResp.status === 403 ||
      errMsg.toLowerCase().includes("insufficient") ||
      errMsg.toLowerCase().includes("scope")
    ) {
      return res.status(403).json({
        error: "Email sending requires additional permissions. Please reconnect your Gmail account in Settings.",
        code:  "insufficient_scope",
      });
    }
    return res.status(400).json({ error: errMsg });
  }

  const sentData = await sendResp.json();
  const now      = new Date().toISOString();

  // Resolve CRM record name
  const crm_module = pipeline_id ? "pipeline" : lead_id ? "lead" : customer_id ? "customer" : deal_id ? "deal" : null;
  let   crm_record_name = "";
  try {
    if (pipeline_id) {
      const { data: p } = await req.db.from("pipeline").select("contact_name,company_name").eq("id", pipeline_id).maybeSingle();
      crm_record_name = [p?.contact_name, p?.company_name].filter(Boolean).join(" / ");
    } else if (lead_id) {
      const { data: l } = await req.db.from("leads").select("contact_name,company_name").eq("id", lead_id).maybeSingle();
      crm_record_name = [l?.contact_name, l?.company_name].filter(Boolean).join(" / ");
    } else if (customer_id) {
      const { data: c } = await req.db.from("customers").select("contact_name,company_name").eq("id", customer_id).maybeSingle();
      crm_record_name = [c?.contact_name, c?.company_name].filter(Boolean).join(" / ");
    } else if (deal_id) {
      const { data: d } = await req.db.from("deals").select("contact_name,title").eq("id", deal_id).maybeSingle();
      crm_record_name = d?.contact_name || d?.title || "";
    }
  } catch { /* non-fatal */ }

  // Log to email_sync_log (pre-classified — no manual classification needed)
  const { data: logEntry } = await req.db.from("email_sync_log").insert({
    organization_id: req.organizationId,
    email_account_id: account.id,
    user_id:          req.profile.id,
    sender_name:      senderName,
    message_id:       sentData.id || `crm-${Date.now()}`,
    thread_id:        sentData.threadId || null,
    subject:          subject.trim(),
    from_email:       fromAddress,
    to_emails:        [to.trim()],
    sent_at:          now,
    attachment_count: 0,
    snippet:          body.replace(/<[^>]*>/g, "").slice(0, 300),
    direction:        "outbound",
    status:           "classified",
    activity_type:    "email_sent",
    reason:           "Sent via CRM Composer",
    lead_id:          lead_id     || null,
    deal_id:          deal_id     || null,
    customer_id:      customer_id || null,
    pipeline_id:      pipeline_id || null,
    crm_module,
    crm_record_name,
  }).select().single();

  // Create activity record
  const title = `📧 Email Sent: ${subject.trim()}`;
  const desc  = [
    `To: ${to.trim()}`,
    `Subject: ${subject.trim()}`,
    ``,
    body.replace(/<[^>]*>/g, "").slice(0, 500),
  ].join("\n");

  const related_type = pipeline_id ? "pipeline" : lead_id ? "lead" : customer_id ? "customer" : null;
  const related_id   = pipeline_id || lead_id || customer_id || null;

  const { data: activity } = await req.db.from("activities").insert({
    organization_id: req.organizationId,
    type:         "email_sent",
    title,
    description:  desc,
    status:       "done",
    created_by:   req.profile.id,
    user_id:      req.profile.id,
    lead_id:      lead_id     || null,
    deal_id:      deal_id     || null,
    customer_id:  customer_id || null,
    related_type,
    related_id,
    metadata: {
      message_id:      sentData.id,
      thread_id:       sentData.threadId,
      subject:         subject.trim(),
      to_emails:       [to.trim()],
      from_email:      fromAddress,
      sender_name:     senderName,
      sent_at:         now,
      crm_module,
      crm_record_name,
      source:          "crm_composer",
    },
  }).select().single();

  if (activity && logEntry) {
    await req.db.from("email_sync_log").update({ activity_id: activity.id }).eq("id", logEntry.id);
  }

  res.json({ success: true, message_id: sentData.id, activity_id: activity?.id });
});

// ── GET /api/email/conversations ─ grouped CRM record summaries for the communication center
router.get("/conversations", authenticate, withOrg, async (req, res) => {
  try {
    const role = req.orgRole;

    let query = supabase
      .from("email_sync_log")
      .select("crm_record_name, crm_module, lead_id, customer_id, pipeline_id, deal_id, to_emails, sent_at, activity_type, subject, sender_name, user_id, follow_up_status, follow_up_date")
      .or("lead_id.not.is.null,customer_id.not.is.null,pipeline_id.not.is.null,deal_id.not.is.null")
      .order("sent_at", { ascending: false })
      .limit(500);

    if (role === "sales_rep" || role === "sales_manager") {
      query = query.eq("user_id", req.profile.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const groupMap = new Map();
    for (const row of data || []) {
      const recordId = row.lead_id || row.customer_id || row.pipeline_id || row.deal_id;
      const key = `${row.crm_module}::${recordId}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          crm_record_name: row.crm_record_name || "—",
          crm_module:      row.crm_module,
          lead_id:         row.lead_id,
          customer_id:     row.customer_id,
          pipeline_id:     row.pipeline_id,
          deal_id:         row.deal_id,
          primary_email:   row.to_emails?.[0] || "",
          email_count:     0,
          last_email_at:   null,
          first_email_at:  null,
          last_subject:    "",
          email_types:     [],
          has_followup:    false,
        });
      }

      const g = groupMap.get(key);
      g.email_count++;

      const rowDate = row.sent_at ? new Date(row.sent_at) : null;
      if (rowDate) {
        if (!g.last_email_at || rowDate > new Date(g.last_email_at)) {
          g.last_email_at = row.sent_at;
          g.last_subject  = row.subject || "";
        }
        if (!g.first_email_at || rowDate < new Date(g.first_email_at)) {
          g.first_email_at = row.sent_at;
        }
      }

      if (row.activity_type && !g.email_types.includes(row.activity_type)) {
        g.email_types.push(row.activity_type);
      }
      if (row.follow_up_status === "pending") g.has_followup = true;
    }

    const conversations = Array.from(groupMap.values()).sort((a, b) => {
      if (!a.last_email_at) return 1;
      if (!b.last_email_at) return -1;
      return new Date(b.last_email_at) - new Date(a.last_email_at);
    });

    res.json({ data: conversations });
  } catch (err) {
    console.error("conversations error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/email/history ─ email history for a specific CRM record ──────────
router.get("/history", authenticate, withOrg, async (req, res) => {
  const { lead_id, deal_id, customer_id, pipeline_id } = req.query;
  if (!lead_id && !deal_id && !customer_id && !pipeline_id) {
    return res.status(400).json({ error: "At least one CRM record ID is required" });
  }

  let query = req.db.from("email_sync_log")
    .select("id, subject, from_email, to_emails, sent_at, status, activity_type, sender_name, snippet, direction, crm_record_name, attachment_count, created_at")
    .order("sent_at", { ascending: false })
    .limit(50);

  if (pipeline_id)      query = query.eq("pipeline_id", pipeline_id);
  else if (lead_id)     query = query.eq("lead_id", lead_id);
  else if (customer_id) query = query.eq("customer_id", customer_id);
  else if (deal_id)     query = query.eq("deal_id", deal_id);

  // Employees only see their own emails
  const role = req.orgRole;
  if (role === "sales_rep") {
    query = query.eq("user_id", req.profile.id);
  }

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

module.exports = router;
