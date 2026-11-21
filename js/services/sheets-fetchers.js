// --- FETCHERS MAESTROS ---
function initMasterDataFetch(callbackSuccess) {
    if(_masterData.length > 0) {
        if(callbackSuccess) callbackSuccess();
        else applyFiltersAndRender();
        return;
    }

    if(document.getElementById('statsLoader')) document.getElementById('statsLoader').style.display = 'block';
    if(document.getElementById('detailLoader')) document.getElementById('detailLoader').style.display = 'block';
    if(document.getElementById('studiosLoader')) document.getElementById('studiosLoader').style.display = 'block';
    if(document.getElementById('annualLoader')) document.getElementById('annualLoader').style.display = 'block';

    window.handleStatsResponse = function(response) {
        if(response.status !== 'success') {
            alert("Error de Sheets: " + (response.message || "Desconocido"));
            return;
        }
        _masterData = response.data;
        populateFilterDropdowns(_masterData);
        
        if(callbackSuccess) callbackSuccess();
        else applyFiltersAndRender();
        
        const scriptTag = document.getElementById('jsonpScript');
        if(scriptTag) scriptTag.remove();
    };

    const script = document.createElement('script');
    script.id = 'jsonpScript';
    script.src = `${sheetsUrl()}callback=handleStatsResponse&_=${new Date().getTime()}`;
    script.onerror = function() { alert("Error crítico de enlace JSONP. Revisa los permisos."); };
    document.body.appendChild(script);
}

function initFavoritesDataFetch(forceRefresh = false) {
    if(_favsRawData.length > 0 && !forceRefresh) {
        renderFavoritesView();
        return;
    }

    document.getElementById('favoritesLoader').style.display = 'block';
    document.getElementById('favoritesContent').style.display = 'none';

    window.handleFavoritesResponse = function(response) {
        if(response.status !== 'success') {
            alert("Error al cargar la hoja FAVS: " + (response.message || "Desconocido"));
            return;
        }
        _favsRawData = response.data;
        processFavoritesData();
        renderFavoritesView();
        
        const scriptTag = document.getElementById('jsonpFavsScript');
        if(scriptTag) scriptTag.remove();
    };

    const oldScript = document.getElementById('jsonpFavsScript');
    if(oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.id = 'jsonpFavsScript';
    script.src = `${sheetsUrl()}sheet=FAVS&tab=FAVS&sheetName=FAVS&callback=handleFavoritesResponse&_=${new Date().getTime()}`;
    script.onerror = function() { alert("Error al conectar con la hoja FAVS."); };
    document.body.appendChild(script);
}

function initMangaDataFetch(forceRefresh = false, callbackSuccess = null) {
    if(_mangaData.length > 0 && !forceRefresh) {
        if(callbackSuccess) callbackSuccess();
        else renderMangaLibrary();
        return;
    }

    if(document.getElementById('mangaLoader')) document.getElementById('mangaLoader').style.display = 'block';
    if(document.getElementById('mangaContent')) document.getElementById('mangaContent').style.display = 'none';

    window.handleMangaResponse = function(response) {
        if(response.status !== 'success') {
            alert("Error al cargar la hoja FULL LIST MANGA: " + (response.message || "Desconocido"));
            return;
        }
        
        _mangaData = response.data.map(item => {
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
                score: parseFloat(item.Score || item.score || item.Nota || item.nota || 0)
            };
        }).filter(m => m.manga);

        populateMangaFilterDropdowns(_mangaData);

        if(callbackSuccess) callbackSuccess();
        else renderMangaLibrary();
        
        const scriptTag = document.getElementById('jsonpMangaScript');
        if(scriptTag) scriptTag.remove();
    };

    const oldScript = document.getElementById('jsonpMangaScript');
    if(oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.id = 'jsonpMangaScript';
    script.src = `${sheetsUrl()}sheet=FULL%20LIST%20MANGA&tab=FULL%20LIST%20MANGA&sheetName=FULL%20LIST%20MANGA&callback=handleMangaResponse&_=${new Date().getTime()}`;
    script.onerror = function() { alert("Error al conectar con la hoja FULL LIST MANGA."); };
    document.body.appendChild(script);
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

    years.forEach(y => { yearSelect.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`); });
    authors.forEach(a => { authorSelect.insertAdjacentHTML('beforeend', `<option value="${a}">${a}</option>`); });
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
