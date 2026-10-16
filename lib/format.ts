// Turns free text ("1. a 2. b", numbered lines, dashes) into clean "• item" lines. Idempotent.
const MARK = /^(?:[•\-*]|\d{1,2}[.)])\s+/;

export function bulletize(text: string | undefined): string {
  let t = (text ?? '').replace(/\r/g, '').trim();
  if (!t) return '';
  // Numbered list written inline: "Construir: 1. a 2. b 3. c"
  const inline = !t.includes('\n') && /(?:^|\s)1[.)]\s[\s\S]*\s2[.)]\s/.test(t);
  if (inline) t = t.replace(/\s+(?=\d{1,2}[.)]\s)/g, '\n');
  let lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  // Last numbered item that swallowed several sentences becomes one bullet per sentence.
  if (inline && lines.length > 1 && MARK.test(lines[lines.length - 1])) {
    const last = lines.pop()!.replace(MARK, '');
    lines.push(...last.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).map((s, i) => (i === 0 ? '1. ' : '- ') + s));
  }
  const hasMarker = lines.some(l => MARK.test(l));
  if (!hasMarker) return lines.join('\n');
  const out: string[] = [];
  let started = false;
  for (const l of lines) {
    if (MARK.test(l)) { started = true; out.push('• ' + l.replace(MARK, '')); }
    else if (!started && /:$/.test(l)) out.push(l); // intro line such as "Construir las dos matrices:"
    else { started = true; out.push('• ' + l); }
  }
  return out.join('\n');
}

// Real calendar date in YYYY-MM-DD (rejects 2026-13-40 and also 2026-02-31, which Date would roll over).
export function isRealDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
