/**
 * OTAKU HUB — Lógica principal del Web App (lecturas y escrituras en Sheets).
 *
 * Auth.gs recibe todas las peticiones, comprueba la clave y, si es correcta,
 * llama a handleGet(e) / handlePost(e) de este archivo.
 *
 * INSTALACIÓN: sustituye TODO el contenido de tu archivo principal de Apps
 * Script (el que tenía handleGet/handlePost) por este archivo, actualiza
 * Auth.gs y crea una nueva versión de la implementación. Detalle en
 * docs/APPS-SCRIPT.md.
 *
 * Versión 2 (respecto a la original):
 *  - action "read" por POST: la app ya no necesita poner la clave en la URL.
 *  - Columna "AniList ID" en FULL LIST y FULL LIST MANGA (se crea sola).
 *  - action "set_anilist_ids" para vincular obras ya registradas.
 *  - "upsert_rows"/"delete_rows": guardar una fila sin reescribir la hoja entera.
 *  - Bloqueo (LockService) en las escrituras para que dos dispositivos no se pisen.
 *  - Cada fila leída incluye "_row" (su número de fila en la hoja).
 *  - "updateTab" solo puede tocar las pestañas de ranking (antes podía vaciar
 *    cualquier hoja, incluida FULL LIST).
 */

var OTAKU_API_VERSION = 2;

var MANGA_SHEET = 'FULL LIST MANGA';
var RANKING_TABS = ['TOP150', 'TOP_150', 'RANKING_ANUAL'];
var PROTECTED_SHEETS = ['FAVS', MANGA_SHEET, 'TOP150', 'TOP_150', 'RANKING_ANUAL', 'OTAKU_STATE', 'CALIFICADOR_STATE', 'PLANIFICADOR_STATE'];
var ANILIST_HEADER = 'AniList ID';

// Hojas de estado que admiten guardado por fila (clave = columna A "id").
var STATE_SCHEMAS = {
  CALIFICADOR_STATE: {
    headers: ['id', 'title', 'episodes', 'cover', 'scores'],
    toRow: function (item) { return [String(item.id), item.title || '', item.episodes || 0, item.cover || '', JSON.stringify(item.scores || [])]; }
  },
  PLANIFICADOR_STATE: {
    headers: ['id', 'year', 'season', 'title', 'cover', 'status'],
    toRow: function (item) { return [String(item.id), item.year || '', item.season || '', item.title || '', item.cover || '', item.status || '']; }
  }
};

var SCORE_FORMULA_TEXTS = '10; "Obra maestra (inolvidable y perfecto)"; 9; "Excelente (muy recomendable, casi perfecto)"; 8; "Muy bueno (gran obra, con pocos defectos)"; 7; "Bueno (agradable, con algunos fallos)"; 6; "Correcto (decente, pero con bastantes fallos)"; 5; "Mediocre (cumple, pero con grandes carencias)"; 4; "Malo (deficiente, varios aspectos negativos)"; 3; "Muy malo (difícil de disfrutar, con muchos problemas)"; 2; "Horrible (un desastre, muy pocos aspectos rescatables)"; 1; "Espantoso (Un fracaso total, mejor no leerlo)"; 0; "Insoportable (No merece ser considerado arte)"';

// =====================================================================
// LECTURAS
// =====================================================================

function handleGet(e) {
  var params = (e && e.parameter) || {};
  var result;
  try {
    result = params.action === 'loadState' ? loadState_() : readSheet_(params.sheet);
  } catch (error) {
    result = { status: 'error', message: error.toString() };
  }
  return respond_(result, params.callback);
}

function loadState_() {
  // Compatibilidad: devuelve el JSON guardado en OTAKU_STATE!A1 tal cual.
  var stateSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('OTAKU_STATE');
  var value = stateSheet ? stateSheet.getRange('A1').getValue() : '';
  try { return value ? JSON.parse(value) : {}; } catch (err) { return {}; }
}

// Hoja principal de anime: la activa, salvo que sea una de las protegidas.
function mainAnimeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  if (PROTECTED_SHEETS.indexOf(sheet.getName()) !== -1) sheet = ss.getSheets()[0];
  return sheet;
}

function readSheet_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = sheetName ? ss.getSheetByName(sheetName) : null;
  if (!sheet) sheet = mainAnimeSheet_();

  var data = sheet.getDataRange().getValues();
  if (data.length === 0 || (data.length === 1 && data[0].join('').trim() === '')) {
    return { status: 'success', data: [] };
  }

  var headers = data[0].map(function (h) { return h.toString().trim(); });
  var items = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] || row[0].toString().trim() === '') continue;
    var itemObj = {};

    if (RANKING_TABS.indexOf(sheetName) !== -1) {
      itemObj = { id: row[0].toString(), name: row[1].toString(), score: parseFloat(row[2]) || 0 };
    } else if (sheetName === 'CALIFICADOR_STATE') {
      var scores = [];
      try { scores = JSON.parse(row[4] || '[]'); } catch (err) { scores = []; }
      itemObj = { id: row[0].toString(), title: row[1].toString(), episodes: parseInt(row[2], 10) || 0, cover: row[3].toString(), scores: scores };
    } else if (sheetName === 'PLANIFICADOR_STATE') {
      itemObj = { id: row[0].toString(), year: parseInt(row[1], 10) || new Date().getFullYear(), season: row[2].toString(), title: row[3].toString(), cover: row[4].toString(), status: row[5].toString() };
    } else {
      // FULL LIST / FULL LIST MANGA / FAVS: columnas por cabecera.
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j];
        if (!key) continue;
        var value = row[j];
        if (key.toLowerCase() === 'year' || key.toLowerCase() === 'score') value = parseFloat(value) || 0;
        itemObj[key] = value;
        itemObj[key.toLowerCase().replace(/[\s_\-]/g, '')] = value;
      }
      if (!itemObj.hasOwnProperty('anime') && row[0]) itemObj.anime = row[0];
      if (!itemObj.hasOwnProperty('season') && row[1]) itemObj.season = row[1];
      if (!itemObj.hasOwnProperty('year') && row[2]) itemObj.year = parseInt(row[2], 10) || 0;
      if (!itemObj.hasOwnProperty('studio') && row[3]) itemObj.studio = row[3];
      if (!itemObj.hasOwnProperty('score') && row[4]) itemObj.score = parseFloat(row[4]) || 0;
    }
    itemObj._row = i + 1; // número de fila real en la hoja (1 = cabecera)
    items.push(itemObj);
  }
  return { status: 'success', data: items };
}

// =====================================================================
// ESCRITURAS
// =====================================================================

function handlePost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (error) {
    return json_({ status: 'error', message: 'Cuerpo JSON no válido' });
  }

  // Las lecturas no necesitan bloqueo.
  if (data.action === 'read') {
    try { return json_(readSheet_(data.sheet)); }
    catch (error) { return json_({ status: 'error', message: error.toString() }); }
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (error) {
    return json_({ status: 'error', message: 'Servidor ocupado, inténtalo de nuevo.' });
  }
  try {
    return json_(dispatchWrite_(data));
  } catch (error) {
    return json_({ status: 'error', message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function dispatchWrite_(data) {
  switch (data.action) {
    case 'saveState': return saveState_(data);
    case 'save_calificador': return replaceStateSheet_('CALIFICADOR_STATE', data.payload);
    case 'save_planificador': return replaceStateSheet_('PLANIFICADOR_STATE', data.payload);
    case 'save_top150': return replaceRankingTab_('TOP_150', data.payload || data.data);
    case 'save_annual': return replaceRankingTab_('RANKING_ANUAL', data.payload || data.data);
    case 'updateTab':
      if (RANKING_TABS.indexOf(data.tabName) === -1) throw new Error('Pestaña no permitida: ' + data.tabName);
      return replaceRankingTab_(data.tabName, data.payload || data.data);
    case 'upsert_rows': return upsertRows_(data.sheet, data.items);
    case 'delete_rows': return deleteRows_(data.sheet, data.ids);
    case 'set_anilist_ids': return setAnilistIds_(data.target, data.items);
    case undefined:
    case null:
    case '':
      return registerEntry_(data);
    default:
      // Antes, cualquier acción desconocida acababa registrando un anime vacío.
      throw new Error('Acción desconocida: ' + data.action);
  }
}

function saveState_(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('OTAKU_STATE') || ss.insertSheet('OTAKU_STATE');
  sheet.getRange('A1').setValue(JSON.stringify(data.statePayload));
  return { status: 'success' };
}

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function replaceStateSheet_(name, payload) {
  var schema = STATE_SCHEMAS[name];
  var sheet = getOrCreateSheet_(name, schema.headers);
  sheet.clear();
  sheet.appendRow(schema.headers);
  if (payload && payload.length > 0) {
    var rows = payload.map(schema.toRow);
    sheet.getRange(2, 1, rows.length, schema.headers.length).setValues(rows);
  }
  return { status: 'success' };
}

function replaceRankingTab_(tabName, items) {
  var sheet = getOrCreateSheet_(tabName, ['id', 'name', 'score']);
  sheet.clear();
  sheet.appendRow(['id', 'name', 'score']);
  if (items && items.length > 0) {
    var rows = items.map(function (item) { return [item.id, item.name, item.score]; });
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  return { status: 'success' };
}

// Inserta o actualiza filas por id (columna A) sin tocar el resto.
function upsertRows_(sheetName, items) {
  var schema = STATE_SCHEMAS[sheetName];
  if (!schema) throw new Error('Hoja no permitida: ' + sheetName);
  if (!items || items.length === 0) return { status: 'success', updated: 0, inserted: 0 };

  var sheet = getOrCreateSheet_(sheetName, schema.headers);
  var width = schema.headers.length;
  var lastRow = sheet.getLastRow();
  var ids = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];

  var updated = 0, appended = [];
  items.forEach(function (item) {
    var row = schema.toRow(item);
    var index = ids.indexOf(String(item.id));
    if (index !== -1) {
      sheet.getRange(index + 2, 1, 1, width).setValues([row]);
      updated++;
    } else {
      appended.push(row);
      ids.push(String(item.id));
    }
  });
  if (appended.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appended.length, width).setValues(appended);
  }
  return { status: 'success', updated: updated, inserted: appended.length };
}

function deleteRows_(sheetName, idsToDelete) {
  if (!STATE_SCHEMAS[sheetName]) throw new Error('Hoja no permitida: ' + sheetName);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || !idsToDelete || idsToDelete.length === 0) return { status: 'success', deleted: 0 };

  var wanted = idsToDelete.map(String);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { status: 'success', deleted: 0 };
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var deleted = 0;
  // De abajo arriba para que borrar no desplace las filas pendientes.
  for (var i = ids.length - 1; i >= 0; i--) {
    if (wanted.indexOf(String(ids[i][0])) !== -1) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return { status: 'success', deleted: deleted };
}

// Devuelve el número de columna "AniList ID" (1-based), creándola si no existe.
function ensureAnilistColumn_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c]).toLowerCase().replace(/[\s_\-]/g, '') === 'anilistid') return c + 1;
  }
  var newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(ANILIST_HEADER);
  return newCol;
}

// Escribe IDs de AniList en filas existentes. Solo escribe si el título de
// la fila sigue coincidiendo (por si se insertaron filas entre medias).
function setAnilistIds_(target, items) {
  var sheet = target === 'manga' ? SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MANGA_SHEET) : mainAnimeSheet_();
  if (!sheet) throw new Error('No existe la hoja de ' + target);
  if (!items || items.length === 0) return { status: 'success', updated: 0, skipped: 0 };

  var col = ensureAnilistColumn_(sheet);
  var lastRow = sheet.getLastRow();
  var titles = sheet.getRange(1, 1, lastRow, 1).getValues();
  var updated = 0, skipped = 0;
  items.forEach(function (item) {
    var row = parseInt(item.row, 10);
    var id = parseInt(item.id, 10);
    var sameTitle = row >= 2 && row <= lastRow && String(titles[row - 1][0]).trim() === String(item.title || '').trim();
    if (sameTitle && id > 0) {
      sheet.getRange(row, col).setValue(id);
      updated++;
    } else {
      skipped++;
    }
  });
  return { status: 'success', updated: updated, skipped: skipped };
}

// Registro de un anime o manga nuevo (fila 3, con el formato de la fila 4).
function registerEntry_(data) {
  var isManga = data.hasOwnProperty('serialization');
  var sheet, rowData;

  if (isManga) {
    sheet = getOrCreateSheet_(MANGA_SHEET, ['Manga Title', 'Year', 'Serialization', 'Score', 'Review']);
    rowData = [data.manga, data.year, data.serialization, data.score];
  } else {
    sheet = mainAnimeSheet_();
    rowData = [data.anime, data.season, data.year, data.studio, data.score];
  }
  if (!rowData[0] || String(rowData[0]).trim() === '') throw new Error('Falta el título');

  var anilistCol = data.anilistId ? ensureAnilistColumn_(sheet) : 0;

  sheet.insertRowBefore(3);
  var numColumns = sheet.getLastColumn() || 6;
  sheet.getRange(4, 1, 1, numColumns).copyTo(sheet.getRange(3, 1, 1, numColumns), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sheet.getRange(3, 1, 1, rowData.length).setValues([rowData]);

  var formulaColumn = isManga ? 5 : 6;
  var scoreCellRef = isManga ? 'D3' : 'E3';
  sheet.getRange(3, formulaColumn).setValue('=SWITCH(' + scoreCellRef + '; ' + SCORE_FORMULA_TEXTS + ')');

  if (anilistCol) sheet.getRange(3, anilistCol).setValue(parseInt(data.anilistId, 10));
  return { status: 'success' };
}

// =====================================================================
// RESPUESTAS
// =====================================================================

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function respond_(obj, callback) {
  if (callback && /^[A-Za-z_$][\w$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(obj);
}
