// Subscribable / downloadable calendar (.ics). Birthdays are never included.
import data from '@/lib/data.json';
import { buildICS } from '@/lib/ics';
import { loadSheetData } from '@/lib/sheet-server';
import type { SheetEvent } from '@/lib/sheet';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const origin = 'https://mdmgc30-campus.claudia-camarena-vel.chatgpt.site';

async function sharedRecords(): Promise<SheetEvent[]> {
  try {
    const r = await fetch(`${origin}/api/records`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    const j: any = await r.json();
    return Array.isArray(j.records) ? j.records : [];
  } catch { return []; }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, curso = q.get('curso'), id = q.get('id');
  const sheet = await loadSheetData();
  const records = await sharedRecords();
  // With the Sheet connected it wins over the shared records (edit or hide rows there); otherwise records override the base data.
  const base = (sheet.events ?? data.events) as SheetEvent[];
  const baseIds = new Set(base.map(x => x.id));
  const hidden = new Set(sheet.hidden);
  const extra = sheet.events ? records.filter(x => !baseIds.has(x.id) && !hidden.has(x.id)) : records;
  const overridden = new Set(extra.map(x => x.id));
  let events = [...base.filter(x => !overridden.has(x.id)), ...extra];
  if (curso) events = events.filter(e => e.course === curso);
  if (id) events = events.filter(e => e.id === id);
  events = events.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
  if (id && !events.length) return new Response('No encontrado', { status: 404 });
  const name = curso ? `Campus MDMGC30 · ${curso}` : 'Campus MDMGC30';
  return new Response(buildICS(events, name), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `${id ? 'attachment' : 'inline'}; filename="mdmgc30${curso ? '-' + curso.replace(/\W/g, '') : ''}.ics"`,
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  });
}
