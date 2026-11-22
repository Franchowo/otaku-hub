// =====================================================================
// FICHA DE OBRA
// ---------------------------------------------------------------------
// Al tocar cualquier anime o manga de tu colección se abre su ficha: tu
// nota, datos de AniList (géneros, media global, episodios, sinopsis) y
// acciones: editar, borrar, añadir al Ranking Anual o calificar.
// Editar y borrar requieren Code.gs v3 (docs/APPS-SCRIPT.md).
// =====================================================================

// Clave estable de una obra para los onclick: su fila en la hoja si se
// conoce (v2+) o su título. Prefijo para no confundir "86" (anime) con la fila 86.
function workKey(item, type) {
    return item._row ? `row:${item._row}` : `t:${type === 'manga' ? item.manga : item.anime}`;
}

function findWork(type, key) {
    const list = type === 'manga' ? _mangaData : _masterData;
    const [kind, ...rest] = String(key).split(':');
    const value = rest.join(':');
    if (kind === 'row') return list.find(w => String(w._row) === value);
    return list.find(w => String(type === 'manga' ? w.manga : w.anime) === value);
}

// onclick="openWorkSheet('anime', 'row:12')"
function workSheetAttrs(item, type) {
    const title = type === 'manga' ? item.manga : item.anime;
    return `role="button" tabindex="0" aria-label="Abrir ficha de ${esc(title)}" onclick="openWorkSheet('${type}', ${jsArg(workKey(item, type))})"`;
}

function closeWorkSheet() {
    const overlay = document.getElementById('workSheetOverlay');
    if (!overlay) return;
    if (overlay._cleanup) overlay._cleanup();
    animateWorkSheetClose(overlay);
    overlay.remove();
    if (overlay._previousFocus && overlay._previousFocus.focus) overlay._previousFocus.focus({ preventScroll: true });
}

// Al cerrar: la ficha baja un poco y se desvanece mientras la portada
// vuelve volando a su tarjeta. La ficha real se quita al momento (el resto
// de la app no espera); lo que se anima es una copia sin ids ni foco.
function animateWorkSheetClose(overlay) {
    const coverImg = overlay.querySelector('#workSheetCover');
    // Solo la ficha de obra (el Wrapped y la página de estudio usan la misma ventana).
    if (!coverImg || prefersReducedMotion() || !document.body.animate) return;
    const from = coverImg.getBoundingClientRect();
    const origin = overlay._originImg && overlay._originImg.isConnected ? overlay._originImg : null;
    const ghost = overlay.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    ghost.classList.add('sheet-overlay--closing');
    document.body.appendChild(ghost);
    const sheet = ghost.querySelector('.work-sheet');
    const sheetBody = overlay.querySelector('.work-sheet');
    if (sheet && sheetBody) sheet.scrollTop = sheetBody.scrollTop;
    const ghostCover = ghost.querySelector('.work-sheet-cover img');
    const flies = origin && !coverImg.src.startsWith('data:');
    if (flies && ghostCover) ghostCover.style.opacity = '0';
    const mobile = matchMedia('(max-width: 640px)').matches;
    if (sheet)
        sheet.animate(
            mobile
                ? [{ transform: 'none' }, { transform: 'translateY(100%)' }]
                : [
                      { transform: 'none', opacity: 1 },
                      { transform: 'translateY(10px) scale(0.96)', opacity: 0 }
                  ],
            { duration: mobile ? 280 : 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
        );
    ghost
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: mobile ? 280 : 240, easing: 'ease-in', fill: 'forwards' })
        .finished.catch(() => {})
        .then(() => ghost.remove());
    if (flies) {
        origin.style.visibility = 'hidden';
        const flight = flyElement(coverImg.src, from, origin.getBoundingClientRect(), { duration: 360, radiusFrom: 12, radiusTo: 6 });
        if (flight) flight.done.then(() => (origin.style.visibility = ''));
        else origin.style.visibility = '';
    }
}

function cachedCoverFor(item, type) {
    if (item.anilistId && localStorage.getItem(`cover_id_${item.anilistId}`)) return localStorage.getItem(`cover_id_${item.anilistId}`);
    return null;
}

// La imagen de la tarjeta que se ha tocado (para la animación y para
// mostrar ya su portada en la ficha mientras llegan los datos de AniList).
function workSheetOriginImg() {
    const ev = window.event;
    const el = ev && ev.currentTarget instanceof Element ? ev.currentTarget : document.activeElement;
    if (!el || el === document.body) return null;
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    return img && img.complete && img.naturalWidth && /^https?:/.test(img.currentSrc || img.src) ? img : null;
}

function openWorkSheet(type, key) {
    const item = findWork(type, key);
    if (!item) {
        toast('No se encontró la obra (recarga la lista).', { type: 'error' });
        return;
    }
    const originImg = workSheetOriginImg();
    const previousFocus = document.activeElement;
    closeWorkSheet();

    const title = type === 'manga' ? item.manga : item.anime;
    const overlay = document.createElement('div');
    overlay.id = 'workSheetOverlay';
    overlay.className = 'sheet-overlay sheet-overlay--js';
    overlay._previousFocus = previousFocus;
    overlay._originImg = originImg;
    overlay.innerHTML = `
        <div class="work-sheet" role="dialog" aria-modal="true" aria-labelledby="workSheetTitle">
            <button type="button" class="icon-btn work-sheet-close" aria-label="Cerrar ficha" onclick="closeWorkSheet()">✕</button>
            <div class="work-sheet-body" id="workSheetBody"></div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeWorkSheet();
    });
    overlay.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !document.querySelector('.dialog-overlay')) closeWorkSheet();
    });

    renderWorkSheetView(type, item, originImg);
    overlay.querySelector('.work-sheet-close').focus({ preventScroll: true });
    applyWorkSheetTint(item.anilistId ? cachedCoverColor(item.anilistId) : null);
    animateWorkSheetOpen(overlay, originImg);
    loadWorkSheetAnilistInfo(type, item, title);
}

// Al abrir: la ficha crece desde la tarjeta tocada (en móvil sube desde
// abajo), la portada vuela hasta su sitio y el resto de la ficha aparece
// en cascada.
function animateWorkSheetOpen(overlay, originImg) {
    if (prefersReducedMotion() || !document.body.animate) return;
    const sheet = overlay.querySelector('.work-sheet');
    const target = overlay.querySelector('#workSheetCover');
    const mobile = matchMedia('(max-width: 640px)').matches;
    // Medir antes de animar: durante la animación la ficha está desplazada.
    const targetRect = target && target.getBoundingClientRect();
    const originRect = originImg && originImg.getBoundingClientRect();
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    if (sheet) {
        if (mobile) {
            sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 460, easing: EASE_OUT });
        } else {
            // El origen de la escala es el punto de la ficha más cercano a la tarjeta.
            const s = sheet.getBoundingClientRect();
            const o = originRect;
            if (o) {
                const x = Math.min(Math.max(o.left + o.width / 2 - s.left, 0), s.width);
                const y = Math.min(Math.max(o.top + o.height / 2 - s.top, 0), s.height);
                sheet.style.transformOrigin = `${x}px ${y}px`;
            }
            sheet.animate(
                [
                    { transform: 'scale(0.9)', opacity: 0 },
                    { transform: 'none', opacity: 1 }
                ],
                { duration: 420, easing: EASE_OUT }
            );
        }
    }
    staggerIn(overlay.querySelectorAll('.work-sheet-info > *, .work-sheet-actions > *'), { delay: 120, step: 35 });
    if (!originImg || !target || !rectOnScreen(targetRect)) return;
    const flight = flyElement(
        originImg.currentSrc || originImg.src,
        originRect,
        () => (target.isConnected ? target.getBoundingClientRect() : targetRect),
        {
            // En móvil la ficha sube a la vez: misma curva y duración para que la portada no se quede atrás.
            duration: mobile ? 460 : 480,
            easing: mobile ? 'out' : 'inOut',
            lift: !mobile,
            radiusFrom: 6,
            radiusTo: 12
        }
    );
    if (!flight) return;
    target.style.opacity = '0';
    originImg.style.visibility = 'hidden';
    flight.done.then(() => {
        target.style.opacity = '';
        originImg.style.visibility = '';
    });
}

// --- Color de la portada ---------------------------------------------
// AniList da el color dominante de cada portada (coverImage.color). La
// ficha lo usa de fondo suave, borde y brillo de la portada. Se guarda por
// obra para que al volver a abrirla salga ya con su color.
function cachedCoverColor(anilistId) {
    try {
        return localStorage.getItem(`cover_color_${anilistId}`);
    } catch (e) {
        return null;
    }
}

function hexToRgbTriplet(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyWorkSheetTint(hex) {
    const sheet = document.querySelector('#workSheetOverlay .work-sheet');
    const rgb = hexToRgbTriplet(hex);
    if (!sheet || !rgb) return;
    sheet.style.setProperty('--work-tint', rgb.join(', '));
    sheet.classList.add('work-sheet--tinted');
}

function renderWorkSheetView(type, item, originImg = document.getElementById('workSheetOverlay')?._originImg || null) {
    const body = document.getElementById('workSheetBody');
    const title = type === 'manga' ? item.manga : item.anime;
    const score = parseFloat(item.score) || 0;
    const meta =
        type === 'manga'
            ? `${esc(item.author || 'Autor desconocido')} · ${esc(item.year || '')}`
            : `${esc(seasonLabel(item.season))} ${esc(item.year || '')} · ${esc(item.studio || 'Estudio desconocido')}`;
    const cover = cachedCoverFor(item, type) || (originImg ? originImg.currentSrc || originImg.src : null);

    body.innerHTML = `
        <div class="work-sheet-head">
            <div class="work-sheet-cover">
                <img id="workSheetCover" alt="" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';" ${cover ? `src="${esc(cover)}"` : `data-type="${type}" data-title="${esc(title)}" ${type === 'manga' ? `data-author="${esc(item.author || '')}"` : ''} src="${FALLBACK_IMG}"`}>
            </div>
            <div class="work-sheet-info">
                <span class="work-sheet-kind">${type === 'manga' ? '📖 Manga' : '📺 Anime'}</span>
                <h3 id="workSheetTitle" class="work-sheet-title">${esc(title)}</h3>
                <span class="work-sheet-meta">${meta}</span>
                <span class="detail-score-badge score-neon-${Math.round(score)} work-sheet-score">Tu nota: ${esc(score)} / 10</span>
            </div>
        </div>
        <div class="work-sheet-anilist" id="workSheetAnilist"><div class="skeleton work-sheet-skeleton"></div></div>
        <div class="work-sheet-actions">
            <button type="button" class="chip-btn accent-cyan" onclick="editWorkSheet('${type}', ${jsArg(workKey(item, type))})">✏️ Editar</button>
            ${
                type === 'anime'
                    ? `
                <button type="button" class="chip-btn accent-green" onclick="addAnimeToAnnualRanking(${jsArg(item.anime)}, ${jsArg(item.score)}); closeWorkSheet();">🏆 Al Ranking Anual</button>
                <button type="button" class="chip-btn accent-yellow" onclick="rateWorkInCalificador(${jsArg(item.anime)})">🎯 Calificar episodios</button>`
                    : ''
            }
            <button type="button" class="chip-btn accent-red" onclick="deleteWorkSheet('${type}', ${jsArg(workKey(item, type))})">🗑️ Borrar</button>
        </div>`;

    const img = document.getElementById('workSheetCover');
    if (!cover && img) globalImageObserver.observe(img);
}

async function loadWorkSheetAnilistInfo(type, item, title) {
    const box = () => document.getElementById('workSheetAnilist');
    const query = `query($id: Int, $search: String, $type: MediaType) {
        Media(id: $id, search: $search, type: $type) {
            id siteUrl format status episodes chapters volumes averageScore genres
            coverImage { large color } description(asHtml: false)
            title { romaji english }
        }
    }`;
    try {
        const json = await fetchAnilist(
            query,
            item.anilistId ? { id: item.anilistId, type: type.toUpperCase() } : { search: title, type: type.toUpperCase() }
        );
        const media = json?.data?.Media;
        if (!box()) return;
        if (!media) {
            box().innerHTML = '<p class="work-sheet-note">No se encontró en AniList.</p>';
            return;
        }

        if (media.coverImage?.color) {
            applyWorkSheetTint(media.coverImage.color);
            if (item.anilistId)
                try {
                    localStorage.setItem(`cover_color_${item.anilistId}`, media.coverImage.color);
                } catch (e) {}
        }
        const img = document.getElementById('workSheetCover');
        if (img && media.coverImage?.large && (!img.src || img.src.startsWith('data:'))) img.src = media.coverImage.large;

        const global = media.averageScore ? (media.averageScore / 10).toFixed(1) : null;
        const mine = parseFloat(item.score) || 0;
        const diff = global ? mine - parseFloat(global) : null;
        const diffText =
            diff === null
                ? ''
                : Math.abs(diff) < 0.3
                  ? 'Coincides con la media'
                  : diff > 0
                    ? `+${diff.toFixed(1)} sobre la media`
                    : `${diff.toFixed(1)} bajo la media`;
        const length =
            type === 'manga'
                ? [media.volumes && `${media.volumes} tomos`, media.chapters && `${media.chapters} capítulos`].filter(Boolean).join(' · ')
                : media.episodes
                  ? `${media.episodes} episodios`
                  : '';
        const synopsis = htmlToText(media.description).trim();

        box().innerHTML = `
            <div class="work-sheet-stats">
                ${global ? `<div><strong>${global}</strong><span>Media AniList</span></div>` : ''}
                ${diffText ? `<div><strong>${esc(diffText.split(' ')[0])}</strong><span>${esc(diffText.split(' ').slice(1).join(' '))}</span></div>` : ''}
                ${length ? `<div><strong>${esc(length.split(' ')[0])}</strong><span>${esc(length.split(' ').slice(1).join(' '))}</span></div>` : ''}
            </div>
            ${media.genres?.length ? `<div class="gacha-tags">${media.genres.map(g => `<span class="gacha-tag">${esc(g)}</span>`).join('')}</div>` : ''}
            ${synopsis ? `<p class="work-sheet-synopsis">${esc(synopsis.length > 420 ? synopsis.slice(0, 420).trim() + '…' : synopsis)}</p>` : ''}
            <a class="work-sheet-link" href="${esc(media.siteUrl)}" target="_blank" rel="noopener">Ver en AniList ↗</a>
            ${item.anilistId ? '' : `<p class="work-sheet-note">Esta obra aún no está vinculada con AniList: los datos son del resultado más parecido. Vincúlala editando su AniList ID (${media.id}).</p>`}`;
        staggerIn(box().children, { step: 50 });
    } catch (err) {
        if (box())
            box().innerHTML = `<p class="work-sheet-note">No se pudieron cargar los datos de AniList${err.message === 'RATE_LIMIT' ? ' (límite de peticiones, prueba en un minuto)' : ''}.</p>`;
    }
}

function rateWorkInCalificador(title) {
    closeWorkSheet();
    switchView('calificadorView');
    setTimeout(() => {
        document.getElementById('calificadorSearchInput').value = title;
        searchAnimeCalificador();
    }, 300);
}

// --- Editar y borrar (Code.gs v3) ---
async function ensureEditableWork(item) {
    let version = 1;
    try {
        version = await getServerVersion();
    } catch (err) {
        toast(err.message, { type: 'error' });
        return false;
    }
    if (version < 3 || !item._row) {
        toast('Para editar o borrar desde la app, actualiza el Apps Script a la versión 3 (pasos en docs/APPS-SCRIPT.md).', {
            type: 'error'
        });
        return false;
    }
    return true;
}

async function editWorkSheet(type, key) {
    const item = findWork(type, key);
    if (!item || !(await ensureEditableWork(item))) return;
    const body = document.getElementById('workSheetBody');
    const title = type === 'manga' ? item.manga : item.anime;
    const seasonOptions = ['Winter', 'Spring', 'Summer', 'Fall']
        .map(
            s =>
                `<option value="${s}" ${String(item.season).toLowerCase() === s.toLowerCase() ? 'selected' : ''}>${seasonLabel(s)}</option>`
        )
        .join('');

    body.innerHTML = `
        <form class="work-edit-form" id="workEditForm">
            <h3 id="workSheetTitle" class="work-sheet-title">Editar ${type === 'manga' ? 'manga' : 'anime'}</h3>
            <div class="form-group"><label for="weTitle">Título</label><input id="weTitle" type="text" required value="${esc(title)}"></div>
            ${type === 'anime' ? `<div class="form-group"><label for="weSeason">Temporada</label><select id="weSeason">${seasonOptions}</select></div>` : ''}
            <div class="form-group"><label for="weYear">Año</label><input id="weYear" type="number" inputmode="numeric" min="1950" max="2100" required value="${esc(parseInt(item.year, 10) || '')}"></div>
            <div class="form-group"><label for="weCreator">${type === 'manga' ? 'Autor' : 'Estudio'}</label><input id="weCreator" type="text" value="${esc(type === 'manga' ? item.author : item.studio)}"></div>
            <div class="form-group"><label for="weScore">Nota</label>
                <div class="score-container"><input id="weScore" type="range" min="1" max="10" value="${esc(Math.round(parseFloat(item.score) || 7))}" oninput="document.getElementById('weScoreVal').textContent = this.value"><span class="score-value" id="weScoreVal">${esc(Math.round(parseFloat(item.score) || 7))}</span></div>
            </div>
            <div class="form-group"><label for="weAnilist">AniList ID <span class="work-sheet-note">(el número de su URL en anilist.co; vacío = sin vincular)</span></label><input id="weAnilist" type="number" inputmode="numeric" min="1" value="${esc(item.anilistId || '')}"></div>
            <div class="dialog-actions">
                <button type="button" class="btn btn--ghost" onclick="renderWorkSheetView('${type}', findWork('${type}', ${jsArg(key)}))">Cancelar</button>
                <button type="submit" class="btn btn--primary" id="weSave">Guardar cambios</button>
            </div>
        </form>`;
    document.getElementById('weTitle').focus();

    document.getElementById('workEditForm').addEventListener('submit', async e => {
        e.preventDefault();
        const save = document.getElementById('weSave');
        const fields =
            type === 'manga'
                ? {
                      manga: document.getElementById('weTitle').value.trim(),
                      year: parseInt(document.getElementById('weYear').value, 10),
                      author: document.getElementById('weCreator').value.trim() || 'Desconocido',
                      score: parseInt(document.getElementById('weScore').value, 10)
                  }
                : {
                      anime: document.getElementById('weTitle').value.trim(),
                      season: document.getElementById('weSeason').value,
                      year: parseInt(document.getElementById('weYear').value, 10),
                      studio: document.getElementById('weCreator').value.trim() || 'Desconocido',
                      score: parseInt(document.getElementById('weScore').value, 10)
                  };
        fields.anilistId = parseInt(document.getElementById('weAnilist').value, 10) || '';
        save.disabled = true;
        save.textContent = 'Guardando…';
        try {
            await sheetsWrite({ action: 'update_entry', target: type, row: item._row, title, fields }, { minVersion: 3 });
            toast(`"${type === 'manga' ? fields.manga : fields.anime}" actualizado.`, { type: 'success' });
            closeWorkSheet();
            refreshAfterWorkChange(type);
        } catch (err) {
            toast(err.message, { type: 'error' });
            save.disabled = false;
            save.textContent = 'Guardar cambios';
        }
    });
}

async function deleteWorkSheet(type, key) {
    const item = findWork(type, key);
    if (!item || !(await ensureEditableWork(item))) return;
    const title = type === 'manga' ? item.manga : item.anime;
    const ok = await confirmDialog({
        title: `Borrar "${title}"`,
        message: 'Se eliminará su fila de tu Google Sheets. No se puede deshacer desde la app.',
        confirmText: 'Borrar',
        danger: true
    });
    if (!ok) return;
    try {
        await sheetsWrite({ action: 'delete_entry', target: type, row: item._row, title }, { minVersion: 3 });
        toast(`"${title}" borrado.`, { type: 'success' });
        closeWorkSheet();
        refreshAfterWorkChange(type);
    } catch (err) {
        toast(err.message, { type: 'error' });
    }
}

// Tras editar/borrar, las filas cambian: se recarga la lista afectada.
function refreshAfterWorkChange(type) {
    invalidateList(type === 'manga' ? 'manga' : 'master');
    refreshCurrentView();
}
