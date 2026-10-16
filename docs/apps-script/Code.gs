/**
 * Campus MDMGC30 · Apps Script ligado al Sheet "MDMGC30 · Registro de entregas".
 * El Sheet NO se publica ni se comparte: la web llama a este script (que corre como tú) con un token secreto.
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   TOKEN           (obligatoria) texto largo y aleatorio; el mismo valor va en Vercel como APPS_SCRIPT_TOKEN
 *   FOLDER_ID       (para subir PDFs) id de la carpeta de Drive donde se guardan
 *   SHOW_BIRTHDAYS  (opcional) 'true' para enviar la pestaña Cumpleaños (solo filas con "Mostrar en Campus")
 */
var TABS = { calendar: 'Calendario y entregas', courses: 'Cursos', birthdays: 'Cumpleaños' };
var MAX_BYTES = 4 * 1024 * 1024;

// Alternativa a la propiedad FOLDER_ID: pega aquí el id de la carpeta de Drive SOLO en tu copia del script
// (no lo subas al repositorio). Si la propiedad FOLDER_ID existe, tiene prioridad.
var FOLDER_ID_FALLBACK = '';

function folderId_() {
  return PropertiesService.getScriptProperties().getProperty('FOLDER_ID') || FOLDER_ID_FALLBACK;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function rows_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  return sh ? sh.getDataRange().getDisplayValues() : [];
}

// Solo deja la cabecera y las filas con "Mostrar en Campus" = TRUE; los datos ocultos nunca salen del Sheet.
function visibleBirthdays_() {
  var v = rows_(TABS.birthdays);
  if (!v.length) return [];
  var col = v[0].indexOf('Mostrar en Campus');
  return [v[0]].concat(v.slice(1).filter(function (r) { return col >= 0 && String(r[col]).toUpperCase() === 'TRUE'; }));
}

/**
 * Ejecutar UNA vez a mano (selecciona esta función arriba y pulsa Ejecutar).
 * Crea en la pestaña "Cursos" las columnas Correo y Teléfono (junto a Docente) y asegura Sílabo.
 * No borra ni mueve datos: solo inserta columnas que falten. Se puede ejecutar varias veces.
 */
function prepararColumnasCursos() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.courses);
  if (!sh) throw new Error('No existe la pestaña "' + TABS.courses + '"');
  function headers() { return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]; }
  function ensure(name, afterName) {
    var h = headers();
    if (h.indexOf(name) >= 0) return;
    var after = h.indexOf(afterName);
    var col = after >= 0 ? after + 2 : h.length + 1;
    if (after >= 0) sh.insertColumnAfter(after + 1);
    sh.getRange(1, col).setValue(name).setFontWeight('bold');
  }
  ensure('Correo', 'Docente');
  ensure('Teléfono', 'Correo');
  ensure('Sílabo', 'Evaluación');
  var h = headers();
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  // Texto plano en Teléfono para que Sheets no convierta "+51 999..." en número o fórmula.
  sh.getRange(2, h.indexOf('Teléfono') + 1, rows, 1).setNumberFormat('@');
  var msg = 'Listo. Columnas de Cursos: ' + headers().join(', ');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* sin interfaz: el resultado queda en el registro */ }
}

var RECORD_COLUMNS = { ID: 'id', Curso: 'course', 'Título': 'title', Fecha: 'date', Grupo: 'team', Responsable: 'owner', Caso: 'case', Estado: 'status', Enlace: 'url', Notas: 'notes', Tipo: 'type', Hora: 'time' };
var RECORD_TYPES = ['clase', 'examen', 'entrega', 'lectura'];

// Inserta o actualiza filas por ID. Todo se escribe como texto para que Sheets no cree fórmulas ni cambie las fechas.
// onlyNew = true: solo añade filas que no existen (copia de la base antigua); nunca pisa lo ya guardado en el Excel.
function syncRecords_(records, onlyNew) {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.calendar);
  if (!sh) return 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var v = sh.getDataRange().getValues();
    var h = v[0];
    var idCol = h.indexOf('ID');
    if (idCol < 0) return 0;
    var activeCol = h.indexOf('Activo');
    var rowOf = {};
    var blanks = [];
    var nextRow = v.length + 1;
    for (var i = 1; i < v.length; i++) {
      var id = String(v[i][idCol]);
      if (id) rowOf[id] = i + 1;
      else blanks.push(i + 1);
    }
    var count = 0;
    records.slice(0, 50).forEach(function (rec) {
      var rid = String(rec.id || '').slice(0, 80);
      if (!rid || RECORD_TYPES.indexOf(rec.type) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(rec.date))) return;
      var row = rowOf[rid];
      if (row && onlyNew) return;
      var isNew = !row;
      if (isNew) {
        row = blanks.length ? blanks.shift() : nextRow++;
        rowOf[rid] = row;
      }
      Object.keys(RECORD_COLUMNS).forEach(function (header) {
        var col = h.indexOf(header);
        if (col < 0) return;
        var value = header === 'ID' ? rid : String(rec[RECORD_COLUMNS[header]] || '').slice(0, 2000);
        sh.getRange(row, col + 1).setNumberFormat('@').setValue(value);
      });
      if (isNew && activeCol >= 0) sh.getRange(row, activeCol + 1).setValue(true);
      count++;
    });
    return count;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ejecutar UNA vez a mano para dar al script permiso sobre Drive y comprobar FOLDER_ID.
 * Si falla, el mensaje dice qué falta (propiedad FOLDER_ID o carpeta inexistente).
 */
function autorizarDrive() {
  var folderId = folderId_();
  if (!folderId) throw new Error('Falta el id de la carpeta de Drive: crea la propiedad FOLDER_ID o pégalo en FOLDER_ID_FALLBACK');
  var folder = DriveApp.getFolderById(folderId);
  var msg = 'Drive autorizado. Carpeta de destino: ' + folder.getName();
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* sin interfaz */ }
}

/**
 * Ejecutar UNA vez a mano: añade a "Calendario y entregas" las lecturas obligatorias de los sílabos
 * (tipo "lectura", en la fecha de la sesión). Se puede repetir sin duplicar: cada lectura tiene un ID fijo.
 */
function cargarLecturas() {
  var L = [
    ['DEC', '2026-10-01', 'Introduction to Strategy (L1)'],
    ['DEC', '2026-10-01', 'Industry Analysis (L2)'],
    ['DEC', '2026-10-03', 'Competitive Advantage (L3)'],
    ['DEC', '2026-10-29', 'Corporate Strategy (L4)'],
    ['DEC', '2026-10-29', 'Setting Aspirations: Mission, Vision and Values (L5)'],
    ['DEC', '2026-11-12', 'Executing Strategy (L6)'],
    ['GV', '2026-10-03', 'Putting Sales at the Center of Strategy, Cespedes (L1)'],
    ['GV', '2026-10-03', 'When CEOs Make Sales Calls, Cappon y Senn (L2)'],
    ['GV', '2026-10-31', 'Selling After the Crisis, Cespedes (L3)'],
    ['GV', '2026-10-31', 'Motivating Salespeople: What Really Works, Steenburgh y Ahearne (L4)'],
    ['ES', '2026-10-02', 'Marketing Myopia, Levitt'],
    ['ES', '2026-10-16', 'Rediscovering Market Segmentation, Yankelovich y Meer'],
    ['ES', '2026-10-30', 'Are You Undervaluing Your Customers?, Markey'],
    ['ES', '2026-11-13', 'Personalization at Scale, McKinsey']
  ];
  var seen = {};
  var records = L.map(function (r) {
    var key = r[0] + '-' + r[1];
    seen[key] = (seen[key] || 0) + 1;
    return { id: r[0] + '-LECTURA-' + r[1] + '-' + seen[key], course: r[0], date: r[1], type: 'lectura', title: 'Lectura: ' + r[2], time: 'Para la sesión', status: 'Pendiente', team: '', owner: '', 'case': '', url: '', notes: '' };
  });
  var n = syncRecords_(records);
  var msg = 'Lecturas cargadas o actualizadas: ' + n;
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* sin interfaz */ }
}

// Fila (1-based) del curso con ese ID en la pestaña Cursos, o 0 si no existe.
function courseRow_(id) {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.courses);
  if (!sh || !id) return 0;
  var v = sh.getDataRange().getValues();
  var col = v[0].indexOf('ID');
  if (col < 0) return 0;
  for (var i = 1; i < v.length; i++) if (String(v[i][col]) === id) return i + 1;
  return 0;
}

// Escribe el enlace en la columna Sílabo (la crea al final si no existe).
function setSyllabusCell_(row, url) {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.courses);
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = h.indexOf('Sílabo') + 1;
  if (!col) { col = h.length + 1; sh.getRange(1, col).setValue('Sílabo').setFontWeight('bold'); }
  sh.getRange(row, col).setValue(url);
}

// ---- Eliminar actividades y aplicar sílabos ----
var DELETABLE_TYPES = ['entrega', 'examen', 'lectura'];
var UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Devuelve la hoja del calendario con sus cabeceras y una función para localizar columnas.
function calendarSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.calendar);
  if (!sh) throw new Error('No existe la pestaña ' + TABS.calendar);
  var v = sh.getDataRange().getValues();
  var h = v[0];
  return { sh: sh, v: v, h: h, col: function (n) { return h.indexOf(n); } };
}

// "Elimina" una actividad: pone Activo = FALSE (recuperable desde el Excel). Solo entregas, evaluaciones y lecturas.
function deleteRecord_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var c = calendarSheet_();
    var idCol = c.col('ID'), typeCol = c.col('Tipo'), activeCol = c.col('Activo');
    if (idCol < 0 || typeCol < 0 || activeCol < 0) throw new Error('Faltan columnas ID, Tipo o Activo');
    for (var i = 1; i < c.v.length; i++) {
      if (String(c.v[i][idCol]) !== id) continue;
      if (DELETABLE_TYPES.indexOf(String(c.v[i][typeCol]).toLowerCase()) < 0) return 'tipo-no-permitido';
      c.sh.getRange(i + 1, activeCol + 1).setValue(false);
      return 'ok';
    }
    return 'no-encontrado';
  } finally {
    lock.releaseLock();
  }
}

// Columna de la pestaña Cursos por nombre; la crea al final si no existe.
function courseColumn_(sh, name) {
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var i = h.indexOf(name);
  if (i >= 0) return i + 1;
  var col = h.length + 1;
  sh.getRange(1, col).setValue(name).setFontWeight('bold');
  return col;
}

function setCourseText_(sh, row, name, value) {
  if (value === undefined || value === null || value === '') return;
  sh.getRange(row, courseColumn_(sh, name)).setNumberFormat('@').setValue(String(value).slice(0, 4000));
}

/**
 * Aplica la información leída de un sílabo: actualiza la fila del curso (Resumen, Evaluación, Horas, Docente,
 * Sesiones, Casos) y reemplaza las actividades precargadas (entregas, evaluaciones y lecturas con ID que no
 * sea de la web) por las del sílabo. Lo desactivado queda con Activo = FALSE, no se borra.
 */
function applySyllabus_(course, info, events) {
  var row = courseRow_(course);
  if (!row) throw new Error('Curso no encontrado en la pestaña Cursos');
  var cs = SpreadsheetApp.getActive().getSheetByName(TABS.courses);
  setCourseText_(cs, row, 'Resumen', info.summary);
  setCourseText_(cs, row, 'Evaluación', info.evaluation);
  setCourseText_(cs, row, 'Horas', info.hours);
  setCourseText_(cs, row, 'Docente', info.professor);
  setCourseText_(cs, row, 'Sesiones', (info.sessions || []).join('\n'));
  setCourseText_(cs, row, 'Casos', (info.cases || []).join('\n'));

  var deactivated = 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var c = calendarSheet_();
    var idCol = c.col('ID'), courseCol = c.col('Curso'), typeCol = c.col('Tipo'), activeCol = c.col('Activo');
    if (idCol >= 0 && courseCol >= 0 && typeCol >= 0 && activeCol >= 0) {
      for (var i = 1; i < c.v.length; i++) {
        var id = String(c.v[i][idCol]);
        if (!id || UUID_ID.test(id)) continue; // lo creado a mano desde la web no se toca
        if (String(c.v[i][courseCol]) !== course) continue;
        if (DELETABLE_TYPES.indexOf(String(c.v[i][typeCol]).toLowerCase()) < 0) continue;
        c.sh.getRange(i + 1, activeCol + 1).setValue(false);
        deactivated++;
      }
    }
  } finally {
    lock.releaseLock();
  }
  var added = syncRecords_(events || []);
  return { deactivated: deactivated, added: added };
}

function doGet() {
  return json_({ ok: true, service: 'campus-mdmgc30' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('TOKEN');
    if (!token || body.token !== token) return json_({ error: 'No autorizado' });

    if (body.action === 'read') {
      return json_({
        calendar: rows_(TABS.calendar),
        courses: rows_(TABS.courses),
        birthdays: String(props.getProperty('SHOW_BIRTHDAYS')).toLowerCase() === 'true' ? visibleBirthdays_() : []
      });
    }

    // Los registros que se cargan en la web se copian a la pestaña "Calendario y entregas" (alta o actualización por ID).
    if (body.action === 'syncRecords') {
      return json_({ synced: syncRecords_(body.records || [], body.onlyNew === true) });
    }

    if (body.action === 'deleteRecord') {
      return json_({ result: deleteRecord_(String(body.id || '').slice(0, 80)) });
    }

    if (body.action === 'applySyllabus') {
      return json_(applySyllabus_(String(body.course || ''), body.info || {}, (body.events || []).slice(0, 50)));
    }

    if (body.action === 'upload') {
      var folderId = folderId_();
      if (!folderId) return json_({ error: 'Falta FOLDER_ID' });
      var bytes = Utilities.base64Decode(String(body.data || ''));
      if (!bytes.length || bytes.length > MAX_BYTES) return json_({ error: 'Tamaño no permitido' });
      if (bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70) return json_({ error: 'Solo PDF' });
      var name = String(body.name || 'tarea.pdf').replace(/[^\w .()\-áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120);
      var isSyllabus = body.kind === 'silabo';
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        var row = 0;
        if (isSyllabus) {
          row = courseRow_(String(body.course || ''));
          if (!row) return json_({ error: 'Curso no encontrado en la pestaña Cursos' });
          name = ('Sílabo ' + body.course + ' - ' + name).slice(0, 120);
        }
        var file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, 'application/pdf', name));
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        // El enlace del sílabo queda escrito en la columna Sílabo del curso.
        if (isSyllabus) setSyllabusCell_(row, file.getUrl());
        return json_({ url: file.getUrl(), name: file.getName() });
      } finally {
        lock.releaseLock();
      }
    }

    return json_({ error: 'Acción no válida' });
  } catch (err) {
    console.error(err);
    return json_({ error: 'Error en el script', detail: String((err && err.message) || err) });
  }
}
