// =====================================================================
// GRÁFICOS LIGEROS (sin librerías)
// ---------------------------------------------------------------------
// Reglas: un solo eje por gráfico, marcas finas (barras ≤ 24px con el
// extremo redondeado y la base recta, línea de 2px, puntos ≥ 8px con
// anillo), rejilla de 1px discreta, etiquetas solo donde aportan, tooltip
// con ratón Y teclado, y una tabla equivalente para cada gráfico.
// Colores validados contra el fondo de la app (ver css "viz-").
// Todo texto que viene de datos se escapa con esc().
// =====================================================================

// --- Tooltip común: cualquier elemento con data-tip (texto; \n = salto) ---
(function setupChartTooltip() {
    const tip = document.createElement('div');
    tip.className = 'viz-tooltip';
    tip.setAttribute('role', 'status');
    tip.hidden = true;
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tip));

    const show = (el, x, y) => {
        const lines = el.getAttribute('data-tip').split('\n');
        tip.replaceChildren(...lines.map((line, i) => { const s = document.createElement(i === 0 ? 'strong' : 'span'); s.textContent = line; return s; }));
        tip.hidden = false;
        const r = tip.getBoundingClientRect();
        const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
        const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
        tip.style.left = `${left}px`; tip.style.top = `${top}px`;
    };
    let focusedEl = null;   // si el tooltip lo abrió el teclado, se recoloca al hacer scroll
    const hide = () => { tip.hidden = true; focusedEl = null; };
    const showForFocus = el => { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); };
    document.addEventListener('pointermove', e => {
        const el = e.target.closest && e.target.closest('[data-tip]');
        if (el) show(el, e.clientX, e.clientY); else if (!tip.hidden) hide();
    });
    document.addEventListener('focusin', e => {
        const el = e.target.closest && e.target.closest('[data-tip]');
        if (!el) return hide();
        focusedEl = el;
        showForFocus(el);
    });
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', () => { if (focusedEl) showForFocus(focusedEl); else if (!tip.hidden) hide(); }, { passive: true });
})();

// --- Tabla equivalente (accesible y sin depender del color) ---
function vizTable(caption, headers, rows) {
    return `<details class="viz-table"><summary>Ver como tabla</summary>
        <table><caption>${esc(caption)}</caption>
            <thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></details>`;
}

const fmt1 = n => (Math.round(n * 10) / 10).toFixed(1);
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt1(Math.abs(n));

// Barras divergentes alrededor de 0 (azul = por encima, rojo = por debajo).
// items: [{ label, value, tip, onclick? }]
function vizDivergingBars(items, { caption, valueLabel = 'Diferencia' } = {}) {
    const max = Math.max(0.5, ...items.map(i => Math.abs(i.value)));
    const rows = items.map(i => {
        const pct = (Math.abs(i.value) / max) * 100;
        const side = i.value >= 0 ? 'pos' : 'neg';
        return `<div class="viz-div-row" tabindex="0" data-tip="${esc(i.tip)}" ${i.onclick ? `role="button" onclick="${i.onclick}"` : ''}>
            <span class="viz-div-label">${esc(i.label)}</span>
            <span class="viz-div-track">
                <span class="viz-div-half viz-div-neg">${side === 'neg' ? `<span class="viz-bar viz-bar--neg" style="width:${pct}%"></span>` : ''}</span>
                <span class="viz-div-axis"></span>
                <span class="viz-div-half viz-div-pos">${side === 'pos' ? `<span class="viz-bar viz-bar--pos" style="width:${pct}%"></span>` : ''}</span>
            </span>
            <span class="viz-div-value">${signed(i.value)}</span>
        </div>`;
    }).join('');
    return `<div class="viz-div" role="list">${rows}</div>
        <div class="viz-legend"><span><i class="viz-swatch viz-swatch--pos"></i>Te gustó más que a la media</span><span><i class="viz-swatch viz-swatch--neg"></i>Te gustó menos</span></div>
        ${vizTable(caption, ['Obra', valueLabel], items.map(i => [i.label, signed(i.value)]))}`;
}

// Barras horizontales ordenadas (un solo color). items: [{ label, value, valueText, tip }]
function vizRankedBars(items, { caption, headers }) {
    const max = Math.max(1, ...items.map(i => i.value));
    return `<div class="viz-ranked">${items.map(i => `
        <div class="viz-ranked-row" tabindex="0" data-tip="${esc(i.tip)}">
            <span class="viz-ranked-label">${esc(i.label)}</span>
            <span class="viz-ranked-track"><span class="viz-bar viz-bar--h" style="width:${(i.value / max) * 100}%"></span></span>
            <span class="viz-ranked-value">${esc(i.valueText)}</span>
        </div>`).join('')}</div>
        ${vizTable(caption, headers, items.map(i => [i.label, ...i.tableCells]))}`;
}

// Línea (una serie) sobre años. points: [{ x: año, y, tip }]
function vizLine(points, { caption, yLabel, yMin, yMax }) {
    if (points.length < 2) return '<p class="viz-empty">Hacen falta al menos dos años con datos.</p>';
    const W = 640, H = 220, L = 34, R = 44, T = 14, B = 28;
    const xs = points.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const X = x => L + ((x - x0) / Math.max(1, x1 - x0)) * (W - L - R);
    const Y = y => T + (1 - (y - yMin) / (yMax - yMin)) * (H - T - B);
    const ticks = []; for (let t = Math.ceil(yMin); t <= yMax; t++) ticks.push(t);
    const step = Math.max(1, Math.ceil(points.length / 8));
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    const band = (W - L - R) / Math.max(1, points.length - 1);
    return `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(caption)}">
            ${ticks.map(t => `<line class="viz-grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="viz-tick" x="${L - 8}" y="${Y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
            <path class="viz-line" d="${path}"/>
            ${points.map(p => `<circle class="viz-dot" cx="${X(p.x)}" cy="${Y(p.y)}" r="4"/>`).join('')}
            ${points.map((p, i) => i % step === 0 || i === points.length - 1 ? `<text class="viz-tick" x="${X(p.x)}" y="${H - 8}" text-anchor="middle">${p.x}</text>` : '').join('')}
            <text class="viz-end-label" x="${X(last.x) + 8}" y="${Y(last.y) + 4}">${fmt1(last.y)}</text>
            ${points.map(p => `<rect class="viz-hit" x="${X(p.x) - band / 2}" y="${T}" width="${band}" height="${H - T - B}" tabindex="0" data-tip="${esc(p.tip)}"/>`).join('')}
        </svg>
        ${vizTable(caption, ['Año', yLabel], points.map(p => [p.x, fmt1(p.y)]))}`;
}

// Columnas por año (un solo color). points: [{ x: año, y, tip }]
function vizColumns(points, { caption, yLabel }) {
    const max = Math.max(1, ...points.map(p => p.y));
    const step = Math.max(1, Math.ceil(points.length / 8));
    const maxIdx = points.findIndex(p => p.y === max);
    return `<div class="viz-cols" role="img" aria-label="${esc(caption)}">${points.map((p, i) => `
        <div class="viz-col" tabindex="0" data-tip="${esc(p.tip)}">
            <span class="viz-col-value">${i === maxIdx || i === points.length - 1 ? p.y : ''}</span>
            <span class="viz-col-bar" style="height:${(p.y / max) * 100}%"></span>
            <span class="viz-col-x">${i % step === 0 || i === points.length - 1 ? p.x : ''}</span>
        </div>`).join('')}</div>
        ${vizTable(caption, ['Año', yLabel], points.map(p => [p.x, p.y]))}`;
}

// Mapa de calor (filas = años, columnas = temporadas). 5 niveles de un solo tono.
// cells: { 'Fall-2023': { value, count } }
function vizHeatmap(rows, cols, cells, { caption, colLabel }) {
    const values = Object.values(cells).map(c => c.value);
    if (!values.length) return '<p class="viz-empty">Sin datos.</p>';
    const min = Math.min(...values), max = Math.max(...values);
    const bin = v => max === min ? 4 : Math.min(4, Math.floor(((v - min) / (max - min)) * 5));
    const table = [];
    const grid = rows.map(r => `
        <span class="viz-heat-row-label">${esc(r)}</span>
        ${cols.map(c => {
            const cell = cells[`${c}-${r}`];
            if (!cell) return `<span class="viz-heat-cell viz-heat-empty" aria-hidden="true"></span>`;
            table.push([`${colLabel(c)} ${r}`, fmt1(cell.value), cell.count]);
            return `<span class="viz-heat-cell viz-seq-${bin(cell.value)}" tabindex="0" data-tip="${esc(`Media ${fmt1(cell.value)}\n${colLabel(c)} ${r} · ${cell.count} anime${cell.count === 1 ? '' : 's'}`)}"></span>`;
        }).join('')}`).join('');
    return `<div class="viz-heat" style="grid-template-columns: auto repeat(${cols.length}, 1fr)">
            <span></span>${cols.map(c => `<span class="viz-heat-col-label">${esc(colLabel(c))}</span>`).join('')}
            ${grid}
        </div>
        <div class="viz-scale"><span>${fmt1(min)}</span>${[0, 1, 2, 3, 4].map(b => `<i class="viz-seq-${b}"></i>`).join('')}<span>${fmt1(max)}</span><span class="viz-scale-note">nota media</span></div>
        ${vizTable(caption, ['Temporada', 'Nota media', 'Animes'], table)}`;
}
