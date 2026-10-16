// Stores task PDFs in the class Google Drive folder (owned by the Drive account that authorised the app).
// Env: DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN, DRIVE_FOLDER_ID
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const MAX = 4 * 1024 * 1024; // Vercel functions accept bodies up to ~4.5 MB
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

async function accessToken() {
  const { DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN } = process.env;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: DRIVE_CLIENT_ID!, client_secret: DRIVE_CLIENT_SECRET!, refresh_token: DRIVE_REFRESH_TOKEN!, grant_type: 'refresh_token' }),
  });
  const j: any = await r.json();
  if (!r.ok || !j.access_token) throw new Error('auth');
  return j.access_token as string;
}

export async function POST(req: Request) {
  const { DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN, DRIVE_FOLDER_ID } = process.env;
  if (!DRIVE_CLIENT_ID || !DRIVE_CLIENT_SECRET || !DRIVE_REFRESH_TOKEN || !DRIVE_FOLDER_ID) return fail('La subida a Drive todavía no está configurada. Pega el enlace del archivo mientras tanto.', 501);
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Solicitud no permitida', 403);
  if (Number(req.headers.get('content-length') ?? 0) > MAX + 4096) return fail('El PDF supera 4 MB. Súbelo a Drive y pega el enlace.', 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return fail('Formato no permitido', 415); }
  const file = form.get('file');
  if (!(file instanceof File)) return fail('Falta el archivo', 400);
  if (file.size === 0 || file.size > MAX) return fail('El PDF debe pesar menos de 4 MB. Súbelo a Drive y pega el enlace.', 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return fail('Solo se permiten archivos PDF', 415);
  const name = (file.name || 'tarea.pdf').replace(/[^\w .()\-áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120).replace(/(\.pdf)?$/i, '.pdf');
  try {
    const token = await accessToken();
    const boundary = 'campus' + crypto.randomUUID();
    const meta = JSON.stringify({ name, parents: [DRIVE_FOLDER_ID], mimeType: 'application/pdf' });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--`),
    ]);
    const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
      method: 'POST', signal: AbortSignal.timeout(30000), body,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    });
    const created: any = await up.json();
    if (!up.ok || !created.id) throw new Error('upload');
    // Classmates open the PDF from the Campus, so the file is readable by anyone with its link.
    const perm = await fetch(`https://www.googleapis.com/drive/v3/files/${created.id}/permissions?supportsAllDrives=true`, {
      method: 'POST', signal: AbortSignal.timeout(15000), body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!perm.ok) throw new Error('perm');
    return Response.json({ url: created.webViewLink ?? `https://drive.google.com/file/d/${created.id}/view`, name }, { headers });
  } catch {
    return fail('No se pudo guardar el PDF en Drive. Intenta nuevamente o pega un enlace.', 502);
  }
}
