        // --- SISTEMA DE RECOMENDACIONES ---
        function initRecommendationsFetch() {
            document.getElementById('recomLoader').style.display = 'block'; document.getElementById('recomContent').style.display = 'none';
            document.getElementById('recomStatusBar').innerText = "Analizando tu perfil otaku y cruzando datos con AniList API...";

            if (_masterData.length === 0) {
                initMasterDataFetch(() => { if (_mangaData.length === 0) initMangaDataFetch(false, buildRecommendations); else buildRecommendations(); });
            } else if (_mangaData.length === 0) {
                initMangaDataFetch(false, buildRecommendations);
            } else { buildRecommendations(); }
        }

        async function buildRecommendations() {
            document.getElementById('recomLoader').style.display = 'block'; document.getElementById('recomContent').style.display = 'none';
            const recomStatus = document.getElementById('recomStatusBar');
            const myAnimeNames = _masterData.map(a => a.anime.toLowerCase()), myMangaNames = _mangaData.map(m => m.manga.toLowerCase());

            // 1. Análisis Anime
            let topUserAnime = _masterData.filter(a => a.score >= 8), recomAnimes = [], animeBaseName = "";
            if(topUserAnime.length > 0) {
                try {
                    let randomAnime = topUserAnime[Math.floor(Math.random() * topUserAnime.length)];
                    animeBaseName = randomAnime.anime;
                    recomStatus.innerText = `Extrayendo recomendaciones basadas en "${animeBaseName}"...`;
                    
                    // CÓDIGO CORREGIDO ANIME
const gql = `query($search: String) { Page(page: 1, perPage: 1) { media(search: $search, type: ANIME) { recommendations(sort: RATING_DESC, perPage: 12) { nodes { mediaRecommendation { title { romaji } coverImage { large } } } } } } }`;
const res = await fetchAnilist(gql, { search: animeBaseName });
const recs = res?.data?.Page?.media?.[0]?.recommendations?.nodes?.map(n => n.mediaRecommendation).filter(Boolean) || [];
                    recomAnimes = recs.filter(a => a && a.title && !myAnimeNames.includes(a.title.romaji.toLowerCase())).slice(0, 6);
                } catch(e) {}
            }

            if(recomAnimes.length === 0) {
                 animeBaseName = "Top Global";
                 try {
                     recomStatus.innerText = `Buscando joyas perdidas en el Top Global de Anime...`;
                     let randomPage = Math.floor(Math.random() * 5) + 1;
                     const gql = `query($page: Int) { Page(page: $page, perPage: 15) { media(type: ANIME, sort: SCORE_DESC) { title { romaji } coverImage { large } } } }`;
                     const res = await fetchAnilist(gql, { page: randomPage });
                     const tops = res?.data?.Page?.media || [];
                     recomAnimes = tops.filter(a => a && !myAnimeNames.includes(a.title.romaji.toLowerCase())).slice(0, 6);
                 } catch(e) {}
            }

            // 2. Análisis Manga
            let topUserManga = _mangaData.filter(m => m.score >= 8), recomMangas = [], mangaBaseName = "";
            if(topUserManga.length > 0) {
                try {
                    let randomManga = topUserManga[Math.floor(Math.random() * topUserManga.length)];
                    mangaBaseName = randomManga.manga;
                    recomStatus.innerText = `Buscando lecturas similares a: "${mangaBaseName}"...`;
                    
                    // CÓDIGO CORREGIDO MANGA
const gql = `query($search: String) { Page(page: 1, perPage: 1) { media(search: $search, type: MANGA) { recommendations(sort: RATING_DESC, perPage: 12) { nodes { mediaRecommendation { title { romaji } coverImage { large } } } } } } }`;
const res = await fetchAnilist(gql, { search: mangaBaseName });
const recs = res?.data?.Page?.media?.[0]?.recommendations?.nodes?.map(n => n.mediaRecommendation).filter(Boolean) || [];
                    recomMangas = recs.filter(m => m && m.title && !myMangaNames.includes(m.title.romaji.toLowerCase())).slice(0, 6);
                } catch(e) {}
            }

            if(recomMangas.length === 0) {
                 mangaBaseName = "Top Global";
                 try {
                     recomStatus.innerText = `Buscando mangas aclamados en el Top Global...`;
                     let randomPage = Math.floor(Math.random() * 5) + 1;
                     const gql = `query($page: Int) { Page(page: $page, perPage: 15) { media(type: MANGA, sort: SCORE_DESC) { title { romaji } coverImage { large } } } }`;
                     const res = await fetchAnilist(gql, { page: randomPage });
                     const tops = res?.data?.Page?.media || [];
                     recomMangas = tops.filter(m => m && !myMangaNames.includes(m.title.romaji.toLowerCase())).slice(0, 6);
                 } catch(e) {}
            }

            document.getElementById('recomLoader').style.display = 'none'; document.getElementById('recomContent').style.display = 'block';
            
            const animeContainer = document.getElementById('recomAnimeGrid'); animeContainer.innerHTML = '';
            document.getElementById('recomAnimeTitle').innerText = animeBaseName === "Top Global" ? "Joyas globales que te faltan por ver" : `Porque te encantó ${animeBaseName}...`;
            
            if (recomAnimes.length === 0) { animeContainer.innerHTML = '<div style="color:rgba(255,255,255,0.4); text-align:center; grid-column:1/-1;">No hemos podido cargar recomendaciones.</div>'; } 
            else {
                recomAnimes.forEach(item => {
                    animeContainer.innerHTML += `<div class="recom-card anime-recom"><div class="recom-card-img-container"><img src="${item.coverImage?.large || ''}" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';"></div><span class="recom-card-title" title="${item.title.romaji}">${item.title.romaji}</span></div>`;
                });
            }

            const mangaContainer = document.getElementById('recomMangaGrid'); mangaContainer.innerHTML = '';
            document.getElementById('recomMangaTitle').innerText = mangaBaseName === "Top Global" ? "Mangas aclamados que debes leer" : `Porque no pudiste soltar ${mangaBaseName}...`;
            
            if (recomMangas.length === 0) { mangaContainer.innerHTML = '<div style="color:rgba(255,255,255,0.4); text-align:center; grid-column:1/-1;">No hemos podido cargar recomendaciones de manga.</div>'; } 
            else {
                recomMangas.forEach(item => {
                    mangaContainer.innerHTML += `<div class="recom-card manga-recom"><div class="recom-card-img-container"><img src="${item.coverImage?.large || ''}" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';"></div><span class="recom-card-title" title="${item.title.romaji}">${item.title.romaji}</span></div>`;
                });
            }
        }
