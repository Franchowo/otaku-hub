// =====================================================================
// VINCULAR OBRAS REGISTRADAS CON SU ID DE ANILIST
// ---------------------------------------------------------------------
// Rellena la columna "AniList ID" de FULL LIST y FULL LIST MANGA para las
// obras que aún no lo tienen. Para cada título busca en AniList y puntúa
// los candidatos (título exacto, año, temporada, estudio/autor). Solo guarda
// coincidencias claras; el resto se lista para revisarlo a mano.
// Requiere Code.gs v2 (ver docs/APPS-SCRIPT.md).
// =====================================================================

const LINK_BATCH = 10;            // títulos por consulta GraphQL
const LINK_DELAY_MS = 2100;       // ~28 consultas/min: por debajo del límite de AniList
const LINK_MIN_SCORE = 4;         // puntuación mínima para aceptar un candidato
const LINK_SAVE_EVERY = 50;       // IDs por escritura en Sheets

let _linkCancelled = false;

function normalizeTitle(str) {
    return String(str || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokensOf(str) {
    return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2 && t !== 'studio' && t !== 'studios');
}

// Puntúa un candidato de AniList frente a una obra registrada.
function scoreAnilistCandidate(entry, media, index, type) {
    const target = normalizeTitle(entry.title);
    const titles = [media.title?.romaji, media.title?.english, media.title?.native, ...(media.synonyms || [])]
        .map(normalizeTitle).filter(Boolean);
    let score = 0;

    if (target && titles.includes(target)) score += 4;
    else if (target.length >= 4 && titles.some(t => t.includes(target) || target.includes(t))) score += 1;

    const year = parseInt(entry.year, 10);
    const mediaYear = media.seasonYear || media.startDate?.year;
    if (year && mediaYear === year) score += 2;

    if (type === 'anime') {
        if (entry.season && media.season && media.season === String(entry.season).toUpperCase()) score += 1;
        const wanted = tokensOf(entry.studio);
        const names = (media.studios?.nodes || []).map(n => n.name.toLowerCase());
        if (wanted.length && names.some(n => wanted.some(t => n.includes(t)))) score += 2;
    } else {
        const wanted = tokensOf(entry.author);
        const names = (media.staff?.nodes || []).map(n => (n.name?.full || '').toLowerCase());
        if (wanted.length && names.some(n => wanted.every(t => n.includes(t)))) score += 2;
    }

    if (index === 0) score += 0.5; // AniList lo considera el más parecido
    return score;
}

function pickBestCandidate(entry, medias, type) {
    let best = null;
    medias.forEach((media, index) => {
        const score = scoreAnilistCandidate(entry, media, index, type);
        if (!best || score > best.score) best = { media, score };
    });
    return best && best.score >= LINK_MIN_SCORE ? best.media : null;
}

function buildLinkQuery(batch, type) {
    const defs = batch.map((_, i) => `$s${i}: String`).join(', ');
    const extra = type === 'anime'
        ? 'season seasonYear studios(isMain: true) { nodes { name } }'
        : 'staff(sort: RELEVANCE, perPage: 6) { nodes { name { full } } }';
    const body = batch.map((_, i) =>
        `q${i}: Page(page: 1, perPage: 8) { media(search: $s${i}, type: ${type.toUpperCase()}, sort: SEARCH_MATCH) { id title { romaji english native } synonyms startDate { year } ${extra} } }`
    ).join(' ');
    const variables = {};
    batch.forEach((entry, i) => { variables[`s${i}`] = entry.title; });
    return { query: `query(${defs}) { ${body} }`, variables };
}

async function fetchLinkBatch(batch, type) {
    const { query, variables } = buildLinkQuery(batch, type);
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await fetchAnilist(query, variables);
        } catch (err) {
            if (err.message !== 'RATE_LIMIT' || attempt === 2) throw err;
            updateLinkProgress({ note: 'AniList pide una pausa (límite de peticiones). Esperando 60 s…' });
            await new Promise(r => setTimeout(r, 60000));
        }
    }
}

async function linkCollection(type, entries, progress) {
    const unmatched = [];
    let pendingSave = [];
    let linked = 0;

    const flush = async () => {
        if (pendingSave.length === 0) return;
        const items = pendingSave; pendingSave = [];
        const result = await sheetsWrite({ action: 'set_anilist_ids', target: type, items }, { minVersion: 2 });
        linked += result.data?.updated ?? items.length;
    };

    for (let i = 0; i < entries.length && !_linkCancelled; i += LINK_BATCH) {
        const batch = entries.slice(i, i + LINK_BATCH);
        const json = await fetchLinkBatch(batch, type);
        batch.forEach((entry, idx) => {
            const media = pickBestCandidate(entry, json?.data?.[`q${idx}`]?.media || [], type);
            if (media) pendingSave.push({ row: entry.row, title: entry.title, id: media.id });
            else unmatched.push(entry.title);
        });
        progress.done += batch.length;
        updateLinkProgress({ done: progress.done, total: progress.total, note: `Buscando ${type === 'anime' ? 'animes' : 'mangas'}…` });
        if (pendingSave.length >= LINK_SAVE_EVERY) await flush();
        if (i + LINK_BATCH < entries.length) await new Promise(r => setTimeout(r, LINK_DELAY_MS));
    }
    await flush();
    return { linked, unmatched };
}

// --- Interfaz (panel modal sencillo) ---
function showLinkPanel() {
    let overlay = document.getElementById('linkOverlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'linkOverlay';
    overlay.className = 'link-overlay';
    overlay.innerHTML = `
        <div class="link-card" role="dialog" aria-modal="true" aria-labelledby="linkTitle">
            <h3 id="linkTitle">🔗 Vincular con AniList</h3>
            <p class="link-note" id="linkNote">Preparando…</p>
            <div class="link-bar"><div class="link-bar-fill" id="linkBarFill"></div></div>
            <p class="link-count" id="linkCount"></p>
            <div class="link-result" id="linkResult"></div>
            <button type="button" class="btn-reload" id="linkAction">Cancelar</button>
        </div>`;
    document.body.appendChild(overlay);
    document.getElementById('linkAction').addEventListener('click', () => {
        if (overlay.dataset.finished) overlay.remove();
        else { _linkCancelled = true; updateLinkProgress({ note: 'Cancelando tras la consulta en curso…' }); }
    });
}

function updateLinkProgress({ done, total, note }) {
    if (note) document.getElementById('linkNote').textContent = note;
    if (total) {
        document.getElementById('linkBarFill').style.width = `${Math.round((done / total) * 100)}%`;
        document.getElementById('linkCount').textContent = `${done} / ${total} obras revisadas`;
    }
}

function finishLinkPanel(html) {
    const overlay = document.getElementById('linkOverlay');
    if (!overlay) return;
    overlay.dataset.finished = '1';
    document.getElementById('linkResult').innerHTML = html;
    document.getElementById('linkAction').textContent = 'Cerrar';
}

async function startAnilistLinking() {
    try {
        const version = await getServerVersion();
        if (version < 2) {
            toast('Para vincular tus obras necesitas actualizar el Apps Script a la versión 2 (pasos en docs/APPS-SCRIPT.md del repositorio).', { type: 'error' });
            return;
        }
    } catch (err) {
        toast(err.message, { type: 'error' });
        return;
    }

    _linkCancelled = false;
    showLinkPanel();
    updateLinkProgress({ note: 'Cargando tus listas…' });

    try {
        _masterData = []; _mangaData = [];
        await new Promise((resolve, reject) => {
            sheetsReadOnce('master', null).then(data => {
                _masterData = data.map(item => Object.assign(item, { anilistId: readAnilistId(item) }));
                populateFilterDropdowns(_masterData);
                initMangaDataFetch(true, resolve);
            }).catch(reject);
            setTimeout(() => reject(new Error('No se pudieron cargar las listas.')), 60000);
        });

        const animeEntries = _masterData.filter(a => !a.anilistId && a._row && a.anime)
            .map(a => ({ row: a._row, title: String(a.anime).trim(), year: a.year, season: a.season, studio: a.studio }));
        const mangaEntries = _mangaData.filter(m => !m.anilistId && m._row && m.manga)
            .map(m => ({ row: m._row, title: String(m.manga).trim(), year: m.year, author: m.author }));
        const total = animeEntries.length + mangaEntries.length;

        if (total === 0) {
            finishLinkPanel('<p>✅ Todas tus obras ya están vinculadas con AniList.</p>');
            updateLinkProgress({ note: 'Nada que hacer.' });
            return;
        }

        const minutes = Math.max(1, Math.round((total / LINK_BATCH) * LINK_DELAY_MS / 60000));
        updateLinkProgress({ done: 0, total, note: `Revisando ${total} obras (≈${minutes} min). Puedes dejar la app abierta.` });

        const progress = { done: 0, total };
        const anime = await linkCollection('anime', animeEntries, progress);
        const manga = _linkCancelled ? { linked: 0, unmatched: [] } : await linkCollection('manga', mangaEntries, progress);

        const unmatched = [...anime.unmatched.map(t => `📺 ${t}`), ...manga.unmatched.map(t => `📖 ${t}`)];
        updateLinkProgress({ note: _linkCancelled ? 'Cancelado. Lo vinculado hasta ahora queda guardado.' : 'Terminado.' });
        finishLinkPanel(`
            <p>✅ Vinculados: <strong>${anime.linked}</strong> animes y <strong>${manga.linked}</strong> mangas.</p>
            ${unmatched.length ? `<p>⚠️ Sin coincidencia clara (${unmatched.length}). Puedes escribir su ID a mano en la columna "AniList ID":</p>
            <ul class="link-unmatched">${unmatched.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`);

        // Recargar con los IDs nuevos (las portadas pasarán a pedirse por ID).
        _masterData = []; _mangaData = [];
        reloadActiveView();
    } catch (err) {
        updateLinkProgress({ note: 'Se detuvo por un error. Lo vinculado hasta ahora queda guardado.' });
        finishLinkPanel(`<p>❌ ${esc(err.message)}</p>`);
    }
}
