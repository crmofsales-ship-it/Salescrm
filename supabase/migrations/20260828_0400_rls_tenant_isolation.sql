-- ============================================================================
-- Part 4 of 5 — real tenant isolation. Removes every "USING (true)" policy and
-- replaces it with organization-scoped RLS enforced by Postgres.
--
-- Requires Supabase Auth (0200). auth.uid() is the auth.users id; profiles.user_id
-- links it to the app profile; organization_members links the profile to orgs.
-- ============================================================================

-- ── membership / permission helpers ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT om.organization_id
    FROM public.organization_members om
    JOIN public.profiles p ON p.id = om.user_id
   WHERE p.user_id = auth.uid() AND om.status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_org_ids() o WHERE o = p_org)
$$;

CREATE OR REPLACE FUNCTION public.org_role(p_org UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT om.role
    FROM public.organization_members om
    JOIN public.profiles p ON p.id = om.user_id
   WHERE p.user_id = auth.uid() AND om.organization_id = p_org AND om.status = 'active'
$$;

-- rank: owner > admin > sales_manager > sales_rep
CREATE OR REPLACE FUNCTION public.has_org_permission(p_org UUID, p_min_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (CASE public.org_role(p_org)
       WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'sales_manager' THEN 2 WHEN 'sales_rep' THEN 1 ELSE 0 END)
    >=
    (CASE p_min_role
       WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'sales_manager' THEN 2 WHEN 'sales_rep' THEN 1 ELSE 99 END),
    false)
$$;

-- ── generic policy builder for tables that carry organization_id ───────────
CREATE OR REPLACE FUNCTION public._apply_org_rls(p_table text, p_delete_min_role text DEFAULT 'sales_rep')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);
  -- drop ALL existing policies on the table
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=p_table LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, p_table);
  END LOOP;
  EXECUTE format($f$CREATE POLICY org_select ON public.%I FOR SELECT TO authenticated
                    USING (public.is_org_member(organization_id))$f$, p_table);
  EXECUTE format($f$CREATE POLICY org_insert ON public.%I FOR INSERT TO authenticated
                    WITH CHECK (public.is_org_member(organization_id))$f$, p_table);
  EXECUTE format($f$CREATE POLICY org_update ON public.%I FOR UPDATE TO authenticated
                    USING (public.is_org_member(organization_id))
                    WITH CHECK (public.is_org_member(organization_id))$f$, p_table);
  EXECUTE format($f$CREATE POLICY org_delete ON public.%I FOR DELETE TO authenticated
                    USING (public.has_org_permission(organization_id, %L))$f$, p_table, p_delete_min_role);
END $$;

SELECT public._apply_org_rls(t, d) FROM (VALUES
  ('leads','sales_rep'), ('customers','sales_rep'), ('deals','sales_rep'), ('tasks','sales_rep'),
  ('meetings','sales_rep'), ('notifications','sales_rep'), ('activities','sales_rep'),
  ('files','sales_rep'), ('targets','sales_manager'), ('change_history','sales_manager'),
  ('chat_channels','sales_rep'), ('email_accounts','sales_rep'), ('email_sync_log','sales_rep'),
  ('login_logs','admin'), ('audit_logs','admin'), ('user_oauth_tokens','sales_rep'),
  ('meeting_calendar_sync','sales_rep'), ('crm_settings','admin'),
  ('dsr_email_logs','admin'), ('dsr_scheduler','admin'), ('dsr_recipient_config','admin'),
  ('inactivity_alert_config','admin')
) AS x(t,d);

DROP FUNCTION public._apply_org_rls(text, text);

-- ── child tables: inherit tenancy from parent ─────────────────────────────
ALTER TABLE public.task_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
           AND tablename IN ('task_comments','meeting_attendees','channel_members','chat_messages') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY tc_all ON public.task_comments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(t.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(t.organization_id)));

CREATE POLICY ma_all ON public.meeting_attendees FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND public.is_org_member(m.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND public.is_org_member(m.organization_id)));

CREATE POLICY cm_all ON public.channel_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND public.is_org_member(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND public.is_org_member(c.organization_id)));

CREATE POLICY msg_all ON public.chat_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND public.is_org_member(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND public.is_org_member(c.organization_id)));

-- ── profiles ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', r.policyname);
  END LOOP;
END $$;
-- see your own profile, and the profiles of people who share an org with you
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR id IN (
    SELECT om2.user_id FROM public.organization_members om1
      JOIN public.organization_members om2 ON om2.organization_id = om1.organization_id
      JOIN public.profiles me ON me.id = om1.user_id
     WHERE me.user_id = auth.uid() AND om1.status = 'active'
  )
);
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- inserts happen through the handle_new_user trigger (SECURITY DEFINER)

-- ── organizations / members / invitations ────────────────────────────────
ALTER TABLE public.organizations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_audit_logs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_select ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = public.current_profile_id());
CREATE POLICY org_update ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_permission(id,'admin')) WITH CHECK (public.has_org_permission(id,'admin'));
CREATE POLICY org_delete ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_permission(id,'owner'));

CREATE POLICY omem_select ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY omem_write ON public.organization_members FOR ALL TO authenticated
  USING (public.has_org_permission(organization_id,'admin'))
  WITH CHECK (public.has_org_permission(organization_id,'admin'));
-- allow a user to insert THEIR OWN first membership when they create an org
CREATE POLICY omem_bootstrap ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY oinv_admin ON public.organization_invitations FOR ALL TO authenticated
  USING (public.has_org_permission(organization_id,'admin'))
  WITH CHECK (public.has_org_permission(organization_id,'admin'));

CREATE POLICY oaudit_read ON public.organization_audit_logs FOR SELECT TO authenticated
  USING (public.has_org_permission(organization_id,'admin'));

-- ── organization_integrations: NO direct client access (tokens live here) ──
-- The backend uses the service-role key. Clients read a token-free view only.
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_integrations FORCE ROW LEVEL SECURITY;
-- (no policies created => authenticated/anon get nothing)

CREATE OR REPLACE VIEW public.v_organization_integrations
WITH (security_invoker = true) AS
  SELECT id, organization_id, provider, status, is_platform_default,
         connected_email, display_name, scope, last_sync_at, last_error,
         connected_by, created_at, updated_at
    FROM public.organization_integrations
   WHERE public.is_org_member(organization_id);
GRANT SELECT ON public.v_organization_integrations TO authenticated;

-- ── lock the anon role out of everything ──────────────────────────────────
-- Nothing in this app should be reachable with only the anon key.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
