import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Pentru variabilele de mediu
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

// Helper to read env vars and trim accidental surrounding quotes
function env(key) {
  const v = process.env[key];
  if (!v && v !== '') return undefined;
  return String(v).replace(/^\s*['"]|['"]\s*$/g, '').trim();
}

const GEOAPIFY_KEY = env('GEOAPIFY_API_KEY');
const GOOGLE_PLACES_KEY = env('GOOGLE_PLACES_API_KEY');

// It supports external LLM - Ollama.
// ESM compatible __dirname

const KB_DIR = path.join(__dirname, 'kb');
const CLINICS_FILE = path.join(__dirname, 'clinics.json');
const WAIT_TIMES_FILE = path.join(__dirname, 'wait-times.json');

function loadKB() {
  const docs = [];
  if (!fs.existsSync(KB_DIR)) return docs;
  const files = fs.readdirSync(KB_DIR);
  for (const f of files) {
    const full = path.join(KB_DIR, f);
    const text = fs.readFileSync(full, 'utf8');
    docs.push({ id: f, title: f.replace(/\.md$/, ''), text });
  }
  return docs;
}

function loadClinics() {
  if (!fs.existsSync(CLINICS_FILE)) return [];
  try {
    const raw = fs.readFileSync(CLINICS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function loadWaitTimes() {
  if (!fs.existsSync(WAIT_TIMES_FILE)) return [];
  try {
    const raw = fs.readFileSync(WAIT_TIMES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveWaitTimes(waitTimes) {
  try {
    fs.writeFileSync(WAIT_TIMES_FILE, JSON.stringify(waitTimes, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving wait times:', e);
    return false;
  }
}

function getAverageWaitTime(clinicId) {
  const waitTimes = loadWaitTimes();
  const now = Date.now();
  const twoHoursAgo = now - (2 * 60 * 60 * 1000); // 2 hours in milliseconds
  
  // Filter wait times for this clinic from last 2 hours
  const recentTimes = waitTimes.filter(wt => 
    wt.clinicId === clinicId && 
    new Date(wt.timestamp).getTime() > twoHoursAgo
  );
  
  if (recentTimes.length === 0) return null;
  
  const sum = recentTimes.reduce((acc, wt) => acc + wt.waitMinutes, 0);
  return Math.round(sum / recentTimes.length);
}

function getGlobalAverageWaitTime() {
  const waitTimes = loadWaitTimes();
  const now = Date.now();
  const twoHoursAgo = now - (2 * 60 * 60 * 1000);
  
  const recentTimes = waitTimes.filter(wt => 
    new Date(wt.timestamp).getTime() > twoHoursAgo
  );
  
  if (recentTimes.length === 0) return null;
  
  const sum = recentTimes.reduce((acc, wt) => acc + wt.waitMinutes, 0);
  return Math.round(sum / recentTimes.length);
}


// helper: call Google Places Nearby + Details
async function fetchNearbyPlacesFromGoogle(lat, lon, type = 'pharmacy', radius = 3000, openNow = true, maxResults = 10) {
  const key = GOOGLE_PLACES_KEY;
  if (!key) return null;

  const params = new URLSearchParams({
    location: `${lat},${lon}`,
    radius: String(radius),
    type,
    key,
  });
  if (openNow) params.set('opennow', 'true');



  // Partea de locatie si API-ul extras din google maps.
  // am folosit nearbysearch de la google -> returneaza opening_hours/phone/address.
  // Pastreaza cheia API pe server !
  // WorkFlow-ul ar fi: FrontEnd-ul obtine geolocatia -> si face POST la /api/clinics cu lat/lon + type=pharmacy ->
  // acum serverul apeleaza Google Places (sau foloseste kb local), actioneaza si returneaza lista,
  // Lista va fi sortata by distance, only open ones -> Si va afisa 5 cele mai apropiate cu detaliile, link-ul si adresa.
  const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
  console.log('[google] calling nearbysearch, url=', nearbyUrl.slice(0, 200));
  const r = await fetch(nearbyUrl);
  if (!r.ok) throw new Error('Places nearby failed ' + r.status);
  const j = await r.json();
  const places = j.results || [];

  // For each place, call place details to get opening_hours and phone/address
  const detailed = [];
  for (let i = 0; i < Math.min(places.length, maxResults); i++) {
    const p = places[i];
    const detailParams = new URLSearchParams({
      place_id: p.place_id,
      fields: 'name,formatted_address,geometry,opening_hours,formatted_phone_number',
      key
    });
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?${detailParams.toString()}`;
    try {
      const dr = await fetch(detailsUrl);
      const dj = await dr.json();
      const info = dj.result || {};
      detailed.push({
        id: p.place_id,
        name: info.name || p.name,
        address: info.formatted_address || p.vicinity || '',
        latitude: (info.geometry?.location?.lat ?? p.geometry?.location?.lat),
        longitude: (info.geometry?.location?.lng ?? p.geometry?.location?.lng),
        distanceKm: haversine(lat, lon, info.geometry?.location?.lat ?? p.geometry?.location?.lat, info.geometry?.location?.lng ?? p.geometry?.location?.lng),
        openNow: info.opening_hours?.open_now ?? (p.opening_hours?.open_now ?? null),
        opening_hours: info.opening_hours || null,
        phone: info.formatted_phone_number || null,
        mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((info.geometry?.location?.lat ?? p.geometry?.location?.lat) + ',' + (info.geometry?.location?.lng ?? p.geometry?.location?.lng))}`
      });
    } catch (e) {
      // ignore per-place errors but still include basic data
      detailed.push({
        id: p.place_id,
        name: p.name,
        address: p.vicinity || '',
        latitude: p.geometry?.location?.lat,
        longitude: p.geometry?.location?.lng,
        distanceKm: haversine(lat, lon, p.geometry?.location?.lat, p.geometry?.location?.lng),
        openNow: p.opening_hours?.open_now ?? null,
        phone: null,
        mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${p.geometry?.location?.lat},${p.geometry?.location?.lng}`
      });
    }
  }

  // sort by distance and return
  detailed.sort((a, b) => a.distanceKm - b.distanceKm);
  return detailed;
}

// helper: call Geoapify Places API as an alternative to Google Places
// Geoapify nearby -> folosește în fallback sau preferință
async function fetchNearbyPlacesFromGeoapify(lat, lon, type = 'pharmacy', radius = 3000, openNow = true, maxResults = 10) {
  const key = GEOAPIFY_KEY;
  if (!key) return null;

  // Geoapify uses 'filters' and 'bias' or 'limit' params. We'll use 'categories' for pharmacy.
  // Category example: "healthcare.pharmacy"
  const category = type.toLowerCase().includes('pharm') ? 'healthcare.pharmacy' : 'healthcare';
  const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(category)}&filter=circle:${lon},${lat},${radius}&limit=${maxResults}&apiKey=${encodeURIComponent(key)}`;

  console.log('[geoapify] calling places, url=', url.slice(0, 200));
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error('Geoapify nearby failed: ' + r.status + ' ' + text);
  }
  const j = await r.json();
  const features = j.features || [];

  const results = features.map(f => {
    const props = f.properties || {};
    const loc = f.geometry?.coordinates || [null, null];
    const placeLat = loc[1];
    const placeLon = loc[0];
    return {
      id: props.xid || props.place_id || props.osm_id || props.fsq_id || (props.name ? `${props.name}-${props.lon}-${props.lat}` : JSON.stringify(props)),
      name: props.name || props.address?.name || '',
      address: (props.address && (props.address.road || props.address.city || props.address.state)) ? `${props.address.road || ''} ${props.address.house_number || ''}, ${props.address.city || ''}`.trim() : (props.formatted || props.address || ''),
      latitude: placeLat,
      longitude: placeLon,
      distanceKm: typeof placeLat === 'number' ? haversine(lat, lon, placeLat, placeLon) : null,
      openNow: (props.time !== undefined && props.time !== null) ? props.time : (props.opening_hours?.open_now ?? null), // Geoapify may return opening_hours
      opening_hours: props.opening_hours || null,
      phone: props.phone || props.tel || null,
      mapsUrl: `https://www.openstreetmap.org/?mlat=${placeLat}&mlon=${placeLon}#map=18/${placeLat}/${placeLon}`
    };
  });

  results.sort((a, b) => (a.distanceKm || 1e6) - (b.distanceKm || 1e6));
  return results.slice(0, maxResults);
}





const kb = loadKB();
const clinics = loadClinics();

// Helper: call external LLM providers (ollama or huggingface)
async function callExternalLLM(prompt, messages = null, opts = {}) {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
  try {
    if (provider === 'ollama' && process.env.OLLAMA_API_URL) {
      let baseUrl = process.env.OLLAMA_API_URL.trim();
      // Remove trailing slashes and any endpoint paths
      baseUrl = baseUrl.replace(/\/api\/(generate|chat)$/, '').replace(/\/$/, '');
      const model = process.env.OLLAMA_MODEL || "llama3";

      // Determine which endpoint to use (default to chat API)
      const useChatEndpoint = process.env.OLLAMA_USE_CHAT !== 'false';
      const endpoint = useChatEndpoint ? '/api/chat' : '/api/generate';
      const url = `${baseUrl}${endpoint}`;

      console.log('[ollama] Configuration:', {
        baseUrl,
        endpoint,
        model,
        useChatEndpoint,
        hasMessages: messages && Array.isArray(messages)
      });

      let body;
      if (useChatEndpoint && messages && Array.isArray(messages)) {
        // Use chat API with full conversation history
        body = {
          model: model,
          messages: messages,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          }
        };
      } else if (useChatEndpoint) {
        // Use chat API with single prompt (convert to messages format)
        body = {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          }
        };
      } else {
        // Use legacy generate API
        body = {
          model: model,
          prompt: prompt,
          stream: false,
        };
      }

      console.log('[ollama] Calling:', url, 'with model:', model);
      console.log('[ollama] Request body:', JSON.stringify(body).slice(0, 500));
      
      let r;
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (fetchError) {
        console.error('[ollama] Fetch error:', fetchError.message);
        console.error('[ollama] This usually means Ollama is not running or not accessible at:', url);
        throw new Error(`Cannot connect to Ollama at ${url}. Make sure Ollama is running. Error: ${fetchError.message}`);
      }

      if (!r.ok) {
        const errorText = await r.text();
        console.error('[ollama] API error:', r.status, errorText);
        console.error('[ollama] URL was:', url);
        console.error('[ollama] Model was:', model);
        throw new Error(`Ollama API error (${r.status}): ${errorText.slice(0, 200)}`);
      }

      const j = await r.json();

      // Handle different response formats
      if (j?.message?.content) {
        // Chat API response format
        return j.message.content;
      }
      if (j?.response) {
        // Generate API response format
        return j.response;
      }
      if (j?.content) {
        // Alternative chat format
        return j.content;
      }
      if (j?.output) {
        // Array or string output
        return Array.isArray(j.output)
          ? j.output.map(o => o.content || JSON.stringify(o)).join('\n')
          : String(j.output);
      }
      if (typeof j === 'string') {
        return j;
      }

      console.warn('[ollama] Unexpected response format:', JSON.stringify(j).slice(0, 200));
      return JSON.stringify(j);
    }


    if (provider === 'hf' && process.env.HF_API_URL && process.env.HF_API_KEY) {
      const url = process.env.HF_API_URL; // e.g. https://api-inference.huggingface.co/models/your-model
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.HF_API_KEY}` }, body: JSON.stringify({ inputs: prompt }) });
      const j = await r.json();
      // Hugging Face may return [{generated_text: "..."] or {error:..}
      if (Array.isArray(j) && j[0]?.generated_text) return j[0].generated_text;
      if (j?.generated_text) return j.generated_text;
      if (typeof j === 'string') return j;
      return JSON.stringify(j);
    }

    return null;
  } catch (e) {
    console.error('LLM call failed', e);
    return null;
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  function toRad(x) { return x * Math.PI / 180; }
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function emergencyDetected(text) {
  const t = (text || '').toLowerCase();
  const patterns = [
    'pierde', 'inconstien', 'nu respir', 'respira', 'dificult', 'durere toracica', 'sangerare', 'hemor', 'stop', 'coma'
  ];
  return patterns.some(p => t.includes(p));
}

// Extract medication information from LLM response
function extractMedications(response, question) {
  const medications = [];
  const lowerResponse = response.toLowerCase();
  const lowerQuestion = question.toLowerCase();
  
  // Check if question or response mentions medication/pills - be more aggressive
  const isMedicationRequest = lowerQuestion.includes('pastil') || 
                              lowerQuestion.includes('medicament') || 
                              lowerQuestion.includes('recomand') ||
                              lowerQuestion.includes('prescri') ||
                              lowerQuestion.includes('doză') ||
                              lowerQuestion.includes('doza') ||
                              lowerQuestion.includes('pastile') ||
                              lowerQuestion.includes('simptom') ||
                              lowerQuestion.includes('durere') ||
                              // Also check response for medication mentions
                              lowerResponse.includes('medicament') ||
                              lowerResponse.includes('pastil') ||
                              lowerResponse.includes('recomand') ||
                              lowerResponse.includes('poți lua') ||
                              lowerResponse.includes('ia ') ||
                              lowerResponse.includes('luați');
  
  // Always try to extract if response contains medication patterns, even if question doesn't explicitly ask
  // This allows detection when LLM suggests medications naturally

  // First, try to extract from JSON format [MEDICATIONS]...[/MEDICATIONS]
  const jsonMatch = response.match(/\[MEDICATIONS\]([\s\S]*?)\[\/MEDICATIONS\]/);
  if (jsonMatch) {
    try {
      const jsonData = JSON.parse(jsonMatch[1].trim());
      if (jsonData.medications && Array.isArray(jsonData.medications)) {
        for (const med of jsonData.medications) {
          if (med.medication_name && med.dosage && med.frequency) {
            medications.push({
              medication_name: med.medication_name.trim(),
              dosage: med.dosage.trim(),
              frequency: med.frequency.trim()
            });
          }
        }
        if (medications.length > 0) {
          console.log('[extract] Found medications from JSON:', medications);
          return medications;
        }
      }
    } catch (e) {
      console.warn('[extract] Failed to parse medications JSON:', e.message);
    }
  }

  // Improved medication patterns - more flexible and comprehensive
  const medicationPatterns = [
    // Pattern: "Poți lua Paracetamol 500mg, de 3x/zi" or "poți lua Omeprazol 20 mg, de 1 ori pe zi"
    /(?:poți lua|recomand|sugerez|ia|luați|poți să iei)\s+([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+)?)\s+(\d+)\s*(?:mg|ml|UI)?\s*(?:,|\s+de|\s+la)\s*(\d+\s*ori\s*pe\s*zi|\d+x\/zi|dimineața|seara|înainte de mese|după mese)/gi,
    // Pattern: "Paracetamol 500mg, 3x/zi" or "Omeprazol 20 mg, de 1 ori pe zi"
    /([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+)?)\s+(\d+)\s*(?:mg|ml|UI)\s*(?:,|\s+de|\s+la)?\s*(\d+\s*ori\s*pe\s*zi|\d+x\/zi|dimineața|seara)/gi,
    // Pattern: "500mg Paracetamol, 3x/zi"
    /(\d+)\s*(?:mg|ml|UI)\s+([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+)?)\s*(?:,|\s+de|\s+la)\s*(\d+\s*ori\s*pe\s*zi|\d+x\/zi|dimineața|seara)/gi,
    // Pattern: "Paracetamol - 500mg - 3 ori pe zi"
    /([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+)?)\s*[-–]\s*(\d+)\s*(?:mg|ml|UI)\s*[-–]\s*(\d+\s*ori\s*pe\s*zi|\d+x\/zi|dimineața|seara)/gi,
    // Pattern: "medicament X doză Y frecvență Z" (more flexible)
    /([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+)?)\s+(?:cu\s+)?(?:doză|doza)\s+(?:de\s+)?(\d+)\s*(?:mg|ml|UI)\s*(?:,|\s+)?(?:de\s+)?(\d+\s*ori\s*pe\s*zi|\d+x\/zi|dimineața|seara)/gi
  ];

  for (const pattern of medicationPatterns) {
    const matches = [...response.matchAll(pattern)];
    for (const match of matches) {
      let name = match[1] || match[2] || '';
      let dosage = match[2] || match[1] || '';
      const frequency = match[3] || '';
      
      // Swap if dosage comes first (dosage is numeric)
      if (dosage.match(/^\d+$/) && name.match(/^\d+$/)) {
        [name, dosage] = [dosage, name];
      }
      
      // Ensure dosage has unit if it's just a number
      if (dosage && dosage.match(/^\d+$/) && !dosage.includes('mg') && !dosage.includes('ml') && !dosage.includes('UI')) {
        // Try to find unit in the original match
        const fullMatch = match[0];
        if (fullMatch.includes('mg')) dosage = dosage + 'mg';
        else if (fullMatch.includes('ml')) dosage = dosage + 'ml';
        else if (fullMatch.includes('UI')) dosage = dosage + 'UI';
        else dosage = dosage + 'mg'; // default
      }
      
      // Normalize frequency
      let normalizedFreq = frequency.trim();
      if (normalizedFreq.includes('1 ori pe zi') || normalizedFreq.includes('o dată pe zi')) {
        normalizedFreq = '1x/zi';
      } else if (normalizedFreq.includes('2 ori pe zi')) {
        normalizedFreq = '2x/zi';
      } else if (normalizedFreq.includes('3 ori pe zi')) {
        normalizedFreq = '3x/zi';
      }
      
      if (name && dosage && frequency && !name.match(/^\d+$/)) {
        medications.push({
          medication_name: name.trim(),
          dosage: dosage.trim(),
          frequency: normalizedFreq
        });
      }
    }
  }

  // Fallback: try to extract from common medication mentions with better patterns
  const commonMeds = ['paracetamol', 'ibuprofen', 'aspirin', 'aspirină', 'vitamina d', 'vitamina c', 'calciu', 'nurofen'];
  for (const med of commonMeds) {
    if (lowerResponse.includes(med)) {
      // Try multiple patterns for each medication
      const patterns = [
        new RegExp(`(${med}[^\\s]*)\\s+(\\d+[^\\s]*(?:mg|ml|UI)?)\\s*(?:,|de|la|-)\\s*([^\\.,\\n]+)`, 'i'),
        new RegExp(`(\\d+[^\\s]*(?:mg|ml|UI)?)\\s+(${med}[^\\s]*)\\s*(?:,|de|la|-)\\s*([^\\.,\\n]+)`, 'i')
      ];
      
      for (const pattern of patterns) {
        const medMatch = response.match(pattern);
        if (medMatch) {
          const name = medMatch[1] || medMatch[2];
          const dosage = medMatch[2] || medMatch[1];
          const frequency = medMatch[3];
          
          if (name && dosage && frequency) {
            medications.push({
              medication_name: name.trim(),
              dosage: dosage.trim(),
              frequency: frequency.trim()
            });
            break; // Found one, move to next medication
          }
        }
      }
    }
  }

  // Remove duplicates
  const unique = [];
  const seen = new Set();
  for (const med of medications) {
    const key = `${med.medication_name}-${med.dosage}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(med);
    }
  }

  return unique;
}

// Extract appointment information from LLM response
function extractAppointments(response, question) {
  const appointments = [];
  const lowerResponse = response.toLowerCase();
  const lowerQuestion = question.toLowerCase();
  
  // Check if question or response is about appointments - expanded detection, be more aggressive
  const isAppointmentRequest = lowerQuestion.includes('programare') || 
                               lowerQuestion.includes('programez') ||
                               lowerQuestion.includes('consultație') ||
                               lowerQuestion.includes('consultatie') ||
                               lowerQuestion.includes('apointment') ||
                               lowerQuestion.includes('rezervare') ||
                               lowerQuestion.includes('program') ||
                               lowerQuestion.includes('rezerv') ||
                               lowerQuestion.includes('dermatolog') ||
                               lowerQuestion.includes('cardiolog') ||
                               lowerQuestion.includes('pediatru') ||
                               lowerQuestion.includes('medic') ||
                               // Also check response for appointment keywords - be more aggressive
                               lowerResponse.includes('programat') ||
                               lowerResponse.includes('programare') ||
                               lowerResponse.includes('consultație') ||
                               lowerResponse.includes('consultatie') ||
                               lowerResponse.includes('dr.') ||
                               lowerResponse.includes('doctor') ||
                               lowerResponse.includes('clinica') ||
                               lowerResponse.includes('spital');
  
  // Always try to extract if response mentions appointment-related keywords, even if question doesn't explicitly ask
  // This allows detection when LLM suggests appointments naturally

  // First, try to extract from JSON format [APPOINTMENT]...[/APPOINTMENT]
  const jsonMatch = response.match(/\[APPOINTMENT\]([\s\S]*?)\[\/APPOINTMENT\]/);
  if (jsonMatch) {
    try {
      const jsonData = JSON.parse(jsonMatch[1].trim());
      if (jsonData.appointment) {
        const apt = jsonData.appointment;
        if (apt.doctor_name || apt.clinic_name) {
          appointments.push({
            doctor_name: apt.doctor_name || 'Nespecificat',
            specialty: apt.specialty || 'Medicină generală',
            clinic_name: apt.clinic_name || 'Nespecificat',
            appointment_date: apt.appointment_date || null,
            appointment_time: apt.appointment_time || null
          });
          console.log('[extract] Found appointment from JSON:', appointments[0]);
          return appointments;
        }
      }
    } catch (e) {
      console.warn('[extract] Failed to parse appointment JSON:', e.message);
    }
  }

  // Extract doctor name (Dr. Name or Name) - improved patterns
  let doctorName = null;
  const doctorPatterns = [
    /(?:dr\.?|doctor|medic|d\.?r\.?)\s+([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+)?)/i,
    /([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+)?)\s+(?:este|va fi|va fi la)/i
  ];
  
  for (const pattern of doctorPatterns) {
    const match = response.match(pattern);
    if (match) {
      doctorName = match[1] ? `Dr. ${match[1]}` : null;
      break;
    }
  }

  // Extract specialty - improved list with more variations
  const specialties = [
    { patterns: ['medicină generală', 'medicina generala', 'medicina generală', 'medic general'], name: 'Medicină generală' },
    { patterns: ['pediatrie', 'pediatru', 'pediatric'], name: 'Pediatrie' },
    { patterns: ['cardiologie', 'cardiolog'], name: 'Cardiologie' },
    { patterns: ['dermatologie', 'dermatolog'], name: 'Dermatologie' },
    { patterns: ['neurologie', 'neurolog'], name: 'Neurologie' },
    { patterns: ['stomatologie', 'stomatolog', 'dentist'], name: 'Stomatologie' },
    { patterns: ['oftalmologie', 'oftalmolog'], name: 'Oftalmologie' },
    { patterns: ['ginecologie', 'ginecolog'], name: 'Ginecologie' },
    { patterns: ['urologie', 'urolog'], name: 'Urologie' },
    { patterns: ['endocrinologie', 'endocrinolog'], name: 'Endocrinologie' },
    { patterns: ['pneumologie', 'pneumolog'], name: 'Pneumologie' },
    { patterns: ['gastroenterologie', 'gastroenterolog'], name: 'Gastroenterologie' }
  ];
  let specialty = null;
  for (const spec of specialties) {
    for (const pattern of spec.patterns) {
      if (lowerResponse.includes(pattern.toLowerCase()) || lowerQuestion.includes(pattern.toLowerCase())) {
        specialty = spec.name;
        break;
      }
    }
    if (specialty) break;
  }

  // Extract clinic name - improved patterns
  let clinicName = null;
  const clinicPatterns = [
    /(?:la|clinica|spitalul|farmacia|centrul)\s+([A-ZĂÂÎȘȚ][a-zA-ZĂÂÎȘȚăâîșț\s]+?)(?:\.|,|$|\n)/i,
    /([A-ZĂÂÎȘȚ][a-zA-ZĂÂÎȘȚăâîșț\s]+?)\s+(?:clinic|spital|farmacie|centru)/i
  ];
  
  for (const pattern of clinicPatterns) {
    const match = response.match(pattern);
    if (match) {
      clinicName = match[1] ? match[1].trim() : null;
      if (clinicName && clinicName.length < 50) break; // Reasonable clinic name length
    }
  }

  // Extract date - improved patterns with month names
  let appointmentDate = null;
  const months = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 
                  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const datePatterns = [
    // "10 noiembrie" or "pe 10 noiembrie"
    /(?:pe\s+)?(\d{1,2})\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)/i,
    // "mâine", "poimâine", day names
    /(?:mâine|poimâine|luni|marți|miercuri|joi|vineri|sâmbătă|duminică)/i,
    // "10/11/2024" or "10-11-2024"
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    // "pe 10/11"
    /pe\s+(\d{1,2})[\/\-](\d{1,2})/
  ];
  
  for (const pattern of datePatterns) {
    const match = response.match(pattern);
    if (match) {
      appointmentDate = match[0];
      // If it's a month name, format it nicely
      if (match[2] && months.includes(match[2].toLowerCase())) {
        appointmentDate = `${match[1]} ${match[2]}`;
      }
      break;
    }
  }
  
  // Also check question for date if not found in response
  if (!appointmentDate) {
    for (const pattern of datePatterns) {
      const match = question.match(pattern);
      if (match) {
        appointmentDate = match[0];
        if (match[2] && months.includes(match[2].toLowerCase())) {
          appointmentDate = `${match[1]} ${match[2]}`;
        }
        break;
      }
    }
  }

  // Extract time - improved patterns
  let appointmentTime = null;
  const timePatterns = [
    /(?:la|ora|pe la)\s+(\d{1,2}):(\d{2})/i,
    /(\d{1,2}):(\d{2})/,
    /(\d{1,2})\s*(?:dimineața|seara|am|pm|AM|PM)/i
  ];
  
  for (const pattern of timePatterns) {
    const match = response.match(pattern);
    if (match) {
      appointmentTime = match[0];
      break;
    }
  }

  // Create appointment if we have at least specialty OR date OR doctor/clinic
  // This allows detection even with partial information
  if (specialty || appointmentDate || doctorName || clinicName) {
    appointments.push({
      doctor_name: doctorName || 'Nespecificat',
      specialty: specialty || 'Medicină generală',
      clinic_name: clinicName || 'Nespecificat',
      appointment_date: appointmentDate,
      appointment_time: appointmentTime
    });
    console.log('[extract] Appointment extracted:', appointments[0]);
  }

  return appointments;
}

// Function calling definitions (simulated for Ollama, can be extended for native support)
const FUNCTION_DEFINITIONS = {
  extract_medications: {
    name: "extract_medications",
    description: "Extrage informații despre medicamente recomandate din conversație",
    parameters: {
      type: "object",
      properties: {
        medications: {
          type: "array",
          description: "Lista de medicamente detectate",
          items: {
            type: "object",
            properties: {
              medication_name: {
                type: "string",
                description: "Numele complet al medicamentului (ex: Omeprazol, Paracetamol)"
              },
              dosage: {
                type: "string",
                description: "Doza medicamentului cu unitate (ex: 20mg, 500mg, 1000 UI)"
              },
              frequency: {
                type: "string",
                description: "Frecvența administrării (ex: 1x/zi, 3x/zi, dimineața, seara)"
              }
            },
            required: ["medication_name", "dosage", "frequency"]
          }
        }
      },
      required: ["medications"]
    }
  },
  extract_appointment: {
    name: "extract_appointment",
    description: "Extrage informații despre programări medicale din conversație",
    parameters: {
      type: "object",
      properties: {
        appointment: {
          type: "object",
          description: "Detaliile programării",
          properties: {
            doctor_name: {
              type: "string",
              description: "Numele doctorului (ex: Dr. Popescu Maria sau Nespecificat)"
            },
            specialty: {
              type: "string",
              description: "Specialitatea medicală (ex: dermatologie, pediatrie, medicină generală)"
            },
            clinic_name: {
              type: "string",
              description: "Numele clinicii sau Nespecificat"
            },
            appointment_date: {
              type: "string",
              description: "Data programării (ex: 10 noiembrie, mâine, 15/11/2024) sau null"
            },
            appointment_time: {
              type: "string",
              description: "Ora programării (ex: 10:00, dimineața) sau null"
            }
          },
          required: ["doctor_name", "specialty", "clinic_name"]
        }
      },
      required: ["appointment"]
    }
  }
};

// Use LLM with function calling approach (simulated for Ollama)
// This is now the PRIMARY extraction method - always tries to extract using AI
async function extractWithFunctionCalling(response, question, conversationHistory = []) {
  // Always try to extract - don't filter by keywords, let AI decide
  // This makes detection more accurate and handles edge cases better

  // Build comprehensive extraction prompt that analyzes the entire conversation
  const fullConversation = [
    ...conversationHistory,
    { role: 'user', content: question },
    { role: 'assistant', content: response }
  ];

  const extractionPrompt = `Ești un expert în extragerea de informații medicale structurate din conversații. Analizează ATENT întreaga conversație și extrage toate medicamentele și programările menționate.

INSTRUCȚIUNI CRITICE:
1. Analizează ÎNTREAGA conversație, nu doar ultimul mesaj
2. Caută medicamente menționate explicit SAU implicit (ex: "poți lua X", "recomand Y", "ia Z")
3. Caută programări menționate explicit SAU implicit (ex: "programează-te la", "consultație cu", "mergi la doctor")
4. Extrage TOATE detaliile disponibile pentru fiecare medicament/programare
5. Dacă nu găsești informații clare, returnează array-uri goale

FORMAT RĂSPUNS (DOAR JSON, fără text suplimentar):
{
  "medications": [
    {
      "medication_name": "Nume complet medicament (ex: Paracetamol, Omeprazol)",
      "dosage": "Doza cu unitate (ex: 500mg, 20mg, 1000 UI)",
      "frequency": "Frecvență (ex: 3x/zi, 1x/zi, dimineața, seara)"
    }
  ],
  "appointments": [
    {
      "doctor_name": "Nume doctor (ex: Dr. Popescu Maria sau Nespecificat)",
      "specialty": "Specialitate (ex: pediatrie, medicină generală, dermatologie)",
      "clinic_name": "Nume clinică (ex: Clinica MedLife sau Nespecificat)",
      "appointment_date": "Dată (ex: mâine, 15/11/2024, luni) sau null",
      "appointment_time": "Oră (ex: 10:00, dimineața) sau null"
    }
  ]
}

CONVERSAȚIA COMPLETĂ:
${fullConversation.map((m, idx) => `${idx + 1}. ${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}

Analizează conversația de mai sus și extrage toate medicamentele și programările. Returnează DOAR JSON valid, fără explicații sau text suplimentar.`;

  try {
    // Use a more structured system prompt for better extraction
    const systemPrompt = `Ești un expert în extragerea de informații medicale structurate. 
Returnezi DOAR JSON valid în formatul specificat, fără explicații, fără text suplimentar, fără markdown.
Dacă nu găsești medicamente sau programări, returnează array-uri goale: {"medications": [], "appointments": []}`;

    const extractionResponse = await callExternalLLM(extractionPrompt, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: extractionPrompt }
    ]);

    if (extractionResponse) {
      // Try multiple methods to extract JSON
      let jsonText = extractionResponse.trim();
      
      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Try to find JSON object
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // Process extracted data - support multiple formats
          let medications = [];
          let appointments = [];
          
          // Format 1: Direct medications/appointments arrays
          if (parsed.medications && Array.isArray(parsed.medications)) {
            medications = parsed.medications.filter(m => 
              m && m.medication_name && m.dosage && m.frequency
            );
          }
          
          if (parsed.appointments && Array.isArray(parsed.appointments)) {
            appointments = parsed.appointments.filter(apt => 
              apt && (apt.doctor_name || apt.clinic_name || apt.specialty)
            );
          }
          
          // Format 2: Single appointment object
          if (parsed.appointment && !Array.isArray(parsed.appointment)) {
            const apt = parsed.appointment;
            if (apt.doctor_name || apt.clinic_name || apt.specialty) {
              appointments.push(apt);
            }
          }
          
          // Format 3: Function calls format (legacy support)
          if (parsed.function_calls && Array.isArray(parsed.function_calls)) {
            for (const call of parsed.function_calls) {
              if (call.function === 'extract_medications' && call.arguments?.medications) {
                const meds = call.arguments.medications.filter(m => 
                  m && m.medication_name && m.dosage && m.frequency
                );
                medications = [...medications, ...meds];
              }
              if (call.function === 'extract_appointment' && call.arguments?.appointment) {
                const apt = call.arguments.appointment;
                if (apt.doctor_name || apt.clinic_name || apt.specialty) {
                  appointments.push(apt);
                }
              }
            }
          }
          
          // Clean and validate extracted data
          medications = medications.map(med => ({
            medication_name: String(med.medication_name || '').trim(),
            dosage: String(med.dosage || '').trim(),
            frequency: String(med.frequency || '').trim()
          })).filter(med => med.medication_name && med.dosage && med.frequency);
          
          appointments = appointments.map(apt => ({
            doctor_name: String(apt.doctor_name || 'Nespecificat').trim(),
            specialty: String(apt.specialty || 'Medicină generală').trim(),
            clinic_name: String(apt.clinic_name || 'Nespecificat').trim(),
            appointment_date: apt.appointment_date ? String(apt.appointment_date).trim() : null,
            appointment_time: apt.appointment_time ? String(apt.appointment_time).trim() : null
          }));
          
          const result = { medications, appointments };
          console.log('[extract-ai] AI extraction successful:', {
            medications_count: medications.length,
            appointments_count: appointments.length,
            medications: medications,
            appointments: appointments
          });
          return result;
        } catch (parseError) {
          console.warn('[extract-ai] Failed to parse JSON:', parseError.message);
          console.warn('[extract-ai] Raw response:', extractionResponse.slice(0, 500));
        }
      } else {
        console.warn('[extract-ai] No JSON found in response');
        console.warn('[extract-ai] Raw response:', extractionResponse.slice(0, 500));
      }
    }
  } catch (e) {
    console.warn('[extract-ai] AI extraction failed:', e.message);
    console.warn('[extract-ai] Error stack:', e.stack);
  }

  return { medications: [], appointments: [] };
}

// Legacy LLM extraction (kept for fallback)
async function extractWithLLM(response, question) {
  return extractWithFunctionCalling(response, question);
}

function isClinicRequest(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const clinicWords = ['farmaci', 'farmacie', 'farmacii', 'clinic', 'clinici', 'apropiat', 'aproape', 'deschis', 'deschise', 'orar', 'unde gasesc', 'programeaz'];
  return clinicWords.some(w => t.includes(w));
}

function simpleRetrieve(query, topK = 3) {
  if (!query) return [];
  const q = query.toLowerCase().split(/\W+/).filter(Boolean);
  const scores = kb.map(doc => {
    const words = doc.text.toLowerCase();
    let score = 0;
    for (const w of q) {
      if (words.includes(w)) score += 1;
    }
    return { doc, score };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores.filter(s => s.score > 0).slice(0, topK).map(s => ({ id: s.doc.id, title: s.doc.title, text: s.doc.text }));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && req.url === '/api/ai') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const lastMessage = Array.isArray(payload.messages) ? payload.messages[payload.messages.length - 1] : null;
        const question = lastMessage?.content || payload.question || '';

        // Emergency detection removed - let the LLM handle it naturally
        // if (emergencyDetected(question)) {
        //   const answer = 'Semnal de urgență detectat — sună la 112 sau du-te imediat la cea mai apropiată unitate de urgență.';
        //   return res.end(JSON.stringify({ answer, emergency: true, sources: [] }));
        // }

        const retrieved = simpleRetrieve(question, 6);

        // If the question is about nearby clinics/pharmacies and user provided location, call clinics lookup
        const userLocation = payload.userLocation || payload.location || null;
        if (isClinicRequest(question) && userLocation && userLocation.latitude && userLocation.longitude) {
          try {
            const lat = parseFloat(userLocation.latitude);
            const lon = parseFloat(userLocation.longitude);
            const type = payload.type || 'pharmacy';
            const openNow = payload.openNow === true || payload.openNow === 'true';
            const radius = parseInt(payload.radius || process.env.PLACES_RADIUS_METERS || '3000', 10);
            const maxResults = Math.min(parseInt(payload.maxResults || '5', 10), 20);

            let clinicsResult = null;
            let provider = 'local';


            // If Google didn't return results, try Geoapify (if configured)
            if (!clinicsResult && process.env.GEOAPIFY_API_KEY) {
              try {
                const results = await fetchNearbyPlacesFromGeoapify(lat, lon, type, radius, openNow, maxResults);
                if (results && results.length > 0) {
                  clinicsResult = results.slice(0, maxResults);
                  provider = 'geoapify';
                }
              } catch (e) {
                console.error('Geoapify Places error (ai clinic flow)', e);
              }
            }

            if (!clinicsResult) {
              // fallback to local dataset; support common synonyms (ro/en)
              const normalizedType = (type || '').toLowerCase();
              let synonyms = [normalizedType];
              if (normalizedType.includes('pharm')) synonyms = ['pharmacy', 'farmacie'];
              if (normalizedType.includes('clinic')) synonyms = ['clinic', 'clinica', 'clinici'];

              clinicsResult = clinics
                .filter(c => {
                  if (!normalizedType) return true;
                  const ctype = (c.type || '').toLowerCase();
                  return synonyms.some(s => ctype.includes(s));
                })
                .map(c => ({ ...c, distanceKm: haversine(lat, lon, c.latitude, c.longitude) }))
                .sort((a, b) => a.distanceKm - b.distanceKm)
                .slice(0, maxResults);
              provider = 'local';
            }

            // Build a friendly answer text
            if (!clinicsResult || clinicsResult.length === 0) {
              console.log('[places-ai] provider=', provider, 'count=', (clinicsResult && clinicsResult.length) || 0);
              const answer = 'Nu am găsit farmacii deschise în apropiere.';
              return res.end(JSON.stringify({ answer, emergency: false, clinics: [], provider }));
            }

            let answer = `Am găsit ${clinicsResult.length} farmacii în apropiere:\n\n`;
            clinicsResult.forEach((c, i) => {
              const dist = typeof c.distanceKm === 'number' ? `${c.distanceKm.toFixed(1)} km` : '';
              const open = c.openNow === true ? 'Deschis' : (c.openNow === false ? 'Închis' : 'Program necunoscut');
              const closes = c.opening_hours?.periods ? '' : '';
              answer += `${i + 1}. ${c.name} — ${c.address || ''} — ${dist} — ${open}`;
              if (c.phone) answer += ` — Tel: ${c.phone}`;
              if (c.mapsUrl) answer += ` — Harta: ${c.mapsUrl}`;
              answer += '\n';
            });

            console.log('[places-ai] provider=', provider, 'count=', clinicsResult.length);
            return res.end(JSON.stringify({ answer, emergency: false, clinics: clinicsResult, provider }));
          } catch (e) {
            console.error('ai clinics flow error', e);
            // continue to LLM behaviour below
          }
        }

        // Prepare a context for LLM: include short snippets and ids
        const contextParts = retrieved.map(r => `Source: ${r.title}\n${r.text.trim().slice(0, 500)}`);
        const context = contextParts.join('\n\n');


        // Load system prompt
        function loadSystemPrompt() {
          const promptFile = process.env.SYSTEM_PROMPT_FILE
            ? path.resolve(__dirname, process.env.SYSTEM_PROMPT_FILE)
            : null;
          if (!promptFile || !fs.existsSync(promptFile)) {
            // Improved default system prompt - more specific and focused
            return `Ești HealthHub AI - un asistent medical civic, empatic și informat pentru cetățenii români.

ROLUL TĂU:
- Ajuți utilizatorii să găsească clinici, farmacii și servicii medicale în București
- Oferi informații generale despre sănătate, prevenție și tratamente comune
- Recomanzi clinici bazat pe distanță, rating, timp de așteptare și preț
- Nu pui diagnostice medicale, dar oferi sfaturi generale și orientare

INSTRUCȚIUNI IMPORTANTE:
1. Răspunde ÎNTOTDEAUNA în limba română, cu ton cald și respectuos
2. Fii concis și relevant - răspunde direct la întrebare
3. CONTEXTUL CONVERSAȚIEI:
   - Citește ATENT întreaga conversație anterioară
   - Dacă utilizatorul răspunde "da", "nu", "ok", etc., referă-te la mesajul anterior
   - Păstrează contextul - dacă tocmai ai programat o consultație, și utilizatorul spune "da", înțelege că confirmă programarea
   - Fii natural și conversațional - răspunde ca un asistent real care își amintește ce s-a discutat
4. Dacă utilizatorul întreabă despre clinici/farmacii:
   - Recomandă clinica cea mai potrivită (distanță mică, rating bun, timp așteptare scăzut)
   - Menționează concret numele, adresa, timpul de așteptare și rating-ul
   - Explică de ce ai ales acea clinică
4. Dacă utilizatorul întreabă despre medicamente/pastile:
   - La FINALUL răspunsului, adaugă un JSON structurat cu medicamentele recomandate:
     [MEDICATIONS]
     {
       "medications": [
         {
           "medication_name": "Nume Medicament",
           "dosage": "doză (ex: 20mg, 500mg, 1000 UI)",
           "frequency": "frecvență (ex: 1x/zi, 3x/zi, dimineața, seara)"
         }
       ]
     }
     [/MEDICATIONS]
   - Exemplu: Dacă recomanzi "Poți lua Omeprazol 20 mg, de 1 ori pe zi", adaugă la final:
     [MEDICATIONS]
     {
       "medications": [
         {
           "medication_name": "Omeprazol",
           "dosage": "20mg",
           "frequency": "1x/zi"
         }
       ]
     }
     [/MEDICATIONS]
5. Dacă utilizatorul vrea să programeze o consultație:
   - La FINALUL răspunsului, adaugă un JSON structurat cu programarea:
     [APPOINTMENT]
     {
       "appointment": {
         "doctor_name": "Dr. Nume Prenume",
         "specialty": "specialitate (ex: medicină generală, pediatrie)",
         "clinic_name": "Nume Clinică",
         "appointment_date": "dată (ex: mâine, 15/11/2024, luni)",
         "appointment_time": "oră (ex: 10:00, dimineața)"
       }
     }
     [/APPOINTMENT]
   - Exemplu: Dacă programezi consultație, adaugă la final:
     [APPOINTMENT]
     {
       "appointment": {
         "doctor_name": "Dr. Popescu Maria",
         "specialty": "pediatrie",
         "clinic_name": "Clinica MedLife",
         "appointment_date": "mâine",
         "appointment_time": "10:00"
       }
     }
     [/APPOINTMENT]
6. Dacă utilizatorul are simptome:
   - Sugerează măsuri generale (hidratare, odihnă, medicamente uzuale)
   - Indică când ar trebui să consulte un medic
   - Pentru urgențe, scrie clar: "URGENȚĂ: sună la 112"
7. Dacă întrebarea nu e despre sănătate/clinici:
   - Răspunde scurt și sugerează să cauți o clinică relevantă
   - Menționează că ești specializat în asistență medicală
8. Folosește contextul furnizat pentru a da răspunsuri precise
9. Dacă nu știi răspunsul, spune sincer și sugerează consultarea unui medic specialist

TON: Profesional dar prietenos, empatic, clar și pe înțelesul oricui.`;
          }
          return fs.readFileSync(promptFile, "utf8");
        }

        const systemPrompt = loadSystemPrompt();
        
        // Build messages array for chat API
        const messagesForLLM = [];
        
        // Add system prompt
        if (systemPrompt) {
          messagesForLLM.push({ role: 'system', content: systemPrompt });
        }
        
        // Add conversation history (filter out previous system messages)
        // Keep full conversation history for context awareness
        if (Array.isArray(payload.messages)) {
          const conversationHistory = payload.messages
            .filter(m => m.role !== 'system')
            .slice(0, -1); // Exclude the current message (last one)
          messagesForLLM.push(...conversationHistory);
          
          // Log conversation context for debugging
          if (conversationHistory.length > 0) {
            console.log('[ai] Conversation history]:', conversationHistory.length, 'previous messages');
            console.log('[ai] Last user message:', conversationHistory[conversationHistory.length - 1]?.content?.slice(0, 100));
          }
        }
        
        // Add current question with context
        const questionWithContext = context 
          ? `Context:\n${context}\n\nÎntrebare:\n${question}`
          : question;
        messagesForLLM.push({ role: 'user', content: questionWithContext });

        // Legacy prompt format for generate API fallback
        const prompt = `${systemPrompt}\n\nContext:\n${context}\n\nÎntrebare:\n${question}`;

        let answer = null;

        // Try external LLM if configured (pass both prompt and messages)
        const llmResp = await callExternalLLM(prompt, messagesForLLM);
        if (llmResp) {
          answer = String(llmResp).trim();
          console.log('[ai] LLM response length:', answer.length);
        } else {
          console.log('[ai] No LLM response, using fallback');
        }

        // If no external LLM configured or failed, fallback to local behavior
        if (!answer) {
          if (retrieved.length > 0) {
            answer = 'Am găsit următoarele informații utile din ghidurile noastre:\n\n';
            for (const r of retrieved) {
              answer += `- ${r.title}: ${r.text.trim().slice(0, 200)}...\n`;
            }
            answer += '\nDacă ai nevoie, pot să-ți arăt clinici din apropiere sau să te ajut să programezi o consultație.';
          } else {
            // fallback simple rules
            if (question.toLowerCase().includes('paracetamol')) {
              answer = 'Pentru adulți, doza uzuală este 500-1000 mg la 4-6 ore, maxim 3-4 administrări/zi (maxim 3000 mg/zi). Verifică prospectul și consultă un medic pentru situații speciale.';
            } else {
              answer = 'Îmi pare rău, nu am găsit informații precise în ghidurile locale. Îți recomand să consulți un medic specialist sau să îmi oferi mai multe detalii.';
            }
          }
        }

        // Extract structured data from LLM response using AI-first approach
        // PRIMARY METHOD: Use AI/LLM for extraction (most accurate)
        // FALLBACK: Use regex patterns if AI fails
        
        let extractedData = { medications: [], appointments: [] };
        
        // Get conversation history for better context
        const conversationHistory = Array.isArray(payload.messages) 
          ? payload.messages.filter(m => m.role !== 'system').slice(0, -1)
          : [];
        
        // PRIMARY: Always try AI extraction first (most accurate)
        console.log('[extract] Using AI extraction as primary method...');
        const aiExtracted = await extractWithFunctionCalling(answer, question, conversationHistory);
        
        if (aiExtracted.medications.length > 0 || aiExtracted.appointments.length > 0) {
          // AI extraction succeeded - use it
          extractedData = aiExtracted;
          console.log('[extract] AI extraction successful - using AI results');
        } else {
          // AI extraction returned nothing - try regex as fallback
          console.log('[extract] AI extraction returned no results, trying regex fallback...');
          const regexExtracted = {
            medications: extractMedications(answer, question),
            appointments: extractAppointments(answer, question)
          };
          
          if (regexExtracted.medications.length > 0 || regexExtracted.appointments.length > 0) {
            extractedData = regexExtracted;
            console.log('[extract] Regex fallback found results');
          } else {
            console.log('[extract] No medications or appointments detected by either method');
          }
        }

        // Log extraction results for debugging
        console.log('[extract] Results:', {
          medications_count: extractedData.medications.length,
          appointments_count: extractedData.appointments.length,
          medications: extractedData.medications,
          appointments: extractedData.appointments
        });

        // Return response with extracted data
        res.end(JSON.stringify({ 
          answer, 
          emergency: false, 
          sources: retrieved.map(r => ({ id: r.id, title: r.title })),
          extractedData
        }));
      } catch (e) {
        console.error('ai handler error', e);
        console.error('Error stack:', e.stack);
        const errorMessage = e.message || 'Unknown error';
        res.writeHead(500);
        res.end(JSON.stringify({ 
          error: 'Server error',
          message: errorMessage,
          details: process.env.NODE_ENV === 'development' ? e.stack : undefined
        }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/clinics') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const lat = parseFloat(payload.latitude);
        const lon = parseFloat(payload.longitude);
        const type = payload.type || 'pharmacy';
        const openNow = payload.openNow === true || payload.openNow === 'true';
        const radius = parseInt(payload.radius || process.env.PLACES_RADIUS_METERS || '3000', 10);
        const maxResults = Math.min(parseInt(payload.maxResults || '5', 10), 20);

        console.log('[clinics] request from', req.socket.remoteAddress, {
          latitude: payload.latitude,
          longitude: payload.longitude,
          type, openNow, maxResults
        });

        // dacă lipsește locația, returnează fallback local
        if (isNaN(lat) || isNaN(lon)) {
          return res.end(JSON.stringify({
            clinics: clinics.slice(0, Math.min(maxResults, clinics.length)),
            provider: 'local',
            note: 'no_lat_lon'
          }));
        }

        // ---- încercăm Geoapify (gratuit & online) ----
        let results = null;
        let provider = 'none';

        if (process.env.GEOAPIFY_API_KEY) {
          try {
            const geo = await fetchNearbyPlacesFromGeoapify(lat, lon, type, radius, openNow, maxResults);
            if (geo && geo.length > 0) {
              results = geo;
              provider = 'geoapify';
              console.log(`[clinics] Geoapify returned ${geo.length} results`);
            }
          } catch (err) {
            console.error('Geoapify Places API error:', err);
          }
        }

        // ---- dacă Geoapify nu a returnat nimic, fallback pe dataset local ----
        if (!results || results.length === 0) {
          console.log('[clinics] using local fallback dataset');
          const scored = clinics
            .filter(c => !type || (c.type && c.type.toLowerCase().includes(type.toLowerCase())))
            .map(c => ({
              ...c,
              distanceKm: haversine(lat, lon, c.latitude, c.longitude)
            }));

          let filtered = scored;
          if (openNow) {
            filtered = scored.filter(c =>
              c.opening_hours?.open_now === true ||
              c.open_now === true ||
              c.available === true
            );
          }

          filtered.sort((a, b) => a.distanceKm - b.distanceKm);
          results = filtered.slice(0, maxResults);
          provider = 'local';
        }

        // ---- răspuns final ----
        res.end(JSON.stringify({
          clinics: results,
          provider,
          count: results?.length || 0
        }));

      } catch (e) {
        console.error('clinics handler error', e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'invalid payload' }));
      }
    });
    return;
  }

  // POST /api/wait-times - Report wait time for a clinic
  if (req.method === 'POST' && req.url === '/api/wait-times') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { clinicId, waitMinutes, userId } = payload;

        if (!clinicId || typeof waitMinutes !== 'number') {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'clinicId and waitMinutes are required' }));
        }

        const waitTimes = loadWaitTimes();
        waitTimes.push({
          clinicId,
          waitMinutes,
          userId: userId || 'anonymous',
          timestamp: new Date().toISOString()
        });

        if (saveWaitTimes(waitTimes)) {
          console.log(`[wait-times] New report for clinic ${clinicId}: ${waitMinutes} min`);
          res.end(JSON.stringify({ 
            success: true, 
            averageWaitTime: getAverageWaitTime(clinicId)
          }));
        } else {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Failed to save wait time' }));
        }
      } catch (e) {
        console.error('wait-times POST error', e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'invalid payload' }));
      }
    });
    return;
  }

  // GET /api/wait-times?clinicId=xxx - Get average wait time for a clinic
  if (req.method === 'GET' && req.url.startsWith('/api/wait-times')) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const clinicId = url.searchParams.get('clinicId');

      if (clinicId) {
        const avgWaitTime = getAverageWaitTime(clinicId);
        res.end(JSON.stringify({ 
          clinicId, 
          averageWaitTime: avgWaitTime !== null ? avgWaitTime : 15 // default 15 min if no data
        }));
      } else {
        // Return global average
        const globalAvg = getGlobalAverageWaitTime();
        res.end(JSON.stringify({ 
          globalAverageWaitTime: globalAvg !== null ? globalAvg : 15
        }));
      }
    } catch (e) {
      console.error('wait-times GET error', e);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'server error' }));
    }
    return;
  }

  // GET /api/status - Server status and configuration
  if (req.method === 'GET' && req.url === '/api/status') {
    const status = {
      status: 'running',
      port: process.env.PORT || '3001',
      llmProvider: (process.env.LLM_PROVIDER || '').toLowerCase() || 'none',
      ollamaConfigured: !!(process.env.OLLAMA_API_URL),
      ollamaUrl: process.env.OLLAMA_API_URL || null,
      ollamaModel: process.env.OLLAMA_MODEL || 'llama3',
      timestamp: new Date().toISOString()
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(status, null, 2));
    return;
  }

  // GET /api/test-ollama - Test Ollama connection
  if (req.method === 'GET' && req.url === '/api/test-ollama') {
    res.setHeader('Content-Type', 'application/json');
    (async () => {
      try {
        if (!process.env.OLLAMA_API_URL) {
          return res.end(JSON.stringify({ 
            error: 'Ollama not configured',
            message: 'OLLAMA_API_URL not set in environment'
          }));
        }

        const baseUrl = process.env.OLLAMA_API_URL.trim().replace(/\/api\/(generate|chat)$/, '').replace(/\/$/, '');
        const model = process.env.OLLAMA_MODEL || 'llama3';
        const testUrl = `${baseUrl}/api/chat`;

        console.log('[test-ollama] Testing connection to:', testUrl);

        const testResponse = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'Say "test" if you can read this.' }],
            stream: false
          })
        });

        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          return res.end(JSON.stringify({
            error: 'Ollama connection failed',
            status: testResponse.status,
            message: errorText,
            url: testUrl
          }));
        }

        const testData = await testResponse.json();
        res.end(JSON.stringify({
          success: true,
          message: 'Ollama is working!',
          response: testData?.message?.content || testData?.response || 'Response received',
          url: testUrl,
          model: model
        }));

      } catch (e) {
        console.error('[test-ollama] Error:', e);
        res.end(JSON.stringify({
          error: 'Test failed',
          message: e.message,
          stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        }));
      }
    })();
    return;
  }

  // default: show simple landing
  if (req.method === 'GET' && req.url === '/') {
    res.end('HealthHub AI local server');
    return;
  }

  res.writeHead(404); res.end('Not found');
});

// Startup cu fallback automat daca portul este ocupat.
function startServer(port, attempts = 0) {
  const maxAttempts = 5;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
      const nextPort = port + 1;
      console.warn(`Port ${port} este ocupat. Incerc pe portul ${nextPort}...`);
      setTimeout(() => startServer(nextPort, attempts + 1), 500);
    } else {
      console.error('Server failed to start:', err);
      process.exit(1);
    }
  });
}

const initialPort = parseInt(process.env.PORT || '3001', 10);
startServer(initialPort);
