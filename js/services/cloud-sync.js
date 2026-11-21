// --- FUNCIONES DE SINCRONIZACIÓN EN LA NUBE ---
function initTop150Fetch() {
    const btnStart = document.querySelector('#top150ClosedState .btn-start');
    const origText = btnStart.innerText;
    btnStart.innerText = "Sincronizando de Sheets... ⏳";
    btnStart.disabled = true;

    window.handleTop150Response = function(response) {
        if(response.status === 'success' && response.data && response.data.length > 0) {
            _savedTop150 = response.data.map(i => ({ id: i.id || Date.now()+Math.random(), name: i.name || i.title || i.anime, score: i.score }));
            localStorage.setItem('saved_top150_data', JSON.stringify(_savedTop150));
        }
        btnStart.innerText = origText;
        btnStart.disabled = false;
        const scriptTag = document.getElementById('jsonpTop150Script');
        if(scriptTag) scriptTag.remove();
    };

    const script = document.createElement('script');
    script.id = 'jsonpTop150Script';
    script.src = `${sheetsUrl()}sheet=TOP_150&tab=TOP_150&sheetName=TOP_150&callback=handleTop150Response&_=${new Date().getTime()}`;
    document.body.appendChild(script);
}

function initAnnualRankingFetch(callback) {
    window.handleAnnualResponse = function(response) {
        if(response.status === 'success' && response.data && response.data.length > 0) {
            _annualRanking = response.data.map(i => ({ id: i.id || Date.now()+Math.random(), name: i.name || i.title || i.anime, score: i.score }));
            localStorage.setItem('annual_ranking_data', JSON.stringify(_annualRanking));
        }
        const scriptTag = document.getElementById('jsonpAnnualScript');
        if(scriptTag) scriptTag.remove();
        if(callback) callback();
    };

    const script = document.createElement('script');
    script.id = 'jsonpAnnualScript';
    script.src = `${sheetsUrl()}sheet=RANKING_ANUAL&tab=RANKING_ANUAL&sheetName=RANKING_ANUAL&callback=handleAnnualResponse&_=${new Date().getTime()}`;
    document.body.appendChild(script);
}

function saveAnnualRankingToCloud() {
    const btn = document.querySelector('button[onclick="saveAnnualRankingToCloud()"]');
    const originalText = btn.innerText;
    btn.innerText = "Sincronizando... ☁️";
    btn.disabled = true;

    const payload = { action: "save_annual", payload: _annualRanking };

    fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withAuth(payload))
    }).then(() => {
        btn.innerText = "¡Guardado en Nube! ✔️";
        setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 2000);
    }).catch(() => {
        alert("Error de conexión al enviar a Sheets. Se ha guardado de forma local.");
        btn.innerText = originalText; btn.disabled = false;
    });
}

function initCalificadorFetch() {
    document.getElementById('calificadorLoader').style.display = 'block';
    
    window.handleCalificadorResponse = function(response) {
        document.getElementById('calificadorLoader').style.display = 'none';
        if(response.status === 'success' && response.data) {
            _calificadorSavedProgress = response.data;
            renderCalificadorSavedGrid();
        }
        const scriptTag = document.getElementById('jsonpCalificadorScript');
        if(scriptTag) scriptTag.remove();
    };

    const script = document.createElement('script');
    script.id = 'jsonpCalificadorScript';
    script.src = `${sheetsUrl()}sheet=CALIFICADOR_STATE&tab=CALIFICADOR_STATE&sheetName=CALIFICADOR_STATE&callback=handleCalificadorResponse&_=${new Date().getTime()}`;
    document.body.appendChild(script);
}
