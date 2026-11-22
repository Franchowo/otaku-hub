// --- FUNCIONES DE SINCRONIZACIÓN EN LA NUBE ---
function initTop150Fetch() {
    const btnStart = document.querySelector('#top150ClosedState .btn-start');
    const origText = btnStart.innerText;
    btnStart.innerText = "Sincronizando de Sheets... ⏳";
    btnStart.disabled = true;

    sheetsReadOnce('top150', 'TOP_150').then(data => {
        if(data.length > 0) {
            _savedTop150 = data.map(i => ({ id: i.id || Date.now()+Math.random(), name: i.name || i.title || i.anime, score: i.score }));
            localStorage.setItem('saved_top150_data', JSON.stringify(_savedTop150));
        }
    }).catch(err => {
        // Sin nube se trabaja con la copia local; solo avisamos en consola.
        console.warn('TOP 150: se usa la copia local.', err);
    }).finally(() => {
        btnStart.innerText = origText;
        btnStart.disabled = false;
    });
}

function initAnnualRankingFetch(callback) {
    sheetsReadOnce('annual', 'RANKING_ANUAL').then(data => {
        if(data.length > 0) {
            _annualRanking = data.map(i => ({ id: i.id || Date.now()+Math.random(), name: i.name || i.title || i.anime, score: i.score }));
            localStorage.setItem('annual_ranking_data', JSON.stringify(_annualRanking));
        }
    }).catch(err => {
        console.warn('Ranking anual: se usa la copia local.', err);
    }).finally(() => {
        if(callback) callback();
    });
}

function saveAnnualRankingToCloud() {
    const btn = document.querySelector('button[onclick="saveAnnualRankingToCloud()"]');
    const originalText = btn.innerText;
    btn.innerText = "Sincronizando... ☁️";
    btn.disabled = true;

    sheetsWrite({ action: "save_annual", payload: _annualRanking }).then(result => {
        btn.innerText = savedLabel(result, "¡Guardado en Nube! ✔️");
        setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 2000);
    }).catch(err => {
        toast(`${err.message} La lista sigue guardada en este dispositivo.`, { type: 'error' });
        btn.innerText = originalText; btn.disabled = false;
    });
}

function initCalificadorFetch() {
    document.getElementById('calificadorLoader').style.display = 'block';

    sheetsReadOnce('calificador', 'CALIFICADOR_STATE').then(data => {
        document.getElementById('calificadorLoader').style.display = 'none';
        _calificadorSavedProgress = data;
        renderCalificadorSavedGrid();
    }).catch(err => {
        document.getElementById('calificadorLoader').style.display = 'none';
        showViewError(`No se pudieron cargar tus evaluaciones. ${err.message}`);
    });
}
