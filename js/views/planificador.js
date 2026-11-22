        // --- PLANIFICADOR ESTACIONAL ---
        let _planificadorInitialized = false, _planificadorSaveTimeout = null;
        // Cambios pendientes de subir (guardado por fila con Code.gs v2).
        const _planPending = { upsert: new Map(), remove: new Set() };
        function queuePlanUpsert(item) { _planPending.remove.delete(item.id); _planPending.upsert.set(item.id, item); }
        function queuePlanRemove(id) { _planPending.upsert.delete(id); _planPending.remove.add(id); }
        function getSafeEl(id) { const els = document.querySelectorAll('#' + id); return els[els.length - 1]; }

        function initPlanificadorFetch() {
            if (_planificadorInitialized) { getSafeEl('planificadorLoader').style.display = 'none'; getSafeEl('planificadorContent').style.display = 'block'; return; }
            getSafeEl('planificadorLoader').style.display = 'block'; getSafeEl('planificadorContent').style.display = 'none';

            sheetsReadOnce('planificador', 'PLANIFICADOR_STATE').then(data => {
                getSafeEl('planificadorLoader').style.display = 'none'; getSafeEl('planificadorContent').style.display = 'block';
                if(data.length > 0 && data[0].status !== undefined) {
                    _planificadorSavedProgress = data.map(i => ({ id: String(i.id), year: i.year, season: i.season, title: i.title, cover: i.cover, status: i.status }));
                }
                _planificadorInitialized = true;
                getSafeEl('planificadorGrid').innerHTML = '<div style="grid-column:1/-1; text-align:center; color:rgba(255,255,255,0.6); padding: 50px 0; font-size:1.1rem;">Tus datos están sincronizados.<br>Selecciona arriba un Año y Temporada y pulsa <strong>"Desplegar"</strong> para cargar los animes.</div>';
            }).catch(err => {
                getSafeEl('planificadorLoader').style.display = 'none';
                // Sin el estado guardado no dejamos editar: guardar sobrescribiría la nube con una lista vacía.
                showViewError(`No se pudo cargar tu planificador. ${err.message}`);
            });
        }

        async function loadSeasonPlanificador() {
            const year = parseInt(getSafeEl('planYearSelect').value);
            const seasonStr = getSafeEl('planSeasonSelect').value.toUpperCase();
            const grid = getSafeEl('planificadorGrid');
            
            grid.innerHTML = '<div class="loader" style="grid-column:1/-1; padding:40px 0;"><div class="spinner"></div>Descargando catálogo completo de la temporada mediante AniList API (esto puede tardar unos segundos)... ⏳</div>';
            
            try {
                let allAnime = [], page = 1, hasNextPage = true;
                // Reemplaza la consulta 'gql' existente por esta:
const gql = `query($season: MediaSeason, $seasonYear: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        media(season: $season, seasonYear: $seasonYear, type: ANIME, format: TV) {
            id 
            title { romaji english } 
            coverImage { large }
            relations {
                edges {
                    relationType
                }
            }
        }
    }
}`;

                while (hasNextPage) {
                    const data = await fetchAnilist(gql, { season: seasonStr, seasonYear: year, page: page });
                    const medias = data?.data?.Page?.media || [];
                    
                    // Reemplaza el bloque medias.forEach por este:
medias.forEach(m => {
    // Si el anime tiene una precuela en sus relaciones, significa que es una secuela.
    const isSequel = m.relations && m.relations.edges && m.relations.edges.some(edge => edge.relationType === 'PREQUEL');
    
    allAnime.push({ 
        mal_id: m.id, 
        title: m.title.romaji, 
        titleEnglish: m.title.english,
        images: { jpg: { large_image_url: m.coverImage?.large } },
        isSequel: isSequel // Guardamos la propiedad
    });
});
                    
                    hasNextPage = data?.data?.Page?.pageInfo?.hasNextPage;
                    if (hasNextPage) { page++; await new Promise(r => setTimeout(r, 400)); }
                }
                
                if (allAnime.length > 0) {
                    const uniqueAnimeMap = new Map();
                    allAnime.forEach(anime => { if (!uniqueAnimeMap.has(anime.mal_id)) { uniqueAnimeMap.set(anime.mal_id, anime); } });
                    allAnime = Array.from(uniqueAnimeMap.values());
                    allAnime.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
                    
                    _currentSeasonData = allAnime;
                    renderSeasonGrid();
                } else { grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--neon-red); padding: 40px 0;">No se han encontrado animes (TV) para esta temporada.</div>'; }
            } catch (e) { grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--neon-red); padding: 40px 0;">Error de red al conectar con AniList API.</div>'; }
        }

        function renderSeasonGrid() {
            const grid = getSafeEl('planificadorGrid'); grid.innerHTML = '';
            if (_currentSeasonData.length === 0) return;

            let autoSyncNeeded = false;
            const filterElement = getSafeEl('planStatusFilter'), currentFilter = filterElement ? filterElement.value : 'all';
            let visibleCount = 0;

            const owned = buildOwnedIndex(_masterData, 'anime');
            _currentSeasonData.forEach(anime => {
                const malId = String(anime.mal_id), title = anime.title, cover = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || FALLBACK_IMG;
                // mal_id es en realidad el ID de AniList (la consulta es a AniList).
                const isRegistered = owned.has({ id: anime.mal_id, title: { romaji: title, english: anime.titleEnglish } });
                const savedItem = _planificadorSavedProgress.find(p => String(p.id) === malId);
                let status = savedItem ? savedItem.status : 'default';

                if (isRegistered && status !== 'visto') {
                    status = 'visto';
                    _planificadorSavedProgress = _planificadorSavedProgress.filter(p => String(p.id) !== String(malId));
                    const autoItem = { id: String(malId), title: title, cover: cover, year: parseInt(getSafeEl('planYearSelect').value), season: getSafeEl('planSeasonSelect').value, status: 'visto' };
                    _planificadorSavedProgress.push(autoItem);
                    queuePlanUpsert(autoItem);
                    autoSyncNeeded = true;
                }

                if (currentFilter !== 'all' && status !== currentFilter) return; 
                visibleCount++;

                // Reemplaza el bloque donde se define "const card" y su "innerHTML" por este:
const card = document.createElement('div'); 
card.className = `plan-card plan-status-${status}`;
card.dataset.id = malId;

// Generamos la etiqueta visual si es secuela
const sequelBadge = anime.isSequel ? '<span style="background: var(--neon-purple); color: #fff; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; position: absolute; top: 8px; left: 8px; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">SECUELA</span>' : '';

card.innerHTML = `
    <div class="plan-card-img">
        ${sequelBadge}
        <img src="${esc(cover)}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';">
    </div>
    <div class="plan-card-info">
        <span class="plan-card-title" title="${esc(title)}">${esc(title)}</span>
        <select class="plan-card-select" onchange="updateSeasonPlanStatus('${malId}', this.value)">
            <option value="default" ${status==='default'?'selected':''}>⚪ Sin marcar</option>
            <option value="viendo" ${status==='viendo'?'selected':''}>🔵 Viéndolo</option>
            <option value="pausa" ${status==='pausa'?'selected':''}>⏸️ En pausa</option>
            <option value="visto" ${status==='visto'?'selected':''}>🟣 Lo he visto</option>
            <option value="abandonado" ${status==='abandonado'?'selected':''}>✖️ Abandonado</option>
            <option value="interesa" ${status==='interesa'?'selected':''}>🟢 Me interesa</option>
            <option value="sin_prisa" ${status==='sin_prisa'?'selected':''}>🟡 Sin prisa</option>
            <option value="poco_interes" ${status==='poco_interes'?'selected':''}>🔴 Poco interés</option>
            <option value="no_ver" ${status==='no_ver'?'selected':''}>⚫ NO quiero verlo</option>
        </select>
    </div>
`;
grid.appendChild(card);
            });

            if (visibleCount === 0 && _currentSeasonData.length > 0 && filterElement) {
                const filterName = filterElement.options[filterElement.selectedIndex].text;
                grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:rgba(255,255,255,0.6); padding: 50px 0; font-size:1.1rem;">No hay animes en esta temporada con el estado <strong>"${esc(filterName)}"</strong>.</div>`;
            }
            if (autoSyncNeeded) setTimeout(() => syncPlanificadorToCloud(), 1000);
        }

        function updateSeasonPlanStatus(malId, newStatus) {
            const currentYear = getSafeEl('planYearSelect').value, currentSeason = getSafeEl('planSeasonSelect').value;
            _planificadorSavedProgress = _planificadorSavedProgress.filter(p => String(p.id) !== String(malId));
            
            if (newStatus !== 'default') {
                const animeRef = _currentSeasonData.find(a => String(a.mal_id) === String(malId));
                if (animeRef) {
                    const item = { id: String(malId), title: animeRef.title, cover: animeRef.images?.jpg?.large_image_url || animeRef.images?.jpg?.image_url || FALLBACK_IMG, year: parseInt(currentYear), season: currentSeason, status: newStatus };
                    _planificadorSavedProgress.push(item);
                    queuePlanUpsert(item);
                }
            } else {
                queuePlanRemove(String(malId));
            }
            
            // Sin filtro basta con recolorear esa tarjeta (antes se repintaban todas).
            const filter = getSafeEl('planStatusFilter');
            const card = getSafeEl('planificadorGrid').querySelector(`.plan-card[data-id="${CSS.escape(String(malId))}"]`);
            if (card && (!filter || filter.value === 'all')) card.className = `plan-card plan-status-${newStatus}`;
            else renderSeasonGrid();
            const btn = getSafeEl('btnSyncPlanificador');
            if (btn) { btn.innerText = "⏳ Guardando..."; btn.style.borderColor = "var(--neon-yellow)"; btn.style.color = "var(--neon-yellow)"; }
            
            clearTimeout(_planificadorSaveTimeout);
            _planificadorSaveTimeout = setTimeout(() => { syncPlanificadorToCloud(); }, 1000);
        }

        function syncPlanificadorToCloud() {
            const btn = getSafeEl('btnSyncPlanificador');
            if(btn) { btn.innerText = "Sincronizando ☁️"; btn.disabled = true; }
            savePlanificadorChanges().then(result => {
                if(btn) {
                    btn.innerText = savedLabel(result); btn.style.borderColor = "var(--neon-green)"; btn.style.color = "var(--neon-green)";
                    setTimeout(() => { btn.innerText = "☁️ Guardar Cambios"; btn.disabled = false; }, 2000);
                }
            }).catch(err => {
                console.warn('Planificador no guardado:', err);
                if(btn) {
                    btn.innerText = "No guardado ❌ (reintentar)"; btn.style.borderColor = "var(--neon-red)"; btn.style.color = "var(--neon-red)";
                    btn.title = err.message;
                    setTimeout(() => { btn.disabled = false; }, 1500);
                }
            });
        }

        // Con Code.gs v2 sube solo lo que cambió (upsert/delete por id); con el
        // backend antiguo reescribe la hoja entera como antes.
        async function savePlanificadorChanges() {
            const version = await getServerVersion();
            if (version < 2) {
                _planPending.upsert.clear(); _planPending.remove.clear();
                return sheetsWrite({ action: "save_planificador", payload: _planificadorSavedProgress });
            }

            const items = [..._planPending.upsert.values()], ids = [..._planPending.remove];
            _planPending.upsert.clear(); _planPending.remove.clear();
            if (items.length === 0 && ids.length === 0) return { confirmed: true };

            try {
                const results = [];
                if (items.length) results.push(await sheetsWrite({ action: 'upsert_rows', sheet: 'PLANIFICADOR_STATE', items }, { minVersion: 2 }));
                if (ids.length) results.push(await sheetsWrite({ action: 'delete_rows', sheet: 'PLANIFICADOR_STATE', ids }, { minVersion: 2 }));
                return { confirmed: results.every(r => r.confirmed) };
            } catch (err) {
                // Se devuelven a la cola para el siguiente intento (sin pisar cambios más nuevos).
                items.forEach(item => { if (!_planPending.upsert.has(item.id) && !_planPending.remove.has(item.id)) _planPending.upsert.set(item.id, item); });
                ids.forEach(id => { if (!_planPending.upsert.has(id)) _planPending.remove.add(id); });
                throw err;
            }
        }

        // Añadir una obra al planificador desde otras vistas (Gacha,
        // Recomendaciones). media: { id, title:{romaji}, coverImage, season, seasonYear, startDate }.
        async function addToPlanificador(media, status = 'interesa') {
            const month = media.startDate && media.startDate.month;
            const rawSeason = media.season || (month ? ['WINTER', 'WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'FALL', 'FALL', 'FALL'][month - 1] : null);
            const season = rawSeason ? rawSeason.charAt(0) + rawSeason.slice(1).toLowerCase() : currentAnimeSeason();
            const item = {
                id: String(media.id), title: media.title?.romaji || media.title?.english || '',
                cover: media.coverImage?.large || media.coverImage?.extraLarge || '',
                year: media.seasonYear || media.startDate?.year || new Date().getFullYear(), season, status
            };
            const result = await sheetsWrite({ action: 'upsert_rows', sheet: 'PLANIFICADOR_STATE', items: [item] }, { minVersion: 2 });
            _planificadorSavedProgress = _planificadorSavedProgress.filter(p => String(p.id) !== item.id);
            _planificadorSavedProgress.push(item);
            toast(result.queued ? `"${item.title}" se añadirá al Planificador al volver la conexión.` : `"${item.title}" añadido al Planificador (${seasonLabel(season)} ${item.year}).`, { type: 'success' });
        }

        // ------------------------------------------------------------
        // PRÓXIMOS EPISODIOS (en el inicio): lo que tienes como "Me interesa"
        // o "Viéndolo" y está en emisión, ordenado por hora de emisión.
        // ------------------------------------------------------------
        function airingLabel(ts) {
            const d = new Date(ts * 1000), now = new Date();
            const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const days = Math.round((new Date(d.toDateString()) - new Date(now.toDateString())) / 86400000);
            if (days === 0) return `hoy ${time}`;
            if (days === 1) return `mañana ${time}`;
            if (days < 7) return `${d.toLocaleDateString('es-ES', { weekday: 'long' })} ${time}`;
            return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} ${time}`;
        }

        async function renderUpcomingEpisodes() {
            const box = document.getElementById('hubUpcoming');
            if (!box || !getAccessKey()) return;
            try {
                const state = _planificadorInitialized ? _planificadorSavedProgress : await sheetsReadOnce('planificador', 'PLANIFICADOR_STATE');
                const ids = [...new Set((state || []).filter(p => p.status === 'interesa' || p.status === 'viendo').map(p => parseInt(p.id, 10)).filter(Boolean))];
                if (!ids.length) { box.hidden = true; return; }
                const json = await fetchAnilist(`query($ids: [Int]) { Page(page: 1, perPage: 12) {
                    airingSchedules(mediaId_in: $ids, notYetAired: true, sort: TIME) { episode airingAt media { id title { romaji } coverImage { large } } } } }`, { ids: ids.slice(0, 50) });
                const seen = new Set();
                const next = (json?.data?.Page?.airingSchedules || []).filter(s => s.media && !seen.has(s.media.id) && seen.add(s.media.id)).slice(0, 6);
                if (_currentView !== 'hubView') return;
                if (!next.length) { box.hidden = true; return; }
                box.hidden = false;
                box.innerHTML = `<h2 class="hub-group-title">Próximos episodios</h2>
                    <ul class="upcoming-list">${next.map(s => `
                        <li class="upcoming-item">
                            <img src="${esc(s.media.coverImage?.large || FALLBACK_IMG)}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';">
                            <span class="upcoming-text"><span class="upcoming-title">${esc(s.media.title.romaji)}</span>
                            <span class="upcoming-meta">Episodio ${esc(s.episode)} · ${esc(airingLabel(s.airingAt))}</span></span>
                        </li>`).join('')}</ul>`;
            } catch (e) {
                box.hidden = true;   // sin conexión o sin planificador: no se muestra nada
            }
        }
