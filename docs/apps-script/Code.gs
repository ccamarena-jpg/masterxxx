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
        birthdays: props.getProperty('SHOW_BIRTHDAYS') === 'true' ? visibleBirthdays_() : []
      });
    }

    if (body.action === 'upload') {
      var folderId = props.getProperty('FOLDER_ID');
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
    return json_({ error: 'Error en el script' });
  }
}
