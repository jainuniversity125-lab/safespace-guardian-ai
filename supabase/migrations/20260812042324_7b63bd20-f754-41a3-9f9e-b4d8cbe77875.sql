
-- ROLES
CREATE TYPE public.app_role AS ENUM ('user','moderator','admin','auditor','counselor','data_scientist');
CREATE TYPE public.severity_level AS ENUM ('safe','low','medium','high','critical');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Anonymous',
  age_band TEXT NOT NULL DEFAULT 'adult',
  consent_status BOOLEAN NOT NULL DEFAULT false,
  account_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
    AND role IN ('moderator','admin','counselor'))
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- CONTENT
CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id TEXT,
  content_type TEXT NOT NULL DEFAULT 'text',
  body TEXT NOT NULL,
  media_url TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  visibility_status TEXT NOT NULL DEFAULT 'visible',
  severity public.severity_level NOT NULL DEFAULT 'safe',
  requires_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated;
GRANT ALL ON public.content_items TO service_role;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read visible or own content" ON public.content_items FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (visibility_status = 'visible' OR author_id = auth.uid() OR public.is_staff(auth.uid())));
CREATE POLICY "insert own content" ON public.content_items FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "update own or staff" ON public.content_items FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "delete own content" ON public.content_items FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE TABLE public.model_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES public.content_items ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity public.severity_level NOT NULL DEFAULT 'safe',
  confidence NUMERIC NOT NULL DEFAULT 0,
  target_detected BOOLEAN NOT NULL DEFAULT false,
  repetition_score NUMERIC NOT NULL DEFAULT 0,
  final_risk NUMERIC NOT NULL DEFAULT 0,
  explanation JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_action TEXT NOT NULL DEFAULT 'allow',
  requires_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.model_predictions TO authenticated;
GRANT ALL ON public.model_predictions TO service_role;
ALTER TABLE public.model_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read predictions for own or staff" ON public.model_predictions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'data_scientist') OR EXISTS (
    SELECT 1 FROM public.content_items c WHERE c.id = content_id AND c.author_id = auth.uid()));

-- REPORTS
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  content_id UUID REFERENCES public.content_items ON DELETE SET NULL,
  category TEXT NOT NULL,
  description TEXT,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority public.severity_level NOT NULL DEFAULT 'medium',
  assigned_moderator_id UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reporter or staff read" ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "create own report" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "staff update report" ON public.reports FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE public.moderation_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.reports ON DELETE CASCADE,
  content_id UUID REFERENCES public.content_items ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  decision TEXT NOT NULL,
  policy_code TEXT,
  reason TEXT,
  action_taken TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.moderation_decisions TO authenticated;
GRANT ALL ON public.moderation_decisions TO service_role;
ALTER TABLE public.moderation_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decisions read" ON public.moderation_decisions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'auditor') OR EXISTS (
    SELECT 1 FROM public.content_items c WHERE c.id = content_id AND c.author_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.reporter_id = auth.uid()));
CREATE POLICY "staff insert decision" ON public.moderation_decisions FOR INSERT TO authenticated
  WITH CHECK (moderator_id = auth.uid() AND public.is_staff(auth.uid()));

CREATE TABLE public.appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.moderation_decisions ON DELETE CASCADE,
  appellant_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_id UUID REFERENCES auth.users ON DELETE SET NULL,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.appeals TO authenticated;
GRANT ALL ON public.appeals TO service_role;
ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appeal read" ON public.appeals FOR SELECT TO authenticated
  USING (appellant_id = auth.uid() OR public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'auditor'));
CREATE POLICY "appeal insert" ON public.appeals FOR INSERT TO authenticated WITH CHECK (appellant_id = auth.uid());
CREATE POLICY "appeal resolve" ON public.appeals FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  event_type TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read staff" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'auditor') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "audit append" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'block',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own blocks" ON public.blocks FOR ALL TO authenticated
  USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

-- profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
