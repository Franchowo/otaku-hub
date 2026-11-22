    // --- BÚSQUEDA Y FORMS (AUTOCOMPLETADO ANILIST) ---
const animeInput = document.getElementById('anime'), searchBtn = document.getElementById('searchBtn'), searchResults = document.getElementById('searchResults');
if(searchBtn) searchBtn.addEventListener('click', performSearch);
if(animeInput) animeInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); performSearch(); } });

// Obra elegida en el buscador: su ID de AniList se guarda con el registro.
// Si después editas el título a mano, se descarta (ya no es esa obra).
let _selectedAnimeMedia = null, _selectedMangaMedia = null;
if(animeInput) animeInput.addEventListener('input', () => { if (_selectedAnimeMedia && animeInput.value !== _selectedAnimeMedia.title) _selectedAnimeMedia = null; });

function performSearch() {
    const query = animeInput.value.trim(); if (query.length < 3) { toast("Escribe al menos 3 letras para buscar.", { type: 'error' }); return; }
    searchBtn.innerText = "⏳"; searchBtn.disabled = true;

    const gql = `query($search: String) {
        Page(page: 1, perPage: 5) {
            media(search: $search, type: ANIME) {
                id
                title { romaji }
                season seasonYear
                startDate { year month }
                coverImage { large }
                studios(isMain: true) { nodes { name } }
            }
        }
    }`;

    fetchAnilist(gql, { search: query }).then(json => {
        searchResults.innerHTML = '';
        const medias = json?.data?.Page?.media || [];
        if (medias.length === 0) { searchResults.innerHTML = '<div class="search-item"><div class="info"><span class="title">Sin resultados</span></div></div>'; searchResults.style.display = 'block'; return; }
        
        medias.forEach(anime => {
            const item = document.createElement('div'); item.className = 'search-item';
            const studiosText = anime.studios?.nodes?.length > 0 ? anime.studios.nodes.map(s => s.name).join(', ') : 'Desconocido';
            
            let detectedSeason = anime.season;
            if (!detectedSeason && anime.startDate?.month) {
                const m = anime.startDate.month;
                if (m >= 1 && m <= 3) detectedSeason = 'WINTER';
                else if (m >= 4 && m <= 6) detectedSeason = 'SPRING';
                else if (m >= 7 && m <= 9) detectedSeason = 'SUMMER';
                else if (m >= 10 && m <= 12) detectedSeason = 'FALL';
            }
            const displaySeasonFormatted = detectedSeason ? (detectedSeason.charAt(0).toUpperCase() + detectedSeason.slice(1).toLowerCase()) : 'Unknown';
            const displayYear = anime.seasonYear || anime.startDate?.year || '????';
            const titleStr = anime.title.romaji;

            item.innerHTML = `<img src="${esc(anime.coverImage?.large || FALLBACK_IMG)}" alt=""><div class="info"><span class="title">${esc(titleStr)}</span><span class="meta">${esc(displayYear)} · ${esc(seasonLabel(displaySeasonFormatted))} · ${esc(studiosText)}</span></div>`;
            item.addEventListener('click', function() {
                animeInput.value = titleStr;
                _selectedAnimeMedia = { id: anime.id, title: titleStr };
                if (displayYear !== '????') document.getElementById('year').value = displayYear;
                if (displaySeasonFormatted !== 'Unknown' && ['Winter', 'Spring', 'Summer', 'Fall'].includes(displaySeasonFormatted)) {
                    document.getElementById('season').value = displaySeasonFormatted;
                }
                document.getElementById('studio').value = studiosText; searchResults.style.display = 'none';
            });
            searchResults.appendChild(item);
        });
        searchResults.style.display = 'block';
    }).catch((err) => { 
        const msg = err.message === "RATE_LIMIT" ? "Espera unos segundos (Límite API)" : "Sin resultados encontrados";
        searchResults.innerHTML = `<div class="search-item"><div class="info"><span class="title" style="color:var(--neon-red)">${msg}</span></div></div>`; 
        searchResults.style.display = 'block'; 
    }).finally(() => { searchBtn.innerText = "🔍"; searchBtn.disabled = false; });
}

const mangaInput = document.getElementById('manga'), mangaSearchBtn = document.getElementById('mangaSearchBtn'), mangaSearchResults = document.getElementById('mangaSearchResults');
if(mangaSearchBtn) mangaSearchBtn.addEventListener('click', performMangaSearch);
if(mangaInput) mangaInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); performMangaSearch(); } });
if(mangaInput) mangaInput.addEventListener('input', () => { if (_selectedMangaMedia && mangaInput.value !== _selectedMangaMedia.title) _selectedMangaMedia = null; });

function performMangaSearch() {
    const query = mangaInput.value.trim(); if (query.length < 3) { toast("Escribe al menos 3 letras para buscar.", { type: 'error' }); return; }
    mangaSearchBtn.innerText = "⏳"; mangaSearchBtn.disabled = true;

    const gql = `query($search: String) {
        Page(page: 1, perPage: 5) {
            media(search: $search, type: MANGA) {
                id
                title { romaji }
                startDate { year }
                coverImage { large }
                staff(perPage: 1) { nodes { name { full } } }
            }
        }
    }`;

    fetchAnilist(gql, { search: query }).then(json => {
        mangaSearchResults.innerHTML = '';
        const medias = json?.data?.Page?.media || [];
        if (medias.length === 0) { mangaSearchResults.innerHTML = '<div class="search-item"><div class="info"><span class="title">Sin resultados</span></div></div>'; mangaSearchResults.style.display = 'block'; return; }
        
        medias.forEach(manga => {
            const item = document.createElement('div'); item.className = 'search-item';
            const startYear = manga.startDate?.year || '????';
            const titleStr = manga.title.romaji;
            const authorName = manga.staff?.nodes?.[0]?.name?.full || 'Desconocido';
            
            item.innerHTML = `<img src="${esc(manga.coverImage?.large || FALLBACK_IMG)}" alt=""><div class="info"><span class="title">${esc(titleStr)}</span><span class="meta">${esc(startYear)} · ${esc(authorName)}</span></div>`;
            item.addEventListener('click', function() {
                mangaInput.value = titleStr;
                _selectedMangaMedia = { id: manga.id, title: titleStr };
                if (startYear !== '????') document.getElementById('mangaYear').value = startYear;
                const authInput = document.getElementById('author') || document.getElementById('serialization');
                if(authInput) authInput.value = authorName;
                mangaSearchResults.style.display = 'none';
            });
            mangaSearchResults.appendChild(item);
        });
        mangaSearchResults.style.display = 'block';
    }).catch((err) => { 
        const msg = err.message === "RATE_LIMIT" ? "Espera unos segundos (Límite API)" : "Sin resultados encontrados";
        mangaSearchResults.innerHTML = `<div class="search-item"><div class="info"><span class="title" style="color:var(--neon-red)">${msg}</span></div></div>`; 
        mangaSearchResults.style.display = 'block'; 
    }).finally(() => { mangaSearchBtn.innerText = "🔍"; mangaSearchBtn.disabled = false; });
}

document.addEventListener('click', e => { 
    if (searchResults && !animeInput.contains(e.target) && !searchBtn.contains(e.target) && !searchResults.contains(e.target)) searchResults.style.display = 'none'; 
    if (mangaSearchResults && !mangaInput.contains(e.target) && !mangaSearchBtn.contains(e.target) && !mangaSearchResults.contains(e.target)) mangaSearchResults.style.display = 'none';
});

// Submits
const animeForm = document.getElementById('animeForm');
if(animeForm) {
    animeForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitBtn'), statusMsg = document.getElementById('statusMsg');
        submitBtn.disabled = true; submitBtn.innerText = "Registrando...";

        let rawStudio = document.getElementById('studio').value.trim();
        function sanitizeStudio(str) {
            let cleaned = str.replace(/\bStudio\b/gi, '').trim();
            if (cleaned.length > 0) cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
            return cleaned;
        }

        let finalStudio = rawStudio;
        if (rawStudio.includes(',')) finalStudio = rawStudio.split(',').map(s => sanitizeStudio(s)).filter(Boolean).join(', ');
        else if (/\s+&\s+/i.test(rawStudio)) finalStudio = rawStudio.split(/\s+&\s+/i).map(s => sanitizeStudio(s)).filter(Boolean).join(' & ');
        else if (/\s+and\s+/i.test(rawStudio)) finalStudio = rawStudio.split(/\s+and\s+/i).map(s => sanitizeStudio(s)).filter(Boolean).join(' and ');
        else finalStudio = sanitizeStudio(rawStudio);

        if (!finalStudio) finalStudio = "Desconocido";

        const payload = { anime: document.getElementById('anime').value, season: document.getElementById('season').value, year: parseInt(document.getElementById('year').value), studio: finalStudio, score: parseInt(document.getElementById('score').value) };
        // El Code.gs original ignora este campo; la v2 lo guarda en la columna "AniList ID".
        if (_selectedAnimeMedia && _selectedAnimeMedia.title === payload.anime) payload.anilistId = _selectedAnimeMedia.id;

        sheetsWrite(payload).then(result => {
            statusMsg.style.color = "#00ff66";
            statusMsg.innerText = result.queued ? "Sin conexión: el anime queda en cola y se registrará al volver la red ⏳"
                : result.confirmed ? "¡Anime guardado perfectamente!" : "Anime enviado (el servidor no confirmó la respuesta).";
            document.getElementById('animeForm').reset(); updateScoreData(7); invalidateList('master'); _selectedAnimeMedia = null;
        }).catch(err => {
            // No se resetea el formulario: así no pierdes lo que escribiste.
            statusMsg.style.color = "var(--neon-magenta)"; statusMsg.innerText = `No se guardó: ${err.message}`;
        }).finally(() => { submitBtn.disabled = false; submitBtn.innerText = "Enviar al Registro"; });
    });
}

const mangaForm = document.getElementById('mangaForm');
if(mangaForm) {
    mangaForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('mangaSubmitBtn'), statusMsg = document.getElementById('mangaStatusMsg');
        submitBtn.disabled = true; submitBtn.innerText = "Registrando Manga...";

        const authorVal = document.getElementById('author').value.trim() || "Desconocido";

        const payload = { 
            manga: document.getElementById('manga').value, 
            year: parseInt(document.getElementById('mangaYear').value), 
            Author: authorVal,             
            serialization: authorVal,      
            score: parseInt(document.getElementById('mangaScore').value) 
        };
        if (_selectedMangaMedia && _selectedMangaMedia.title === payload.manga) payload.anilistId = _selectedMangaMedia.id;

        sheetsWrite(payload).then(result => {
            statusMsg.style.color = "#00ff66";
            statusMsg.innerText = result.queued ? "Sin conexión: el manga queda en cola y se registrará al volver la red ⏳"
                : result.confirmed ? "¡Manga registrado con éxito en FULL LIST MANGA!" : "Manga enviado (el servidor no confirmó la respuesta).";
            // Antes se vaciaba _masterData (anime) y la librería de manga no se refrescaba.
            document.getElementById('mangaForm').reset(); updateMangaScoreData(7); invalidateList('manga'); _selectedMangaMedia = null;
        }).catch(err => {
            statusMsg.style.color = "var(--neon-red)"; statusMsg.innerText = `No se guardó: ${err.message}`;
        }).finally(() => { submitBtn.disabled = false; submitBtn.innerText = "Enviar al Registro"; });
    });
}
