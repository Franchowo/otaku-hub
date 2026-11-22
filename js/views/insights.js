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

    if (!_mangaData.length) await new Promise(res => initMangaDataFetch(false, res));
    // Hojas de estado para los logros de herramientas (sin conexión se usa la copia local).
    const readState = (key, sheet) => sheetsReadOnce(key, sheet).catch(() => []);
    const extras = {
        calificador: _calificadorSavedProgress.length ? _calificadorSavedProgress : await readState('calificador', 'CALIFICADOR_STATE'),
        planificador: _planificadorInitialized ? _planificadorSavedProgress : await readState('planificador', 'PLANIFICADOR_STATE')
    };
    const meta = await loadMediaMeta(
        'ANIME',
        linked.map(a => a.anilistId),
        (done, total) => {
            document.getElementById('insightsLoaderText').textContent = `Consultando AniList… ${done}/${total}`;
        }
    );
    if (_currentView !== 'insightsView') return;

    const withMeta = linked.filter(a => meta[a.anilistId]).map(a => ({ ...a, meta: meta[a.anilistId] }));
    const missing = _masterData.length - withMeta.length;

    box.innerHTML = `
        ${
            missing > 0
                ? `<p class="insights-note">ℹ️ Los apartados de AniList usan ${withMeta.length} de tus ${_masterData.length} animes (los vinculados).
            <button type="button" class="chip-btn accent-cyan chip-btn--sm" onclick="startAnilistLinking()">🔗 Vincular el resto</button></p>`
                : ''
        }
        <section class="insights-section" aria-labelledby="insWorld">${worldSectionHTML(withMeta)}</section>
        <section class="insights-section" aria-labelledby="insGenres">${genresSectionHTML(withMeta)}</section>
        <section class="insights-section" aria-labelledby="insYears">${yearsSectionHTML(_masterData)}</section>
        <section class="insights-section" aria-labelledby="insSeasons">${seasonsSectionHTML(_masterData)}</section>
        <section class="insights-section" aria-labelledby="insAchievements">${achievementsSectionHTML(withMeta, extras)}</section>`;
    loader.style.display = 'none';
    box.hidden = false;
}

function statTile(value, label) {
    return `<div class="stat-tile"><span class="stat-value">${esc(value)}</span><span class="stat-label">${esc(label)}</span></div>`;
}

function worldSectionHTML(items) {
    const rated = items.filter(a => a.meta.averageScore);
    if (!rated.length)
        return `<h3 id="insWorld" class="insights-title">Tú frente al mundo</h3><p class="viz-empty">Vincula tus animes con AniList para ver esta comparación.</p>`;
    const diffs = rated.map(a => ({ a, diff: parseFloat(a.score) - a.meta.averageScore }));
    const mine = rated.reduce((s, a) => s + parseFloat(a.score), 0) / rated.length;
    const world = rated.reduce((s, a) => s + a.meta.averageScore, 0) / rated.length;
    const agree = diffs.filter(d => Math.abs(d.diff) <= 1).length / diffs.length;

    const sorted = diffs.slice().sort((x, y) => y.diff - x.diff);
    const top = sorted.slice(0, 6).filter(d => d.diff > 0);
    const bottom = sorted.slice(-6).filter(d => d.diff < 0); // sigue el mismo orden: de la más generosa a la más dura
    const toItem = d => ({
        label: d.a.anime,
        value: d.diff,
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
    items.forEach(a =>
        (a.meta.genres || []).forEach(g => {
            agg[g] = agg[g] || { count: 0, sum: 0 };
            agg[g].count++;
            agg[g].sum += parseFloat(a.score) || 0;
        })
    );
    const list = Object.entries(agg)
        .map(([g, v]) => ({ g, count: v.count, avg: v.sum / v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);
    if (!list.length)
        return `<h3 id="insGenres" class="insights-title">Tus géneros</h3><p class="viz-empty">Sin datos de géneros todavía.</p>`;
    const fav = list.filter(x => x.count >= 3).sort((a, b) => b.avg - a.avg)[0];
    const name = g => (typeof GENRE_LABELS !== 'undefined' && GENRE_LABELS[g]) || g;
    return `
        <h3 id="insGenres" class="insights-title">Tus géneros</h3>
        <div class="stat-row">
            ${statTile(name(list[0].g), 'El que más ves')}
            ${fav ? statTile(name(fav.g), `El que mejor puntúas (${fmt1(fav.avg)})`) : ''}
        </div>
        ${vizRankedBars(
            list.map(x => ({
                label: name(x.g),
                value: x.count,
                valueText: `${x.count} · ${fmt1(x.avg)}⭐`,
                tip: `${x.count} animes\nNota media ${fmt1(x.avg)}`,
                tableCells: [x.count, fmt1(x.avg)]
            })),
            { caption: 'Animes por género y tu nota media en cada uno', headers: ['Género', 'Animes', 'Nota media'] }
        )}`;
}

function yearsSectionHTML(all) {
    const byYear = {};
    all.forEach(a => {
        const y = parseInt(a.year, 10);
        if (!y) return;
        byYear[y] = byYear[y] || { n: 0, sum: 0 };
        byYear[y].n++;
        byYear[y].sum += parseFloat(a.score) || 0;
    });
    const years = Object.keys(byYear)
        .map(Number)
        .sort((a, b) => a - b);
    const avgPts = years.map(y => ({
        x: y,
        y: byYear[y].sum / byYear[y].n,
        tip: `Media ${fmt1(byYear[y].sum / byYear[y].n)}\n${y} · ${byYear[y].n} animes`
    }));
    const lo = Math.max(1, Math.floor(Math.min(...avgPts.map(p => p.y)) - 0.5)),
        hi = Math.min(10, Math.ceil(Math.max(...avgPts.map(p => p.y)) + 0.5));
    return `
        <h3 id="insYears" class="insights-title">Tu evolución</h3>
        <h4 class="insights-sub">Nota media por año de emisión</h4>
        ${vizLine(avgPts, { caption: 'Nota media por año de emisión', yLabel: 'Nota media', yMin: lo, yMax: Math.max(hi, lo + 1) })}
        <h4 class="insights-sub">Animes por año de emisión</h4>
        ${vizColumns(
            years.map(y => ({ x: y, y: byYear[y].n, tip: `${byYear[y].n} animes\n${y}` })),
            { caption: 'Número de animes por año de emisión', yLabel: 'Animes' }
        )}`;
}

function seasonsSectionHTML(all) {
    const cells = {},
        years = new Set();
    all.forEach(a => {
        const y = parseInt(a.year, 10),
            s = SEASON_ORDER.find(x => x.toLowerCase() === String(a.season).toLowerCase());
        if (!y || !s) return;
        years.add(y);
        const k = `${s}-${y}`;
        cells[k] = cells[k] || { sum: 0, count: 0 };
        cells[k].sum += parseFloat(a.score) || 0;
        cells[k].count++;
    });
    Object.values(cells).forEach(c => {
        c.value = c.sum / c.count;
    });
    const rows = [...years].sort((a, b) => b - a).slice(0, 15);
    return `
        <h3 id="insSeasons" class="insights-title">Tus temporadas</h3>
        <p class="insights-help">Cada casilla es una temporada; cuanto más clara, mejor nota media. Toca una para ver el detalle.</p>
        ${vizHeatmap(rows, SEASON_ORDER, cells, { caption: 'Nota media por temporada (últimos 15 años)', colLabel: seasonLabel })}`;
}

// ---------------------------------------------------------------------
// LOGROS (se calculan con tus datos; no se guardan en ningún sitio)
// extras: { calificador: [...], planificador: [...] } (hojas de estado)
// ---------------------------------------------------------------------
const SEASON_INDEX = { winter: 0, spring: 1, summer: 2, fall: 3 };

// Racha más larga de temporadas consecutivas (Invierno → Primavera → … → Invierno del año siguiente) con algún anime.
function longestSeasonStreak(all) {
    const keys = [
        ...new Set(
            all
                .map(a => {
                    const y = parseInt(a.year, 10),
                        s = SEASON_INDEX[String(a.season).toLowerCase()];
                    return y && s !== undefined ? y * 4 + s : null;
                })
                .filter(k => k !== null)
        )
    ].sort((a, b) => a - b);
    let best = 0,
        run = 0;
    keys.forEach((k, i) => {
        run = i > 0 && k === keys[i - 1] + 1 ? run + 1 : 1;
        best = Math.max(best, run);
    });
    return best;
}

// ¿Hay algún año con al menos `min` animes en cada una de sus 4 temporadas? Devuelve las temporadas cubiertas del mejor año (0-4).
function bestFullYear(all, min) {
    const perYear = {};
    all.forEach(a => {
        const y = parseInt(a.year, 10),
            s = SEASON_INDEX[String(a.season).toLowerCase()];
        if (!y || s === undefined) return;
        perYear[y] = perYear[y] || [0, 0, 0, 0];
        perYear[y][s]++;
    });
    return Math.max(0, ...Object.values(perYear).map(counts => counts.filter(c => c >= min).length));
}

function completedCalificaciones(list) {
    return (list || []).filter(item => {
        let scores = item.scores;
        if (typeof scores === 'string') {
            try {
                scores = JSON.parse(scores);
            } catch (e) {
                scores = [];
            }
        }
        return Array.isArray(scores) && scores.some(cp => cp && cp.isFinal && cp.completed);
    }).length;
}

const ACHIEVEMENT_CATEGORIES = ['Colección', 'Constancia', 'Criterio', 'Herramientas'];

function computeAchievements(items, extras = {}) {
    const all = _masterData,
        mangas = _mangaData;
    const count = (arr, fn) => arr.filter(fn).length;
    const studios = {},
        seasons = {},
        decades = new Set(),
        genres = new Set();
    all.forEach(a => {
        String(a.studio || '')
            .split(/,|\s+&\s+|\s+and\s+/i)
            .map(s => s.trim())
            .filter(s => s && s !== 'Desconocido')
            .forEach(s => {
                studios[s] = (studios[s] || 0) + 1;
            });
        const y = parseInt(a.year, 10);
        if (y) {
            decades.add(Math.floor(y / 10));
            seasons[`${a.season}-${y}`] = (seasons[`${a.season}-${y}`] || 0) + 1;
        }
    });
    items.forEach(a => (a.meta.genres || []).forEach(g => genres.add(g)));
    const maxOf = obj => Math.max(0, ...Object.values(obj));
    const avg = all.length ? all.reduce((s, a) => s + (parseFloat(a.score) || 0), 0) / all.length : 0;
    const thisYear = new Date().getFullYear();
    const vsWorld = items.filter(a => a.meta.averageScore).map(a => parseFloat(a.score) - a.meta.averageScore);
    const ranker = readStoredJSON('ranker_data_v2', null);
    const planned = (extras.planificador || []).filter(p => p.status && p.status !== 'default').length;

    return [
        // Colección
        { cat: 'Colección', icon: '📺', name: 'Centenario', desc: '100 animes registrados', value: all.length, goal: 100 },
        { cat: 'Colección', icon: '🏯', name: 'Leyenda', desc: '500 animes registrados', value: all.length, goal: 500 },
        { cat: 'Colección', icon: '📚', name: 'Lector voraz', desc: '50 mangas registrados', value: mangas.length, goal: 50 },
        { cat: 'Colección', icon: '📖', name: 'Biblioteca', desc: '200 mangas registrados', value: mangas.length, goal: 200 },
        {
            cat: 'Colección',
            icon: '🎨',
            name: 'Coleccionista de estudios',
            desc: 'Animes de 30 estudios distintos',
            value: Object.keys(studios).length,
            goal: 30
        },
        {
            cat: 'Colección',
            icon: '🏛️',
            name: 'Arqueólogo',
            desc: '10 animes anteriores al año 2000',
            value: count(all, a => parseInt(a.year, 10) && parseInt(a.year, 10) < 2000),
            goal: 10
        },
        { cat: 'Colección', icon: '⏳', name: 'Viajero en el tiempo', desc: 'Animes de 4 décadas distintas', value: decades.size, goal: 4 },
        {
            cat: 'Colección',
            icon: '🆕',
            name: 'Al día',
            desc: `10 animes de ${thisYear}`,
            value: count(all, a => parseInt(a.year, 10) === thisYear),
            goal: 10
        },
        {
            cat: 'Colección',
            icon: '💯',
            name: 'Salón de la fama',
            desc: 'TOP 150 completo',
            value: readStoredJSON('saved_top150_data', []).length,
            goal: 150
        },
        // Constancia
        { cat: 'Constancia', icon: '🏢', name: 'Fiel a un estudio', desc: '15 animes del mismo estudio', value: maxOf(studios), goal: 15 },
        {
            cat: 'Constancia',
            icon: '🗓️',
            name: 'Temporada a tope',
            desc: '10 animes de una misma temporada',
            value: maxOf(seasons),
            goal: 10
        },
        {
            cat: 'Constancia',
            icon: '🔥',
            name: 'Racha de temporadas',
            desc: '8 temporadas seguidas con algún anime',
            value: longestSeasonStreak(all),
            goal: 8
        },
        {
            cat: 'Constancia',
            icon: '🌸',
            name: 'Año completo',
            desc: 'Las 4 temporadas de un año, con 3+ animes en cada una',
            value: bestFullYear(all, 3),
            goal: 4
        },
        // Criterio
        {
            cat: 'Criterio',
            icon: '💎',
            name: 'Ojo para las joyas',
            desc: '10 animes con un 10',
            value: count(all, a => parseFloat(a.score) >= 10),
            goal: 10
        },
        {
            cat: 'Criterio',
            icon: '🔨',
            name: 'Mano dura',
            desc: '5 animes con nota 3 o menos',
            value: count(all, a => parseFloat(a.score) > 0 && parseFloat(a.score) <= 3),
            goal: 5
        },
        {
            cat: 'Criterio',
            icon: '🛡️',
            name: 'Defensor',
            desc: '5 animes que puntúas 2+ puntos por encima de la media de AniList',
            value: count(vsWorld, d => d >= 2),
            goal: 5
        },
        {
            cat: 'Criterio',
            icon: '🗡️',
            name: 'Contracorriente',
            desc: '5 animes que puntúas 2+ puntos por debajo de la media de AniList',
            value: count(vsWorld, d => d <= -2),
            goal: 5
        },
        {
            cat: 'Criterio',
            icon: '🧭',
            name: 'Explorador de géneros',
            desc: '12 géneros distintos (obras vinculadas)',
            value: genres.size,
            goal: 12
        },
        {
            cat: 'Criterio',
            icon: '🧐',
            name: 'Crítico exigente',
            desc: 'Media por debajo de 7 con 50+ animes',
            value: all.length >= 50 && avg < 7 ? 1 : 0,
            goal: 1,
            binary: true
        },
        // Herramientas de la app
        {
            cat: 'Herramientas',
            icon: '🎵',
            name: 'Melómano',
            desc: 'Completar un ranking en el Opening Ranker',
            value: ranker && ranker.result && ranker.result.length ? 1 : 0,
            goal: 1,
            binary: true
        },
        {
            cat: 'Herramientas',
            icon: '🎯',
            name: 'Analista',
            desc: 'Calificar 5 animes hasta el hito final',
            value: completedCalificaciones(extras.calificador),
            goal: 5
        },
        {
            cat: 'Herramientas',
            icon: '🗄️',
            name: 'Archivero',
            desc: 'Archivar 3 años del Ranking Anual',
            value: Object.keys(readStoredJSON('annual_archive', {})).length,
            goal: 3
        },
        {
            cat: 'Herramientas',
            icon: '📅',
            name: 'Planificador nato',
            desc: '25 animes marcados en el Planificador',
            value: planned,
            goal: 25
        }
    ].map(a => ({ ...a, done: a.value >= a.goal }));
}

function achievementCardHTML(a) {
    return `
            <li class="achv${a.done ? ' achv--done' : ''}">
                <span class="achv-icon" aria-hidden="true">${a.icon}</span>
                <span class="achv-body">
                    <span class="achv-name">${esc(a.name)}${a.done ? ' <span class="achv-badge">✓ Conseguido</span>' : ''}</span>
                    <span class="achv-desc">${esc(a.desc)}</span>
                    ${
                        a.binary
                            ? ''
                            : `<span class="achv-meter" role="meter" aria-valuemin="0" aria-valuemax="${a.goal}" aria-valuenow="${Math.min(a.value, a.goal)}" aria-label="${esc(a.name)}: ${Math.min(a.value, a.goal)} de ${a.goal}">
                        <span class="achv-fill" style="width:${Math.min(100, (a.value / a.goal) * 100)}%"></span></span>
                        <span class="achv-progress">${Math.min(a.value, a.goal)} / ${a.goal}</span>`
                    }
                </span>
            </li>`;
}

function achievementsSectionHTML(items, extras) {
    const list = computeAchievements(items, extras);
    const done = list.filter(a => a.done).length;
    return `
        <h3 id="insAchievements" class="insights-title">Logros <span class="achv-count">${done} de ${list.length}</span></h3>
        ${ACHIEVEMENT_CATEGORIES.map(cat => {
            const group = list.filter(a => a.cat === cat);
            return `<h4 class="insights-sub">${cat} <span class="achv-count">${group.filter(a => a.done).length} de ${group.length}</span></h4>
                <ul class="achv-grid">${group.map(achievementCardHTML).join('')}</ul>`;
        }).join('')}`;
}
