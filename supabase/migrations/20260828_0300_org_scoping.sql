-- ============================================================================
-- Part 3 of 5 — add organization_id to every tenant-owned table, then backfill
-- all existing rows into a single "Default Organization" so nothing is orphaned.
-- ============================================================================

-- ── 1. create the default organization from existing data ──────────────────
-- Clean install: if there are no profiles yet, this is a brand-new product
-- database — skip the "Default Organization" entirely. The org_id columns are
-- still added below (NOT NULL on empty tables is fine); the first real user
-- creates the first organization through the signup/onboarding flow.
DO $$
DECLARE
  v_owner UUID;
  v_org   UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    RAISE NOTICE 'clean install — no Default Organization created'; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'default') THEN
    RETURN;
  END IF;

  SELECT id INTO v_owner FROM public.profiles
   WHERE role IN ('owner','sales_head','admin')
   ORDER BY created_at ASC LIMIT 1;
  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  INSERT INTO public.organizations (name, slug, created_by, plan)
  VALUES ('Default Organization', 'default', v_owner, 'enterprise')
  RETURNING id INTO v_org;

  -- every existing profile becomes a member; legacy roles map to the new model
  INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
  SELECT v_org, p.id,
         CASE p.role
           WHEN 'owner'         THEN 'owner'
           WHEN 'sales_head'    THEN 'admin'
           WHEN 'admin'         THEN 'admin'
           WHEN 'sales_manager' THEN 'sales_manager'
           ELSE 'sales_rep'
         END,
         CASE WHEN p.status = 'active' THEN 'active' ELSE 'suspended' END,
         p.created_at
  FROM public.profiles p
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  -- guarantee exactly one owner
  IF NOT EXISTS (SELECT 1 FROM public.organization_members
                  WHERE organization_id = v_org AND role = 'owner' AND status = 'active') THEN
    UPDATE public.organization_members
       SET role = 'owner'
     WHERE id = (SELECT id FROM public.organization_members
                  WHERE organization_id = v_org ORDER BY joined_at ASC NULLS LAST LIMIT 1);
  END IF;
END $$;

-- ── 2. helper to add + backfill a column, idempotently ─────────────────────
CREATE OR REPLACE FUNCTION public._add_org_col(p_table regclass)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_org UUID;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'default';
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE', p_table);
  IF v_org IS NOT NULL THEN
    EXECUTE format('UPDATE %s SET organization_id = %L WHERE organization_id IS NULL', p_table, v_org);
  END IF;
  -- Any rows still unattributed are legacy global seed data with no tenant —
  -- meaningless under the per-org model. Drop them so NOT NULL can apply.
  EXECUTE format('DELETE FROM %s WHERE organization_id IS NULL', p_table);
  EXECUTE format('ALTER TABLE %s ALTER COLUMN organization_id SET NOT NULL', p_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s(organization_id)',
                 'idx_' || replace(p_table::text,'public.','') || '_org', p_table);
END $$;

SELECT public._add_org_col(t) FROM (VALUES
  ('public.leads'::regclass), ('public.customers'), ('public.deals'), ('public.tasks'),
  ('public.meetings'), ('public.notifications'), ('public.activities'), ('public.files'),
  ('public.targets'), ('public.change_history'), ('public.chat_channels'),
  ('public.email_accounts'), ('public.email_sync_log'), ('public.login_logs'),
  ('public.audit_logs'), ('public.user_oauth_tokens'), ('public.meeting_calendar_sync'),
  ('public.dsr_email_logs'), ('public.dsr_scheduler'), ('public.dsr_recipient_config'),
  ('public.inactivity_alert_config')
) AS x(t);

DROP FUNCTION public._add_org_col(regclass);

-- ── 3. crm_settings: repartition per-organization ──────────────────────────
ALTER TABLE public.crm_settings ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.crm_settings SET organization_id = (SELECT id FROM public.organizations WHERE slug='default')
  WHERE organization_id IS NULL AND EXISTS (SELECT 1 FROM public.organizations WHERE slug='default');
-- legacy global seed rows ('phone_email_lock' etc.) have no tenant — drop them;
-- each organization gets its own crm_settings rows created by the app.
DELETE FROM public.crm_settings WHERE organization_id IS NULL;
ALTER TABLE public.crm_settings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.crm_settings DROP CONSTRAINT IF EXISTS crm_settings_pkey;
ALTER TABLE public.crm_settings ADD PRIMARY KEY (organization_id, key);

-- ── 4. drop the legacy free-text organization column on leads ──────────────
ALTER TABLE public.leads DROP COLUMN IF EXISTS organization;

-- ── 5. remap legacy profile roles, then tighten the check constraint ───────
UPDATE public.profiles SET role = CASE role
  WHEN 'sales_head'   THEN 'admin'
  WHEN 'employee'     THEN 'sales_rep'
  WHEN 'inside_sales' THEN 'sales_rep'
  ELSE role END
WHERE role IN ('sales_head','employee','inside_sales');

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'sales_rep';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner','admin','sales_manager','sales_rep'));
