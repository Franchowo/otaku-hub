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
// =====================================================================

class SheetsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code; // UNAUTHORIZED | TIMEOUT | NETWORK | OFFLINE | SERVER
    }
}

const SHEETS_TIMEOUT_MS = 20000;
let _sheetsSeq = 0;

function handleSheetsUnauthorized() {
    if (typeof onAccessRevoked === 'function') onAccessRevoked();
}

function sheetsRead(sheetName) {
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
            if (response && response.status === 'success') {
                resolve(Array.isArray(response.data) ? response.data : []);
                return;
            }
            const message = (response && response.message) || 'Respuesta desconocida del servidor.';
            if (message === 'UNAUTHORIZED') {
                handleSheetsUnauthorized();
                reject(new SheetsError('UNAUTHORIZED', 'La clave de acceso ya no es válida.'));
            } else {
                reject(new SheetsError('SERVER', `Error de Sheets: ${message}`));
            }
        };

        script.onerror = () => {
            if (settled) return;
            finish();
            reject(new SheetsError('NETWORK', 'No se pudo contactar con Google Sheets. Revisa tu conexión.'));
        };

        const sheet = sheetName ? encodeURIComponent(sheetName) : '';
        const sheetParams = sheet ? `sheet=${sheet}&tab=${sheet}&sheetName=${sheet}&` : '';
        script.src = `${sheetsUrl()}${sheetParams}callback=${cbName}&_=${Date.now()}`;
        document.body.appendChild(script);
    });
}

// Devuelve { confirmed: true } si el servidor confirmó la escritura, o
// { confirmed: false } si la petición salió pero el navegador no dejó leer
// la respuesta (comportamiento anterior). Lanza SheetsError si el servidor
// la rechazó o no hay conexión.
async function sheetsWrite(payload) {
    if (navigator.onLine === false) {
        throw new SheetsError('OFFLINE', 'Sin conexión: no se ha podido guardar.');
    }

    let res;
    try {
        res = await fetch(WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(withAuth(payload))
        });
    } catch (e) {
        if (navigator.onLine === false) {
            throw new SheetsError('OFFLINE', 'Sin conexión: no se ha podido guardar.');
        }
        // La petición pudo llegar y ejecutarse aunque no podamos leer la respuesta.
        console.warn('Escritura enviada sin confirmación del servidor:', e);
        return { confirmed: false };
    }

    let body = null;
    try { body = JSON.parse(await res.text()); } catch (e) { /* respuesta no JSON */ }

    if (body && body.status === 'error') {
        if (body.message === 'UNAUTHORIZED') {
            handleSheetsUnauthorized();
            throw new SheetsError('UNAUTHORIZED', 'La clave de acceso ya no es válida.');
        }
        throw new SheetsError('SERVER', `Error de Sheets: ${body.message || 'desconocido'}`);
    }
    if (!res.ok) throw new SheetsError('SERVER', `Error de Sheets (HTTP ${res.status}).`);
    return { confirmed: true, data: body };
}

// Texto corto para botones/estados tras una escritura correcta.
function savedLabel(result, okText = '¡Guardado! ✔️') {
    return result && result.confirmed ? okText : 'Enviado ✔️ (sin confirmar)';
}

// Evita lanzar dos veces la misma lectura mientras la primera sigue en curso.
const _sheetsInflight = {};
function sheetsReadOnce(key, sheetName) {
    if (!_sheetsInflight[key]) {
        _sheetsInflight[key] = sheetsRead(sheetName).finally(() => { delete _sheetsInflight[key]; });
    }
    return _sheetsInflight[key];
}
