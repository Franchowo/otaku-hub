// --- SISTEMA DE RECOMENDACIONES ---
// Antes: se elegía UN favorito al azar y se mostraban sus recomendaciones.
// Ahora: se toman varios favoritos (nota ≥ 8, con algo de azar para que
// cambien al recargar), se piden sus recomendaciones en una sola consulta
// y se combinan: cada obra suma (votos de AniList × tu nota del favorito).
// Así sube lo que recomiendan varios de tus favoritos a la vez, y cada
// tarjeta dice por qué aparece. Fuera lo que ya tienes y lo que ocultaste.

const RECOM_SEEDS = 6;
const RECOM_SHOWN = 8;
let _recomCache = { anime: [], manga: [] };

function initRecommendationsFetch() {
    document.getElementById('recomLoader').style.display = 'block';
    document.getElementById('recomContent').style.display = 'none';
    document.getElementById('recomStatusBar').innerText = 'Analizando tus favoritos y cruzando datos con AniList…';

    if (_masterData.length === 0) {
        initMasterDataFetch(() => {
            if (_mangaData.length === 0) initMangaDataFetch(false, buildRecommendations);
            else buildRecommendations();
        });
    } else if (_mangaData.length === 0) {
        initMangaDataFetch(false, buildRecommendations);
    } else {
        buildRecommendations();
    }
}

// Elige favoritos: los de nota más alta, con algo de azar (se baraja dentro de cada nota).
function pickSeeds(list, titleKey) {
    const favs = list.filter(x => parseFloat(x.score) >= 8 && x[titleKey]);
    const shuffled = favs
        .map(x => ({ x, r: Math.random() }))
        .sort((a, b) => b.x.score - a.x.score || a.r - b.r)
        .map(o => o.x);
    // Mitad de las mejores notas y mitad al azar del resto de favoritos.
    const top = shuffled.slice(0, Math.ceil(RECOM_SEEDS / 2));
    const rest = shuffled
        .slice(top.length)
        .sort(() => Math.random() - 0.5)
        .slice(0, RECOM_SEEDS - top.length);
    return [...top, ...rest];
}

async function aggregatedRecommendations(type, seeds, owned) {
    if (!seeds.length) return [];
    const defs = seeds.map((_, i) => `$i${i}: Int, $s${i}: String`).join(', ');
    const body = seeds
        .map(
            (_, i) => `q${i}: Page(page: 1, perPage: 1) { media(id: $i${i}, search: $s${i}, type: ${type}) {
        recommendations(sort: RATING_DESC, perPage: 15) { nodes { rating mediaRecommendation {
            id siteUrl title { romaji english } coverImage { large } season seasonYear startDate { year month } averageScore
        } } } } }`
        )
        .join(' ');
    const variables = {};
    seeds.forEach((seed, i) => {
        if (seed.anilistId) variables[`i${i}`] = seed.anilistId;
        else variables[`s${i}`] = String(type === 'ANIME' ? seed.anime : seed.manga);
    });

    const json = await fetchAnilist(`query(${defs}) { ${body} }`, variables);
    const hidden = hiddenDiscoveries();
    const scores = new Map();
    seeds.forEach((seed, i) => {
        const seedTitle = type === 'ANIME' ? seed.anime : seed.manga;
        const nodes = json?.data?.[`q${i}`]?.media?.[0]?.recommendations?.nodes || [];
        nodes.forEach(node => {
            const m = node.mediaRecommendation;
            if (!m || owned.has(m) || hidden.has(m.id)) return;
            const weight = Math.max(1, node.rating || 1) * (parseFloat(seed.score) / 10);
            const entry = scores.get(m.id) || { media: m, score: 0, because: [] };
            entry.score += weight;
            if (!entry.because.includes(seedTitle)) entry.because.push(seedTitle);
            scores.set(m.id, entry);
        });
    });
    // Bonus a lo que recomiendan varios favoritos a la vez.
    return [...scores.values()]
        .map(e => ({ ...e, score: e.score * (1 + 0.5 * (e.because.length - 1)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, RECOM_SHOWN);
}

async function topGlobalFallback(type, owned) {
    const gql = `query($page: Int) { Page(page: $page, perPage: 30) { media(type: ${type}, sort: SCORE_DESC) { id siteUrl title { romaji english } coverImage { large } season seasonYear startDate { year month } } } }`;
    const res = await fetchAnilist(gql, { page: Math.floor(Math.random() * 5) + 1 });
    const hidden = hiddenDiscoveries();
    return (res?.data?.Page?.media || [])
        .filter(m => !owned.has(m) && !hidden.has(m.id))
        .slice(0, RECOM_SHOWN)
        .map(media => ({ media, because: [] }));
}

async function buildRecommendations() {
    document.getElementById('recomLoader').style.display = 'block';
    document.getElementById('recomContent').style.display = 'none';
    const status = document.getElementById('recomStatusBar');

    const sections = [
        {
            type: 'ANIME',
            key: 'anime',
            list: _masterData,
            titleKey: 'anime',
            grid: 'recomAnimeGrid',
            title: 'recomAnimeTitle',
            owned: buildOwnedIndex(_masterData, 'anime')
        },
        {
            type: 'MANGA',
            key: 'manga',
            list: _mangaData,
            titleKey: 'manga',
            grid: 'recomMangaGrid',
            title: 'recomMangaTitle',
            owned: buildOwnedIndex(_mangaData, 'manga')
        }
    ];

    for (const sec of sections) {
        const seeds = pickSeeds(sec.list, sec.titleKey);
        status.innerText = seeds.length
            ? `Combinando recomendaciones de ${seeds.length} de tus ${sec.key === 'anime' ? 'animes' : 'mangas'} favoritos…`
            : 'Buscando joyas en el top global…';
        let recs = [];
        try {
            recs = await aggregatedRecommendations(sec.type, seeds, sec.owned);
        } catch (e) {
            /* se prueba el top global */
        }
        let fromFavorites = recs.length > 0;
        if (!fromFavorites) {
            try {
                recs = await topGlobalFallback(sec.type, sec.owned);
            } catch (e) {
                recs = [];
            }
        }
        _recomCache[sec.key] = recs.map(r => r.media);

        document.getElementById(sec.title).innerText = fromFavorites
            ? sec.key === 'anime'
                ? 'Recomendado por tus animes favoritos'
                : 'Recomendado por tus mangas favoritos'
            : sec.key === 'anime'
              ? 'Joyas globales que te faltan por ver'
              : 'Mangas aclamados que debes leer';
        const grid = document.getElementById(sec.grid);
        grid.innerHTML = recs.length
            ? recs.map(r => recomCardHTML(r, sec.key)).join('')
            : '<div style="color:rgba(255,255,255,0.6); text-align:center; grid-column:1/-1;">No hemos podido cargar recomendaciones.</div>';
    }

    document.getElementById('recomLoader').style.display = 'none';
    document.getElementById('recomContent').style.display = 'block';
}

function recomCardHTML(rec, key) {
    const m = rec.media;
    const title = m.title?.romaji || m.title?.english || '';
    const because =
        rec.because && rec.because.length
            ? `<span class="recom-because" title="Porque te gustó ${esc(rec.because.join(', '))}">Por ${esc(rec.because.slice(0, 2).join(' y '))}${rec.because.length > 2 ? ` y ${rec.because.length - 2} más` : ''}</span>`
            : '';
    return `
        <div class="recom-card ${key}-recom" data-id="${m.id}">
            <a class="recom-card-img-container" href="${esc(m.siteUrl || `https://anilist.co/${key}/${m.id}`)}" target="_blank" rel="noopener" aria-label="${esc(title)} en AniList">
                <img src="${esc(m.coverImage?.large || FALLBACK_IMG)}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';">
            </a>
            <span class="recom-card-title" title="${esc(title)}">${esc(title)}</span>
            ${because}
            <div class="recom-actions">
                ${key === 'anime' ? `<button type="button" class="chip-btn accent-green chip-btn--sm" onclick="recomToPlanner(${m.id})" aria-label="Añadir ${esc(title)} al Planificador">📅</button>` : ''}
                <button type="button" class="chip-btn accent-red chip-btn--sm" onclick="recomHide(${m.id}, '${key}')" aria-label="Ocultar ${esc(title)}">🙅</button>
            </div>
        </div>`;
}

async function recomToPlanner(id) {
    const media = _recomCache.anime.find(m => m.id === id);
    if (!media) return;
    try {
        await addToPlanificador(media);
    } catch (err) {
        toast(err.message, { type: 'error' });
    }
}

function recomHide(id, key) {
    hideDiscovery(id);
    const card = document.querySelector(`#recommendationsView .recom-card[data-id="${id}"]`);
    if (card) card.remove();
    const media = (_recomCache[key] || []).find(m => m.id === id);
    toast(`${media ? `"${media.title.romaji}"` : 'La obra'} no volverá a recomendarse.`, { type: 'info' });
}
