// =====================================================================
// LISTAS REORDENABLES (ratón, dedo y teclado)
// ---------------------------------------------------------------------
// Sustituye al arrastrar-y-soltar nativo de HTML5, que no funciona en
// pantallas táctiles. Usa Pointer Events sobre el asa (⋮⋮):
// - Arrastrar el asa mueve el elemento; cerca del borde de la pantalla la
//   página se desplaza sola (imprescindible en el TOP 150 en el móvil).
// - Con el asa enfocada, ↑/↓ mueven el elemento una posición.
// makeSortable(container, { itemSelector, handleSelector, onMove(from, to) })
// onMove debe actualizar los datos y volver a pintar la lista.
// =====================================================================

function makeSortable(container, { itemSelector, handleSelector, onMove }) {
    if (!container || container.dataset.sortable) return;
    container.dataset.sortable = '1';
    const items = () => [...container.querySelectorAll(itemSelector)];

    container.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button !== 0) return;
        const handle = e.target.closest(handleSelector);
        const item = handle && handle.closest(itemSelector);
        if (!item || !container.contains(item)) return;
        e.preventDefault();

        const from = items().indexOf(item);
        let lastY = e.clientY, frame = null;
        item.classList.add('dragging');
        // Los eventos se escuchan en window: al mover el elemento en el DOM el
        // navegador suelta la captura del puntero y el asa dejaría de recibirlos.
        const pointerId = e.pointerId;

        const autoScroll = () => {
            const margin = 80;
            if (lastY < margin) window.scrollBy(0, -14);
            else if (lastY > window.innerHeight - margin) window.scrollBy(0, 14);
            frame = requestAnimationFrame(autoScroll);
        };
        frame = requestAnimationFrame(autoScroll);

        const onPointerMove = ev => {
            if (ev.pointerId !== pointerId) return;
            ev.preventDefault();
            lastY = ev.clientY;
            const under = document.elementFromPoint(ev.clientX, ev.clientY);
            const target = under && under.closest(itemSelector);
            if (!target || target === item || !container.contains(target)) return;
            const list = items();
            if (list.indexOf(target) > list.indexOf(item)) target.after(item); else target.before(item);
        };
        const finish = ev => {
            if (ev && ev.pointerId !== pointerId) return;
            cancelAnimationFrame(frame);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            item.classList.remove('dragging');
            const to = items().indexOf(item);
            if (to !== from && to !== -1) onMove(from, to);
        };
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
    });

    container.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const handle = e.target.closest(handleSelector);
        const item = handle && handle.closest(itemSelector);
        if (!item) return;
        e.preventDefault();
        const from = items().indexOf(item);
        const to = from + (e.key === 'ArrowUp' ? -1 : 1);
        if (to < 0 || to >= items().length) return;
        onMove(from, to);
        // Tras repintar, devolver el foco al asa del elemento movido.
        const moved = container.querySelectorAll(handleSelector)[to];
        if (moved) moved.focus();
    });
}

// Mueve un elemento de un array (devuelve el mismo array).
function moveInArray(array, from, to) {
    const [item] = array.splice(from, 1);
    array.splice(to, 0, item);
    return array;
}
