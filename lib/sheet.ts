// Minimal CSV parsing and row mapping for the Campus Google Sheet (published as CSV).
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const truthy = (s: string | undefined) => ['true', 'verdadero', 'si', 'sí', '1'].includes(norm(s ?? ''));

function table(csv: string) {
  const [head, ...body] = parseCSV(csv);
  const idx = (head ?? []).map(norm);
  return body.map(r => (name: string) => (r[idx.indexOf(norm(name))] ?? '').trim());
}

export type SheetEvent = { id: string; title: string; date: string; course: string; type: string; time: string; team?: string; owner?: string; case?: string; status?: string; url?: string; notes?: string };
const types = ['clase', 'cumple', 'examen', 'entrega', 'lectura'];

export function mapEvents(csv: string): SheetEvent[] {
  return table(csv).flatMap(get => {
    const date = get('Fecha'), type = norm(get('Tipo')), id = get('ID');
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !types.includes(type) || !truthy(get('Activo'))) return [];
    const url = get('Enlace');
    return [{
      id, date, type, course: get('Curso'), title: get('Título'), time: get('Hora'),
      team: get('Grupo'), owner: get('Responsable'), case: get('Caso'), status: get('Estado'), notes: get('Notas'),
      ...(/^https?:\/\//i.test(url) ? { url } : {}),
    }];
  });
}

export type CourseInfo = { id: string; professor?: string; email?: string; phone?: string; syllabus?: string };
export function mapCourses(csv: string): CourseInfo[] {
  return table(csv).flatMap(get => {
    const id = get('ID');
    if (!id) return [];
    const email = get('Correo'), phone = get('Teléfono'), syllabus = get('Sílabo'), professor = get('Docente');
    return [{
      id,
      ...(professor ? { professor } : {}),
      ...(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? { email } : {}),
      ...(/^\+?[\d\s().-]{6,20}$/.test(phone) ? { phone } : {}),
      ...(/^https:\/\//i.test(syllabus) ? { syllabus } : {}),
    }];
  });
}

// IDs of rows switched off with Activo = FALSE, so a hidden row is not resurrected by the shared records.
export function inactiveEventIds(csv: string): string[] {
  return table(csv).flatMap(get => (get('ID') && !truthy(get('Activo')) ? [get('ID')] : []));
}

export function mapBirthdays(csv: string) {
  return table(csv).flatMap(get => {
    const month = Number(get('Mes')), day = Number(get('Día'));
    if (!get('Nombre') || !truthy(get('Mostrar en Campus')) || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return [];
    return [{ name: get('Nombre'), month, day }];
  });
}
