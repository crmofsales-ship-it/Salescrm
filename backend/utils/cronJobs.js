const cron = require("node-cron");
const { supabase } = require("../config/db");
const { sendNotificationEmail, sendMail, sendMeetingReminderEmail } = require("../config/mail");
const { generateTSRData, buildTSRHtml, buildTSRText } = require("./dsrReport");

function startCronJobs() {
  // Daily at 9:00 AM UTC — follow-up reminders
  cron.schedule("0 9 * * *", async () => {
    console.log("[CRON] Running daily follow-up reminders...");
    try {
      const today = new Date().toISOString().split("T")[0];

      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, contact_name, company_name, follow_up_date, assigned_to, stage, temperature, priority, assigned_profile:profiles!leads_assigned_to_fkey(id,full_name,email)")
        .eq("follow_up_date", today)
        .not("stage", "in", '("won","lost")')
        .limit(200);

      if (error) { console.error("[CRON] Follow-up query error:", error.message); return; }
      if (!leads?.length) { console.log("[CRON] No follow-ups today."); return; }

      // Group by assigned user to send one email per person
      const grouped = leads.reduce((acc, lead) => {
        const profile = lead.assigned_profile;
        if (!profile?.email) return acc;
        if (!acc[profile.email]) acc[profile.email] = { profile, leads: [] };
        acc[profile.email].leads.push(lead);
        return acc;
      }, {});

      let sent = 0;
      for (const { profile, leads: userLeads } of Object.values(grouped)) {
        const leadList = userLeads
          .map((l) => `• ${l.contact_name}${l.company_name ? ` (${l.company_name})` : ""} — ${l.stage} / ${l.temperature}`)
          .join("\n");

        await sendNotificationEmail({
          to: profile.email,
          name: profile.full_name,
          subject: `You have ${userLeads.length} follow-up${userLeads.length > 1 ? "s" : ""} scheduled today`,
          title: "Today's Follow-up Reminders",
          message: `You have ${userLeads.length} lead follow-up${userLeads.length > 1 ? "s" : ""} scheduled for today:\n\n${leadList}`,
          ctaLabel: "Open CRM",
          ctaUrl: (process.env.FRONTEND_URL || "http://localhost:5173"),
        });
        sent++;
      }

      console.log(`[CRON] Sent follow-up reminders to ${sent} users for ${leads.length} leads.`);
    } catch (err) {
      console.error("[CRON] Follow-up reminder error:", err.message);
    }
  });

  // Daily at 8:00 AM UTC — overdue leads alert (temperature still cold after 7+ days)
  cron.schedule("0 8 * * *", async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: stale } = await supabase
        .from("leads")
        .select("id, contact_name, company_name, updated_at, assigned_profile:profiles!leads_assigned_to_fkey(id,full_name,email)")
        .eq("temperature", "cold")
        .lt("updated_at", sevenDaysAgo)
        .not("stage", "in", '("won","lost")')
        .limit(100);

      if (!stale?.length) return;

      const grouped = stale.reduce((acc, lead) => {
        const profile = lead.assigned_profile;
        if (!profile?.email) return acc;
        if (!acc[profile.email]) acc[profile.email] = { profile, leads: [] };
        acc[profile.email].leads.push(lead);
        return acc;
      }, {});

      for (const { profile, leads: userLeads } of Object.values(grouped)) {
        const leadList = userLeads
          .map((l) => `• ${l.contact_name}${l.company_name ? ` (${l.company_name})` : ""} — last updated ${new Date(l.updated_at).toLocaleDateString("en-IN")}`)
          .join("\n");

        await sendNotificationEmail({
          to: profile.email,
          name: profile.full_name,
          subject: `${userLeads.length} stale lead${userLeads.length > 1 ? "s" : ""} need attention`,
          title: "Stale Leads Alert",
          message: `${userLeads.length} of your leads have been cold and untouched for 7+ days:\n\n${leadList}\n\nConsider re-engaging or updating their status.`,
          ctaLabel: "View Leads",
          ctaUrl: `${(process.env.FRONTEND_URL || "http://localhost:5173")}/leads`,
        });
      }
    } catch (err) {
      console.error("[CRON] Stale leads alert error:", err.message);
    }
  });

  // Daily at 14:30 UTC (8:00 PM IST) — security report
  cron.schedule("30 14 * * *", async () => {
    console.log("[CRON] Running daily security report...");
    try {
      await sendDailySecurityReport();
    } catch (err) {
      console.error("[CRON] Security report error:", err.message);
    }
  });

  // NOTE: Automated DSR is handled exclusively by the /api/reports/auto-dsr-cron HTTP endpoint
  // (called by GitHub Actions at 14:10 UTC / 7:40 PM IST).
  // DO NOT re-enable the node-cron DSR here — it would cause duplicate emails.

  // Meeting reminders — runs every 5 minutes to catch 15-min, 1-hour, and 24-hour windows
  cron.schedule("*/5 * * * *", async () => {
    try { await sendMeetingReminders(); } catch (err) { console.error("[CRON] Meeting reminders error:", err.message); }
  });

  console.log("[CRON] Scheduled: follow-up reminders (9 AM UTC), stale leads alert (8 AM UTC), security report (14:30 UTC / 8 PM IST), meeting reminders (every 5 min). DSR → HTTP endpoint /auto-dsr-cron at 14:10 UTC / 7:40 PM IST.");
}

async function sendDailySecurityReport() {
  const IS_TEST = (process.env.SECURITY_REPORT_MODE || "TEST") !== "PRODUCTION";
  const REPORT_TO = IS_TEST
    ? (process.env.SECURITY_REPORT_TEST_EMAIL || (process.env.MAIL_FROM_ADDRESS || process.env.SECURITY_REPORT_TEST_EMAIL || null))
    : null; // PRODUCTION mode: per-owner delivery (extend later)

  if (!REPORT_TO) {
    console.log("[CRON] Security report: PRODUCTION mode not yet configured, skipping.");
    return;
  }

  // Date range: today in IST (UTC+5:30)
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const todayIST = new Date(now.getTime() + istOffsetMs);
  const dateStr = todayIST.toISOString().split("T")[0]; // YYYY-MM-DD
  const dayStart = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
  const dayEnd   = new Date(`${dateStr}T23:59:59+05:30`).toISOString();

  // Fetch today's login activity joined with profiles
  const { data: logs, error } = await supabase
    .from("login_logs")
    .select("id, user_id, logged_in_at, logged_out_at, device_id, ip_address, city, country, profiles!login_logs_user_id_fkey(full_name, email, role)")
    .gte("logged_in_at", dayStart)
    .lte("logged_in_at", dayEnd)
    .order("logged_in_at", { ascending: false });

  if (error) { console.error("[CRON] Security report query error:", error.message); return; }
  if (!logs?.length) {
    console.log("[CRON] Security report: no login activity today, skipping email.");
    return;
  }

  // Build per-user summary
  const userMap = {};
  const devicesByUser = {};

  for (const log of logs) {
    const uid = log.user_id;
    if (!uid) continue;
    if (!userMap[uid]) {
      userMap[uid] = {
        name:    log.profiles?.full_name || "Unknown",
        email:   log.profiles?.email     || "",
        role:    log.profiles?.role      || "",
        logins:  0,
        logouts: 0,
        devices: new Set(),
        locations: new Set(),
      };
    }
    userMap[uid].logins++;
    if (log.logged_out_at) userMap[uid].logouts++;
    if (log.device_id)  userMap[uid].devices.add(log.device_id);
    if (log.city)       userMap[uid].locations.add(`${log.city}${log.country ? ", " + log.country : ""}`);
    if (!devicesByUser[uid]) devicesByUser[uid] = new Set();
    if (log.device_id)  devicesByUser[uid].add(log.device_id);
  }

  const multiDeviceUsers = Object.entries(devicesByUser)
    .filter(([, devs]) => devs.size > 1)
    .map(([uid]) => uid);

  const users = Object.entries(userMap);
  const totalLogins  = logs.length;
  const activeSessions = logs.filter((l) => !l.logged_out_at).length;
  const reportDate   = todayIST.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Build HTML rows
  const roleLabel = (r) => (r || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const tableRows = users.map(([uid, u]) => {
    const isMultiDevice = multiDeviceUsers.includes(uid);
    const statusDot = isMultiDevice
      ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;margin-right:5px;" title="Multiple devices"></span>`
      : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:5px;"></span>`;
    const deviceWarning = isMultiDevice ? ` ⚠️ ${u.devices.size} devices` : "";
    return `
      <tr style="border-bottom:1px solid #F1F5F9;">
        <td style="padding:10px 12px;font-size:13px;color:#0F172A;font-weight:500;">${statusDot}${u.name}</td>
        <td style="padding:10px 12px;font-size:12px;color:#64748B;">${roleLabel(u.role)}</td>
        <td style="padding:10px 12px;font-size:13px;color:#0F172A;text-align:center;">${u.logins}</td>
        <td style="padding:10px 12px;font-size:13px;color:#0F172A;text-align:center;">${u.logouts}</td>
        <td style="padding:10px 12px;font-size:12px;color:${isMultiDevice ? "#92400E" : "#64748B"};">${[...u.locations].join(", ") || "—"}${deviceWarning}</td>
      </tr>`;
  }).join("");

  const warningsHtml = multiDeviceUsers.length > 0
    ? `<div style="margin:20px 0;padding:12px 16px;background:#FEF3C7;border:1px solid #FCD34D;border-left:4px solid #F59E0B;border-radius:8px;font-size:13px;color:#78350F;">
        ⚠️ <strong>${multiDeviceUsers.length} user${multiDeviceUsers.length > 1 ? "s" : ""}</strong> logged in from multiple different devices today. Review the table below.
       </div>`
    : `<div style="margin:20px 0;padding:12px 16px;background:#DCFCE7;border:1px solid #86EFAC;border-left:4px solid #22c55e;border-radius:8px;font-size:13px;color:#14532D;">
        ✓ No suspicious multi-device activity detected today.
       </div>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#0F172A;">Daily Security Report</p>
    <p style="margin:0 0 20px;font-size:13px;color:#64748B;">${reportDate}${IS_TEST ? ' &nbsp;<span style="background:#DBEAFE;color:#1D4ED8;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;">TEST MODE</span>' : ""}</p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;margin:0 0 20px;overflow:hidden;">
      <tr>
        <td style="padding:14px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#0F172A;">${users.length}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Active Users</div>
        </td>
        <td style="padding:14px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#0F172A;">${totalLogins}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Login Events</div>
        </td>
        <td style="padding:14px 20px;text-align:center;border-right:1px solid #E2E8F0;">
          <div style="font-size:28px;font-weight:800;color:#0F172A;">${activeSessions}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Open Sessions</div>
        </td>
        <td style="padding:14px 20px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:${multiDeviceUsers.length > 0 ? "#F59E0B" : "#22c55e"};">${multiDeviceUsers.length}</div>
          <div style="font-size:11.5px;color:#64748B;font-weight:500;margin-top:2px;">Multi-Device ⚠️</div>
        </td>
      </tr>
    </table>

    ${warningsHtml}

    <p style="margin:16px 0 8px;font-size:12px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.06em;">Per-User Activity</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0;">
          <th style="padding:10px 12px;font-size:11px;text-align:left;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Name</th>
          <th style="padding:10px 12px;font-size:11px;text-align:left;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Role</th>
          <th style="padding:10px 12px;font-size:11px;text-align:center;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Logins</th>
          <th style="padding:10px 12px;font-size:11px;text-align:center;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Logouts</th>
          <th style="padding:10px 12px;font-size:11px;text-align:left;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Location / Devices</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  // Build HTML email inline (mail.js baseLayout is internal)
  const BRAND_GRADIENT = "linear-gradient(135deg,#0B1120 0%,#1B3A6B 100%)";
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Daily Security Report</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:40px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
        <tr><td style="background:${BRAND_GRADIENT};border-radius:16px 16px 0 0;padding:32px 36px 28px;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.5);">SALES CRM</p>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">Security Report</h1>
        </td></tr>
        <tr><td style="background:#FFFFFF;padding:36px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">${bodyHtml}</td></tr>
        <tr><td style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:20px 36px;text-align:center;">
          <p style="margin:0;font-size:11.5px;color:#94A3B8;line-height:1.7;">
            © ${new Date().getFullYear()} Sales CRM &nbsp;·&nbsp; Automated security digest — do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Daily Security Report — ${reportDate}\n\nActive Users: ${users.length}\nLogin Events: ${totalLogins}\nOpen Sessions: ${activeSessions}\nMulti-Device Warnings: ${multiDeviceUsers.length}\n\n${
    users.map(([, u]) => `• ${u.name} (${roleLabel(u.role)}) — ${u.logins} login(s), ${u.logouts} logout(s)${u.devices.size > 1 ? ` ⚠️ ${u.devices.size} devices` : ""}`).join("\n")
  }\n\n— Sales CRM Security`;

  await sendMail({
    to: REPORT_TO,
    subject: `Sales CRM Security Report — ${reportDate}${IS_TEST ? " [TEST]" : ""}`,
    html,
    text,
  });

  console.log(`[CRON] Security report sent to ${REPORT_TO} (${IS_TEST ? "TEST" : "PRODUCTION"} mode). Users: ${users.length}, Warnings: ${multiDeviceUsers.length}`);
}

// ─── Meeting Reminder Logic ───────────────────────────────────────────────────
async function sendMeetingReminders() {
  const now = new Date();
  const windows = [
    { label: "in 15 minutes", minutesBefore: 15,   column: "reminder_15m_sent_at" },
    { label: "in 1 hour",     minutesBefore: 60,   column: "reminder_1h_sent_at"  },
    { label: "in 24 hours",   minutesBefore: 1440, column: "reminder_24h_sent_at" },
  ];

  for (const win of windows) {
    const windowStart = new Date(now.getTime() + (win.minutesBefore - 5) * 60000).toISOString();
    const windowEnd   = new Date(now.getTime() + (win.minutesBefore + 5) * 60000).toISOString();

    const { data: meetings } = await supabase
      .from("meetings")
      .select("*, created_profile:profiles!meetings_created_by_fkey(full_name, email)")
      .eq("status", "scheduled")
      .gte("start_time", windowStart)
      .lte("start_time", windowEnd)
      .is(win.column, null)
      .limit(50);

    if (!meetings?.length) continue;

    for (const meeting of meetings) {
      try {
        if (!meeting.customer_email) continue;
        await sendMeetingReminderEmail({
          to:           meeting.customer_email,
          customerName: meeting.customer_name || "there",
          title:        meeting.title,
          startTime:    meeting.start_time,
          endTime:      meeting.end_time,
          meetingType:  meeting.meeting_type,
          meetingLink:  meeting.meeting_link,
          location:     meeting.location,
          hostName:     meeting.created_profile?.full_name || "Sales CRM Team",
          hostEmail:    meeting.created_profile?.email,
          timeLabel:    win.label,
          meetingId:    meeting.id,
        });
        await supabase.from("meetings").update({ [win.column]: now.toISOString() }).eq("id", meeting.id);
        console.log(`[CRON] Reminder (${win.label}) sent for meeting: ${meeting.title}`);
      } catch (err) {
        console.error(`[CRON] Reminder failed for ${meeting.id}:`, err.message);
      }
    }
  }
}

// ─── Automated DSR ────────────────────────────────────────────────────────────
async function sendAutomatedDSR() {
  const { generateDSRPdf } = require("./dsrPdf");

  // Date range: today 00:00 → 20:00 IST
  const now         = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const todayIST    = new Date(now.getTime() + istOffsetMs);
  const dateStr     = todayIST.toISOString().split("T")[0];
  const dayStart    = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
  const dayEnd      = new Date(`${dateStr}T21:00:00+05:30`).toISOString();

  const reportDate = todayIST.toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  let data;
  try {
    data = await generateTSRData(dayStart, dayEnd);
  } catch (err) {
    console.error("[CRON] DSR data fetch error:", err.message);
    return;
  }

  if (!data) {
    console.log("[CRON] DSR: no sales staff found, skipping.");
    return;
  }

  // 1. Fetch configured recipients (only owner + sales_head allowed)
  let reportTo = [];
  try {
    const { data: configRows } = await supabase
      .from("dsr_recipient_config")
      .select("user_id, profile:profiles!dsr_recipient_config_user_id_fkey(email, role)");

    if (configRows?.length) {
      reportTo = configRows
        .filter((r) => ["owner", "sales_head"].includes(r.profile?.role))
        .map((r) => r.profile?.email)
        .filter(Boolean);
    }
  } catch (err) {
    console.error("[CRON] DSR config fetch error:", err.message);
  }

  // 2. Fall back to all owner-role users if no config set
  if (!reportTo.length) {
    try {
      const { data: owners } = await supabase
        .from("profiles")
        .select("email")
        .eq("role", "owner")
        .not("status", "in", '("deleted","inactive")')
        .not("email", "is", null);
      reportTo = (owners || []).map((p) => p.email).filter(Boolean);
    } catch (err) {
      console.error("[CRON] DSR owner fallback error:", err.message);
    }
  }

  // 3. Last resort fallback
  if (!reportTo.length) {
    reportTo = [
      data.ownerEmail
      || process.env.SECURITY_REPORT_TEST_EMAIL
      || (process.env.MAIL_FROM_ADDRESS || process.env.SECURITY_REPORT_TEST_EMAIL || null),
    ].filter(Boolean);
  }

  // 4. Generate PDF
  let pdfBuffer = null;
  try {
    pdfBuffer = await generateDSRPdf({
      staff:           data.staff,
      userStats:       data.userStats,
      totals:          data.totals,
      reportDateLabel: reportDate,
      reportType:      "Daily",
      generatedAt:     now.toISOString(),
    });
  } catch (err) {
    console.error("[CRON] DSR PDF generation error:", err.message);
  }

  const html = buildTSRHtml(data.staff, data.userStats, data.totals, reportDate);
  const text = buildTSRText(data.staff, data.userStats, data.totals, reportDate);

  // 5. Send email (with PDF if generated, without if generation failed)
  await sendMail({
    to:      reportTo,
    subject: `Sales CRM Daily Sales Report — ${reportDate}`,
    html,
    text,
    ...(pdfBuffer ? {
      attachments: [{
        filename:    `DSR-Daily-${dateStr}.pdf`,
        content:     pdfBuffer,
        contentType: "application/pdf",
      }],
    } : {}),
  });

  console.log(`[CRON] DSR sent to ${reportTo.length} recipient(s): ${reportTo.join(", ")}. Staff: ${data.totals.totalStaff}, Activities: ${data.totals.activities}, Deals Won: ${data.totals.dealsWon}`);
}

module.exports = { startCronJobs };
