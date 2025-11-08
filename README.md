# MediChub AI Assist
# Team B2

MediChub AI Assist is a local-first prototype that combines a lightweight retrieval-based medical knowledge base with a small Node helper service for location-aware clinic and pharmacy discovery. The goal is to provide concrete, sourced medical answers and actionable nearby clinic/pharmacy suggestions while keeping sensible defaults that do not require remote LLM keys.

This repository is a developer-focused demo built with a React + TypeScript frontend (Vite) and a minimal Node.js ESM backend. It runs well locally (WSL or Linux recommended) and supports optional external services (Geoapify, Google Places) and optional LLM backends (Ollama, Hugging Face) when keys/URLs are provided.

## High level

- Local-first: short local knowledge base (markdown files) is used to retrieve context and ground answers.
- Actionable: when the user asks, the assistant can return nearby clinics or pharmacies (address, open status, phone, map link).
- Safe defaults: external LLMs and places APIs are optional and used only when the corresponding env vars are set.
- Simple RAG: a top-K snippet retrieval approach inserts local context into prompts for optional LLM calls.

## What is included

- Frontend: React + TypeScript (Vite) with the chat assistant UI at `src/components/dashboard/AIAssistant.tsx`.
- Backend: lightweight Node server at `server/index.js` exposing two main endpoints:
	- `POST /api/ai` — send question +/- `userLocation` to receive an answer; when intent is to find clinics the endpoint can return a `clinics` array.
	- `POST /api/clinics` — send `latitude`/`longitude` and options (type, openNow, radius, maxResults) and receive a provider and a list of places. Order of providers: Google (if configured) -> Geoapify (if configured) -> local fallback.
- Local KB: `server/kb/*.md` — small markdown files used for retrieval.
- Local clinics fallback: `server/clinics.json` used when external places APIs are not configured.
- Optional connectors: Ollama and Hugging Face wrappers (configured via env).

## Environment variables (server/.env)

Put sensitive keys in `server/.env` (do not commit):

Required for a basic local run:

- `PORT=3001`
- `PLACES_RADIUS_METERS=3000`

Optional (enable external services):

- `GEOAPIFY_API_KEY=pk.your_geoapify_key_here`
- `GOOGLE_PLACES_API_KEY=your_google_places_key_here`
- `LLM_PROVIDER=ollama`  # or `hf` for Hugging Face
- `OLLAMA_API_URL=http://localhost:11434/api/generate`
- `OLLAMA_MODEL=llama3`
- `HF_API_URL=https://api-inference.huggingface.co/models/your-model`
- `HF_API_KEY=xxxx`

Notes:
- Do not wrap secret values in quotes in `.env` (write `GEOAPIFY_API_KEY=pk.xxxx`).
- The server will try Google first (if `GOOGLE_PLACES_API_KEY` is set), then Geoapify, then the local dataset.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the Node helper server:

```bash
# from repo root
pkill -f "node server/index.js" || true
node server/index.js
```

3. Start the frontend dev server:

```bash
npm run dev
```

4. Open the app in your browser (Vite will print the URL).

## Example: test clinics lookup

Use curl to test the clinics endpoint directly (replace coords):

```bash
curl -sS http://localhost:3001/api/clinics \
	-H "Content-Type: application/json" \
	-d '{"latitude":44.4469,"longitude":26.0976,"type":"pharmacy","openNow":true,"maxResults":5}' \
	| jq .
```

Look for these in the response:
- `provider`: `google`, `geoapify`, or `local`.
- `clinics`: array of results (may be empty). If the server relaxed the `openNow` filter it adds `note: "fallback_openNow_disabled"`.

## Troubleshooting

- Error `EADDRINUSE` when starting server: another process is using port 3001. Find and kill it, or start the server with `PORT=3002 node server/index.js`.
- Empty `clinics`: check request body in DevTools. Ensure `latitude` and `longitude` are present and numeric. Inspect the server response `provider` and any `note` field to find whether a fallback occurred.
- Geoapify/Google errors: check server console — provider errors are logged with response text for debugging.

## Privacy & security

- Keep API keys out of source control.
- The demo uses browser geolocation — avoid sending PHI or other sensitive data to third-party APIs in production without review.
