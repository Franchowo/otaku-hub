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
    if (message) msg.textContent = message;
    const input = document.getElementById('authKeyInput');
    input.focus();

    document.getElementById('authForm').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const key = input.value.trim();
        if (!key) return;
        const btn = document.getElementById('authSubmit');
        btn.disabled = true; btn.textContent = 'Verificando... ⏳'; msg.textContent = '';
        const result = await verifyAccessKey(key);
        btn.disabled = false; btn.textContent = 'Entrar';
        if (result === 'ok') {
            setAccessKey(key);
            overlay.remove();
            document.body.classList.remove('auth-locked');
            return;
        }
        msg.textContent = {
            denied: '❌ Clave incorrecta.',
            timeout: '⚠️ El servidor no respondió. Revisa tu conexión.',
            network: '⚠️ No se pudo contactar con Google. Revisa tu conexión.',
            'server-outdated': '⚠️ El Apps Script aún no tiene Auth.gs desplegado (ver docs/SEGURIDAD.md).'
        }[result];
        input.select();
    });
}

function otakuLogout() {
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) {}
    showLockScreen('Sesión cerrada en este dispositivo.');
}

// Al cargar: si no hay clave guardada, bloquear la app.
if (!getAccessKey()) showLockScreen();
