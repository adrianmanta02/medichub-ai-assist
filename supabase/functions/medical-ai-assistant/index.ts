import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClinicData {
  id: string;
  name: string;
  type: string;
  specialties: string[];
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  average_rating: number;
  price_range: string;
  wait_time: number;
  distance?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userLocation } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch clinics data with wait times
    const { data: clinics, error: clinicsError } = await supabase
      .from('clinics')
      .select(`
        *,
        wait_times(wait_minutes, created_at)
      `)
      .order('created_at', { foreignTable: 'wait_times', ascending: false });
    
    if (clinicsError) throw clinicsError;
    
    // Calculate current wait time and distance for each clinic
    const clinicsWithData = clinics?.map((clinic: any) => {
      const recentWaitTimes = clinic.wait_times
        ?.filter((wt: any) => {
          const timeAgo = Date.now() - new Date(wt.created_at).getTime();
          return timeAgo < 2 * 60 * 60 * 1000; // Last 2 hours
        })
        .map((wt: any) => wt.wait_minutes) || [];
      
      const avgWaitTime = recentWaitTimes.length > 0
        ? Math.round(recentWaitTimes.reduce((a: number, b: number) => a + b, 0) / recentWaitTimes.length)
        : 15; // Default 15 min if no data
      
      let distance = 0;
      if (userLocation?.latitude && userLocation?.longitude) {
        const lat1 = userLocation.latitude;
        const lon1 = userLocation.longitude;
        const lat2 = clinic.latitude;
        const lon2 = clinic.longitude;
        
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c;
      }
      
      return {
        id: clinic.id,
        name: clinic.name,
        type: clinic.type,
        specialties: clinic.specialties,
        address: clinic.address,
        latitude: clinic.latitude,
        longitude: clinic.longitude,
        phone: clinic.phone,
        average_rating: clinic.average_rating,
        price_range: clinic.price_range,
        wait_time: avgWaitTime,
        distance: Math.round(distance * 10) / 10,
        accepts_emergencies: clinic.accepts_emergencies
      };
    }) || [];
    
    // Build context for AI
    const contextData = clinicsWithData.map((c: ClinicData) => {
      return `${c.name} (${c.type}): Specialități: ${c.specialties.join(', ')}. Adresă: ${c.address}. Rating: ${c.average_rating}/5. Preț: ${c.price_range}. Timp așteptare: ${c.wait_time} min. Distanță: ${c.distance} km.`;
    }).join('\n');
    
    const systemPrompt = `Tu ești asistentul medical AI al HealthHub. Ajuți cetățenii români să găsească cele mai bune servicii medicale din București.

CONTEXT CLINICI DISPONIBILE:
${contextData}

INSTRUCȚIUNI:
1. Recomandă ÎNTOTDEAUNA clinica cea mai potrivită bazat pe: distanță mică, rating bun, timp așteptare scăzut, preț decent
2. Menționează CONCRET numele clinicii, adresa, timpul de așteptare și rating-ul
3. Explică de ce ai ales acea clinică (ex: "cea mai apropiată cu rating excelent și doar 5 min așteptare")
4. Fii empatic și oferă sfaturi practice
5. Pentru urgențe, recomandă spitale cu urgențe acceptate
6. Dacă întrebarea nu e despre clinici, răspunde scurt și sugerează să cauți o clinică relevantă

Răspunde ÎNTOTDEAUNA în română, profesional dar prietenos.`;
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) throw new Error('LOVABLE_API_KEY not configured');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit atins. Te rog încearcă din nou în câteva momente.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Credite insuficiente. Te rog adaugă credite în workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }
    
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    console.error('Error in medical-ai-assistant:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Eroare necunoscută',
        details: 'Te rog încearcă din nou sau contactează suportul.' 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
