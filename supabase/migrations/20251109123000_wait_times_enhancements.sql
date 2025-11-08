-- Migration: wait_times enhancements (indexes, RLS policy improvements, aggregation helper)
-- Timestamp: 2025-11-09 12:30:00

-- Safety checks
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='wait_times'
  ) THEN
    RAISE EXCEPTION 'wait_times table missing; run initial clinic migration first';
  END IF;
END $$;

-- Indexes to speed up time-window queries & clinic lookups
CREATE INDEX IF NOT EXISTS idx_wait_times_clinic_created_at ON public.wait_times (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wait_times_created_at ON public.wait_times (created_at DESC);

-- Enable RLS on wait_times if not already (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='wait_times'
  ) THEN
    ALTER TABLE public.wait_times ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Anyone can view wait times" ON public.wait_times FOR SELECT USING (true);
    CREATE POLICY "Authenticated users can report wait times" ON public.wait_times FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Aggregation function returning JSON with global + per clinic averages (last N hours)
CREATE OR REPLACE FUNCTION public.get_wait_time_stats(hours_window INT DEFAULT 2)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - make_interval(hours => hours_window);
  global_avg INTEGER;
  clinic_rec RECORD;
  clinics_json JSONB := '[]'::jsonb;
BEGIN
  SELECT COALESCE(AVG(wait_minutes)::INTEGER, 0)
    INTO global_avg
    FROM public.wait_times
   WHERE created_at >= cutoff;

  FOR clinic_rec IN
    SELECT c.id, c.name,
           COALESCE(AVG(w.wait_minutes)::INTEGER, 0) AS avg_wait
      FROM public.clinics c
      INNER JOIN public.wait_times w ON w.clinic_id = c.id AND w.created_at >= cutoff
     GROUP BY c.id, c.name
     HAVING COUNT(*) > 0
     ORDER BY c.name
  LOOP
    clinics_json := clinics_json || jsonb_build_array(jsonb_build_object(
      'clinic_id', clinic_rec.id,
      'name', clinic_rec.name,
      'average_wait', clinic_rec.avg_wait
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'hours_window', hours_window,
    'global_average', global_avg,
    'clinics', clinics_json
  );
END;
$$;

-- Optional materialized view for fast dashboard aggregation (refresh manually or via cron)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_recent_wait_times AS
SELECT * FROM (
  SELECT w.*, get_current_wait_time(w.clinic_id) AS current_avg
    FROM public.wait_times w
   WHERE w.created_at > now() - INTERVAL '2 hours'
) t WITH NO DATA;

-- Grant usage if needed (Supabase service role already has access)
GRANT SELECT ON public.mv_recent_wait_times TO anon, authenticated;

-- Comment for clarity
COMMENT ON FUNCTION public.get_wait_time_stats IS 'Return JSON with global and per-clinic average wait times in the last N hours.';
