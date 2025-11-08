// Centralized API fetch with automatic localhost port fallback and env override
// Usage: apiFetch('/api/wait-times', { method: 'GET' })

let chosenBase: string | null = null;

function getCandidates(): string[] {
  const fromEnv = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (fromEnv && typeof fromEnv === 'string') return [fromEnv.replace(/\/$/, '')];
  // Try common localhost ports used by the server (it has auto-fallback if 3001 is busy)
  return [3001, 3002, 3003, 3004, 3005].map(p => `http://localhost:${p}`);
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const p = path.startsWith('/') ? path : `/${path}`;
  const bases = chosenBase ? [chosenBase] : getCandidates();
  let lastErr: any = null;

  for (const base of bases) {
    try {
      const res = await fetch(`${base}${p}`, init);
      // If we get any HTTP response, accept it and remember the base
      chosenBase = base;
      return res;
    } catch (e: any) {
      lastErr = e;
      // try next base
    }
  }

  // If we had a chosen base and it failed (server went away), clear and retry once with full list
  if (chosenBase) {
    const freshBases = getCandidates();
    for (const base of freshBases) {
      try {
        const res = await fetch(`${base}${p}`, init);
        chosenBase = base;
        return res;
      } catch (e: any) {
        lastErr = e;
      }
    }
  }

  throw lastErr || new Error('API fetch failed');
}

export function getApiBase(): string | null {
  return chosenBase;
}
