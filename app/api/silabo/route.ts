// Reads an uploaded syllabus PDF with Claude and applies the result to the course and its activities in the Sheet.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
import data from '@/lib/data.json';
import { codeOk } from '@/lib/classcode';
import { callScript, scriptConfig } from '@/lib/sheet-server';
import { activitiesToRecords, extractSyllabus } from '@/lib/syllabus';
const headers = { 'Cache-Control': 'no-store' };
const MAX = 4 * 1024 * 1024;
const fail = (error: string, status: number, extra: object = {}) => Response.json({ error, ...extra }, { status, headers });

// Each analysis costs API credits: allow a handful per hour per server instance.
const calls: number[] = [];
const throttled = () => { const now = Date.now(); while (calls.length && now - calls[0] > 3600_000) calls.shift(); if (calls.length >= 8) return true; calls.push(now); return false; };

export async function POST(req: Request) {
  const cfg = scriptConfig();
  if (!cfg) return fail('La conexión con el Excel no está configurada.', 501);
  if (!process.env.ANTHROPIC_API_KEY) return fail('Falta ANTHROPIC_API_KEY para leer el sílabo automáticamente.', 501, { needsKey: true });
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Solicitud no permitida', 403);
  if (Number(req.headers.get('content-length') ?? 0) > MAX + 4096) return fail('El PDF supera 4 MB.', 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return fail('Formato no permitido', 415); }
  const file = form.get('file'), course = String(form.get('course') ?? '');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX) return fail('El PDF debe pesar menos de 4 MB.', 413);
  if (!data.courses.some(c => c.id === course)) return fail('Curso no válido', 400);
  if (!codeOk(form.get('code'))) return fail('Código de clase requerido o incorrecto', 401, { needsCode: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return fail('Solo se permiten archivos PDF', 415);
  if (throttled()) return fail('Demasiados sílabos analizados en poco tiempo. Intenta en un rato.', 429);

  try {
    const info = await extractSyllabus(bytes);
    const { activities, ...courseInfo } = info;
    const result = await callScript(cfg, { action: 'applySyllabus', course, info: courseInfo, events: activitiesToRecords(course, activities) }, 40000);
    return Response.json({ ok: true, activities: activities.length, sessions: info.sessions.length, cases: info.cases.length, deactivated: result.deactivated ?? 0 }, { headers });
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    const known: Record<string, string> = {
      'ia-fallo': 'No se pudo leer el sílabo con la IA. Revisa ANTHROPIC_API_KEY y el saldo.',
      'ia-sin-datos': 'La IA no devolvió datos del sílabo. Intenta de nuevo.',
      'El sílabo no tiene información legible': 'El PDF no parece un sílabo legible (¿es una imagen escaneada?).',
      'Curso no encontrado en la pestaña Cursos': 'El curso no existe en la pestaña Cursos del Excel.',
    };
    return fail(known[m] ?? 'No se pudo actualizar el curso con el sílabo.', 502);
  }
}
