-- Fix DELETE and UPDATE policies for targets table
-- (auth.role() = 'authenticated' returns 'anon' for Firebase auth users)

DROP POLICY IF EXISTS "targets_delete" ON targets;
CREATE POLICY "targets_delete" ON targets
  FOR DELETE USING (true);

DROP POLICY IF EXISTS "targets_update" ON targets;
CREATE POLICY "targets_update" ON targets
  FOR UPDATE USING (true) WITH CHECK (true);
