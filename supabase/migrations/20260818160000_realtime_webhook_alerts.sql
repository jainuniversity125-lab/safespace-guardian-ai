-- ====================================================================
-- Migration: Enable Supabase Realtime on key tables + database triggers
-- for real-time abuse/harassment detection from chat messages and posts
-- ====================================================================

-- 1. Safely add tables to Supabase Realtime publication (skip if already added)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ingested_posts;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.content_items;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.model_predictions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 2. Create a webhook_events table to log all incoming webhook payloads
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID REFERENCES public.ingest_sources(id) ON DELETE SET NULL,
  platform    TEXT NOT NULL DEFAULT 'unknown',
  event_type  TEXT NOT NULL DEFAULT 'message',
  payload     JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','failed')),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for webhook_events
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_view_webhook_events" ON public.webhook_events;
CREATE POLICY "staff_view_webhook_events" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "service_insert_webhook_events" ON public.webhook_events;
CREATE POLICY "service_insert_webhook_events" ON public.webhook_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Enable realtime on webhook_events
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create a realtime_alerts table for instant push notifications
CREATE TABLE IF NOT EXISTS public.realtime_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type    TEXT NOT NULL DEFAULT 'abuse_detected' CHECK (alert_type IN ('abuse_detected','threat_detected','harassment_detected','self_harm_detected','doxxing_detected','critical_flag')),
  severity      TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('safe','low','medium','high','critical')),
  content_id    UUID,
  post_id       UUID,
  source_platform TEXT,
  author_handle TEXT,
  target_handle TEXT,
  message_preview TEXT,
  ai_labels     JSONB DEFAULT '[]',
  ai_confidence NUMERIC DEFAULT 0,
  final_risk    NUMERIC DEFAULT 0,
  explanation   TEXT[],
  acknowledged  BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for realtime_alerts
ALTER TABLE public.realtime_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_view_alerts" ON public.realtime_alerts;
CREATE POLICY "staff_view_alerts" ON public.realtime_alerts
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff_update_alerts" ON public.realtime_alerts;
CREATE POLICY "staff_update_alerts" ON public.realtime_alerts
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "service_insert_alerts" ON public.realtime_alerts;
CREATE POLICY "service_insert_alerts" ON public.realtime_alerts
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Enable realtime on realtime_alerts
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.realtime_alerts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Create a database function that auto-creates a realtime_alert
--    whenever a flagged ingested_post is inserted
CREATE OR REPLACE FUNCTION public.fn_auto_alert_on_flagged_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.requires_review = true AND NEW.severity IN ('medium','high','critical') THEN
    INSERT INTO public.realtime_alerts (
      alert_type, severity, post_id, source_platform,
      author_handle, target_handle, message_preview,
      ai_labels, ai_confidence, final_risk, explanation
    ) VALUES (
      CASE
        WHEN NEW.severity = 'critical' THEN 'threat_detected'
        WHEN NEW.severity = 'high' THEN 'harassment_detected'
        ELSE 'abuse_detected'
      END,
      NEW.severity, NEW.id, NEW.platform,
      NEW.author_handle, NEW.target_handle, LEFT(NEW.body, 200),
      COALESCE(NEW.labels, '[]'::jsonb),
      COALESCE(NEW.confidence, 0),
      COALESCE(NEW.final_risk, 0),
      COALESCE(NEW.explanation::text[], ARRAY[]::text[])
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_alert_flagged_post ON public.ingested_posts;
CREATE TRIGGER trg_auto_alert_flagged_post
  AFTER INSERT ON public.ingested_posts
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_alert_on_flagged_post();

-- 5. Auto-alert on content_items flagged for review
CREATE OR REPLACE FUNCTION public.fn_auto_alert_on_flagged_content()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.requires_review = true AND NEW.severity IN ('medium','high','critical') THEN
    INSERT INTO public.realtime_alerts (
      alert_type, severity, content_id,
      message_preview, ai_confidence
    ) VALUES (
      CASE
        WHEN NEW.severity = 'critical' THEN 'critical_flag'
        WHEN NEW.severity = 'high' THEN 'harassment_detected'
        ELSE 'abuse_detected'
      END,
      NEW.severity, NEW.id,
      LEFT(NEW.body, 200), 0
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_alert_flagged_content ON public.content_items;
CREATE TRIGGER trg_auto_alert_flagged_content
  AFTER INSERT ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_alert_on_flagged_content();
