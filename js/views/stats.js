// --- LÓGICA DE FILTROS Y MÉTRICAS (ESTADÍSTICAS Y VISTAS) ---
function buildTimeMachine() {
    document.getElementById('timeMachineLoader').style.display = 'none';
    document.getElementById('timeMachineContent').style.display = 'block';

    let years = new Set();
    _masterData.forEach(i => {
        if (i.year && i.year !== '????') years.add(i.year);
    });
    _mangaData.forEach(i => {
        if (i.year && i.year !== '????') years.add(i.year);
    });

    let sortedYears = Array.from(years).sort((a, b) => b - a);

    const select = document.getElementById('tmYearSelect');
    select.innerHTML = '<option value="" disabled selected>SELECCIONA UN AÑO</option>';
    sortedYears.forEach(y => {
        select.insertAdjacentHTML('beforeend', `<option value="${esc(y)}">${esc(y)}</option>`);
    });
}

function renderTimeMachine(year) {
    if (!year) return;
    year = parseInt(year);
    const wrappedBtn = document.getElementById('btnWrapped');
    if (wrappedBtn) {
        wrappedBtn.hidden = false;
        wrappedBtn.textContent = `🎁 Crear mi Wrapped ${year}`;
    }

    let animesOfYear = _masterData.filter(i => parseInt(i.year) === year);
    let mangasOfYear = _mangaData.filter(i => parseInt(i.year) === year);

    let avgAnime = animesOfYear.length > 0 ? (animesOfYear.reduce((sum, i) => sum + i.score, 0) / animesOfYear.length).toFixed(2) : '0.00';
    let avgManga = mangasOfYear.length > 0 ? (mangasOfYear.reduce((sum, i) => sum + i.score, 0) / mangasOfYear.length).toFixed(2) : '0.00';

    let bestAnime = animesOfYear.length > 0 ? animesOfYear.reduce((max, i) => (i.score > max.score ? i : max), animesOfYear[0]) : null;
    let bestManga = mangasOfYear.length > 0 ? mangasOfYear.reduce((max, i) => (i.score > max.score ? i : max), mangasOfYear[0]) : null;

    let studioAgg = {};
    animesOfYear.forEach(i => {
        if (i.studio && i.studio !== 'Desconocido') {
            i.studio.split(/,|\s+&\s+|\s+and\s+/i).forEach(s => {
                let name = s.trim();
                if (name) studioAgg[name] = (studioAgg[name] || 0) + 1;
            });
        }
    });
    let topStudio = 'N/A';
    if (Object.keys(studioAgg).length > 0) {
        topStudio = Object.keys(studioAgg).reduce((a, b) => (studioAgg[a] > studioAgg[b] ? a : b));
    }

    document.getElementById('tmKpiAnimeCount').innerText = animesOfYear.length;
    document.getElementById('tmKpiMangaCount').innerText = mangasOfYear.length;
    document.getElementById('tmKpiAnimeAvg').innerText = avgAnime;
    document.getElementById('tmKpiMangaAvg').innerText = avgManga;
    document.getElementById('tmKpiStudio').innerText = topStudio;

    const featuredContainer = document.getElementById('tmFeaturedContainer');
    let featuredHTML = ''; // Construimos el HTML en memoria primero

    if (bestAnime) {
        const neonClass = `score-neon-${Math.round(bestAnime.score)}`;
        featuredHTML += `
            <div class="tm-featured-card anime" ${workSheetAttrs(bestAnime, 'anime')}>
                <div class="img-container" style="width: 80px; height: 115px; border-radius: 8px;">
                    <img id="tm-best-anime-img" data-type="anime" data-title="${esc(bestAnime.anime)}" alt="" class="img-thumb" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='115'><rect width='80' height='115' fill='%23111122'/></svg>">
                </div>
                <div style="display:flex; flex-direction:column; gap:5px; overflow:hidden;">
                    <span style="color:var(--neon-cyan); font-weight:bold; font-size:0.75rem;">MEJOR ANIME DEL AÑO</span>
                    <span style="font-weight:900; font-size:1.1rem; color:var(--text-strong); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(bestAnime.anime)}</span>
                    <span style="color:var(--text-subtle); font-size:0.8rem;">${esc(bestAnime.studio)}</span>
                    <span class="detail-score-badge ${neonClass}" style="margin-top:5px;">${esc(bestAnime.score)} ⭐</span>
                </div>
            </div>
        `;
    } else {
        featuredHTML += `<div class="tm-featured-card anime" style="justify-content:center; color:rgba(var(--fg-rgb), 0.6);">Sin anime este año</div>`;
    }

    if (bestManga) {
        const neonClass = `score-neon-${Math.round(bestManga.score)}`;
        featuredHTML += `
            <div class="tm-featured-card manga" ${workSheetAttrs(bestManga, 'manga')}>
                <div class="img-container" style="width: 80px; height: 115px; border-radius: 8px;">
                    <img id="tm-best-manga-img" data-type="manga" data-title="${esc(bestManga.manga)}" data-author="${esc(bestManga.author)}" alt="" class="img-thumb" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='115'><rect width='80' height='115' fill='%23111122'/></svg>">
                </div>
                <div style="display:flex; flex-direction:column; gap:5px; overflow:hidden;">
                    <span style="color:var(--neon-green); font-weight:bold; font-size:0.75rem;">MEJOR MANGA DEL AÑO</span>
                    <span style="font-weight:900; font-size:1.1rem; color:var(--text-strong); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(bestManga.manga)}</span>
                    <span style="color:var(--text-subtle); font-size:0.8rem;">Autor: ${esc(bestManga.author)}</span>
                    <span class="detail-score-badge ${neonClass}" style="margin-top:5px;">${esc(bestManga.score)} ⭐</span>
                </div>
            </div>
        `;
    } else {
        featuredHTML += `<div class="tm-featured-card manga" style="justify-content:center; color:rgba(var(--fg-rgb), 0.6);">Sin manga este año</div>`;
    }

    // Inyectamos el HTML de golpe
    featuredContainer.innerHTML = featuredHTML;

    // Ahora que el HTML está firme, activamos la búsqueda de las portadas
    if (bestAnime) globalImageObserver.observe(document.getElementById('tm-best-anime-img'));
    if (bestManga) globalImageObserver.observe(document.getElementById('tm-best-manga-img'));

    const galleryContainer = document.getElementById('tmGalleryContainer');
    galleryContainer.innerHTML = '';
    let combined = [...animesOfYear.map(a => ({ ...a, type: 'anime' })), ...mangasOfYear.map(m => ({ ...m, type: 'manga' }))];
    combined.sort((a, b) => b.score - a.score);

    if (combined.length === 0) {
        galleryContainer.innerHTML = emptyStateHTML({
            art: 'calendar',
            title: 'Nada registrado en este año',
            text: 'Elige otro año en el selector o registra lo que viste y leíste entonces.',
            actions: [{ label: '＋ Registrar anime', onclick: "switchView('formView')", accent: 'magenta' }]
        });
        return;
    }

    combined.forEach((item, index) => {
        const imgId = `tm-gallery-img-${index}`;
        const title = item.type === 'anime' ? item.anime : item.manga;
        const authorAttr = item.type === 'manga' ? `data-author="${esc(item.author)}"` : '';
        const typeAttr = `data-type="${item.type}"`;
        const div = document.createElement('div');
        div.className = `tm-gallery-item ${item.type}`;
        div.setAttribute('role', 'button');
        div.tabIndex = 0;
        div.setAttribute('aria-label', `Abrir ficha de ${title}`);
        div.addEventListener('click', () => openWorkSheet(item.type, workKey(item, item.type)));
        div.innerHTML = `<img id="${imgId}" ${typeAttr} data-title="${esc(title)}" ${authorAttr} title="${esc(title)} (${esc(item.score)}⭐)" alt="" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='90' height='130'><rect width='90' height='130' fill='%23111122'/></svg>">`;
        galleryContainer.appendChild(div);

        globalImageObserver.observe(document.getElementById(imgId));
    });
}

function processFavoritesData() {
    _favoritesRanking = [];
    _favsRawData.forEach((item, idx) => {
        let name = '';
        for (let key in item) {
            let normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
            if (normalizedKey === 'favanime' || normalizedKey === 'anime' || normalizedKey === 'title' || normalizedKey === 'fav') {
                name = item[key];
                break;
            }
        }
        if (!name) {
            for (let key in item) {
                if (key.toLowerCase() !== 'top' && typeof item[key] === 'string' && item[key].length > 0) {
                    name = item[key];
                    break;
                }
            }
        }
        if (name && name.trim()) {
            _favoritesRanking.push({ id: 'fav-' + idx + '-' + Math.random(), name: name.trim() });
        }
    });
}

// "Recargar" a mano: siempre desde Sheets, sin la copia local.
function reloadStatsData() {
    invalidateList('master');
    const activeView = document.querySelector('.view.active').id;
    if (activeView === 'studiosView') {
        initMasterDataFetch(() => renderTopStudiosView());
    } else if (activeView === 'detailView') {
        initMasterDataFetch(() => renderDetailView());
    } else if (activeView === 'mangaLibraryView') {
        initMangaDataFetch(true);
    } else if (activeView === 'annualRankingView') {
        initMasterDataFetch(() => initAnnualRankingFetch(() => renderAnnualRankingView()));
    } else if (activeView === 'favoritesView') {
        initFavoritesDataFetch(true);
    } else if (activeView === 'timeMachineView') {
        invalidateList('manga');
        initTimeMachineDataFetch();
    } else if (activeView === 'recommendationsView') {
        invalidateList('manga');
        initRecommendationsFetch();
    } else if (activeView === 'top150View') {
        initMasterDataFetch(() => initTop150Fetch());
    } else if (activeView === 'calificadorView') {
        initCalificadorFetch();
    } else if (activeView === 'planificadorView') {
        initPlanificadorFetch();
    } else {
        initMasterDataFetch();
    }
}

function populateFilterDropdowns(data) {
    const yearSelect = document.getElementById('filterYear');
    const studioSelect = document.getElementById('filterStudio');
    const detailYearSelect = document.getElementById('detailFilterYear');

    const years = [...new Set(data.map(item => item.year))].sort((a, b) => b - a);

    let studiosSet = new Set();
    data.forEach(item => {
        if (item.studio && item.studio !== 'Desconocido') {
            item.studio.split(/,|\s+&\s+|\s+and\s+/i).forEach(s => {
                if (s.trim()) studiosSet.add(s.trim());
            });
        }
    });
    const studios = [...studiosSet].sort();

    if (yearSelect && studioSelect) {
        yearSelect.innerHTML = '<option value="all">Todos</option>';
        studioSelect.innerHTML = '<option value="all">Todos</option>';
        years.forEach(y => {
            if (y) yearSelect.insertAdjacentHTML('beforeend', `<option value="${esc(y)}">${esc(y)}</option>`);
        });
        studios.forEach(s => {
            studioSelect.insertAdjacentHTML('beforeend', `<option value="${esc(s)}">${esc(s)}</option>`);
        });
    }

    if (detailYearSelect) {
        detailYearSelect.innerHTML = '<option value="all">Todos</option>';
        years.forEach(y => {
            if (y) detailYearSelect.insertAdjacentHTML('beforeend', `<option value="${esc(y)}">${esc(y)}</option>`);
        });
    }
}

function onFilterChange() {
    _activeFilters.year = document.getElementById('filterYear').value;
    _activeFilters.season = document.getElementById('filterSeason').value;
    _activeFilters.studio = document.getElementById('filterStudio').value;
    applyFiltersAndRender();
}

function filterByScore(scoreValue) {
    _activeFilters.score = _activeFilters.score == scoreValue ? 'all' : scoreValue;
    applyFiltersAndRender();
}

function filterByStudioDirect(studioName) {
    switchView('statsView', { estudio: studioName });
}

function resetFilters() {
    _activeFilters = { year: 'all', season: 'all', studio: 'all', score: 'all', query: '' };
    _sortConfig = { key: 'score', direction: 'desc' };
    document.getElementById('filterYear').value = 'all';
    document.getElementById('filterSeason').value = 'all';
    document.getElementById('filterStudio').value = 'all';
    document.getElementById('filterText').value = '';
    applyFiltersAndRender();
}

function toggleSort(key) {
    if (_sortConfig.key === key) {
        _sortConfig.direction = _sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        _sortConfig.key = key;
        _sortConfig.direction = key === 'score' || key === 'year' ? 'desc' : 'asc';
    }
    applyFiltersAndRender();
}

function updateSortIcons() {
    const keys = ['anime', 'season', 'year', 'studio', 'score'];
    keys.forEach(k => {
        const iconEl = document.getElementById(`sortIcon-${k}`);
        if (!iconEl) return;
        if (_sortConfig.key === k) {
            iconEl.innerText = _sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
            iconEl.style.color = k === 'score' ? 'var(--neon-magenta)' : 'var(--neon-cyan)';
        } else {
            iconEl.innerText = ' ↕';
            iconEl.style.color = 'rgba(var(--fg-rgb), 0.6)';
        }
    });
}

function applyFiltersAndRender() {
    if (!document.getElementById('statsContent')) return;
    const queryText = document.getElementById('filterText').value.toLowerCase().trim();
    const filteredData = _masterData.filter(item => {
        if (_activeFilters.year !== 'all' && item.year != _activeFilters.year) return false;
        if (_activeFilters.season !== 'all' && item.season !== _activeFilters.season) return false;
        if (_activeFilters.score !== 'all' && Math.round(item.score) != _activeFilters.score) return false;
        if (_activeFilters.studio !== 'all' && (!item.studio || !item.studio.includes(_activeFilters.studio))) return false;
        if (queryText !== '' && (!item.anime || !item.anime.toLowerCase().includes(queryText))) return false;
        return true;
    });

    renderStatusBar();
    const totalFiltered = filteredData.length;
    document.getElementById('kpiGlobalTotal').innerText = _masterData.length;
    document.getElementById('kpiFilteredCount').innerText = totalFiltered;

    let sumScores = 0,
        eliteCount = 0,
        passCount = 0;
    let scoreDistribution = Array(11).fill(0);
    let studioAggregation = {};
    let seasonTracker = {
        Winter: { sum: 0, count: 0 },
        Spring: { sum: 0, count: 0 },
        Summer: { sum: 0, count: 0 },
        Fall: { sum: 0, count: 0 }
    };
    let goldSeasonTracker = {};

    filteredData.forEach(item => {
        const score = item.score;
        sumScores += score;
        if (score >= 9) eliteCount++;
        if (score >= 5) passCount++;
        scoreDistribution[Math.round(score)]++;

        if (seasonTracker[item.season]) {
            seasonTracker[item.season].sum += score;
            seasonTracker[item.season].count++;
        }
        if (item.season && item.year) {
            const comboKey = `${seasonLabel(item.season)} ${item.year}`;
            if (!goldSeasonTracker[comboKey]) goldSeasonTracker[comboKey] = { sum: 0, count: 0 };
            goldSeasonTracker[comboKey].sum += score;
            goldSeasonTracker[comboKey].count++;
        }
        if (item.studio && item.studio !== 'Desconocido') {
            item.studio.split(/,|\s+&\s+|\s+and\s+/i).forEach(st => {
                const name = st.trim();
                if (!name) return;
                if (!studioAggregation[name]) studioAggregation[name] = { sum: 0, count: 0 };
                studioAggregation[name].sum += score;
                studioAggregation[name].count++;
            });
        }
    });

    const avgScore = totalFiltered > 0 ? (sumScores / totalFiltered).toFixed(2) : '0.00';
    const olimpoRate = totalFiltered > 0 ? ((eliteCount / totalFiltered) * 100).toFixed(0) : '0';
    const passRate = totalFiltered > 0 ? ((passCount / totalFiltered) * 100).toFixed(0) : '0';
    document.getElementById('kpiAvgScore').innerText = avgScore;
    document.getElementById('kpiOlimpoRate').innerText = `${olimpoRate}%`;
    document.getElementById('kpiPassRate').innerText = `${passRate}%`;

    let criticProfile = 'Sin datos';
    if (totalFiltered > 0) {
        const numAvg = parseFloat(avgScore);
        if (numAvg < 5.0) criticProfile = 'Hater Épico 🤬';
        else if (numAvg >= 5.0 && numAvg < 6.8) criticProfile = 'Exigente Duro 🧐';
        else if (numAvg >= 6.8 && numAvg < 8.0) criticProfile = 'Otaku Equilibrado ⚖️';
        else criticProfile = 'Complaciente / Fanboy 🥰';
    }
    document.getElementById('kpiCritType').innerText = criticProfile;

    let leaderStudio = '---',
        maxStudioAvg = 0;
    Object.keys(studioAggregation).forEach(sName => {
        const sData = studioAggregation[sName];
        if (sData.count >= 2) {
            const sAvg = sData.sum / sData.count;
            if (sAvg > maxStudioAvg) {
                maxStudioAvg = sAvg;
                leaderStudio = sName;
            }
        }
    });
    document.getElementById('kpiTopStudio').innerText = leaderStudio;

    let goldSeasonName = '---',
        maxSeasonAvg = 0;
    Object.keys(goldSeasonTracker).forEach(key => {
        const gData = goldSeasonTracker[key];
        if (gData.count >= 2) {
            const gAvg = gData.sum / gData.count;
            if (gAvg > maxSeasonAvg) {
                maxSeasonAvg = gAvg;
                goldSeasonName = key;
            }
        }
    });
    document.getElementById('kpiGoldSeason').innerText = goldSeasonName;

    renderHistogram(scoreDistribution);
    renderSeasonPerformance(seasonTracker);
    renderStudioLeaderboard(studioAggregation);
    renderTopShelfGallery(filteredData);

    let sortedData = [...filteredData];
    if (_sortConfig.key) {
        sortedData.sort((a, b) => {
            let valA = a[_sortConfig.key],
                valB = b[_sortConfig.key];
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            if (valA < valB) return _sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return _sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    renderDataTable(sortedData);
    updateSortIcons();

    document.getElementById('statsLoader').style.display = 'none';
    document.getElementById('statsContent').style.display = 'block';
}

function renderStatusBar() {
    const bar = document.getElementById('filterStatusBar');
    let badgesHTML = `Filtros: `,
        hasActive = false;
    if (_activeFilters.year !== 'all') {
        badgesHTML += `<span class="badge">Año: ${esc(_activeFilters.year)}</span> `;
        hasActive = true;
    }
    if (_activeFilters.season !== 'all') {
        badgesHTML += `<span class="badge">Temporada: ${esc(seasonLabel(_activeFilters.season))}</span> `;
        hasActive = true;
    }
    if (_activeFilters.studio !== 'all') {
        badgesHTML += `<span class="badge">Estudio: ${esc(_activeFilters.studio)}</span> `;
        hasActive = true;
    }
    if (_activeFilters.score !== 'all') {
        badgesHTML += `<span class="badge">Nota: ${esc(_activeFilters.score)}⭐</span> `;
        hasActive = true;
    }
    bar.innerHTML = hasActive ? badgesHTML : 'Mostrando toda tu lista (sin filtros).';
}

function renderHistogram(dist) {
    const chart = document.getElementById('proDistributionChart');
    chart.innerHTML = '';
    const maxVal = Math.max(...dist) || 1;
    for (let i = 10; i >= 1; i--) {
        const count = dist[i],
            pct = (count / maxVal) * 100;
        const isSelected =
            _activeFilters.score == i ? 'style="background: rgba(0,240,255,0.12); border-left:3px solid var(--neon-cyan);"' : '';
        chart.insertAdjacentHTML(
            'beforeend',
            `<div class="interactive-bar" role="button" tabindex="0" aria-pressed="${_activeFilters.score == i}" aria-label="Filtrar por nota ${i} (${count})" onclick="filterByScore(${i})" ${isSelected}><div class="bar-label-fixed">Nota ${i}</div><div class="bar-track-pro"><div class="bar-fill-pro" style="width: ${pct}%"></div></div><div class="bar-qty">${count} items</div></div>`
        );
    }
}

function renderSeasonPerformance(seasons) {
    const chart = document.getElementById('seasonPerformanceChart');
    chart.innerHTML = '';
    const order = ['Winter', 'Spring', 'Summer', 'Fall'];
    order.forEach(sName => {
        const sData = seasons[sName],
            avg = sData.count > 0 ? sData.sum / sData.count : 0,
            pct = (avg / 10) * 100;
        chart.insertAdjacentHTML(
            'beforeend',
            `<div class="interactive-bar" style="cursor:default;"><div class="bar-label-fixed">${seasonLabel(sName)}</div><div class="bar-track-pro"><div class="bar-fill-pro magenta" style="width: ${pct}%"></div></div><div class="bar-qty" style="color:var(--neon-magenta);">${avg.toFixed(1)}⭐ <span style="font-size:0.65rem; color:rgba(var(--fg-rgb), 0.6)">(${sData.count})</span></div></div>`
        );
    });
}

function renderStudioLeaderboard(studios) {
    const listContainer = document.getElementById('proStudioList');
    listContainer.innerHTML = '';
    const sorted = Object.keys(studios)
        .map(name => {
            return { name: name, count: studios[name].count, avg: (studios[name].sum / studios[name].count).toFixed(1) };
        })
        .sort((a, b) => b.count - a.count);
    if (sorted.length === 0) {
        listContainer.innerHTML =
            '<div style="font-size:0.8rem; color:rgba(var(--fg-rgb), 0.6); text-align:center; padding-top:20px;">Sin estudios.</div>';
        return;
    }
    sorted.slice(0, 15).forEach(item => {
        listContainer.insertAdjacentHTML(
            'beforeend',
            `<div class="ranking-item" role="button" tabindex="0" onclick="filterByStudioDirect(${jsArg(item.name)})"><div class="rank-title">${esc(item.name)}</div><div class="rank-meta"><span>${item.avg}⭐</span><span style="color:var(--neon-cyan)">(${item.count})</span></div></div>`
        );
    });
}

function renderTopShelfGallery(filteredData) {
    const gallery = document.getElementById('topShelfGallery');
    gallery.innerHTML = '';
    const topThree = [...filteredData]
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.year - a.year;
        })
        .slice(0, 3);
    if (topThree.length === 0) {
        gallery.innerHTML =
            '<div style="font-size:0.85rem; color:rgba(var(--fg-rgb), 0.6); padding:10px 5px;">Ningún destacado disponible.</div>';
        return;
    }
    topThree.forEach((anime, idx) => {
        const imgId = `shelf-img-${idx}`;
        gallery.insertAdjacentHTML(
            'beforeend',
            `<div class="anime-poster-card" ${workSheetAttrs(anime, 'anime')}><div class="poster-rank" aria-hidden="true">#${idx + 1}</div><div class="img-container"><img id="${imgId}" data-type="anime" data-title="${esc(anime.anime)}" alt="" class="img-thumb" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='75' height='105'><rect width='75' height='105' fill='%23111122'/></svg>"></div><div class="poster-info"><span class="poster-title" title="${esc(anime.anime)}">${esc(anime.anime)}</span><span class="poster-studio">${esc(anime.studio || 'Desconocido')} (${esc(anime.year)})</span><span class="poster-badge">${esc(anime.score)} SCORE</span></div></div>`
        );
        const imgEl = document.getElementById(imgId);
        if (imgEl) globalImageObserver.observe(imgEl);
    });
}

function renderDataTable(data) {
    const tbody = document.getElementById('rawTableBody');
    document.getElementById('tableCount').innerText = `${data.length} procesados`;
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:rgba(var(--fg-rgb), 0.6);">Sin coincidencias.</td></tr>';
        return;
    }
    data.forEach(item => {
        tbody.insertAdjacentHTML(
            'beforeend',
            `<tr class="clickable-row" ${workSheetAttrs(item, 'anime')}><td style="font-weight:600; color:var(--text-strong);" title="${esc(item.anime)}">${esc(item.anime)}</td><td>${esc(seasonLabel(item.season))}</td><td>${esc(item.year)}</td><td title="${esc(item.studio)}">${esc(item.studio)}</td><td style="font-weight:bold; color:var(--neon-magenta);">${esc(item.score)}</td></tr>`
        );
    });
}

function renderDetailView() {
    document.getElementById('detailLoader').style.display = 'none';
    document.getElementById('detailContent').style.display = 'block';
    applyDetailFilters();
}

function applyDetailFilters() {
    const container = document.getElementById('detailGridContainer');
    if (!container) return;

    const q = document.getElementById('detailFilterText').value.toLowerCase().trim();
    const year = document.getElementById('detailFilterYear').value;
    const season = document.getElementById('detailFilterSeason').value;
    const score = document.getElementById('detailFilterScore').value;
    const sortKey = document.getElementById('detailSortKey').value;

    let filtered = _masterData.filter(item => {
        if (year !== 'all' && item.year != year) return false;
        if (season !== 'all' && item.season !== season) return false;
        if (score !== 'all' && Math.round(item.score) != score) return false;
        if (q !== '' && (!item.anime || !item.anime.toLowerCase().includes(q))) return false;
        return true;
    });

    filtered.sort((a, b) => {
        if (sortKey === 'score_desc') return b.score - a.score;
        if (sortKey === 'score_asc') return a.score - b.score;
        if (sortKey === 'year_desc') return b.year - a.year;
        if (sortKey === 'year_asc') return a.year - b.year;
        if (sortKey === 'anime_asc') return (a.anime || '').localeCompare(b.anime || '');
        return 0;
    });

    document.getElementById('detailStatusBar').innerHTML =
        `Mostrando <span style="color:var(--neon-cyan); font-weight:bold;">${filtered.length}</span> series encontradas de un universo de ${_masterData.length}.`;
    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = _masterData.length
            ? emptyStateHTML({
                  art: 'search',
                  title: 'Ningún anime coincide con estos filtros',
                  text: 'Prueba con otro año, temporada o nota, o quita los filtros para ver toda tu colección.',
                  actions: [{ label: '✕ Quitar filtros', onclick: 'resetDetailFilters()' }]
              })
            : emptyStateHTML({
                  art: 'collection',
                  title: 'Tu colección de anime está vacía',
                  text: 'Busca en AniList lo que has visto y ponle nota: aquí aparecerá con su portada.',
                  actions: [{ label: '＋ Añade tu primer anime', onclick: "switchView('formView')", accent: 'magenta' }]
              });
        return;
    }

    filtered.forEach((item, index) => {
        const cardId = `detail-img-${index}-${item.year}`;
        const roundedScore = Math.round(item.score);
        const neonClass = `score-neon-${roundedScore}`;

        const card = document.createElement('div');
        card.className = 'detail-card';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.setAttribute('aria-label', `Abrir ficha de ${item.anime}`);
        card.addEventListener('click', () => openWorkSheet('anime', workKey(item, 'anime')));
        card.innerHTML = `
            <div class="img-container" style="width:70px; height:98px; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
                <img id="${cardId}" data-type="anime" data-title="${esc(item.anime)}" alt="" class="img-thumb" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='70' height='98'><rect width='70' height='98' fill='%23111122'/></svg>">
            </div>
            <div class="detail-info">
                <span class="detail-title" title="${esc(item.anime)}">${esc(item.anime)}</span>
                <span class="detail-meta-item">🏢 ${esc(item.studio || 'Desconocido')}</span>
                <span class="detail-meta-item">📅 ${esc(seasonLabel(item.season) || '¿?')} ${esc(item.year || '')}</span>
                <span class="detail-score-badge ${neonClass}">${esc(item.score)} / 10 ⭐</span>
            </div>
        `;
        container.appendChild(card);
        const imgEl = document.getElementById(cardId);
        if (imgEl) globalImageObserver.observe(imgEl);
    });
}

function resetMangaFilters() {
    document.getElementById('mangaFilterText').value = '';
    ['mangaFilterYear', 'mangaFilterAuthor'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
    });
    applyMangaFilters();
}

function resetDetailFilters() {
    document.getElementById('detailFilterText').value = '';
    document.getElementById('detailFilterYear').value = 'all';
    document.getElementById('detailFilterSeason').value = 'all';
    document.getElementById('detailFilterScore').value = 'all';
    document.getElementById('detailSortKey').value = 'score_desc';
    applyDetailFilters();
}

function renderMangaLibrary() {
    document.getElementById('mangaLoader').style.display = 'none';
    document.getElementById('mangaContent').style.display = 'block';
    applyMangaFilters();
}

function applyMangaFilters() {
    const container = document.getElementById('mangaLibraryContainer');
    if (!container) return;

    const q = document.getElementById('mangaFilterText').value.toLowerCase().trim();
    const yearFilter = document.getElementById('mangaFilterYear') ? document.getElementById('mangaFilterYear').value : 'all';
    const authorFilter = document.getElementById('mangaFilterAuthor') ? document.getElementById('mangaFilterAuthor').value : 'all';
    const sortKey = document.getElementById('mangaSortKey').value;

    let filtered = _mangaData.filter(item => {
        if (yearFilter !== 'all' && String(item.year) !== String(yearFilter)) return false;
        if (authorFilter !== 'all' && item.author !== authorFilter) return false;
        if (q !== '' && (!item.manga || !item.manga.toLowerCase().includes(q))) return false;
        return true;
    });

    filtered.sort((a, b) => {
        if (sortKey === 'score_desc') return b.score - a.score;
        if (sortKey === 'score_asc') return a.score - b.score;
        if (sortKey === 'year_desc') return b.year - a.year;
        if (sortKey === 'year_asc') return a.year - b.year;
        if (sortKey === 'manga_asc') return (a.manga || '').localeCompare(b.manga || '');
        return 0;
    });

    document.getElementById('mangaStatusBar').innerHTML =
        `Organizando <span style="color:var(--neon-green); font-weight:bold;">${filtered.length}</span> volúmenes físicos en tu estantería.`;
    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = _mangaData.length
            ? emptyStateHTML({
                  art: 'search',
                  title: 'Ningún manga coincide con estos filtros',
                  text: 'Prueba con otro año o autor, o quita los filtros para ver toda tu estantería.',
                  actions: [{ label: '✕ Quitar filtros', onclick: 'resetMangaFilters()' }]
              })
            : emptyStateHTML({
                  art: 'manga',
                  title: 'Tu estantería de manga está vacía',
                  text: 'Registra los mangas que has leído y aparecerán aquí como lomos en una estantería.',
                  actions: [{ label: '＋ Añade tu primer manga', onclick: "switchView('mangaFormView')", accent: 'magenta' }]
              });
        return;
    }

    filtered.forEach((item, index) => {
        const imgId = `manga-cover-${index}-${item.year}`;
        const roundedScore = Math.round(item.score);
        const neonClass = `score-neon-${roundedScore}`;

        const book = document.createElement('div');
        book.className = 'manga-book';
        book.setAttribute('role', 'button');
        book.tabIndex = 0;
        book.setAttribute('aria-label', `Abrir ficha de ${item.manga}`);
        book.addEventListener('click', () => openWorkSheet('manga', workKey(item, 'manga')));
        book.innerHTML = `
            <div class="manga-book-inner">
                <div class="manga-book-front">
                    <img id="${imgId}" data-type="manga" data-title="${esc(item.manga)}" data-author="${esc(item.author)}" alt="" loading="lazy" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='175'><rect width='120' height='175' fill='%23111122'/></svg>">
                </div>
                <div class="manga-book-back">
                    <div class="manga-back-title" title="${esc(item.manga)}">${esc(item.manga)}</div>
                    <div class="manga-back-meta">Autor:<br><span style="color:var(--neon-green); font-weight:bold;">${esc(item.author)}</span></div>
                    <div class="manga-back-meta">Año: ${esc(item.year)}</div>
                    <div class="detail-score-badge ${neonClass}" style="margin-top:auto; font-size:0.75rem; padding:2px 8px;">${esc(item.score)} / 10</div>
                </div>
            </div>
        `;
        container.appendChild(book);

        const imgEl = document.getElementById(imgId);
        if (imgEl) globalImageObserver.observe(imgEl);
    });
}

// El TOP 150 en edición difiere del último guardado.
registerLeaveGuard('top150View', {
    isDirty: () =>
        document.getElementById('top150OpenState').style.display === 'block' &&
        JSON.stringify(_currentTop150.map(i => i.name)) !== JSON.stringify(readStoredJSON('saved_top150_data', []).map(i => i.name)),
    message: 'Has cambiado el TOP 150 y no lo has guardado con "Guardar Top 150".',
    discard: () => {
        document.getElementById('top150OpenState').style.display = 'none';
    }
});

function openTop150() {
    document.getElementById('top150ClosedState').style.display = 'none';
    document.getElementById('top150OpenState').style.display = 'block';
    _currentTop150 = JSON.parse(localStorage.getItem('saved_top150_data')) || [];
    renderTop150List();
}

function saveTop150() {
    _savedTop150 = JSON.parse(JSON.stringify(_currentTop150));
    localStorage.setItem('saved_top150_data', JSON.stringify(_savedTop150));
    const btnStart = document.querySelector('#top150ClosedState .btn-start');
    btnStart.innerText = 'Subiendo a Sheets... ☁️';
    document.getElementById('top150OpenState').style.display = 'none';
    document.getElementById('top150ClosedState').style.display = 'block';

    const payload = { action: 'save_top150', payload: _savedTop150 };

    sheetsWrite(payload)
        .then(result => {
            btnStart.innerText = result.confirmed ? '¡Cambios Registrados y Subidos! ✔️' : 'Cambios enviados ✔️ (sin confirmar)';
            btnStart.style.background = 'var(--neon-green)';
            btnStart.style.color = 'var(--on-accent)';
            setTimeout(() => {
                btnStart.innerText = '🔓 Iniciar Top 150';
                btnStart.style.background = '';
                btnStart.style.color = '';
            }, 2500);
        })
        .catch(err => {
            toast(`Guardado en este dispositivo, pero NO en Sheets: ${err.message}`, { type: 'error' });
            btnStart.innerText = '🔓 Iniciar Top 150';
        });
}

async function resetTop150() {
    const ok = await confirmDialog({
        title: 'Vaciar TOP 150',
        message: 'La lista en edición quedará vacía. No se guarda hasta que pulses "Guardar Top 150".',
        confirmText: 'Vaciar',
        danger: true
    });
    if (!ok) return;
    const backup = _currentTop150;
    _currentTop150 = [];
    renderTop150List();
    toastUndo('TOP 150 vaciado.', () => {
        _currentTop150 = backup;
        renderTop150List();
    });
}

function searchTop150Anime() {
    const input = document.getElementById('top150SearchInput'),
        resultsBox = document.getElementById('top150SearchResults'),
        val = input.value.toLowerCase().trim();
    if (val.length < 2) {
        resultsBox.style.display = 'none';
        return;
    }
    const matches = _masterData.filter(item => item.anime && item.anime.toLowerCase().includes(val));
    resultsBox.innerHTML = '';
    if (matches.length === 0) {
        resultsBox.innerHTML = '<div class="annual-search-item" style="cursor:default;">Sin resultados</div>';
        resultsBox.style.display = 'block';
        return;
    }
    matches.slice(0, 5).forEach(anime => {
        const row = document.createElement('div');
        row.className = 'annual-search-item';
        row.innerHTML = `<span>${esc(anime.anime)}</span><span class="score-tag">${esc(anime.score)}⭐</span>`;
        row.addEventListener('click', () => {
            addAnimeToTop150(anime.anime, anime.score);
            input.value = '';
            resultsBox.style.display = 'none';
        });
        resultsBox.appendChild(row);
    });
    resultsBox.style.display = 'block';
}

document.addEventListener('click', e => {
    const box1 = document.getElementById('top150SearchResults'),
        inp1 = document.getElementById('top150SearchInput');
    if (box1 && !box1.contains(e.target) && inp1 && !inp1.contains(e.target)) box1.style.display = 'none';
    const box2 = document.getElementById('annualSearchResults'),
        inp2 = document.getElementById('annualSearchInput');
    if (box2 && !box2.contains(e.target) && inp2 && !inp2.contains(e.target)) box2.style.display = 'none';
});

function addAnimeToTop150(title, score) {
    if (_currentTop150.length >= 150) {
        toast('El TOP 150 está completo. Quita algún anime antes de añadir otro.', { type: 'error' });
        return;
    }
    if (_currentTop150.some(item => item.name.toLowerCase() === title.toLowerCase())) {
        toast(`"${title}" ya está en el TOP 150.`, { type: 'info' });
        return;
    }
    _currentTop150.push({ id: Date.now() + Math.random(), name: title, score: score });
    renderTop150List();
}

function removeAnimeFromTop150(id) {
    const index = _currentTop150.findIndex(item => String(item.id) === String(id));
    if (index === -1) return;
    const [removed] = _currentTop150.splice(index, 1);
    renderTop150List();
    toastUndo(`"${removed.name}" quitado del TOP 150.`, () => {
        _currentTop150.splice(index, 0, removed);
        renderTop150List();
    });
}

function getTrackingBadgeHTML(animeName, currentIndex) {
    if (!_savedTop150 || _savedTop150.length === 0) return '';
    const oldIndex = _savedTop150.findIndex(a => a.name === animeName);
    if (oldIndex === -1) return `<span class="track-badge track-new">NEW</span>`;
    const diff = oldIndex - currentIndex;
    if (diff > 0) return `<span class="track-badge track-up">▲ +${diff}</span>`;
    if (diff < 0) return `<span class="track-badge track-down">▼ ${Math.abs(diff)}</span>`;
    return `<span class="track-badge track-same">=</span>`;
}

makeSortable(document.getElementById('top150ListContainer'), {
    itemSelector: '.top150-item',
    handleSelector: '.drag-handle',
    onMove: (from, to) => {
        moveInArray(_currentTop150, from, to);
        renderTop150List();
    }
});

async function moveTop150ToPosition(index) {
    const item = _currentTop150[index];
    const pos = await promptNumberDialog({
        title: 'Mover a posición',
        message: `¿A qué posición mueves "${item.name}"? (1-${_currentTop150.length})`,
        value: index + 1,
        max: _currentTop150.length,
        confirmText: 'Mover'
    });
    if (pos === null || pos - 1 === index) return;
    moveInArray(_currentTop150, index, pos - 1);
    renderTop150List();
}

function renderTop150List() {
    const container = document.getElementById('top150ListContainer');
    document.getElementById('top150Counter').innerText = `${_currentTop150.length} / 150`;
    if (!container) return;
    container.innerHTML = '';
    if (_currentTop150.length === 0) {
        container.innerHTML = emptyStateHTML({
            art: 'trophy',
            title: 'Tu TOP 150 está vacío',
            text: 'Busca arriba las obras que merecen estar en tu salón de la fama y ordénalas arrastrando.',
            actions: [{ label: '🔍 Buscar obras', onclick: "focusField('top150SearchInput')" }]
        });
        return;
    }

    _currentTop150.forEach((item, index) => {
        const currentPos = index + 1;
        let tierClass = '';
        if (currentPos <= 30) tierClass = 'rank-tier-purple';
        else if (currentPos <= 60) tierClass = 'rank-tier-blue';
        else if (currentPos <= 90) tierClass = 'rank-tier-green';
        else if (currentPos <= 120) tierClass = 'rank-tier-orange';
        else if (currentPos <= 150) tierClass = 'rank-tier-red';
        const trackingBadge = getTrackingBadgeHTML(item.name, index);

        const card = document.createElement('div');
        card.className = `top150-item ${tierClass}`;
        card.dataset.index = index;
        card.innerHTML = `
            <button type="button" class="drag-handle" style="font-size: 0.9rem; padding-right: 0;" aria-label="Mover ${esc(item.name)}: arrastra o usa las flechas ↑↓">⋮⋮</button>
            <button type="button" class="top150-pos" onclick="moveTop150ToPosition(${index})" title="Mover a otra posición" aria-label="Posición ${currentPos}. Mover a otra posición">${currentPos}</button><div class="top150-title" title="${esc(item.name)}">${esc(item.name)}</div>${trackingBadge}<div class="top150-score">${esc(item.score)}⭐</div>
            <button class="btn-remove-item" onclick="removeAnimeFromTop150(${jsArg(item.id)})" title="Eliminar" style="font-size: 0.9rem; padding: 2px 6px;">✕</button>
        `;

        container.appendChild(card);
    });
}

function exportTop150Image() {
    const target = document.getElementById('top150CaptureArea'),
        listContainer = document.getElementById('top150ListContainer'),
        captureTitle = document.getElementById('top150CaptureTitle');
    if (!target || !listContainer) return;

    const handles = document.querySelectorAll('#top150ListContainer .drag-handle'),
        removes = document.querySelectorAll('#top150ListContainer .btn-remove-item');
    handles.forEach(el => (el.style.display = 'none'));
    removes.forEach(el => (el.style.display = 'none'));

    const origMaxHeight = listContainer.style.maxHeight,
        origOverflow = listContainer.style.overflowY;
    listContainer.style.maxHeight = 'none';
    listContainer.style.overflowY = 'visible';
    captureTitle.style.display = 'block';

    loadHtml2Canvas()
        .then(h2c => h2c(target, { scale: 2, useCORS: true, backgroundColor: '#030308', logging: false }))
        .then(canvas => {
            listContainer.style.maxHeight = origMaxHeight;
            listContainer.style.overflowY = origOverflow;
            captureTitle.style.display = 'none';
            handles.forEach(el => (el.style.display = ''));
            removes.forEach(el => (el.style.display = ''));
            const link = document.createElement('a');
            link.download = 'TOP150_Actualizado.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        })
        .catch(() => {
            listContainer.style.maxHeight = origMaxHeight;
            listContainer.style.overflowY = origOverflow;
            captureTitle.style.display = 'none';
            handles.forEach(el => (el.style.display = ''));
            removes.forEach(el => (el.style.display = ''));
            toast('No se pudo generar la imagen.', { type: 'error' });
        });
}
