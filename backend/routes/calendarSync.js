"use strict";

const express   = require("express");
const router    = express.Router();
const { supabase } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { withOrg } = require("../middleware/orgContext");

router.use(authenticate, withOrg);

// ── OAuth token helpers (mirrors logic in oauth.js without duplication risk) ──

async function getTokens(userId, provider) {
  const { data } = await supabase
    .from("user_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return data || null;
}

async function refreshGoogleToken(tokens) {
  if (!tokens?.access_token) return null;
  if (tokens.expires_at && new Date(tokens.expires_at) > new Date(Date.now() + 120_000)) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) return tokens.access_token;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_MEET_CLIENT_ID     || process.env.GMAIL_CLIENT_ID     || "",
        client_secret: process.env.GOOGLE_MEET_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || "",
        refresh_token: tokens.refresh_token,
        grant_type:    "refresh_token",
      }),
    });
    const data = await r.json();
    if (!data.access_token) return tokens.access_token;
    const expires_at = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;
    await supabase.from("user_oauth_tokens").update({
      access_token: data.access_token,
      expires_at,
      updated_at:   new Date().toISOString(),
    }).eq("user_id", tokens.user_id).eq("provider", "google_meet");
    return data.access_token;
  } catch {
    return tokens.access_token;
  }
}

async function refreshMicrosoftToken(tokens) {
  if (!tokens?.access_token) return null;
  if (tokens.expires_at && new Date(tokens.expires_at) > new Date(Date.now() + 120_000)) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) return tokens.access_token;
  const tenant = process.env.MICROSOFT_TENANT_ID || "common";
  try {
    const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.MICROSOFT_CLIENT_ID     || "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
        refresh_token: tokens.refresh_token,
        grant_type:    "refresh_token",
        scope:         "OnlineMeetings.ReadWrite offline_access User.Read",
      }),
    });
    const data = await r.json();
    if (!data.access_token) return tokens.access_token;
    const expires_at = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;
    await supabase.from("user_oauth_tokens").update({
      access_token:  data.access_token,
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_at,
      updated_at:    new Date().toISOString(),
    }).eq("user_id", tokens.user_id).eq("provider", "microsoft_teams");
    return data.access_token;
  } catch {
    return tokens.access_token;
  }
}

// ── POST /api/calendar-sync ───────────────────────────────────────────────────
// Stores the external calendar event ID for a CRM meeting.
// Called immediately after a calendar event is auto-generated on meeting creation.

router.post("/", async (req, res) => {
  const { meetingId, provider, externalEventId, createdBy } = req.body;
  if (!meetingId || !provider || !externalEventId) {
    return res.status(400).json({ error: "meetingId, provider, externalEventId required" });
  }

  const { error } = await req.db.from("meeting_calendar_sync").upsert(
    {
      organization_id:  req.organizationId,
      meeting_id:        meetingId,
      provider,
      external_event_id: externalEventId,
      created_by:        createdBy || req.profile.id,
      created_at:        new Date().toISOString(),
    },
    { onConflict: "meeting_id,provider" }
  );

  if (error) {
    // Table may not exist yet in older environments — log and continue gracefully
    console.warn("[calendar-sync] store error:", error.message);
    return res.json({ success: false, reason: error.message });
  }
  res.json({ success: true });
});

// ── DELETE /api/calendar-sync/meeting/:meetingId ──────────────────────────────
// Deletes the calendar event(s) tied to a CRM meeting from the provider(s).
// Called before the meeting row is deleted from Supabase so the sync table
// record is still readable.

router.delete("/meeting/:meetingId", async (req, res) => {
  const { meetingId } = req.params;

  // Look up every provider that has a stored event ID for this meeting
  const { data: syncRecords, error: lookupErr } = await req.db
    .from("meeting_calendar_sync")
    .select("*")
    .eq("meeting_id", meetingId);

  if (lookupErr) {
    // Table missing or query error — not a fatal CRM error
    console.warn("[calendar-sync] lookup error:", lookupErr.message);
    return res.json({ success: true, skipped: true });
  }

  if (!syncRecords || syncRecords.length === 0) {
    return res.json({ success: true, skipped: true });
  }

  const results = [];

  for (const record of syncRecords) {
    // Use the original organizer's token so the API accepts the delete
    const userId = record.created_by || req.profile.id;

    if (record.provider === "google_meet") {
      const tokens = await getTokens(userId, "google_meet");
      if (!tokens) {
        results.push({ provider: "google_meet", status: "no_token" });
        continue;
      }
      const accessToken = await refreshGoogleToken(tokens);
      if (!accessToken) {
        results.push({ provider: "google_meet", status: "no_token" });
        continue;
      }
      try {
        const r = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${record.external_event_id}?sendUpdates=all`,
          { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
        );
        // 204 = deleted successfully, 404 = already gone externally — both are OK
        if (r.status === 204 || r.status === 404) {
          results.push({ provider: "google_meet", status: "deleted" });
        } else {
          const body = await r.json().catch(() => ({}));
          console.error("[calendar-sync] Google delete error:", body);
          results.push({ provider: "google_meet", status: "error", message: body.error?.message });
        }
      } catch (err) {
        console.error("[calendar-sync] Google delete exception:", err);
        results.push({ provider: "google_meet", status: "error" });
      }

    } else if (record.provider === "microsoft_teams") {
      const tokens = await getTokens(userId, "microsoft_teams");
      if (!tokens) {
        results.push({ provider: "microsoft_teams", status: "no_token" });
        continue;
      }
      const accessToken = await refreshMicrosoftToken(tokens);
      if (!accessToken) {
        results.push({ provider: "microsoft_teams", status: "no_token" });
        continue;
      }
      try {
        const r = await fetch(
          `https://graph.microsoft.com/v1.0/me/onlineMeetings/${record.external_event_id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (r.status === 204 || r.status === 404) {
          results.push({ provider: "microsoft_teams", status: "deleted" });
        } else {
          const body = await r.json().catch(() => ({}));
          console.error("[calendar-sync] Teams delete error:", body);
          results.push({ provider: "microsoft_teams", status: "error" });
        }
      } catch (err) {
        console.error("[calendar-sync] Teams delete exception:", err);
        results.push({ provider: "microsoft_teams", status: "error" });
      }
    }
  }

  res.json({ success: true, results });
});

module.exports = router;
