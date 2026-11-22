// =====================================================================
// CAPA ÚNICA DE ACCESO A GOOGLE SHEETS (Apps Script Web App)
// ---------------------------------------------------------------------
// - sheetsRead(hoja): lectura JSONP con callback ÚNICO por petición
//   (antes todas compartían window.handleXResponse y se pisaban), con
//   tiempo límite y errores reales en lugar de spinners infinitos.
// - sheetsWrite(payload): POST cuya respuesta SÍ se lee. Antes se usaba
//   mode:'no-cors', que devuelve una respuesta opaca: la app decía
//   "¡Guardado!" aunque el servidor respondiera UNAUTHORIZED o fallara.
//   Con Content-Type text/plain no hay preflight CORS y Apps Script
//   permite leer la respuesta. (En no-cors el navegador ya enviaba el
//   cuerpo como text/plain, así que el servidor recibe exactamente lo mismo.)
// - Versión del servidor: el ping de Auth.gs indica la versión de Code.gs.
//   Con la v2 las lecturas van por POST (la clave ya no viaja en la URL) y se
//   usan las acciones nuevas. Con un backend antiguo NUNCA se envían acciones
//   nuevas: el Code.gs original registraba como anime cualquier acción que no
//   conocía. (Pasos para actualizarlo: docs/APPS-SCRIPT.md)
// =====================================================================

class SheetsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code; // UNAUTHORIZED | TIMEOUT | NETWORK | OFFLINE | SERVER | OUTDATED
    }
}

const SHEETS_TIMEOUT_MS = 20000;
let _sheetsSeq = 0;

function handleSheetsUnauthorized() {
    if (typeof onAccessRevoked === 'function') onAccessRevoked();
}

// Petición JSONP genérica: resuelve con la respuesta tal cual del servidor.
function jsonpRequest(params) {
    return new Promise((resolve, reject) => {
        const cbName = `__otakuSheetsCb_${Date.now()}_${++_sheetsSeq}`;
        const script = document.createElement('script');
        let settled = false;

        const finish = () => {
            settled = true;
            clearTimeout(timer);
            // Si la respuesta llega tarde, que no lance "callback is not defined".
            window[cbName] = () => { delete window[cbName]; };
            script.remove();
        };

        const timer = setTimeout(() => {
            if (settled) return;
            finish();
            reject(new SheetsError('TIMEOUT', 'Google Sheets no respondió a tiempo. Revisa tu conexión.'));
        }, SHEETS_TIMEOUT_MS);

        window[cbName] = (response) => {
            if (settled) return;
            finish();
            delete window[cbName];
            resolve(response);
        };

        script.onerror = () => {
            if (settled) return;
            finish();
            reject(new SheetsError('NETWORK', 'No se pudo contactar con Google Sheets. Revisa tu conexión.'));
        };

        const query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}&`).join('');
        script.src = `${sheetsUrl()}${query}callback=${cbName}&_=${Date.now()}`;
        document.body.appendChild(script);
    });
}

// Convierte una respuesta {status, data|message} en datos o SheetsError.
function unwrapSheetsResponse(response) {
    if (response && response.status === 'success') {
        return Array.isArray(response.data) ? response.data : [];
    }
    const message = (response && response.message) || 'Respuesta desconocida del servidor.';
    if (message === 'UNAUTHORIZED') {
        handleSheetsUnauthorized();
        throw new SheetsError('UNAUTHORIZED', 'La clave de acceso ya no es válida.');
    }
    throw new SheetsError('SERVER', `Error de Sheets: ${message}`);
}

// Versión de Code.gs desplegada (1 = original sin acciones nuevas).
// Se pregunta una vez por sesión; si falla la red se volverá a preguntar.
let _serverVersionPromise = null;
function getServerVersion() {
    if (!_serverVersionPromise) {
        _serverVersionPromise = jsonpRequest({ action: 'ping' }).then(response => {
            if (response && response.message === 'UNAUTHORIZED') unwrapSheetsResponse(response);
            return Number(response && response.version) || 1;
        }).catch(err => {
            _serverVersionPromise = null;
            throw err;
        });
    }
    return _serverVersionPromise;
}

async function sheetsRead(sheetName) {
    if (navigator.onLine === false) throw new SheetsError('OFFLINE', 'Sin conexión.');
    const version = await getServerVersion();
    if (version >= 2) {
        // POST: la clave va en el cuerpo, no en la URL.
        const body = await postToSheets({ action: 'read', sheet: sheetName || '' });
        if (body) return unwrapSheetsResponse(body);
        // Si el navegador no dejó leer la respuesta, se recurre a JSONP.
    }
    const params = sheetName ? { sheet: sheetName, tab: sheetName, sheetName } : {};
    return unwrapSheetsResponse(await jsonpRequest(params));
}

// POST de bajo nivel. Devuelve el cuerpo JSON, o null si la petición salió
// pero no se pudo leer la respuesta. Lanza OFFLINE/SERVER.
async function postToSheets(payload) {
    if (navigator.onLine === false) {
        throw new SheetsError('OFFLINE', 'Sin conexión.');
    }
    let res;
    try {
        res = await fetch(WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(withAuth(payload))
        });
    } catch (e) {
        if (navigator.onLine === false) throw new SheetsError('OFFLINE', 'Sin conexión.');
        console.warn('Respuesta de Sheets no legible:', e);
        return null;
    }
    let body = null;
    try { body = JSON.parse(await res.text()); } catch (e) { /* respuesta no JSON */ }
    if (!body && !res.ok) throw new SheetsError('SERVER', `Error de Sheets (HTTP ${res.status}).`);
    return body;
}

// Devuelve { confirmed: true } si el servidor confirmó la escritura, o
// { confirmed: false } si la petición salió pero el navegador no dejó leer
// la respuesta (comportamiento anterior). Lanza SheetsError si el servidor
// la rechazó o no hay conexión.
// Opciones: { minVersion } para acciones que solo existen en Code.gs v2+.
// Si el servidor es más antiguo lanza SheetsError('OUTDATED') SIN enviar nada.
async function sheetsWrite(payload, { minVersion = 1, queueable = true } = {}) {
    // Sin conexión: la escritura se guarda en la cola y se envía al volver la red.
    if (navigator.onLine === false && queueable) return queueWrite(payload, minVersion);
    if (minVersion > 1) {
        const version = await getServerVersion();
        if (version < minVersion) {
            throw new SheetsError('OUTDATED', 'Tu Apps Script está desactualizado (ver docs/APPS-SCRIPT.md).');
        }
    }

    let body;
    try {
        body = await postToSheets(payload);
    } catch (err) {
        if (err.code === 'OFFLINE') {
            if (queueable) return queueWrite(payload, minVersion);
            throw new SheetsError('OFFLINE', 'Sin conexión: no se ha podido guardar.');
        }
        throw err;
    }
    // La petición pudo llegar y ejecutarse aunque no podamos leer la respuesta.
    if (!body) return { confirmed: false };

    if (body.status === 'error') {
        if (body.message === 'UNAUTHORIZED') {
            handleSheetsUnauthorized();
            throw new SheetsError('UNAUTHORIZED', 'La clave de acceso ya no es válida.');
        }
        throw new SheetsError('SERVER', `Error de Sheets: ${body.message || 'desconocido'}`);
    }
    return { confirmed: true, data: body };
}

// Texto corto para botones/estados tras una escritura correcta.
function savedLabel(result, okText = '¡Guardado! ✔️') {
    if (result && result.queued) return 'En cola ⏳ (se enviará con conexión)';
    return result && result.confirmed ? okText : 'Enviado ✔️ (sin confirmar)';
}

// ---------------------------------------------------------------------
// LECTURAS CON COPIA LOCAL
// Cada lectura correcta se guarda en el dispositivo (local-store.js). Si
// luego no hay conexión, se devuelve esa copia y se avisa de su fecha.
// ---------------------------------------------------------------------
const _sheetsInflight = {};
const OFFLINE_CODES = ['NETWORK', 'TIMEOUT', 'OFFLINE'];
let _offlineNoticeShown = false;

function notifyOfflineSnapshot(savedAt) {
    if (_offlineNoticeShown) return;
    _offlineNoticeShown = true;
    toast(`Sin conexión: muestro tus datos guardados ${formatSnapshotDate(savedAt)}.`, { type: 'info', duration: 6000 });
}
window.addEventListener('online', () => { _offlineNoticeShown = false; });

// Evita lanzar dos veces la misma lectura mientras la primera sigue en curso.
function sheetsReadOnce(key, sheetName) {
    if (!_sheetsInflight[key]) {
        _sheetsInflight[key] = sheetsRead(sheetName)
            .then(data => { saveSheetSnapshot(key, data); return data; })
            .catch(async err => {
                if (!OFFLINE_CODES.includes(err.code)) throw err;
                const snapshot = await loadSheetSnapshot(key);
                if (!snapshot) throw err;
                notifyOfflineSnapshot(snapshot.savedAt);
                return snapshot.data;
            })
            .finally(() => { delete _sheetsInflight[key]; });
    }
    return _sheetsInflight[key];
}

// ---------------------------------------------------------------------
// COLA DE ESCRITURAS SIN CONEXIÓN
// ---------------------------------------------------------------------
function describeWrite(payload) {
    if (payload.anime) return `Registrar "${payload.anime}"`;
    if (payload.manga) return `Registrar "${payload.manga}"`;
    return {
        save_top150: 'Guardar TOP 150', save_annual: 'Guardar Ranking Anual',
        save_planificador: 'Guardar planificador', save_calificador: 'Guardar calificador',
        upsert_rows: 'Guardar cambios', delete_rows: 'Borrar elementos',
        update_entry: 'Editar obra', delete_entry: 'Borrar obra', set_anilist_ids: 'Vincular con AniList'
    }[payload.action] || 'Cambio pendiente';
}

async function queueWrite(payload, minVersion) {
    try {
        await outboxAdd({ payload, minVersion, label: describeWrite(payload) });
    } catch (err) {
        throw new SheetsError('OFFLINE', 'Sin conexión y no se pudo guardar en el dispositivo.');
    }
    updateOutboxBadge();
    return { confirmed: false, queued: true };
}

let _flushingOutbox = false;
// Envía lo pendiente, en orden. Se llama al recuperar la conexión y al abrir la app.
async function flushOutbox() {
    if (_flushingOutbox || navigator.onLine === false || !getAccessKey()) return;
    _flushingOutbox = true;
    let sent = 0;
    const failed = [];
    try {
        for (const entry of await outboxList()) {
            try {
                await sheetsWrite(entry.payload, { minVersion: entry.minVersion || 1, queueable: false });
                await outboxRemove(entry.id);
                sent++;
            } catch (err) {
                if (OFFLINE_CODES.includes(err.code) || err.code === 'UNAUTHORIZED') break;   // se reintentará
                await outboxRemove(entry.id);                                                // el servidor lo rechazó
                failed.push(`${entry.label}: ${err.message}`);
            }
        }
    } finally {
        _flushingOutbox = false;
        updateOutboxBadge();
    }
    if (sent) {
        toast(`Se enviaron ${sent} ${sent === 1 ? 'cambio pendiente' : 'cambios pendientes'}.`, { type: 'success' });
        invalidateList('master'); invalidateList('manga');
        if (typeof refreshCurrentView === 'function') refreshCurrentView();
    }
    failed.forEach(msg => toast(`No se pudo enviar: ${msg}`, { type: 'error' }));
}

// Indicador en la cabecera con el número de cambios en cola.
async function updateOutboxBadge() {
    const badge = document.getElementById('outboxBadge');
    if (!badge) return;
    const count = (await outboxList()).length;
    badge.hidden = count === 0;
    badge.textContent = `⏳ ${count}`;
    badge.title = `${count} ${count === 1 ? 'cambio pendiente' : 'cambios pendientes'} de enviar`;
}

window.addEventListener('online', () => flushOutbox());
