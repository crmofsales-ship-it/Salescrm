const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;

// Service-role client — bypasses RLS. Use ONLY for admin/system work:
// user provisioning, cron jobs, integration-token storage, webhooks.
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Per-request client that runs as the calling user, so Postgres RLS enforces
// organization isolation and row-level RBAC automatically. Use this for all
// tenant-owned data (leads, deals, activities, …).
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
function supabaseAsUser(accessToken) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

module.exports = { supabase, supabaseAsUser };
