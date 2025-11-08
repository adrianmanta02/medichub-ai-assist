import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Pentru variabilele de mediu
import dotenv from "dotenv";

// It supports external LLM - Ollama.
// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KB_DIR = path.join(__dirname, 'kb');
const CLINICS_FILE = path.join(__dirname, 'clinics.json');

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
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const lat = parseFloat(payload.latitude);
        const lon = parseFloat(payload.longitude);
        if (isNaN(lat) || isNaN(lon)) {
          return res.end(JSON.stringify({ clinics: clinics.slice(0, 5) }));
        }
        const scored = clinics.map(c => ({ ...c, distanceKm: haversine(lat, lon, c.latitude, c.longitude) }));
        scored.sort((a, b) => a.distanceKm - b.distanceKm);
        res.end(JSON.stringify({ clinics: scored.slice(0, 10) }));
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: 'invalid payload' }));
      }
    });
    return;
  }

  // default: show simple landing
  if (req.method === 'GET' && req.url === '/') {
    res.end('HealthHub AI local server');
    return;
  }

  res.writeHead(404); res.end('Not found');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
