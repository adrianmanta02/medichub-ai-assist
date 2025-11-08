-- Fix search_path for functions with CASCADE
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP FUNCTION IF EXISTS get_current_wait_time(UUID);
CREATE OR REPLACE FUNCTION get_current_wait_time(clinic_uuid UUID)
RETURNS INTEGER 
LANGUAGE SQL 
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(AVG(wait_minutes)::INTEGER, 0)
  FROM public.wait_times
  WHERE clinic_id = clinic_uuid
    AND created_at > now() - INTERVAL '2 hours'
$$;