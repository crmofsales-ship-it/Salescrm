-- ============================================================================
-- SaaS multi-tenant foundation — organizations, membership, roles, integrations
-- Part 1 of 5.  Run in order: 0100 → 0200 → 0300 → 0400 → 0500.
-- ============================================================================

-- ── helper: generic updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── organizations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  logo_url     TEXT,
  website      TEXT,
  industry     TEXT,
  timezone     TEXT DEFAULT 'Asia/Kolkata',
  currency     TEXT DEFAULT 'USD',
  plan         TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  settings     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── role model ─────────────────────────────────────────────────────────────
--  owner          : full control incl. billing, delete org, transfer ownership
--  admin          : manage members / integrations / settings / all CRM data
--  sales_manager  : manage team data, pipelines, reports, targets
--  sales_rep      : manage own assigned leads / contacts / deals / activities
-- Extensible: add rows here and grant them in fn_has_org_permission (0400).
CREATE TABLE IF NOT EXISTS public.organization_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'sales_rep'
                     CHECK (role IN ('owner','admin','sales_manager','sales_rep')),
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','invited','suspended','removed')),
  manager_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON public.organization_members(organization_id);
DROP TRIGGER IF EXISTS trg_org_members_updated_at ON public.organization_members;
CREATE TRIGGER trg_org_members_updated_at BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- exactly one active owner minimum is enforced at the application layer on
-- role change / member removal.

-- ── invitations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'sales_rep'
                     CHECK (role IN ('owner','admin','sales_manager','sales_rep')),
  token            TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  invited_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON public.organization_invitations(lower(email));

-- ── per-organization integrations (Gmail / Google / future) ─────────────────
-- Replaces the global, per-user email_accounts model. One row per
-- (organization, provider).  Tokens are server-managed; never read by anon.
CREATE TABLE IF NOT EXISTS public.organization_integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('gmail','google_calendar','microsoft_teams')),
  status           TEXT NOT NULL DEFAULT 'disconnected'
                     CHECK (status IN ('connected','disconnected','error')),
  is_platform_default BOOLEAN NOT NULL DEFAULT false,  -- true = the "CRM of Sales" platform identity
  connected_email  TEXT,
  display_name     TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expiry     TIMESTAMPTZ,
  scope            TEXT,
  history_id       TEXT,
  last_sync_at     TIMESTAMPTZ,
  last_error       TEXT,
  connected_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider)
);
DROP TRIGGER IF EXISTS trg_org_integrations_updated_at ON public.organization_integrations;
CREATE TRIGGER trg_org_integrations_updated_at BEFORE UPDATE ON public.organization_integrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── org-scoped audit log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_audit_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  resource         TEXT,
  resource_id      TEXT,
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_audit_org ON public.organization_audit_logs(organization_id, created_at DESC);
