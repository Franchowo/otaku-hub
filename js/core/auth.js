// =====================================================================
// AUTENTICACIÓN (pantalla de bloqueo + clave para Google Sheets)
// ---------------------------------------------------------------------
// - Cada petición a Sheets (lectura JSONP o escritura POST) lleva la clave.
// - El servidor (apps-script/Auth.gs) rechaza todo lo que no traiga la
//   clave correcta, así que nadie puede leer ni escribir tus listas
//   aunque conozca la URL.
// - La pantalla de bloqueo es solo comodidad visual: la seguridad real
//   está en el servidor.
// =====================================================================

function getAccessKey() {
    try {
        return localStorage.getItem(AUTH_STORAGE_KEY) || '';
    } catch (e) {
        return '';
    }
}

function setAccessKey(key) {
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, key);
    } catch (e) {
        /* almacenamiento bloqueado */
    }
}

// URL base para lecturas JSONP. Uso: `${sheetsUrl()}sheet=FAVS&callback=...`
function sheetsUrl() {
    return `${WEB_APP_URL}?key=${encodeURIComponent(getAccessKey())}&`;
}

// Añade la clave al cuerpo de las escrituras POST.
function withAuth(payload) {
    return Object.assign({}, payload, { key: getAccessKey() });
}

// Verifica una clave contra el servidor (acción "ping" de Auth.gs).
function verifyAccessKey(key) {
    return new Promise(resolve => {
        const cbName = '__otakuAuthCb_' + Date.now();
        const script = document.createElement('script');
        const cleanup = () => {
            delete window[cbName];
            script.remove();
            clearTimeout(timer);
        };
        const timer = setTimeout(() => {
            cleanup();
            resolve('timeout');
        }, 15000);
        window[cbName] = res => {
            cleanup();
            if (res && res.auth === 'ok') resolve('ok');
            else if (res && res.message === 'UNAUTHORIZED') resolve('denied');
            else resolve('server-outdated');
        };
        script.onerror = () => {
            cleanup();
            resolve('network');
        };
        script.src = `${WEB_APP_URL}?action=ping&key=${encodeURIComponent(key)}&callback=${cbName}&_=${Date.now()}`;
        document.body.appendChild(script);
    });
}

// ---------------------------------------------------------------------
// BLOQUEO PROGRESIVO POR INTENTOS FALLIDOS (por dispositivo/navegador)
// Tras MAX_FAILED_ATTEMPTS claves incorrectas, espera de 1 min; cada fallo
// posterior la alarga (5 min, 30 min, 2 h y 24 h como máximo). Al acertar se
// reinicia. Antes eran 30 días de golpe: tres errores de tecleo te dejaban
// fuera de tu propio móvil un mes. Es por dispositivo a propósito: un bloqueo
// en el servidor permitiría a cualquiera bloquearte a ti.
// ---------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_STEPS_MS = [60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3, 24 * 3600e3];
const AUTH_FAILS_KEY = 'otaku_hub_auth_fails';
const AUTH_LOCK_KEY = 'otaku_hub_auth_lock_until';
const AUTH_LEVEL_KEY = 'otaku_hub_auth_lock_level';

function readNumber(storageKey) {
    try {
        return parseInt(localStorage.getItem(storageKey), 10) || 0;
    } catch (e) {
        return 0;
    }
}

function writeValue(storageKey, value) {
    try {
        if (value === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, String(value));
    } catch (e) {
        /* almacenamiento bloqueado */
    }
}

function getLockUntil() {
    let until = readNumber(AUTH_LOCK_KEY);
    const maxUntil = Date.now() + LOCKOUT_STEPS_MS[LOCKOUT_STEPS_MS.length - 1];
    if (until > maxUntil) {
        // bloqueos antiguos de 30 días → máximo 24 h
        until = maxUntil;
        writeValue(AUTH_LOCK_KEY, until);
    }
    if (until && Date.now() >= until) {
        // la espera ya terminó (el nivel se conserva)
        writeValue(AUTH_LOCK_KEY, null);
        return 0;
    }
    return until;
}

function registerFailedAttempt() {
    const level = readNumber(AUTH_LEVEL_KEY);
    const fails = readNumber(AUTH_FAILS_KEY) + 1;
    // Primera tanda: 3 intentos. Tras una espera, cada fallo vuelve a bloquear.
    if (level > 0 || fails >= MAX_FAILED_ATTEMPTS) {
        const step = LOCKOUT_STEPS_MS[Math.min(level, LOCKOUT_STEPS_MS.length - 1)];
        writeValue(AUTH_LOCK_KEY, Date.now() + step);
        writeValue(AUTH_LEVEL_KEY, level + 1);
        writeValue(AUTH_FAILS_KEY, null);
        return 0;
    }
    writeValue(AUTH_FAILS_KEY, fails);
    return MAX_FAILED_ATTEMPTS - fails; // intentos restantes
}

function resetFailedAttempts() {
    writeValue(AUTH_FAILS_KEY, null);
    writeValue(AUTH_LEVEL_KEY, null);
    writeValue(AUTH_LOCK_KEY, null);
}

function lockedMessage(until) {
    const date = new Date(until);
    const sameDay = date.toDateString() === new Date().toDateString();
    const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const when = sameDay ? `las ${time}` : `mañana a las ${time}`;
    return `⛔ Demasiados intentos fallidos. Podrás volver a probar a ${when}.`;
}

// Pide al navegador que no borre los datos de la app (incluida la clave)
// para no tener que volver a introducirla.
function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage
            .persisted()
            .then(already => already || navigator.storage.persist())
            .catch(() => {});
    }
}

function showLockScreen(message) {
    if (document.getElementById('authOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.innerHTML = `
        <form class="auth-card" id="authForm" autocomplete="off">
            <div class="auth-logo">🔒</div>
            <h1>OTAKU HUB</h1>
            <p class="auth-sub">Acceso privado</p>
            <input type="password" id="authKeyInput" placeholder="Clave de acceso" autocomplete="current-password" required>
            <button type="submit" id="authSubmit">Entrar</button>
            <p class="auth-msg" id="authMsg"></p>
        </form>`;
    document.body.appendChild(overlay);
    document.body.classList.add('auth-locked');
    const msg = document.getElementById('authMsg');
    const input = document.getElementById('authKeyInput');
    const btn = document.getElementById('authSubmit');

    const applyLock = until => {
        input.disabled = true;
        btn.disabled = true;
        msg.textContent = lockedMessage(until);
        // Reactivar el formulario solo cuando termine la espera.
        setTimeout(
            () => {
                if (getLockUntil()) return applyLock(getLockUntil());
                input.disabled = false;
                btn.disabled = false;
                msg.textContent = 'Ya puedes volver a intentarlo.';
                input.focus();
            },
            Math.max(1000, until - Date.now() + 500)
        );
    };

    const lockUntil = getLockUntil();
    if (lockUntil) {
        applyLock(lockUntil);
        return;
    }
    if (message) msg.textContent = message;
    input.focus();

    document.getElementById('authForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        const until = getLockUntil();
        if (until) {
            applyLock(until);
            return;
        }
        const key = input.value.trim();
        if (!key) return;
        btn.disabled = true;
        btn.textContent = 'Verificando... ⏳';
        msg.textContent = '';
        const result = await verifyAccessKey(key);
        btn.disabled = false;
        btn.textContent = 'Entrar';
        if (result === 'ok') {
            setAccessKey(key);
            resetFailedAttempts();
            requestPersistentStorage();
            overlay.remove();
            document.body.classList.remove('auth-locked');
            // Cargar los datos de la vista actual con la clave ya guardada
            // y enviar lo que quedara en cola.
            if (typeof reloadActiveView === 'function') reloadActiveView();
            if (typeof flushOutbox === 'function') flushOutbox();
            return;
        }
        if (result === 'denied') {
            const remaining = registerFailedAttempt();
            input.value = '';
            if (remaining === 0) {
                applyLock(getLockUntil());
                return;
            }
            msg.textContent =
                remaining === 1 ? '❌ Clave incorrecta. Te queda 1 intento.' : `❌ Clave incorrecta. Te quedan ${remaining} intentos.`;
            input.focus();
            return;
        }
        msg.textContent = {
            timeout: '⚠️ El servidor no respondió. Revisa tu conexión.',
            network: '⚠️ No se pudo contactar con Google. Revisa tu conexión.',
            'server-outdated': '⚠️ El Apps Script aún no tiene Auth.gs desplegado (ver docs/SEGURIDAD.md).'
        }[result];
        input.select();
    });
}

async function otakuLogout() {
    const ok = await confirmDialog({
        title: 'Cerrar sesión',
        message: 'Tendrás que volver a introducir la clave en este dispositivo. También se borrará la copia de tus listas guardada en él.',
        confirmText: 'Cerrar sesión'
    });
    if (!ok) return;
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (e) {}
    forgetLocalData();
    showLockScreen('Sesión cerrada en este dispositivo.');
}

// El servidor rechazó la clave guardada (p. ej. la cambiaste en Apps Script):
// se borra de este dispositivo y se pide de nuevo. No cuenta como intento fallido.
// Borra los datos privados que la app guarda en el dispositivo (copia de las
// hojas en IndexedDB y listas en memoria). La cola de cambios pendientes se
// conserva: no contiene la clave y se envía al volver a entrar.
function forgetLocalData() {
    if (typeof clearSheetSnapshots === 'function') clearSheetSnapshots();
    if (typeof _masterData !== 'undefined') {
        _masterData = [];
        _mangaData = [];
        _favsRawData = [];
    }
}

function onAccessRevoked() {
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (e) {}
    forgetLocalData();
    showLockScreen('🔑 Tu clave ya no es válida. Introduce la clave actual.');
}

// Al cargar: si hay clave guardada, entrar directamente; si no, bloquear.
if (getAccessKey()) requestPersistentStorage();
else showLockScreen();
