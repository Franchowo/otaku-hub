// =====================================================================
// TUS DATOS: copia de seguridad e importación desde AniList
// =====================================================================

// --- Exportar ---------------------------------------------------------
function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const todayStamp = () => new Date().toISOString().slice(0, 10);

async function exportFullBackup() {
    const btn = document.getElementById('btnBackupJson');
    btn.disabled = true; btn.textContent = 'Reuniendo tus datos… ⏳';
    try {
        const sheets = [['anime', 'master', null], ['manga', 'manga', 'FULL LIST MANGA'], ['favoritos', 'favs', 'FAVS'], ['top150', 'top150', 'TOP_150'],
            ['rankingAnual', 'annual', 'RANKING_ANUAL'], ['planificador', 'planificador', 'PLANIFICADOR_STATE'], ['calificador', 'calificador', 'CALIFICADOR_STATE']];
        const backup = { app: 'OTAKU HUB', version: 1, exportedAt: new Date().toISOString(), sheets: {}, device: {} };
        for (const [name, key, sheet] of sheets) {
            try { backup.sheets[name] = await sheetsReadOnce(key, sheet); }
            catch (e) { backup.sheets[name] = { error: e.message }; }
        }
        backup.device = {
            rankingAnualArchivado: readStoredJSON('annual_archive', {}),
            openingRanker: readStoredJSON('ranker_data_v2', null),
            ocultosEnDescubrir: readStoredJSON('discover_hidden', [])
        };
        downloadFile(`otaku-hub-copia-${todayStamp()}.json`, JSON.stringify(backup, null, 2), 'application/json');
        const failed = Object.entries(backup.sheets).filter(([, v]) => v && v.error).map(([k]) => k);
        toast(failed.length ? `Copia descargada, pero sin: ${failed.join(', ')} (sin conexión).` : 'Copia de seguridad descargada.', { type: failed.length ? 'error' : 'success' });
    } finally {
        btn.disabled = false; btn.textContent = '💾 Copia completa (JSON)';
    }
}

// CSV con ";" (lo que espera Excel en español) y BOM para que respete tildes.
function toCsv(headers, rows) {
    const cell = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + [headers, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
}

function exportCsv(type) {
    const run = () => {
        if (type === 'anime') {
            downloadFile(`otaku-hub-anime-${todayStamp()}.csv`, toCsv(['Anime', 'Temporada', 'Año', 'Estudio', 'Nota', 'AniList ID'],
                _masterData.map(a => [a.anime, seasonLabel(a.season), a.year, a.studio, a.score, a.anilistId || ''])), 'text/csv;charset=utf-8');
        } else {
            downloadFile(`otaku-hub-manga-${todayStamp()}.csv`, toCsv(['Manga', 'Año', 'Autor', 'Nota', 'AniList ID'],
                _mangaData.map(m => [m.manga, m.year, m.author, m.score, m.anilistId || ''])), 'text/csv;charset=utf-8');
        }
        toast('CSV descargado.', { type: 'success' });
    };
    if (type === 'anime') initMasterDataFetch(run); else initMangaDataFetch(false, run);
}

// --- Importar desde AniList ---------------------------------------------
let _importCandidates = [];

async function searchAnilistImport() {
    const user = document.getElementById('importUser').value.trim();
    const type = document.getElementById('importType').value;
    const box = document.getElementById('importResults');
    if (!user) return toast('Escribe tu nombre de usuario de AniList.', { type: 'error' });
    box.innerHTML = '<p class="loader-text">Leyendo tu lista de AniList…</p>';

    const fields = type === 'ANIME'
        ? 'season seasonYear studios(isMain: true) { nodes { name } }'
        : 'staff(sort: RELEVANCE, perPage: 1) { nodes { name { full } } }';
    const query = `query($user: String, $type: MediaType) {
        MediaListCollection(userName: $user, type: $type, status: COMPLETED) {
            lists { entries { score(format: POINT_10) media { id title { romaji english } startDate { year month } ${fields} } } }
        }
    }`;
    try {
        await new Promise(res => type === 'ANIME' ? initMasterDataFetch(res) : initMangaDataFetch(false, res));
        const json = await fetchAnilist(query, { user, type });
        const lists = json?.data?.MediaListCollection?.lists;
        if (!lists) { box.innerHTML = '<p class="viz-empty">No se encontró ese usuario o su lista es privada.</p>'; return; }
        const owned = type === 'ANIME' ? buildOwnedIndex(_masterData, 'anime') : buildOwnedIndex(_mangaData, 'manga');
        const seen = new Set();
        _importCandidates = lists.flatMap(l => l.entries).filter(e => e.media && !owned.has(e.media) && !seen.has(e.media.id) && seen.add(e.media.id)).map(e => {
            const m = e.media, month = m.startDate?.month;
            const season = m.season ? m.season.charAt(0) + m.season.slice(1).toLowerCase()
                : month ? ['Winter', 'Spring', 'Summer', 'Fall'][Math.floor((month - 1) / 3)] : 'Winter';
            return {
                id: m.id, title: m.title.romaji || m.title.english, score: e.score ? Math.round(e.score) : null,
                year: m.seasonYear || m.startDate?.year || null, season,
                creator: type === 'ANIME' ? (m.studios?.nodes || []).map(n => n.name).join(', ') : (m.staff?.nodes?.[0]?.name?.full || '')
            };
        });
        renderImportCandidates(type);
    } catch (err) {
        box.innerHTML = `<p class="viz-empty">No se pudo leer la lista (${esc(err.message === 'RATE_LIMIT' ? 'límite de AniList, prueba en un minuto' : err.message)}).</p>`;
    }
}

function renderImportCandidates(type) {
    const box = document.getElementById('importResults');
    if (!_importCandidates.length) { box.innerHTML = '<p class="viz-empty">✅ Ya tienes todo lo que has completado en AniList.</p>'; return; }
    const unscored = _importCandidates.filter(c => !c.score).length;
    box.innerHTML = `
        <p class="import-summary">${_importCandidates.length} obras completadas en AniList que no están en tu lista.${unscored ? ` ${unscored} no tienen nota: pónsela para importarlas.` : ''}</p>
        <div class="import-toolbar">
            <button type="button" class="chip-btn accent-cyan chip-btn--sm" onclick="toggleAllImport(true)">Marcar todas</button>
            <button type="button" class="chip-btn accent-red chip-btn--sm" onclick="toggleAllImport(false)">Desmarcar</button>
        </div>
        <ul class="import-list">${_importCandidates.map((c, i) => `
            <li class="import-row">
                <input type="checkbox" id="imp${i}" ${c.score ? 'checked' : ''} onchange="updateImportCount()">
                <label for="imp${i}"><span class="import-title">${esc(c.title)}</span>
                    <span class="import-meta">${type === 'ANIME' ? `${esc(seasonLabel(c.season))} ` : ''}${esc(c.year || '¿?')}${c.creator ? ` · ${esc(c.creator)}` : ''}</span></label>
                <input type="number" class="import-score" min="1" max="10" inputmode="numeric" value="${c.score || ''}" placeholder="Nota" aria-label="Nota de ${esc(c.title)}"
                    oninput="_importCandidates[${i}].score = parseInt(this.value, 10) || null; if (this.value) document.getElementById('imp${i}').checked = true; updateImportCount()">
            </li>`).join('')}</ul>
        <button type="button" class="btn" id="btnDoImport" onclick="runAnilistImport('${type}')"></button>`;
    updateImportCount();
}

function selectedImports() {
    return _importCandidates.filter((c, i) => document.getElementById(`imp${i}`).checked && c.score >= 1 && c.score <= 10);
}

function toggleAllImport(on) {
    _importCandidates.forEach((c, i) => { document.getElementById(`imp${i}`).checked = on && !!c.score; });
    updateImportCount();
}

function updateImportCount() {
    const btn = document.getElementById('btnDoImport');
    if (!btn) return;
    const n = selectedImports().length;
    btn.disabled = n === 0;
    btn.textContent = n ? `📥 Importar ${n} ${n === 1 ? 'obra' : 'obras'}` : 'Marca alguna obra con nota';
}

async function runAnilistImport(type) {
    const chosen = selectedImports();
    if (!chosen.length) return;
    const ok = await confirmDialog({ title: `Importar ${chosen.length} obras`, message: `Se añadirán a ${type === 'ANIME' ? 'tu lista de anime' : 'FULL LIST MANGA'} con su nota y su ID de AniList.`, confirmText: 'Importar' });
    if (!ok) return;
    const btn = document.getElementById('btnDoImport');
    btn.disabled = true;
    const items = chosen.map(c => type === 'ANIME'
        ? { anime: c.title, season: c.season, year: c.year, studio: c.creator || 'Desconocido', score: c.score, anilistId: c.id }
        : { manga: c.title, year: c.year, author: c.creator || 'Desconocido', score: c.score, anilistId: c.id });
    let done = 0;
    try {
        for (let i = 0; i < items.length; i += 100) {
            btn.textContent = `Importando… ${done}/${items.length}`;
            const res = await sheetsWrite({ action: 'register_batch', target: type === 'ANIME' ? 'anime' : 'manga', items: items.slice(i, i + 100) }, { minVersion: 5 });
            done += res.queued ? 0 : Math.min(100, items.length - i);
            if (res.queued) { toast('Sin conexión: la importación queda en cola.', { type: 'info' }); break; }
        }
        if (done) toast(`${done} obras importadas.`, { type: 'success' });
        invalidateList(type === 'ANIME' ? 'master' : 'manga');
        _importCandidates = _importCandidates.filter(c => !chosen.includes(c));
        renderImportCandidates(type);
    } catch (err) {
        toast(err.code === 'OUTDATED' ? 'Para importar, actualiza el Apps Script a la versión 5 (docs/APPS-SCRIPT.md).' : `Importación incompleta (${done} de ${items.length}): ${err.message}`, { type: 'error' });
        if (done) invalidateList(type === 'ANIME' ? 'master' : 'manga');
        updateImportCount();
    }
}

// --- Descubrir: obras ocultas -------------------------------------------
function renderDataView() {
    const n = hiddenDiscoveries().size;
    document.getElementById('hiddenCount').textContent = n ? `${n} ${n === 1 ? 'obra oculta' : 'obras ocultas'} en Gacha y Recomendaciones.` : 'No has ocultado ninguna obra.';
    document.getElementById('btnResetHidden').hidden = n === 0;
}

function resetHiddenDiscoveries() {
    const backup = readStoredJSON('discover_hidden', []);
    try { localStorage.removeItem('discover_hidden'); } catch (e) {}
    renderDataView();
    toastUndo('Las obras ocultas vuelven a poder salir.', () => { localStorage.setItem('discover_hidden', JSON.stringify(backup)); renderDataView(); });
}
