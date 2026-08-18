CREATE TABLE public.media_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  media_kind text NOT NULL DEFAULT 'image',
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  file_size integer NOT NULL DEFAULT 0,
  ocr_text text,
  transcript text,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity severity_level NOT NULL DEFAULT 'safe',
  status text NOT NULL DEFAULT 'pending',
  legal_hold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.media_evidence TO authenticated;
GRANT ALL ON public.media_evidence TO service_role;
ALTER TABLE public.media_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence insert own" ON public.media_evidence
  FOR INSERT TO authenticated WITH CHECK (uploader_id = auth.uid());
CREATE POLICY "evidence read own or staff" ON public.media_evidence
  FOR SELECT TO authenticated
  USING (uploader_id = auth.uid() OR public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'auditor'));
CREATE POLICY "evidence update own or staff" ON public.media_evidence
  FOR UPDATE TO authenticated
  USING (uploader_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (uploader_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type text NOT NULL DEFAULT 'data_deletion',
  scope text NOT NULL DEFAULT 'content',
  reason text,
  status text NOT NULL DEFAULT 'pending',
  confirmation_code text NOT NULL,
  confirmed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  preserved_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.privacy_requests TO authenticated;
GRANT ALL ON public.privacy_requests TO service_role;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privacy insert own" ON public.privacy_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "privacy read own or staff" ON public.privacy_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'auditor'));
CREATE POLICY "privacy update own or staff" ON public.privacy_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_media_evidence_updated_at BEFORE UPDATE ON public.media_evidence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_privacy_requests_updated_at BEFORE UPDATE ON public.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.content_items REPLICA IDENTITY FULL;
ALTER TABLE public.reports REPLICA IDENTITY FULL;
ALTER TABLE public.model_predictions REPLICA IDENTITY FULL;
ALTER TABLE public.media_evidence REPLICA IDENTITY FULL;
ALTER TABLE public.privacy_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.content_items, public.reports, public.model_predictions, public.media_evidence, public.privacy_requests;

CREATE POLICY "evidence upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "evidence read own or staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'evidence' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'auditor')));