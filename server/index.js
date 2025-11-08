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
async function callExternalLLM(prompt, opts = {}) {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
  try {
    if (provider === 'ollama' && process.env.OLLAMA_API_URL) {
      const url = process.env.OLLAMA_API_URL; // e.g. http://localhost:11434/api/generate
      const model = process.env.OLLAMA_MODEL || "llama3";

      const body = url.includes("/api/chat")
        ? { model, messages: [{ role: 'user', content: prompt }] }
        : { model, prompt, stream: false };

      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const j = await r.json();

      if (j?.response) return j.response;
      if (j?.message?.content) return j.message.content;
      if (j?.output) return Array.isArray(j.output)
        ? j.output.map(o => o.content || JSON.stringify(o)).join('\n')
        : String(j.output);
      return typeof j === 'string' ? j : JSON.stringify(j);
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

        if (emergencyDetected(question)) {
          const answer = 'Semnal de urgență detectat — sună la 112 sau du-te imediat la cea mai apropiată unitate de urgență.';
          return res.end(JSON.stringify({ answer, emergency: true, sources: [] }));
        }

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


        // VEZI DIN NOU PARTEA ASTA !!
        dotenv.config();

        // înlocuiește complet secțiunea în care definești `systemPrompt` + `prompt`
        function loadSystemPrompt() {
          const promptFile = process.env.SYSTEM_PROMPT_FILE
            ? path.resolve(__dirname, process.env.SYSTEM_PROMPT_FILE)
            : null;
          if (!promptFile || !fs.existsSync(promptFile)) return "";
          return fs.readFileSync(promptFile, "utf8");
        }

        const systemPrompt = loadSystemPrompt();
        const prompt = `${systemPrompt}\n\nContext:\n${context}\n\nÎntrebare:\n${question}`;


        let answer = null;

        // Try external LLM if configured
        const llmResp = await callExternalLLM(prompt);
        if (llmResp) {
          answer = String(llmResp).trim();
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

        res.end(JSON.stringify({ answer, emergency: false, sources: retrieved.map(r => ({ id: r.id, title: r.title })) }));
      } catch (e) {
        console.error('ai handler error', e);
        res.writeHead(500); res.end(JSON.stringify({ error: 'invalid payload' }));
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
