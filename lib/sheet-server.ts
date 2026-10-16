// Server-side access to the Campus Google Sheet. Sheet URLs live in Vercel env vars, never in the repo.
// CALENDAR_SHEET_CSV_URL  -> tab "Calendario y entregas", published as CSV
// COURSES_SHEET_CSV_URL   -> tab "Cursos" (Docente, Correo, Teléfono, Sílabo), published as CSV (optional)
// BIRTHDAYS_SHEET_CSV_URL -> tab "Cumpleaños", published as CSV (optional)
import { mapBirthdays, mapCourses, mapEvents } from '@/lib/sheet';

const allowed = (u?: string) => { try { const x = new URL(u ?? ''); return x.protocol === 'https:' && x.hostname === 'docs.google.com'; } catch { return false; } };

async function fetchCSV(url: string) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Accept: 'text/csv' } });
  if (!/(^|\.)(google\.com|googleusercontent\.com)$/.test(new URL(r.url).hostname)) throw new Error('Destino no permitido');
  if (!r.ok || !(r.headers.get('content-type') ?? '').includes('csv')) throw new Error('Sheet no accesible');
  return r.text();
}

export async function loadSheetData() {
  const calendar = process.env.CALENDAR_SHEET_CSV_URL, courses = process.env.COURSES_SHEET_CSV_URL, birthdays = process.env.BIRTHDAYS_SHEET_CSV_URL;
  if (!allowed(calendar)) return { configured: false as const, events: null, courses: [], birthdays: [] };
  const [ev, co, bd] = await Promise.allSettled([
    fetchCSV(calendar!),
    allowed(courses) ? fetchCSV(courses!) : Promise.resolve(''),
    allowed(birthdays) ? fetchCSV(birthdays!) : Promise.resolve(''),
  ]);
  if (ev.status === 'rejected') return { configured: true as const, error: 'No se pudo leer el Google Sheet del calendario.', events: null, courses: [], birthdays: [] };
  return {
    configured: true as const,
    events: mapEvents(ev.value),
    courses: co.status === 'fulfilled' ? mapCourses(co.value) : [],
    birthdays: bd.status === 'fulfilled' ? mapBirthdays(bd.value) : [],
  };
}
