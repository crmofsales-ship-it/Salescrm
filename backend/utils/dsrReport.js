const { supabase } = require("../config/db");

// ─── Activity type categorisation ────────────────────────────────────────────
const CALL_TYPES    = new Set(["call", "phone_call", "follow_up_call"]);
const EMAIL_TYPES   = new Set(["email", "email_sent", "follow_up_email", "email_contact"]);
const MEETING_TYPES = new Set(["meeting", "meeting_person", "meeting_virtual", "virtual_meeting"]);
const FU_TYPES      = new Set(["follow_up", "follow_up_call", "follow_up_email", "followup"]);

const roleLabel = (r) =>
  (r || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function fmtCurrency(n) {
  if (!n) return "₹0";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────
// dayStart / dayEnd : ISO strings representing the report window
// Returns { staff, userStats, totals, ownerEmail, ownerName } or null if no staff
async function generateTSRData(dayStart, dayEnd) {
  // Fetch owner email (Super Admin)
  const { data: ownerData } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "owner")
    .neq("status", "deleted")
    .limit(1)
    .maybeSingle();

  // Fetch all TSR staff (sales_head + inside_sales)
  const { data: staff, error: staffErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["sales_head", "inside_sales"])
    .not("status", "in", '("deleted","inactive")')
    .order("role", { ascending: false })
    .order("full_name");

  if (staffErr) throw new Error("Staff query failed: " + staffErr.message);
  if (!staff?.length) return null;

  const staffIds = staff.map((s) => s.id);

  // Parallel data fetch
  const [
    { data: leadsToday    },
    { data: actsToday     },
    { data: tasksToday    },
    { data: meetingsToday },
    { data: dealsCreated  },
    { data: dealsWon      },
    { data: dealsLost     },
    { data: followUpLeads },
  ] = await Promise.all([
    // Leads assigned/created today
    supabase.from("leads")
      .select("id, assigned_to")
      .gte("created_at", dayStart).lte("created_at", dayEnd)
      .in("assigned_to", staffIds),

    // All activities by staff today
    supabase.from("activities")
      .select("id, type, created_by, status")
      .gte("created_at", dayStart).lte("created_at", dayEnd)
      .in("created_by", staffIds),

    // Tasks completed today
    supabase.from("tasks")
      .select("id, assigned_to")
      .eq("status", "done")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd)
      .in("assigned_to", staffIds),

    // Meetings scheduled for today
    supabase.from("meetings")
      .select("id, created_by, status")
      .gte("start_time", dayStart).lte("start_time", dayEnd)
      .in("created_by", staffIds),

    // Deals created today
    supabase.from("deals")
      .select("id, assigned_to, value")
      .gte("created_at", dayStart).lte("created_at", dayEnd)
      .in("assigned_to", staffIds),

    // Deals moved to won today
    supabase.from("deals")
      .select("id, assigned_to, value")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd)
      .or("stage.eq.won,stage.eq.closed_won")
      .in("assigned_to", staffIds),

    // Deals moved to lost today
    supabase.from("deals")
      .select("id, assigned_to")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd)
      .or("stage.eq.lost,stage.eq.closed_lost")
      .in("assigned_to", staffIds),

    // Leads with follow-up date = today (scheduled)
    supabase.from("leads")
      .select("id, assigned_to")
      .gte("follow_up_date", dayStart).lte("follow_up_date", dayEnd)
      .in("assigned_to", staffIds),
  ]);

  // ─── Build per-user stats ───────────────────────────────────────────────────
  const userStats = {};
  for (const s of staff) {
    userStats[s.id] = {
      name: s.full_name || "Unknown",
      role: s.role,
      email: s.email,
      leadsToday:          0,
      calls:               0,
      emails:              0,
      meetings:            0,
      followUpsCompleted:  0,
      followUpsScheduled:  0,
      tasks:               0,
      activities:          0,
      dealsCreated:        0,
      dealsWon:            0,
      dealsLost:           0,
      revenueWon:          0,
      score:               0,
    };
  }

  for (const l of (leadsToday    || [])) if (userStats[l.assigned_to]) userStats[l.assigned_to].leadsToday++;
  for (const t of (tasksToday    || [])) if (userStats[t.assigned_to]) userStats[t.assigned_to].tasks++;
  for (const m of (meetingsToday || [])) if (userStats[m.created_by])  userStats[m.created_by].meetings++;
  for (const f of (followUpLeads || [])) if (userStats[f.assigned_to]) userStats[f.assigned_to].followUpsScheduled++;
  for (const d of (dealsCreated  || [])) if (userStats[d.assigned_to]) userStats[d.assigned_to].dealsCreated++;
  for (const d of (dealsWon      || [])) {
    if (userStats[d.assigned_to]) {
      userStats[d.assigned_to].dealsWon++;
      userStats[d.assigned_to].revenueWon += parseFloat(d.value) || 0;
    }
  }
  for (const d of (dealsLost     || [])) if (userStats[d.assigned_to]) userStats[d.assigned_to].dealsLost++;

  for (const a of (actsToday || [])) {
    if (!a.created_by || !userStats[a.created_by]) continue;
    const u = userStats[a.created_by];
    u.activities++;
    const t = (a.type || "").toLowerCase().replace(/[-\s]/g, "_");
    if (CALL_TYPES.has(t))    u.calls++;
    if (EMAIL_TYPES.has(t))   u.emails++;
    if (MEETING_TYPES.has(t)) u.meetings++;
    if (FU_TYPES.has(t))      u.followUpsCompleted++;
  }

  // Productivity score (matches DSR page calcScore logic)
  for (const uid of staffIds) {
    const u = userStats[uid];
    if (!u) continue;
    u.score = Math.min(100, Math.round(
      Math.min(u.activities * 6, 40) +
      Math.min(u.tasks * 6, 20) +
      Math.min(u.dealsCreated * 8, 20) +
      Math.min(u.leadsToday * 5, 20),
    ));
  }

  const vals = Object.values(userStats);
  const totals = {
    salesHeads:          staff.filter((s) => s.role === "sales_head").length,
    insideSales:         staff.filter((s) => s.role === "inside_sales").length,
    totalStaff:          staff.length,
    leadsToday:          vals.reduce((s, u) => s + u.leadsToday,         0),
    calls:               vals.reduce((s, u) => s + u.calls,              0),
    emails:              vals.reduce((s, u) => s + u.emails,             0),
    meetings:            vals.reduce((s, u) => s + u.meetings,           0),
    followUpsCompleted:  vals.reduce((s, u) => s + u.followUpsCompleted, 0),
    followUpsScheduled:  vals.reduce((s, u) => s + u.followUpsScheduled, 0),
    tasks:               vals.reduce((s, u) => s + u.tasks,              0),
    activities:          vals.reduce((s, u) => s + u.activities,         0),
    dealsCreated:        vals.reduce((s, u) => s + u.dealsCreated,       0),
    dealsWon:            vals.reduce((s, u) => s + u.dealsWon,           0),
    dealsLost:           vals.reduce((s, u) => s + u.dealsLost,          0),
    revenueWon:          vals.reduce((s, u) => s + u.revenueWon,         0),
  };

  return {
    staff,
    userStats,
    totals,
    ownerEmail: ownerData?.email,
    ownerName:  ownerData?.full_name,
  };
}

// ─── HTML email builder ───────────────────────────────────────────────────────
function buildTSRHtml(staff, userStats, totals, reportDate, rangeLabel = "00:00 – 20:00 IST") {
  const LOGO = process.env.MAIL_LOGO_URL || "";
  const G    = "linear-gradient(135deg,#0B1120 0%,#1B3A6B 100%)";

  const n         = (v) => (v || 0).toString();
  const sc        = (s) => s >= 70 ? "#10B981" : s >= 40 ? "#F59E0B" : "#EF4444";
  const convRate  = (w, l) => (w + l) > 0 ? `${Math.round((w / (w + l)) * 100)}%` : "—";

  const statCell = (val, label, color = "#0F172A") => `
    <td style="padding:14px 8px;text-align:center;border-right:1px solid #E2E8F0;">
      <div style="font-size:24px;font-weight:800;color:${color};line-height:1;">${val}</div>
      <div style="font-size:10.5px;color:#64748B;font-weight:500;margin-top:3px;white-space:nowrap;">${label}</div>
    </td>`;

  const th = (label, color = "#64748B") =>
    `<th style="padding:9px 8px;font-size:9.5px;text-align:center;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">${label}</th>`;

  const userRows = (staff || []).map((s) => {
    const u = userStats[s.id];
    if (!u) return "";
    const bg = u.role === "sales_head" ? "#F8F9FF" : "#FFFFFF";
    return `
      <tr style="background:${bg};border-bottom:1px solid #F1F5F9;">
        <td style="padding:9px 10px;font-size:12px;color:#0F172A;font-weight:600;white-space:nowrap;min-width:130px;">
          ${u.name}<br/>
          <span style="font-size:9.5px;font-weight:400;color:#94A3B8;">${roleLabel(u.role)}</span>
        </td>
        <td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;color:#0F172A;">${n(u.leadsToday)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;color:#3B82F6;">${n(u.calls)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;color:#EC4899;">${n(u.emails)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;color:#8B5CF6;">${n(u.meetings)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;color:#F59E0B;">${n(u.followUpsCompleted)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;color:#6366F1;">${n(u.tasks)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;color:#0F172A;">${n(u.dealsCreated)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;color:#10B981;">${n(u.dealsWon)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;color:#EF4444;">${n(u.dealsLost)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:11px;color:#64748B;">${convRate(u.dealsWon, u.dealsLost)}</td>
        <td style="padding:9px 8px;text-align:center;">
          <span style="display:inline-block;padding:2px 7px;border-radius:99px;font-size:10.5px;font-weight:700;background:${sc(u.score)}18;color:${sc(u.score)};">${u.score}</span>
        </td>
      </tr>`;
  }).join("");

  const totRow = `
    <tr style="background:#F8FAFC;border-top:2px solid #CBD5E1;">
      <td style="padding:9px 10px;font-size:11.5px;font-weight:800;color:#0F172A;">Team Total</td>
      <td style="padding:9px 8px;text-align:center;font-size:13px;font-weight:800;color:#0F172A;">${n(totals.leadsToday)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:13px;font-weight:800;color:#3B82F6;">${n(totals.calls)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:13px;font-weight:800;color:#EC4899;">${n(totals.emails)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:13px;font-weight:800;color:#8B5CF6;">${n(totals.meetings)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:13px;font-weight:800;color:#F59E0B;">${n(totals.followUpsCompleted)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:13px;font-weight:800;color:#6366F1;">${n(totals.tasks)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:13px;font-weight:800;color:#0F172A;">${n(totals.dealsCreated)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:13px;font-weight:800;color:#10B981;">${n(totals.dealsWon)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:13px;font-weight:800;color:#EF4444;">${n(totals.dealsLost)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:11px;font-weight:700;color:#64748B;">${convRate(totals.dealsWon, totals.dealsLost)}</td>
      <td style="padding:9px 8px;text-align:center;font-size:11px;color:#94A3B8;">—</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Daily Sales Report</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:32px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:760px;margin:0 auto;">

        <!-- ── HEADER ── -->
        <tr><td style="background:${G};border-radius:16px 16px 0 0;padding:26px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
            <td>
              <img src="${LOGO}" alt="Sales CRM" height="26" style="display:block;border:0;" />
              <div style="margin-top:6px;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.45);">Daily Sales Report</div>
            </td>
            <td align="right">
              <div style="font-size:15px;font-weight:700;color:#FFFFFF;">${reportDate}</div>
              <div style="font-size:10.5px;color:rgba(255,255,255,0.45);margin-top:3px;">Period: ${rangeLabel}</div>
            </td>
          </tr></table>
        </td></tr>

        <!-- ── STAT ROW 1 ── -->
        <tr><td style="background:#FFFFFF;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #E2E8F0;"><tr>
            ${statCell(totals.salesHeads,  "Sales Heads")}
            ${statCell(totals.insideSales, "Inside Sales")}
            ${statCell(totals.leadsToday,  "Leads Today",  "#3B82F6")}
            ${statCell(totals.activities,  "Activities",   "#8B5CF6")}
            ${statCell(totals.meetings,    "Meetings",     "#F59E0B")}
            ${statCell(totals.dealsWon,    "Deals Won",    "#10B981")}
          </tr></table>
        </td></tr>

        <!-- ── STAT ROW 2 ── -->
        <tr><td style="background:#F8FAFC;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:2px solid #CBD5E1;"><tr>
            ${statCell(totals.calls,               "Calls Made",       "#3B82F6")}
            ${statCell(totals.emails,              "Emails Sent",      "#EC4899")}
            ${statCell(totals.followUpsCompleted,  "Follow-ups Done",  "#06B6D4")}
            ${statCell(totals.tasks,               "Tasks Done",       "#6366F1")}
            ${statCell(totals.dealsCreated,        "Deals Created",    "#0F172A")}
            ${statCell(totals.dealsLost,           "Deals Lost",       "#EF4444")}
          </tr></table>
        </td></tr>

        <!-- ── SECTION LABEL ── -->
        <tr><td style="background:#FFFFFF;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;padding:14px 20px 10px;">
          <span style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;">Individual Performance</span>
        </td></tr>

        <!-- ── PERFORMANCE TABLE ── -->
        <tr><td style="background:#FFFFFF;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;padding:0 14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
            <thead>
              <tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0;">
                <th style="padding:9px 10px;font-size:9.5px;text-align:left;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;min-width:120px;">Name / Role</th>
                ${th("Leads")}
                ${th("Calls",   "#3B82F6")}
                ${th("Emails",  "#EC4899")}
                ${th("Meets",   "#8B5CF6")}
                ${th("F/U",     "#F59E0B")}
                ${th("Tasks",   "#6366F1")}
                ${th("Deals")}
                ${th("Won",     "#10B981")}
                ${th("Lost",    "#EF4444")}
                ${th("Conv%")}
                ${th("Score")}
              </tr>
            </thead>
            <tbody>
              ${userRows || `<tr><td colspan="12" style="padding:28px;text-align:center;color:#94A3B8;font-size:13px;">No TSR staff data available.</td></tr>`}
              ${totRow}
            </tbody>
          </table>
        </td></tr>

        ${totals.revenueWon > 0 ? `
        <!-- ── REVENUE STRIP ── -->
        <tr><td style="background:#DCFCE7;border:1px solid #86EFAC;border-top:none;border-bottom:none;padding:11px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
            <td><span style="font-size:12px;font-weight:700;color:#14532D;">Revenue Won Today</span></td>
            <td align="right"><span style="font-size:15px;font-weight:800;color:#15803D;">${fmtCurrency(totals.revenueWon)}</span></td>
          </tr></table>
        </td></tr>` : ""}

        <!-- ── OVERALL SUMMARY ── -->
        <tr><td style="background:#F8FAFC;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;padding:14px 20px;">
          <div style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;">Overall Team Summary</div>
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
            <td style="font-size:12px;color:#475569;padding:2px 0;">Total Staff Reported</td>
            <td style="font-size:12px;font-weight:700;color:#0F172A;text-align:right;">${totals.totalStaff} (${totals.salesHeads} Sales Heads + ${totals.insideSales} Inside Sales)</td>
          </tr><tr>
            <td style="font-size:12px;color:#475569;padding:2px 0;">Total Activities Logged</td>
            <td style="font-size:12px;font-weight:700;color:#0F172A;text-align:right;">${totals.activities}</td>
          </tr><tr>
            <td style="font-size:12px;color:#475569;padding:2px 0;">Follow-ups Scheduled / Completed</td>
            <td style="font-size:12px;font-weight:700;color:#0F172A;text-align:right;">${totals.followUpsScheduled} / ${totals.followUpsCompleted}</td>
          </tr><tr>
            <td style="font-size:12px;color:#475569;padding:2px 0;">Win Rate Today</td>
            <td style="font-size:12px;font-weight:700;color:#0F172A;text-align:right;">${convRate(totals.dealsWon, totals.dealsLost)}</td>
          </tr></table>
        </td></tr>

        <!-- ── FOOTER ── -->
        <tr><td style="background:#F1F5F9;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94A3B8;line-height:1.7;">
            This is an auto-generated report from the Sales CRM System.
            &nbsp;&middot;&nbsp; &#169; ${new Date().getFullYear()} Sales CRM
            &nbsp;&middot;&nbsp; Do not reply to this email.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────
function buildTSRText(staff, userStats, totals, reportDate, rangeLabel = "00:00 – 20:00 IST") {
  const n = (v) => String(v || 0);
  const cv = (w, l) => (w + l) > 0 ? `${Math.round((w / (w + l)) * 100)}%` : "N/A";
  const sep = "=".repeat(80);
  const dash = "-".repeat(80);

  const rows = (staff || []).map((s) => {
    const u = userStats[s.id];
    if (!u) return "";
    return `  ${(u.name + " (" + roleLabel(u.role) + ")").padEnd(32)} | Leads:${n(u.leadsToday).padStart(3)} | Calls:${n(u.calls).padStart(3)} | Emails:${n(u.emails).padStart(3)} | Meets:${n(u.meetings).padStart(3)} | F/U:${n(u.followUpsCompleted).padStart(3)} | Tasks:${n(u.tasks).padStart(3)} | Deals:${n(u.dealsCreated).padStart(3)} | Won:${n(u.dealsWon).padStart(2)} | Lost:${n(u.dealsLost).padStart(2)} | Score:${n(u.score)}`;
  }).join("\n");

  return `${sep}
SALES CRM DAILY SALES REPORT
${reportDate}
Period: ${rangeLabel}
${sep}

TEAM OVERVIEW
  Sales Heads   : ${totals.salesHeads}
  Inside Sales  : ${totals.insideSales}
  Total Staff   : ${totals.totalStaff}

DAILY METRICS
  Leads Assigned Today : ${totals.leadsToday}
  Total Activities     : ${totals.activities}
  Calls Made           : ${totals.calls}
  Emails Sent          : ${totals.emails}
  Meetings             : ${totals.meetings}
  Follow-ups Scheduled : ${totals.followUpsScheduled}
  Follow-ups Completed : ${totals.followUpsCompleted}
  Tasks Done           : ${totals.tasks}
  Deals Created        : ${totals.dealsCreated}
  Deals Won            : ${totals.dealsWon}
  Deals Lost           : ${totals.dealsLost}
  Win Rate             : ${cv(totals.dealsWon, totals.dealsLost)}

${dash}
INDIVIDUAL PERFORMANCE
${dash}
${rows}
${dash}

This is an auto-generated report from the Sales CRM System.
— Sales CRM`;
}

// ─── Staff DSR data for auto-cron (accepts pre-filtered staff list) ────────────
// dayStart/dayEnd: ISO strings; staffList: array of { id, full_name, email, role }
async function generateStaffDSRData(dayStart, dayEnd, staffList) {
  if (!staffList?.length) return null;

  const staffIds = staffList.map((s) => s.id);

  const [
    { data: leadsToday    },
    { data: actsToday     },
    { data: tasksToday    },
    { data: meetingsToday },
    { data: dealsCreated  },
    { data: dealsWon      },
    { data: dealsLost     },
    { data: followUpLeads },
  ] = await Promise.all([
    supabase.from("leads").select("id, assigned_to")
      .gte("created_at", dayStart).lte("created_at", dayEnd).in("assigned_to", staffIds),
    supabase.from("activities").select("id, type, created_by, status")
      .gte("created_at", dayStart).lte("created_at", dayEnd).in("created_by", staffIds),
    supabase.from("tasks").select("id, assigned_to")
      .eq("status", "done").gte("updated_at", dayStart).lte("updated_at", dayEnd).in("assigned_to", staffIds),
    supabase.from("meetings").select("id, created_by, status")
      .gte("start_time", dayStart).lte("start_time", dayEnd).in("created_by", staffIds),
    supabase.from("deals").select("id, assigned_to, value")
      .gte("created_at", dayStart).lte("created_at", dayEnd).in("assigned_to", staffIds),
    supabase.from("deals").select("id, assigned_to, value")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd)
      .or("stage.eq.won,stage.eq.closed_won").in("assigned_to", staffIds),
    supabase.from("deals").select("id, assigned_to")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd)
      .or("stage.eq.lost,stage.eq.closed_lost").in("assigned_to", staffIds),
    supabase.from("leads").select("id, assigned_to")
      .gte("follow_up_date", dayStart).lte("follow_up_date", dayEnd).in("assigned_to", staffIds),
  ]);

  const userStats = {};
  for (const s of staffList) {
    userStats[s.id] = {
      name: s.full_name || "Unknown", role: s.role, email: s.email,
      leadsToday: 0, calls: 0, emails: 0, meetings: 0,
      followUpsCompleted: 0, followUpsScheduled: 0,
      tasks: 0, activities: 0,
      dealsCreated: 0, dealsWon: 0, dealsLost: 0, revenueWon: 0, score: 0,
    };
  }

  for (const l of (leadsToday    || [])) if (userStats[l.assigned_to]) userStats[l.assigned_to].leadsToday++;
  for (const t of (tasksToday    || [])) if (userStats[t.assigned_to]) userStats[t.assigned_to].tasks++;
  for (const m of (meetingsToday || [])) if (userStats[m.created_by])  userStats[m.created_by].meetings++;
  for (const f of (followUpLeads || [])) if (userStats[f.assigned_to]) userStats[f.assigned_to].followUpsScheduled++;
  for (const d of (dealsCreated  || [])) if (userStats[d.assigned_to]) userStats[d.assigned_to].dealsCreated++;
  for (const d of (dealsWon      || [])) {
    if (userStats[d.assigned_to]) {
      userStats[d.assigned_to].dealsWon++;
      userStats[d.assigned_to].revenueWon += parseFloat(d.value) || 0;
    }
  }
  for (const d of (dealsLost || [])) if (userStats[d.assigned_to]) userStats[d.assigned_to].dealsLost++;
  for (const a of (actsToday || [])) {
    if (!a.created_by || !userStats[a.created_by]) continue;
    const u = userStats[a.created_by];
    u.activities++;
    const t = (a.type || "").toLowerCase().replace(/[-\s]/g, "_");
    if (CALL_TYPES.has(t))    u.calls++;
    if (EMAIL_TYPES.has(t))   u.emails++;
    if (MEETING_TYPES.has(t)) u.meetings++;
    if (FU_TYPES.has(t))      u.followUpsCompleted++;
  }

  for (const uid of staffIds) {
    const u = userStats[uid];
    if (!u) continue;
    u.score = Math.min(100, Math.round(
      Math.min(u.activities * 6, 40) + Math.min(u.tasks * 6, 20) +
      Math.min(u.dealsCreated * 8, 20) + Math.min(u.leadsToday * 5, 20),
    ));
  }

  const vals   = Object.values(userStats);
  const sum    = (k) => vals.reduce((s, u) => s + (u[k] || 0), 0);
  const totals = {
    salesHeads:         staffList.filter((s) => s.role === "sales_head").length,
    insideSales:        staffList.filter((s) => s.role === "inside_sales").length,
    totalStaff:         staffList.length,
    leadsToday:         sum("leadsToday"),
    calls:              sum("calls"),
    emails:             sum("emails"),
    meetings:           sum("meetings"),
    followUpsCompleted: sum("followUpsCompleted"),
    followUpsScheduled: sum("followUpsScheduled"),
    tasks:              sum("tasks"),
    activities:         sum("activities"),
    dealsCreated:       sum("dealsCreated"),
    dealsWon:           sum("dealsWon"),
    dealsLost:          sum("dealsLost"),
    revenueWon:         sum("revenueWon"),
  };

  return { staff: staffList, userStats, totals };
}

// ─── Per-employee individual activity data for PDF ────────────────────────────
// Returns { employeeData: { [id]: { profile, activities, deals, newLeads, leadMap, stats, cat } }, staff }
async function generateEmployeeActivityData(staffIds, dayStart, dayEnd) {
  if (!staffIds?.length) return { employeeData: {}, staff: [] };

  const [staffRes, actRes, dealsRes] = await Promise.all([
    supabase.from("profiles")
      .select("id, full_name, email, role")
      .in("id", staffIds)
      .order("full_name"),
    supabase.from("activities")
      .select("id, type, title, description, status, priority, due_date, lead_id, deal_id, created_by, created_at, metadata")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .in("created_by", staffIds)
      .order("created_at", { ascending: true }),
    supabase.from("deals")
      .select("id, name, value, stage, status, created_by, created_at")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .in("created_by", staffIds),
  ]);

  const staff      = staffRes.data  || [];
  const activities = actRes.data    || [];
  const deals      = dealsRes.data  || [];

  // Collect unique lead IDs referenced in activities
  const leadIds = [...new Set(activities.filter(a => a.lead_id).map(a => a.lead_id))];
  let leadMap = {};
  if (leadIds.length > 0) {
    const { data: lds } = await supabase.from("leads")
      .select("id, contact_name, company_name, phone, email, source, stage, designation")
      .in("id", leadIds);
    (lds || []).forEach(l => { leadMap[l.id] = l; });
  }

  // Leads created in period by these employees
  const { data: newLeadsRaw } = await supabase.from("leads")
    .select("id, contact_name, company_name, phone, email, source, stage, designation, owner_id, created_at")
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd)
    .in("owner_id", staffIds);
  const newLeadsByEmp = {};
  (newLeadsRaw || []).forEach(l => {
    if (!newLeadsByEmp[l.owner_id]) newLeadsByEmp[l.owner_id] = [];
    newLeadsByEmp[l.owner_id].push(l);
    leadMap[l.id] = l;
  });

  // Leads updated today but NOT created today (stage / field changes)
  const { data: updatedLeadsRaw } = await supabase.from("leads")
    .select("id, contact_name, company_name, phone, email, source, stage, owner_id, updated_at, created_at")
    .gte("updated_at", dayStart)
    .lte("updated_at", dayEnd)
    .lt("created_at", dayStart)
    .in("owner_id", staffIds);
  const updatedLeadsByEmp = {};
  (updatedLeadsRaw || []).forEach(l => {
    if (!updatedLeadsByEmp[l.owner_id]) updatedLeadsByEmp[l.owner_id] = [];
    updatedLeadsByEmp[l.owner_id].push(l);
    if (!leadMap[l.id]) leadMap[l.id] = l;
  });

  const t = (type) => (type || "").toLowerCase().replace(/[-\s]/g, "_");
  const isCompleted = (s) => ["done","completed","complete"].includes((s||"").toLowerCase());
  const isPending   = (s) => ["pending","todo","scheduled"].includes((s||"").toLowerCase());

  const employeeData = {};
  for (const s of staff) {
    const empActs    = activities.filter(a => a.created_by === s.id);
    const empDeals   = deals.filter(d => d.created_by === s.id);
    const empLeads   = newLeadsByEmp[s.id] || [];
    const updatedLeads = updatedLeadsByEmp[s.id] || [];

    const cat = {
      calls:       empActs.filter(a => CALL_TYPES.has(t(a.type))),
      emails:      empActs.filter(a => EMAIL_TYPES.has(t(a.type))),
      meetings:    empActs.filter(a => MEETING_TYPES.has(t(a.type))),
      followUps:   empActs.filter(a => FU_TYPES.has(t(a.type))),
      notes:       empActs.filter(a => t(a.type) === "note"),
      tasks:       empActs.filter(a => ["task","task_created","reminder"].includes(t(a.type))),
      whatsapp:    empActs.filter(a => ["whatsapp","whatsapp_message","whatsapp_follow_up"].includes(t(a.type))),
      visits:      empActs.filter(a => ["visit","client_visit"].includes(t(a.type))),
      linkedin:    empActs.filter(a => a.type && t(a.type).startsWith("linkedin")),
      virtual:     empActs.filter(a => ["meeting_virtual","virtual_meeting"].includes(t(a.type))),
      physical:    empActs.filter(a => ["meeting_person","in_person"].includes(t(a.type))),
      followCalls: empActs.filter(a => ["follow_up_call"].includes(t(a.type))),
      followEmails:empActs.filter(a => ["follow_up_email"].includes(t(a.type))),
    };

    const completed = empActs.filter(a => isCompleted(a.status)).length;
    const pending   = empActs.filter(a => isPending(a.status)).length;
    const overdue   = empActs.filter(a =>
      a.due_date && new Date(a.due_date) < new Date(dayEnd) && !isCompleted(a.status)
    ).length;

    const dealsWon  = empDeals.filter(d => (d.status||"").toLowerCase() === "won");
    const dealsLost = empDeals.filter(d => (d.status||"").toLowerCase() === "lost");
    const revenue   = dealsWon.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

    const totalActs  = empActs.length;
    const efficiency = totalActs > 0 ? Math.round((completed / totalActs) * 100) : 0;
    const convRate   = empLeads.length > 0 ? Math.round((dealsWon.length / empLeads.length) * 100) : 0;

    employeeData[s.id] = {
      profile: s,
      activities: empActs,
      deals: empDeals,
      newLeads: empLeads,
      updatedLeads,
      leadMap,
      cat,
      stats: {
        total: totalActs, completed, pending, overdue,
        calls: cat.calls.length, followCalls: cat.followCalls.length,
        emails: cat.emails.length, followEmails: cat.followEmails.length,
        meetings: cat.meetings.length, virtual: cat.virtual.length, physical: cat.physical.length,
        followUps: cat.followUps.length, notes: cat.notes.length, tasks: cat.tasks.length,
        whatsapp: cat.whatsapp.length, visits: cat.visits.length, linkedin: cat.linkedin.length,
        dealsCreated: empDeals.length, dealsWon: dealsWon.length,
        dealsLost: dealsLost.length, revenue,
        newLeads: empLeads.length,
        efficiency, convRate,
      },
    };
  }

  return { employeeData, staff };
}

module.exports = { generateTSRData, generateStaffDSRData, generateEmployeeActivityData, buildTSRHtml, buildTSRText };
