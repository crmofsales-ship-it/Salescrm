"use strict";

const express = require("express");
const router  = express.Router();
const crypto  = require("crypto");
const { supabase } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { withOrg } = require("../middleware/orgContext");

// ── State helpers (encode user_id into OAuth state param) ────────────────────

function encodeState(profileId, orgId) {
  return Buffer.from(
    JSON.stringify({ profileId, orgId, nonce: crypto.randomBytes(8).toString("hex") })
  ).toString("base64url");
}

function decodeState(state) {
  try { return JSON.parse(Buffer.from(state, "base64url").toString("utf8")); }
  catch { return null; }
}

// ── Token storage helpers ─────────────────────────────────────────────────────

async function storeTokens(userId, orgId, provider, tokenData) {
  const { access_token, refresh_token, expires_in, scope, email } = tokenData;
  const expires_at = expires_in
    ? new Date(Date.now() + Number(expires_in) * 1000).toISOString()
    : null;
  const { error } = await supabase.from("user_oauth_tokens").upsert(
    {
      user_id:       userId,
      organization_id: orgId,
      provider,
      access_token,
      refresh_token: refresh_token || null,
      expires_at,
      scope:         scope || null,
      email:         email || null,
      updated_at:    new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (error) console.error("storeTokens error:", error.message);
}

async function getTokens(userId, provider) {
  const { data } = await supabase
    .from("user_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return data || null;
}

async function refreshGoogleAccessToken(tokens) {
  if (!tokens?.access_token) return null;
  // Token still valid for > 2 minutes
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
      updated_at: new Date().toISOString(),
    }).eq("user_id", tokens.user_id).eq("provider", "google_meet");
    return data.access_token;
  } catch {
    return tokens.access_token;
  }
}

async function refreshMicrosoftAccessToken(tokens) {
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
      updated_at: new Date().toISOString(),
    }).eq("user_id", tokens.user_id).eq("provider", "microsoft_teams");
    return data.access_token;
  } catch {
    return tokens.access_token;
  }
}

// ── GET /api/oauth/status ─────────────────────────────────────────────────────
// Returns which providers are connected for the current user.

router.get("/status", authenticate, withOrg, async (req, res) => {
  const { data } = await supabase
    .from("user_oauth_tokens")
    .select("provider, email, expires_at")
    .eq("user_id", req.profile.id);

  const result = { google_meet: null, microsoft_teams: null };
  (data || []).forEach((row) => {
    result[row.provider] = { connected: true, email: row.email || null };
  });
  res.json(result);
});

// ── Google Meet OAuth ─────────────────────────────────────────────────────────

// GET /api/oauth/google/authorize — returns the Google OAuth URL
router.get("/google/authorize", authenticate, withOrg, (req, res) => {
  const clientId    = process.env.GOOGLE_MEET_CLIENT_ID     || process.env.GMAIL_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_MEET_REDIRECT_URI  ||
    `${process.env.BACKEND_URL || "http://localhost:5000"}/api/oauth/google/callback`;

  if (!clientId) {
    return res.status(500).json({
      error: "Google OAuth not configured. Add GOOGLE_MEET_CLIENT_ID to environment variables.",
    });
  }

  const state  = encodeState(req.profile.id, req.organizationId);
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    // Combined scope — Google Workspace is the single Google connection point,
    // covering Calendar/Meet as well as Gmail sync (see /google/callback below).
    scope:         "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send email profile openid",
    access_type:   "offline",
    prompt:        "consent",
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

// GET /api/oauth/google/callback — Google redirects here after auth
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error || !code || !state) {
    return res.redirect(
      `${frontendUrl}/meetings?oauth_error=google&reason=${encodeURIComponent(error || "missing_code")}`
    );
  }

  const decoded = decodeState(state);
  if (!decoded?.profileId) {
    return res.redirect(`${frontendUrl}/meetings?oauth_error=google&reason=invalid_state`);
  }

  const clientId     = process.env.GOOGLE_MEET_CLIENT_ID     || process.env.GMAIL_CLIENT_ID     || "";
  const clientSecret = process.env.GOOGLE_MEET_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || "";
  const redirectUri  = process.env.GOOGLE_MEET_REDIRECT_URI  ||
    `${process.env.BACKEND_URL || "http://localhost:5000"}/api/oauth/google/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Google token exchange failed:", tokenData);
      return res.redirect(`${frontendUrl}/meetings?oauth_error=google&reason=token_exchange_failed`);
    }

    // Fetch the user's email for display
    let email = null;
    try {
      const userRes  = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userRes.json();
      email = userInfo.email || null;
    } catch { /* non-fatal */ }

    await storeTokens(decoded.profileId, decoded.orgId, "google_meet", { ...tokenData, email });

    // Reuse this same token to activate Gmail sync — one Google connection covers
    // Calendar/Meet and Gmail. Works for any connected Google account.
    if (email) {
      try {
        const gmailProfileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const gmailProfile = await gmailProfileRes.json();
        const accountPayload = {
          user_id:      decoded.profileId,
          organization_id: decoded.orgId,
          provider:     "gmail",
          email,
          access_token: tokenData.access_token,
          token_expiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
          history_id:   gmailProfile.historyId?.toString() || null,
          last_sync_at: new Date().toISOString(),
          is_active:    true,
        };
        // Google only returns refresh_token on first authorization — never
        // overwrite an existing one with null, or token refresh breaks later.
        if (tokenData.refresh_token) accountPayload.refresh_token = tokenData.refresh_token;
        await supabase.from("email_accounts").upsert(accountPayload, { onConflict: "user_id,email" });
      } catch (gmailErr) {
        console.warn("Gmail sync activation via Google Workspace failed:", gmailErr.message);
      }
    }

    res.redirect(`${frontendUrl}/meetings?oauth_success=google`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${frontendUrl}/meetings?oauth_error=google&reason=server_error`);
  }
});

// POST /api/oauth/google/revoke — disconnect Google account
router.post("/google/revoke", authenticate, withOrg, async (req, res) => {
  const tokens = await getTokens(req.profile.id, "google_meet");
  if (tokens?.access_token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, { method: "POST" })
      .catch(() => {});
  }
  await supabase.from("user_oauth_tokens")
    .delete()
    .eq("user_id", req.profile.id)
    .eq("provider", "google_meet");

  // Also deactivate Gmail sync — it shares this same Google connection.
  await supabase.from("email_accounts")
    .update({ is_active: false })
    .eq("user_id", req.profile.id)
    .eq("provider", "gmail");

  res.json({ success: true });
});

// POST /api/oauth/google/create-event
// Creates a Google Calendar event with Meet link and returns the meet URL.
router.post("/google/create-event", authenticate, withOrg, async (req, res) => {
  const { title, startTime, endTime, description, attendeeEmails = [], requestId } = req.body;

  if (!title || !startTime || !endTime) {
    return res.status(400).json({ error: "title, startTime and endTime are required" });
  }

  const tokens = await getTokens(req.profile.id, "google_meet");
  if (!tokens) {
    return res.status(400).json({ error: "Google account not connected" });
  }

  const accessToken = await refreshGoogleAccessToken(tokens);
  if (!accessToken) {
    return res.status(400).json({ error: "Could not obtain a valid Google access token" });
  }

  const eventBody = {
    summary:     title,
    description: description || "",
    start: { dateTime: startTime, timeZone: "Asia/Kolkata" },
    end:   { dateTime: endTime,   timeZone: "Asia/Kolkata" },
    conferenceData: {
      createRequest: {
        requestId: requestId || crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    attendees: attendeeEmails.map((email) => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };

  try {
    const r = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none",
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );
    const event = await r.json();

    if (event.error) {
      console.error("Google Calendar API error:", event.error);
      return res.status(400).json({ error: event.error.message || "Failed to create calendar event" });
    }

    const meetLink =
      event.hangoutLink ||
      event.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ||
      null;

    res.json({ success: true, meetLink, eventId: event.id, htmlLink: event.htmlLink || null });
  } catch (err) {
    console.error("Google create-event error:", err);
    res.status(500).json({ error: "Failed to create Google Calendar event" });
  }
});

// ── Microsoft Teams OAuth ─────────────────────────────────────────────────────

// GET /api/oauth/microsoft/authorize — returns the Microsoft OAuth URL
router.get("/microsoft/authorize", authenticate, withOrg, (req, res) => {
  const clientId    = process.env.MICROSOFT_CLIENT_ID;
  const tenant      = process.env.MICROSOFT_TENANT_ID || "common";
  const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI ||
    `${process.env.BACKEND_URL || "http://localhost:5000"}/api/oauth/microsoft/callback`;

  if (!clientId) {
    return res.status(500).json({
      error: "Microsoft OAuth not configured. Add MICROSOFT_CLIENT_ID to environment variables.",
    });
  }

  const state  = encodeState(req.profile.id, req.organizationId);
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "OnlineMeetings.ReadWrite offline_access User.Read",
    state,
  });
  res.json({ url: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}` });
});

// GET /api/oauth/microsoft/callback
router.get("/microsoft/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error || !code || !state) {
    return res.redirect(
      `${frontendUrl}/meetings?oauth_error=microsoft&reason=${encodeURIComponent(error || "missing_code")}`
    );
  }

  const decoded = decodeState(state);
  if (!decoded?.profileId) {
    return res.redirect(`${frontendUrl}/meetings?oauth_error=microsoft&reason=invalid_state`);
  }

  const clientId     = process.env.MICROSOFT_CLIENT_ID     || "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";
  const tenant       = process.env.MICROSOFT_TENANT_ID || "common";
  const redirectUri  = process.env.MICROSOFT_OAUTH_REDIRECT_URI ||
    `${process.env.BACKEND_URL || "http://localhost:5000"}/api/oauth/microsoft/callback`;

  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  redirectUri,
          grant_type:    "authorization_code",
          scope:         "OnlineMeetings.ReadWrite offline_access User.Read",
        }),
      }
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Microsoft token exchange failed:", tokenData);
      return res.redirect(`${frontendUrl}/meetings?oauth_error=microsoft&reason=token_exchange_failed`);
    }

    // Fetch user email for display
    let email = null;
    try {
      const userRes  = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userRes.json();
      email = userInfo.mail || userInfo.userPrincipalName || null;
    } catch { /* non-fatal */ }

    await storeTokens(decoded.profileId, decoded.orgId, "microsoft_teams", { ...tokenData, email });
    res.redirect(`${frontendUrl}/meetings?oauth_success=microsoft`);
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    res.redirect(`${frontendUrl}/meetings?oauth_error=microsoft&reason=server_error`);
  }
});

// POST /api/oauth/microsoft/revoke — disconnect Microsoft account
router.post("/microsoft/revoke", authenticate, withOrg, async (req, res) => {
  await supabase.from("user_oauth_tokens")
    .delete()
    .eq("user_id", req.profile.id)
    .eq("provider", "microsoft_teams");
  res.json({ success: true });
});

// Obtains an app-only Graph access token via the Client Credentials flow.
// Requires a tenant-specific MICROSOFT_TENANT_ID (not "common") and an
// admin-consented application permission (e.g. OnlineMeetings.ReadWrite.All).
async function getClientCredentialsToken() {
  const clientId     = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant        = process.env.MICROSOFT_TENANT_ID;

  if (!clientId || !clientSecret || !tenant || tenant === "common") {
    return { error: "Microsoft client-credentials flow not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and a tenant-specific MICROSOFT_TENANT_ID." };
  }

  let tokenRes, tokenData;
  try {
    tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    "client_credentials",
        scope:         "https://graph.microsoft.com/.default",
      }),
    });
    tokenData = await tokenRes.json();
  } catch {
    return { error: "Network failure while contacting Microsoft Entra ID" };
  }

  if (!tokenRes.ok || !tokenData.access_token) {
    return { error: tokenData.error_description || "Invalid Azure credentials" };
  }
  return { accessToken: tokenData.access_token };
}

// POST /api/oauth/microsoft/create-meeting
// Creates a Teams online meeting and returns the join URL.
// Uses the per-user (Authorization Code) flow by default — set
// MICROSOFT_AUTH_FLOW=client_credentials plus MICROSOFT_ORGANIZER_ID to create
// meetings app-only against a fixed organizer mailbox instead.
router.post("/microsoft/create-meeting", authenticate, withOrg, async (req, res) => {
  const { title, startTime, endTime } = req.body;

  if (!title || !startTime || !endTime) {
    return res.status(400).json({ success: false, error: "title, startTime and endTime are required" });
  }

  const flow = (process.env.MICROSOFT_AUTH_FLOW || "authorization_code").toLowerCase();
  let accessToken, organizerPath, organizerLabel;

  if (flow === "client_credentials") {
    const organizerId = process.env.MICROSOFT_ORGANIZER_ID;
    if (!organizerId) {
      return res.status(500).json({ success: false, error: "MICROSOFT_ORGANIZER_ID is required for the client-credentials flow" });
    }
    const token = await getClientCredentialsToken();
    if (token.error) {
      return res.status(401).json({ success: false, error: token.error });
    }
    accessToken    = token.accessToken;
    organizerPath  = `users/${organizerId}`;
    organizerLabel = organizerId;
  } else {
    const tokens = await getTokens(req.profile.id, "microsoft_teams");
    if (!tokens) {
      return res.status(400).json({ success: false, error: "Microsoft account not connected" });
    }
    accessToken = await refreshMicrosoftAccessToken(tokens);
    if (!accessToken) {
      return res.status(401).json({ success: false, error: "Could not obtain a valid Microsoft access token — please reconnect your Microsoft account" });
    }
    organizerPath  = "me";
    organizerLabel = tokens.email || null;
  }

  try {
    const r = await fetch(`https://graph.microsoft.com/v1.0/${organizerPath}/onlineMeetings`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject:       title,
        startDateTime: startTime,
        endDateTime:   endTime,
      }),
    });
    const meeting = await r.json();

    if (!r.ok || meeting.error) {
      const code = meeting.error?.code || "";
      console.error("Teams API error:", meeting.error);
      if (r.status === 401) {
        return res.status(401).json({ success: false, error: "Microsoft access token expired or invalid" });
      }
      if (r.status === 403 || code === "Forbidden" || code === "AccessDenied") {
        return res.status(403).json({ success: false, error: "Missing Microsoft Graph permission (OnlineMeetings.ReadWrite) or admin consent required" });
      }
      if (r.status === 404) {
        return res.status(404).json({ success: false, error: "Invalid organizer account — user not found in Microsoft Entra ID" });
      }
      return res.status(400).json({ success: false, error: meeting.error?.message || "Failed to create Teams meeting" });
    }

    res.json({
      success:    true,
      meetingId:  meeting.id || null,
      joinUrl:    meeting.joinWebUrl || null,
      joinWebUrl: meeting.joinWebUrl || null,
      subject:    meeting.subject || title,
      startTime:  meeting.startDateTime || startTime,
      endTime:    meeting.endDateTime || endTime,
      organizer:  meeting.participants?.organizer?.identity?.user?.displayName || organizerLabel || null,
    });
  } catch (err) {
    console.error("Microsoft create-meeting error:", err);
    res.status(500).json({ success: false, error: "Network failure while creating Microsoft Teams meeting" });
  }
});

module.exports = router;
