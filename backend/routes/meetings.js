const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { sendMeetingInviteEmail, sendMeetingCancellationEmail, sendMeetingReminderEmail } = require("../config/mail");
const { authenticate } = require("../middleware/auth");
const { withOrg } = require("../middleware/orgContext");

const FALLBACK_ORGANIZER = process.env.MAIL_FROM_ADDRESS || "no-reply@example.com";

async function resolveHostProfile(db, profileId) {
  const { data } = await db.from("profiles").select("email, full_name, mail_app_password").eq("id", profileId).single();
  return data || {};
}

async function getGmailAccount(db, orgId, profileEmail) {
  if (!profileEmail) return null;
  const { data } = await db
    .from("email_accounts")
    .select("id, access_token, refresh_token, token_expiry")
    .eq("organization_id", orgId)
    .eq("provider", "gmail")
    .eq("is_active", true)
    .eq("email", profileEmail)
    .limit(1);
  return data?.[0] || null;
}

async function resolveGmailToken(db, orgId, profileEmail) {
  const acc = await getGmailAccount(db, orgId, profileEmail);
  if (!acc) return null;
  if (acc.token_expiry && new Date(acc.token_expiry) > new Date(Date.now() + 120000)) return acc.access_token;
  if (!acc.refresh_token) return acc.access_token || null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET,
        refresh_token: acc.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await r.json();
    if (!data.access_token) return acc.access_token || null;
    const expiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
    await db.from("email_accounts").update({ access_token: data.access_token, token_expiry: expiry }).eq("id", acc.id);
    return data.access_token;
  } catch {
    return acc.access_token || null;
  }
}

// POST /api/meetings/invite
router.post("/invite", authenticate, withOrg, async (req, res) => {
  const {
    customerName, customerEmail, title, startTime, endTime,
    meetingType, meetingLink, location, locationMapsUrl, description, hostName,
    meetingPurpose, companyName, meetingId, sequence = 0, allAttendees = [],
  } = req.body;
  if (!customerEmail || !title || !startTime) {
    return res.status(400).json({ error: "customerEmail, title and startTime are required" });
  }

  const hostProfile = await resolveHostProfile(req.db, req.profile.id);
  const gmailAccessToken = await resolveGmailToken(req.db, req.organizationId, hostProfile.email).catch(() => null);
  const senderEmail = hostProfile.email || null;
  const senderPassword = hostProfile.mail_app_password || null;
  const resolvedName = hostName || hostProfile.full_name || "Sales CRM Team";

  let emailSent = false, emailError = null;
  try {
    await sendMeetingInviteEmail({
      to: customerEmail, customerName, title, startTime, endTime, meetingType, meetingLink,
      location, mapsUrl: locationMapsUrl || null, description,
      hostName: resolvedName, hostEmail: senderEmail, senderEmail, senderPassword,
      meetingPurpose, companyName, meetingId, sequence: Number(sequence) || 0, allAttendees, gmailAccessToken,
    });
    emailSent = true;
  } catch (err) {
    emailError = err.message || "Unknown error";
    console.error("Meeting invite email failed:", emailError);
  }
  res.json({ success: true, emailSent, emailError });
});

// GET /api/meetings/rsvp — public, clicked from email Accept/Decline buttons
router.get("/rsvp", async (req, res) => {
  const { id, action } = req.query;
  if (!id || !["accept", "decline", "reschedule"].includes(action)) {
    return res.status(400).send("<p>Invalid request.</p>");
  }
  const labels = { accept: "Accepted", decline: "Declined", reschedule: "Reschedule Requested" };
  const colors = { accept: "#18b56f", decline: "#ff4d4d", reschedule: "#ff9800" };
  const icons = { accept: "✔", decline: "✖", reschedule: "📅" };
  const label = labels[action], color = colors[action], icon = icons[action];

  try {
    // Derive the meeting's organization so the activity row satisfies RLS/NOT NULL.
    const { data: meeting } = await supabase.from("meetings").select("organization_id").eq("id", id).maybeSingle();
    if (meeting?.organization_id) {
      await supabase.from("activities").insert({
        type: "note",
        title: `Meeting RSVP: ${label}`,
        description: `Attendee responded "${label}" to meeting invite (ID: ${id})`,
        status: "done",
        organization_id: meeting.organization_id,
        metadata: { meeting_id: id, rsvp_action: action, responded_at: new Date().toISOString() },
      });
    }
  } catch { /* non-fatal */ }

  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Meeting Response</title>
<style>body{margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}</style>
</head><body>
  <div style="background:#fff;border-radius:20px;padding:48px 40px;max-width:480px;width:90%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.08);">
    <div style="font-size:22px;font-weight:700;color:#6d28d9;margin-bottom:24px;">Sales CRM</div>
    <div style="font-size:52px;margin-bottom:16px;">${icon}</div>
    <h1 style="font-size:24px;font-weight:700;color:${color};margin:0 0 12px 0;">${label}</h1>
    <p style="font-size:15px;color:#58627d;line-height:1.6;margin:0 0 28px 0;">
      ${action === "accept" ? "Thank you! Your response has been recorded." :
        action === "decline" ? "Thank you for letting us know. Your response has been recorded." :
        "Your request has been noted. Our team will reach out to reschedule."}
    </p>
  </div>
</body></html>`);
});

// POST /api/meetings/cancel-invite
router.post("/cancel-invite", authenticate, withOrg, async (req, res) => {
  const { customerName, customerEmail, title, startTime, endTime, hostName, meetingId, sequence = 1, allAttendees = [] } = req.body;
  if (!customerEmail || !title || !startTime) {
    return res.status(400).json({ error: "customerEmail, title and startTime are required" });
  }
  const hostProfile = await resolveHostProfile(req.db, req.profile.id);
  const senderEmail = hostProfile.email || null;
  const senderPassword = hostProfile.mail_app_password || null;
  const resolvedName = hostName || hostProfile.full_name || "Sales CRM Team";

  const uniqueRecipients = [...new Set([
    ...(Array.isArray(customerEmail) ? customerEmail : [customerEmail]),
    ...allAttendees.map((a) => (typeof a === "string" ? a : a.email)).filter(Boolean),
  ].filter(Boolean))];

  let emailSent = false, emailError = null;
  try {
    await Promise.all(uniqueRecipients.map((email) =>
      sendMeetingCancellationEmail({
        to: email, customerName: customerName || email, title, startTime, endTime,
        hostName: resolvedName, hostEmail: senderEmail, senderEmail, senderPassword,
        meetingId, sequence: Number(sequence) || 1,
      })
    ));
    emailSent = true;
  } catch (err) {
    emailError = err.message || "Unknown error";
    console.error("Meeting cancellation email failed:", emailError);
  }
  res.json({ success: true, emailSent, emailError });
});

// GET /api/meetings/ics/:meetingId — public ICS download
router.get("/ics/:meetingId", async (req, res) => {
  const { meetingId } = req.params;
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*, created_profile:profiles!meetings_created_by_fkey(full_name, email)")
    .eq("id", meetingId).single();
  if (error || !meeting) return res.status(404).send("Meeting not found");

  const organizer = meeting.created_profile || {};
  const organizerEmail = organizer.email || FALLBACK_ORGANIZER;
  const organizerName = organizer.full_name || "Sales CRM Team";
  const calUID = `${meetingId}@salescrm.app`;

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
  const esc = (s) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const fmtDT = (d) => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const safeEnd = meeting.end_time || new Date(new Date(meeting.start_time).getTime() + 3600000).toISOString();
  const locVal = meeting.location || meeting.meeting_link || null;
  const desc = [meeting.agenda, meeting.meeting_link ? `Join: ${meeting.meeting_link}` : null].filter(Boolean).join("\n");

  const icsLines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sales CRM//Meeting//EN", "CALSCALE:GREGORIAN", "METHOD:REQUEST",
    "BEGIN:VEVENT", fold(`UID:${calUID}`), "SEQUENCE:0",
    `DTSTAMP:${fmtDT(new Date())}`, `DTSTART:${fmtDT(meeting.start_time)}`, `DTEND:${fmtDT(safeEnd)}`,
    fold(`SUMMARY:${esc(meeting.title)}`),
    desc ? fold(`DESCRIPTION:${esc(desc)}`) : null,
    locVal ? fold(`LOCATION:${esc(locVal)}`) : null,
    meeting.meeting_link ? fold(`URL:${meeting.meeting_link}`) : null,
    fold(`ORGANIZER;CN="${esc(organizerName)}":MAILTO:${organizerEmail}`),
    meeting.customer_email ? fold(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${esc(meeting.customer_name || meeting.customer_email)}":MAILTO:${meeting.customer_email}`) : null,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", fold(`DESCRIPTION:Upcoming: ${esc(meeting.title)}`), "END:VALARM",
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", fold(`DESCRIPTION:Tomorrow: ${esc(meeting.title)}`), "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=UTF-8");
  res.setHeader("Content-Disposition", `attachment; filename="${meeting.title.replace(/[^a-z0-9]/gi, "_")}.ics"`);
  res.send(icsLines);
});

// POST /api/meetings/send-reminders — cron / external scheduler (shared secret)
router.post("/send-reminders", async (req, res) => {
  const secret = process.env.REMINDER_SECRET || "change-me-reminders";
  const authHeader = req.headers.authorization || req.headers["x-cron-secret"] || "";
  if (authHeader !== `Bearer ${secret}` && authHeader !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const now = new Date();
  const windows = [
    { label: "in 15 minutes", minutesBefore: 15, column: "reminder_15m_sent_at" },
    { label: "in 1 hour", minutesBefore: 60, column: "reminder_1h_sent_at" },
    { label: "in 24 hours", minutesBefore: 1440, column: "reminder_24h_sent_at" },
  ];
  let totalSent = 0;
  const results = [];
  for (const win of windows) {
    const windowStart = new Date(now.getTime() + (win.minutesBefore - 5) * 60000).toISOString();
    const windowEnd = new Date(now.getTime() + (win.minutesBefore + 5) * 60000).toISOString();
    const { data: meetings } = await supabase
      .from("meetings")
      .select("*, created_profile:profiles!meetings_created_by_fkey(full_name, email, mail_app_password)")
      .eq("status", "scheduled").gte("start_time", windowStart).lte("start_time", windowEnd)
      .is(win.column, null).limit(50);
    if (!meetings?.length) continue;
    for (const meeting of meetings) {
      try {
        const host = meeting.created_profile || {};
        if (!meeting.customer_email) continue;
        await sendMeetingReminderEmail({
          to: meeting.customer_email, customerName: meeting.customer_name || "there",
          title: meeting.title, startTime: meeting.start_time, endTime: meeting.end_time,
          meetingType: meeting.meeting_type, meetingLink: meeting.meeting_link, location: meeting.location,
          hostName: host.full_name || "Sales CRM Team", hostEmail: host.email,
          timeLabel: win.label, meetingId: meeting.id,
        });
        await supabase.from("meetings").update({ [win.column]: now.toISOString() }).eq("id", meeting.id);
        totalSent++;
        results.push({ meetingId: meeting.id, title: meeting.title, window: win.label });
      } catch (err) {
        console.error(`[Reminder] Failed for ${meeting.id}:`, err.message);
      }
    }
  }
  res.json({ success: true, sent: totalSent, results });
});

module.exports = router;
