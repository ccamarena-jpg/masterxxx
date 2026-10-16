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
      var file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, 'application/pdf', name));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return json_({ url: file.getUrl(), name: file.getName() });
    }

    return json_({ error: 'Acción no válida' });
  } catch (err) {
    return json_({ error: 'Error en el script' });
  }
}
