import { bulletize } from '@/lib/format';
import type { SheetEvent } from '@/lib/sheet';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line: string) => {
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
};
const ymd = (d: string) => d.replaceAll('-', '');
const nextDay = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replaceAll('-', ''); };
const hm = (h: string, m: string) => h.padStart(2, '0') + m + '00';

export function timeRange(time: string) {
  const range = time.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (range) return { start: hm(range[1], range[2]), end: hm(range[3], range[4]) };
  const one = time.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
  if (one) return { start: hm(one[1], one[2]), end: hm(String(Math.min(Number(one[1]) + 1, 23)), one[2]) };
  return null;
}

const kind: Record<string, string> = { clase: 'Clase', examen: 'Evaluación', entrega: 'Entrega' };

export function buildICS(events: SheetEvent[], name = 'Campus MDMGC30') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MDMGC30 Campus//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(name), 'X-WR-TIMEZONE:America/Lima', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    'BEGIN:VTIMEZONE', 'TZID:America/Lima', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0500', 'TZNAME:-05', 'END:STANDARD', 'END:VTIMEZONE',
  ];
  for (const e of events) {
    if (e.type === 'cumple') continue;
    const t = timeRange(e.time ?? '');
    const desc = [kind[e.type] ?? e.type, e.course && 'Curso: ' + e.course, e.time && !t ? e.time : '', bulletize(e.notes), e.url].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${e.id.replace(/[^\w.-]/g, '_')}@mdmgc30-campus`, 'DTSTAMP:' + stamp, 'SUMMARY:' + esc((e.course ? `[${e.course}] ` : '') + e.title));
    if (t) lines.push(`DTSTART;TZID=America/Lima:${ymd(e.date)}T${t.start}`, `DTEND;TZID=America/Lima:${ymd(e.date)}T${t.end}`);
    else lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`);
    lines.push('DESCRIPTION:' + esc(desc), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), t ? 'TRIGGER:-PT30M' : 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
