// --- NUEVO SISTEMA DE COLA MULTI-HILO (BATCHING) 4.0 ---
const anilistQueue = [];
let isProcessingQueue = false;
// Comillas codificadas (%27): esta URL se inserta dentro de onerror="this.src='...'".
const FALLBACK_COVER =
    'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2760%27 height=%2785%27%3E%3Crect width=%2760%27 height=%2785%27 fill=%27%23111122%27 rx=%278%27/%3E%3Ctext x=%2750%25%27 y=%2750%25%27 dominant-baseline=%27middle%27 text-anchor=%27middle%27 fill=%27%2300f0ff%27 font-family=%27sans-serif%27 font-size=%2720%27 font-weight=%27bold%27%3E?%3C/text%3E%3C/svg%3E';

// OBSERVADOR GLOBAL CON RENOVACIÓN DE CACHÉ V5 (Soporte Estudio Anime)
const globalImageObserver = new IntersectionObserver(
    (entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                try {
                    const imgEl = entry.target;
                    const type = imgEl.getAttribute('data-type');
                    let title = imgEl.getAttribute('data-title') || '';
                    const author = imgEl.getAttribute('data-author') || '';

                    title = title.replace(/undefined|null/gi, '').trim();
                    if (!title) {
                        imgEl.src = FALLBACK_COVER;
                        obs.unobserve(imgEl);
                        return;
                    }

                    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const safeAuthor = author.toLowerCase().replace(/[^a-z0-9]/g, '');

                    // Recuperamos estudio e ID de AniList desde los datos cargados
                    // sin tocar el HTML de las vistas.
                    let studio = '';
                    let anilistId = parseInt(imgEl.getAttribute('data-anilist-id'), 10) || null;
                    if (type === 'anime' && typeof _masterData !== 'undefined') {
                        const foundAnime = _masterData.find(a => a.anime && String(a.anime).toLowerCase() === title.toLowerCase());
                        if (foundAnime && foundAnime.studio) studio = foundAnime.studio;
                        if (foundAnime && foundAnime.anilistId) anilistId = anilistId || foundAnime.anilistId;
                    } else if (type === 'manga' && typeof _mangaData !== 'undefined') {
                        const foundManga = _mangaData.find(m => m.manga && String(m.manga).toLowerCase() === title.toLowerCase());
                        if (foundManga && foundManga.anilistId) anilistId = anilistId || foundManga.anilistId;
                    }
                    const safeStudio = studio.toLowerCase().replace(/[^a-z0-9]/g, '');

                    // Con ID de AniList la portada es exacta y no depende del título.
                    const cacheKey = anilistId
                        ? `cover_id_${anilistId}`
                        : type === 'anime'
                          ? `anime_cover_v5_${safeTitle}_${safeStudio}`
                          : `manga_cover_v4_${safeTitle}_${safeAuthor}`;

                    const cachedUrl = localStorage.getItem(cacheKey);

                    if (cachedUrl) {
                        imgEl.src = cachedUrl;
                    } else {
                        // Pasamos el estudio al objeto de la cola
                        anilistQueue.push({ el: imgEl, type, title, author, studio, cacheKey, anilistId });
                        processAnilistQueue();
                    }
                } catch (e) {
                    console.error('Error al encolar:', e);
                }
                obs.unobserve(entry.target);
            }
        });
    },
    { rootMargin: '800px' }
);

// PROCESADOR DE BATCHING CON ALGORITMO DE ESTUDIOS Y AUTORES
async function processAnilistQueue() {
    if (isProcessingQueue || anilistQueue.length === 0) return;
    isProcessingQueue = true;

    while (anilistQueue.length > 0) {
        while (anilistQueue.length > 0 && anilistQueue[0].el.src && !anilistQueue[0].el.src.includes('data:image/svg+xml')) {
            anilistQueue.shift();
        }
        if (anilistQueue.length === 0) break;

        const currentType = anilistQueue[0].type;
        const byId = !!anilistQueue[0].anilistId;
        const batchSize = byId ? 50 : 10;
        const batch = [];

        for (let i = 0; i < anilistQueue.length; i++) {
            if (anilistQueue[i].type === currentType && !!anilistQueue[i].anilistId === byId) {
                batch.push(anilistQueue.splice(i, 1)[0]);
                i--;
            }
            if (batch.length >= batchSize) break;
        }

        if (batch.length === 0) continue;

        try {
            if (byId) {
                await fetchCoversById(batch);
                await new Promise(resolve => setTimeout(resolve, 800));
                continue;
            }

            let queryDef = [];
            let queryBody = [];
            let variables = {};

            batch.forEach((task, index) => {
                queryDef.push(`$s${index}: String`);
                variables[`s${index}`] = task.title;

                if (currentType === 'anime') {
                    // NUEVO: Aumentamos a 8 resultados y pedimos el array de estudios a AniList
                    queryBody.push(
                        `q${index}: Page(page:1, perPage:8) { media(search: $s${index}, type: ANIME, sort: SEARCH_MATCH) { coverImage { large } studios(isMain: true) { nodes { name } } } }`
                    );
                } else {
                    queryBody.push(
                        `q${index}: Page(page:1, perPage:8) { media(search: $s${index}, type: MANGA, sort: SEARCH_MATCH) { coverImage { large } staff(sort: RELEVANCE, perPage: 5) { nodes { name { full } } } } }`
                    );
                }
            });

            const megaQuery = `query(${queryDef.join(', ')}) { ${queryBody.join(' ')} }`;
            const json = await fetchAnilist(megaQuery, variables);

            batch.forEach((task, index) => {
                let imgUrl = null;
                const medias = json?.data?.[`q${index}`]?.media || [];

                if (medias.length > 0) {
                    if (currentType === 'anime') {
                        let selectedMedia = medias.find(m => m.coverImage?.large) || medias[0];

                        // ALGORITMO DE COINCIDENCIA DE ESTUDIO
                        if (task.studio && task.studio !== 'Desconocido') {
                            const rawTargetStudio = task.studio.toLowerCase();
                            const studioTokens = rawTargetStudio
                                .replace(/[^a-z0-9\s]/g, '')
                                .split(' ')
                                .filter(t => t.length > 2);

                            const match = medias.find(m => {
                                if (!m.coverImage?.large) return false;
                                return m.studios?.nodes?.some(n => {
                                    const studioName = (n.name || '').toLowerCase();
                                    if (studioName.includes(rawTargetStudio) || rawTargetStudio.includes(studioName)) return true;
                                    if (studioTokens.length > 0 && studioTokens.every(token => studioName.includes(token))) return true;
                                    return false;
                                });
                            });

                            if (match) selectedMedia = match;
                        }
                        imgUrl = selectedMedia?.coverImage?.large;
                    } else {
                        let selectedMedia = medias.find(m => m.coverImage?.large) || medias[0];

                        if (task.author && task.author !== 'Desconocido') {
                            const rawTargetAuthor = task.author.toLowerCase();
                            const authorTokens = rawTargetAuthor
                                .replace(/[^a-z0-9\s]/g, '')
                                .split(' ')
                                .filter(t => t.length > 2);

                            const match = medias.find(m => {
                                if (!m.coverImage?.large) return false;
                                return m.staff?.nodes?.some(n => {
                                    const staffName = (n.name?.full || '').toLowerCase();
                                    if (staffName.includes(rawTargetAuthor) || rawTargetAuthor.includes(staffName)) return true;
                                    if (authorTokens.length > 0 && authorTokens.every(token => staffName.includes(token))) return true;
                                    return false;
                                });
                            });
                            if (match) selectedMedia = match;
                        }
                        imgUrl = selectedMedia?.coverImage?.large;
                    }
                }

                const finalUrl = imgUrl || FALLBACK_COVER;
                localStorage.setItem(task.cacheKey, finalUrl);
                if (task.el) task.el.src = finalUrl;
            });

            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err) {
            if (err.message === 'RATE_LIMIT') {
                anilistQueue.unshift(...batch);
                await new Promise(resolve => setTimeout(resolve, 4000));
            } else {
                // Error de red/servidor: NO se guarda en caché. Antes la portada
                // "?" quedaba fijada para siempre tras una sola mala conexión;
                // ahora se vuelve a intentar la próxima vez que se muestre.
                console.warn('Portadas no disponibles ahora mismo:', err);
                batch.forEach(task => {
                    if (task.el) task.el.src = FALLBACK_COVER;
                });
            }
        }
    }

    isProcessingQueue = false;
}

// Portadas por ID: una sola consulta para hasta 50 obras, sin ambigüedad.
async function fetchCoversById(batch) {
    const ids = [...new Set(batch.map(task => task.anilistId))];
    const json = await fetchAnilist(
        `query($ids: [Int]) { Page(page: 1, perPage: 50) { media(id_in: $ids) { id coverImage { large } } } }`,
        { ids }
    );
    const covers = {};
    (json?.data?.Page?.media || []).forEach(m => {
        if (m.coverImage?.large) covers[m.id] = m.coverImage.large;
    });
    batch.forEach(task => {
        const url = covers[task.anilistId] || FALLBACK_COVER;
        localStorage.setItem(task.cacheKey, url);
        if (task.el) task.el.src = url;
    });
}

function updateScoreData(val) {
    document.getElementById('scoreVal').innerText = val;
}
function updateMangaScoreData(val) {
    document.getElementById('mangaScoreVal').innerText = val;
}

async function clearLocalMemory() {
    const ok = await confirmDialog({
        title: 'Limpiar caché de portadas',
        message: 'Las portadas se volverán a descargar la próxima vez que las veas.',
        confirmText: 'Limpiar'
    });
    if (ok) {
        Object.keys(localStorage).forEach(key => {
            if (
                key.startsWith('studio_logo_') ||
                key.startsWith('anime_cover_') ||
                key.startsWith('manga_cover_') ||
                key.startsWith('cover_id_')
            ) {
                localStorage.removeItem(key);
            }
        });
        toast('Caché de portadas vaciada.', { type: 'success' });
        reloadStatsData();
    }
}
