const { Resend } = require("resend");
const nodemailer  = require("nodemailer"); // kept for per-user meeting SMTP only
const crypto      = require("crypto");

// ─── Resend (primary transport — proper DKIM/SPF, inbox delivery) ─────────────
const resend    = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// Authoritative FROM address across all transports. Configure MAIL_FROM_ADDRESS.
const COMPANY_EMAIL = process.env.MAIL_FROM_ADDRESS || process.env.RESEND_FROM || process.env.GMAIL_USER || process.env.MAIL_USER || "no-reply@example.com";
const FROM_ADDR = process.env.RESEND_FROM || COMPANY_EMAIL;
const FROM_NAME = process.env.MAIL_FROM_NAME || "Sales CRM";
const FROM      = `${FROM_NAME} <${FROM_ADDR}>`;

// ─── Global SMTP transport (company email) ─────────────────────
// GMAIL_USER/GMAIL_PASS takes priority; falls back to MAIL_USER/MAIL_PASS
const SMTP_USER = process.env.GMAIL_USER || process.env.MAIL_USER;
const SMTP_PASS = process.env.GMAIL_PASS || process.env.MAIL_PASS;
const GLOBAL_SMTP_HOST = process.env.MAIL_SMTP_HOST || "smtp.gmail.com";
const GLOBAL_SMTP_PORT = Number(process.env.MAIL_SMTP_PORT) || 465;
const globalTransport  = (SMTP_USER && SMTP_PASS)
  ? nodemailer.createTransport({
      host:   GLOBAL_SMTP_HOST,
      port:   GLOBAL_SMTP_PORT,
      secure: GLOBAL_SMTP_PORT === 465,
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
      tls:    { rejectUnauthorized: false },
    })
  : null;

const APP_URL = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost")
  ? process.env.FRONTEND_URL
  : (process.env.FRONTEND_URL || "http://localhost:5173");

function baseLayout(title, bodyHtml, { badgeColor = "#2563EB", badgeBg = "#EFF6FF", badgeBorder = "#BFDBFE" } = {}) {
  const LOGO = process.env.MAIL_LOGO_URL || "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F7FA;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">

        <!-- Top accent stripe -->
        <tr><td style="height:3px;background:${badgeColor};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Header: logo + badge -->
        <tr><td style="padding:22px 36px;border-bottom:1px solid #E5E7EB;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
            <td><img src="${LOGO}" alt="SALES CRM" height="26" style="display:block;border:0;" /></td>
            <td align="right">
              <span style="display:inline-block;padding:4px 14px;background:${badgeBg};border:1px solid ${badgeBorder};border-radius:100px;font-size:11px;font-weight:700;color:${badgeColor};letter-spacing:0.05em;text-transform:uppercase;">${title}</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px;">
          ${bodyHtml}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F9FAFB;padding:20px 36px;border-top:1px solid #E5E7EB;border-radius:0 0 16px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
            <td>
              <p style="margin:0;font-size:11.5px;color:#9CA3AF;line-height:1.7;">&#169; ${new Date().getFullYear()} SALES CRM &nbsp;&middot;&nbsp; Automated &nbsp;&middot;&nbsp; Do not reply</p>
            </td>
            <td align="right">
              <a href="https://your-domain.example" style="font-size:11.5px;color:#9CA3AF;text-decoration:none;">Sales CRM</a>
            </td>
          </tr></table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function credentialBox(rows) {
  const cells = rows.map(([label, value, mono], i, arr) => {
    const isLast = i === arr.length - 1;
    const borderStyle = isLast ? "" : "border-bottom:1px solid #F3F4F6;";
    return `
    <tr>
      <td style="padding:12px 18px;${borderStyle}font-size:12px;color:#6B7280;font-weight:500;width:38%;white-space:nowrap;vertical-align:middle;">${label}</td>
      <td style="padding:12px 18px;${borderStyle}font-size:13px;font-weight:600;color:#111827;vertical-align:middle;${mono ? "font-family:'Courier New',Courier,monospace;background:#F0F4FF;border-left:3px solid #BFDBFE;letter-spacing:0.03em;" : ""}">${value}</td>
    </tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;margin:20px 0;overflow:hidden;">${cells}</table>`;
}

function ctaButton(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:24px 0 20px;">
    <tr><td style="background:#2563EB;border-radius:10px;">
      <a href="${url}" style="display:block;padding:14px 28px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;text-align:center;border-radius:10px;">${label} &rarr;</a>
    </td></tr>
  </table>`;
}

function warningBox(text) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
    <tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-left:3px solid #F59E0B;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400E;">
      &#9888;&#65039; ${text}
    </td></tr>
  </table>`;
}

// Convert Resend-format attachments ({ filename, content: base64, content_type })
// to nodemailer format ({ filename, content: Buffer, contentType })
const toNmAttachments = (atts) =>
  (atts || []).map(a => ({
    filename:    a.filename,
    content:     typeof a.content === "string" ? Buffer.from(a.content, "base64") : a.content,
    contentType: a.content_type || a.contentType || "application/octet-stream",
  }));

// ─── Gmail API sender (pure HTTPS — works on Vercel serverless) ───────────────
// Requires env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
async function sendViaGmailApi({ to, subject, html, text, replyTo, attachments }) {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null; // not configured

  // Exchange refresh token for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Gmail token exchange failed: ${tokenData.error_description || tokenData.error}`);
  const accessToken = tokenData.access_token;

  // Build RFC 2822 MIME message
  const recipients = Array.isArray(to) ? to : [to];
  const boundary   = `----=_Part_${Date.now()}`;
  const altBound   = `${boundary}_alt`;

  const lines = [
    `From: ${FROM}`,
    `To: ${recipients.join(", ")}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBound}"`,
    ``,
    ...(text ? [
      `--${altBound}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      text,
    ] : []),
    `--${altBound}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    html || "",
    `--${altBound}--`,
  ];

  for (const att of (attachments || [])) {
    const b64 = typeof att.content === "string" ? att.content : Buffer.from(att.content).toString("base64");
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.content_type || att.contentType || "application/octet-stream"}`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      b64
    );
  }
  lines.push(`--${boundary}--`);

  const raw = Buffer.from(lines.join("\r\n")).toString("base64url");

  const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method:  "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ raw }),
  });
  if (!sendRes.ok) {
    const err = await sendRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gmail API send failed (${sendRes.status})`);
  }
  return sendRes.json();
}

const sendMail = async ({ to, subject, html, text, replyTo, attachments }) => {
  // 1. Gmail API — pure HTTPS, works on Vercel, no domain verification needed
  const gmailResult = await sendViaGmailApi({ to, subject, html, text, replyTo, attachments });
  if (gmailResult) return gmailResult;

  // 2. Gmail SMTP — works locally / on non-Vercel hosts (Vercel blocks outbound SMTP)
  if (globalTransport) {
    return globalTransport.sendMail({
      from:    FROM,
      to:      Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo     ? { replyTo }                                  : {}),
      ...(attachments ? { attachments: toNmAttachments(attachments) } : {}),
    });
  }

  throw new Error("No email transport configured. Add GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN to Vercel environment variables.");
};

// ─── Welcome / Invitation ─────────────────────────────────────────────────────

const sendWelcomeEmail = async ({ to, name, tempPassword, role, invitedBy, inviterEmail }) => {
  const displayEmail = to;
  const roleLabel = role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const fromName   = invitedBy ? `${invitedBy} (Sales CRM)` : "Sales CRM";

  const html = baseLayout("Team Invitation", `
    <!-- Icon hero -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;padding:24px;text-align:center;">
        <div style="width:52px;height:52px;background:#2563EB;border-radius:14px;margin:0 auto 14px;text-align:center;line-height:52px;font-size:24px;">&#127881;</div>
        <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#111827;">Welcome, ${name}!</h1>
        <p style="margin:0;font-size:13.5px;color:#3B82F6;font-weight:500;">You've been added to the SALES CRM workspace${invitedBy ? ` by ${invitedBy}` : ""}.</p>
      </td></tr>
    </table>
    <p style="margin:0 0 6px;font-size:14px;color:#475569;line-height:1.7;">Your account is ready. Use the credentials below to sign in and get started.</p>
    ${credentialBox([
      ["Login Email", displayEmail, false],
      ["Temporary Password", tempPassword, true],
      ["Your Role", roleLabel, false],
      ...(inviterEmail ? [["Invited By", inviterEmail, false]] : []),
    ])}
    ${ctaButton("Login to SALES CRM", `${APP_URL}/login`)}
    ${warningBox("Change your password immediately after your first login.")}
  `);

  const text = `Hi ${name},\n\nYou've been added to Sales CRM${invitedBy ? ` by ${invitedBy}` : ""}.\n\nLogin Email: ${displayEmail}\nTemporary Password: ${tempPassword}\nRole: ${roleLabel}\n\nLogin at: ${APP_URL}/login\n\nChange your password after first login.\n\n— Sales CRM`;

  const subject = "Welcome to Sales CRM — Your Account is Ready";

  // Try Resend first; fall back to SMTP globalTransport if Resend fails or is not configured
  try {
    return await sendMail({ to, subject, html, text, replyTo: inviterEmail });
  } catch (resendErr) {
    console.warn("[sendWelcomeEmail] Resend failed:", resendErr.message, "| RESEND_API_KEY:", process.env.RESEND_API_KEY ? "SET" : "MISSING");
  }

  if (globalTransport) {
    return globalTransport.sendMail({
      from: FROM,
      to,
      subject,
      html,
      text,
      ...(inviterEmail ? { replyTo: inviterEmail } : {}),
    });
  }

  throw new Error("Email delivery failed: no working transport (check RESEND_API_KEY or GMAIL_USER/GMAIL_PASS env vars)");
};

// ─── Password Reset ───────────────────────────────────────────────────────────

const sendPasswordResetEmail = async ({ to, name, resetLink, expiresInMinutes = 60 }) => {
  const html = baseLayout("Password Reset", `
    <!-- Icon hero -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td style="text-align:center;">
        <div style="width:52px;height:52px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;margin:0 auto 14px;text-align:center;line-height:52px;font-size:24px;">&#128274;</div>
        <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#111827;">Reset your password</h1>
        <p style="margin:0;font-size:13.5px;color:#6B7280;">Hi <strong style="color:#111827;">${name || "there"}</strong> — we received a reset request for your account.</p>
      </td></tr>
    </table>
    <p style="margin:0 0 22px;font-size:14px;color:#475569;line-height:1.7;">
      Click the button below to set a new password. This link expires in <strong style="color:#111827;">${expiresInMinutes} minutes</strong>.
    </p>
    ${ctaButton("Reset My Password", resetLink)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
      <tr><td style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:14px 18px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.05em;">Link (if button doesn't work)</p>
        <p style="margin:0;font-size:12px;color:#2563EB;word-break:break-all;line-height:1.6;">${resetLink}</p>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:12.5px;color:#9CA3AF;text-align:center;line-height:1.6;">
      Didn't request this? You can safely ignore this email — your password won't change.
    </p>
  `);

  const text = `Hi ${name || "there"},\n\nWe received a request to reset your The SALES CRM password.\n\nReset link:\n${resetLink}\n\nExpires in ${expiresInMinutes} minutes. If you didn't request this, ignore this email.\n\n— The SALES CRM`;

  return sendMail({ to, subject: "Reset Your Password – The SALES CRM", html, text });
};

// ─── System Notification ──────────────────────────────────────────────────────

const sendNotificationEmail = async ({ to, name, subject, title, message, ctaLabel, ctaUrl }) => {
  const buttonHtml = ctaLabel && ctaUrl ? ctaButton(ctaLabel, ctaUrl) : "";

  const html = baseLayout(title || subject, `
    <p style="margin:0 0 10px;font-size:14px;color:#111827;">Hi <strong>${name || "there"}</strong>,</p>
    <div style="font-size:14px;color:#475569;line-height:1.75;margin:0 0 20px;">${message}</div>
    ${buttonHtml}
  `);

  const text = `Hi ${name || "there"},\n\n${message}${ctaUrl ? `\n\n${ctaLabel || "Open"}: ${ctaUrl}` : ""}\n\n— The SALES CRM`;

  return sendMail({ to, subject, html, text });
};

// ─── Sensitive Field Edit Alert ───────────────────────────────────────────────

const sendSensitiveFieldAlert = async ({ to, toName, editorName, editorRole, leadName, companyName, editedFields }) => {
  const roleLabel = (editorRole || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const alertFieldsHtml = editedFields.map((f, i, arr) => {
    const isLast = i === arr.length - 1;
    return `<tr><td style="padding:10px 18px;${isLast ? "" : "border-bottom:1px solid #FEE2E2;"}font-size:13.5px;color:#991B1B;font-weight:500;">&#9679;&nbsp; ${f}</td></tr>`;
  }).join("");

  const html = baseLayout("Security Alert", `
    <!-- Red alert banner -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr><td style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:18px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
          <td style="font-size:22px;padding-right:14px;">&#128721;</td>
          <td>
            <p style="margin:0;font-size:13.5px;font-weight:700;color:#991B1B;">Restricted fields were edited</p>
            <p style="margin:3px 0 0;font-size:12.5px;color:#B91C1C;line-height:1.5;">A team member modified sensitive contact data on a lead in SALES CRM.</p>
          </td>
        </tr></table>
      </td></tr>
    </table>
    <p style="margin:0 0 6px;font-size:14px;color:#111827;">Hi <strong>${toName || "Admin"}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">The following lead record was modified. Please review the changes below.</p>
    ${credentialBox([
      ["Lead / Company", `${companyName || leadName}`, false],
      ["Edited by", editorName, false],
      ["Role", roleLabel, false],
    ])}
    <p style="margin:20px 0 8px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;">Fields Changed</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      ${alertFieldsHtml}
    </table>
    ${ctaButton("Review Lead Record", `${APP_URL}/leads`)}
    ${warningBox("If this edit was unauthorised, contact your administrator immediately and revoke the user's access.")}
  `, { badgeColor: "#DC2626", badgeBg: "#FEF2F2", badgeBorder: "#FECACA" });

  const text = `Hi ${toName || "Admin"},\n\n${editorName} (${roleLabel}) edited restricted fields on "${companyName || leadName}".\n\nFields: ${editedFields.join(", ")}\n\nReview: ${APP_URL}/leads\n\n— The SALES CRM`;

  return sendMail({ to, subject: `Sensitive lead data changed by ${editorName}`, html, text });
};

// ─── iCalendar generator (RFC 5545 + RFC 5546 iTIP) ──────────────────────────

function generateICS({ uid, sequence = 0, method = "REQUEST", title, startTime, endTime, organizerName, organizerEmail, attendees = [], location, description, meetingLink }) {
  // RFC 5545 §3.1: fold lines longer than 75 octets
  const fold = (line) => {
    if (!line || line.length <= 75) return line;
    let out = "", pos = 0;
    while (pos < line.length) {
      const chunk = pos === 0 ? 75 : 74;
      out += (pos > 0 ? "\r\n " : "") + line.slice(pos, pos + chunk);
      pos += chunk;
    }
    return out;
  };
  // RFC 5545 §3.3.11: escape TEXT
  const esc = (s) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  // UTC datetime format: 20260524T093000Z
  const fmtDT = (d) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const safeEnd = endTime || new Date(new Date(startTime).getTime() + 3600000).toISOString();
  const locVal  = location || meetingLink || null;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sales CRM//Meeting//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    fold(`UID:${uid}`),
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${fmtDT(new Date())}`,
    `DTSTART:${fmtDT(startTime)}`,
    `DTEND:${fmtDT(safeEnd)}`,
    fold(`SUMMARY:${esc(title)}`),
    description ? fold(`DESCRIPTION:${esc(description)}`) : null,
    locVal       ? fold(`LOCATION:${esc(locVal)}`)            : null,
    meetingLink  ? fold(`URL:${meetingLink}`)                  : null,
    fold(`ORGANIZER;CN="${esc(organizerName)}":MAILTO:${organizerEmail}`),
    ...attendees.map((a) => fold(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${esc(a.name || a.email)}":MAILTO:${a.email}`)),
    method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    // 30-minute display alarm
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:Upcoming: ${esc(title)}`),
    "END:VALARM",
    // 1-day display alarm
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:Tomorrow: ${esc(title)}`),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}

// ─── Meeting Invite — uses the scheduling user's own SMTP ────────────────────
const sendMeetingInviteEmail = async ({ to, customerName, title, startTime, endTime, meetingType, meetingLink, location, mapsUrl: mapsUrlOverride = null, description, hostName, hostEmail, senderEmail, senderPassword, meetingPurpose, companyName, meetingId, sequence = 0, allAttendees = [], gmailAccessToken = null }) => {
  // Per-user transport only — per-user SMTP is resolved later when choosing send path
  const isOnline  = meetingType !== "in_person" && meetingType !== "in-person";
  const typeLabel = meetingType === "google_meet" ? "Google Meet"
    : meetingType === "teams"     ? "Microsoft Teams"
    : meetingType === "jitsi"     ? "Jitsi Meet"
    : isOnline                    ? "Online Meeting"
    : "In-Person Meeting";

  const purposeLabels = {
    follow_up: "Follow-up", discovery: "Discovery Call", demo: "Product Demo",
    negotiation: "Negotiation", proposal: "Proposal Discussion", requirements: "Requirement Gathering",
    onboarding: "Onboarding", support: "Support Meeting", internal: "Internal Discussion",
    presentation: "Client Presentation", payment: "Payment Discussion", closing: "Closing Discussion",
  };
  const purposeLabel = meetingPurpose ? (purposeLabels[meetingPurpose] || meetingPurpose) : null;

  const dateStr = new Date(startTime).toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata",
  });
  const timeStr = new Date(startTime).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
  const endTimeStr = endTime
    ? new Date(endTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : null;

  // Compute duration
  const durationMins = endTime ? Math.round((new Date(endTime) - new Date(startTime)) / 60000) : null;
  const durationStr  = durationMins
    ? durationMins < 60 ? `${durationMins} min` : `${Math.floor(durationMins / 60)}h${durationMins % 60 ? ` ${durationMins % 60}m` : ""}`
    : null;

  const LOGO = process.env.MAIL_LOGO_URL || "";

  // Google Calendar quick-add URL for the email CTA button (for the recipient, not the CRM user)
  const gcalUrl = (() => {
    const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: title || "Meeting",
      dates: `${fmt(startTime)}/${fmt(endTime || new Date(new Date(startTime).getTime() + 3600000))}`,
      details: [description, meetingLink ? `Join: ${meetingLink}` : ""].filter(Boolean).join("\n\n") || `Meeting with ${hostName || "Sales CRM"}`,
      location: location || meetingLink || "",
    });
    const recipient = Array.isArray(to) ? to[0] : to;
    if (recipient) p.append("add", recipient);
    return `https://calendar.google.com/calendar/render?${p.toString()}`;
  })();

  const agendaHtml = description
    ? description.split("\n").map((l) => `<div style="margin:4px 0;font-size:13.5px;color:#0f172a;line-height:1.7;">${l || "&nbsp;"}</div>`).join("")
    : null;

  const dayNum         = new Date(startTime).toLocaleString("en-US", { day: "numeric",   timeZone: "Asia/Kolkata" });
  const monthYearLabel = new Date(startTime).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).toUpperCase();
  const dayNameStr     = new Date(startTime).toLocaleString("en-US", { weekday: "long",  timeZone: "Asia/Kolkata" });
  const dayMonthStr    = new Date(startTime).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
  const hostInitials   = (hostName || "CC").split(" ").map(w => w[0] || "").join("").slice(0, 2).toUpperCase();

  // ── Meeting-type flags ────────────────────────────────────────────────────────
  const isGoogleMeet  = meetingType === "google_meet";
  const isTeams       = meetingType === "teams";
  const isZoom        = meetingType === "jitsi" || meetingType === "zoom";
  const isInPerson    = !isOnline;

  // ── RSVP action URLs (public backend endpoint) ────────────────────────────────
  const BACKEND_BASE  = process.env.BACKEND_URL || process.env.API_URL || "http://localhost:5000";
  const acceptUrl     = meetingId ? `${BACKEND_BASE}/api/meetings/rsvp?id=${meetingId}&action=accept`     : "#";
  const declineUrl    = meetingId ? `${BACKEND_BASE}/api/meetings/rsvp?id=${meetingId}&action=decline`    : "#";
  const rescheduleUrl = meetingId ? `${APP_URL}/meetings`                                                 : "#";

  // ── Response deadline: 24 h before meeting ────────────────────────────────────
  const responseDeadlineStr = (() => {
    if (!startTime) return dateStr;
    const dl = new Date(new Date(startTime).getTime() - 24 * 3600000);
    return dl > new Date()
      ? dl.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })
      : dateStr;
  })();

  // ── Outlook calendar URL ──────────────────────────────────────────────────────
  const outlookCalUrl = (() => {
    const fmt = (d) => new Date(d).toISOString();
    const p = new URLSearchParams({
      path: "/calendar/action/compose", rru: "addevent",
      subject: title || "Meeting",
      startdt: fmt(startTime),
      enddt:   fmt(endTime || new Date(new Date(startTime).getTime() + 3600000)),
      body:    [description, meetingLink ? `Join: ${meetingLink}` : ""].filter(Boolean).join("\n"),
      location: location || meetingLink || "",
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
  })();

  // ── Yahoo Calendar URL ────────────────────────────────────────────────────────
  const yahooCalUrl = (() => {
    const fmtY = (d) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const safeEndY = endTime || new Date(new Date(startTime).getTime() + 3600000).toISOString();
    const p = new URLSearchParams({
      v: "60", title: title || "Meeting",
      st: fmtY(startTime), et: fmtY(safeEndY),
      desc: [description, meetingLink ? `Join: ${meetingLink}` : ""].filter(Boolean).join("\n"),
      in_loc: location || meetingLink || "",
    });
    return `https://calendar.yahoo.com/?${p.toString()}`;
  })();

  // ── Apple / ICS download URL (backend endpoint) ───────────────────────────────
  const appleCalUrl = meetingId
    ? `${BACKEND_BASE}/api/meetings/ics/${meetingId}`
    : null;

  // ── Participants ──────────────────────────────────────────────────────────────
  const allParticipants  = (Array.isArray(allAttendees) ? allAttendees : []).filter(a => a && a.email);
  const participantCount = allParticipants.length;
  const participantsHtml = allParticipants.map(a =>
    `<span style="display:inline-block;background:#e8eaf6;color:#1a2570;padding:4px 12px;border-radius:20px;font-size:13px;margin:3px 3px 3px 0;font-family:Arial,Helvetica,sans-serif;">${a.name || a.email}</span>`
  ).join("");

  // ── Misc ──────────────────────────────────────────────────────────────────────
  const mapsUrl    = mapsUrlOverride || (location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : "#");
  const supportUrl = `mailto:${hostEmail || FROM_ADDR}`;

  // ── Pre-computed conditional HTML blocks (avoids nested template literal confusion) ──
  const locationSection = (isInPerson && location) ? `
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #eef2f8;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
              <td width="42%" style="font-weight:700;font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">&#128205; Location</td>
              <td style="font-size:14px;color:#444;font-family:Arial,Helvetica,sans-serif;">${location}<br/><br/><a href="${mapsUrl}" target="_blank" style="color:#0a52ff;text-decoration:none;font-weight:600;">&#128205; View on Google Maps</a></td>
            </tr></table>
          </td>
        </tr>` : "";

  const meetingLinkSection = meetingLink ? `
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #eef2f8;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="middle">
              <td width="42%" style="font-weight:700;font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">${isTeams ? "&#128188; Teams Meeting" : isZoom ? "&#128249; Zoom Meeting" : "&#127909; Meeting Link"}</td>
              <td><a href="${meetingLink}" target="_blank" style="display:inline-block;background:${isTeams ? "#6264a7" : isZoom ? "#2D8CFF" : "#0a52ff"};color:#ffffff;padding:10px 22px;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">${isGoogleMeet ? "Join Google Meet" : isTeams ? "Join Microsoft Teams" : isZoom ? "Join Zoom Meeting" : "Join Meeting"}</a></td>
            </tr></table>
          </td>
        </tr>` : "";

  const descriptionSection = description ? `
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #eef2f8;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
              <td width="42%" style="font-weight:700;font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">&#128196; Reason for Meeting</td>
              <td style="font-size:14px;color:#444;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">${description.replace(/\n/g, "<br/>")}</td>
            </tr></table>
          </td>
        </tr>` : "";

  const participantsSection = participantCount > 0 ? `
        <tr>
          <td style="padding:16px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr valign="top">
              <td width="42%" style="font-weight:700;font-size:14px;color:#1a2540;font-family:Arial,Helvetica,sans-serif;padding-right:12px;">&#128101; Additional Participants</td>
              <td style="font-size:14px;color:#444;font-family:Arial,Helvetica,sans-serif;"><strong>${participantCount} Member${participantCount !== 1 ? "s" : ""}</strong><br/><br/>${participantsHtml}</td>
            </tr></table>
          </td>
        </tr>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Invitation &#8211; ${title || "Meeting"}</title>
</head>
<body style="margin:0;padding:0;background:#F5F7FB;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;mso-line-height-rule:exactly;">


<!-- ═══════════════════════════════════════════════════════════════════════
     OUTER WRAPPER
═══════════════════════════════════════════════════════════════════════ -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F7FB;padding:48px 32px 48px;">
<tr><td align="center">

<!-- ═══════════════════════════════════════════════════════════════════════
     MAIN EMAIL CARD  (max 680px, white, 20px radius)
═══════════════════════════════════════════════════════════════════════ -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%;background:#FFFFFF;border-radius:20px;border:1px solid #E5E7EB;box-shadow:0 12px 40px rgba(15,23,42,0.08);">
<tr><td style="padding:40px 40px 28px;">

  <!-- ── HEADER ROW ──────────────────────────────────────────────────────── -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
  <tr valign="middle">
    <td><img src="${LOGO}" alt="Sales CRM" height="54" style="display:block;border:0;max-width:210px;height:54px;" /></td>
    <td align="right">
      <div style="font-size:18px;font-weight:600;color:#0F172A;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;line-height:1.2;">Meeting Invitation</div>
    </td>
  </tr>
  </table>
  <div style="height:1px;background:#E5E7EB;margin-bottom:36px;font-size:0;line-height:0;">&zwnj;</div>

  <!-- ── GREETING + CALENDAR CARD ──────────────────────────────────────── -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
  <tr valign="top">

    <!-- Left: Greeting block -->
    <td style="vertical-align:top;">
      <h1 style="margin:0 0 12px;font-size:30px;font-weight:700;color:#111827;line-height:1.2;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${customerName?.trim() ? `Hi ${customerName.trim().replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())},` : "Hi,"}</h1>
      <p style="margin:0 0 20px;font-size:20px;font-weight:500;color:#475569;line-height:1.6;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">You are invited to a meeting.</p>
      <p style="margin:0;font-size:17px;font-weight:500;color:#334155;line-height:1.65;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">
        <strong style="font-weight:700;color:#0F172A;">${hostName || "Sales CRM Team"}</strong> from <strong style="font-weight:700;color:#2563EB;">Sales CRM</strong> has invited you to a meeting.
      </p>
      ${purposeLabel ? `<p style="margin:18px 0 0;"><span style="display:inline-block;background:#EEF6FF;border:1px solid #BFDBFE;border-radius:100px;box-shadow:0 1px 2px rgba(37,99,235,0.08);font-size:12.5px;font-weight:700;letter-spacing:0.02em;color:#2563EB;padding:8px 18px;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;"><span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:#2563EB;margin-right:8px;vertical-align:middle;">&nbsp;</span>${purposeLabel}</span></p>` : ""}
    </td>

    <!-- Right: Premium Calendar Widget -->
    <td width="174" style="vertical-align:top;padding-left:24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:150px;background:#FFFFFF;border-radius:18px;border:1px solid #E5E7EB;box-shadow:0 10px 30px rgba(0,0,0,0.08);overflow:hidden;">
        <tr><td align="center" style="background:#2563EB;padding:11px 12px;border-radius:18px 18px 0 0;">
          <div style="font-size:12px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.08em;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${monthYearLabel}</div>
        </td></tr>
        <tr><td align="center" style="padding:16px 12px 2px;">
          <div style="font-size:42px;font-weight:700;color:#111827;line-height:1;letter-spacing:-0.02em;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${dayNum}</div>
        </td></tr>
        <tr><td align="center" style="padding:4px 12px 12px;">
          <div style="font-size:14px;font-weight:600;color:#64748B;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${dayNameStr}</div>
        </td></tr>
        <tr><td style="padding:0 18px;"><div style="height:1px;background:#E5E7EB;font-size:0;line-height:0;">&zwnj;</div></td></tr>
        <tr><td align="center" style="padding:12px 12px 16px;">
          <div style="font-size:12px;font-weight:700;color:#111827;line-height:1.4;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${timeStr}${endTimeStr ? " – " + endTimeStr : ""}</div>
          <div style="font-size:11px;font-weight:500;color:#94A3B8;margin-top:4px;letter-spacing:0.04em;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">IST</div>
        </td></tr>
      </table>
    </td>

  </tr>
  </table>

  <!-- ── SECTION DIVIDER ───────────────────────────────────────────────── -->
  <div style="height:1px;background:#E5E7EB;margin-bottom:32px;font-size:0;line-height:0;">&zwnj;</div>

  <!-- ── MEETING INFORMATION CARD ─────────────────────────────────────── -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border-radius:18px;border:1px solid #E2E8F0;margin-bottom:36px;">
  <tr><td style="padding:28px;">

    <!-- Row 1: Agenda (always shown, centered) -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;"><tr valign="middle">
      <td style="padding-right:10px;line-height:0;vertical-align:middle;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/></svg></td>
      <td style="font-size:15px;font-weight:700;color:#111827;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Agenda</td>
    </tr></table>
    <div style="font-size:16px;font-weight:500;color:#334155;line-height:1.7;margin-bottom:24px;text-align:center;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${description ? description.replace(/\n/g, "<br/>") : `<span style="color:#94A3B8;font-style:italic;">Not Provided</span>`}</div>

    <!-- Row divider -->
    <div style="height:1px;background:#E5E7EB;margin-bottom:24px;font-size:0;line-height:0;">&zwnj;</div>

    <!-- Row 2: Meeting Title | Organized By -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr valign="top">
      <td width="50%" style="padding-right:20px;padding-bottom:24px;vertical-align:top;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;"><tr valign="middle">
          <td style="padding-right:10px;line-height:0;vertical-align:middle;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="15.5" r="1.6" fill="#2563EB" stroke="none"/></svg></td>
          <td style="font-size:15px;font-weight:700;color:#111827;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Meeting Title</td>
        </tr></table>
        <div style="font-size:16px;font-weight:600;color:#111827;line-height:1.4;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${title}</div>
      </td>
      <td width="50%" style="padding-bottom:24px;vertical-align:top;text-align:right;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px auto;"><tr valign="middle">
          <td style="padding-right:10px;line-height:0;vertical-align:middle;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></td>
          <td style="font-size:15px;font-weight:700;color:#111827;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Organizer</td>
        </tr></table>
        <div style="font-size:16px;font-weight:600;color:#111827;line-height:1.4;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${hostName || "Sales CRM Team"}${hostEmail ? ` <span style="font-size:14px;font-weight:400;color:#64748B;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">(${hostEmail})</span>` : ""}</div>
      </td>
    </tr>
    </table>

    <!-- Row divider -->
    <div style="height:1px;background:#E5E7EB;margin-bottom:24px;font-size:0;line-height:0;">&zwnj;</div>

    <!-- Row 3: Meeting Mode (extreme left) + Duration (extreme right) — one row -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
    <tr valign="top">
      <td width="50%" style="text-align:left;vertical-align:top;">
        <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:10px;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Meeting Mode</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr valign="middle">
          ${isGoogleMeet
            ? `<td style="padding-right:8px;line-height:0;vertical-align:middle;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 7A1.5 1.5 0 015 5.5h10A1.5 1.5 0 0116.5 7v6.25l5-3.5v8.5l-5-3.5V17A1.5 1.5 0 0115 18.5H5A1.5 1.5 0 013.5 17V7z" fill="#00897B"/></svg></td><td><span style="display:inline-block;background:#E0F7FA;border-radius:999px;padding:7px 16px;font-size:13px;font-weight:600;color:#00695C;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Google Meet</span></td>`
            : isTeams
            ? `<td style="padding-right:8px;line-height:0;vertical-align:middle;"><svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="5" fill="#6264A7"/><text x="12" y="17.5" font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle">T</text></svg></td><td><span style="display:inline-block;background:#EDE9FE;border-radius:999px;padding:7px 16px;font-size:13px;font-weight:600;color:#5B21B6;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Microsoft Teams</span></td>`
            : isInPerson
            ? `<td style="padding-right:8px;line-height:0;vertical-align:middle;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></td><td><span style="display:inline-block;background:#F0FDF4;border-radius:999px;padding:7px 16px;font-size:13px;font-weight:600;color:#15803D;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">In-Person Meeting</span></td>`
            : `<td style="padding-right:8px;line-height:0;vertical-align:middle;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></svg></td><td><span style="display:inline-block;background:#EEF6FF;border-radius:999px;padding:7px 16px;font-size:13px;font-weight:600;color:#2563EB;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Virtual Meeting</span></td>`}
        </tr>
        </table>
      </td>
      ${durationStr ? `<td width="50%" style="text-align:right;vertical-align:top;">
        <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:10px;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Duration</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr valign="middle">
          <td style="padding-right:8px;line-height:0;vertical-align:middle;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg></td>
          <td style="font-size:16px;font-weight:600;color:#111827;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${durationStr}</td>
        </tr></table>
      </td>` : `<td width="50%"></td>`}
    </tr>
    </table>

    <!-- Row divider -->
    <div style="height:1px;background:#E5E7EB;margin-bottom:24px;font-size:0;line-height:0;">&zwnj;</div>

    <!-- Row 5: Meeting Link / Location — full width, centered -->
    <div style="text-align:center;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 10px;"><tr valign="middle">
      <td style="padding-right:10px;line-height:0;vertical-align:middle;">${isInPerson && location
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M10 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10.5 5.5"/><path d="M14 11a5 5 0 00-7.07 0L5 12.93a5 5 0 007.07 7.07L13.5 18.5"/></svg>`}</td>
      <td style="font-size:15px;font-weight:700;color:#111827;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${isInPerson && location ? "Location" : "Meeting Link"}</td>
    </tr></table>
    ${isInPerson && location
      ? `<div><span style="font-size:16px;font-weight:600;color:#111827;line-height:1.4;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${location}</span>&nbsp;&nbsp;<a href="${mapsUrl}" target="_blank" style="font-size:13px;font-weight:600;color:#2563EB;text-decoration:none;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">View on Maps &rarr;</a></div>`
      : meetingLink
      ? `<a href="${meetingLink}" target="_blank" style="font-size:15px;font-weight:600;color:#2563EB;text-decoration:none;word-break:break-all;line-height:1.5;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${meetingLink}</a>`
      : `<div style="font-size:15px;color:#94A3B8;font-style:italic;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">To be confirmed</div>`}
    </div>

  </td></tr>
  </table>

  <!-- ── PRIMARY CTA BUTTON ────────────────────────────────────────────── -->
  ${meetingLink ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:14px;background:linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%);box-shadow:0 12px 30px rgba(37,99,235,0.35);">
      <a href="${meetingLink}" target="_blank" style="display:block;width:240px;height:52px;line-height:52px;text-align:center;color:#FFFFFF;font-size:17px;font-weight:700;text-decoration:none;border-radius:14px;letter-spacing:0.2px;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px;margin-top:-2px;" xmlns="http://www.w3.org/2000/svg"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>Join Meeting</a>
    </td></tr></table>
  </td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:36px;">
  <tr><td align="center">
    <p style="margin:0;font-size:14px;color:#64748B;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Can't join? <a href="mailto:${hostEmail || "processenvSUPPORT_EMAIL"}" style="color:#2563EB;text-decoration:none;font-weight:500;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Contact the meeting organizer.</a></p>
  </td></tr>
  </table>` : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:36px;">
  <tr><td align="center">
    <p style="margin:0;font-size:14px;color:#64748B;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Questions? <a href="mailto:${hostEmail || "processenvSUPPORT_EMAIL"}" style="color:#2563EB;text-decoration:none;font-weight:500;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">Contact the meeting organizer.</a></p>
  </td></tr>
  </table>`}

  <!-- ── ADD TO CALENDAR ───────────────────────────────────────────────── -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr valign="top">
    <td width="33%" style="padding:0 5px 0 0;">
      <a href="${gcalUrl}" target="_blank" style="display:block;text-align:center;background:#FFFFFF;border:1.5px solid #E5E7EB;color:#374151;font-size:13px;font-weight:600;padding:12px 8px;border-radius:10px;text-decoration:none;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;white-space:nowrap;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="10" y2="15"/><line x1="14" y1="15" x2="16" y2="15"/></svg>Google Calendar
      </a>
    </td>
    <td width="33%" style="padding:0 2.5px;">
      <a href="${outlookCalUrl}" target="_blank" style="display:block;text-align:center;background:#FFFFFF;border:1.5px solid #E5E7EB;color:#374151;font-size:13px;font-weight:600;padding:12px 8px;border-radius:10px;text-decoration:none;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;white-space:nowrap;">
        <svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align:middle;margin-right:5px;" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="5" fill="#0078D4"/><text x="12" y="17.5" font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle">O</text></svg>Outlook
      </a>
    </td>
    <td width="34%" style="padding:0 0 0 5px;">
      <a href="${appleCalUrl || yahooCalUrl}" target="_blank" style="display:block;text-align:center;background:#FFFFFF;border:1.5px solid #E5E7EB;color:#374151;font-size:13px;font-weight:600;padding:12px 8px;border-radius:10px;text-decoration:none;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;white-space:nowrap;">
        ${appleCalUrl
          ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="#1D1D1F" style="vertical-align:middle;margin-right:5px;" xmlns="http://www.w3.org/2000/svg"><path d="M16.365 1.43c0 1.14-.393 2.077-1.176 2.816-.943.878-2.006 1.416-3.147 1.34-.056-1.156.4-2.253 1.19-3.037.826-.812 2.086-1.406 3.133-1.51.03.13.045.26.045.393zm4.396 15.65c-.363.845-.79 1.628-1.29 2.343-.678.98-1.235 1.658-1.658 2.03-.68.635-1.406.96-2.185.976-.556.017-1.226-.153-2.006-.508-.782-.36-1.5-.535-2.155-.535-.686 0-1.428.176-2.234.535-.807.355-1.454.542-1.947.56-.75.033-1.484-.302-2.207-.996-.463-.416-1.05-1.12-1.766-2.115-.77-1.06-1.404-2.293-1.9-3.7-.532-1.512-.798-2.98-.798-4.406 0-1.633.36-3.037 1.078-4.207.563-.94 1.31-1.68 2.244-2.22.933-.54 1.94-.816 3.02-.83.68-.017 1.485.238 2.415.762.93.526 1.53.79 1.795.79.198 0 .87-.31 2.01-.926 1.075-.573 1.982-.81 2.72-.71 2.01.16 3.523.955 4.535 2.386-1.798 1.09-2.687 2.615-2.674 4.568.014 1.523.556 2.792 1.628 3.796.485.462 1.026.82 1.626 1.075-.13.376-.267.735-.412 1.076z"/></svg>Apple Calendar`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6001D2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Yahoo Calendar`}
      </a>
    </td>
  </tr>
  </table>

  <!-- ── DIVIDER BEFORE FOOTER ──────────────────────────────────────────── -->
  <div style="height:1px;background:#E5E7EB;margin-top:8px;font-size:0;line-height:0;">&zwnj;</div>

</td></tr>

<!-- ── INTEGRATED FOOTER (same card, light-blue continuation) ──────────── -->
<tr><td style="background:#F8FBFF;padding:24px 40px 28px;border-radius:0 0 20px 20px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr valign="top">
    <td style="vertical-align:top;">
      <img src="${LOGO}" alt="Sales CRM" height="44" style="display:block;border:0;max-width:275px;height:44px;margin-bottom:14px;" />
      <div style="font-size:14px;font-weight:600;color:#1E293B;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;line-height:1.5;">Outcome is our language</div>
      <div style="font-size:12.5px;font-style:italic;color:#64748B;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;line-height:1.6;margin-top:2px;">Small steps every day</div>
    </td>
    <td align="right" style="vertical-align:top;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px auto;">
      <tr valign="middle">
        <td style="padding-right:7px;line-height:0;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </td>
        <td><a href="mailto:processenvSUPPORT_EMAIL" style="font-size:12.5px;color:#64748B;text-decoration:none;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">processenvSUPPORT_EMAIL</a></td>
      </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px auto;">
      <tr valign="middle">
        <td style="padding-right:7px;line-height:0;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
        </td>
        <td><a href="https://your-domain.example" target="_blank" style="font-size:12.5px;color:#64748B;text-decoration:none;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">your-domain.example</a></td>
      </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 0 auto;">
      <tr valign="middle">
        <td style="padding-right:7px;line-height:0;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M14.83 9a3.5 3.5 0 100 6"/></svg>
        </td>
        <td><span style="font-size:12.5px;color:#94A3B8;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">${new Date().getFullYear()} Sales CRM Technologies. All Rights Reserved.</span></td>
      </tr>
      </table>
    </td>
  </tr>
  </table>

</td></tr>
</table>
<!-- END UNIFIED CARD -->

</td></tr>
</table>
<!-- END OUTER WRAPPER -->

</body>
</html>`;

  const text = `Dear ${customerName || "there"},\n\nYou have been invited to a meeting with Sales CRM. Please find the meeting details below.\n\nMeeting Title: ${title}\nDate: ${dateStr}\nTime: ${timeStr}${endTimeStr ? " – " + endTimeStr : ""} (IST)${durationStr ? " · " + durationStr : ""}${purposeLabel ? "\nPurpose: " + purposeLabel : ""}${meetingLink ? "\nMeeting Link: " + meetingLink : location ? "\nLocation: " + location : ""}${description ? "\n\nReason / Agenda:\n" + description : ""}\n\nWe look forward to your valuable time and insights. Please confirm your availability at your earliest convenience.\n\nBest Regards,\n${hostName || "Sales CRM Team"}${companyName ? "\n" + companyName : ""}${hostEmail ? "\n" + hostEmail : ""}\n\nSales CRM | your-domain.example `;

  // ── Generate iCalendar (RFC 5545) content ────────────────────────────────────
  const calUID       = meetingId ? `${meetingId}@salescrm.app` : `${crypto.randomUUID()}@salescrm.app`;
  const calOrganizer = hostEmail || senderEmail || FROM_ADDR;
  // Merge primary recipient + any additional attendees into the iCal ATTENDEE list
  const icsAttendees = [
    ...(Array.isArray(to) ? to : [to]).map((e) => ({ name: customerName || e, email: e })),
    ...allAttendees.filter((a) => a && a.email && !( Array.isArray(to) ? to : [to]).includes(a.email)),
  ];
  const icsContent   = generateICS({
    uid:           calUID,
    sequence,
    method:        "REQUEST",
    title,
    startTime,
    endTime,
    organizerName: hostName || "Sales CRM",
    organizerEmail: calOrganizer,
    attendees:     icsAttendees,
    location,
    description,
    meetingLink,
  });
  const icsBuffer = Buffer.from(icsContent, "utf-8");

  const subjectLine = `Meeting Invitation – ${title}`;

  // Gmail API first — uses stored OAuth2 token, HTTPS only, no domain verification needed
  if (gmailAccessToken) {
    const fromName  = hostName || FROM_NAME;
    const fromEmail = senderEmail || COMPANY_EMAIL;
    // fold base64 at 76 chars per line (RFC 2045)
    const foldB64 = (b64) => b64.match(/.{1,76}/g)?.join("\r\n") || b64;
    const icsB64  = foldB64(icsBuffer.toString("base64"));
    const ts      = Date.now();
    const b1      = `----=_Mixed_${ts}`;
    const b2      = `----=_Alt_${ts}`;
    const subjB64 = `=?UTF-8?B?${Buffer.from(subjectLine).toString("base64")}?=`;
    const toAddr  = Array.isArray(to) ? to.join(", ") : to;
    // Use 8bit transfer encoding for text/html and text/plain — avoids double-encoding the large HTML blob
    const mime = [
      `From: "${fromName}" <${fromEmail}>`,
      `To: ${toAddr}`,
      `Subject: ${subjB64}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${b1}"`,
      ``,
      `--${b1}`,
      `Content-Type: multipart/alternative; boundary="${b2}"`,
      ``,
      `--${b2}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      text,
      `--${b2}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      html,
      `--${b2}`,
      `Content-Type: text/calendar; method=REQUEST; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      icsB64,
      `--${b2}--`,
      `--${b1}`,
      `Content-Type: text/calendar; method=REQUEST; name="invite.ics"`,
      `Content-Disposition: attachment; filename="invite.ics"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      icsB64,
      `--${b1}--`,
    ].join("\r\n");
    const raw = Buffer.from(mime).toString("base64url");
    try {
      const resp = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${gmailAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.warn("[sendMeetingInvite] Per-user Gmail API failed:", err.error?.message || resp.status, "— trying next transport");
      } else {
        return resp.json();
      }
    } catch (gmailErr) {
      console.warn("[sendMeetingInvite] Per-user Gmail API error:", gmailErr.message, "— trying next transport");
    }
  }

  // Resend fallback — Vercel blocks outbound SMTP; Resend uses HTTPS
  if (resend) {
    try {
      const result = await resend.emails.send({
        from:        FROM,
        to:          Array.isArray(to) ? to : [to],
        subject:     subjectLine,
        html,
        text,
        ...(hostEmail ? { reply_to: hostEmail } : {}),
        attachments: [{
          filename:    "invite.ics",
          content:     icsBuffer,
          contentType: "text/calendar; method=REQUEST",
        }],
      });
      if (result.error) {
        console.warn("[sendMeetingInvite] Resend failed:", result.error.message, "— trying next transport");
      } else {
        return result;
      }
    } catch (resendErr) {
      console.warn("[sendMeetingInvite] Resend error:", resendErr.message, "— trying next transport");
    }
  }

  // SMTP fallback (local dev or non-Vercel hosting where SMTP is not blocked)
  const usePerUser = !!(senderEmail && senderPassword);
  const transport  = usePerUser
    ? nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: senderEmail, pass: senderPassword },
        tls:  { rejectUnauthorized: false },
      })
    : globalTransport;

  const effectiveSender = usePerUser ? senderEmail : COMPANY_EMAIL;
  const fromDisplay     = `${hostName || FROM_NAME} <${effectiveSender}>`;

  if (transport) {
    try {
      return await transport.sendMail({
        from:        fromDisplay,
        to,
        subject:     subjectLine,
        html,
        text,
        ...(hostEmail ? { replyTo: hostEmail } : {}),
        messageId:   `<${calUID.split("@")[0]}-${Date.now()}@salescrm.app>`,
        alternatives: [{
          contentType: "text/calendar; method=REQUEST; charset=UTF-8",
          content:     icsBuffer,
        }],
        attachments: [{
          filename:    "invite.ics",
          content:     icsBuffer,
          contentType: "text/calendar; method=REQUEST; name=invite.ics",
        }],
      });
    } catch (smtpErr) {
      console.warn("[sendMeetingInvite] SMTP transport failed (likely blocked by host):", smtpErr.message);
    }
  }

  // Final fallback: company Gmail API (GMAIL_REFRESH_TOKEN — pure HTTPS, works on Vercel)
  try {
    return await sendMail({
      to:          Array.isArray(to) ? to : [to],
      subject:     subjectLine,
      html,
      text,
      attachments: [{
        filename:     "invite.ics",
        content:      icsBuffer.toString("base64"),
        content_type: "text/calendar; method=REQUEST; name=invite.ics",
      }],
    });
  } catch (fallbackErr) {
    console.warn("[sendMeetingInvite] Company Gmail API fallback failed:", fallbackErr.message);
  }

  console.warn("[sendMeetingInvite] No email transport available — invite skipped");
  return { skipped: true };
};

// ─── Meeting Cancellation — removes event from attendee calendars ─────────────
const sendMeetingCancellationEmail = async ({ to, customerName, title, startTime, endTime, hostName, hostEmail, senderEmail, senderPassword, meetingId, sequence = 1 }) => {
  const meetingTransport = (senderEmail && senderPassword)
    ? nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: senderEmail, pass: senderPassword },
        tls: { rejectUnauthorized: false },
      })
    : null;

  const calUID  = meetingId ? `${meetingId}@salescrm.app` : `${crypto.randomUUID()}@salescrm.app`;
  const calOrg  = hostEmail || senderEmail || FROM_ADDR;
  const recipients = Array.isArray(to) ? to : [to];

  const icsContent = generateICS({
    uid:            calUID,
    sequence,
    method:         "CANCEL",
    title,
    startTime,
    endTime,
    organizerName:  hostName || "Sales CRM",
    organizerEmail: calOrg,
    attendees:      recipients.map((e) => ({ name: customerName || e, email: e })),
  });
  const icsBuffer = Buffer.from(icsContent, "utf-8");

  const dateStr = new Date(startTime).toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata",
  });
  const LOGO   = process.env.MAIL_LOGO_URL || "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Cancelled</title>
</head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;">

<p style="margin:0 0 16px;">Hello ${customerName || "there"},</p>

<p style="margin:0 0 16px;">We regret to inform you that the following meeting has been cancelled.</p>

<p style="margin:0 0 16px;">
<strong>Meeting Title:</strong> ${title}<br/>
<strong>Originally Scheduled:</strong> ${dateStr}
</p>

<p style="margin:0 0 16px;">The calendar event has been automatically removed. We apologize for any inconvenience.</p>

<p style="margin:0 0 16px;">If you have any questions, please feel free to reach out.</p>

<p style="margin:0;">
Regards,<br/>
<strong>${hostName || "The Sales CRM Team"}</strong>${hostEmail ? `<br/><a href="mailto:${hostEmail}" style="color:#1a56db;">${hostEmail}</a>` : ""}
</p>

</body>
</html>`;

  const text = `Hello ${customerName || "there"},\n\nWe regret to inform you that the meeting "${title}" scheduled for ${dateStr} has been cancelled.\n\nThe calendar event has been automatically removed. We apologize for any inconvenience.\n\nIf you have any questions, please feel free to reach out.\n\nRegards,\n${hostName || "The Sales CRM Team"}${hostEmail ? "\n" + hostEmail : ""}`;

  const usePerUser2  = !!(senderEmail && senderPassword);
  const cancelTransport = usePerUser2
    ? nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: senderEmail, pass: senderPassword },
        tls:  { rejectUnauthorized: false },
      })
    : globalTransport;

  const cancelFrom   = usePerUser2 ? senderEmail : COMPANY_EMAIL;
  const subjectLine  = `Meeting Cancelled: ${title}`;
  const fromDisplay  = `${hostName || FROM_NAME} <${cancelFrom}>`;

  if (cancelTransport) {
    return cancelTransport.sendMail({
      from:        fromDisplay,
      to,
      subject:     subjectLine,
      html,
      text,
      ...(hostEmail ? { replyTo: hostEmail } : {}),
      messageId:   `<cancel-${calUID.split("@")[0]}-${Date.now()}@salescrm.app>`,
      // METHOD:CANCEL removes the event from attendee's calendar automatically
      alternatives: [{
        contentType: "text/calendar; method=CANCEL; charset=UTF-8",
        content:     icsBuffer,
      }],
      attachments: [{
        filename:    "cancellation.ics",
        content:     icsBuffer,
        contentType: "text/calendar; method=CANCEL; name=cancellation.ics",
      }],
    });
  }

  // Resend fallback
  if (!resend) { console.warn("[sendMeetingCancellation] RESEND_API_KEY not set — cancellation email skipped"); return { skipped: true }; }
  const result = await resend.emails.send({
    from:        FROM,
    to:          recipients,
    subject:     subjectLine,
    html,
    text,
    attachments: [{ filename: "cancellation.ics", content: icsBuffer }],
  });
  if (result.error) throw new Error(result.error.message || "Resend send failed");
  return result;
};

// ─── Meeting Reminder Email ───────────────────────────────────────────────────
const sendMeetingReminderEmail = async ({ to, customerName, title, startTime, endTime, meetingType, meetingLink, location, hostName, hostEmail, timeLabel, meetingId }) => {
  const isOnline   = meetingType !== "in_person" && meetingType !== "in-person";
  const typeLabel  = meetingType === "google_meet" ? "Google Meet"
    : meetingType === "teams" ? "Microsoft Teams"
    : meetingType === "zoom"  ? "Zoom"
    : isOnline                ? "Online Meeting"
    : "In-Person Meeting";

  const dateStr = new Date(startTime).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" });
  const timeStr = new Date(startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const endTimeStr = endTime ? new Date(endTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;
  const mapsUrl = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : null;
  const BACKEND_BASE = process.env.BACKEND_URL || "http://localhost:5000";
  const supportUrl = `mailto:${hostEmail || FROM_ADDR}`;

  const actionBtn = isOnline && meetingLink
    ? `<a href="${meetingLink}" target="_blank" style="display:inline-block;background:#0a52ff;color:#ffffff;padding:13px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">&#9654; Join ${typeLabel}</a>`
    : mapsUrl
    ? `<a href="${mapsUrl}" target="_blank" style="display:inline-block;background:#10B981;color:#ffffff;padding:13px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">&#128205; Open in Google Maps</a>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Reminder</title>
</head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;">

<p style="margin:0 0 16px;">Hello ${customerName || "there"},</p>

<p style="margin:0 0 16px;">This is a reminder that you have a meeting <strong>${timeLabel}</strong>.</p>

<p style="margin:0 0 16px;">
<strong>Meeting Title:</strong> ${title}<br/>
<strong>Date:</strong> ${dateStr}<br/>
<strong>Time:</strong> ${timeStr}${endTimeStr ? ` – ${endTimeStr}` : ""} (IST)${isOnline && meetingLink ? `<br/><strong>Meeting Link:</strong> <a href="${meetingLink}" style="color:#1a56db;">${meetingLink}</a>` : (!isOnline && location ? `<br/><strong>Location:</strong> ${location}` : "")}
</p>

<p style="margin:0 0 16px;">Please let me know if you have any questions.</p>

<p style="margin:0;">
Regards,<br/>
<strong>${hostName || "The Sales CRM Team"}</strong>${hostEmail ? `<br/><a href="mailto:${hostEmail}" style="color:#1a56db;">${hostEmail}</a>` : ""}
</p>

</body>
</html>`;

  const text = `Meeting Reminder: ${timeLabel}\n\n${title}\nDate: ${dateStr}\nTime: ${timeStr}${endTimeStr ? " – " + endTimeStr : ""} IST\n${isOnline ? "Meeting Link: " + (meetingLink || typeLabel) : "Location: " + (location || "—")}\n\nRegards,\n${hostName || "Sales CRM Team"}${hostEmail ? "\n" + hostEmail : ""}`;

  // Transport: per-user SMTP if available, else global SMTP, else Resend
  const subjectLine  = `Reminder ${timeLabel}: ${title}`;
  const fromDisplay  = `${hostName || FROM_NAME} <${hostEmail || COMPANY_EMAIL}>`;

  if (globalTransport) {
    return globalTransport.sendMail({ from: fromDisplay, to, subject: subjectLine, html, text });
  }
  if (!resend) { console.warn("[sendMeetingReminder] No email transport available"); return { skipped: true }; }
  const result = await resend.emails.send({ from: FROM, to: Array.isArray(to) ? to : [to], subject: subjectLine, html, text });
  if (result.error) throw new Error(result.error.message || "Resend send failed");
  return result;
};

module.exports = { sendMail, sendWelcomeEmail, sendNotificationEmail, sendSensitiveFieldAlert, sendMeetingInviteEmail, sendMeetingCancellationEmail, sendMeetingReminderEmail };
