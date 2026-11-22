// =====================================================================
// OPENING RANKER
// ---------------------------------------------------------------------
// 1. Escribes animes (o añades los de un año de tu lista).
// 2. Se buscan sus openings en AnimeThemes (vídeo y canción) y eliges
//    cuáles entran.
// 3. Les das 1-3 estrellas: son niveles (un ★★★ siempre queda por encima
//    de un ★★) y evitan duelos innecesarios.
// 4. Duelos: dentro de cada nivel, cada opening se coloca por inserción
//    binaria (≈ n·log₂n duelos, orden coherente). Antes se sumaban +50
//    puntos al ganador en una cola rotatoria, que no daba un orden fiable.
// El progreso se guarda en el dispositivo y se puede deshacer el último duelo.
// =====================================================================

const RANKER_KEY = 'ranker_data_v2';
const ANIMETHEMES_API = 'https://api.animethemes.moe';
const TIERS = [3, 2, 1];

let state = loadRankerState();

function emptyRankerState() {
    return { step: 1, items: [], sorted: { 3: [], 2: [], 1: [] }, queue: [], current: null, history: [], result: null };
}

function loadRankerState() {
    const saved = readStoredJSON(RANKER_KEY, null);
    if (saved && saved.items) return saved;
    // Migración del formato anterior (lista de nombres con estrellas y "elo").
    const old = readStoredJSON('ranker_data', null);
    if (old && Array.isArray(old.songs) && old.songs.length) {
        const fresh = emptyRankerState();
        fresh.items = old.songs.map(s => ({
            id: String(s.id),
            anime: s.name,
            label: s.name,
            img: s.img,
            stars: s.stars || 0,
            keep: s.action !== 'discard'
        }));
        const finished = old.pool && old.pool.length && old.duelsDone >= old.duelsTotal;
        if (finished) {
            fresh.result = old.pool
                .slice()
                .sort((a, b) => b.elo - a.elo)
                .map(s => String(s.id));
            fresh.step = 4;
        } else fresh.step = 3;
        return fresh;
    }
    return emptyRankerState();
}

function save() {
    try {
        localStorage.setItem(RANKER_KEY, JSON.stringify(state));
        localStorage.removeItem('ranker_data');
    } catch (e) {
        /* almacenamiento lleno o bloqueado */
    }
}

const delay = ms => new Promise(res => setTimeout(res, ms));
const itemById = id => state.items.find(i => i.id === id);

async function resetApp() {
    const ok = await confirmDialog({
        title: 'Reiniciar Opening Ranker',
        message: 'Se borrarán la lista, las estrellas y los duelos. No se puede deshacer.',
        confirmText: 'Reiniciar',
        danger: true
    });
    if (!ok) return;
    stopAllOpenings();
    state = emptyRankerState();
    save();
    document.getElementById('input').value = '';
    goToStep(1);
    toast('Opening Ranker reiniciado.', { type: 'success' });
}

function goToStep(n) {
    state.step = n;
    save();
    stopAllOpenings();
    document.querySelectorAll('#rankerView .screen').forEach(s => s.classList.remove('active'));
    document.getElementById('step-' + n).classList.add('active');
    if (n === 1) fillRankerYears();
    if (n === 2) renderDiscard();
    if (n === 3) renderRating();
    if (n === 4) renderDuel();
}

// --- Paso 1: lista de animes ---
function fillRankerYears() {
    const select = document.getElementById('rankerImportYear');
    if (!select) return;
    const years = [...new Set(_masterData.map(a => parseInt(a.year, 10)).filter(Boolean))].sort((a, b) => b - a);
    select.innerHTML = years.length
        ? years.map(y => `<option value="${y}">${y}</option>`).join('')
        : '<option value="">(cargando tu lista…)</option>';
}

function importRankerYear() {
    const year = parseInt(document.getElementById('rankerImportYear').value, 10);
    if (!year) return;
    const input = document.getElementById('input');
    const current = new Set(
        input.value
            .split('\n')
            .map(l => l.trim().toLowerCase())
            .filter(Boolean)
    );
    const add = _masterData
        .filter(a => parseInt(a.year, 10) === year)
        .map(a => String(a.anime).trim())
        .filter(t => !current.has(t.toLowerCase()));
    input.value = [input.value.trim(), ...add].filter(Boolean).join('\n');
    toast(add.length ? `Añadidos ${add.length} animes de ${year}.` : `Ya estaban todos los de ${year}.`, { type: 'info' });
}

async function startApp() {
    const names = [
        ...new Set(
            document
                .getElementById('input')
                .value.split('\n')
                .map(l => l.trim())
                .filter(Boolean)
        )
    ];
    if (names.length === 0) return toast('Escribe al menos un anime (uno por línea).', { type: 'error' });
    const btn = document.getElementById('btn-start-ranker');
    btn.disabled = true;

    try {
        // 1) ID de AniList: de tu lista si está vinculada; si no, búsqueda (10 por consulta).
        const found = {};
        names.forEach(n => {
            const own = _masterData.find(a => String(a.anime).toLowerCase() === n.toLowerCase() && a.anilistId);
            if (own) found[n] = { id: own.anilistId, img: localStorage.getItem(`cover_id_${own.anilistId}`) };
        });
        const pending = names.filter(n => !found[n]);
        for (let i = 0; i < pending.length; i += 10) {
            btn.textContent = `Buscando animes… ${Math.min(i + 10, pending.length)}/${pending.length}`;
            const batch = pending.slice(i, i + 10);
            const defs = batch.map((_, k) => `$s${k}: String`).join(', ');
            const body = batch
                .map((_, k) => `q${k}: Page(page: 1, perPage: 1) { media(search: $s${k}, type: ANIME) { id coverImage { large } } }`)
                .join(' ');
            const vars = {};
            batch.forEach((n, k) => {
                vars[`s${k}`] = n;
            });
            try {
                const json = await fetchAnilist(`query(${defs}) { ${body} }`, vars);
                batch.forEach((n, k) => {
                    const m = json?.data?.[`q${k}`]?.media?.[0];
                    if (m) found[n] = { id: m.id, img: m.coverImage?.large };
                });
            } catch (e) {
                /* sin resultados para este bloque */
            }
            await delay(700);
        }

        // 2) Openings de cada anime (AnimeThemes).
        const items = [];
        for (let i = 0; i < names.length; i++) {
            const name = names[i],
                media = found[name];
            btn.textContent = `Buscando openings… ${i + 1}/${names.length}`;
            const themes = media ? await fetchOpeningsForAnilistId(media.id) : [];
            if (themes && themes.length) {
                themes.forEach(t =>
                    items.push({
                        id: `${media.id}-${t.slug}`,
                        anime: name,
                        anilistId: media.id,
                        img: media.img,
                        label: `${name} — ${t.slug}`,
                        slug: t.slug,
                        song: t.song,
                        artists: t.artists,
                        video: t.video,
                        keep: true,
                        stars: 0
                    })
                );
            } else {
                items.push({
                    id: `name-${i}`,
                    anime: name,
                    anilistId: media ? media.id : null,
                    img: media ? media.img : null,
                    label: name,
                    keep: true,
                    stars: 0,
                    themes: themes === null ? 'error' : 'none'
                });
            }
            if (media) await delay(400);
        }
        state = emptyRankerState();
        state.items = items;
        goToStep(2);
    } finally {
        btn.disabled = false;
        btn.textContent = '🔎 Buscar sus openings';
    }
}

// Openings (OP) de un anime por su ID de AniList. Devuelve [] si no tiene
// y null si AnimeThemes no responde. Se prueban las dos grafías del sitio
// porque la documentación no es clara sobre ellas.
async function fetchOpeningsForAnilistId(anilistId) {
    for (const site of ['AniList', 'Anilist']) {
        const url = `${ANIMETHEMES_API}/anime?filter[has]=resources&filter[site]=${site}&filter[external_id]=${anilistId}&include=animethemes.animethemeentries.videos,animethemes.song.artists`;
        let res;
        try {
            res = await fetch(url, { headers: { Accept: 'application/json' } });
        } catch (e) {
            return null;
        }
        if (res.status === 429) {
            await delay(5000);
            continue;
        }
        if (res.status >= 500) return null; // AnimeThemes caído: "no respondió", no "sin openings"
        if (!res.ok) continue;
        let json;
        try {
            json = await res.json();
        } catch (e) {
            continue;
        }
        const anime = Array.isArray(json.anime) ? json.anime[0] : null;
        if (anime) return parseAnimeThemes(anime);
    }
    return [];
}

function parseAnimeThemes(anime) {
    return (anime.animethemes || [])
        .filter(t => String(t.type).toUpperCase() === 'OP')
        .sort((a, b) => (a.sequence || 1) - (b.sequence || 1))
        .map(t => {
            const entry = (t.animethemeentries || []).find(e => (e.videos || []).length) || {};
            // El vídeo más ligero que siga viéndose bien (480p o más) para no gastar datos.
            const videos = (entry.videos || []).filter(v => v.link).sort((a, b) => (a.resolution || 9999) - (b.resolution || 9999));
            const video = videos.find(v => (v.resolution || 0) >= 480) || videos[videos.length - 1] || null;
            return {
                slug: t.slug || `OP${t.sequence || ''}`,
                song: t.song?.title || '',
                artists: (t.song?.artists || [])
                    .map(a => a.name)
                    .filter(Boolean)
                    .join(', '),
                video: video ? video.link : null
            };
        });
}

// --- Reproductor (uno a la vez) ---
function openingPlayerHTML(item) {
    if (item.video) {
        return `<button type="button" class="chip-btn accent-magenta chip-btn--sm" onclick="toggleOpening(this, ${jsArg(item.video)})">▶ Escuchar</button>`;
    }
    const q = encodeURIComponent(`${item.anime} ${item.slug || 'opening'}`);
    return `<a class="chip-btn accent-magenta chip-btn--sm" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">▶ YouTube</a>`;
}

function stopAllOpenings() {
    document.querySelectorAll('#rankerView video.opening-video').forEach(v => {
        v.pause();
        v.remove();
    });
    document.querySelectorAll('#rankerView [data-playing]').forEach(b => {
        b.textContent = '▶ Escuchar';
        delete b.dataset.playing;
    });
}

function toggleOpening(button, src) {
    const playing = button.dataset.playing;
    stopAllOpenings();
    if (playing) return;
    const video = document.createElement('video');
    video.className = 'opening-video';
    video.src = src;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'none';
    video.onerror = () => {
        toast('No se pudo reproducir este opening.', { type: 'error' });
        stopAllOpenings();
    };
    button.dataset.playing = '1';
    button.textContent = '⏸ Parar';
    button.closest('.ranker-card').appendChild(video);
}

function itemMetaHTML(item) {
    const song = item.song ? `<span class="ranker-song">🎵 ${esc(item.song)}${item.artists ? ` · ${esc(item.artists)}` : ''}</span>` : '';
    const note =
        item.themes === 'none'
            ? '<span class="ranker-song">Sin openings en AnimeThemes</span>'
            : item.themes === 'error'
              ? '<span class="ranker-song">AnimeThemes no respondió</span>'
              : '';
    return `<span class="ranker-title">${esc(item.label)}</span>${song}${note}`;
}

function coverHTML(item, size = '') {
    return `<span class="img-container ${size}"><img src="${esc(item.img || FALLBACK_IMG)}" class="img-thumb" alt="" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';"></span>`;
}

// --- Paso 2: elegir openings ---
function renderDiscard() {
    const kept = state.items.filter(i => i.keep).length;
    document.getElementById('ranker-discard-count').textContent = `${kept} de ${state.items.length} openings seleccionados`;
    document.getElementById('discard-list').innerHTML = state.items
        .map(
            s => `
        <div class="list-item ranker-card ${s.keep ? 'item-keep' : 'item-discard'}">
            ${coverHTML(s)}
            <div class="ranker-info">${itemMetaHTML(s)}</div>
            <div class="ranker-actions">
                ${openingPlayerHTML(s)}
                <button type="button" class="btn-icon ${s.keep ? 'btn-keep' : 'btn-discard'}" onclick="markItem(${jsArg(s.id)})" aria-pressed="${s.keep}" aria-label="${s.keep ? 'Quitar' : 'Incluir'} ${esc(s.label)}">${s.keep ? '✔' : '✕'}</button>
            </div>
        </div>`
        )
        .join('');
}

function markItem(id) {
    const item = itemById(String(id));
    if (item) item.keep = !item.keep;
    save();
    renderDiscard();
}

function prepareRating() {
    if (!state.items.some(s => s.keep)) return toast('Mantén (✔) al menos un opening para continuar.', { type: 'error' });
    goToStep(3);
}

// --- Paso 3: estrellas (niveles) ---
function renderRating() {
    const kept = state.items.filter(s => s.keep);
    document.getElementById('rating-list').innerHTML = kept
        .map(
            s => `
        <div class="list-item ranker-card">
            ${coverHTML(s)}
            <div class="ranker-info">${itemMetaHTML(s)}</div>
            <div class="ranker-actions">
                ${openingPlayerHTML(s)}
                <div class="ranker-stars" role="radiogroup" aria-label="Estrellas para ${esc(s.label)}">
                    ${[1, 2, 3].map(i => `<button type="button" class="star ${i <= s.stars ? 'active' : ''}" role="radio" aria-checked="${s.stars === i}" aria-label="${i} estrella${i > 1 ? 's' : ''}" onclick="setStars(${jsArg(s.id)}, ${i})">★</button>`).join('')}
                </div>
            </div>
        </div>`
        )
        .join('');
}

function setStars(id, val) {
    const item = itemById(String(id));
    if (item) item.stars = item.stars === val ? 0 : val;
    save();
    renderRating();
}

// Nº máximo de duelos para ordenar n elementos por inserción binaria.
function maxDuels(n) {
    let total = 0;
    for (let k = 1; k < n; k++) total += Math.ceil(Math.log2(k + 1));
    return total;
}

function startDuels() {
    const rated = state.items.filter(s => s.keep && s.stars > 0);
    if (rated.length < 2) return toast('Da estrellas al menos a 2 openings para empezar los duelos.', { type: 'error' });
    const unrated = state.items.filter(s => s.keep && !s.stars).length;
    if (unrated) toast(`${unrated} sin estrellas no entran en los duelos.`, { type: 'info' });
    state.sorted = { 3: [], 2: [], 1: [] };
    state.queue = TIERS.flatMap(t => rated.filter(s => s.stars === t).map(s => s.id));
    state.current = null;
    state.history = [];
    state.result = null;
    state.totalDuels = TIERS.reduce((sum, t) => sum + maxDuels(rated.filter(s => s.stars === t).length), 0);
    state.duelsDone = 0;
    advanceInsertion();
    goToStep(4);
}

// Prepara el siguiente duelo (o termina).
function advanceInsertion() {
    while (!state.current && state.queue.length) {
        const id = state.queue.shift();
        const tier = itemById(id).stars;
        const list = state.sorted[tier];
        if (list.length === 0) {
            list.push(id);
            continue;
        } // el primero de su nivel no necesita duelo
        state.current = { id, tier, lo: 0, hi: list.length };
    }
    if (!state.current && !state.queue.length) {
        state.result = TIERS.flatMap(t => state.sorted[t]);
    }
}

function vote(candidateWins) {
    const c = state.current;
    if (!c) return;
    state.history.push(JSON.stringify({ sorted: state.sorted, queue: state.queue, current: state.current, duelsDone: state.duelsDone }));
    if (state.history.length > 60) state.history.shift();
    const mid = Math.floor((c.lo + c.hi) / 2);
    if (candidateWins) c.hi = mid;
    else c.lo = mid + 1;
    state.duelsDone++;
    if (c.lo >= c.hi) {
        state.sorted[c.tier].splice(c.lo, 0, c.id);
        state.current = null;
        advanceInsertion();
    }
    save();
    renderDuel();
}

function undoDuel() {
    const last = state.history.pop();
    if (!last) return;
    Object.assign(state, JSON.parse(last), { result: null });
    save();
    renderDuel();
}

function renderDuel() {
    stopAllOpenings();
    const box = document.getElementById('duel-box'),
        fill = document.getElementById('progress-fill');
    if (state.result) {
        fill.style.width = '100%';
        box.innerHTML = `
            <h3>🏆 Tu ranking de openings</h3>
            <div class="ranker-final">${state.result
                .map((id, i) => {
                    const s = itemById(id);
                    return s
                        ? `
                <div class="list-item ranker-card">
                    <strong class="ranker-pos">#${i + 1}</strong>${coverHTML(s)}
                    <div class="ranker-info">${itemMetaHTML(s)}</div>
                    <div class="ranker-actions">${openingPlayerHTML(s)}</div>
                </div>`
                        : '';
                })
                .join('')}</div>
            <div class="ranker-final-actions">
                <button type="button" class="chip-btn accent-cyan" onclick="copyRankerResult()">📋 Copiar como texto</button>
                ${state.history.length ? '<button type="button" class="chip-btn accent-yellow" onclick="undoDuel()">↶ Deshacer último duelo</button>' : ''}
            </div>`;
        return;
    }
    const c = state.current;
    if (!c) {
        box.innerHTML = '';
        return;
    }
    const list = state.sorted[c.tier];
    const a = itemById(c.id),
        b = itemById(list[Math.floor((c.lo + c.hi) / 2)]);
    const pct = state.totalDuels ? Math.min(99, Math.round((state.duelsDone / state.totalDuels) * 100)) : 0;
    fill.style.width = pct + '%';
    const card = (s, wins, key) => `
        <div class="ranker-card ranker-duel-card">
            <button type="button" class="ranker-pick" onclick="vote(${wins})" aria-label="Elegir ${esc(s.label)} (tecla ${key})">
                ${coverHTML(s, 'ranker-duel-cover')}
                <span class="ranker-info">${itemMetaHTML(s)}</span>
                <span class="ranker-key" aria-hidden="true">${key}</span>
            </button>
            ${openingPlayerHTML(s)}
        </div>`;
    box.innerHTML = `
        <h3 class="ranker-question">¿Qué opening es mejor?</h3>
        <p class="ranker-progress-text">Duelo ${state.duelsDone + 1} · como máximo quedan ${Math.max(1, state.totalDuels - state.duelsDone)} · nivel ${'★'.repeat(c.tier)}</p>
        <div class="ranker-duel">${card(a, true, '1')}<div class="ranker-vs">VS</div>${card(b, false, '2')}</div>
        ${state.history.length ? '<button type="button" class="chip-btn accent-yellow ranker-undo" onclick="undoDuel()">↶ Deshacer último duelo</button>' : ''}`;
}

function copyRankerResult() {
    const text = state.result
        .map((id, i) => {
            const s = itemById(id);
            return `${i + 1}. ${s.label}${s.song ? ` — ${s.song}${s.artists ? ' (' + s.artists + ')' : ''}` : ''}`;
        })
        .join('\n');
    navigator.clipboard.writeText(text).then(
        () => toast('Ranking copiado.', { type: 'success' }),
        () => toast('No se pudo copiar (permiso del navegador).', { type: 'error' })
    );
}

// Teclas 1 / 2 para votar en los duelos.
document.addEventListener('keydown', e => {
    if (!document.getElementById('rankerView').classList.contains('active') || !state.current) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
    if (e.key === '1') vote(true);
    else if (e.key === '2') vote(false);
});

// Al abrir la app: volver al paso en el que se quedó.
document.addEventListener('DOMContentLoaded', () => goToStep(state.step || 1));
