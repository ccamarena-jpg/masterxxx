// Stores PDFs in the class Google Drive folder through the Apps Script web app (files owned by the Sheet's owner).
// kind=silabo + course=<ID>: the script also writes the Drive link into the course's "Sílabo" cell.
// Optional env SYLLABUS_UPLOAD_CODE: when set, replacing a syllabus requires that class code.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import data from '@/lib/data.json';
import { callScript, scriptConfig } from '@/lib/sheet-server';
import { codeOk } from '@/lib/classcode';
const headers = { 'Cache-Control': 'no-store' };
const MAX = 4 * 1024 * 1024; // Vercel functions accept bodies up to ~4.5 MB
const fail = (error: string, status: number, extra: object = {}) => Response.json({ error, ...extra }, { status, headers });

export async function POST(req: Request) {
  const cfg = scriptConfig();
  if (!cfg) return fail('La subida a Drive todavía no está configurada. Pega el enlace del archivo mientras tanto.', 501);
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Solicitud no permitida', 403);
  if (Number(req.headers.get('content-length') ?? 0) > MAX + 4096) return fail('El PDF supera 4 MB. Súbelo a Drive y pega el enlace.', 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return fail('Formato no permitido', 415); }
  const file = form.get('file');
  if (!(file instanceof File)) return fail('Falta el archivo', 400);
  if (file.size === 0 || file.size > MAX) return fail('El PDF debe pesar menos de 4 MB. Súbelo a Drive y pega el enlace.', 413);

  const silabo = form.get('kind') === 'silabo';
  const course = String(form.get('course') ?? '');
  if (silabo) {
    if (!data.courses.some(c => c.id === course)) return fail('Curso no válido', 400);
    if (!codeOk(form.get('code'))) return fail('Código de clase requerido o incorrecto', 401, { needsCode: true });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return fail('Solo se permiten archivos PDF', 415);
  const name = (file.name || 'tarea.pdf').replace(/[^\w .()\-áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120).replace(/(\.pdf)?$/i, '.pdf');
  try {
    const j = await callScript(cfg, { action: 'upload', name, data: bytes.toString('base64'), ...(silabo ? { kind: 'silabo', course } : {}) }, 40000);
    if (typeof j.url !== 'string' || !/^https:\/\/(drive|docs)\.google\.com\//.test(j.url)) throw new Error('url');
    return Response.json({ url: j.url, name: j.name ?? name }, { headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    const known: Record<string, string> = {
      'Falta FOLDER_ID': 'Falta configurar la carpeta de Drive (propiedad FOLDER_ID del script).',
      'Curso no encontrado en la pestaña Cursos': 'El curso no existe en la pestaña Cursos del Excel.',
      'No autorizado': 'El token de la web no coincide con el del script.',
      'Error en el script': 'El script de Drive falló: revisa que tenga permiso de Drive y que FOLDER_ID sea correcto (Apps Script → Ejecuciones).',
    };
    return fail(known[msg] ?? 'No se pudo guardar el PDF en Drive. Intenta nuevamente o pega un enlace.', 502);
  }
}
