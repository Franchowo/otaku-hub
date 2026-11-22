// =====================================================================
// UTILIDADES COMPARTIDAS
// =====================================================================

// Escapa texto para insertarlo con innerHTML (contenido o atributos).
// Úsalo SIEMPRE con datos que vengan de Sheets, AniList o del usuario:
// un título con comillas o "<" no debe romper el HTML ni ejecutar nada.
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// Argumento seguro para atributos onclick="fn(...)".
// Ej: onclick="filterByStudioDirect(${jsArg(nombre)})"
function jsArg(value) {
    return esc(JSON.stringify(String(value ?? '')));
}

// Convierte el HTML de las sinopsis de AniList en texto plano seguro.
// DOMParser crea un documento inerte: no ejecuta scripts ni carga imágenes.
function htmlToText(html) {
    const withBreaks = String(html ?? '').replace(/<br\s*\/?>/gi, '\n');
    return new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent || '';
}

// ---------------------------------------------------------------------
// ESTADO DE ERROR DE UNA VISTA
// Sustituye a los spinners infinitos cuando falla una carga.
// ---------------------------------------------------------------------
function reloadActiveView() {
    const view = document.querySelector('.view.active');
    if (view) switchView(view.id);
}

function showViewError(message, retry = reloadActiveView) {
    const view = document.querySelector('.view.active');
    if (!view) return;
    view.querySelectorAll('.loader').forEach(l => { l.style.display = 'none'; });

    let box = view.querySelector('.load-error');
    if (!box) {
        box = document.createElement('div');
        box.className = 'load-error';
        const heading = view.querySelector('h2');
        if (heading) heading.after(box); else view.prepend(box);
    }
    box.innerHTML = `<p>⚠️ ${esc(message)}</p><button type="button" class="btn-reload">🔄 Reintentar</button>`;
    box.querySelector('button').addEventListener('click', () => { box.remove(); retry(); });
}

function clearViewErrors() {
    document.querySelectorAll('.load-error').forEach(box => box.remove());
}
