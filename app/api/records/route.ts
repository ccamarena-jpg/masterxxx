// Keep Cloudflare D1 behind the existing Campus API as the shared source of truth,
// and mirror every record into the Google Sheet (see lib/mirror.ts).
import { bulletize } from '@/lib/format';
import { mirrorRecords } from '@/lib/mirror';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const origin = 'https://mdmgc30-campus.claudia-camarena-vel.chatgpt.site';
const headers = { 'Cache-Control': 'no-store' };
async function forward(method: 'GET' | 'POST', body?: string) {
  try {
    const upstream = await fetch(`${origin}/api/records`, {
      method, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json', Origin: origin } : {}) },
      ...(body === undefined ? {} : { body }),
    });
    const json: any = await upstream.json();
    if (upstream.ok) {
      if (method === 'GET' && Array.isArray(json.records)) await mirrorRecords(json.records);
      if (method === 'POST' && json.record) json.sheet = await mirrorRecords([json.record]);
    }
    return Response.json(json, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: 'No se pudo conectar con el registro compartido. Intenta nuevamente.' }, { status: 503, headers });
  }
}
export async function GET() { return forward('GET'); }
export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Solicitud no permitida' }, { status: 403, headers });
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return Response.json({ error: 'Formato no permitido' }, { status: 415, headers });
  const body = await req.text();
  if (Buffer.byteLength(body) > 30000) return Response.json({ error: 'El registro es demasiado grande' }, { status: 413, headers });
  let record: any;
  try { record = JSON.parse(body); } catch { return Response.json({ error: 'Registro inválido' }, { status: 400, headers }); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) return Response.json({ error: 'Registro inválido' }, { status: 400, headers });
  if (typeof record.notes === 'string') record.notes = bulletize(record.notes);
  return forward('POST', JSON.stringify(record));
}
