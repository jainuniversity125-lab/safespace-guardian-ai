-- RPC to bootstrap the first administrator
CREATE OR REPLACE FUNCTION public.claim_admin_roles()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_count INTEGER;
  caller_id UUID;
BEGIN
  -- Get calling user ID
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if any admin exists
  SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  
  IF admin_count > 0 THEN
    -- If admin exists, check if caller is admin
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = caller_id AND role = 'admin') THEN
      RETURN jsonb_build_object('ok', true, 'alreadyProvisioned', true);
    ELSE
      RAISE EXCEPTION 'An administrator already exists. Ask them for access.';
    END IF;
  END IF;

  -- Insert roles for first user
  INSERT INTO public.user_roles (user_id, role)
  VALUES 
    (caller_id, 'admin'),
    (caller_id, 'moderator'),
    (caller_id, 'auditor')
  ON CONFLICT DO NOTHING;

  -- Log audit record
  INSERT INTO public.audit_logs (actor_id, event_type, object_type, object_id, details)
  VALUES (
    caller_id,
    'roles.bootstrap',
    'user',
    caller_id,
    '{"roles": ["admin", "moderator", "auditor"]}'::jsonb
  );

  RETURN jsonb_build_object('ok', true, 'alreadyProvisioned', false);
END;
$$;

-- RPC for admin to assign roles to users
CREATE OR REPLACE FUNCTION public.set_user_role_rpc(_target_user_id UUID, _role public.app_role, _grant BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_id UUID;
BEGIN
  -- Get calling user ID
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = caller_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Forbidden: administrator role required';
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_target_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = _target_user_id AND role = _role;
  END IF;

  -- Log audit record
  INSERT INTO public.audit_logs (actor_id, event_type, object_type, object_id, details)
  VALUES (
    caller_id,
    CASE WHEN _grant THEN 'roles.granted' ELSE 'roles.revoked' END,
    'user',
    _target_user_id,
    jsonb_build_object('role', _role)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_admin_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role_rpc(UUID, public.app_role, BOOLEAN) TO authenticated;

-- Allow all authenticated and anon users to read/manage ingest_sources (for Chat Simulator Sandbox & Webhooks)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingest_sources TO authenticated, anon;
ALTER TABLE public.ingest_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated manage sources" ON public.ingest_sources;
CREATE POLICY "authenticated manage sources" ON public.ingest_sources
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon manage sources" ON public.ingest_sources;
CREATE POLICY "anon manage sources" ON public.ingest_sources
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Allow all authenticated and anon users to read/insert ingested posts (for Chat Simulator Sandbox & Webhooks)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingested_posts TO authenticated, anon;
ALTER TABLE public.ingested_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated manage ingested" ON public.ingested_posts;
CREATE POLICY "authenticated manage ingested" ON public.ingested_posts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon manage ingested" ON public.ingested_posts;
CREATE POLICY "anon manage ingested" ON public.ingested_posts
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Allow staff/lab/anon users to insert model predictions
GRANT SELECT, INSERT ON public.model_predictions TO authenticated, anon;
ALTER TABLE public.model_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab insert predictions" ON public.model_predictions;
CREATE POLICY "lab insert predictions" ON public.model_predictions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_lab(auth.uid()) OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "anon insert predictions" ON public.model_predictions;
CREATE POLICY "anon insert predictions" ON public.model_predictions
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow anon to write to audit_logs and notifications (triggered during webhook safety interceptions)
GRANT SELECT, INSERT ON public.audit_logs TO anon;
GRANT SELECT, INSERT ON public.notifications TO anon;
GRANT SELECT, INSERT ON public.content_items TO anon;

DROP POLICY IF EXISTS "anon append audit" ON public.audit_logs;
CREATE POLICY "anon append audit" ON public.audit_logs FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon append notifications" ON public.notifications;
CREATE POLICY "anon append notifications" ON public.notifications FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon append content" ON public.content_items;
CREATE POLICY "anon append content" ON public.content_items FOR INSERT TO anon WITH CHECK (true);
