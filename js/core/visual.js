// =====================================================================
// DETALLES VISUALES
// ---------------------------------------------------------------------
// - emptyStateHTML(): pantallas vacías con una ilustración sencilla, un
//   título, una explicación y un botón que lleva a la acción útil.
// - prefersReducedMotion(): las animaciones se saltan si el sistema pide
//   reducir el movimiento.
// - flyElement(): anima una copia de una imagen de un sitio a otro de la
//   pantalla (la portada que tocas "vuela" hasta la ficha de la obra).
// =====================================================================

// Ilustraciones de línea (viewBox 120×100). Colores por clase en styles.css.
const EMPTY_ART = {
    search: `<circle class="es-line" cx="52" cy="46" r="20"/><path class="es-line es-thick" d="M67 61l17 17"/><path class="es-dot" d="M44 40a10 10 0 0 1 10-6"/><path class="es-accent" d="M88 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>`,
    collection: `<rect class="es-line" x="30" y="30" width="34" height="48" rx="4" transform="rotate(-10 47 54)"/><rect class="es-line es-fill" x="50" y="24" width="36" height="52" rx="4"/><path class="es-accent" d="M63 42l12 8-12 8z"/><path class="es-accent" d="M92 22l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/>`,
    manga: `<path class="es-line es-fill" d="M60 34c-8-6-20-8-30-6v44c10-2 22 0 30 6 8-6 20-8 30-6V28c-10-2-22 0-30 6z"/><path class="es-line" d="M60 34v44"/><path class="es-dot" d="M38 42h12M38 50h12M70 42h12M70 50h8"/><path class="es-accent" d="M94 18l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/>`,
    trophy: `<path class="es-line es-fill" d="M44 26h32v14c0 10-7 18-16 18s-16-8-16-18z"/><path class="es-line" d="M44 31H34c0 9 5 14 11 14M76 31h10c0 9-5 14-11 14M60 58v10M48 76h24M52 68h16v8H52z"/><path class="es-accent" d="M60 33l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z"/>`,
    calendar: `<rect class="es-line es-fill" x="32" y="28" width="56" height="48" rx="6"/><path class="es-line" d="M32 42h56M45 22v12M75 22v12"/><path class="es-dot" d="M44 54h4M58 54h4M72 54h4M44 65h4M58 65h4"/><path class="es-accent" d="M71 62l4 4 8-9"/>`,
    heart: `<path class="es-line es-fill" d="M60 78S32 62 32 43c0-9 7-15 15-15 6 0 10 3 13 8 3-5 7-8 13-8 8 0 15 6 15 15 0 19-28 35-28 35z"/><path class="es-accent" d="M90 20l2 4 4 2-4 2-2 4-2-4-4-2 4-2zM26 70l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z"/>`,
    studio: `<path class="es-line es-fill" d="M30 78V44l18-10v10l18-10v10l18-10v44z"/><path class="es-line" d="M24 78h72"/><path class="es-dot" d="M40 58h6M54 58h6M68 58h6M40 68h6M68 68h6"/><path class="es-accent" d="M56 66h8v12h-8z"/>`,
    signal: `<path class="es-line" d="M40 64a28 28 0 0 1 40 0M47 71a18 18 0 0 1 26 0"/><circle class="es-accent-fill" cx="60" cy="78" r="3"/><path class="es-line es-thick" d="M36 34l48 48"/>`
};

// actions: [{ label, onclick, accent }] (onclick es código para el atributo onclick)
function emptyStateHTML({ art = 'search', title, text = '', actions = [], compact = false }) {
    const buttons = actions
        .map(
            a => `<button type="button" class="chip-btn accent-${a.accent || 'cyan'}" onclick="${esc(a.onclick)}">${esc(a.label)}</button>`
        )
        .join('');
    return `
        <div class="empty-state${compact ? ' empty-state--compact' : ''}">
            <svg class="empty-art" viewBox="0 0 120 100" aria-hidden="true" focusable="false"><circle class="es-bg" cx="60" cy="52" r="44"/>${EMPTY_ART[art] || EMPTY_ART.search}</svg>
            <p class="empty-title">${esc(title)}</p>
            ${text ? `<p class="empty-text">${esc(text)}</p>` : ''}
            ${buttons ? `<div class="empty-actions">${buttons}</div>` : ''}
        </div>`;
}

// Lleva el foco a un buscador de la vista (y lo hace visible).
function focusField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
}

function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Un rectángulo está (al menos en parte) dentro de la pantalla.
function rectOnScreen(r) {
    return r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
}

// Anima una copia de la imagen `src` desde el rectángulo `from` hasta `to`.
// No toca el DOM de la app: la copia vive en <body> y se borra al terminar.
function flyElement(src, from, to, { duration = 320, radiusFrom = 8, radiusTo = 12 } = {}) {
    if (!src || !rectOnScreen(from) || !rectOnScreen(to) || prefersReducedMotion() || !document.body.animate) return null;
    const ghost = document.createElement('img');
    ghost.src = src;
    ghost.alt = '';
    ghost.className = 'fly-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    document.body.appendChild(ghost);
    const sx = from.width / to.width,
        sy = from.height / to.height;
    const anim = ghost.animate(
        [
            {
                transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`,
                borderRadius: `${radiusFrom}px`
            },
            { transform: 'none', borderRadius: `${radiusTo}px` }
        ],
        { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    );
    const done = anim.finished.catch(() => {}).then(() => ghost.remove());
    return { anim, done };
}
