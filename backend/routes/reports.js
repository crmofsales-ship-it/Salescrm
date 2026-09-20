const express  = require("express");
const router   = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { withOrg, requireOrgRole } = require("../middleware/orgContext");
const { sendMail } = require("../config/mail");
const { collectDsrData, getScopeProfiles, calcScopeTotals } = require("../utils/dsrData");
const { buildDsrEmailHtml, buildDsrEmailText } = require("../utils/dsrEmail");
const { generateNewDsrPdf } = require("../utils/dsrPdfNew");
const { fetchDailyPlanningData, generateDailyPlanningPdf, buildDailyPlanningEmailHtml } = require("../utils/dailyPlanningReport");
const { generateFrontendDsrPdf } = require("../utils/dsrPdfFrontend");

// ─── Helpers shared by manual DSR routes ─────────────────────────────────────
function parseDateRange(customStart, customEnd) {
  // IST offset = +5:30 → subtract to get UTC boundaries
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const start = new Date(customStart + "T00:00:00.000+05:30");
  const end   = new Date(customEnd   + "T23:59:59.999+05:30");
  return {
    dayStart: start.toISOString(),
    dayEnd:   end.toISOString(),
    todayStr: customStart === customEnd ? customStart : `${customStart} to ${customEnd}`,
    dateLabel: customStart === customEnd
      ? new Date(customStart).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
      : `${new Date(customStart).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${new Date(customEnd).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
  };
}

// ─── GET /api/reports/recipients ─────────────────────────────────────────────
// Returns owner + sales_head profiles for the Send DSR recipient picker.
router.get("/recipients", authenticate, withOrg, async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("organization_members")
      .select("role, member:profiles!organization_members_user_id_fkey(id, full_name, email)")
      .eq("organization_id", req.organizationId)
      .in("role", ["owner", "admin"])
      .eq("status", "active");
    if (error) throw error;
    const list = (data || [])
      .map(r => r.member && ({ name: r.member.full_name || r.member.email, email: r.member.email, role: r.role }))
      .filter(Boolean);
    return res.json(list);
  } catch (err) {
    console.error("[recipients]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/reports/download-pdf ──────────────────────────────────────────
// Generates a DSR PDF for the selected employees and date range, returns base64.
router.post("/download-pdf", authenticate, withOrg, async (req, res) => {
  const { selectedEmployeeIds = [], customStart, customEnd } = req.body;
  if (!customStart || !customEnd) return res.status(400).json({ error: "customStart and customEnd required" });

  try {
    const { dayStart, dayEnd, todayStr, dateLabel } = parseDateRange(customStart, customEnd);
    const raw = await collectDsrData(dayStart, dayEnd, todayStr, req.organizationId);
    const { allProfiles, statsMap, meetings } = raw;

    // Filter to selected employees (empty = all)
    const scopeProfiles = selectedEmployeeIds.length > 0
      ? allProfiles.filter(p => selectedEmployeeIds.includes(p.id))
      : allProfiles;

    const generatedAt = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

    const pdfBuffer = await generateFrontendDsrPdf({ dateLabel, generatedAt, scopeProfiles, statsMap, meetings, profileMap: raw.profileMap });
    const filename  = `DSR_${customStart}${customStart !== customEnd ? "_to_" + customEnd : ""}.pdf`;

    return res.json({ data: pdfBuffer.toString("base64"), filename });
  } catch (err) {
    console.error("[download-pdf]", err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/reports/send-dsr ──────────────────────────────────────────────
// Sends DSR email with PDF to selectedEmails for the selected employees / date range.
router.post("/send-dsr", authenticate, withOrg, requireOrgRole("sales_manager"), async (req, res) => {
  const { selectedEmails = [], selectedEmployeeIds = [], customStart, customEnd } = req.body;
  if (!customStart || !customEnd)    return res.status(400).json({ error: "customStart and customEnd required" });
  if (!selectedEmails.length)        return res.status(400).json({ error: "At least one recipient required" });

  try {
    const { dayStart, dayEnd, todayStr, dateLabel } = parseDateRange(customStart, customEnd);
    const raw = await collectDsrData(dayStart, dayEnd, todayStr, req.organizationId);
    const { allProfiles, statsMap, meetings, profileMap } = raw;

    const scopeProfiles = selectedEmployeeIds.length > 0
      ? allProfiles.filter(p => selectedEmployeeIds.includes(p.id))
      : allProfiles;

    const generatedAt  = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
    const pdfBuffer    = await generateFrontendDsrPdf({ dateLabel, generatedAt, scopeProfiles, statsMap, meetings, profileMap });
    const pdfName      = `DSR_${customStart}${customStart !== customEnd ? "_to_" + customEnd : ""}.pdf`;
    const scopeTotals  = calcScopeTotals(scopeProfiles, statsMap);

    // Use the same rich email builder as the cron (includes Management Summary, Team Performance, Meetings)
    const firstRecipient = selectedEmails[0] || "";
    const recipProfile   = (raw.allProfiles || []).find(p => p.email === firstRecipient);
    const html = buildDsrEmailHtml({
      recipientName: recipProfile?.full_name || firstRecipient,
      recipientRole: recipProfile?.role || "owner",
      dateLabel,
      generatedAt,
      scopeProfiles,
      scopeTotals,
      statsMap,
      meetings,
      profileMap,
    });
    const text = buildDsrEmailText({
      recipientName: recipProfile?.full_name || firstRecipient,
      recipientRole: recipProfile?.role || "owner",
      dateLabel,
      scopeTotals,
      scopeProfiles,
      statsMap,
    });

    await sendMail({
      to:      selectedEmails,
      subject: `Daily Sales Report — ${dateLabel}`,
      html,
      text,
      attachments: [{ filename: pdfName, content: pdfBuffer.toString("base64"), content_type: "application/pdf" }],
    });

    return res.json({ success: true, sent_to: selectedEmails.length });
  } catch (err) {
    console.error("[send-dsr]", err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/reports/inactivity-test-recipients ─────────────────────────────
// Returns ALL active users for the test-email dropdown (not filtered by role).
router.get("/inactivity-test-recipients", authenticate, withOrg, requireOrgRole("admin"), async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .not("status", "in", '("deleted","inactive")')
      .not("email", "is", null)
      .order("full_name");

    if (error) return res.status(500).json({ error: error.message });

    const roleLabel = (r) => {
      if (r === "owner")        return "Super Admin";
      if (r === "sales_head")   return "Sales Head";
      if (r === "sales_manager")return "Sales Manager";
      if (r === "inside_sales") return "Inside Sales";
      return (r || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    res.json((users || []).map((u) => ({
      id:    u.id,
      name:  u.full_name || u.email,
      email: u.email,
      role:  u.role,
      label: `${u.full_name || u.email} (${roleLabel(u.role)})`,
    })));
  } catch (err) {
    console.error("[Reports] inactivity-test-recipients error:", err.message);
    res.status(500).json({ error: "Failed to fetch recipients" });
  }
});

// ─── (old /send-dsr, /download-pdf, /dsr-config, /scheduler, /auto-dsr-cron, /dsr-logs routes removed — new DSR via /role-dsr-cron) ───

// ─── POST /api/reports/inactivity-send-now ───────────────────────────────────
// Manual / urgent send — checks inactivity right now and emails any recipient.
// Available to owner and sales_head only.
router.post("/inactivity-send-now", authenticate, withOrg, requireOrgRole("admin"), async (req, res) => {
  const { threshold_days, test_emails } = req.body;
  const effectiveDays = Math.max(1, parseInt(threshold_days) || 3);

  // Send only to the explicitly selected test recipients; fall back to logged-in user
  const selected = Array.isArray(test_emails) ? test_emails.filter(Boolean) : [];
  const toEmails = selected.length > 0 ? selected : [req.profile.email].filter(Boolean);

  if (!toEmails.length) {
    return res.status(400).json({ error: "No recipients selected. Please select at least one recipient." });
  }

  try {
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + 5.5 * 60 * 60 * 1000);

    const inactiveEmployees = await getInactiveEmployees(effectiveDays, nowIst);

    // Always send a test email — even if 0 inactive employees, deliver a confirmation
    const html = inactiveEmployees.length > 0
      ? buildInactivityAlertHtml(inactiveEmployees, effectiveDays, "detailed", nowIst)
      : `<div style="font-family:sans-serif;padding:24px;max-width:560px;margin:auto">
           <h2 style="color:#111">Inactivity Alert — Test Delivery</h2>
           <p style="color:#475569">This is a test email to confirm that your Inactivity Alert is configured correctly.</p>
           <p style="color:#475569">No employees were found inactive for <strong>${effectiveDays}+ days</strong> at the time of sending — this means all tracked employees have been active within the threshold period.</p>
           <p style="color:#94a3b8;font-size:12px;">Sent via Sales CRM · Inactivity Alert test</p>
         </div>`;

    const text = inactiveEmployees.length > 0
      ? buildInactivityAlertText(inactiveEmployees, effectiveDays)
      : `Inactivity Alert Test\n\nNo employees inactive for ${effectiveDays}+ days at time of sending.\nAll tracked employees are active within the threshold.\n\n— Sales CRM`;

    await sendMail({
      to:      toEmails,
      subject: inactiveEmployees.length > 0
        ? `Employee Inactivity Alert — ${inactiveEmployees.length} employee${inactiveEmployees.length !== 1 ? "s" : ""} inactive for ${effectiveDays}+ days`
        : `[Test] Inactivity Alert — All employees active (${effectiveDays}-day threshold)`,
      html,
      text,
    });

    console.log(`[InactivityAlert] Test send by ${req.profile.email} → ${toEmails.length} recipient(s) — ${inactiveEmployees.length} inactive`);
    res.json({ success: true, sent: true, inactive_count: inactiveEmployees.length });
  } catch (err) {
    console.error("[InactivityAlert] Manual send error:", err.message);
    res.status(500).json({ error: err.message || "Failed to send inactivity alert" });
  }
});

// ─── GET /api/reports/inactivity-config ──────────────────────────────────────
// Returns the current user's inactivity alert config (owner/sales_head only).
router.get("/inactivity-config", authenticate, withOrg, requireOrgRole("admin"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("inactivity_alert_config")
      .select("*")
      .eq("user_id", req.profile.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || null);
  } catch (err) {
    console.error("[InactivityAlert] GET config error:", err.message);
    res.status(500).json({ error: "Failed to fetch inactivity alert config" });
  }
});

// ─── POST /api/reports/inactivity-config ─────────────────────────────────────
// Upserts the current user's inactivity alert config (owner/sales_head only).
router.post("/inactivity-config", authenticate, withOrg, requireOrgRole("admin"), async (req, res) => {
  const { enabled, threshold_days, time_slot, frequency, email_format } = req.body;

  if (!time_slot) return res.status(400).json({ error: "time_slot is required" });
  const effectiveDays = Math.max(1, parseInt(threshold_days) || 3);

  // Scheduled alerts always go to the logged-in user's email only
  const ownerEmail    = req.profile.email;
  const allRecipients = ownerEmail ? [ownerEmail] : [];

  try {
    const { data, error } = await supabase
      .from("inactivity_alert_config")
      .upsert({
        user_id:          req.profile.id,
        enabled:          enabled !== false,
        threshold_days:   effectiveDays,
        time_slot,
        recipient_emails: allRecipients,
        frequency:        frequency || "daily",
        email_format:     email_format || "summary",
        updated_at:       new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;
    console.log(`[InactivityAlert] Config saved by ${req.profile.email} — threshold: ${effectiveDays}d, slot: ${time_slot}, recipients: ${allRecipients.length}`);
    res.json({ success: true, config: data });
  } catch (err) {
    console.error("[InactivityAlert] POST config error:", err.message);
    res.status(500).json({ error: err.message || "Failed to save config" });
  }
});

// ─── GET /api/reports/inactivity-cron ────────────────────────────────────────
// Called every 30 min by GitHub Actions. Finds all enabled configs whose time_slot
// matches the current IST half-hour, checks employee inactivity, and sends alerts.
router.get("/inactivity-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);

  const h24    = nowIst.getUTCHours();
  const rawMin = nowIst.getUTCMinutes();
  const slot_m = rawMin < 30 ? 0 : 30;
  const h12    = h24 % 12 || 12;
  const ampm   = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[InactivityCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}`);

  try {
    const { data: configs, error: cfgErr } = await supabase
      .from("inactivity_alert_config")
      .select("*")
      .eq("enabled", true)
      .eq("time_slot", currentSlot);

    if (cfgErr) throw cfgErr;
    if (!configs || configs.length === 0) {
      return res.json({ success: true, slot: currentSlot, sent: 0, message: "No inactivity configs for this slot" });
    }

    // Apply frequency filter: weekly = Monday only, monthly = 1st of month only
    const dayOfWeek  = nowIst.getUTCDay();  // 0=Sun … 6=Sat
    const dayOfMonth = nowIst.getUTCDate();

    const activeConfigs = configs.filter(cfg => {
      if (cfg.frequency === "weekly")  return dayOfWeek  === 1;  // Monday
      if (cfg.frequency === "monthly") return dayOfMonth === 1;  // 1st
      return true; // daily
    });

    if (activeConfigs.length === 0) {
      return res.json({ success: true, slot: currentSlot, sent: 0, message: "No configs due today based on frequency" });
    }

    // Cache inactivity results per unique threshold to avoid redundant DB calls
    const inactiveCache = {};
    const results = [];

    for (const cfg of activeConfigs) {
      try {
        const key = String(cfg.threshold_days);
        if (!inactiveCache[key]) {
          inactiveCache[key] = await getInactiveEmployees(cfg.threshold_days, nowIst);
        }
        const inactiveEmployees = inactiveCache[key];

        const toEmails = (cfg.recipient_emails || []).filter(Boolean);
        if (toEmails.length === 0) {
          results.push({ user_id: cfg.user_id, status: "skipped", reason: "no_recipients" });
          continue;
        }

        if (inactiveEmployees.length === 0) {
          results.push({ user_id: cfg.user_id, status: "skipped", reason: "no_inactive_employees" });
          continue;
        }

        const html = buildInactivityAlertHtml(inactiveEmployees, cfg.threshold_days, cfg.email_format, nowIst);
        const text = buildInactivityAlertText(inactiveEmployees, cfg.threshold_days);

        await sendMail({
          to:      toEmails,
          subject: `Employee Inactivity Alert — ${inactiveEmployees.length} employee${inactiveEmployees.length !== 1 ? "s" : ""} inactive for ${cfg.threshold_days}+ days`,
          html,
          text,
        });

        results.push({ user_id: cfg.user_id, status: "sent", inactive: inactiveEmployees.length, recipients: toEmails.length });
        console.log(`[InactivityCron] Alert sent (threshold: ${cfg.threshold_days}d) to ${toEmails.length} recipients — ${inactiveEmployees.length} inactive employees`);
      } catch (itemErr) {
        console.error(`[InactivityCron] Failed for user ${cfg.user_id}:`, itemErr.message);
        results.push({ user_id: cfg.user_id, status: "error", error: itemErr.message });
      }
    }

    res.json({ success: true, slot: currentSlot, sent: results.filter(r => r.status === "sent").length, results });
  } catch (err) {
    console.error("[InactivityCron] Fatal error:", err.message);
    res.status(500).json({ error: err.message || "Inactivity cron failed" });
  }
});

// ─── Helper: find employees inactive for >= thresholdDays ────────────────────
async function getInactiveEmployees(thresholdDays, nowIst) {
  const { data: employees, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["inside_sales", "sales_head"])
    .not("status", "in", '("deleted","inactive")')
    .order("full_name");

  if (error || !employees?.length) return [];

  const inactive = [];

  for (const emp of employees) {
    const { data: lastLoginRow } = await supabase
      .from("login_logs")
      .select("logged_in_at")
      .eq("user_id", emp.id)
      .order("logged_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [
      { data: lastAct     },
      { data: lastLead    },
      { data: lastDeal    },
      { data: lastMeeting },
      { data: lastTask    },
    ] = await Promise.all([
      supabase.from("activities").select("created_at").eq("created_by", emp.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("leads").select("created_at").eq("owner_id", emp.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("deals").select("created_at").eq("created_by", emp.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("meetings").select("created_at").eq("created_by", emp.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("tasks").select("updated_at").eq("assigned_to", emp.id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const loginTs = lastLoginRow?.logged_in_at || null;

    // lastSeen is based ONLY on real CRM actions — login does NOT reset inactivity.
    // A user who merely logs in without performing any CRM action is considered inactive.
    const activityTs = [
      lastAct?.created_at,
      lastLead?.created_at,
      lastDeal?.created_at,
      lastMeeting?.created_at,
      lastTask?.updated_at,
    ].filter(Boolean).reduce((max, ts) => (ts > max ? ts : max), "") || null;

    const lastSeenTs = activityTs; // login intentionally excluded

    const daysInactive = lastSeenTs
      ? Math.floor((nowIst.getTime() - new Date(lastSeenTs).getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    if (daysInactive >= thresholdDays) {
      inactive.push({
        id: emp.id,
        name: emp.full_name || emp.email,
        email: emp.email,
        role: emp.role,
        lastLogin:    loginTs,
        lastActivity: activityTs,
        lastSeen:     lastSeenTs,
        daysInactive,
      });
    }
  }

  return inactive;
}

// ─── Build inactivity alert HTML email ───────────────────────────────────────
function buildInactivityAlertHtml(employees, thresholdDays, format, nowIst) {
  const todayStr = nowIst.toISOString().slice(0, 10);
  const rl = r => r === "owner" ? "Super Admin" : r === "sales_head" ? "Sales Head" : r === "inside_sales" ? "Inside Sales" : (r || "").replace(/_/g, " ");
  const fmtDate = (ts) => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  };

  const rows = employees.map(e => {
    const daysLabel = e.daysInactive === 999 ? "Never active" : `${e.daysInactive} days`;
    const color     = e.daysInactive >= 7 ? "#DC2626" : "#D97706";
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:11px 14px;font-size:13px;font-weight:600;color:#111827;">${e.name}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${rl(e.role)}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${fmtDate(e.lastLogin)}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${fmtDate(e.lastActivity)}</td>
        <td style="padding:11px 14px;text-align:center;font-size:13px;font-weight:700;color:${color};">${daysLabel}</td>
      </tr>`;
  }).join("");

  const detailedNote = format === "detailed"
    ? `<tr><td style="padding:0 32px 20px;">
        <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;padding:14px 18px;">
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Inactivity Summary</div>
          <div style="font-size:12.5px;color:#6B7280;line-height:1.7;">
            Total employees monitored: <strong style="color:#111827;">${employees.length}</strong><br/>
            Threshold: <strong style="color:#111827;">${thresholdDays} days</strong><br/>
            Report generated: <strong style="color:#111827;">${todayStr}</strong>
          </div>
        </div>
      </td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:#000;"></td></tr>
  <tr><td style="padding:28px 32px 16px;">
    <div style="font-size:22px;font-weight:800;color:#111827;margin-bottom:4px;">Employee Inactivity Alert</div>
    <div style="font-size:13px;color:#6B7280;">${employees.length} employee${employees.length !== 1 ? "s" : ""} inactive for ${thresholdDays}+ days &nbsp;&middot;&nbsp; ${todayStr}</div>
  </td></tr>
  <tr><td style="padding:0 32px 20px;">
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;font-size:12.5px;color:#92400E;line-height:1.6;">
      The following employees have not logged in or performed any CRM activity for <strong>${thresholdDays}</strong> or more consecutive days. Please review and take necessary action.
    </div>
  </td></tr>
  ${detailedNote}
  <tr><td style="padding:0 32px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Employee</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Role</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Login</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Activity</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Inactive Days</th>
      </tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    &copy; ${new Date().getFullYear()} SALES CRM &nbsp;&middot;&nbsp; Automated Inactivity Alert &nbsp;&middot;&nbsp; Do not reply
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Build inactivity alert plain-text ───────────────────────────────────────
function buildInactivityAlertText(employees, thresholdDays) {
  const rl     = r => r === "owner" ? "Super Admin" : r === "sales_head" ? "Sales Head" : r === "inside_sales" ? "Inside Sales" : (r || "");
  const fmtDt  = ts => ts ? new Date(ts).toLocaleString("en-IN") : "Never";
  const sep    = "=".repeat(80);
  const lines  = employees.map(e =>
    `  ${(e.name).padEnd(28)} | ${rl(e.role).padEnd(14)} | Last Login: ${fmtDt(e.lastLogin).padEnd(22)} | Last Activity: ${fmtDt(e.lastActivity).padEnd(22)} | Inactive: ${e.daysInactive === 999 ? "Never active" : e.daysInactive + " days"}`
  ).join("\n");
  return `${sep}\nEMPLOYEE INACTIVITY ALERT\nThreshold: ${thresholdDays} days\n${sep}\n\n${lines}\n\n${sep}\nPlease review and take necessary action.\n— Sales CRM`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE-BASED INACTIVITY EMAIL WORKFLOW
// Fires daily at 09:00 AM IST. Each user receives email about inactive users
// within their role scope. Zero changes to any existing endpoint or helper.
// ═══════════════════════════════════════════════════════════════════════════════

const ROLE_INACTIVITY_THRESHOLD = 3; // consecutive inactive days before email starts

// ─── GET /api/reports/role-inactivity-cron ───────────────────────────────────
router.get("/role-inactivity-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Compute current IST half-hour slot (mirrors existing inactivity-cron logic)
  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
  const h24         = nowIst.getUTCHours();
  const rawMin      = nowIst.getUTCMinutes();
  const slot_m      = rawMin < 30 ? 0 : 30;
  const h12         = h24 % 12 || 12;
  const ampm        = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[RoleInactivityCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}`);

  // Only execute at the 09:00 AM IST window (GitHub Actions fires at 03:30 UTC = 09:00 IST)
  if (currentSlot !== "09:00 AM") {
    return res.json({ success: true, slot: currentSlot, sent: 0, message: "Not the 09:00 AM IST window — skipped" });
  }

  try {
    const results = await sendRoleBasedInactivityAlerts(nowIst);
    return res.json({ success: true, slot: currentSlot, ...results });
  } catch (err) {
    console.error("[RoleInactivityCron] Fatal error:", err.message);
    return res.status(500).json({ error: err.message || "Role inactivity cron failed" });
  }
});

// ─── Core engine ─────────────────────────────────────────────────────────────
async function sendRoleBasedInactivityAlerts(nowIst) {
  // 1. Load all active users with their manager relationship
  const { data: allUsers, error: usersErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, manager_id")
    .not("status", "in", '("deleted","inactive")')
    .not("email", "is", null)
    .order("full_name");

  if (usersErr) throw usersErr;
  if (!allUsers?.length) return { sent: 0, total_users: 0 };

  // 2. Compute inactivity days for every user (sequential to avoid DB overload)
  const inactivityMap = {};
  for (const user of allUsers) {
    inactivityMap[user.id] = await computeRoleUserInactivity(user, nowIst);
  }

  // 3. For each user determine their role-based scope and send email if needed
  const results = [];

  for (const user of allUsers) {
    try {
      const scopeInactive = getRoleInactiveScope(user, allUsers, inactivityMap);

      if (scopeInactive.length === 0) {
        results.push({ user_id: user.id, status: "skipped", reason: "no_inactive_in_scope" });
        continue;
      }

      const isSelfOnlyReminder =
        scopeInactive.length === 1 && scopeInactive[0].id === user.id;

      let html, text, subject;

      if (isSelfOnlyReminder) {
        const days = inactivityMap[user.id].daysInactive;
        subject = `Action Required: You have been inactive on Sales CRM for ${days} day${days !== 1 ? "s" : ""}`;
        html    = buildSelfInactivityHtml(user, days, nowIst);
        text    = buildSelfInactivityText(user, days);
      } else {
        subject = `Inactivity Alert — ${scopeInactive.length} member${scopeInactive.length !== 1 ? "s" : ""} inactive for ${ROLE_INACTIVITY_THRESHOLD}+ days`;
        html    = buildTeamInactivityHtml(user, scopeInactive, nowIst);
        text    = buildTeamInactivityText(scopeInactive);
      }

      await sendMail({ to: user.email, subject, html, text });
      results.push({ user_id: user.id, status: "sent", inactive_count: scopeInactive.length });
      console.log(`[RoleInactivityCron] Sent to ${user.email} (${user.role}) — ${scopeInactive.length} inactive in scope`);
    } catch (itemErr) {
      console.error(`[RoleInactivityCron] Failed for user ${user.id}:`, itemErr.message);
      results.push({ user_id: user.id, status: "error", error: itemErr.message });
    }
  }

  const sent = results.filter(r => r.status === "sent").length;
  console.log(`[RoleInactivityCron] Done — ${sent}/${allUsers.length} emails sent`);
  return { sent, total_users: allUsers.length, results };
}

// ─── Compute inactivity days for one user ────────────────────────────────────
async function computeRoleUserInactivity(user, nowIst) {
  const { data: lastLoginRow } = await supabase
    .from("login_logs")
    .select("logged_in_at")
    .eq("user_id", user.id)
    .order("logged_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [
    { data: lastAct     },
    { data: lastLead    },
    { data: lastDeal    },
    { data: lastMeeting },
    { data: lastTask    },
  ] = await Promise.all([
    supabase.from("activities").select("created_at").eq("created_by", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("leads").select("created_at").eq("owner_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("deals").select("created_at").eq("created_by", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("meetings").select("created_at").eq("created_by", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tasks").select("updated_at").eq("assigned_to", user.id)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const loginTs    = lastLoginRow?.logged_in_at || null;

  // CRM activity = any meaningful data action. Login never counts.
  const activityTs = [
    lastAct?.created_at,
    lastLead?.created_at,
    lastDeal?.created_at,
    lastMeeting?.created_at,
    lastTask?.updated_at,
  ].filter(Boolean).reduce((max, ts) => (ts > max ? ts : max), "") || null;

  // Compute consecutive days without login AND without CRM activity separately
  const dayMs = 24 * 60 * 60 * 1000;
  const daysWithoutLogin = loginTs
    ? Math.floor((nowIst.getTime() - new Date(loginTs).getTime()) / dayMs)
    : 999;
  const daysWithoutCRMActivity = activityTs
    ? Math.floor((nowIst.getTime() - new Date(activityTs).getTime()) / dayMs)
    : 999;

  // Truly inactive: BOTH conditions must be true (per inactivity policy)
  const isInactive      = daysWithoutLogin >= ROLE_INACTIVITY_THRESHOLD && daysWithoutCRMActivity >= ROLE_INACTIVITY_THRESHOLD;
  // Logged in but no productive CRM work (informational only — not counted as inactive)
  const isLoggedInNoWork = !isInactive && daysWithoutLogin < ROLE_INACTIVITY_THRESHOLD && daysWithoutCRMActivity >= ROLE_INACTIVITY_THRESHOLD;

  const daysInactive = isInactive
    ? Math.max(daysWithoutLogin, daysWithoutCRMActivity)
    : 0;

  return {
    id:                   user.id,
    name:                 user.full_name || user.email,
    email:                user.email,
    role:                 user.role,
    manager_id:           user.manager_id,
    lastLogin:            loginTs,
    lastActivity:         activityTs,
    daysWithoutLogin,
    daysWithoutCRMActivity,
    isInactive,
    isLoggedInNoWork,
    daysInactive,
  };
}

// ─── Determine inactive users within a user's role-based scope ───────────────
function getRoleInactiveScope(user, allUsers, inactivityMap) {
  const allInactive = Object.values(inactivityMap)
    .filter(u => u.daysInactive >= ROLE_INACTIVITY_THRESHOLD);

  if (user.role === "owner") {
    // Super Admin sees ALL inactive users across the organisation
    return allInactive;
  }

  if (user.role === "sales_head") {
    // Sales Head sees: self + direct reports + their reports (2-level tree)
    const level1Ids = allUsers
      .filter(u => u.manager_id === user.id)
      .map(u => u.id);
    const level2Ids = allUsers
      .filter(u => level1Ids.includes(u.manager_id))
      .map(u => u.id);
    const scopeIds = new Set([user.id, ...level1Ids, ...level2Ids]);
    return allInactive.filter(u => scopeIds.has(u.id));
  }

  if (user.role === "sales_manager") {
    // Sales Manager sees: self + direct reports only
    const directIds = allUsers
      .filter(u => u.manager_id === user.id)
      .map(u => u.id);
    const scopeIds = new Set([user.id, ...directIds]);
    return allInactive.filter(u => scopeIds.has(u.id));
  }

  if (user.role === "employee" || user.role === "inside_sales") {
    // Sales/Inside Sales Employee sees only themselves
    return allInactive.filter(u => u.id === user.id);
  }

  return [];
}

// ─── Scope helper for two-email inactivity system ─────────────────────────────
// Returns the list of users this person monitors (login activity + inactivity).
// Role visibility rules:
//   owner        → all non-owner users (Sales Heads, Managers, Employees, Inside Sales) — NOT other owners, NOT self
//   sales_head   → their Managers, Employees, Inside Sales (by reporting chain) — NOT other Sales Heads, NOT owners, NOT self
//   sales_manager → self + direct reports (Employees and Inside Sales)
//   employee / inside_sales → self only
function getUserScopeForInactivity(user, allUsers) {
  if (user.role === "owner") {
    return allUsers.filter((u) => u.id !== user.id && u.role !== "owner");
  }
  if (user.role === "sales_head") {
    const directIds = new Set(allUsers.filter((u) => u.manager_id === user.id).map((u) => u.id));
    const indirectIds = new Set(allUsers.filter((u) => directIds.has(u.manager_id)).map((u) => u.id));
    const scopeIds = new Set([...directIds, ...indirectIds]);
    return allUsers.filter((u) => scopeIds.has(u.id) && u.role !== "owner" && u.role !== "sales_head");
  }
  if (user.role === "sales_manager") {
    const directIds = allUsers.filter((u) => u.manager_id === user.id).map((u) => u.id);
    return allUsers.filter((u) => u.id === user.id || directIds.includes(u.id));
  }
  return allUsers.filter((u) => u.id === user.id);
}

// ─── Email: personal inactivity reminder (employee / inside_sales) ────────────
function buildSelfInactivityHtml(user, daysInactive, nowIst) {
  const todayStr  = nowIst.toISOString().slice(0, 10);
  const firstName = (user.full_name || user.email).split(" ")[0];
  const urgency   = daysInactive >= 7 ? "#DC2626" : "#D97706";
  const crmUrl    = (process.env.FRONTEND_URL || "http://localhost:5173");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:#1E3A5F;"></td></tr>
  <tr><td style="padding:32px 36px 20px;">
    <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:6px;">Hi ${firstName},</div>
    <div style="font-size:14px;color:#6B7280;line-height:1.6;margin-bottom:20px;">
      You have not logged into <strong style="color:#111827;">Sales CRM</strong> for
      <strong style="color:${urgency};font-size:16px;"> ${daysInactive} consecutive day${daysInactive !== 1 ? "s" : ""}</strong>.
    </div>
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:14px 18px;font-size:13px;color:#92400E;line-height:1.6;margin-bottom:24px;">
      Regular login ensures you stay updated on leads, deals, meetings, and team activity.
      Staying active helps you and your team hit targets on time.
    </div>
    <a href="${crmUrl}" style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;">
      Log In to Sales CRM →
    </a>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:16px 36px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    This reminder was sent on ${todayStr} because your account has been inactive for ${daysInactive}+ days.
    It will stop automatically once you log in. &nbsp;&middot;&nbsp; Sales CRM
  </td></tr>
</table></td></tr></table></body></html>`;
}

function buildSelfInactivityText(user, daysInactive) {
  const firstName = (user.full_name || user.email).split(" ")[0];
  const crmUrl    = (process.env.FRONTEND_URL || "http://localhost:5173");
  return `Hi ${firstName},\n\nYou have not logged into Sales CRM for ${daysInactive} consecutive day${daysInactive !== 1 ? "s" : ""}.\n\nPlease log in to stay updated on your leads, deals, and team activity.\n\n${crmUrl}\n\nThis reminder stops automatically once you log in.\n— Sales CRM`;
}

// ─── Email: team / org-wide inactivity report (for managers/heads/owners) ─────
function buildTeamInactivityHtml(recipient, inactiveUsers, nowIst) {
  const todayStr  = nowIst.toISOString().slice(0, 10);
  const firstName = (recipient.full_name || recipient.email).split(" ")[0];
  const rl        = r => r === "owner" ? "Super Admin" : r === "sales_head" ? "Sales Head" : r === "sales_manager" ? "Sales Manager" : r === "inside_sales" ? "Inside Sales" : "Sales Employee";
  const fmtDate   = ts => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  };

  const rows = inactiveUsers.map(e => {
    const daysLabel = e.daysInactive === 999 ? "Never active" : `${e.daysInactive} days`;
    const color     = e.daysInactive >= 7 ? "#DC2626" : "#D97706";
    const selfTag   = e.id === recipient.id ? ` <span style="background:#EEF2FF;color:#4F46E5;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">You</span>` : "";
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:11px 14px;font-size:13px;font-weight:600;color:#111827;">${e.name}${selfTag}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${rl(e.role)}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${fmtDate(e.lastLogin)}</td>
        <td style="padding:11px 14px;font-size:12px;color:#6B7280;">${fmtDate(e.lastActivity)}</td>
        <td style="padding:11px 14px;text-align:center;font-size:13px;font-weight:700;color:${color};">${daysLabel}</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:#1E3A5F;"></td></tr>
  <tr><td style="padding:28px 32px 16px;">
    <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:4px;">Hi ${firstName}, — Inactivity Alert</div>
    <div style="font-size:13px;color:#6B7280;">${inactiveUsers.length} member${inactiveUsers.length !== 1 ? "s" : ""} inactive for ${ROLE_INACTIVITY_THRESHOLD}+ days &nbsp;&middot;&nbsp; ${todayStr}</div>
  </td></tr>
  <tr><td style="padding:0 32px 20px;">
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;font-size:12.5px;color:#92400E;line-height:1.6;">
      The following member${inactiveUsers.length !== 1 ? "s" : ""} within your team ${inactiveUsers.length !== 1 ? "have" : "has"} not logged in or performed any CRM activity
      for <strong>${ROLE_INACTIVITY_THRESHOLD}</strong> or more consecutive days. Please follow up.
    </div>
  </td></tr>
  <tr><td style="padding:0 32px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Name</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Role</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Login</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Activity</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;">Inactive Days</th>
      </tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    &copy; ${new Date().getFullYear()} SALES CRM &nbsp;&middot;&nbsp; Role-Based Inactivity Alert &nbsp;&middot;&nbsp; Sent daily at 9:00 AM IST until users log in &nbsp;&middot;&nbsp; Do not reply
  </td></tr>
</table></td></tr></table></body></html>`;
}

function buildTeamInactivityText(inactiveUsers) {
  const rl   = r => r === "owner" ? "Super Admin" : r === "sales_head" ? "Sales Head" : r === "sales_manager" ? "Sales Manager" : r === "inside_sales" ? "Inside Sales" : "Sales Employee";
  const fmtDt = ts => ts ? new Date(ts).toLocaleString("en-IN") : "Never";
  const sep   = "=".repeat(80);
  const lines = inactiveUsers.map(e =>
    `  ${(e.name).padEnd(28)} | ${rl(e.role).padEnd(14)} | Last Login: ${fmtDt(e.lastLogin).padEnd(22)} | Inactive: ${e.daysInactive === 999 ? "Never active" : e.daysInactive + " days"}`
  ).join("\n");
  return `${sep}\nTEAM INACTIVITY ALERT — ${ROLE_INACTIVITY_THRESHOLD}+ DAYS\n${sep}\n\n${lines}\n\n${sep}\nPlease follow up with inactive team members.\n— Sales CRM`;
}

// ─── GET /api/reports/role-dsr-cron ──────────────────────────────────────────
// NEW IMPLEMENTATION — Dashboard-style DSR (revamped 2026-07).
// Called every 30 min by GitHub Actions. Fires at 07:30 PM IST (target 7:40 PM IST).
// Role hierarchy: owner=org, sales_head=team, sales_manager=team, employee/inside_sales=self.
// Duplicate prevention: skips if already sent today (unless ?force=true).
router.get("/role-dsr-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const forceRun = req.query.force === "true";

  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
  const h24         = nowIst.getUTCHours();
  const rawMin      = nowIst.getUTCMinutes();
  const slot_m      = rawMin < 30 ? 0 : 30;
  const h12         = h24 % 12 || 12;
  const ampm        = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2,"0")}:${String(slot_m).padStart(2,"0")} ${ampm}`;

  console.log(`[NewDSRCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}${forceRun ? " (FORCED)" : ""}`);

  if (!forceRun && currentSlot !== "07:30 PM") {
    return res.json({ success: true, slot: currentSlot, sent: 0, message: "Not the 07:30 PM IST window — skipped" });
  }

  const pad      = n => String(n).padStart(2, "0");
  const todayStr = `${nowIst.getUTCFullYear()}-${pad(nowIst.getUTCMonth()+1)}-${pad(nowIst.getUTCDate())}`;
  const dayStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
  const dayEnd   = new Date(`${todayStr}T23:59:59+05:30`).toISOString();
  const dateLabel = nowIst.toLocaleDateString("en-IN", {
    weekday:"long", year:"numeric", month:"long", day:"numeric", timeZone:"Asia/Kolkata",
  });

  // Duplicate prevention
  if (!forceRun) {
    const { data: existing } = await supabase
      .from("dsr_email_logs")
      .select("id")
      .eq("report_date", todayStr)
      .eq("report_type", "new_role_daily")
      .eq("delivery_status", "sent")
      .limit(1);
    if (existing?.length > 0) {
      console.log(`[NewDSRCron] Already sent for ${todayStr} — skipping.`);
      return res.json({ success: true, skipped: true, reason: "already_sent_today", date: todayStr });
    }
  }

  try {
    const results = await sendNewRoleBasedDSR({ dayStart, dayEnd, dateLabel, todayStr });

    if (!forceRun) {
      try {
        await supabase.from("dsr_email_logs").insert({
          recipients:      [],
          report_date:     todayStr,
          report_type:     "new_role_daily",
          delivery_status: "sent",
          recipient_count: results.sent || 0,
        });
      } catch (logErr) {
        console.warn("[NewDSRCron] Audit log insert failed:", logErr.message);
      }
    }

    return res.json({ success: true, slot: currentSlot, forced: forceRun, ...results });
  } catch (err) {
    console.error("[NewDSRCron] Fatal error:", err.message, err.stack);
    return res.status(500).json({ error: err.message || "DSR cron failed" });
  }
});

// ─── New DSR engine (dashboard-style, revamped 2026-07) ──────────────────────
async function sendNewRoleBasedDSR({ dayStart, dayEnd, dateLabel, todayStr }) {
  // TESTING MODE: if DSR_TEST_EMAIL is set, all emails go only to that address
  const TEST_EMAIL = process.env.DSR_TEST_EMAIL || null;
  if (TEST_EMAIL) console.log(`[NewDSR] ⚠️  TEST MODE — all emails redirected to ${TEST_EMAIL}`);

  // 1. Collect all day's data in one optimised pass
  const dsrData = await collectDsrData(dayStart, dayEnd, todayStr);
  const { allProfiles, profileMap, statsMap, meetings } = dsrData;

  // 2. Determine recipients (all roles)
  const RECIPIENT_ROLES = ["owner","sales_head","sales_manager","sales_employee","inside_sales"];
  let recipients = allProfiles.filter(u => RECIPIENT_ROLES.includes(u.role) && u.email);

  // Test-mode restriction: DSR_TEST_NAMES env var (comma-separated partial full names)
  const testNames = process.env.DSR_TEST_NAMES
    ? process.env.DSR_TEST_NAMES.split(",").map(n => n.trim().toLowerCase()).filter(Boolean)
    : null;
  if (testNames?.length) {
    const before = recipients.length;
    recipients = recipients.filter(u => testNames.some(t => (u.full_name||"").toLowerCase().includes(t)));
    console.log(`[NewDSR] TEST MODE — ${recipients.length}/${before} match DSR_TEST_NAMES`);
  }

  if (!recipients.length) return { sent: 0, total_recipients: 0 };

  const ddmmyyyy  = todayStr.split("-").reverse().join("/");
  const subject   = `Daily Sales Report | ${ddmmyyyy}`;
  let sent = 0;
  const errors = [];

  for (const recipient of recipients) {
    try {
      // 3. Scope: which profiles this recipient can see
      const scopeProfiles = getScopeProfiles(recipient, allProfiles);
      if (!scopeProfiles.length) continue;

      // 4. Scoped meetings (only for employees in scope)
      const scopeIds      = new Set(scopeProfiles.map(p => p.id));
      const scopeMeetings = meetings.filter(m => !m.created_by || scopeIds.has(m.created_by));

      // 5. Totals for this recipient's scope
      const scopeTotals = calcScopeTotals(scopeProfiles, statsMap);

      const generatedAt = new Date().toISOString();

      // 6. Generate dashboard HTML email
      const html = buildDsrEmailHtml({
        recipientName:  recipient.full_name || recipient.email,
        recipientRole:  recipient.role,
        dateLabel,
        generatedAt,
        scopeProfiles,
        scopeTotals,
        statsMap,
        meetings:       scopeMeetings,
        profileMap,
      });

      // 7. Generate detailed PDF
      const pdfBuffer = await generateNewDsrPdf({
        recipientName:  recipient.full_name || recipient.email,
        recipientRole:  recipient.role,
        dateLabel,
        generatedAt,
        scopeProfiles,
        scopeTotals,
        statsMap,
        meetings:       scopeMeetings,
        profileMap,
      });

      const text = buildDsrEmailText({
        recipientName:  recipient.full_name || recipient.email,
        recipientRole:  recipient.role,
        dateLabel,
        scopeTotals,
        scopeProfiles,
        statsMap,
      });

      // 8. Send (TEST_EMAIL overrides recipient in testing mode)
      await sendMail({
        to:      TEST_EMAIL ? [TEST_EMAIL] : [recipient.email],
        subject: TEST_EMAIL ? `[TEST → ${recipient.email}] ${subject}` : subject,
        html,
        text,
        attachments: [{
          filename:     `Sales CRM-DSR-${todayStr}.pdf`,
          content:      pdfBuffer.toString("base64"),
          content_type: "application/pdf",
        }],
      });

      console.log(`[NewDSR] Sent to ${recipient.email} (${recipient.role}) — ${scopeProfiles.length} members in scope`);
      sent++;
    } catch (err) {
      console.error(`[NewDSR] Error for ${recipient.email}:`, err.message);
      errors.push({ email: recipient.email, error: err.message });
    }
  }

  console.log(`[NewDSR] Done — ${sent}/${recipients.length} sent`);
  return { sent, total_recipients: recipients.length, errors: errors.length ? errors : undefined };
}


// ─── GET /api/reports/comprehensive-inactivity-cron ───────────────────────────
// Runs every day at 10:30 AM IST (covering the 10:40 AM IST requirement).
// Sends role-scoped inactivity emails with detailed HTML + PDF to ALL user tiers:
//   owner        → all inactive users across the organisation
//   sales_head   → inactive users in their full hierarchy
//   sales_manager → self + direct reports
//   inside_sales / employee → self only (only if they themselves are inactive)
// Uses existing computeRoleUserInactivity + getRoleInactiveScope — unchanged.
router.get("/comprehensive-inactivity-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
  const h24         = nowIst.getUTCHours();
  const rawMin      = nowIst.getUTCMinutes();
  const slot_m      = rawMin < 30 ? 0 : 30;
  const h12         = h24 % 12 || 12;
  const ampm        = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[ComprehensiveInactivityCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}`);

  if (currentSlot !== "11:00 AM") {
    return res.json({ success: true, slot: currentSlot, sent: 0, message: "Not the 11:00 AM IST window — skipped" });
  }

  try {
    const results = await sendComprehensiveInactivityAlerts(nowIst);
    return res.json({ success: true, slot: currentSlot, ...results });
  } catch (err) {
    console.error("[ComprehensiveInactivityCron] Fatal error:", err.message);
    return res.status(500).json({ error: err.message || "Comprehensive inactivity cron failed" });
  }
});

// ─── Comprehensive inactivity engine (two-email system) ──────────────────────
// Email 1: Login Activity Report → owners, sales_heads, sales_managers
// Email 2: Inactivity Report     → all roles (self-only for employees/inside_sales)
async function sendComprehensiveInactivityAlerts(nowIst) {
  const rl = (r) =>
    r === "owner"           ? "Super Admin"
    : r === "sales_head"    ? "Sales Head"
    : r === "sales_manager" ? "Sales Manager"
    : r === "inside_sales"  ? "Inside Sales"
    : (r || "Staff").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const fmtTs = (ts) =>
    ts ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

  const generatedAt = nowIst.toLocaleString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " IST";
  const pad        = (n) => String(n).padStart(2, "0");
  const todayStr   = `${nowIst.getUTCFullYear()}-${pad(nowIst.getUTCMonth() + 1)}-${pad(nowIst.getUTCDate())}`;
  const dayStart   = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
  const dayEnd     = new Date(`${todayStr}T23:59:59+05:30`).toISOString();

  // 1. Load all active users
  const { data: allUsers, error: usersErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, manager_id")
    .not("status", "in", '("deleted","inactive")')
    .not("email", "is", null)
    .order("full_name");

  if (usersErr) throw usersErr;
  if (!allUsers?.length) return { sent: 0, total_users: 0 };

  const userById = {};
  allUsers.forEach((u) => { userById[u.id] = u; });

  // 2. Fetch today's login events (for Login Activity Report)
  const { data: loginLogs } = await supabase
    .from("login_logs")
    .select("user_id, logged_in_at, city, country")
    .gte("logged_in_at", dayStart)
    .lte("logged_in_at", dayEnd);

  const loginsByUser = {};
  for (const log of (loginLogs || [])) {
    if (!loginsByUser[log.user_id]) loginsByUser[log.user_id] = [];
    loginsByUser[log.user_id].push(log);
  }

  // 3. Compute inactivity for every user
  const inactivityMap = {};
  for (const user of allUsers) {
    inactivityMap[user.id] = await computeRoleUserInactivity(user, nowIst);
  }

  let sent = 0;
  const errors = [];

  // 4. Send emails per user based on role scope
  for (const user of allUsers) {
    try {
      const scope = getUserScopeForInactivity(user, allUsers);

      // ── Email 1: Login Activity Report (managers only) ───────────────────────
      if (["owner", "sales_head", "sales_manager"].includes(user.role) && scope.length > 0) {
        const loginData = scope.map((u) => ({
          id:           u.id,
          name:         u.full_name || u.email,
          role:         u.role,
          managerName:  u.manager_id && userById[u.manager_id]
            ? (userById[u.manager_id].full_name || userById[u.manager_id].email)
            : "—",
          loginCount:    (loginsByUser[u.id] || []).length,
          loggedInToday: (loginsByUser[u.id] || []).length > 0,
          lastLoginTime: (loginsByUser[u.id] || []).length > 0
            ? (loginsByUser[u.id] || []).reduce((mx, l) => l.logged_in_at > mx ? l.logged_in_at : mx, "")
            : null,
          location: [...new Set((loginsByUser[u.id] || []).map((l) => l.city).filter(Boolean))].join(", ") || "—",
        }));

        await sendMail({
          to:      user.email,
          subject: `Login Activity Report — ${todayStr}`,
          html:    buildLoginActivityReportHtml(user, loginData, generatedAt, todayStr, rl, fmtTs),
          text:    buildLoginActivityReportText(user, loginData, todayStr, rl),
        });
        sent++;
        console.log(`[ComprehensiveInactivityCron] Login Activity sent to ${user.email} (${rl(user.role)}) — ${loginData.filter((u) => u.loggedInToday).length}/${loginData.length} active`);
      }

      // ── Email 2: Inactivity Report ─────────────────────────────────────────────
      // Dual condition: a user is inactive ONLY IF BOTH
      //   - No login for 3+ days  AND  - No CRM activity for 3+ days
      // "Logged in but no CRM work" is shown as a separate informational section.
      const ddmmyyyy = todayStr.split("-").reverse().join("/");

      if (["owner", "sales_head", "sales_manager"].includes(user.role)) {
        const enrichUser = (u) => ({
          ...u,
          shortId:     u.id.split("-")[0].toUpperCase(),
          managerName: u.manager_id && userById[u.manager_id]
            ? (userById[u.manager_id].full_name || userById[u.manager_id].email)
            : "—",
        });

        const inactiveUsers    = scope.map((u) => inactivityMap[u.id]).filter((u) => u?.isInactive).map(enrichUser);
        const loggedInNoWork   = scope.map((u) => inactivityMap[u.id]).filter((u) => u?.isLoggedInNoWork).map(enrichUser);

        if (inactiveUsers.length > 0 || loggedInNoWork.length > 0) {
          await sendMail({
            to:      user.email,
            subject: `Daily Inactivity Report – ${ddmmyyyy}`,
            html:    buildInactivityReportHtml(user, inactiveUsers, loggedInNoWork, generatedAt, todayStr, rl, fmtTs),
            text:    buildInactivityReportText(user, inactiveUsers, generatedAt, rl),
          });
          sent++;
          console.log(`[ComprehensiveInactivityCron] Inactivity sent to ${user.email} (${rl(user.role)}) — ${inactiveUsers.length} inactive, ${loggedInNoWork.length} logged-in-no-work`);
        }

      } else {
        // employee / inside_sales: self-alert only when BOTH conditions are met
        const self = inactivityMap[user.id];
        if (self?.isInactive) {
          await sendMail({
            to:      user.email,
            subject: `Daily Inactivity Report – ${ddmmyyyy}`,
            html:    buildSelfInactivityHtml(user, self.daysWithoutCRMActivity, nowIst),
            text:    buildSelfInactivityText(user, self.daysWithoutCRMActivity),
          });
          sent++;
          console.log(`[ComprehensiveInactivityCron] Self-inactivity sent to ${user.email} (${rl(user.role)}) — ${self.daysWithoutCRMActivity}d no CRM work`);
        }
      }

    } catch (err) {
      console.error(`[ComprehensiveInactivityCron] Error for ${user.id}:`, err.message);
      errors.push({ user_id: user.id, error: err.message });
    }
  }

  console.log(`[ComprehensiveInactivityCron] Done — ${sent} emails sent`);
  return { sent, total_users: allUsers.length, errors: errors.length ? errors : undefined };
}

// ─── Login Activity Report HTML ───────────────────────────────────────────────
function buildLoginActivityReportHtml(recipient, loginData, generatedAt, todayStr, rl, fmtTs) {
  const firstName   = (recipient.full_name || "").split(" ")[0] || "Team";
  const activeCount = loginData.filter((u) => u.loggedInToday).length;
  const absentCount = loginData.length - activeCount;

  const rows = loginData.map((u) => `
    <tr style="border-bottom:1px solid #F3F4F6;">
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#111827;">${u.name}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${rl(u.role)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${u.managerName}</td>
      <td style="padding:10px 12px;text-align:center;">
        <span style="font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600;${
          u.loggedInToday
            ? "background:#DCFCE7;color:#16A34A;border:1px solid #86EFAC;"
            : "background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;"
        }">${u.loggedInToday ? "Active" : "Not Logged In"}</span>
      </td>
      <td style="padding:10px 12px;text-align:center;font-size:13px;color:#374151;">${u.loginCount}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${u.lastLoginTime ? fmtTs(u.lastLoginTime) : "—"}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${u.location}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:linear-gradient(90deg,#1E3A5F,#2563EB);"></td></tr>
  <tr><td style="padding:28px 32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:21px;font-weight:800;color:#111827;margin-bottom:4px;">Hi ${firstName}, — Login Activity Report</div>
        <div style="font-size:13px;color:#6B7280;">${loginData.length} member${loginData.length !== 1 ? "s" : ""} in scope &nbsp;·&nbsp; Report date: ${todayStr} &nbsp;·&nbsp; Generated: ${generatedAt}</div>
      </td>
      <td style="text-align:right;vertical-align:top;">
        <span style="font-size:11px;padding:4px 10px;background:#DBEAFE;color:#1D4ED8;border-radius:99px;font-weight:700;border:1px solid #BFDBFE;">${rl(recipient.role)}</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:0 32px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#16A34A;">${activeCount}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Active Today</div>
        </td>
        <td style="padding:16px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#DC2626;">${absentCount}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Not Logged In</div>
        </td>
        <td style="padding:16px 20px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#0F172A;">${loginData.length}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Total in Scope</div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 28px;overflow-x:auto;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;min-width:700px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;">Name</th>
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Role</th>
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Manager</th>
        <th style="padding:9px 12px;text-align:center;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Status</th>
        <th style="padding:9px 12px;text-align:center;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Logins</th>
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Last Login</th>
        <th style="padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#6B7280;text-transform:uppercase;">Location</th>
      </tr>
      <tbody>${rows}</tbody>
    </table>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:14px 32px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    &copy; ${new Date().getFullYear()} SALES CRM &nbsp;·&nbsp; Automated Login Activity Report &nbsp;·&nbsp; Generated: ${generatedAt} &nbsp;·&nbsp; Do not reply
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Login Activity Report plain-text ─────────────────────────────────────────
function buildLoginActivityReportText(recipient, loginData, todayStr, rl) {
  const sep    = "─".repeat(60);
  const active = loginData.filter((u) => u.loggedInToday).length;
  const lines  = loginData.map((u) =>
    `${u.name} (${rl(u.role)}) | ${u.loggedInToday ? `Active — ${u.loginCount} login(s)` : "Not Logged In"} | Manager: ${u.managerName}`
  ).join("\n");
  return `${sep}\nSALES CRM — LOGIN ACTIVITY REPORT — ${todayStr}\nRecipient: ${recipient.full_name || recipient.email} (${rl(recipient.role)})\n${sep}\n\nActive: ${active} / Total: ${loginData.length}\n\n${lines}\n\n${sep}\n— Sales CRM`;
}

// ─── Inactivity Report HTML ───────────────────────────────────────────────────
// inactiveUsers    = BOTH no-login AND no-CRM-activity >= threshold (truly inactive)
// loggedInNoWork   = logged in recently but no CRM activity >= threshold (informational)
function buildInactivityReportHtml(recipient, inactiveUsers, loggedInNoWork, generatedAt, todayStr, rl, fmtTs) {
  const firstName = (recipient.full_name || "").split(" ")[0] || "Team";
  const ddmmyyyy  = todayStr.split("-").reverse().join("/");

  const tRows = inactiveUsers.map((e) => `
    <tr style="border-bottom:1px solid #F3F4F6;">
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#111827;">${e.name}</td>
      <td style="padding:10px 12px;font-size:11.5px;color:#6B7280;font-family:monospace;">${e.shortId}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${rl(e.role)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${e.managerName}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${fmtTs(e.lastLogin)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${fmtTs(e.lastActivity)}</td>
      <td style="padding:10px 12px;text-align:center;font-size:13px;font-weight:700;color:#DC2626;">${e.daysWithoutLogin===999?"Never":""+e.daysWithoutLogin+"d"}</td>
      <td style="padding:10px 12px;text-align:center;font-size:13px;font-weight:700;color:#DC2626;">${e.daysWithoutCRMActivity===999?"Never":""+e.daysWithoutCRMActivity+"d"}</td>
      <td style="padding:10px 12px;text-align:center;">
        <span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;font-weight:600;">Inactive</span>
      </td>
    </tr>`).join("");

  const noWorkRows = (loggedInNoWork || []).map((e) => `
    <tr style="border-bottom:1px solid #F3F4F6;">
      <td style="padding:9px 12px;font-size:13px;font-weight:600;color:#111827;">${e.name}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;">${rl(e.role)}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;">${e.managerName}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;">${fmtTs(e.lastLogin)}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;">${fmtTs(e.lastActivity)}</td>
      <td style="padding:9px 12px;text-align:center;font-size:13px;font-weight:700;color:#D97706;">${e.daysWithoutCRMActivity===999?"Never":""+e.daysWithoutCRMActivity+"d"}</td>
      <td style="padding:9px 12px;text-align:center;">
        <span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#FEF9C3;color:#92400E;border:1px solid #FCD34D;font-weight:600;">Logged In, No CRM Work</span>
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
  <tr><td style="height:4px;background:linear-gradient(90deg,#DC2626,#7C3AED);"></td></tr>
  <tr><td style="padding:28px 32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:21px;font-weight:800;color:#111827;margin-bottom:4px;">Hi ${firstName}, — Inactivity Report</div>
        <div style="font-size:13px;color:#6B7280;">Daily Inactivity Report &nbsp;·&nbsp; ${ddmmyyyy} &nbsp;·&nbsp; ${inactiveUsers.length} inactive</div>
      </td>
      <td style="text-align:right;vertical-align:top;">
        <span style="font-size:11px;padding:4px 10px;background:#FEF2F2;color:#DC2626;border-radius:99px;font-weight:700;border:1px solid #FECACA;">${rl(recipient.role)}</span>
      </td>
    </tr></table>
  </td></tr>
  ${inactiveUsers.length > 0 ? `
  <tr><td style="padding:0 32px 6px;">
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:11px 16px;font-size:12.5px;color:#7F1D1D;line-height:1.6;">
      <strong>Truly Inactive</strong> — no login AND no CRM activity for <strong>${ROLE_INACTIVITY_THRESHOLD}+</strong> consecutive days. Both conditions must be met.
    </div>
  </td></tr>
  <tr><td style="padding:8px 32px 20px;overflow-x:auto;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;min-width:760px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Name</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">ID</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Role</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Manager</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Last Login</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Last CRM Activity</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">No Login</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">No CRM Work</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Status</th>
      </tr>
      <tbody>${tRows}</tbody>
    </table>
  </td></tr>` : ''}
  ${noWorkRows ? `
  <tr><td style="padding:0 32px 6px;">
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:11px 16px;font-size:12.5px;color:#92400E;line-height:1.6;">
      <strong>Logged In but No CRM Work</strong> — these members logged in recently but performed no meaningful CRM activity for ${ROLE_INACTIVITY_THRESHOLD}+ days. <em>Informational only — not counted as inactive.</em>
    </div>
  </td></tr>
  <tr><td style="padding:8px 32px 28px;overflow-x:auto;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;min-width:700px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Name</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Role</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Manager</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Last Login</th>
        <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Last CRM Activity</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Days No CRM Work</th>
        <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;white-space:nowrap;">Status</th>
      </tr>
      <tbody>${noWorkRows}</tbody>
    </table>
  </td></tr>` : ''}
  <tr><td style="background:#F9FAFB;padding:14px 32px;border-top:1px solid #E5E7EB;font-size:11.5px;color:#9CA3AF;">
    &copy; ${new Date().getFullYear()} SALES CRM &nbsp;·&nbsp; Daily Inactivity Report &nbsp;·&nbsp; Generated: ${generatedAt} &nbsp;·&nbsp; Do not reply
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Inactivity Report plain-text ─────────────────────────────────────────────
function buildInactivityReportText(recipient, inactiveUsers, generatedAt, rl) {
  const sep   = "─".repeat(60);
  const lines = inactiveUsers.map((u) =>
    `${u.name} (${rl(u.role)}) | Manager: ${u.managerName} | Inactive: ${u.daysInactive === 999 ? "Never active" : u.daysInactive + " days"}`
  ).join("\n");
  return `${sep}\nSALES CRM — INACTIVITY REPORT — ${generatedAt}\nRecipient: ${recipient.full_name || recipient.email} (${rl(recipient.role)})\n${sep}\n\n${lines}\n\n${sep}\nPlease follow up with inactive team members.\n— Sales CRM`;
}

// ─── GET /api/reports/lead-inactivity-cron ────────────────────────────────────
// Runs at 09:00 AM IST daily. Add ?force=true to bypass the slot check for testing.
router.get("/lead-inactivity-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const forceRun    = req.query.force === "true";
  const nowUtc      = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst      = new Date(nowUtc.getTime() + istOffsetMs);
  const h24         = nowIst.getUTCHours();
  const rawMin      = nowIst.getUTCMinutes();
  const slot_m      = rawMin < 30 ? 0 : 30;
  const h12         = h24 % 12 || 12;
  const ampm        = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  console.log(`[LeadInactivityCron] ${nowUtc.toISOString()} → IST slot: ${currentSlot}`);

  if (!forceRun && currentSlot !== "09:00 AM") {
    return res.json({ success: true, slot: currentSlot, processed: 0, message: "Not the 09:00 AM IST window — skipped" });
  }

  try {
    const results = await runLeadInactivityCheck(nowIst);
    return res.json({ success: true, slot: currentSlot, forced: forceRun, ...results });
  } catch (err) {
    console.error("[LeadInactivityCron] Fatal:", err.message);
    return res.status(500).json({ error: err.message || "Lead inactivity cron failed" });
  }
});

// ─── Lead inactivity engine ───────────────────────────────────────────────────
const LEAD_THRESHOLD_7  = 7;
const LEAD_THRESHOLD_25 = 25;
const LEAD_THRESHOLD_30 = 30;

async function runLeadInactivityCheck(nowIst) {
  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = nowIst.getTime();

  // Load all active assigned leads (skip terminal stages)
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, company_name, contact_name, assigned_to, created_at, inactivity_status")
    .not("assigned_to", "is", null)
    .not("stage", "in", '("won","lost","converted","pipeline")');

  if (leadsErr) throw leadsErr;
  if (!leads?.length) return { processed: 0, warned7: 0, warned25: 0, unassigned: 0 };

  const leadIds = leads.map(l => l.id);

  // Batch load latest activity per lead (ordered DESC so first hit = latest)
  const { data: activities } = await supabase
    .from("activities")
    .select("lead_id, created_at")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  const lastActMap = {};
  for (const act of (activities || [])) {
    if (!lastActMap[act.lead_id]) lastActMap[act.lead_id] = act.created_at;
  }

  // Load admins/heads for unassignment notifications
  const { data: admins } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["owner", "sales_head"])
    .not("email", "is", null);

  let processed = 0, warned7 = 0, warned25 = 0, unassigned = 0;
  const errors = [];

  for (const lead of leads) {
    try {
      const lastActTs    = lastActMap[lead.id] || lead.created_at;
      const daysInactive = Math.floor((nowMs - new Date(lastActTs).getTime()) / dayMs);
      const leadName     = lead.company_name || lead.contact_name || "A lead";

      if (daysInactive < LEAD_THRESHOLD_7) {
        // Lead is active again — reset if previously flagged
        if (lead.inactivity_status && lead.inactivity_status !== "active") {
          await supabase.from("leads")
            .update({ last_activity_at: lastActTs, inactivity_status: "active" })
            .eq("id", lead.id);
          await supabase.from("notifications")
            .delete()
            .eq("entity_id", lead.id).eq("entity_type", "lead").eq("type", "general");
        } else {
          await supabase.from("leads").update({ last_activity_at: lastActTs }).eq("id", lead.id);
        }

      } else if (daysInactive >= LEAD_THRESHOLD_30 && lead.inactivity_status !== "auto_unassigned") {
        // ── AUTO-UNASSIGN ──
        const prevOwner = lead.assigned_to;
        await supabase.from("leads").update({
          assigned_to:          null,
          inactivity_status:    "auto_unassigned",
          previous_assigned_to: prevOwner,
          unassigned_at:        new Date().toISOString(),
          last_activity_at:     lastActTs,
        }).eq("id", lead.id);

        await supabase.from("lead_inactivity_logs").insert({
          lead_id:              lead.id,
          event_type:           "auto_unassigned",
          days_inactive:        daysInactive,
          assigned_to_at_event: prevOwner,
          notes:                `Auto-unassigned after ${daysInactive} days of inactivity`,
        });

        // Clear prev owner's inactivity notifications
        await supabase.from("notifications")
          .delete()
          .eq("entity_id", lead.id).eq("entity_type", "lead")
          .eq("type", "general").eq("user_id", prevOwner);

        // Notify the previous owner
        await supabase.from("notifications").insert({
          user_id:     prevOwner,
          type:        "general",
          title:       "Lead Unassigned — No Activity",
          message:     `"${leadName}" was automatically unassigned after ${daysInactive} days of inactivity.`,
          data:        { subtype: "lead_auto_unassigned", lead_id: lead.id, days: daysInactive },
          entity_id:   lead.id,
          entity_type: "lead",
          read:        false,
        });

        // Notify each admin/head (deduplicate)
        for (const admin of (admins || [])) {
          if (admin.id === prevOwner) continue;
          const { data: ex } = await supabase.from("notifications").select("id")
            .eq("user_id", admin.id).eq("entity_id", lead.id)
            .eq("entity_type", "lead").eq("read", false).limit(1);
          if (!ex?.length) {
            await supabase.from("notifications").insert({
              user_id:     admin.id,
              type:        "general",
              title:       "Lead Auto-Unassigned",
              message:     `"${leadName}" was auto-unassigned after ${daysInactive} days with no CRM activity. Reassign from the Inactive Lead Alerts widget.`,
              data:        { subtype: "lead_auto_unassigned_admin", lead_id: lead.id, days: daysInactive },
              entity_id:   lead.id,
              entity_type: "lead",
              read:        false,
            });
          }
        }
        unassigned++;

      } else if (daysInactive >= LEAD_THRESHOLD_25 && lead.inactivity_status !== "auto_unassigned") {
        // ── 25-DAY FINAL WARNING ──
        if (lead.inactivity_status !== "warning_25") {
          await supabase.from("leads")
            .update({ last_activity_at: lastActTs, inactivity_status: "warning_25" })
            .eq("id", lead.id);

          await supabase.from("lead_inactivity_logs").insert({
            lead_id:              lead.id,
            event_type:           "warning_25d",
            days_inactive:        daysInactive,
            assigned_to_at_event: lead.assigned_to,
          });

          // Replace any existing notification with the final warning
          await supabase.from("notifications").delete()
            .eq("entity_id", lead.id).eq("entity_type", "lead")
            .eq("user_id", lead.assigned_to).eq("type", "general");

          await supabase.from("notifications").insert({
            user_id:     lead.assigned_to,
            type:        "general",
            title:       "⚠️ Final Warning — Lead Will Be Unassigned",
            message:     `"${leadName}" has been inactive for ${daysInactive} days. Log activity within ${LEAD_THRESHOLD_30 - daysInactive} day(s) to keep this lead assigned.`,
            data:        { subtype: "lead_inactive_25d", lead_id: lead.id, days: daysInactive, days_remaining: LEAD_THRESHOLD_30 - daysInactive },
            entity_id:   lead.id,
            entity_type: "lead",
            read:        false,
          });

          // Notify admins/heads — final warning visibility
          for (const admin of (admins || [])) {
            if (admin.id === lead.assigned_to) continue;
            const { data: ex } = await supabase.from("notifications").select("id")
              .eq("user_id", admin.id).eq("entity_id", lead.id)
              .eq("entity_type", "lead").eq("read", false).limit(1);
            if (!ex?.length) {
              await supabase.from("notifications").insert({
                user_id:     admin.id,
                type:        "general",
                title:       "⚠️ Lead at 25-Day Warning",
                message:     `"${leadName}" (assigned to ${lead.assigned_to}) has been inactive for ${daysInactive} days. Auto-unassignment in ${LEAD_THRESHOLD_30 - daysInactive} day(s) if no action is taken.`,
                data:        { subtype: "lead_inactive_25d_admin", lead_id: lead.id, days: daysInactive, assigned_to: lead.assigned_to },
                entity_id:   lead.id,
                entity_type: "lead",
                read:        false,
              });
            }
          }
          warned25++;
        } else {
          await supabase.from("leads").update({ last_activity_at: lastActTs }).eq("id", lead.id);
        }

      } else if (daysInactive >= LEAD_THRESHOLD_7 && lead.inactivity_status !== "auto_unassigned") {
        // ── 7-DAY REMINDER ──
        if (!["warning_7", "warning_25"].includes(lead.inactivity_status)) {
          await supabase.from("leads")
            .update({ last_activity_at: lastActTs, inactivity_status: "warning_7" })
            .eq("id", lead.id);

          await supabase.from("lead_inactivity_logs").insert({
            lead_id:              lead.id,
            event_type:           "reminder_7d",
            days_inactive:        daysInactive,
            assigned_to_at_event: lead.assigned_to,
          });

          // Only create if no unread notification exists for this lead/user
          const { data: ex } = await supabase.from("notifications").select("id")
            .eq("user_id", lead.assigned_to).eq("entity_id", lead.id)
            .eq("entity_type", "lead").eq("read", false).limit(1);

          if (!ex?.length) {
            await supabase.from("notifications").insert({
              user_id:     lead.assigned_to,
              type:        "general",
              title:       "Lead Inactivity Reminder",
              message:     `"${leadName}" hasn't had any CRM activity for ${daysInactive} days. Please log a call, meeting, or note.`,
              data:        { subtype: "lead_inactive_7d", lead_id: lead.id, days: daysInactive },
              entity_id:   lead.id,
              entity_type: "lead",
              read:        false,
            });
          }

          // Notify admins/heads — monitoring visibility
          for (const admin of (admins || [])) {
            if (admin.id === lead.assigned_to) continue;
            const { data: exAdmin } = await supabase.from("notifications").select("id")
              .eq("user_id", admin.id).eq("entity_id", lead.id)
              .eq("entity_type", "lead").eq("read", false).limit(1);
            if (!exAdmin?.length) {
              await supabase.from("notifications").insert({
                user_id:     admin.id,
                type:        "general",
                title:       "Lead Inactive — 7-Day Alert",
                message:     `"${leadName}" has been inactive for ${daysInactive} days. Assigned employee has been reminded.`,
                data:        { subtype: "lead_inactive_7d_admin", lead_id: lead.id, days: daysInactive, assigned_to: lead.assigned_to },
                entity_id:   lead.id,
                entity_type: "lead",
                read:        false,
              });
            }
          }
          warned7++;
        } else {
          await supabase.from("leads").update({ last_activity_at: lastActTs }).eq("id", lead.id);
        }

      } else {
        // Already at correct status — refresh last_activity_at
        await supabase.from("leads").update({ last_activity_at: lastActTs }).eq("id", lead.id);
      }

      processed++;
    } catch (err) {
      console.error(`[LeadInactivityCron] Error for lead ${lead.id}:`, err.message);
      errors.push({ lead_id: lead.id, error: err.message });
    }
  }

  console.log(`[LeadInactivityCron] Done — ${processed} leads, ${warned7} 7d, ${warned25} 25d, ${unassigned} auto-unassigned`);
  return { processed, warned7, warned25, unassigned, errors: errors.length ? errors : undefined };
}

// ─── GET /api/reports/daily-planning-cron ─────────────────────────────────────
// Fires via GitHub Actions cron (*/30 * * * *).
// Targets the 10:30 AM IST slot — closest 30-min boundary to 10:40 AM IST.
router.get("/daily-planning-cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const forceRun = req.query.force === "true";
  const nowUtc   = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst   = new Date(nowUtc.getTime() + istOffsetMs);
  const h24      = nowIst.getUTCHours();
  const rawMin   = nowIst.getUTCMinutes();
  const slot_m   = rawMin < 30 ? 0 : 30;
  const h12      = h24 % 12 || 12;
  const ampm     = h24 < 12 ? "AM" : "PM";
  const currentSlot = `${String(h12).padStart(2, "0")}:${String(slot_m).padStart(2, "0")} ${ampm}`;

  if (!forceRun && currentSlot !== "10:30 AM") {
    return res.json({ success: true, slot: currentSlot, message: "Not the 10:30 AM IST window — skipped" });
  }

  console.log(`[DailyPlanning] Starting report generation — slot ${currentSlot}, forced=${forceRun}`);

  try {
    // Resolve IST day boundaries
    const pad = n => String(n).padStart(2, "0");
    const todayStr = `${nowIst.getUTCFullYear()}-${pad(nowIst.getUTCMonth() + 1)}-${pad(nowIst.getUTCDate())}`;
    const dayStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
    const dayEnd   = nowUtc.toISOString(); // up to now (10:30 AM IST)

    // Fetch all data
    const data = await fetchDailyPlanningData(nowIst, dayStart, dayEnd);
    console.log(`[DailyPlanning] Data fetched — pipeline:${data.stalePipeline.length} leads:${data.staleLeads.length} deals:${data.staleDeals.length}`);

    // Generate PDF
    const reportDateLabel = new Date(nowUtc).toLocaleDateString("en-IN", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      timeZone: "Asia/Kolkata",
    });
    const pdfBuffer = await generateDailyPlanningPdf(data, reportDateLabel, nowUtc.toISOString());
    console.log(`[DailyPlanning] PDF generated — ${pdfBuffer.length} bytes`);

    // Find recipients: owner (Super Admin) and sales_head
    const { data: recipients, error: recipErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["owner", "sales_head"])
      .not("email", "is", null)
      .not("status", "in", '("deleted","inactive")');

    if (recipErr) throw recipErr;

    const uniqueEmails = [...new Set((recipients || []).map(r => r.email).filter(Boolean))];
    if (uniqueEmails.length === 0) {
      console.warn("[DailyPlanning] No recipients found — aborting email send");
      return res.json({ success: true, sent_to: 0, message: "No owner/sales_head recipients found" });
    }

    // Build and send email
    const html     = buildDailyPlanningEmailHtml(data, reportDateLabel);
    const pdfName  = `Daily-Planning-Report-${todayStr}.pdf`;

    await sendMail({
      to:      uniqueEmails,
      subject: `Sales CRM Daily Planning Report — ${reportDateLabel}`,
      html,
      text:    `Sales CRM Daily Planning Report — ${reportDateLabel}\n\nStale Pipeline: ${data.summary.stalePipeline} | Stale Leads: ${data.summary.staleLeads} | Stale Deals: ${data.summary.staleDeals}\nEmployee Action — Active: ${data.summary.activeToday} | No Action: ${data.summary.inactiveToday}\nToday's Meetings: ${data.summary.todayMeetings} | Missed: ${data.summary.missedMeetings} | Overdue Activities: ${data.summary.overdueActivities}\n\nSee attached PDF for full details.`,
      attachments: [{
        filename:     pdfName,
        content:      pdfBuffer.toString("base64"),
        content_type: "application/pdf",
      }],
    });

    console.log(`[DailyPlanning] Email sent to ${uniqueEmails.length} recipient(s): ${uniqueEmails.join(", ")}`);
    return res.json({
      success:    true,
      sent_to:    uniqueEmails.length,
      recipients: uniqueEmails,
      summary:    data.summary,
    });
  } catch (err) {
    console.error("[DailyPlanning] Error:", err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
