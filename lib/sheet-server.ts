// Server-side access to the Campus Google Sheet through an Apps Script web app bound to the Sheet.
// The Sheet itself stays private; only the script (running as its owner) reads it. See docs/apps-script/Code.gs.
//   APPS_SCRIPT_URL   -> optional override of the web app URL (a default is set below)
//   APPS_SCRIPT_TOKEN -> shared secret, same value as the script property TOKEN
// Fallback (not recommended, needs the tab published): CALENDAR_SHEET_CSV_URL, COURSES_SHEET_CSV_URL, BIRTHDAYS_SHEET_CSV_URL.
import { inactiveEventIds, mapBirthdays, mapCourses, mapEvents } from '@/lib/sheet';

const empty = { events: null, courses: [], birthdays: [], hidden: [] as string[] };
const googleHost = /(^|\.)(google\.com|googleusercontent\.com)$/;

// The URL alone gives no access: the script rejects any call without the secret token (APPS_SCRIPT_TOKEN, Vercel env only).
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz-fUBtXjv0efbek6QdZYH1rmaXYoMwmKVCYyyrWOQqMaqghAhxyYl8cxeOH4uK1y7c/exec';

export const scriptConfig = () => {
  const url = process.env.APPS_SCRIPT_URL || DEFAULT_SCRIPT_URL, token = process.env.APPS_SCRIPT_TOKEN;
  try { if (url && token && new URL(url).protocol === 'https:' && new URL(url).hostname === 'script.google.com') return { url, token }; } catch { /* invalid URL */ }
  return null;
};

// Calls the web app. Apps Script answers with a redirect to script.googleusercontent.com, which fetch follows.
export async function callScript(cfg: { url: string; token: string }, payload: object, timeout = 20000) {
  const r = await fetch(cfg.url, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(timeout),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, token: cfg.token }),
  });
  if (!googleHost.test(new URL(r.url).hostname)) throw new Error('Destino no permitido');
  const j: any = await r.json();
  if (!r.ok || j.error) { if (j?.detail) console.error('Apps Script:', j.detail); throw new Error(j?.error || 'Apps Script no accesible'); }
  return j;
}

const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };
const toCSV = (rows: unknown[][] = []) => rows.map(r => r.map(cell).join(',')).join('\n');

async function fromScript(cfg: { url: string; token: string }) {
  const j = await callScript(cfg, { action: 'read' });
  return { configured: true as const, events: mapEvents(toCSV(j.calendar)), hidden: inactiveEventIds(toCSV(j.calendar)), courses: mapCourses(toCSV(j.courses)), birthdays: mapBirthdays(toCSV(j.birthdays)) };
}

// ---- Published-CSV fallback ----
const allowed = (u?: string) => { try { const x = new URL(u ?? ''); return x.protocol === 'https:' && x.hostname === 'docs.google.com'; } catch { return false; } };

async function fetchCSV(url: string) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Accept: 'text/csv' } });
  if (!googleHost.test(new URL(r.url).hostname)) throw new Error('Destino no permitido');
  if (!r.ok || !(r.headers.get('content-type') ?? '').includes('csv')) throw new Error('Sheet no accesible');
  return r.text();
}

async function fromPublishedCSV(calendar: string) {
  const courses = process.env.COURSES_SHEET_CSV_URL, birthdays = process.env.BIRTHDAYS_SHEET_CSV_URL;
  const [ev, co, bd] = await Promise.allSettled([
    fetchCSV(calendar),
    allowed(courses) ? fetchCSV(courses!) : Promise.resolve(''),
    allowed(birthdays) ? fetchCSV(birthdays!) : Promise.resolve(''),
  ]);
  if (ev.status === 'rejected') throw new Error('Sheet no accesible');
  return {
    configured: true as const,
    events: mapEvents(ev.value),
    hidden: inactiveEventIds(ev.value),
    courses: co.status === 'fulfilled' ? mapCourses(co.value) : [],
    birthdays: bd.status === 'fulfilled' ? mapBirthdays(bd.value) : [],
  };
}

export async function loadSheetData() {
  const failed = { configured: true as const, error: 'No se pudo leer el Google Sheet del calendario.', ...empty };
  const cfg = scriptConfig(), csv = process.env.CALENDAR_SHEET_CSV_URL;
  try {
    if (cfg) return await fromScript(cfg);
    if (allowed(csv)) return await fromPublishedCSV(csv!);
  } catch { return failed; }
  return { configured: false as const, ...empty };
}
