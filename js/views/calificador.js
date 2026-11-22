// --- CALIFICADOR ---
// Escala actual de las respuestas: Brutal 10 · Bien 7.5 · Meh 5 · Mal 2.5 · Basura 0.
const CALIFICADOR_SCALE = 10;

// Los hitos intermedios antiguos se guardaban sobre 5 con enteros 1-5.
// Los valores 1, 2, 3 y 4 no existen en la escala actual, así que solo se
// consideran antiguos los hitos sin marca de escala que contengan alguno.
// (Un hito antiguo con las 4 respuestas a 5 es indistinguible y se deja tal cual.)
function isLegacyCheckpoint(cp) {
    return !cp.isFinal && cp.scale !== CALIFICADOR_SCALE && Array.isArray(cp.answers) && cp.answers.some(v => [1, 2, 3, 4].includes(v));
}

// Repara hitos corrompidos por el bug anterior (respuestas duplicadas por
// encima de 10): se dividen a la mitad hasta volver a la escala y se recalcula la nota.
function normalizeCalificadorCheckpoint(cp) {
    const fixed = { ...cp };
    if (Array.isArray(fixed.answers) && fixed.answers.length > 0) {
        let answers = fixed.answers.map(Number);
        let guard = 0;
        while (Math.max(...answers) > 10 && guard++ < 5) answers = answers.map(v => v / 2);
        fixed.answers = answers;
        if (fixed.completed && (guard > 0 || fixed.score > 10)) {
            fixed.score = answers.reduce((a, b) => a + b, 0) / answers.length;
        }
    }
    return fixed;
}
async function searchAnimeCalificador() {
    const query = document.getElementById('calificadorSearchInput').value.trim();
    if (!query) return;

    const resultsGrid = document.getElementById('calificadorResultsGrid'),
        loader = document.getElementById('calificadorLoader'),
        trackerSection = document.getElementById('calificadorTrackerSection');
    resultsGrid.innerHTML = '';
    trackerSection.style.display = 'none';
    loader.style.display = 'block';

    const gql = `query($search: String) { Page(page: 1, perPage: 6) { media(search: $search, type: ANIME) { id title { romaji } episodes status nextAiringEpisode { episode } coverImage { large } } } }`;

    try {
        const data = await fetchAnilist(gql, { search: query });
        loader.style.display = 'none';

        const medias = data?.data?.Page?.media || [];
        if (medias.length === 0) {
            resultsGrid.innerHTML =
                '<div style="grid-column:1/-1; text-align:center; color:rgba(var(--fg-rgb), 0.6);">No se encontraron resultados.</div>';
            return;
        }

        medias.forEach(anime => {
            const epCount = anime.episodes;
            const airedSoFar = anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : null;
            const imgUrl = anime.coverImage?.large || FALLBACK_IMG;
            const titleRomaji = anime.title.romaji;

            const card = document.createElement('div');
            card.className = 'recom-card anime-recom';
            card.style.cursor = 'pointer';
            card.setAttribute('role', 'button');
            card.tabIndex = 0;
            card.innerHTML = `<div class="recom-card-img-container"><img src="${esc(imgUrl)}" alt="" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';"></div><span class="recom-card-title" title="${esc(titleRomaji)}">${esc(titleRomaji)}</span><span style="font-size: 0.75rem; color: var(--neon-cyan); margin-top: 5px; font-weight: bold;">${epCount ? `${esc(epCount)} episodios` : airedSoFar !== null ? `En emisión (van ${esc(airedSoFar)})` : 'Episodios por confirmar'}</span>`;

            card.onclick = async () => {
                const existingAnime = Array.isArray(_calificadorSavedProgress)
                    ? _calificadorSavedProgress.find(
                          a => a && (a.id === `al-${anime.id}` || String(a.title).toLowerCase() === titleRomaji.toLowerCase())
                      )
                    : null;
                if (existingAnime && Array.isArray(existingAnime.scores)) {
                    loadCalificadorTracker(
                        existingAnime.title,
                        existingAnime.episodes,
                        existingAnime.cover,
                        existingAnime.scores,
                        existingAnime.id
                    );
                    return;
                }
                let episodes = epCount;
                if (!episodes) {
                    // En emisión o sin confirmar: AniList aún no sabe cuántos tendrá.
                    episodes = await promptNumberDialog({
                        title: '¿Cuántos episodios tendrá?',
                        message: `AniList aún no lo confirma${airedSoFar !== null ? ` (van ${airedSoFar} emitidos)` : ''}. Podrás cambiarlo después.`,
                        value: Math.max(12, airedSoFar || 0),
                        min: 1,
                        max: 2000,
                        confirmText: 'Empezar'
                    });
                    if (episodes === null) return;
                }
                // El id "al-<AniList>" permite registrar luego el anime con su ID exacto.
                loadCalificadorTracker(titleRomaji, episodes, imgUrl, null, `al-${anime.id}`);
            };
            resultsGrid.appendChild(card);
        });
    } catch (error) {
        loader.style.display = 'none';
        resultsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--neon-red);">Error de red al buscar.</div>';
    }
}

function renderCalificadorSavedGrid() {
    const section = document.getElementById('calificadorSavedSection'),
        grid = document.getElementById('calificadorSavedGrid');
    grid.innerHTML = '';
    if (!Array.isArray(_calificadorSavedProgress)) _calificadorSavedProgress = [];

    _calificadorSavedProgress.forEach(anime => {
        if (typeof anime.scores === 'string') {
            try {
                anime.scores = JSON.parse(anime.scores);
            } catch (e) {
                anime.scores = [];
            }
        }
        if (!Array.isArray(anime.scores)) anime.scores = [];
    });

    const validProgress = _calificadorSavedProgress.filter(a => a && a.id && a.title);
    _calificadorSavedProgress = validProgress;

    if (validProgress.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    validProgress.forEach(anime => {
        // Compatible con el nuevo formato de objetos
        const completed = anime.scores.filter(s => s && s.completed).length;
        const totalHitos = anime.scores.length || 1;
        const pct = (completed / totalHitos) * 100;

        const card = document.createElement('div');
        card.className = 'recom-card anime-recom';
        card.style.cursor = 'pointer';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.innerHTML = `<div class="recom-card-img-container" style="position:relative;"><img src="${esc(anime.cover)}" alt="" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';"><div style="position:absolute; bottom:0; left:0; width:100%; height:4px; background:rgba(var(--fg-rgb), 0.2);"><div style="width:${pct}%; height:100%; background:var(--neon-cyan);"></div></div></div><span class="recom-card-title" title="${esc(anime.title)}">${esc(anime.title)}</span><span style="font-size: 0.75rem; color: var(--neon-cyan); margin-top: 5px; font-weight: bold;">Progreso: ${Math.round(pct)}%</span><button class="clear-cache-btn" style="border:none; color:var(--neon-red); margin-top:5px; font-size:0.75rem;" onclick="event.stopPropagation(); deleteCalificadorProgress(${jsArg(anime.id)})">Eliminar</button>`;
        card.onclick = () => {
            document.getElementById('calificadorResultsGrid').innerHTML = '';
            loadCalificadorTracker(anime.title, anime.episodes, anime.cover, anime.scores, anime.id);
        };
        grid.appendChild(card);
    });
}

async function deleteCalificadorProgress(id) {
    const anime = _calificadorSavedProgress.find(a => a.id === id);
    const ok = await confirmDialog({
        title: 'Eliminar evaluación',
        message: `Se borrará el progreso de "${anime ? anime.title : 'este anime'}" también en Sheets.`,
        confirmText: 'Eliminar',
        danger: true
    });
    if (ok) {
        _calificadorSavedProgress = _calificadorSavedProgress.filter(a => a.id !== id);
        renderCalificadorSavedGrid();
        syncCalificadorToCloud({ remove: id });
        if (_calificadorCurrentId === id) {
            document.getElementById('calificadorTrackerSection').style.display = 'none';
        }
    }
}

// Hay evaluaciones registradas en el formulario que aún no se han guardado.
let _calificadorDirty = false;
registerLeaveGuard('calificadorView', {
    isDirty: () => _calificadorDirty,
    message: 'Has evaluado hitos que aún no has guardado con "Guardar Progreso Actual".',
    discard: () => {
        _calificadorDirty = false;
    }
});

function loadCalificadorTracker(title, episodes, imgUrl, existingScores = null, id = null) {
    _calificadorDirty = false;
    document.getElementById('calificadorResultsGrid').innerHTML = '';
    document.getElementById('calificadorSearchInput').value = '';
    const trackerSection = document.getElementById('calificadorTrackerSection');
    trackerSection.style.display = 'block';
    trackerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.getElementById('calificadorAnimeTitle').textContent = title;
    document.getElementById('calificadorAnimeMeta').innerText = `${episodes} Capítulos Registrados`;
    document.getElementById('calificadorAnimeCover').src = imgUrl;

    _calificadorEpisodesCount = episodes;
    _calificadorCurrentId = id || 'calif-' + Date.now();

    // Lógica de cálculo de Puntos de Estado (Hitos) cada 3 episodios
    const milestones = buildMilestones(episodes);

    // Inicializamos o recuperamos datos asegurando el nuevo formato JSON
    if (existingScores && Array.isArray(existingScores) && existingScores.length > 0 && typeof existingScores[0] === 'object') {
        _calificadorCurrentScores = existingScores.map(normalizeCalificadorCheckpoint);
    } else {
        _calificadorCurrentScores = milestones.map(m => ({
            ep: m.ep,
            isFinal: m.isFinal,
            completed: false,
            score: 0,
            answers: m.isFinal ? [5, 5, 5, 5] : [3, 3, 3, 3] // Valores predeterminados neutros
        }));
    }

    renderCalificadorList();
    calculateCalificadorStats();
}

// Hitos cada 3 episodios + hito final (también si el total no es múltiplo de 3).
function buildMilestones(episodes) {
    const milestones = [];
    for (let i = 3; i <= episodes; i += 3) milestones.push({ ep: i, isFinal: i === episodes });
    if (episodes % 3 !== 0 && episodes > 0) milestones.push({ ep: episodes, isFinal: true });
    return milestones;
}

// Cambiar el total (p. ej. un anime en emisión que al final tuvo más episodios).
// Se conservan las evaluaciones de los hitos que siguen existiendo; la final
// solo se conserva si el último episodio no cambia.
async function changeCalificadorEpisodes() {
    const episodes = await promptNumberDialog({
        title: 'Número de episodios',
        message: 'Total de episodios del anime. Las evaluaciones ya hechas se conservan.',
        value: _calificadorEpisodesCount,
        min: 1,
        max: 2000,
        confirmText: 'Cambiar'
    });
    if (episodes === null || episodes === _calificadorEpisodesCount) return;
    const previous = _calificadorCurrentScores;
    _calificadorCurrentScores = buildMilestones(episodes).map(m => {
        const old =
            previous.find(p => p.ep === m.ep && p.isFinal === m.isFinal) || (!m.isFinal && previous.find(p => p.ep === m.ep && !p.isFinal));
        return old
            ? { ...old, isFinal: m.isFinal }
            : { ep: m.ep, isFinal: m.isFinal, completed: false, score: 0, answers: m.isFinal ? [5, 5, 5, 5] : [3, 3, 3, 3] };
    });
    _calificadorEpisodesCount = episodes;
    document.getElementById('calificadorAnimeMeta').innerText = `${episodes} Capítulos Registrados`;
    _calificadorDirty = true;
    renderCalificadorList();
    calculateCalificadorStats();
    toast('Episodios actualizados. Recuerda guardar el progreso.', { type: 'info' });
}

function renderCalificadorList() {
    const list = document.getElementById('calificadorEpisodeList');
    list.innerHTML = '';

    _calificadorCurrentScores.forEach((cp, index) => {
        const isFinal = cp.isFinal;
        const prevEp = index === 0 ? 1 : _calificadorCurrentScores[index - 1].ep + 1;
        const title = isFinal ? `🏆 PUNTO DE ESTADO FINAL (Hasta Ep. ${cp.ep})` : `📍 Punto de Estado (Eps. ${prevEp} - ${cp.ep})`;
        const btnText = cp.completed ? `Editar Nota (${cp.score.toFixed(1)}⭐)` : 'Rellenar Formulario 📝';

        let btnStyle = cp.completed
            ? 'background: rgba(0, 255, 102, 0.1); color: var(--neon-green); border: 1px solid var(--neon-green); box-shadow: 0 0 10px rgba(0,255,102,0.1);'
            : 'background: rgba(0, 240, 255, 0.1); color: var(--neon-cyan); border: 1px solid var(--neon-cyan);';

        if (isFinal && !cp.completed)
            btnStyle =
                'background: rgba(255, 170, 0, 0.1); color: var(--neon-yellow); border: 1px solid var(--neon-yellow); box-shadow: 0 0 10px rgba(255,170,0,0.1);';

        const item = document.createElement('div');
        item.className = 'list-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '16px 20px';
        item.style.background = cp.completed ? 'rgba(0, 255, 102, 0.02)' : 'rgba(var(--fg-rgb), 0.01)';
        item.style.borderColor = cp.completed ? 'rgba(0, 255, 102, 0.15)' : 'var(--glass-border)';

        item.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:4px;">
                <span style="font-weight: 700; color: ${isFinal ? 'var(--neon-yellow)' : 'var(--text-strong)'}; font-size: 0.95rem;">${title}</span>
                <span style="font-size: 0.75rem; color: rgba(var(--fg-rgb), 0.6);">${cp.completed ? 'Formulario guardado ✔️' : 'Evaluación pendiente...'}</span>
            </div>
            <button class="btn-icon calif-step-btn" style="${btnStyle}" onclick="openCalificadorForm(${index})">${btnText}</button>
        `;
        list.appendChild(item);
    });
}

let _currentFormIndex = null;
let _tempCalificadorAnswers = [];

function openCalificadorForm(index) {
    _currentFormIndex = index;
    const cp = _calificadorCurrentScores[index];
    const modal = document.getElementById('calificadorFormModal');
    document.getElementById('calificadorFormTitle').innerText = cp.isFinal
        ? `Evaluación Definitiva Final`
        : `Evaluación Intermedia (Ep. ${cp.ep})`;
    document.getElementById('calificadorFormDesc').innerText = cp.isFinal
        ? 'Selecciona cómo sentiste el cierre de la obra.'
        : 'Selecciona cómo sentiste este bloque de episodios.';

    // Iniciar valores temporales para interactividad
    if (!cp.completed) {
        _tempCalificadorAnswers = [7.5, 7.5, 7.5, 7.5]; // Por defecto marcado en "Bien"
    } else {
        _tempCalificadorAnswers = [...cp.answers];
        // Compatibilidad con hitos antiguos guardados sobre 5 (ver isLegacyCheckpoint).
        // Antes se duplicaba todo si había algún valor <= 5, pero "Meh" (5),
        // "Mal" (2.5) y "Basura" (0) son valores válidos de la escala actual.
        if (isLegacyCheckpoint(cp)) {
            _tempCalificadorAnswers = _tempCalificadorAnswers.map(v => v * 2);
        }
    }

    renderFormQuestions();
    modal.style.display = 'flex';
}

function renderFormQuestions() {
    if (_currentFormIndex === null) return;
    const cp = _calificadorCurrentScores[_currentFormIndex];
    const questionsEl = document.getElementById('calificadorFormQuestions');
    questionsEl.innerHTML = '';

    const questions = cp.isFinal
        ? ['📜 Resolución de la trama', '🎭 Cierre de personajes', '💖 Impacto emocional', '🎨 Calidad técnica y sonora']
        : ['🎢 Ritmo y entretenimiento', '🧠 Interés de la historia', '🔥 Ganas de seguir viendo', '🎨 Animación general'];

    // Botones cualitativos con equivalencia numérica interna ampliada a 5 opciones (Mínimo 0)
    const options = [
        { label: '🤩 Brutal', val: 10, color: 'var(--neon-magenta)' },
        { label: '🙂 Bien', val: 7.5, color: 'var(--neon-green)' },
        { label: '🥱 Meh', val: 5, color: 'var(--neon-yellow)' },
        { label: '👎 Mal', val: 2.5, color: '#ff6600' },
        { label: '🤮 Basura', val: 0, color: 'var(--neon-red)' }
    ];

    questions.forEach((q, i) => {
        const currentVal = _tempCalificadorAnswers[i];

        let btnsHTML = options
            .map(opt => {
                // Tolerancia más ajustada (1.2) por tener 5 botones
                const isSelected = Math.abs(currentVal - opt.val) <= 1.2;
                const bg = isSelected ? opt.color : 'rgba(var(--shade-rgb), 0.3)';
                const textCol = isSelected ? 'var(--on-accent)' : opt.color;
                const border = isSelected ? opt.color : 'rgba(var(--fg-rgb), 0.1)';
                const shadow = isSelected ? `box-shadow: 0 0 10px ${opt.color}60;` : '';
                const scale = isSelected ? 'transform: scale(1.05);' : 'transform: scale(1);';

                return `<button type="button" 
                    style="flex:1; padding:10px 1px; border-radius:8px; border:1px solid ${border}; 
                           background:${bg}; color:${textCol}; font-weight:800; font-size:0.75rem; 
                           cursor:pointer; transition:all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); ${shadow} ${scale}" 
                    onclick="_tempCalificadorAnswers[${i}] = ${opt.val}; renderFormQuestions();">
                    ${opt.label}
                    </button>`;
            })
            .join('');

        questionsEl.innerHTML += `
            <div style="background: rgba(var(--fg-rgb), 0.02); padding: 18px 12px; border-radius: 14px; border: 1px solid rgba(var(--fg-rgb), 0.05);">
                <label style="color: var(--text-strong); font-weight: bold; font-size: 0.95rem; margin-bottom: 12px; display:block; text-align:center;">${q}</label>
                <div style="display:flex; gap:8px; width:100%;">${btnsHTML}</div>
            </div>
        `;
    });

    updateCalificadorLiveScore();
}

function updateCalificadorLiveScore() {
    if (_currentFormIndex === null) return;
    // Suma las notas matemáticas generadas por los botones
    const sum = _tempCalificadorAnswers.reduce((a, b) => a + b, 0);
    const calcScore = sum / 4;
    document.getElementById('calificadorFormLiveScore').innerText = calcScore.toFixed(1);
}

function submitCalificadorForm() {
    if (_currentFormIndex === null) return;
    const cp = _calificadorCurrentScores[_currentFormIndex];

    cp.answers = [..._tempCalificadorAnswers];
    cp.score = _tempCalificadorAnswers.reduce((a, b) => a + b, 0) / 4;
    cp.completed = true;
    cp.scale = CALIFICADOR_SCALE;
    _calificadorDirty = true;

    closeCalificadorForm();
    renderCalificadorList();
    calculateCalificadorStats();
}

function closeCalificadorForm() {
    document.getElementById('calificadorFormModal').style.display = 'none';
    _currentFormIndex = null;
}

function calculateCalificadorStats() {
    const completedCPs = _calificadorCurrentScores.filter(cp => cp.completed);
    let average = 0,
        perfectHits = 0;

    if (completedCPs.length > 0) {
        // Separamos los hitos intermedios del hito final
        const intermediateCPs = completedCPs.filter(cp => !cp.isFinal);
        const finalCP = completedCPs.find(cp => cp.isFinal);

        let avgIntermediate = 0;
        if (intermediateCPs.length > 0) {
            const sumInt = intermediateCPs.reduce((acc, curr) => acc + curr.score, 0);
            avgIntermediate = sumInt / intermediateCPs.length;
        }

        // Cálculo con pesos: 50% Intermedios / 50% Final
        if (finalCP && intermediateCPs.length > 0) {
            average = avgIntermediate * 0.5 + finalCP.score * 0.5;
        } else if (finalCP) {
            average = finalCP.score;
        } else {
            average = avgIntermediate; // Si aún no hay final, muestra la media en curso
        }

        // Nueva regla: Todo Hito que supere el 8.5
        perfectHits = completedCPs.filter(cp => cp.score > 8.5).length;
    }

    document.getElementById('calificadorAverageScore').innerText = average.toFixed(2).replace('.', ',');

    const badge = document.getElementById('calificadorCandidateBadge');
    const tensCount = document.getElementById('calificadorTensCount');
    tensCount.innerText = perfectHits;

    renderCalificadorFinalProposal(
        average,
        completedCPs.some(cp => cp.isFinal)
    );

    if (perfectHits > 0) {
        badge.className = 'kpi-card magenta';
        badge.style.borderColor = 'var(--neon-magenta)';
        badge.style.boxShadow = '0 0 15px rgba(255, 0, 127, 0.2)';
        tensCount.style.color = 'var(--text-strong)';
        tensCount.innerText = perfectHits + ' 🌟 ¡EXCELENTE!';
    } else {
        badge.className = 'kpi-card';
        badge.style.borderColor = 'var(--glass-border)';
        badge.style.boxShadow = 'none';
        tensCount.style.color = 'rgba(var(--fg-rgb), 0.6)';
    }
}

function saveCurrentCalificadorToCloud() {
    const btn = document.getElementById('btnSaveCalificador'),
        title = document.getElementById('calificadorAnimeTitle').textContent,
        cover = document.getElementById('calificadorAnimeCover').src;
    if (!Array.isArray(_calificadorSavedProgress)) _calificadorSavedProgress = [];
    const existingIndex = _calificadorSavedProgress.findIndex(a => a.id === _calificadorCurrentId);
    const animeData = {
        id: _calificadorCurrentId,
        title: title,
        episodes: _calificadorEpisodesCount,
        cover: cover,
        scores: [..._calificadorCurrentScores]
    };

    if (existingIndex > -1) {
        _calificadorSavedProgress[existingIndex] = animeData;
    } else {
        _calificadorSavedProgress.push(animeData);
    }
    renderCalificadorSavedGrid();
    btn.innerText = 'Sincronizando... ⏳';
    btn.disabled = true;

    syncCalificadorToCloud(
        { upsert: animeData },
        result => {
            _calificadorDirty = false;
            btn.innerText = savedLabel(result, '¡Progreso Guardado! ✔️');
            setTimeout(() => {
                btn.innerText = '💾 Guardar Progreso Actual';
                btn.disabled = false;
            }, 2000);
        },
        err => {
            // Antes el botón se quedaba bloqueado en "Sincronizando..." para siempre.
            toast(`No se guardó el progreso: ${err.message}`, { type: 'error' });
            btn.innerText = '💾 Guardar Progreso Actual';
            btn.disabled = false;
        }
    );
}

// Con Code.gs v2 guarda/borra solo la evaluación afectada; con el backend
// antiguo reescribe la hoja entera como antes.
async function saveCalificadorChange(change) {
    const version = await getServerVersion();
    if (version >= 2 && change && change.upsert) {
        return sheetsWrite({ action: 'upsert_rows', sheet: 'CALIFICADOR_STATE', items: [change.upsert] }, { minVersion: 2 });
    }
    if (version >= 2 && change && change.remove) {
        return sheetsWrite({ action: 'delete_rows', sheet: 'CALIFICADOR_STATE', ids: [change.remove] }, { minVersion: 2 });
    }
    return sheetsWrite({ action: 'save_calificador', payload: _calificadorSavedProgress });
}

function syncCalificadorToCloud(change, callbackSuccess, callbackError) {
    const statusLabel = document.getElementById('calificadorSyncStatus');
    if (statusLabel) {
        statusLabel.innerText = 'Sincronizando ⏳';
        statusLabel.style.color = 'var(--neon-yellow)';
    }

    saveCalificadorChange(change)
        .then(result => {
            if (statusLabel) {
                statusLabel.innerText = result.confirmed ? 'Sincronizado ✔️' : 'Enviado ✔️ (sin confirmar)';
                statusLabel.style.color = 'var(--neon-green)';
            }
            if (callbackSuccess) callbackSuccess(result);
        })
        .catch(err => {
            if (statusLabel) {
                statusLabel.innerText = 'No guardado ❌';
                statusLabel.title = err.message;
                statusLabel.style.color = 'var(--neon-red)';
            }
            if (callbackError) callbackError(err);
        });
}

// ---------------------------------------------------------------------
// CERRAR EL CICLO: con el hito final evaluado, proponer la nota y
// registrarla (o editarla si el anime ya está en tu lista).
// ---------------------------------------------------------------------
function calificadorAnilistId() {
    const m = /^al-(\d+)$/.exec(String(_calificadorCurrentId || ''));
    return m ? parseInt(m[1], 10) : null;
}

function renderCalificadorFinalProposal(average, finalDone) {
    const box = document.getElementById('calificadorFinalProposal');
    if (!box) return;
    if (!finalDone) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    const proposed = Math.min(10, Math.max(1, Math.round(average)));
    const title = document.getElementById('calificadorAnimeTitle').textContent;
    const id = calificadorAnilistId();
    const owned = _masterData.find(a => (id && a.anilistId === id) || String(a.anime).toLowerCase() === title.toLowerCase());
    box.hidden = false;
    box.innerHTML = owned
        ? `<span>🏁 Nota propuesta: <strong>${proposed}/10</strong>. Ya está en tu lista con ${esc(owned.score)}⭐.</span>
           <button type="button" class="chip-btn accent-green chip-btn--sm" onclick="openWorkSheet('anime', ${jsArg(workKey(owned, 'anime'))})">Ver / editar nota</button>`
        : `<span>🏁 Nota propuesta: <strong>${proposed}/10</strong></span>
           <button type="button" class="chip-btn accent-green chip-btn--sm" onclick="registerFromCalificador(${proposed})">📥 Registrar en mi lista</button>`;
}

// Deja el formulario de registro relleno (título, temporada, año, estudio,
// nota e ID de AniList) para que solo tengas que revisar y enviar.
async function registerFromCalificador(score) {
    const title = document.getElementById('calificadorAnimeTitle').textContent;
    const id = calificadorAnilistId();
    // Guardar el progreso antes de salir, para no perderlo ni bloquear la navegación.
    if (_calificadorDirty) saveCurrentCalificadorToCloud();
    _calificadorDirty = false;
    switchView('formView');
    document.getElementById('anime').value = title;
    document.getElementById('score').value = score;
    updateScoreData(score);
    if (!id) return;
    try {
        const json = await fetchAnilist(
            `query($id: Int) { Media(id: $id, type: ANIME) { id title { romaji } season seasonYear startDate { year month } studios(isMain: true) { nodes { name } } } }`,
            { id }
        );
        const m = json?.data?.Media;
        if (!m) return;
        const season = m.season ? m.season.charAt(0) + m.season.slice(1).toLowerCase() : null;
        if (season) document.getElementById('season').value = season;
        if (m.seasonYear || m.startDate?.year) document.getElementById('year').value = m.seasonYear || m.startDate.year;
        const studios = (m.studios?.nodes || []).map(n => n.name).join(', ');
        if (studios) document.getElementById('studio').value = studios;
        _selectedAnimeMedia = { id: m.id, title };
    } catch (e) {
        /* el usuario puede completar el resto a mano */
    }
}
