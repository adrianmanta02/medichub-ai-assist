-- Migration: User medications and appointments
-- Timestamp: 2025-11-10

-- Medications table
CREATE TABLE IF NOT EXISTS public.user_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL, -- e.g., "500mg", "1000 UI"
  frequency TEXT NOT NULL, -- e.g., "3x/zi", "1x/zi", "dimineața"
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Appointments table
CREATE TABLE IF NOT EXISTS public.user_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  appointment_date DATE,
  appointment_time TIME,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for medications
CREATE POLICY "Users can view their own medications"
  ON public.user_medications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own medications"
  ON public.user_medications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own medications"
  ON public.user_medications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medications"
  ON public.user_medications FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for appointments
CREATE POLICY "Users can view their own appointments"
  ON public.user_appointments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own appointments"
  ON public.user_appointments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own appointments"
  ON public.user_appointments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own appointments"
  ON public.user_appointments FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_medications_user_id ON public.user_medications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_appointments_user_id ON public.user_appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_appointments_date ON public.user_appointments(appointment_date);

