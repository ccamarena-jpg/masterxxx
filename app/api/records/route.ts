// Keep Cloudflare D1 behind the existing Campus API as the shared source of truth,
// and mirror every record into the Google Sheet (see lib/mirror.ts).
import { bulletize } from '@/lib/format';
import { mirrorRecords } from '@/lib/mirror';
import { scriptConfig } from '@/lib/sheet-server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const origin = 'https://mdmgc30-campus.claudia-camarena-vel.chatgpt.site';
const headers = { 'Cache-Control': 'no-store' };
const unavailable = () => Response.json({ error: 'No se pudo conectar con el registro compartido. Intenta nuevamente.' }, { status: 503, headers });

async function upstreamFetch(method: 'GET' | 'POST', body?: string) {
  const upstream = await fetch(`${origin}/api/records`, {
    method, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json', Origin: origin } : {}) },
    ...(body === undefined ? {} : { body }),
  });
  return { ok: upstream.ok, status: upstream.status, json: (await upstream.json()) as any };
}

export async function GET() {
  try {
    const { ok, status, json } = await upstreamFetch('GET');
    if (ok && Array.isArray(json.records)) await mirrorRecords(json.records);
    return Response.json(json, { status, headers });
  } catch { return unavailable(); }
}

export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Solicitud no permitida' }, { status: 403, headers });
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return Response.json({ error: 'Formato no permitido' }, { status: 415, headers });
  const body = await req.text();
  if (Buffer.byteLength(body) > 30000) return Response.json({ error: 'El registro es demasiado grande' }, { status: 413, headers });
  let record: any;
  try { record = JSON.parse(body); } catch { return Response.json({ error: 'Registro inválido' }, { status: 400, headers }); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) return Response.json({ error: 'Registro inválido' }, { status: 400, headers });
  if (typeof record.notes === 'string') record.notes = bulletize(record.notes);
  try {
    const { ok, status, json } = await upstreamFetch('POST', JSON.stringify(record));
    if (ok && json.record) { json.sheet = await mirrorRecords([json.record]); return Response.json(json, { status, headers }); }
    // The shared records API may not know newer types (e.g. "lectura"): keep them in the Sheet only.
    if (!ok && status === 400 && record.type === 'lectura' && scriptConfig()) {
      const saved = { ...record, id: typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID() };
      if (await mirrorRecords([saved])) return Response.json({ record: saved, sheet: true }, { headers });
    }
    return Response.json(json, { status, headers });
  } catch { return unavailable(); }
}
