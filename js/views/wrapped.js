// =====================================================================
// WRAPPED ANUAL
// Una imagen vertical (1080×1920, formato historia) con el resumen de un
// año: cuántos animes y mangas, tu media, tu top 5 con portadas, tu
// género y estudio del año y tu opinión más "impopular". Se descarga o se
// comparte (en el móvil abre el menú de compartir).
// El año es el de emisión, igual que en la Cápsula del tiempo.
// =====================================================================

async function wrappedCovers(animes) {
    // Portadas por ID en una consulta; las no vinculadas, de la caché de portadas.
    const ids = animes.map(a => a.anilistId).filter(Boolean);
    const byId = {};
    if (ids.length) {
        try {
            const json = await fetchAnilist(`query($ids: [Int]) { Page(page: 1, perPage: 10) { media(id_in: $ids, type: ANIME) { id coverImage { large } } } }`, { ids });
            (json?.data?.Page?.media || []).forEach(m => { byId[m.id] = m.coverImage?.large; });
        } catch (e) { /* sin conexión: caché */ }
    }
    return animes.map(a => {
        if (a.anilistId && byId[a.anilistId]) return byId[a.anilistId];
        const cached = a.anilistId && localStorage.getItem(`cover_id_${a.anilistId}`);
        if (cached) return cached;
        const safe = String(a.anime).toLowerCase().replace(/[^a-z0-9]/g, '');
        const key = Object.keys(localStorage).find(k => k.startsWith(`anime_cover_v5_${safe}_`));
        return (key && localStorage.getItem(key)) || FALLBACK_IMG;
    });
}

async function createWrapped(yearValue) {
    const year = parseInt(yearValue, 10);
    if (!year) return;
    const btn = document.getElementById('btnWrapped');
    btn.disabled = true; btn.textContent = 'Preparando tu Wrapped… ⏳';
    try {
        const animes = _masterData.filter(a => parseInt(a.year, 10) === year);
        const mangas = _mangaData.filter(m => parseInt(m.year, 10) === year);
        if (!animes.length && !mangas.length) return toast(`No hay nada registrado de ${year}.`, { type: 'info' });

        const top = animes.slice().sort((a, b) => b.score - a.score).slice(0, 5);
        const avg = animes.length ? animes.reduce((s, a) => s + (parseFloat(a.score) || 0), 0) / animes.length : null;
        const studios = {};
        animes.forEach(a => String(a.studio || '').split(/,|\s+&\s+|\s+and\s+/i).map(s => s.trim()).filter(s => s && s !== 'Desconocido').forEach(s => { studios[s] = (studios[s] || 0) + 1; }));
        const topStudio = Object.entries(studios).sort((a, b) => b[1] - a[1])[0];

        const meta = await loadMediaMeta('ANIME', animes.map(a => a.anilistId).filter(Boolean));
        const genres = {};
        animes.forEach(a => ((meta[a.anilistId] && meta[a.anilistId].genres) || []).forEach(g => { genres[g] = (genres[g] || 0) + 1; }));
        const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
        const diffs = animes.filter(a => meta[a.anilistId] && meta[a.anilistId].averageScore).map(a => ({ a, d: parseFloat(a.score) - meta[a.anilistId].averageScore }));
        const hot = diffs.sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
        const covers = await wrappedCovers(top);
        const genreName = g => (typeof GENRE_LABELS !== 'undefined' && GENRE_LABELS[g]) || g;

        const card = document.createElement('div');
        card.className = 'wrapped-card';
        card.innerHTML = `
            <div class="wrapped-brand">OTAKU HUB</div>
            <div class="wrapped-year">${year}</div>
            <div class="wrapped-sub">MI AÑO EN ANIME Y MANGA</div>
            <div class="wrapped-numbers">
                <div><strong>${animes.length}</strong><span>${animes.length === 1 ? 'anime' : 'animes'}</span></div>
                <div><strong>${mangas.length}</strong><span>${mangas.length === 1 ? 'manga' : 'mangas'}</span></div>
                <div><strong>${avg !== null ? fmt1(avg) : '–'}</strong><span>nota media</span></div>
            </div>
            <div class="wrapped-label">MI TOP ${top.length}</div>
            <ol class="wrapped-top">${top.map((a, i) => `
                <li><img src="${esc(covers[i])}" crossorigin="anonymous" alt=""><span class="wrapped-rank">${i + 1}</span>
                    <span class="wrapped-title">${esc(a.anime)}</span><span class="wrapped-score">${esc(a.score)}⭐</span></li>`).join('')}</ol>
            <div class="wrapped-facts">
                ${topGenre ? `<div><span>Género del año</span><strong>${esc(genreName(topGenre[0]))}</strong></div>` : ''}
                ${topStudio ? `<div><span>Estudio del año</span><strong>${esc(topStudio[0])}</strong></div>` : ''}
                ${hot ? `<div><span>Mi opinión más ${hot.d > 0 ? 'generosa' : 'dura'}</span><strong>${esc(hot.a.anime)} (${signed(hot.d)})</strong></div>` : ''}
            </div>`;
        const stage = document.createElement('div');
        stage.className = 'wrapped-stage';
        stage.appendChild(card);
        document.body.appendChild(stage);
        await Promise.all([...card.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));

        const h2c = await loadHtml2Canvas();
        const canvas = await h2c(card, { scale: 3, useCORS: true, backgroundColor: '#030308', logging: false });
        stage.remove();
        showWrappedPreview(canvas, year);
    } catch (err) {
        toast(`No se pudo crear el Wrapped: ${err.message}`, { type: 'error' });
        document.querySelectorAll('.wrapped-stage').forEach(s => s.remove());
    } finally {
        btn.disabled = false; btn.textContent = `🎁 Crear mi Wrapped ${year}`;
    }
}

function showWrappedPreview(canvas, year) {
    const url = canvas.toDataURL('image/png');
    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    overlay.id = 'workSheetOverlay';
    overlay.innerHTML = `
        <div class="work-sheet wrapped-preview" role="dialog" aria-modal="true" aria-label="Tu Wrapped ${year}">
            <button type="button" class="icon-btn work-sheet-close" aria-label="Cerrar" onclick="closeWorkSheet()">✕</button>
            <img src="${url}" alt="Wrapped ${year}">
            <div class="work-sheet-actions">
                <a class="chip-btn accent-cyan" href="${url}" download="OtakuHub_Wrapped_${year}.png">💾 Descargar</a>
                <button type="button" class="chip-btn accent-magenta" id="wrappedShare" hidden>📤 Compartir</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeWorkSheet(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeWorkSheet(); });
    canvas.toBlob(blob => {
        const file = new File([blob], `OtakuHub_Wrapped_${year}.png`, { type: 'image/png' });
        const share = document.getElementById('wrappedShare');
        if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
            share.hidden = false;
            share.onclick = () => navigator.share({ files: [file], title: `Mi ${year} en anime` }).catch(() => {});
        }
    });
    overlay.querySelector('.work-sheet-close').focus();
}
