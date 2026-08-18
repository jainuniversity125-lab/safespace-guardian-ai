CREATE OR REPLACE FUNCTION public.is_lab(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff(_user_id) OR public.has_role(_user_id, 'data_scientist')
$$;
REVOKE EXECUTE ON FUNCTION public.is_lab(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_lab(uuid) TO authenticated;

CREATE TABLE public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  source_note text,
  languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets TO authenticated;
GRANT ALL ON public.datasets TO service_role;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab read datasets" ON public.datasets FOR SELECT TO authenticated USING (public.is_lab(auth.uid()));
CREATE POLICY "lab insert datasets" ON public.datasets FOR INSERT TO authenticated WITH CHECK (public.is_lab(auth.uid()) AND owner_id = auth.uid());
CREATE POLICY "lab update datasets" ON public.datasets FOR UPDATE TO authenticated USING (public.is_lab(auth.uid()));
CREATE POLICY "lab delete datasets" ON public.datasets FOR DELETE TO authenticated USING (public.is_lab(auth.uid()));
CREATE TRIGGER update_datasets_updated_at BEFORE UPDATE ON public.datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.dataset_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  text text NOT NULL,
  language text NOT NULL DEFAULT 'unknown',
  script_mix text NOT NULL DEFAULT 'native',
  expected_category text NOT NULL DEFAULT 'non_bullying',
  expected_bullying boolean NOT NULL DEFAULT false,
  expected_severity severity_level NOT NULL DEFAULT 'safe',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dataset_samples_dataset_idx ON public.dataset_samples(dataset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataset_samples TO authenticated;
GRANT ALL ON public.dataset_samples TO service_role;
ALTER TABLE public.dataset_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab manage samples" ON public.dataset_samples FOR ALL TO authenticated
  USING (public.is_lab(auth.uid())) WITH CHECK (public.is_lab(auth.uid()));

CREATE TABLE public.benchmark_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'baseline',
  model_version text NOT NULL DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'running',
  sample_size integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX benchmark_runs_dataset_idx ON public.benchmark_runs(dataset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_runs TO authenticated;
GRANT ALL ON public.benchmark_runs TO service_role;
ALTER TABLE public.benchmark_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab manage runs" ON public.benchmark_runs FOR ALL TO authenticated
  USING (public.is_lab(auth.uid())) WITH CHECK (public.is_lab(auth.uid()));

CREATE TABLE public.benchmark_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.benchmark_runs(id) ON DELETE CASCADE,
  sample_id uuid REFERENCES public.dataset_samples(id) ON DELETE SET NULL,
  language text NOT NULL DEFAULT 'unknown',
  script_mix text NOT NULL DEFAULT 'native',
  text_preview text NOT NULL DEFAULT '',
  expected_bullying boolean NOT NULL DEFAULT false,
  expected_category text NOT NULL DEFAULT 'non_bullying',
  predicted_bullying boolean NOT NULL DEFAULT false,
  predicted_category text NOT NULL DEFAULT 'non_bullying',
  predicted_severity severity_level NOT NULL DEFAULT 'safe',
  confidence numeric NOT NULL DEFAULT 0,
  final_risk numeric NOT NULL DEFAULT 0,
  correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX benchmark_results_run_idx ON public.benchmark_results(run_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_results TO authenticated;
GRANT ALL ON public.benchmark_results TO service_role;
ALTER TABLE public.benchmark_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab manage results" ON public.benchmark_results FOR ALL TO authenticated
  USING (public.is_lab(auth.uid())) WITH CHECK (public.is_lab(auth.uid()));

CREATE TABLE public.fewshot_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sample_id uuid REFERENCES public.dataset_samples(id) ON DELETE SET NULL,
  text text NOT NULL,
  language text NOT NULL DEFAULT 'unknown',
  script_mix text NOT NULL DEFAULT 'native',
  expected_category text NOT NULL DEFAULT 'non_bullying',
  expected_bullying boolean NOT NULL DEFAULT false,
  expected_severity severity_level NOT NULL DEFAULT 'safe',
  rationale text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fewshot_examples TO authenticated;
GRANT ALL ON public.fewshot_examples TO service_role;
ALTER TABLE public.fewshot_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab manage fewshot" ON public.fewshot_examples FOR ALL TO authenticated
  USING (public.is_lab(auth.uid())) WITH CHECK (public.is_lab(auth.uid()));

CREATE TABLE public.ingest_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  platform text NOT NULL DEFAULT 'custom',
  signing_secret text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_event_at timestamptz,
  event_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingest_sources TO authenticated;
GRANT ALL ON public.ingest_sources TO service_role;
ALTER TABLE public.ingest_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage sources" ON public.ingest_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff read sources" ON public.ingest_sources FOR SELECT TO authenticated
  USING (public.is_lab(auth.uid()));

CREATE TABLE public.ingested_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.ingest_sources(id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'custom',
  external_id text,
  author_handle text NOT NULL DEFAULT 'unknown',
  target_handle text,
  body text NOT NULL,
  media_url text,
  language text NOT NULL DEFAULT 'unknown',
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity severity_level NOT NULL DEFAULT 'safe',
  confidence numeric NOT NULL DEFAULT 0,
  final_risk numeric NOT NULL DEFAULT 0,
  recommended_action text NOT NULL DEFAULT 'allow',
  requires_review boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new',
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingested_posts_created_idx ON public.ingested_posts(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingested_posts TO authenticated;
GRANT ALL ON public.ingested_posts TO service_role;
ALTER TABLE public.ingested_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab read ingested" ON public.ingested_posts FOR SELECT TO authenticated
  USING (public.is_lab(auth.uid()));
CREATE POLICY "staff update ingested" ON public.ingested_posts FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.ingested_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.benchmark_runs;