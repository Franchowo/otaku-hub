// =====================================================================
// COMPONENTES DE INTERFAZ: avisos (toasts) y diálogos
// ---------------------------------------------------------------------
// Sustituyen a alert()/confirm(), que bloquean la app, no se pueden
// estilizar y en la PWA instalada muestran la URL del sitio.
// =====================================================================

// toast('Guardado', { type: 'success' | 'error' | 'info', action: { label, onClick }, duration })
function toast(message, { type = 'info', action = null, duration } = {}) {
    let region = document.getElementById('toastRegion');
    if (!region) {
        region = document.createElement('div');
        region.id = 'toastRegion';
        region.className = 'toast-region';
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
    }

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const icon = { success: '✔️', error: '⚠️', info: 'ℹ️' }[type] || '';
    el.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon}</span><span class="toast-text">${esc(message)}</span>`;

    let timer;
    const close = () => {
        clearTimeout(timer);
        el.classList.add('toast--leaving');
        setTimeout(() => el.remove(), 250);
    };

    if (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
            close();
            action.onClick();
        });
        el.appendChild(btn);
    }
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Cerrar aviso');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', close);
    el.appendChild(closeBtn);

    // Como mucho 3 avisos a la vez: el más antiguo deja sitio al nuevo.
    while (region.children.length >= 3) region.firstElementChild.remove();
    region.appendChild(el);
    // Los errores y los avisos con "Deshacer" duran más para dar tiempo a leerlos.
    const ms = duration ?? (action ? 7000 : type === 'error' ? 8000 : 3500);
    timer = setTimeout(close, ms);
    return close;
}

// Atajo para quitar un elemento con opción de deshacer.
function toastUndo(message, onUndo) {
    return toast(message, { type: 'info', action: { label: 'Deshacer', onClick: onUndo } });
}

// const ok = await confirmDialog({ title, message, confirmText, danger: true })
function confirmDialog({ title = '¿Seguro?', message = '', confirmText = 'Aceptar', cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.innerHTML = `
            <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialogTitle" aria-describedby="dialogMsg">
                <h3 class="dialog-title" id="dialogTitle">${esc(title)}</h3>
                <p class="dialog-msg" id="dialogMsg">${esc(message)}</p>
                <div class="dialog-actions">
                    <button type="button" class="btn btn--ghost" data-answer="no">${esc(cancelText)}</button>
                    <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-answer="yes">${esc(confirmText)}</button>
                </div>
            </div>`;

        const finish = answer => {
            document.removeEventListener('keydown', onKey, true);
            overlay.remove();
            if (previousFocus && previousFocus.focus) previousFocus.focus();
            resolve(answer);
        };
        const onKey = e => {
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            }
            if (e.key === 'Tab') {
                // mantener el foco dentro del diálogo
                const buttons = [...overlay.querySelectorAll('button')];
                const idx = buttons.indexOf(document.activeElement);
                e.preventDefault();
                buttons[(idx + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
            }
        };

        overlay.addEventListener('click', e => {
            if (e.target === overlay) finish(false);
            const answer = e.target.closest('[data-answer]');
            if (answer) finish(answer.dataset.answer === 'yes');
        });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);
        // En acciones peligrosas el foco empieza en "Cancelar".
        overlay.querySelector(danger ? '[data-answer="no"]' : '[data-answer="yes"]').focus();
    });
}

// const n = await promptNumberDialog({ title, message, value, min, max }) -> número o null
function promptNumberDialog({ title = '', message = '', value = '', min = 1, max = 9999, confirmText = 'Aceptar' } = {}) {
    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.innerHTML = `
            <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
                <h3 class="dialog-title" id="dialogTitle">${esc(title)}</h3>
                <label class="dialog-msg" for="dialogNumber">${esc(message)}</label>
                <input type="number" id="dialogNumber" inputmode="numeric" min="${min}" max="${max}" value="${esc(value)}" required style="width:100%; box-sizing:border-box; margin-bottom: 16px;">
                <div class="dialog-actions">
                    <button type="button" class="btn btn--ghost" data-answer="no">Cancelar</button>
                    <button type="submit" class="btn btn--primary">${esc(confirmText)}</button>
                </div>
            </form>`;
        const input = overlay.querySelector('input');
        const finish = answer => {
            overlay.remove();
            if (previousFocus && previousFocus.focus) previousFocus.focus();
            resolve(answer);
        };
        overlay.querySelector('form').addEventListener('submit', e => {
            e.preventDefault();
            const n = parseInt(input.value, 10);
            if (Number.isNaN(n) || n < min || n > max) {
                input.setCustomValidity(`Entre ${min} y ${max}`);
                input.reportValidity();
                return;
            }
            finish(n);
        });
        input.addEventListener('input', () => input.setCustomValidity(''));
        overlay.addEventListener('click', e => {
            if (e.target === overlay || e.target.closest('[data-answer="no"]')) finish(null);
        });
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(null);
            }
        });
        document.body.appendChild(overlay);
        input.focus();
        input.select();
    });
}

// ---------------------------------------------------------------------
// ACCESIBILIDAD: elementos con role="button" (tarjetas clicables) se
// activan con Enter/Espacio, como un botón de verdad.
// ---------------------------------------------------------------------
document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest && e.target.closest('[role="button"]');
    if (!el || el !== e.target || el.tagName === 'BUTTON') return;
    e.preventDefault();
    el.click();
});

// ---------------------------------------------------------------------
// TEMPORADAS Y FECHAS
// Los datos guardan la temporada en inglés (Winter…); se muestra en español.
// ---------------------------------------------------------------------
const SEASON_LABELS = { Winter: 'Invierno', Spring: 'Primavera', Summer: 'Verano', Fall: 'Otoño' };

function seasonLabel(season) {
    if (!season) return '';
    const key = String(season).charAt(0).toUpperCase() + String(season).slice(1).toLowerCase();
    return SEASON_LABELS[key] || season;
}

// Temporada de anime actual según el mes (Invierno = ene-mar, etc.).
function currentAnimeSeason(date = new Date()) {
    return ['Winter', 'Spring', 'Summer', 'Fall'][Math.floor(date.getMonth() / 3)];
}

// Rellena años y temporadas por defecto con la fecha real (antes: 2026/Summer fijos).
function applyDateDefaults() {
    const year = new Date().getFullYear();
    ['year', 'mangaYear', 'planYearSelect'].forEach(id => {
        const el = document.getElementById(id);
        // defaultValue también, para que form.reset() vuelva al año actual.
        if (el) {
            el.defaultValue = el.value = year;
            el.max = year + 2;
        }
    });
    const season = currentAnimeSeason();
    ['season', 'planSeasonSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        [...el.options].forEach(opt => {
            opt.defaultSelected = opt.value === season;
        });
        el.value = season;
    });
}

// Los scripts se cargan al final del <body>: el formulario ya existe.
applyDateDefaults();
