        // --- PLANIFICADOR ESTACIONAL ---
        let _planificadorInitialized = false, _planificadorSaveTimeout = null;
        function getSafeEl(id) { const els = document.querySelectorAll('#' + id); return els[els.length - 1]; }

        function initPlanificadorFetch() {
            if (_planificadorInitialized) { getSafeEl('planificadorLoader').style.display = 'none'; getSafeEl('planificadorContent').style.display = 'block'; return; }
            getSafeEl('planificadorLoader').style.display = 'block'; getSafeEl('planificadorContent').style.display = 'none';

            window.handlePlanificadorResponse = function(response) {
                getSafeEl('planificadorLoader').style.display = 'none'; getSafeEl('planificadorContent').style.display = 'block';
                if(response.status === 'success' && response.data && response.data.length > 0 && response.data[0].status !== undefined) {
                    _planificadorSavedProgress = response.data.map(i => ({ id: String(i.id), year: i.year, season: i.season, title: i.title, cover: i.cover, status: i.status }));
                }
                _planificadorInitialized = true;
                getSafeEl('planificadorGrid').innerHTML = '<div style="grid-column:1/-1; text-align:center; color:rgba(255,255,255,0.4); padding: 50px 0; font-size:1.1rem;">Tus datos están sincronizados.<br>Selecciona arriba un Año y Temporada y pulsa <strong>"Desplegar Temporada"</strong> para cargar los animes.</div>';
                const scriptTag = document.getElementById('jsonpPlanificadorScript'); if(scriptTag) scriptTag.remove();
            };

            const script = document.createElement('script'); script.id = 'jsonpPlanificadorScript';
            script.src = `${sheetsUrl()}sheet=PLANIFICADOR_STATE&tab=PLANIFICADOR_STATE&sheetName=PLANIFICADOR_STATE&callback=handlePlanificadorResponse&_=${new Date().getTime()}`;
            document.body.appendChild(script);
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
            title { romaji } 
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

            _currentSeasonData.forEach(anime => {
                const malId = String(anime.mal_id), title = anime.title, cover = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || FALLBACK_IMG;
                const isRegistered = _masterData.some(m => m.anime && m.anime.toLowerCase() === title.toLowerCase());
                const savedItem = _planificadorSavedProgress.find(p => String(p.id) === malId);
                let status = savedItem ? savedItem.status : 'default';

                if (isRegistered && status !== 'visto') {
                    status = 'visto';
                    _planificadorSavedProgress = _planificadorSavedProgress.filter(p => String(p.id) !== String(malId));
                    _planificadorSavedProgress.push({ id: String(malId), title: title, cover: cover, year: parseInt(getSafeEl('planYearSelect').value), season: getSafeEl('planSeasonSelect').value, status: 'visto' });
                    autoSyncNeeded = true;
                }

                if (currentFilter !== 'all' && status !== currentFilter) return; 
                visibleCount++;

                // Reemplaza el bloque donde se define "const card" y su "innerHTML" por este:
const card = document.createElement('div'); 
card.className = `plan-card plan-status-${status}`;

// Generamos la etiqueta visual si es secuela
const sequelBadge = anime.isSequel ? '<span style="background: var(--neon-purple); color: #fff; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; position: absolute; top: 8px; left: 8px; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">SECUELA</span>' : '';

card.innerHTML = `
    <div class="plan-card-img">
        ${sequelBadge}
        <img src="${cover}" alt="cover" onerror="this.src='${FALLBACK_IMG}';">
    </div>
    <div class="plan-card-info">
        <span class="plan-card-title" title="${title}">${title}</span>
        <select class="plan-card-select" onchange="updateSeasonPlanStatus('${malId}', this.value)">
            <option value="default" ${status==='default'?'selected':''}>⚪ Sin marcar</option>
            <option value="visto" ${status==='visto'?'selected':''}>🟣 Lo he visto</option>
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
                grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:rgba(255,255,255,0.4); padding: 50px 0; font-size:1.1rem;">No hay animes en esta temporada con el estado <strong>"${filterName}"</strong>.</div>`;
            }
            if (autoSyncNeeded) setTimeout(() => syncPlanificadorToCloud(), 1000);
        }

        function updateSeasonPlanStatus(malId, newStatus) {
            const currentYear = getSafeEl('planYearSelect').value, currentSeason = getSafeEl('planSeasonSelect').value;
            _planificadorSavedProgress = _planificadorSavedProgress.filter(p => String(p.id) !== String(malId));
            
            if (newStatus !== 'default') {
                const animeRef = _currentSeasonData.find(a => String(a.mal_id) === String(malId));
                if (animeRef) { _planificadorSavedProgress.push({ id: String(malId), title: animeRef.title, cover: animeRef.images?.jpg?.large_image_url || animeRef.images?.jpg?.image_url || FALLBACK_IMG, year: parseInt(currentYear), season: currentSeason, status: newStatus }); }
            }
            
            renderSeasonGrid();
            const btn = getSafeEl('btnSyncPlanificador');
            if (btn) { btn.innerText = "⏳ Guardando..."; btn.style.borderColor = "var(--neon-yellow)"; btn.style.color = "var(--neon-yellow)"; }
            
            clearTimeout(_planificadorSaveTimeout);
            _planificadorSaveTimeout = setTimeout(() => { syncPlanificadorToCloud(); }, 1000);
        }

        function syncPlanificadorToCloud() {
            const btn = getSafeEl('btnSyncPlanificador');
            if(btn) { btn.innerText = "Sincronizando ☁️"; btn.disabled = true; }
            const payload = { action: "save_planificador", payload: _planificadorSavedProgress };

            fetch(WEB_APP_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withAuth(payload)) }).then(() => {
                if(btn) {
                    btn.innerText = "¡Guardado! ✔️"; btn.style.borderColor = "var(--neon-green)"; btn.style.color = "var(--neon-green)";
                    setTimeout(() => { btn.innerText = "☁️ Guardar Cambios"; btn.style.borderColor = "var(--neon-cyan)"; btn.style.color = "var(--neon-cyan)"; btn.disabled = false; }, 2000);
                }
            }).catch(() => {
                if(btn) {
                    btn.innerText = "Fallo de red ❌"; btn.style.borderColor = "var(--neon-red)"; btn.style.color = "var(--neon-red)";
                    setTimeout(() => { btn.innerText = "☁️ Guardar Cambios"; btn.disabled = false; }, 2500);
                }
            });
        }
