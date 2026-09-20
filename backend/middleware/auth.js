"use strict";

const jwt = require("jsonwebtoken");
const { supabase } = require("../config/db");

// jose v6 is ESM-only — load it lazily so this CommonJS file works on all runtimes.
let _josePromise = null;
const loadJose = () => (_josePromise ||= import("jose"));

// Role ranks for the org-scoped model (kept for any legacy imports).
const ROLE_LEVEL = { owner: 4, admin: 3, sales_manager: 2, sales_rep: 1 };

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");

// New Supabase projects sign user JWTs with asymmetric keys (ES256/RS256) and
// publish them at the project's JWKS endpoint. Legacy projects use a shared
// HS256 secret. We support both, plus a remote-validation fallback.
let _jwks = null;
async function getJwks() {
  if (!SUPABASE_URL) return null;
  if (!_jwks) {
    const { createRemoteJWKSet } = await loadJose();
    _jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  }
  return _jwks;
}

// Verify a Supabase access token → returns the auth user id (sub), or null.
async function verifyToken(token) {
  // 1. Legacy shared secret (fast, no network) when configured.
  if (JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
      return decoded.sub || null;
    } catch {
      // fall through — token may be asymmetric, or the secret is stale
    }
  }
  // 2. Asymmetric verification via the project's JWKS.
  try {
    const jwks = await getJwks();
    if (jwks) {
      const { jwtVerify } = await loadJose();
      const { payload } = await jwtVerify(token, jwks, { issuer: `${SUPABASE_URL}/auth/v1` });
      return payload.sub || null;
    }
  } catch {
    // fall through
  }
  // 3. Last resort — ask Supabase to validate the token.
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) return data.user.id;
  } catch { /* ignore */ }
  return null;
}

// Verifies a Supabase-issued access token and loads the caller's profile.
// Attaches: req.authUserId (auth.users.id), req.token, req.profile (public.profiles row).
const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = header.slice(7);

  try {
    const authUserId = await verifyToken(token);
    if (!authUserId) return res.status(401).json({ error: "Invalid or expired token" });

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, status, avatar_url, user_id")
      .eq("user_id", authUserId)
      .single();

    if (error || !profile) return res.status(401).json({ error: "Profile not found" });
    if (profile.status === "deleted")
      return res.status(403).json({ error: "Your account has been removed. Contact your administrator." });
    if (profile.status === "inactive")
      return res.status(403).json({ error: "Account is inactive" });

    req.authUserId = authUserId;
    req.token = token;
    req.profile = profile;
    next();
  } catch (err) {
    console.error("authenticate error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Legacy global-role guard. Prefer requireOrgRole() from middleware/orgContext.
const authorize = (...roles) => (req, res, next) => {
  if (!req.profile) return res.status(401).json({ error: "Unauthorized" });
  if (!roles.includes(req.profile.role)) {
    return res.status(403).json({ error: `Forbidden: requires one of [${roles.join(", ")}]` });
  }
  next();
};

const hasHigherAccess = (a, b) => (ROLE_LEVEL[a] || 0) > (ROLE_LEVEL[b] || 0);

module.exports = { authenticate, authorize, ROLE_LEVEL, hasHigherAccess };
