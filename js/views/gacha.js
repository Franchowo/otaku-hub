// --- MOTOR GACHA OTAKU ---
async function pullGacha() {
    const format = document.getElementById('gachaFormat').value;
    const decade = document.getElementById('gachaDecade').value;
    const loader = document.getElementById('gachaLoader');
    const resultContainer = document.getElementById('gachaResultContainer');
    
    resultContainer.innerHTML = '';
    loader.style.display = 'block';

    // Configurar los años según la década
    let yearParams = '';
    if (decade !== 'all') {
        const startYear = parseInt(decade);
        const endYear = startYear + 9;
        yearParams = `startDate_greater: ${startYear}0000, startDate_lesser: ${endYear}9999,`;
    }

    // Elegimos una página al azar entre las 5 más populares para darle variabilidad
    const randomPage = Math.floor(Math.random() * 5) + 1;

    const gql = `
    query { 
        Page(page: ${randomPage}, perPage: 50) { 
            media(type: ${format}, sort: POPULARITY_DESC, ${yearParams} isAdult: false) { 
                id
                title { romaji english } 
                coverImage { extraLarge } 
                description 
                genres 
                averageScore 
                seasonYear
                startDate { year }
            } 
        } 
    }`;

    try {
        const data = await fetchAnilist(gql);
        const medias = data?.data?.Page?.media || [];
        
        if (medias.length === 0) {
            throw new Error("No hay resultados");
        }

        // Filtrar para excluir lo que el usuario ya ha visto/leído
        const owned = format === 'ANIME' ? buildOwnedIndex(_masterData, 'anime') : buildOwnedIndex(_mangaData, 'manga');
        const unseenMedias = medias.filter(item => !owned.has(item));

        loader.style.display = 'none';

        if (unseenMedias.length === 0) {
            resultContainer.innerHTML = '<div style="text-align:center; color:var(--neon-yellow); padding: 20px;">¡Increíble! Ya has consumido todo el top 50 de esta categoría. Prueba a tirar otra vez o cambia la época.</div>';
            return;
        }

        // Selección de la obra aleatoria ganadora
        const winner = unseenMedias[Math.floor(Math.random() * unseenMedias.length)];
        
        // Formatear datos
        const title = winner.title.romaji || winner.title.english;
        const cover = winner.coverImage?.extraLarge || FALLBACK_IMG;
        const score = winner.averageScore ? (winner.averageScore / 10).toFixed(1) : 'N/A';
        const year = winner.seasonYear || winner.startDate?.year || '????';
        // La sinopsis de AniList trae HTML: se convierte a texto plano y se escapa.
        const description = htmlToText(winner.description).trim() || 'Sin sinopsis disponible.';

        const genresHtml = (winner.genres || []).map(g => `<span class="gacha-tag">${esc(g)}</span>`).join('');

        // Renderizar la carta ganadora
        resultContainer.innerHTML = `
            <div class="gacha-card">
                <img src="${esc(cover)}" class="gacha-poster" alt="Portada de ${esc(title)}">
                <div class="gacha-info">
                    <span style="color: var(--neon-magenta); font-weight: bold; font-size: 0.9rem; letter-spacing: 1px;">¡NUEVO DESCUBRIMIENTO!</span>
                    <div class="gacha-title">${esc(title)}</div>
                    <div style="display: flex; gap: 15px; align-items: center; color: rgba(255,255,255,0.6); font-size: 0.9rem; font-weight: bold;">
                        <span>📅 ${esc(year)}</span>
                        <span>⭐ ${esc(score)} / 10 Media Global</span>
                    </div>
                    <div class="gacha-tags">${genresHtml}</div>
                    <div class="gacha-desc">${esc(description)}</div>
                </div>
            </div>
        `;

    } catch (e) {
        loader.style.display = 'none';
        resultContainer.innerHTML = '<div style="text-align:center; color:var(--neon-red); padding: 20px;">Error al conectar con la base de datos global. Inténtalo de nuevo.</div>';
    }
}
