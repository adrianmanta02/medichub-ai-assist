-- Enable PostGIS for geolocation
CREATE EXTENSION IF NOT EXISTS postgis;

-- Profiles table for citizens with medical data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  cnp TEXT UNIQUE,
  birth_date DATE,
  address TEXT,
  phone TEXT,
  email TEXT,
  medical_history JSONB DEFAULT '[]'::jsonb,
  allergies TEXT[],
  current_medications TEXT[],
  blood_type TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Clinics table with Bucharest coordinates
CREATE TABLE public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'hospital', 'clinic', 'pharmacy'
  specialties TEXT[],
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  opening_hours JSONB,
  services JSONB DEFAULT '[]'::jsonb,
  accepts_emergencies BOOLEAN DEFAULT false,
  average_rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  price_range TEXT, -- 'low', 'medium', 'high'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view clinics"
  ON public.clinics FOR SELECT
  USING (true);

-- Wait times reported by users
CREATE TABLE public.wait_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES public.profiles(user_id),
  wait_minutes INTEGER NOT NULL CHECK (wait_minutes >= 0 AND wait_minutes <= 480),
  specialty TEXT,
  crowdedness TEXT, -- 'low', 'medium', 'high'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.wait_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view wait times"
  ON public.wait_times FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can report wait times"
  ON public.wait_times FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Reviews table for clinics
CREATE TABLE public.clinic_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  price_rating INTEGER CHECK (price_rating >= 1 AND price_rating <= 5),
  service_rating INTEGER CHECK (service_rating >= 1 AND service_rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clinic_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reviews"
  ON public.clinic_reviews FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create reviews"
  ON public.clinic_reviews FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Scanned documents table
CREATE TABLE public.scanned_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  document_type TEXT NOT NULL, -- 'id_card', 'health_card', 'prescription'
  extracted_data JSONB DEFAULT '{}'::jsonb,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scanned_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own documents"
  ON public.scanned_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON public.scanned_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON public.scanned_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate average wait time for a clinic
CREATE OR REPLACE FUNCTION get_current_wait_time(clinic_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COALESCE(AVG(wait_minutes)::INTEGER, 0)
  FROM public.wait_times
  WHERE clinic_id = clinic_uuid
    AND created_at > now() - INTERVAL '2 hours'
$$ LANGUAGE SQL STABLE;

-- Insert some real Bucharest clinics data
INSERT INTO public.clinics (name, type, specialties, address, latitude, longitude, phone, average_rating, price_range, accepts_emergencies) VALUES
('Spitalul Universitar de Urgență București', 'hospital', ARRAY['urgențe', 'chirurgie', 'cardiologie'], 'Splaiul Independenței 169, București', 44.4208, 26.1029, '021-318-05-00', 4.2, 'low', true),
('Regina Maria - Clinica Aviatorilor', 'clinic', ARRAY['medicină generală', 'pediatrie', 'stomatologie'], 'Bulevardul Aviatorilor 42, București', 44.4724, 26.0953, '021-9337', 4.8, 'high', false),
('MedLife - Calea Victoriei', 'clinic', ARRAY['medicină generală', 'analize', 'imagistică'], 'Calea Victoriei 133, București', 44.4451, 26.0931, '021-9696', 4.6, 'medium', false),
('Spitalul Clinic Colentina', 'hospital', ARRAY['urgențe', 'neurologie', 'oftalmologie'], 'Șoseaua Stefan cel Mare 19-21, București', 44.4561, 26.1302, '021-317-16-00', 4.0, 'low', true),
('Farmacia Catena - Unirii', 'pharmacy', ARRAY['medicamente', 'consiliere'], 'Bulevardul Unirii 45, București', 44.4272, 26.1047, '021-9200', 4.5, 'low', false),
('Farmacia Dona - Romana', 'pharmacy', ARRAY['medicamente', 'dermato-cosmetice'], 'Piața Romană 8, București', 44.4496, 26.0987, '021-310-20-30', 4.7, 'medium', false),
('Centrul Medical Sanador', 'clinic', ARRAY['cardiologie', 'oncologie', 'neurologie'], 'Șoseaua Berceni 9-11, București', 44.3839, 26.1180, '021-9699', 4.9, 'high', false),
('Spitalul Marie Curie', 'hospital', ARRAY['pediatrie', 'neonatologie'], 'Bulevardul Constantin Brâncoveanu 20, București', 44.4013, 26.1148, '021-460-12-00', 4.3, 'low', true),
('Synevo - Laborator Analize', 'clinic', ARRAY['analize', 'teste COVID'], 'Calea Floreasca 169A, București', 44.4751, 26.1072, '021-9989', 4.4, 'medium', false),
('Bioclinica - Laborator', 'clinic', ARRAY['analize', 'imagistică'], 'Strada Intrarea Banatului 8, București', 44.4358, 26.1124, '021-9800', 4.6, 'medium', false);

-- Insert some mock wait times
INSERT INTO public.wait_times (clinic_id, wait_minutes, specialty, crowdedness, created_at) 
SELECT id, 
  (RANDOM() * 60)::INTEGER, 
  (ARRAY['medicină generală', 'urgențe', 'pediatrie'])[FLOOR(RANDOM() * 3 + 1)],
  (ARRAY['low', 'medium', 'high'])[FLOOR(RANDOM() * 3 + 1)],
  now() - (RANDOM() * INTERVAL '1 hour')
FROM public.clinics
WHERE type IN ('hospital', 'clinic')
LIMIT 15;