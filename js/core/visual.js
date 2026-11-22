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

// Curva "sale rápido y se posa suave" (easeOutExpo aproximada): se usa en
// todas las animaciones de entrada para que se sientan de la misma familia.
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';

const EASINGS = {
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))
};

// Anima una copia de la imagen `src` desde el rectángulo `from` hasta `to`.
// `to` puede ser una función: se consulta en cada fotograma, así la copia
// sigue a su destino aunque este se mueva (la ficha sube o crece al llegar
// los datos de AniList). Se animan posición y tamaño (no una escala) para
// que la portada no se deforme; a mitad de camino sube un poco (arco) y su
// sombra crece, como si se levantara de la tarjeta. La copia vive en <body>
// y se borra al terminar.
function flyElement(src, from, to, { duration = 420, radiusFrom = 8, radiusTo = 12, lift = true, easing = 'inOut' } = {}) {
    const target = typeof to === 'function' ? to : () => to;
    // Si el destino es fijo, debe verse; si es una función, quien llama ya lo comprobó.
    if (!src || !rectOnScreen(from) || (typeof to !== 'function' && !rectOnScreen(to)) || prefersReducedMotion()) return null;
    const ghost = document.createElement('img');
    ghost.src = src;
    ghost.alt = '';
    ghost.className = 'fly-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ghost);
    const ease = EASINGS[easing] || EASINGS.inOut;
    const lerp = (a, b, k) => a + (b - a) * k;
    const start = performance.now();
    const place = now => {
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);
        const r = target();
        const bump = Math.sin(Math.PI * t); // 0 → 1 → 0
        const arc = lift ? Math.min(60, Math.hypot(r.left - from.left, r.top - from.top) * 0.12) * bump : 0;
        Object.assign(ghost.style, {
            left: `${lerp(from.left, r.left, k)}px`,
            top: `${lerp(from.top, r.top, k) - arc}px`,
            width: `${lerp(from.width, r.width, k)}px`,
            height: `${lerp(from.height, r.height, k)}px`,
            borderRadius: `${lerp(radiusFrom, radiusTo, k)}px`,
            boxShadow: `0 ${Math.round(8 + 22 * bump)}px ${Math.round(16 + 40 * bump)}px rgba(0, 0, 0, ${(0.25 + 0.3 * bump).toFixed(2)})`
        });
        return t;
    };
    place(start);
    const done = new Promise(resolve => {
        const frame = now => {
            if (place(now) < 1 && ghost.isConnected) requestAnimationFrame(frame);
            else {
                ghost.remove();
                resolve();
            }
        };
        requestAnimationFrame(frame);
    });
    return { done };
}

// Entrada escalonada de elementos (cada uno un poco después del anterior).
function staggerIn(elements, { delay = 0, step = 45, distance = 10, duration = 460 } = {}) {
    if (prefersReducedMotion() || !document.body.animate) return;
    [...elements].forEach((el, i) => {
        el.animate(
            [
                { opacity: 0, transform: `translateY(${distance}px)` },
                { opacity: 1, transform: 'none' }
            ],
            { duration, delay: delay + i * step, easing: EASE_OUT, fill: 'backwards' }
        );
    });
}
