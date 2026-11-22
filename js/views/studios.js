// --- NUEVA FUNCIÓN PARA ALTERNAR PORTADAS DE ESTUDIOS ---
        window.cycleStudioCover = function(event, studioName) {
            event.stopPropagation(); // Evita que se haga clic en la tarjeta y nos lleve al filtro
            let topAnimes = window.studioTopAnimesMap[studioName];
            if (!topAnimes || topAnimes.length <= 1) return;

            let prefs = JSON.parse(localStorage.getItem('studio_cover_prefs')) || {};
            let current = prefs[studioName] || topAnimes[0];
            let currentIndex = topAnimes.indexOf(current);
            if (currentIndex === -1) currentIndex = 0;

            // Avanzamos al siguiente anime empatado
            let nextIndex = (currentIndex + 1) % topAnimes.length;
            prefs[studioName] = topAnimes[nextIndex];
            localStorage.setItem('studio_cover_prefs', JSON.stringify(prefs));

            // Recargamos la vista para aplicar el cambio
            renderTopStudiosView();
        };

        function renderTopStudiosView() {
            const container = document.getElementById('studiosGridContainer'); 
            container.innerHTML = '';
            
            let studioMap = {};
            let prefs = JSON.parse(localStorage.getItem('studio_cover_prefs')) || {};
            window.studioTopAnimesMap = {}; // Mapa global para el ciclo de portadas
            
            _masterData.forEach(item => {
                if(!item.studio || item.studio === 'Desconocido') return;
                item.studio.split(/,|\s+&\s+|\s+and\s+/i).forEach(st => {
                    const studioName = st.trim(); 
                    if(!studioName) return;
                    
                    if(!studioMap[studioName]) {
                        studioMap[studioName] = { 
                            sum: item.score, 
                            count: 1, 
                            topAnimes: [item.anime], // Ahora guardamos un array
                            maxScore: item.score 
                        };
                    } else {
                        studioMap[studioName].sum += item.score; 
                        studioMap[studioName].count += 1;
                        if(item.score > studioMap[studioName].maxScore) {
                            studioMap[studioName].maxScore = item.score;
                            studioMap[studioName].topAnimes = [item.anime]; // Nuevo líder
                        } else if (item.score === studioMap[studioName].maxScore) {
                            // Empate en nota máxima, lo añadimos a la lista si no está ya
                            if (!studioMap[studioName].topAnimes.includes(item.anime)) {
                                studioMap[studioName].topAnimes.push(item.anime);
                            }
                        }
                    }
                });
            });

            let eligibleStudios = Object.keys(studioMap).map(name => { 
                let data = studioMap[name];
                window.studioTopAnimesMap[name] = data.topAnimes;

                // Verificamos si hay una preferencia guardada y si sigue siendo válida (es decir, si sigue siendo nota máxima)
                let selectedBest = data.topAnimes[0];
                if (prefs[name] && data.topAnimes.includes(prefs[name])) {
                    selectedBest = prefs[name];
                }

                return { 
                    name: name, 
                    count: data.count, 
                    avg: parseFloat((data.sum / data.count).toFixed(2)),
                    bestAnime: selectedBest,
                    topAnimes: data.topAnimes,
                    maxScore: data.maxScore
                }; 
            }).filter(s => s.count >= 5);
            
            eligibleStudios.sort((a, b) => b.avg - a.avg);

            // --- LÓGICA DE RANKING Y PROGRESO ---
            eligibleStudios.forEach((s, idx) => s.currentRank = idx + 1);
            
            let snapshotData = {};
            eligibleStudios.forEach(s => {
                snapshotData[s.name] = { rank: s.currentRank, avg: s.avg, count: s.count };
            });
            window.currentStudiosData = snapshotData; 

            // Recuperar punto de referencia previo
            let savedSnapshot = JSON.parse(localStorage.getItem('otaku_hub_studios_snapshot'));
            if (!savedSnapshot) {
                savedSnapshot = snapshotData;
                localStorage.setItem('otaku_hub_studios_snapshot', JSON.stringify(snapshotData));
            }

            if(eligibleStudios.length === 0) { 
                container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:rgba(255,255,255,0.3);">No hay estudios individuales con ≥ 5 animes.</div>'; 
                document.getElementById('studiosLoader').style.display = 'none'; 
                document.getElementById('studiosContent').style.display = 'block'; 
                return; 
            }

            const totalStudios = eligibleStudios.length;

            eligibleStudios.forEach((studio, index) => {
                const imgId = `studio-best-img-${index}`;
                let scoreTone = 'red'; 
                if (studio.avg >= 8.00) scoreTone = 'purple'; 
                else if (studio.avg >= 7.00) scoreTone = 'green'; 
                else if (studio.avg >= 5.00) scoreTone = 'yellow';
                
                // --- LÓGICA VISUAL: BEST 10, WORST 10 Y CLARIDAD ---
                let rankBadgeStyle = "font-size: 1.35rem; font-weight: 900;";
                let rankIcon = "";
                let rankColor = "rgba(255, 255, 255, 0.5)"; 

                if (index < 10) {
                    rankColor = "var(--metal-gold)";
                    rankIcon = "🏆";
                    rankBadgeStyle += ` color: ${rankColor}; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);`;
                } else if (index >= Math.max(10, totalStudios - 10)) {
                    rankColor = "var(--neon-red)";
                    rankIcon = "🔻";
                    rankBadgeStyle += ` color: ${rankColor}; text-shadow: 0 0 10px rgba(255, 0, 51, 0.4);`;
                } else {
                    rankBadgeStyle += ` color: ${rankColor};`;
                }

                let rankDiffHtml = '';
                let avgDiffHtml = '';
                let pastData = savedSnapshot[studio.name];
                
                if (pastData) {
                    let rankDiff = pastData.rank - studio.currentRank;
                    if (rankDiff > 0) rankDiffHtml = `<span style="color: var(--neon-green); font-size: 0.75rem;">▲ ${rankDiff}</span>`;
                    else if (rankDiff < 0) rankDiffHtml = `<span style="color: var(--neon-red); font-size: 0.75rem;">▼ ${Math.abs(rankDiff)}</span>`;
                    else rankDiffHtml = `<span style="color: rgba(255,255,255,0.2); font-size: 0.75rem;">=</span>`;
                    
                    let rawDiff = studio.avg - pastData.avg;
                    let avgDiffStr = Math.abs(rawDiff).toFixed(2);
                    
                    if (rawDiff > 0.001) avgDiffHtml = `<span style="color: var(--neon-green); font-size: 0.75rem; font-weight: bold;">(▲ +${avgDiffStr})</span>`;
                    else if (rawDiff < -0.001) avgDiffHtml = `<span style="color: var(--neon-red); font-size: 0.75rem; font-weight: bold;">(▼ -${avgDiffStr})</span>`;
                    else avgDiffHtml = `<span style="color: rgba(255,255,255,0.3); font-size: 0.75rem; font-weight: bold;">(=)</span>`;
                } else {
                    rankDiffHtml = `<span style="color: var(--neon-cyan); font-size: 0.65rem; border: 1px solid var(--neon-cyan); padding: 1px 4px; border-radius: 4px;">NEW</span>`;
                    avgDiffHtml = `<span style="color: var(--neon-cyan); font-size: 0.75rem; font-weight: bold;">(NEW)</span>`;
                }

                // Generador del botón de ciclo (solo si hay más de 1 anime empatado con la nota máxima)
                let cycleBtnHtml = '';
                if (studio.topAnimes.length > 1) {
                    cycleBtnHtml = `<div onclick="cycleStudioCover(event, ${jsArg(studio.name)})" style="position: absolute; top: 4px; right: 4px; background: rgba(0, 0, 0, 0.75); border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10; font-size: 10px; border: 1px solid var(--neon-cyan); backdrop-filter: blur(4px); transition: transform 0.2s;" onmouseover="this.style.transform='rotate(90deg)'" onmouseout="this.style.transform='rotate(0deg)'" title="Clic para cambiar portada (${studio.topAnimes.length} opciones con nota ${esc(studio.maxScore)})">🔄</div>`;
                }

                container.insertAdjacentHTML('beforeend', `
                    <div class="studio-card" onclick="filterByStudioDirect(${jsArg(studio.name)})">
                        
                        <div class="studio-card-rank" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; position: absolute; top: 12px; right: 15px; z-index: 2;">
                            <div style="${rankBadgeStyle}">${rankIcon} #${index + 1}</div>
                            <div style="line-height: 1; font-family: 'Segoe UI', Arial, sans-serif; text-shadow: none;">${rankDiffHtml}</div>
                        </div>
                        
                        <!-- Contenedor de imagen modificado con relative y cycleBtnHtml -->
                        <div class="img-container" style="position: relative; width: 60px; height: 85px; flex-shrink: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
                            ${cycleBtnHtml}
                            <img id="${imgId}" data-type="anime" data-title="${esc(studio.bestAnime)}" alt="" loading="lazy" class="img-thumb" style="width:100%; height:100%; object-fit:cover;" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='85'><rect width='60' height='85' fill='%23111122'/></svg>">
                        </div>
                        
                        <div class="studio-details" style="margin-left: 10px; overflow: hidden; padding-right: 50px;">
                            <span class="studio-card-name" title="${esc(studio.name)}">${esc(studio.name)}</span>
                            <span class="studio-card-count" style="margin-bottom:2px;">${studio.count} animes</span>
                            
                            <span style="font-size:0.65rem; color:rgba(255,255,255,0.4); margin-bottom: 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="Obra destacada: ${esc(studio.bestAnime)}">👑 ${esc(studio.bestAnime)}</span>
                            
                            <div style="display: flex; align-items: center; gap: 6px; margin-top: auto;">
                                <span class="studio-card-badge ${scoreTone}" style="margin:0; align-self:center;">${studio.avg.toFixed(2)} MEDIA</span>
                                ${avgDiffHtml}
                            </div>
                        </div>
                    </div>
                `);
                
                const imgEl = document.getElementById(imgId);
                if(imgEl) globalImageObserver.observe(imgEl);
            });
            
            document.getElementById('studiosLoader').style.display = 'none'; 
            document.getElementById('studiosContent').style.display = 'block';
        }

function saveStudiosSnapshot() {
            if(!window.currentStudiosData) return;
            localStorage.setItem('otaku_hub_studios_snapshot', JSON.stringify(window.currentStudiosData));
            alert("Referencia guardada correctamente. A partir de ahora el progreso (subidas y bajadas) se calculará en base a las estadísticas exactas de este momento.");
            renderTopStudiosView();
        }

        function renderAnnualRankingView() { document.getElementById('annualLoader').style.display = 'none'; document.getElementById('annualContent').style.display = 'block'; renderAnnualRankingList(); }

        function searchInternalAnime() {
            const input = document.getElementById('annualSearchInput'), resultsBox = document.getElementById('annualSearchResults'), val = input.value.toLowerCase().trim();
            if (val.length < 2) { resultsBox.style.display = 'none'; return; }
            const matches = _masterData.filter(item => item.anime && item.anime.toLowerCase().includes(val));
            resultsBox.innerHTML = '';
            if (matches.length === 0) { resultsBox.innerHTML = '<div class="annual-search-item" style="cursor:default;">Sin resultados en tu registro</div>'; resultsBox.style.display = 'block'; return; }
            matches.slice(0, 6).forEach(anime => {
                const row = document.createElement('div'); row.className = 'annual-search-item';
                row.innerHTML = `<span>${esc(anime.anime)}</span><span class="score-tag">${esc(anime.score)}⭐</span>`;
                row.addEventListener('click', () => { addAnimeToAnnualRanking(anime.anime, anime.score); input.value = ''; resultsBox.style.display = 'none'; });
                resultsBox.appendChild(row);
            });
            resultsBox.style.display = 'block';
        }

        function addAnimeToAnnualRanking(title, score) {
            if (_annualRanking.some(item => item.name.toLowerCase() === title.toLowerCase())) { alert("Esta serie ya está incluida en tu Ranking Anual."); return; }
            _annualRanking.push({ id: Date.now() + Math.random(), name: title, score: score }); localStorage.setItem('annual_ranking_data', JSON.stringify(_annualRanking)); renderAnnualRankingList();
        }

        function removeAnimeFromAnnualRanking(id) { _annualRanking = _annualRanking.filter(item => String(item.id) !== String(id)); localStorage.setItem('annual_ranking_data', JSON.stringify(_annualRanking)); renderAnnualRankingList(); }

        function resetAnnualRanking() { if (confirm("🚨 ¿Seguro que quieres reiniciar el Ranking Anual? Esto vaciará por completo la lista y volverás a empezar desde cero.")) { _annualRanking = []; localStorage.setItem('annual_ranking_data', JSON.stringify(_annualRanking)); renderAnnualRankingList(); } }

        function renderAnnualRankingList() {
            const listContainer = document.getElementById('annualRankingList'); if(!listContainer) return; listContainer.innerHTML = '';
            if (_annualRanking.length === 0) { listContainer.innerHTML = '<div style="text-align:center; padding:30px; color:rgba(255,255,255,0.2); font-size:0.9rem;">El ranking está vacío. Usa el buscador superior para indexar series.</div>'; return; }

            _annualRanking.forEach((item, index) => {
                const displayPos = (index < 10) ? (index + 1) : "OUT", badgeClass = (index < 10) ? "top-10" : "out-zone", imgId = `annual-img-${item.id}`;
                const card = document.createElement('div'); card.className = 'draggable-item'; card.setAttribute('draggable', 'true'); card.dataset.index = index;
                card.innerHTML = `
                    <div class="drag-handle">⋮⋮</div><div class="rank-pos-badge ${badgeClass}">${displayPos}</div>
                    <div class="img-container" style="width: 48px; height: 68px; flex-shrink: 0; border-radius: 8px;"><img id="${imgId}" data-type="anime" data-title="${esc(item.name)}" alt="" class="img-thumb" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='68'><rect width='48' height='68' fill='%23111122'/></svg>"></div>
                    <span style="flex-grow:1; font-weight:600; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(item.name)}">${esc(item.name)}</span>
                    <span style="font-weight:bold; color:var(--neon-magenta); font-size:0.9rem; padding-right:10px;">${esc(item.score)}⭐</span>
                    <button class="btn-remove-item" onclick="removeAnimeFromAnnualRanking(${jsArg(item.id)})" title="Eliminar">✕</button>
                `;

                card.addEventListener('dragstart', (e) => { dragSrcIndex = index; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
                card.addEventListener('dragover', (e) => { e.preventDefault(); });
                card.addEventListener('drop', (e) => {
                    e.preventDefault(); const targetIndex = parseInt(card.dataset.index);
                    if (dragSrcIndex !== null && dragSrcIndex !== targetIndex) { const movedItem = _annualRanking.splice(dragSrcIndex, 1)[0]; _annualRanking.splice(targetIndex, 0, movedItem); localStorage.setItem('annual_ranking_data', JSON.stringify(_annualRanking)); renderAnnualRankingList(); }
                });
                card.addEventListener('dragend', () => { card.classList.remove('dragging'); dragSrcIndex = null; });
                listContainer.appendChild(card); 
                
                const imgEl = document.getElementById(imgId);
                if (imgEl) globalImageObserver.observe(imgEl);
            });
        }

        function renderFavoritesView() {
            const container = document.getElementById('favoritesRankingList'); document.getElementById('favCounterBadge').innerText = `${_favoritesRanking.length} Series Únicas`; container.innerHTML = '';
            document.getElementById('favoritesLoader').style.display = 'none'; document.getElementById('favoritesContent').style.display = 'block';
            if (_favoritesRanking.length === 0) { container.innerHTML = '<div style="text-align:center; padding:40px; color:rgba(255,255,255,0.25); font-size:0.95rem;">Tu pestaña "FAVS" está vacía o el backend no está devolviendo datos de esta pestaña.</div>'; return; }

            _favoritesRanking.forEach((favItem, index) => {
                const currentRank = index + 1; let metalTierClass = 'fav-bronze';
                if (currentRank <= 10) metalTierClass = 'fav-gold'; else if (currentRank <= 20) metalTierClass = 'fav-silver';
                const imgId = `fav-poster-img-${favItem.id}`, card = document.createElement('div'); card.className = `fav-item ${metalTierClass}`;
                card.innerHTML = `<div class="fav-badge-rank">${currentRank}</div><div class="img-container" style="width: 100px; height: 145px; border-radius: 12px; box-shadow: 0 6px 16px rgba(0,0,0,0.6);"><img id="${imgId}" data-type="anime" data-title="${esc(favItem.name)}" alt="" class="img-thumb" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='145'><rect width='100' height='145' fill='%23111122'/></svg>"></div><div class="fav-title-text" title="${esc(favItem.name)}">${esc(favItem.name)}</div>`;
                container.appendChild(card); 
                
                const imgEl = document.getElementById(imgId);
                if (imgEl) globalImageObserver.observe(imgEl);
            });
        }

        function openTierlistModal() {
    const container = document.getElementById('tierlistRowsContainer'); if(!container) return; container.innerHTML = '';
    const colorPalette = { 10: '#6f42c1', 9: '#4a76a8', 8: '#17a2b8', 7: '#28a745', 6: '#7cb342', 5: '#ffc107', 4: '#ff9800', 3: '#fb8c00', 2: '#e53935', 1: '#c62828' };

    for (let score = 10; score >= 1; score--) {
        const rowItems = _annualRanking.filter(item => parseInt(item.score) === score);
        const rowBlock = document.createElement('div'); rowBlock.className = 'tierlist-row';
        let itemsHTML = '';
        
        rowItems.forEach(anime => {
            const safeTitle = anime.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            // 1. Buscamos el estudio en _masterData para reconstruir la clave v5
            let studio = '';
            const foundAnime = _masterData.find(a => a.anime.toLowerCase() === anime.name.toLowerCase());
            if (foundAnime && foundAnime.studio) studio = foundAnime.studio;
            const safeStudio = studio.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            // 2. Construimos la clave v5 (añadimos un fallback a v4 por seguridad)
            const cacheKeyV5 = `anime_cover_v5_${safeTitle}_${safeStudio}`;
            const cacheKeyV4 = `anime_cover_v4_${safeTitle}`;
            
            const cacheKeyById = foundAnime && foundAnime.anilistId ? `cover_id_${foundAnime.anilistId}` : null;
            let imgUrl = (cacheKeyById && localStorage.getItem(cacheKeyById)) ||
                         localStorage.getItem(cacheKeyV5) || 
                         localStorage.getItem(cacheKeyV4) || 
                         "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' fill='%23111122'/></svg>";
            
            // 3. Forzamos recarga limpia para evitar bloqueos de CORS en el html2canvas
            if (imgUrl.startsWith('http')) {
                imgUrl += (imgUrl.includes('?') ? '&' : '?') + 'nocache=' + Date.now();
            }
            
            itemsHTML += `<div class="tierlist-square-poster" title="${esc(anime.name)}"><img src="${esc(imgUrl)}" crossorigin="anonymous" alt=""></div>`;
        });
        
        rowBlock.innerHTML = `<div class="tierlist-row-label" style="background-color: ${colorPalette[score]};">${score}</div><div class="tierlist-row-items">${itemsHTML}</div>`;
        container.appendChild(rowBlock);
    }
    document.getElementById('tierlistModalWrapper').style.display = 'flex';
}

        function closeTierlistModal() { document.getElementById('tierlistModalWrapper').style.display = 'none'; }

        function downloadTierlistImage() {
            const target = document.getElementById('tierlistCaptureTarget'); if (!target) return alert("Error de inicialización del canvas.");
            html2canvas(target, { scale: 4, useCORS: true, allowTaint: false, logging: false, backgroundColor: "#000000" }).then(canvas => {
                const downloadLink = document.createElement('a'); downloadLink.download = 'Anime_Tierlist_UHD.png'; downloadLink.href = canvas.toDataURL('image/png'); downloadLink.click();
            }).catch(() => { alert("Ocurrió un contratiempo al procesar el render."); });
        }
