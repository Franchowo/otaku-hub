// --- FETCHERS MAESTROS ---
// Todas las lecturas pasan por sheetsReadOnce (js/services/sheets-api.js):
// si dos vistas piden la misma hoja a la vez, se reutiliza la petición, y
// si falla se muestra un error con "Reintentar" en vez de un spinner eterno.

function setLoadersVisible(ids, visible) {
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? 'block' : 'none';
    });
}

const MASTER_LOADERS = ['statsLoader', 'detailLoader', 'studiosLoader', 'annualLoader'];

// ID de AniList de una fila (columna "AniList ID"), o null si aún no está vinculada.
function readAnilistId(item) {
    const id = parseInt(item.anilistid ?? item.anilistId, 10);
    return id > 0 ? id : null;
}

// ---------------------------------------------------------------------
// CARGA RÁPIDA CON COPIA LOCAL ("stale-while-revalidate")
// Si hay copia en el dispositivo se pinta al instante y, cuando llega la
// respuesta de Sheets, se actualiza solo si algo cambió. Después de guardar
// (registrar, editar, borrar, recargar a mano) se salta la copia una vez para
// no enseñar datos anteriores al cambio.
// ---------------------------------------------------------------------
const _lastRawJson = {};
const _skipSnapshotOnce = {};

function invalidateList(key) {
    if (key === 'master') _masterData = [];
    if (key === 'manga') _mangaData = [];
    _skipSnapshotOnce[key] = true;
}

// Vistas que se pueden repintar sin perder lo que estés haciendo.
const SAFE_REFRESH_VIEWS = ['hubView', 'detailView', 'statsView', 'studiosView', 'timeMachineView', 'mangaLibraryView'];
function refreshIfShowing() {
    const view = document.querySelector('.view.active');
    const busy = document.getElementById('workSheetOverlay') || document.querySelector('.dialog-overlay') || document.getElementById('searchOverlay');
    if (view && SAFE_REFRESH_VIEWS.includes(view.id) && !busy) refreshCurrentView();
}

// opts: { key, sheetName, apply(data), deliver(), onError(err) }
function loadListWithSnapshot({ key, sheetName, apply, deliver, onError }) {
    let delivered = false;
    const deliverOnce = () => { if (!delivered) { delivered = true; deliver(); } };

    if (!_skipSnapshotOnce[key]) {
        loadSheetSnapshot(key).then(snapshot => {
            if (!snapshot || delivered || _lastRawJson[key]) return;
            _lastRawJson[key] = JSON.stringify(snapshot.data);
            apply(snapshot.data);
            deliverOnce();
        });
    }
    _skipSnapshotOnce[key] = false;

    sheetsReadOnce(key, sheetName).then(data => {
        const json = JSON.stringify(data);
        if (delivered && json === _lastRawJson[key]) return;   // ya se pintó lo mismo
        _lastRawJson[key] = json;
        apply(data);
        if (delivered) refreshIfShowing(); else deliverOnce();
    }).catch(err => {
        if (!delivered) onError(err);
    });
}

function normalizeMasterRows(data) {
    return data.map(item => Object.assign({}, item, { anilistId: readAnilistId(item) }));
}

function initMasterDataFetch(callbackSuccess) {
    if(_masterData.length > 0) {
        if(callbackSuccess) callbackSuccess();
        else applyFiltersAndRender();
        return;
    }

    setLoadersVisible(MASTER_LOADERS, true);
    loadListWithSnapshot({
        key: 'master', sheetName: null,
        apply: data => { _masterData = normalizeMasterRows(data); populateFilterDropdowns(_masterData); },
        deliver: () => { if(callbackSuccess) callbackSuccess(); else applyFiltersAndRender(); },
        onError: err => { setLoadersVisible(MASTER_LOADERS, false); showViewError(err.message); }
    });
}

function initFavoritesDataFetch(forceRefresh = false) {
    if(_favsRawData.length > 0 && !forceRefresh) {
        renderFavoritesView();
        return;
    }

    document.getElementById('favoritesLoader').style.display = 'block';
    document.getElementById('favoritesContent').style.display = 'none';

    sheetsReadOnce('favs', 'FAVS').then(data => {
        _favsRawData = data;
        processFavoritesData();
        renderFavoritesView();
    }).catch(err => {
        document.getElementById('favoritesLoader').style.display = 'none';
        showViewError(`No se pudo cargar la hoja FAVS. ${err.message}`);
    });
}

function initMangaDataFetch(forceRefresh = false, callbackSuccess = null) {
    if(_mangaData.length > 0 && !forceRefresh) {
        if(callbackSuccess) callbackSuccess();
        else renderMangaLibrary();
        return;
    }

    if(document.getElementById('mangaLoader')) document.getElementById('mangaLoader').style.display = 'block';
    if(document.getElementById('mangaContent')) document.getElementById('mangaContent').style.display = 'none';
    if (forceRefresh) _skipSnapshotOnce.manga = true;

    loadListWithSnapshot({
        key: 'manga', sheetName: 'FULL LIST MANGA',
        apply: data => { _mangaData = normalizeMangaRows(data); populateMangaFilterDropdowns(_mangaData); },
        deliver: () => { if(callbackSuccess) callbackSuccess(); else renderMangaLibrary(); },
        onError: err => {
            if(document.getElementById('mangaLoader')) document.getElementById('mangaLoader').style.display = 'none';
            showViewError(`No se pudo cargar la hoja FULL LIST MANGA. ${err.message}`);
        }
    });
}

function normalizeMangaRows(data) {
    return data.map(item => {
        let mangaName = "";
        for(let key in item) {
            let lowerKey = key.toLowerCase();
            if(lowerKey.includes('manga') || lowerKey.includes('title')) { mangaName = item[key]; break; }
        }
        if(!mangaName) mangaName = item[Object.keys(item)[0]];

        return {
            manga: mangaName,
            year: item.Year || item.year || item.Año || item.año || '????',
            author: item.Author || item.author || item.Autor || item.autor || item.Serialization || item.serialization || 'Desconocido',
            score: parseFloat(item.Score || item.score || item.Nota || item.nota || 0),
            anilistId: readAnilistId(item),
            _row: item._row || null
        };
    }).filter(m => m.manga);
}

// FUNCIONES PARA RELLENAR LOS DROPDOWNS
function populateMangaFilterDropdowns(data) {
    const yearSelect = document.getElementById('mangaFilterYear');
    const authorSelect = document.getElementById('mangaFilterAuthor');
    
    if (!yearSelect || !authorSelect) return;

    const years = [...new Set(data.map(item => item.year))].filter(y => y && y !== '????').sort((a,b) => b - a);
    const authors = [...new Set(data.map(item => item.author))].filter(a => a && a !== 'Desconocido').sort();

    yearSelect.innerHTML = '<option value="all">Todos</option>';
    authorSelect.innerHTML = '<option value="all">Todos</option>';

    years.forEach(y => { yearSelect.insertAdjacentHTML('beforeend', `<option value="${esc(y)}">${esc(y)}</option>`); });
    authors.forEach(a => { authorSelect.insertAdjacentHTML('beforeend', `<option value="${esc(a)}">${esc(a)}</option>`); });
}

function initTimeMachineDataFetch() {
    document.getElementById('timeMachineLoader').style.display = 'block';
    document.getElementById('timeMachineContent').style.display = 'none';

    if (_masterData.length === 0) {
        initMasterDataFetch(() => { if (_mangaData.length === 0) initMangaDataFetch(false, buildTimeMachine); else buildTimeMachine(); });
    } else if (_mangaData.length === 0) {
        initMangaDataFetch(false, buildTimeMachine);
    } else {
        buildTimeMachine();
    }
}
