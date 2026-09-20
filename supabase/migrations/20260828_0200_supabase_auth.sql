-- ============================================================================
-- Part 2 of 5 — move authentication identity from Firebase to Supabase Auth.
--
-- Strategy: keep profiles.id as the app-wide primary key (30+ tables already
-- FK to it — we do NOT rewrite those). Add profiles.user_id -> auth.users(id)
-- as the new auth link. firebase_uid becomes nullable legacy data.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ALTER COLUMN firebase_uid DROP NOT NULL;

-- Expand role check to the new 4-role model while tolerating legacy values
-- until 0300 remaps them.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IN ('owner','admin','sales_manager','sales_rep',
           'sales_head','employee','inside_sales')   -- legacy, removed in 0300
);

-- ── auto-create a profile when a Supabase auth user is created ──────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Link to an existing profile by email (migration case) or create a new one.
  UPDATE public.profiles
     SET user_id = NEW.id,
         avatar_url = COALESCE(avatar_url, NEW.raw_user_meta_data->>'avatar_url')
   WHERE lower(email) = lower(NEW.email) AND user_id IS NULL;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, email, full_name, avatar_url, role, status)
    VALUES (NEW.id, lower(NEW.email), v_full_name,
            NEW.raw_user_meta_data->>'avatar_url', 'sales_rep', 'active');
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── convenience: the caller's profile id ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;
