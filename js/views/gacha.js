// --- MOTOR GACHA OTAKU ---
// Una obra popular al azar que aún no tienes (ni has ocultado), con filtro
// de época y género. Desde la carta: añadir al Planificador u ocultarla.

const GACHA_GENRES = [
    'Action',
    'Adventure',
    'Comedy',
    'Drama',
    'Fantasy',
    'Horror',
    'Mahou Shoujo',
    'Mecha',
    'Music',
    'Mystery',
    'Psychological',
    'Romance',
    'Sci-Fi',
    'Slice of Life',
    'Sports',
    'Supernatural',
    'Thriller'
];
const GENRE_LABELS = {
    Action: 'Acción',
    Adventure: 'Aventura',
    Comedy: 'Comedia',
    Drama: 'Drama',
    Fantasy: 'Fantasía',
    Horror: 'Terror',
    'Mahou Shoujo': 'Mahou Shoujo',
    Mecha: 'Mecha',
    Music: 'Música',
    Mystery: 'Misterio',
    Psychological: 'Psicológico',
    Romance: 'Romance',
    'Sci-Fi': 'Ciencia ficción',
    'Slice of Life': 'Recuentos de la vida',
    Sports: 'Deportes',
    Supernatural: 'Sobrenatural',
    Thriller: 'Thriller'
};
let _gachaWinner = null;

function fillGachaGenres() {
    const select = document.getElementById('gachaGenre');
    if (!select || select.options.length > 1) return;
    GACHA_GENRES.forEach(g => select.insertAdjacentHTML('beforeend', `<option value="${esc(g)}">${esc(GENRE_LABELS[g] || g)}</option>`));
}
document.addEventListener('DOMContentLoaded', fillGachaGenres);

async function pullGacha() {
    const format = document.getElementById('gachaFormat').value;
    const decade = document.getElementById('gachaDecade').value;
    const genre = document.getElementById('gachaGenre').value;
    const loader = document.getElementById('gachaLoader');
    const resultContainer = document.getElementById('gachaResultContainer');

    resultContainer.innerHTML = '';
    loader.style.display = 'block';

    const variables = { page: Math.floor(Math.random() * 5) + 1, type: format };
    const filters = [];
    if (decade !== 'all') {
        const startYear = parseInt(decade, 10);
        variables.from = startYear * 10000;
        variables.to = (startYear + 9) * 10000 + 9999;
        filters.push('startDate_greater: $from, startDate_lesser: $to');
    }
    if (genre !== 'all') {
        variables.genre = genre;
        filters.push('genre_in: [$genre]');
    }

    const gql = `query($page: Int, $type: MediaType, $from: FuzzyDateInt, $to: FuzzyDateInt, $genre: String) {
        Page(page: $page, perPage: 50) {
            media(type: $type, sort: POPULARITY_DESC, isAdult: false${filters.length ? ', ' + filters.join(', ') : ''}) {
                id siteUrl
                title { romaji english }
                coverImage { extraLarge large }
                description genres averageScore season seasonYear
                startDate { year month }
            }
        }
    }`;

    try {
        const data = await fetchAnilist(gql, variables);
        const medias = data?.data?.Page?.media || [];
        if (medias.length === 0) throw new Error('No hay resultados');

        // Fuera lo que ya tienes (por ID de AniList y, si no está vinculado, por título) y lo ocultado.
        const owned = format === 'ANIME' ? buildOwnedIndex(_masterData, 'anime') : buildOwnedIndex(_mangaData, 'manga');
        const hidden = hiddenDiscoveries();
        const unseenMedias = medias.filter(item => !owned.has(item) && !hidden.has(item.id));

        loader.style.display = 'none';

        if (unseenMedias.length === 0) {
            resultContainer.innerHTML =
                '<div style="text-align:center; color:var(--neon-yellow); padding: 20px;">¡Increíble! Ya tienes (u ocultaste) todo lo que ha salido en esta tirada. Prueba otra vez o cambia los filtros.</div>';
            return;
        }

        const winner = unseenMedias[Math.floor(Math.random() * unseenMedias.length)];
        _gachaWinner = winner;
        const title = winner.title.romaji || winner.title.english;
        const cover = winner.coverImage?.extraLarge || winner.coverImage?.large || FALLBACK_IMG;
        const score = winner.averageScore ? (winner.averageScore / 10).toFixed(1) : 'N/A';
        const year = winner.seasonYear || winner.startDate?.year || '????';
        const description = htmlToText(winner.description).trim() || 'Sin sinopsis disponible.';
        const genresHtml = (winner.genres || []).map(g => `<span class="gacha-tag">${esc(GENRE_LABELS[g] || g)}</span>`).join('');

        resultContainer.innerHTML = `
            <div class="gacha-card">
                <img src="${esc(cover)}" class="gacha-poster" alt="Portada de ${esc(title)}">
                <div class="gacha-info">
                    <span style="color: var(--neon-magenta); font-weight: bold; font-size: 0.9rem; letter-spacing: 1px;">¡NUEVO DESCUBRIMIENTO!</span>
                    <div class="gacha-title">${esc(title)}</div>
                    <div style="display: flex; gap: 15px; align-items: center; color: rgba(255,255,255,0.6); font-size: 0.9rem; font-weight: bold; flex-wrap: wrap;">
                        <span>📅 ${esc(year)}</span>
                        <span>⭐ ${esc(score)} / 10 Media Global</span>
                    </div>
                    <div class="gacha-tags">${genresHtml}</div>
                    <div class="gacha-desc">${esc(description)}</div>
                    <div class="gacha-actions">
                        ${format === 'ANIME' ? '<button type="button" class="chip-btn accent-green" onclick="gachaToPlanner()">📅 Me interesa</button>' : ''}
                        <button type="button" class="chip-btn accent-red" onclick="gachaHide()">🙅 No me interesa</button>
                        <a class="chip-btn accent-cyan" href="${esc(winner.siteUrl || `https://anilist.co/${format.toLowerCase()}/${winner.id}`)}" target="_blank" rel="noopener">AniList ↗</a>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        loader.style.display = 'none';
        resultContainer.innerHTML =
            '<div style="text-align:center; color:var(--neon-red); padding: 20px;">Error al conectar con la base de datos global. Inténtalo de nuevo.</div>';
    }
}

async function gachaToPlanner() {
    if (!_gachaWinner) return;
    try {
        await addToPlanificador(_gachaWinner);
    } catch (err) {
        toast(err.message, { type: 'error' });
    }
}

function gachaHide() {
    if (!_gachaWinner) return;
    hideDiscovery(_gachaWinner.id);
    toast(`"${_gachaWinner.title.romaji}" no volverá a salir.`, { type: 'info' });
    pullGacha();
}
