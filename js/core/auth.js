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
    try { return localStorage.getItem(AUTH_STORAGE_KEY) || ''; } catch (e) { return ''; }
}

function setAccessKey(key) {
    try { localStorage.setItem(AUTH_STORAGE_KEY, key); } catch (e) { /* almacenamiento bloqueado */ }
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
    return new Promise((resolve) => {
        const cbName = '__otakuAuthCb_' + Date.now();
        const script = document.createElement('script');
        const cleanup = () => { delete window[cbName]; script.remove(); clearTimeout(timer); };
        const timer = setTimeout(() => { cleanup(); resolve('timeout'); }, 15000);
        window[cbName] = (res) => {
            cleanup();
            if (res && res.auth === 'ok') resolve('ok');
            else if (res && res.message === 'UNAUTHORIZED') resolve('denied');
            else resolve('server-outdated');
        };
        script.onerror = () => { cleanup(); resolve('network'); };
        script.src = `${WEB_APP_URL}?action=ping&key=${encodeURIComponent(key)}&callback=${cbName}&_=${Date.now()}`;
        document.body.appendChild(script);
    });
}

// ---------------------------------------------------------------------
// BLOQUEO POR INTENTOS FALLIDOS (por dispositivo/navegador)
// Tras MAX_FAILED_ATTEMPTS claves incorrectas, este dispositivo queda
// bloqueado LOCKOUT_MS. Es por dispositivo a propósito: un bloqueo en el
// servidor permitiría a cualquiera bloquearte a ti fallando 3 veces.
// ---------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const AUTH_FAILS_KEY = 'otaku_hub_auth_fails';
const AUTH_LOCK_KEY = 'otaku_hub_auth_lock_until';

function readNumber(storageKey) {
    try { return parseInt(localStorage.getItem(storageKey), 10) || 0; } catch (e) { return 0; }
}

function writeValue(storageKey, value) {
    try {
        if (value === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, String(value));
    } catch (e) { /* almacenamiento bloqueado */ }
}

function getLockUntil() {
    const until = readNumber(AUTH_LOCK_KEY);
    if (until && Date.now() >= until) {       // el bloqueo ya expiró
        writeValue(AUTH_LOCK_KEY, null);
        writeValue(AUTH_FAILS_KEY, null);
        return 0;
    }
    return until;
}

function registerFailedAttempt() {
    const fails = readNumber(AUTH_FAILS_KEY) + 1;
    if (fails >= MAX_FAILED_ATTEMPTS) {
        writeValue(AUTH_LOCK_KEY, Date.now() + LOCKOUT_MS);
        writeValue(AUTH_FAILS_KEY, null);
        return 0;
    }
    writeValue(AUTH_FAILS_KEY, fails);
    return MAX_FAILED_ATTEMPTS - fails;        // intentos restantes
}

function lockedMessage(until) {
    const date = new Date(until).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    return `⛔ Demasiados intentos fallidos. Acceso bloqueado en este dispositivo hasta el ${date}.`;
}

// Pide al navegador que no borre los datos de la app (incluida la clave)
// para no tener que volver a introducirla.
function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persisted()
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

    const applyLock = (until) => {
        input.disabled = true; btn.disabled = true;
        msg.textContent = lockedMessage(until);
    };

    const lockUntil = getLockUntil();
    if (lockUntil) { applyLock(lockUntil); return; }
    if (message) msg.textContent = message;
    input.focus();

    document.getElementById('authForm').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const until = getLockUntil();
        if (until) { applyLock(until); return; }
        const key = input.value.trim();
        if (!key) return;
        btn.disabled = true; btn.textContent = 'Verificando... ⏳'; msg.textContent = '';
        const result = await verifyAccessKey(key);
        btn.disabled = false; btn.textContent = 'Entrar';
        if (result === 'ok') {
            setAccessKey(key);
            writeValue(AUTH_FAILS_KEY, null);
            requestPersistentStorage();
            overlay.remove();
            document.body.classList.remove('auth-locked');
            return;
        }
        if (result === 'denied') {
            const remaining = registerFailedAttempt();
            input.value = '';
            if (remaining === 0) { applyLock(getLockUntil()); return; }
            msg.textContent = remaining === 1
                ? '❌ Clave incorrecta. Te queda 1 intento.'
                : `❌ Clave incorrecta. Te quedan ${remaining} intentos.`;
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

function otakuLogout() {
    if (!confirm('¿Cerrar sesión en este dispositivo? Tendrás que volver a introducir la clave.')) return;
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) {}
    showLockScreen('Sesión cerrada en este dispositivo.');
}

// El servidor rechazó la clave guardada (p. ej. la cambiaste en Apps Script):
// se borra de este dispositivo y se pide de nuevo. No cuenta como intento fallido.
function onAccessRevoked() {
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) {}
    showLockScreen('🔑 Tu clave ya no es válida. Introduce la clave actual.');
}

// Al cargar: si hay clave guardada, entrar directamente; si no, bloquear.
if (getAccessKey()) requestPersistentStorage();
else showLockScreen();
