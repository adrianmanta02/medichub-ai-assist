import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface WaitTimesStats {
  hours_window: number;
  global_average: number;
  clinics: Array<{ clinic_id: string; name: string; average_wait: number }>;
}

// Reusable hook that:
//  - loads global & per clinic average wait times (last hoursWindow hours)
//  - subscribes in realtime to changes on wait_times
//  - exposes a reportWaitTime function to insert new wait time entries
export function useWaitTimes(hoursWindow: number = 2) {
  const [stats, setStats] = useState<WaitTimesStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setError(null);
    try {
      // Prefer the aggregation function; fallback to manual if missing
  const { data: fnData, error: fnError } = await (supabase as any).rpc('get_wait_time_stats', { hours_window: hoursWindow });
      if (!fnError && fnData) {
        setStats(fnData as WaitTimesStats);
        return;
      }
      // Manual fallback (slower): fetch wait_times then aggregate client-side
      const cutoffISO = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString();
      const { data: wtData, error: wtErr } = await supabase
        .from('wait_times')
        .select('clinic_id, wait_minutes, created_at')
        .gte('created_at', cutoffISO);
      if (wtErr) throw wtErr;
      
      // Calculate global average from ALL wait times (not per-clinic averages)
      const allWaitMinutes = wtData.map(row => row.wait_minutes || 0).filter(m => m > 0);
      const global_average = allWaitMinutes.length > 0
        ? Math.round(allWaitMinutes.reduce((a, b) => a + b, 0) / allWaitMinutes.length)
        : 0;
      
      // Calculate per-clinic averages
      const grouped: Record<string, { sum: number; count: number }> = {};
      wtData.forEach(row => {
        const cid = row.clinic_id as string;
        if (!grouped[cid]) grouped[cid] = { sum: 0, count: 0 };
        grouped[cid].sum += row.wait_minutes || 0;
        grouped[cid].count += 1;
      });
      
      // Fetch clinic names for better display
      const clinicIds = Object.keys(grouped);
      const { data: clinicsData } = await supabase
        .from('clinics')
        .select('id, name')
        .in('id', clinicIds);
      
      const clinicMap = new Map((clinicsData || []).map(c => [c.id, c.name]));
      
      const clinics: WaitTimesStats['clinics'] = Object.entries(grouped)
        .filter(([_, v]) => v.count > 0) // Only include clinics with actual wait time data
        .map(([clinic_id, v]) => ({
          clinic_id,
          name: clinicMap.get(clinic_id) || clinic_id,
          average_wait: Math.round(v.sum / v.count),
        }));
      
      setStats({ hours_window: hoursWindow, global_average, clinics });
    } catch (e: any) {
      setError(e.message || 'Failed to load wait time stats');
    } finally {
      setLoading(false);
    }
  }, [hoursWindow]);

  useEffect(() => {
    loadStats();
    const channel = supabase
      .channel('wait_times_hook')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wait_times' }, () => {
        loadStats();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStats]);

  const reportWaitTime = useCallback(async (clinicId: string, minutes: number) => {
    if (minutes <= 0 || minutes > 480) {
      throw new Error('Timpul de așteptare trebuie să fie între 1 și 480 minute');
    }
    
    // Check authentication first
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new Error('Eroare la verificarea autentificării. Te rugăm să te conectezi din nou.');
    }
    if (!session) {
      throw new Error('Trebuie să fii autentificat pentru a raporta timpul de așteptare.');
    }
    
    // Validate clinicId is a valid UUID
    if (!clinicId || typeof clinicId !== 'string') {
      throw new Error('ID-ul clinicii este invalid');
    }
    
    try {
      const { error: insErr } = await supabase
        .from('wait_times')
        .insert({ 
          clinic_id: clinicId, 
          wait_minutes: minutes, 
          reported_by: session.user.id 
        });
      
      if (insErr) {
        // Provide more descriptive error messages
        if (insErr.code === '23503') {
          throw new Error('Clinica specificată nu există în baza de date.');
        } else if (insErr.code === '42501') {
          throw new Error('Nu ai permisiunea de a raporta timpul de așteptare. Te rugăm să te conectezi din nou.');
        } else {
          throw new Error(insErr.message || 'Eroare la salvarea timpului de așteptare');
        }
      }
      
      // Optimistic refresh
      await loadStats();
    } catch (error: any) {
      // Re-throw with better error message if it's a network error
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        throw new Error('Eroare de conexiune. Verifică conexiunea la internet și încearcă din nou.');
      }
      throw error;
    }
  }, [loadStats]);

  return {
    loading,
    error,
    globalAverage: stats?.global_average ?? 0,
    clinicAverages: stats?.clinics ?? [],
    reportWaitTime,
    hoursWindow: stats?.hours_window ?? hoursWindow,
    refresh: loadStats,
  };
}

export default useWaitTimes;
