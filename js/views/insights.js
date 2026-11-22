// =====================================================================
// TU PERFIL: análisis de tu colección de anime
// - Tú frente al mundo (tu nota vs la media de AniList)
// - Tus géneros
// - Evolución por año (nota media y nº de animes: dos gráficos, un eje cada uno)
// - Mapa de calor de temporadas
// =====================================================================

const SEASON_ORDER = ['Winter', 'Spring', 'Summer', 'Fall'];

async function renderInsightsView() {
    const box = document.getElementById('insightsContent');
    const loader = document.getElementById('insightsLoader');
    const linked = _masterData.filter(a => a.anilistId);
    loader.style.display = 'block';
    box.hidden = true;

    const meta = await loadMediaMeta('ANIME', linked.map(a => a.anilistId), (done, total) => {
        document.getElementById('insightsLoaderText').textContent = `Consultando AniList… ${done}/${total}`;
    });
    if (_currentView !== 'insightsView') return;

    const withMeta = linked.filter(a => meta[a.anilistId]).map(a => ({ ...a, meta: meta[a.anilistId] }));
    const missing = _masterData.length - withMeta.length;

    box.innerHTML = `
        ${missing > 0 ? `<p class="insights-note">ℹ️ Los apartados de AniList usan ${withMeta.length} de tus ${_masterData.length} animes (los vinculados).
            <button type="button" class="chip-btn accent-cyan chip-btn--sm" onclick="startAnilistLinking()">🔗 Vincular el resto</button></p>` : ''}
        <section class="insights-section" aria-labelledby="insWorld">${worldSectionHTML(withMeta)}</section>
        <section class="insights-section" aria-labelledby="insGenres">${genresSectionHTML(withMeta)}</section>
        <section class="insights-section" aria-labelledby="insYears">${yearsSectionHTML(_masterData)}</section>
        <section class="insights-section" aria-labelledby="insSeasons">${seasonsSectionHTML(_masterData)}</section>`;
    loader.style.display = 'none';
    box.hidden = false;
}

function statTile(value, label) {
    return `<div class="stat-tile"><span class="stat-value">${esc(value)}</span><span class="stat-label">${esc(label)}</span></div>`;
}

function worldSectionHTML(items) {
    const rated = items.filter(a => a.meta.averageScore);
    if (!rated.length) return `<h3 id="insWorld" class="insights-title">Tú frente al mundo</h3><p class="viz-empty">Vincula tus animes con AniList para ver esta comparación.</p>`;
    const diffs = rated.map(a => ({ a, diff: parseFloat(a.score) - a.meta.averageScore }));
    const mine = rated.reduce((s, a) => s + parseFloat(a.score), 0) / rated.length;
    const world = rated.reduce((s, a) => s + a.meta.averageScore, 0) / rated.length;
    const agree = diffs.filter(d => Math.abs(d.diff) <= 1).length / diffs.length;

    const sorted = diffs.slice().sort((x, y) => y.diff - x.diff);
    const top = sorted.slice(0, 6).filter(d => d.diff > 0);
    const bottom = sorted.slice(-6).filter(d => d.diff < 0);   // sigue el mismo orden: de la más generosa a la más dura
    const toItem = d => ({
        label: d.a.anime, value: d.diff,
        tip: `${signed(d.diff)} frente a la media\nTu nota ${d.a.score} · AniList ${fmt1(d.a.meta.averageScore)}`,
        onclick: `openWorkSheet('anime', ${jsArg(workKey(d.a, 'anime'))})`
    });
    return `
        <h3 id="insWorld" class="insights-title">Tú frente al mundo</h3>
        <div class="stat-row">
            ${statTile(fmt1(mine), 'Tu nota media')}
            ${statTile(fmt1(world), 'Media en AniList de lo que has visto')}
            ${statTile(signed(mine - world), mine >= world ? 'Puntúas por encima' : 'Puntúas por debajo')}
            ${statTile(`${Math.round(agree * 100)}%`, 'Coincides (±1 punto)')}
        </div>
        <h4 class="insights-sub">Donde más discrepas</h4>
        ${vizDivergingBars([...top, ...bottom].map(toItem), { caption: 'Animes en los que tu nota más se aleja de la media de AniList', valueLabel: 'Tu nota − media AniList' })}`;
}

function genresSectionHTML(items) {
    const agg = {};
    items.forEach(a => (a.meta.genres || []).forEach(g => {
        agg[g] = agg[g] || { count: 0, sum: 0 };
        agg[g].count++; agg[g].sum += parseFloat(a.score) || 0;
    }));
    const list = Object.entries(agg).map(([g, v]) => ({ g, count: v.count, avg: v.sum / v.count })).sort((a, b) => b.count - a.count).slice(0, 12);
    if (!list.length) return `<h3 id="insGenres" class="insights-title">Tus géneros</h3><p class="viz-empty">Sin datos de géneros todavía.</p>`;
    const fav = list.filter(x => x.count >= 3).sort((a, b) => b.avg - a.avg)[0];
    const name = g => (typeof GENRE_LABELS !== 'undefined' && GENRE_LABELS[g]) || g;
    return `
        <h3 id="insGenres" class="insights-title">Tus géneros</h3>
        <div class="stat-row">
            ${statTile(name(list[0].g), 'El que más ves')}
            ${fav ? statTile(name(fav.g), `El que mejor puntúas (${fmt1(fav.avg)})`) : ''}
        </div>
        ${vizRankedBars(list.map(x => ({
            label: name(x.g), value: x.count, valueText: `${x.count} · ${fmt1(x.avg)}⭐`,
            tip: `${x.count} animes\nNota media ${fmt1(x.avg)}`, tableCells: [x.count, fmt1(x.avg)]
        })), { caption: 'Animes por género y tu nota media en cada uno', headers: ['Género', 'Animes', 'Nota media'] })}`;
}

function yearsSectionHTML(all) {
    const byYear = {};
    all.forEach(a => { const y = parseInt(a.year, 10); if (!y) return; byYear[y] = byYear[y] || { n: 0, sum: 0 }; byYear[y].n++; byYear[y].sum += parseFloat(a.score) || 0; });
    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
    const avgPts = years.map(y => ({ x: y, y: byYear[y].sum / byYear[y].n, tip: `Media ${fmt1(byYear[y].sum / byYear[y].n)}\n${y} · ${byYear[y].n} animes` }));
    const lo = Math.max(1, Math.floor(Math.min(...avgPts.map(p => p.y)) - 0.5)), hi = Math.min(10, Math.ceil(Math.max(...avgPts.map(p => p.y)) + 0.5));
    return `
        <h3 id="insYears" class="insights-title">Tu evolución</h3>
        <h4 class="insights-sub">Nota media por año de emisión</h4>
        ${vizLine(avgPts, { caption: 'Nota media por año de emisión', yLabel: 'Nota media', yMin: lo, yMax: Math.max(hi, lo + 1) })}
        <h4 class="insights-sub">Animes por año de emisión</h4>
        ${vizColumns(years.map(y => ({ x: y, y: byYear[y].n, tip: `${byYear[y].n} animes\n${y}` })), { caption: 'Número de animes por año de emisión', yLabel: 'Animes' })}`;
}

function seasonsSectionHTML(all) {
    const cells = {}, years = new Set();
    all.forEach(a => {
        const y = parseInt(a.year, 10), s = SEASON_ORDER.find(x => x.toLowerCase() === String(a.season).toLowerCase());
        if (!y || !s) return;
        years.add(y);
        const k = `${s}-${y}`; cells[k] = cells[k] || { sum: 0, count: 0 };
        cells[k].sum += parseFloat(a.score) || 0; cells[k].count++;
    });
    Object.values(cells).forEach(c => { c.value = c.sum / c.count; });
    const rows = [...years].sort((a, b) => b - a).slice(0, 15);
    return `
        <h3 id="insSeasons" class="insights-title">Tus temporadas</h3>
        <p class="insights-help">Cada casilla es una temporada; cuanto más clara, mejor nota media. Toca una para ver el detalle.</p>
        ${vizHeatmap(rows, SEASON_ORDER, cells, { caption: 'Nota media por temporada (últimos 15 años)', colLabel: seasonLabel })}`;
}
