// Keep Cloudflare D1 behind the existing Campus API as the shared source of truth.
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
    return Response.json(await upstream.json(), { status: upstream.status, headers });
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
  try { JSON.parse(body); } catch { return Response.json({ error: 'Registro inválido' }, { status: 400, headers }); }
  return forward('POST', body);
}
