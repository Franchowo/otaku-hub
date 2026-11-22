// =====================================================================
// ENRUTADOR Y NAVEGACIÓN
// ---------------------------------------------------------------------
// - Cada vista tiene una ruta en la URL (#/estadisticas?estudio=MAPPA):
//   el botón "atrás" funciona y se pueden guardar enlaces a una vista.
// - Las vistas se agrupan en 5 secciones + "Registrar". En móvil hay una
//   barra inferior; en escritorio, la cabecera. Dentro de cada grupo, unas
//   pestañas muestran sus secciones.
// - switchView(id, params) sigue siendo la forma de navegar (los onclick
//   del HTML la usan); ahora solo cambia la URL y el resto va por hashchange.
// =====================================================================

const VIEW_META = {
    hubView: { slug: '', label: 'Inicio', icon: '🏠' },
    dataView: { slug: 'datos', label: 'Tus datos', icon: '💾', desc: 'Copia de seguridad e importar desde AniList.' },
    formView: { slug: 'registrar-anime', label: 'Anime', icon: '📥', desc: 'Añade un anime a tu lista buscándolo en AniList.' },
    mangaFormView: { slug: 'registrar-manga', label: 'Manga', icon: '📖', desc: 'Añade un manga a FULL LIST MANGA.' },
    detailView: { slug: 'anime', label: 'Anime', icon: '👁️', desc: 'Tu colección de anime en cuadrícula, con filtros.' },
    mangaLibraryView: { slug: 'manga', label: 'Manga', icon: '📚', desc: 'Tu estantería de manga.' },
    favoritesView: { slug: 'favoritos', label: 'Favoritos', icon: '👑', desc: 'Tu hoja FAVS con portadas grandes.' },
    statsView: { slug: 'estadisticas', label: 'Estadísticas', icon: '📊', desc: 'Notas, temporadas, estudios y tu perfil de crítico.' },
    insightsView: { slug: 'perfil', label: 'Tu perfil', icon: '🧠', desc: 'Tu nota frente al mundo, tus géneros y tu evolución.' },
    timeMachineView: { slug: 'capsula', label: 'Cápsula', icon: '⏳', desc: 'Lo mejor de cada año, en anime y manga.' },
    studiosView: { slug: 'estudios', label: 'Estudios', icon: '🏢', desc: 'Ranking de estudios con 5 o más animes.' },
    top150View: { slug: 'top-150', label: 'TOP 150', icon: '💯', desc: 'Tu salón de la fama, con subidas y bajadas.' },
    annualRankingView: {
        slug: 'ranking-anual',
        label: 'Anual',
        icon: '🏆',
        desc: 'Ordena lo que has visto este año y exporta la tierlist.'
    },
    rankerView: { slug: 'opening-ranker', label: 'Openings', icon: '⚔️', desc: 'Escucha tus openings y ordénalos a base de duelos.' },
    planificadorView: { slug: 'planificador', label: 'Planificador', icon: '📅', desc: 'Marca qué quieres ver de cada temporada.' },
    recommendationsView: {
        slug: 'recomendaciones',
        label: 'Recomendaciones',
        icon: '💡',
        desc: 'Sugerencias a partir de lo que mejor has puntuado.'
    },
    gachaView: { slug: 'gacha', label: 'Gacha', icon: '🎰', desc: 'Una obra popular al azar que aún no tienes.' },
    calificadorView: { slug: 'calificador', label: 'Calificador', icon: '🎯', desc: 'Puntúa un anime por bloques de episodios.' }
};

const NAV_GROUPS = [
    { id: 'inicio', label: 'Inicio', icon: '🏠', views: ['hubView', 'dataView'] },
    { id: 'coleccion', label: 'Colección', icon: '📚', views: ['detailView', 'mangaLibraryView', 'favoritesView'] },
    { id: 'analisis', label: 'Análisis', icon: '📊', views: ['statsView', 'insightsView', 'timeMachineView', 'studiosView'] },
    { id: 'registrar', label: 'Registrar', icon: '＋', views: ['formView', 'mangaFormView'], primary: true },
    { id: 'rankings', label: 'Rankings', icon: '🏆', views: ['top150View', 'annualRankingView', 'rankerView'] },
    { id: 'descubrir', label: 'Descubrir', icon: '🧭', views: ['planificadorView', 'recommendationsView', 'gachaView', 'calificadorView'] }
];

function groupOfView(viewId) {
    return NAV_GROUPS.find(g => g.views.includes(viewId)) || NAV_GROUPS[0];
}

// --- Rutas <-> URL ---
function buildHash(viewId, params = {}) {
    const slug = (VIEW_META[viewId] || VIEW_META.hubView).slug;
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
    return `#/${slug}${query ? '?' + query : ''}`;
}

function parseHash(hash = location.hash) {
    const [path, query] = hash.replace(/^#\/?/, '').split('?');
    const viewId = Object.keys(VIEW_META).find(id => VIEW_META[id].slug === decodeURIComponent(path || '')) || 'hubView';
    return { viewId, params: Object.fromEntries(new URLSearchParams(query || '')) };
}

// --- Avisos de cambios sin guardar ---
// LEAVE_GUARDS[viewId] = { isDirty(): bool, message, discard() }
const LEAVE_GUARDS = {};
function registerLeaveGuard(viewId, guard) {
    LEAVE_GUARDS[viewId] = guard;
}
function hasUnsavedChanges() {
    return Object.values(LEAVE_GUARDS).some(g => g.isDirty());
}

window.addEventListener('beforeunload', e => {
    if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// --- Navegación ---
let _currentView = null,
    _currentParams = {},
    _restoringHash = false;
const _lastViewInGroup = {};

// Punto de entrada para navegar (compatibilidad con los onclick existentes).
function switchView(viewId, params = {}) {
    const hash = buildHash(viewId, params);
    if (location.hash === hash || (hash === '#/' && !location.hash)) {
        showView(viewId, params); // misma ruta: recargar la vista
    } else {
        location.hash = hash; // el resto lo hace onRouteChange
    }
}

async function onRouteChange() {
    if (_restoringHash) {
        _restoringHash = false;
        return;
    }
    const { viewId, params } = parseHash();
    const guard = LEAVE_GUARDS[_currentView];
    if (_currentView && _currentView !== viewId && guard && guard.isDirty()) {
        const leave = await confirmDialog({
            title: 'Cambios sin guardar',
            message: guard.message,
            confirmText: 'Salir sin guardar',
            cancelText: 'Seguir editando',
            danger: true
        });
        if (!leave) {
            _restoringHash = true;
            location.hash = buildHash(_currentView, _currentParams);
            return;
        }
        if (guard.discard) guard.discard();
    }
    showView(viewId, params);
}
window.addEventListener('hashchange', onRouteChange);

// Orden de las vistas en la navegación: decide si la nueva entra por la
// derecha (avanzas) o por la izquierda (vuelves).
const VIEW_ORDER = NAV_GROUPS.flatMap(g => g.views);

function showView(viewId, params = {}) {
    if (!document.getElementById(viewId)) viewId = 'hubView';
    const from = VIEW_ORDER.indexOf(_currentView),
        to = VIEW_ORDER.indexOf(viewId);
    const navDir = from === -1 || from === to ? '' : to > from ? 'forward' : 'back';
    _currentView = viewId;
    _currentParams = params;
    const group = groupOfView(viewId);
    _lastViewInGroup[group.id] = viewId;

    const container = document.getElementById('mainContainer');
    clearViewErrors();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    container.classList.remove('form-mode', 'hub-mode');
    if (navDir) container.dataset.navDir = navDir;
    else delete container.dataset.navDir;
    renderNavState(viewId);
    document.title = viewId === 'hubView' ? 'OTAKU HUB' : `${VIEW_META[viewId].label} · OTAKU HUB`;
    window.scrollTo({ top: 0 });

    if (viewId === 'hubView') {
        container.classList.add('hub-mode');
        renderHub();
    } else if (viewId === 'formView' || viewId === 'mangaFormView') {
        container.classList.add('form-mode');
    } else if (viewId === 'statsView') {
        initMasterDataFetch(() => {
            applyStatsRouteParams(params);
            applyFiltersAndRender();
        });
    } else if (viewId === 'detailView') {
        initMasterDataFetch(() => {
            if (params.q !== undefined) document.getElementById('detailFilterText').value = params.q;
            renderDetailView();
        });
    } else if (viewId === 'mangaLibraryView') {
        initMangaDataFetch(false, () => {
            if (params.q !== undefined) document.getElementById('mangaFilterText').value = params.q;
            renderMangaLibrary();
        });
    } else if (viewId === 'studiosView') {
        initMasterDataFetch(() => renderTopStudiosView());
    } else if (viewId === 'annualRankingView') {
        initMasterDataFetch(() => initAnnualRankingFetch(() => renderAnnualRankingView()));
    } else if (viewId === 'favoritesView') {
        initFavoritesDataFetch(false);
    } else if (viewId === 'top150View') {
        document.getElementById('top150ClosedState').style.display = 'block';
        document.getElementById('top150OpenState').style.display = 'none';
        initMasterDataFetch(() => initTop150Fetch());
    } else if (viewId === 'timeMachineView') {
        initTimeMachineDataFetch();
    } else if (viewId === 'recommendationsView') {
        initRecommendationsFetch();
    } else if (viewId === 'calificadorView') {
        initCalificadorFetch();
    } else if (viewId === 'planificadorView') {
        initMasterDataFetch(() => initPlanificadorFetch());
    } else if (viewId === 'dataView') {
        renderDataView();
    } else if (viewId === 'insightsView') {
        initMasterDataFetch(() => renderInsightsView());
    } else if (viewId === 'rankerView') {
        initMasterDataFetch(() => fillRankerYears());
    } else if (viewId === 'gachaView') {
        initMasterDataFetch(() => initMangaDataFetch(false, () => {}));
    }
}

// Filtros del Panel de estadísticas desde la URL (?estudio=…&anio=…&temporada=…&nota=…)
function applyStatsRouteParams(params) {
    const map = { estudio: ['studio', 'filterStudio'], anio: ['year', 'filterYear'], temporada: ['season', 'filterSeason'] };
    if (!Object.keys(params).length) return;
    _activeFilters = { year: 'all', season: 'all', studio: 'all', score: 'all', query: '' };
    ['filterYear', 'filterSeason', 'filterStudio'].forEach(id => {
        document.getElementById(id).value = 'all';
    });
    Object.entries(map).forEach(([param, [key, selectId]]) => {
        if (params[param] === undefined) return;
        _activeFilters[key] = params[param];
        document.getElementById(selectId).value = params[param];
    });
    if (params.nota !== undefined) _activeFilters.score = params.nota;
}

// Repinta la vista actual conservando sus parámetros de la URL.
function refreshCurrentView() {
    if (_currentView) showView(_currentView, _currentParams);
}

// --- Pintado de la navegación ---
function goToGroup(groupId) {
    const group = NAV_GROUPS.find(g => g.id === groupId);
    if (group) switchView(_lastViewInGroup[group.id] || group.views[0]);
}

function buildNavigation() {
    const groupButton = (g, cls) => `
        <a class="${cls}${g.primary ? ' ' + cls + '--primary' : ''}" href="${buildHash(_lastViewInGroup[g.id] || g.views[0])}" data-group="${g.id}"
           onclick="event.preventDefault(); goToGroup('${g.id}')">
            <span class="${cls}-icon" aria-hidden="true">${g.icon}</span><span class="${cls}-label">${g.label}</span>
        </a>`;
    document.getElementById('groupNav').innerHTML = NAV_GROUPS.map(g => groupButton(g, 'group-link')).join('');
    document.getElementById('bottomNav').innerHTML = NAV_GROUPS.map(g => groupButton(g, 'bottom-link')).join('');
}

function renderNavState(viewId) {
    const group = groupOfView(viewId);
    document.querySelectorAll('[data-group]').forEach(el => {
        const active = el.dataset.group === group.id;
        el.classList.toggle('active', active);
        if (active) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
        el.setAttribute('href', buildHash(_lastViewInGroup[el.dataset.group] || NAV_GROUPS.find(g => g.id === el.dataset.group).views[0]));
    });

    const subnav = document.getElementById('subNav');
    if (group.views.length < 2) {
        subnav.hidden = true;
        subnav.innerHTML = '';
        return;
    }
    subnav.hidden = false;
    subnav.setAttribute('aria-label', `Secciones de ${group.label}`);
    subnav.innerHTML = group.views
        .map(
            id => `
        <a class="subnav-link${id === viewId ? ' active' : ''}" href="${buildHash(id)}"${id === viewId ? ' aria-current="page"' : ''}>
            <span aria-hidden="true">${VIEW_META[id].icon}</span> ${VIEW_META[id].label}
        </a>`
        )
        .join('');
}

// --- Hub: resumen + accesos agrupados ---
function renderHub() {
    const groupsEl = document.getElementById('hubGroups');
    if (groupsEl && !groupsEl.dataset.built) {
        groupsEl.dataset.built = '1';
        groupsEl.innerHTML = NAV_GROUPS.filter(g => g.id !== 'inicio')
            .map(
                g => `
            <section class="hub-group" aria-labelledby="hub-${g.id}">
                <h2 class="hub-group-title" id="hub-${g.id}">${g.label}</h2>
                <div class="hub-grid">
                    ${g.views
                        .map(
                            id => `
                        <a class="hub-card" href="${buildHash(id)}">
                            <div class="hub-icon-wrapper" aria-hidden="true">${VIEW_META[id].icon}</div>
                            <div class="hub-text-content">
                                <span class="hub-card-title">${g.id === 'registrar' ? 'Registrar ' + VIEW_META[id].label.toLowerCase() : VIEW_META[id].label}</span>
                                <span class="hub-card-desc">${VIEW_META[id].desc}</span>
                            </div>
                            <div class="hub-arrow" aria-hidden="true">→</div>
                        </a>`
                        )
                        .join('')}
                </div>
            </section>`
            )
            .join('');
    }
    renderHubSummary();
    renderUpcomingEpisodes();
}

function renderHubSummary() {
    const box = document.getElementById('hubSummary');
    if (!box) return;
    const paint = () => {
        if (_currentView !== 'hubView') return;
        const year = new Date().getFullYear();
        const thisYear = _masterData.filter(a => parseInt(a.year, 10) === year);
        const avg = list => (list.length ? (list.reduce((s, a) => s + (parseFloat(a.score) || 0), 0) / list.length).toFixed(2) : '–');
        const best = thisYear.slice().sort((a, b) => b.score - a.score)[0];
        box.innerHTML = `
            <a class="summary-card" href="${buildHash('detailView')}"><span class="summary-num">${_masterData.length}</span><span class="summary-label">animes registrados</span></a>
            <a class="summary-card" href="${buildHash('mangaLibraryView')}"><span class="summary-num">${_mangaData.length || '–'}</span><span class="summary-label">mangas</span></a>
            <a class="summary-card" href="${buildHash('statsView', { anio: year })}"><span class="summary-num">${thisYear.length}</span><span class="summary-label">animes en ${year} · media ${avg(thisYear)}</span></a>
            <a class="summary-card" href="${best ? buildHash('detailView', { q: best.anime }) : buildHash('formView')}"><span class="summary-num summary-num--text">${best ? esc(best.anime) : '—'}</span><span class="summary-label">${best ? `lo mejor de ${year} (${esc(best.score)}⭐)` : `aún nada en ${year}`}</span></a>`;
        box.setAttribute('aria-busy', 'false');
    };
    if (_masterData.length && _mangaData.length) return paint();
    if (!getAccessKey()) {
        box.innerHTML = '';
        return;
    } // pantalla de bloqueo activa
    box.setAttribute('aria-busy', 'true');
    box.innerHTML = Array.from({ length: 4 }, () => '<div class="summary-card skeleton"></div>').join('');
    initMasterDataFetch(() => {
        paint();
        initMangaDataFetch(false, paint);
    });
}

// --- Arranque ---
// Espera a que estén cargados todos los scripts (datos y vistas van después).
document.addEventListener('DOMContentLoaded', () => {
    buildNavigation();
    const { viewId, params } = parseHash(); // ruta desconocida -> Inicio
    showView(viewId, params);
    updateOutboxBadge();
    flushOutbox(); // cambios que quedaron en cola sin conexión
});
