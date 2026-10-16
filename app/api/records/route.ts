// Keep Cloudflare D1 behind the existing Campus API as the shared source of truth,
// and mirror every record into the Google Sheet (see lib/mirror.ts).
import { bulletize, isRealDate } from '@/lib/format';
import { lastMirrorError, mirrorRecords } from '@/lib/mirror';
import { callScript, scriptConfig } from '@/lib/sheet-server';
import { codeOk } from '@/lib/classcode';
import data from '@/lib/data.json';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const origin = 'https://mdmgc30-campus.claudia-camarena-vel.chatgpt.site';
const headers = { 'Cache-Control': 'no-store' };
const TYPES = ['clase', 'examen', 'entrega', 'lectura'];
const text = (v: unknown, n: number) => typeof v === 'string' && v.length <= n;
// Minimal validation for records saved straight to the Sheet (the shared API stays the first choice).
const validRecord = (r: any) => text(r.title, 160) && r.title.trim() && isRealDate(r.date) && TYPES.includes(r.type)
  && data.courses.some(c => c.id === r.course) && ['time', 'team', 'owner', 'case', 'status', 'url', 'notes'].every(k => r[k] === undefined || text(r[k], 2000));
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
    if (ok && Array.isArray(json.records)) await mirrorRecords(json.records, true);
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
  // With the Sheet connected it is the single source of truth: save there first and never depend on the old API's validation.
  if (scriptConfig()) {
    if (!validRecord(record)) return Response.json({ error: 'Revisa los campos del formulario.' }, { status: 400, headers });
    const saved = { ...record, id: typeof record.id === 'string' && record.id ? record.id.slice(0, 80) : crypto.randomUUID() };
    if (await mirrorRecords([saved], false, true)) return Response.json({ record: saved, sheet: true }, { headers });
    return Response.json({ error: 'No se pudo guardar en el Excel. Intenta nuevamente.' + (lastMirrorError ? ' (' + lastMirrorError.slice(0, 160) + ')' : '') }, { status: 502, headers });
  }
  try {
    const { ok, status, json } = await upstreamFetch('POST', JSON.stringify(record));
    if (ok && json.record) { json.sheet = await mirrorRecords([json.record], false, true); return Response.json(json, { status, headers }); }
    return Response.json(json, { status, headers });
  } catch { return unavailable(); }
}

// "Delete" an activity (entrega, evaluación or lectura): the Sheet row is switched off (Activo = FALSE), so it can be recovered there.
export async function DELETE(req: Request) {
  const cfg = scriptConfig();
  if (!cfg) return Response.json({ error: 'La conexión con el Excel no está configurada.' }, { status: 501, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Solicitud no permitida' }, { status: 403, headers });
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: 'Registro inválido' }, { status: 400, headers }); }
  const id = typeof body?.id === 'string' ? body.id.slice(0, 80) : '';
  if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400, headers });
  if (!codeOk(body?.code)) return Response.json({ error: 'Código de clase requerido o incorrecto', needsCode: true }, { status: 401, headers });
  try {
    const { result } = await callScript(cfg, { action: 'deleteRecord', id });
    if (result === 'tipo-no-permitido') return Response.json({ error: 'Las clases y los cumpleaños no se pueden eliminar.' }, { status: 403, headers });
    if (result === 'no-encontrado') return Response.json({ error: 'La actividad todavía no está en el Excel. Recarga e intenta de nuevo.' }, { status: 404, headers });
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ error: 'No se pudo eliminar la actividad. Intenta nuevamente.' }, { status: 502, headers }); }
}
