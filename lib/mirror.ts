// Mirrors shared records (D1) into the Sheet's "Calendario y entregas" tab through the Apps Script.
// Only records that are new or changed since the last successful mirror (per server instance) are sent.
import { bulletize } from '@/lib/format';
import { callScript, scriptConfig } from '@/lib/sheet-server';

const fields = ['id', 'title', 'course', 'date', 'type', 'time', 'team', 'owner', 'case', 'status', 'url', 'notes'] as const;
const synced = new Set<string>();
const key = (r: Record<string, unknown>) => JSON.stringify(fields.map(f => r?.[f] ?? ''));

export async function mirrorRecords(records: Record<string, unknown>[]) {
  const cfg = scriptConfig();
  if (!cfg) return true;
  const pending = records.filter(r => r && typeof r.id === 'string' && !synced.has(key(r))).slice(0, 50);
  if (!pending.length) return true;
  try {
    await callScript(cfg, {
      action: 'syncRecords',
      records: pending.map(r => Object.fromEntries(fields.map(f => [f, (f === 'notes' ? bulletize(String(r[f] ?? '')) : String(r[f] ?? '')).slice(0, 2000)]))),
    }, 30000);
    pending.forEach(r => synced.add(key(r)));
    return true;
  } catch {
    return false;
  }
}
