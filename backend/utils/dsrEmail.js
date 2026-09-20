'use strict';

function rl(r) {
  if (r === "owner")          return "Super Admin";
  if (r === "sales_head")     return "Sales Head";
  if (r === "sales_manager")  return "Sales Manager";
  if (r === "inside_sales")   return "Inside Sales";
  if (r === "sales_employee") return "Sales Executive";
  return (r || "Staff").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
    });
  } catch { return "—"; }
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
    });
  } catch { return "—"; }
}

function fmtCurrency(val) {
  const n = Number(val) || 0;
  if (!n) return "—";
  if (n >= 10000000) return "₹" + (n / 10000000).toFixed(1) + "Cr";
  if (n >= 100000)   return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000)     return "₹" + (n / 1000).toFixed(0) + "K";
  return "₹" + n;
}

function fmtType(t) {
  if (!t) return "—";
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function getMeetingMode(m) {
  const t = (m.meeting_type || "").toLowerCase();
  if (t === "in_person" || t === "in-person") return "In Person";
  if (t === "phone" || t === "phone_call")    return "Phone Call";
  if (t === "virtual" || t === "online") {
    if ((m.meet_link || "").toLowerCase().includes("teams")) return "Microsoft Teams";
    return "Google Meet";
  }
  if (m.meet_link) {
    if (m.meet_link.toLowerCase().includes("teams")) return "Microsoft Teams";
    return "Google Meet";
  }
  if (m.location) return "In Person";
  return fmtType(m.meeting_type) || "—";
}

function shortId(id) {
  if (!id) return "—";
  return String(id).slice(-8).toUpperCase();
}

function buildDsrEmailHtml({
  recipientName, recipientRole, dateLabel, generatedAt,
  scopeProfiles, scopeTotals, statsMap, meetings, profileMap,
}) {
  const genTime = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
      })
    : "";

  // ── Today's Summary ──────────────────────────────────────────────────────────
  const summaryItems = [
    { label: "Total Calls",       value: scopeTotals.callsMade           || 0, color: "#2563EB" },
    { label: "Total Emails",      value: scopeTotals.emailsSent          || 0, color: "#EC4899" },
    { label: "Total Follow-ups",  value: scopeTotals.followUpsCompleted  || 0, color: "#D97706" },
    { label: "Total Meetings",    value: scopeTotals.meetingsScheduled   || 0, color: "#7C3AED" },
    { label: "Total Notes",       value: scopeTotals.notesAdded          || 0, color: "#059669" },
    { label: "Total Activities",  value: scopeTotals.activitiesCompleted || 0, color: "#0891B2" },
  ];

  const summaryRow = summaryItems.map((s, i) => `
    <td style="padding:18px 10px;text-align:center;${i < summaryItems.length - 1 ? "border-right:1px solid #E2E8F0;" : ""}">
      <div style="font-size:30px;font-weight:900;color:${s.color};line-height:1;">${s.value}</div>
      <div style="font-size:10px;color:#64748B;font-weight:600;margin-top:6px;text-transform:uppercase;letter-spacing:0.06em;">${s.label}</div>
    </td>`).join("");

  // ── Employee performance table ────────────────────────────────────────────────
  const empTh = (al) => `padding:9px 12px;font-size:9px;font-weight:700;color:#1E3A5F;text-transform:uppercase;letter-spacing:0.07em;text-align:${al};background:#EFF6FF;border-bottom:2px solid #BFDBFE;white-space:nowrap;`;

  const empRows = scopeProfiles.map((p, i) => {
    const s  = statsMap[p.id] || {};
    const bg = i % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
    const tdl = `padding:10px 12px;font-size:12px;color:#334155;border-top:1px solid #F1F5F9;text-align:left;background:${bg};`;
    const tdc = tdl.replace("text-align:left;", "text-align:center;");
    return `<tr>
      <td style="${tdl}"><strong>${p.full_name || p.email}</strong></td>
      <td style="${tdc}">${s.callsMade || 0}</td>
      <td style="${tdc}">${s.emailsSent || 0}</td>
      <td style="${tdc}">${s.meetingsScheduled || 0}</td>
      <td style="${tdc}">${s.notesAdded || 0}</td>
      <td style="${tdc}"><strong style="color:#0891B2;">${s.activitiesCompleted || 0}</strong></td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" style="padding:20px;text-align:center;color:#94A3B8;font-size:13px;">No data recorded today.</td></tr>`;

  // ── Meetings summary ──────────────────────────────────────────────────────────
  let meetingsSection = "";
  if (meetings && meetings.length > 0) {
    const mTh = (al) => `padding:9px 10px;font-size:9px;font-weight:700;color:#1E3A5F;text-transform:uppercase;letter-spacing:0.06em;text-align:${al};background:#EFF6FF;border-bottom:2px solid #BFDBFE;white-space:nowrap;`;

    const mtRows = meetings.map((m, i) => {
      const bg         = i % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
      const td         = (al) => `style="padding:9px 10px;font-size:12px;color:#334155;border-top:1px solid #F1F5F9;text-align:${al};background:${bg};"`;
      const scheduler  = profileMap[m.created_by];
      const statusClr  = m.status === "completed" ? "#059669" : m.status === "cancelled" ? "#DC2626" : m.status === "pending" ? "#D97706" : "#2563EB";
      const statusLbl  = m.status ? (m.status.charAt(0).toUpperCase() + m.status.slice(1)) : "Scheduled";
      const agenda     = m.agenda || m.meeting_purpose || "—";
      const leadName   = m.lead?.company_name || m.company_name || "—";
      const leadCode   = m.lead?.lead_code || "—";
      const contact    = m.customer_name || m.lead?.contact_name || "—";
      return `<tr>
        <td ${td("left")}  style="padding:9px 10px;font-size:11px;color:#64748B;font-family:monospace;background:${bg};border-top:1px solid #F1F5F9;">${shortId(m.id)}</td>
        <td ${td("left")}>${m.company_name || "—"}</td>
        <td ${td("left")}>${leadName}</td>
        <td ${td("left")} style="padding:9px 10px;font-size:11px;color:#64748B;font-family:monospace;background:${bg};border-top:1px solid #F1F5F9;">${leadCode}</td>
        <td ${td("left")}>${contact}</td>
        <td ${td("left")}>${m.customer_email || "—"}</td>
        <td ${td("left")}>${m.customer_phone || "—"}</td>
        <td ${td("left")} style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.title || "—"}</td>
        <td ${td("center")}>${fmtDate(m.start_time)}</td>
        <td ${td("center")}>${fmtTime(m.start_time)}</td>
        <td ${td("center")}>${getMeetingMode(m)}</td>
        <td ${td("center")}><span style="color:${statusClr};font-weight:600;">${statusLbl}</span></td>
        <td ${td("left")} style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${agenda}</td>
        <td ${td("left")}>${scheduler ? (scheduler.full_name || scheduler.email) : "—"}${scheduler ? `<br/><span style="font-size:10px;color:#94A3B8;">${rl(scheduler.role)}</span>` : ""}</td>
      </tr>`;
    }).join("");

    meetingsSection = `
    <tr><td style="padding:24px 32px 0;">
      <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:14px;border-left:3px solid #7C3AED;padding-left:10px;">Meeting Summary</div>
      <div style="overflow-x:auto;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;border-collapse:collapse;min-width:1380px;">
        <thead><tr>
          <th style="${mTh("left")}">Meeting ID</th>
          <th style="${mTh("left")}">Company</th>
          <th style="${mTh("left")}">Lead Name</th>
          <th style="${mTh("left")}">Lead ID</th>
          <th style="${mTh("left")}">Contact Person</th>
          <th style="${mTh("left")}">Email</th>
          <th style="${mTh("left")}">Phone</th>
          <th style="${mTh("left")}">Meeting Title</th>
          <th style="${mTh("center")}">Date</th>
          <th style="${mTh("center")}">Time</th>
          <th style="${mTh("center")}">Mode</th>
          <th style="${mTh("center")}">Status</th>
          <th style="${mTh("left")}">Agenda</th>
          <th style="${mTh("left")}">Scheduled By</th>
        </tr></thead>
        <tbody>${mtRows}</tbody>
      </table>
      </div>
    </td></tr>`;
  } else {
    meetingsSection = `
    <tr><td style="padding:24px 32px 0;">
      <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:14px;border-left:3px solid #7C3AED;padding-left:10px;">Meeting Summary</div>
      <div style="padding:18px 20px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;font-size:13px;color:#94A3B8;text-align:center;">
        No meetings scheduled today.
      </div>
    </td></tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Daily Sales Report</title>
</head>
<body style="margin:0;padding:0;background:#EFF3F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFF3F8;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
  style="max-width:960px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">

  <!-- HEADER -->
  <tr><td style="background:#0F2044;padding:28px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">
        <div style="font-size:9px;color:#475569;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:6px;font-weight:700;">Sales CRM &nbsp;&middot;&nbsp; DAILY REPORT</div>
        <div style="font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.4px;line-height:1.2;">Daily Sales Report</div>
        <div style="font-size:13px;color:#64748B;margin-top:7px;">${dateLabel}</div>
      </td>
      <td style="text-align:right;vertical-align:top;">
        <div style="font-size:10px;color:#475569;margin-bottom:4px;">Generated at <strong style="color:#64748B;">${genTime} IST</strong></div>
        <div style="font-size:10px;color:#475569;">For: <strong style="color:#94A3B8;">${recipientName}</strong></div>
        <div style="margin-top:10px;"><span style="font-size:10px;padding:4px 12px;background:rgba(59,130,246,0.12);color:#93C5FD;border-radius:99px;font-weight:700;border:1px solid rgba(59,130,246,0.2);">${rl(recipientRole)}</span></div>
      </td>
    </tr></table>
  </td></tr>

  <!-- TODAY'S SUMMARY -->
  <tr><td style="padding:24px 32px 0;">
    <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:14px;border-left:3px solid #2563EB;padding-left:10px;">Today's Summary</div>
    <div style="overflow-x:auto;">
    <table role="presentation" cellpadding="0" cellspacing="0"
      style="width:100%;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;border-collapse:collapse;">
      <tr>${summaryRow}</tr>
    </table>
    </div>
  </td></tr>

  <!-- EMPLOYEE PERFORMANCE TABLE -->
  <tr><td style="padding:24px 32px 0;">
    <div style="font-size:15px;font-weight:700;color:#1E3A5F;margin-bottom:14px;border-left:3px solid #059669;padding-left:10px;">Employee Performance</div>
    <div style="overflow-x:auto;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
      <thead><tr>
        <th style="${empTh("left")}">Employee</th>
        <th style="${empTh("center")}">Calls</th>
        <th style="${empTh("center")}">Emails</th>
        <th style="${empTh("center")}">Meetings</th>
        <th style="${empTh("center")}">Notes</th>
        <th style="${empTh("center")}">Activities</th>
      </tr></thead>
      <tbody>${empRows}</tbody>
    </table>
    </div>
  </td></tr>

  <!-- MEETING SUMMARY -->
  ${meetingsSection}

  <!-- FOOTER -->
  <tr><td style="background:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;margin-top:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:11px;color:#94A3B8;">&copy; ${new Date().getFullYear()} Sales CRM &nbsp;&middot;&nbsp; Automated Daily Sales Report &nbsp;&middot;&nbsp; Do not reply</td>
      <td style="text-align:right;font-size:11px;color:#94A3B8;">Complete details in the attached PDF</td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildDsrEmailText({ recipientName, recipientRole, dateLabel, scopeTotals, scopeProfiles, statsMap }) {
  const sep = "-".repeat(60);
  const lines = [
    `Sales CRM — DAILY SALES REPORT`,
    dateLabel,
    `For: ${recipientName} (${rl(recipientRole)})`,
    sep,
    `TODAY'S SUMMARY`,
    `  Calls:       ${scopeTotals.callsMade           || 0}`,
    `  Emails:      ${scopeTotals.emailsSent          || 0}`,
    `  Follow-ups:  ${scopeTotals.followUpsCompleted  || 0}`,
    `  Meetings:    ${scopeTotals.meetingsScheduled   || 0}`,
    `  Notes:       ${scopeTotals.notesAdded          || 0}`,
    `  Activities:  ${scopeTotals.activitiesCompleted || 0}`,
    sep,
    `EMPLOYEE PERFORMANCE`,
    `${"Employee".padEnd(24)} Calls  Emails  Meetings  Notes  Activities`,
    sep,
  ];
  scopeProfiles.forEach(p => {
    const s    = statsMap[p.id] || {};
    const name = (p.full_name || p.email || "").slice(0, 22).padEnd(24);
    lines.push(`${name} ${String(s.callsMade||0).padStart(5)}  ${String(s.emailsSent||0).padStart(6)}  ${String(s.meetingsScheduled||0).padStart(8)}  ${String(s.notesAdded||0).padStart(5)}  ${String(s.activitiesCompleted||0).padStart(10)}`);
  });
  lines.push(sep, `Full detailed report is attached as a PDF.`, `— Sales CRM`);
  return lines.join("\n");
}

module.exports = { buildDsrEmailHtml, buildDsrEmailText };
