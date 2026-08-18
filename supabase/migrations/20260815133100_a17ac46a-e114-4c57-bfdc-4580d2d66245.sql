
ALTER TABLE public.media_evidence
  ADD COLUMN IF NOT EXISTS job_status text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS job_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_error text,
  ADD COLUMN IF NOT EXISTS job_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS job_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS ocr_confidence numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcript_confidence numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS model_version text;

ALTER TABLE public.privacy_requests
  ADD COLUMN IF NOT EXISTS redaction_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS policy_version text,
  ADD COLUMN IF NOT EXISTS model_versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS receipt_code text;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL DEFAULT 'staff',
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity public.severity_level NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  body text,
  object_type text NOT NULL DEFAULT 'content_item',
  object_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications read" ON public.notifications;
CREATE POLICY "notifications read" ON public.notifications
  FOR SELECT TO authenticated
  USING ((audience = 'staff' AND public.is_staff(auth.uid())) OR user_id = auth.uid());

DROP POLICY IF EXISTS "notifications insert staff" ON public.notifications;
CREATE POLICY "notifications insert staff" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own reads" ON public.notification_reads;
CREATE POLICY "own reads" ON public.notification_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.notification_reads REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_reads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
