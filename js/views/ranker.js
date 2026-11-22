// --- RANKER ---
let state = JSON.parse(localStorage.getItem('ranker_data')) || { songs: [], pool: [], index: 0, duelsTotal: 0, duelsDone: 0 };
function save() { localStorage.setItem('ranker_data', JSON.stringify(state)); }
async function resetApp() {
    const ok = await confirmDialog({ title: 'Reiniciar Opening Ranker', message: 'Se borrarán la lista, las estrellas y los duelos. No se puede deshacer.', confirmText: 'Reiniciar', danger: true });
    if (!ok) return;
    localStorage.removeItem('ranker_data');
    state = { songs: [], pool: [], index: 0, duelsTotal: 0, duelsDone: 0 };
    document.getElementById('input').value = '';
    goToStep(1);
    toast('Opening Ranker reiniciado.', { type: 'success' });
}
const delay = ms => new Promise(res => setTimeout(res, ms));

function startApp() {
    const input = document.getElementById('input').value; const lines = input.split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) return toast("Escribe al menos un anime (uno por línea).", { type: 'error' });
    state.songs = lines.map(name => ({ id: Date.now() + Math.random(), name: name, img: null, stars: 0, elo: 1000, action: null }));
    save(); goToStep(2); renderDiscard();
}

function renderDiscard() {
    document.getElementById('discard-list').innerHTML = state.songs.map(s => {
        let stateClass = ''; if(s.action === 'keep') stateClass = 'item-keep'; if(s.action === 'discard') stateClass = 'item-discard';
        return `<div class="list-item ${stateClass}"><span style="flex-grow:1; font-weight:600;">${esc(s.name)}</span><div style="display:flex; gap:10px;"><button class="btn-icon btn-keep" onclick="markItem('${s.id}', 'keep')" title="Mantener">✔</button><button class="btn-icon btn-discard" onclick="markItem('${s.id}', 'discard')" title="Descartar">X</button></div></div>`;
    }).join('');
}

function markItem(id, actionType) { const song = state.songs.find(x => String(x.id) === String(id)); if(song) song.action = actionType; save(); renderDiscard(); }

async function prepareRating() {
    const keptSongs = state.songs.filter(s => s.action === 'keep');
    if (keptSongs.length === 0) return toast("Mantén (✔) al menos un anime para continuar.", { type: 'error' });
    state.songs = keptSongs;
    const btn = document.getElementById('btn-to-rating'); btn.disabled = true;
    
    for (let i = 0; i < state.songs.length; i++) {
        if (!state.songs[i].img) {
            btn.innerText = `Cargando portada ${i + 1} de ${state.songs.length}...`;
            const gql = `query ($search: String) { Media (search: $search, type: ANIME) { coverImage { large } } }`;
            try {
                const data = await fetchAnilist(gql, { search: state.songs[i].name });
                state.songs[i].img = data?.data?.Media?.coverImage?.large || FALLBACK_IMG;
            } catch (e) { state.songs[i].img = FALLBACK_IMG; }
            await delay(250); 
        }
    }

    btn.innerText = "Siguiente: Cargar Portadas y Valorar ➡️"; btn.disabled = false; save(); goToStep(3);
}

function goToStep(n) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById('step-' + n).classList.add('active'); if(n === 3) renderRating(); }

function renderRating() {
    document.getElementById('rating-list').innerHTML = state.songs.map(s => `
        <div class="list-item"><div class="img-container"><img src="${esc(s.img || FALLBACK_IMG)}" class="img-thumb" alt="" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';"></div>
        <span style="flex-grow:1; font-weight:600;">${esc(s.name)}</span><div style="display:flex; gap:6px;">${[1,2,3].map(i => `<span class="star ${i <= s.stars ? 'active' : ''}" onclick="setStars('${s.id}', ${i})">★</span>`).join('')}</div></div>`).join('');
}

function setStars(id, val) { const song = state.songs.find(s => String(s.id) === String(id)); if(song) song.stars = val; save(); renderRating(); }

function startDuels() {
    const ratedSongs = state.songs.filter(s => s.stars > 0);
    if (ratedSongs.length < 2) return toast("Da estrellas al menos a 2 animes para empezar los duelos.", { type: 'error' });
    const topRatedCount = ratedSongs.filter(s => s.stars >= 2).length;
    if (topRatedCount > 20) { state.pool = ratedSongs.filter(s => s.stars >= 2); toast("Tienes más de 20 animes con 2-3 estrellas: los de 1 estrella se han apartado para centrarse en el TOP 20.", { type: 'info', duration: 7000 }); } 
    else { state.pool = ratedSongs; }
    state.duelsTotal = state.pool.length * 2; state.duelsDone = 0; state.pool.forEach(s => s.elo = s.stars * 500);
    save(); goToStep(4); renderDuel();
}

function renderDuel() {
    const box = document.getElementById('duel-box'), fill = document.getElementById('progress-fill');
    fill.style.width = Math.min((state.duelsDone / state.duelsTotal) * 100, 100) + "%";

    if (state.duelsDone >= state.duelsTotal || state.pool.length < 2) {
        state.pool.sort((a,b) => b.elo - a.elo);
        let topHTML = `<h3>🏆 Top Ranking Final</h3>`;
        state.pool.slice(0, 20).forEach((s, i) => { topHTML += `<div class="list-item"><strong style="color:var(--neon-magenta); font-size:20px; width:35px; text-align:center;">#${i+1}</strong><div class="img-container"><img src="${esc(s.img || FALLBACK_IMG)}" class="img-thumb" alt="" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';"></div><span style="font-weight:600; margin-left:10px;">${esc(s.name)}</span></div>`; });
        box.innerHTML = topHTML; return;
    }

    const a = state.pool[0], b = state.pool[1];
    box.innerHTML = `
        <h3 style="text-align:center; margin-bottom:25px;">¿Qué Opening es mejor?</h3>
        <button class="btn" style="height:auto; display:flex; align-items:center; gap:20px; padding:15px; text-transform:none; letter-spacing:0; text-align:left;" onclick="vote(0)"><div class="img-container" style="width:60px; height:85px;"><img src="${esc(a.img || FALLBACK_IMG)}" class="img-thumb" alt="" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';"></div><span style="flex-grow:1; font-size:1.05rem; font-weight:600;">${esc(a.name)}</span></button>
        <div style="text-align:center; margin:15px 0; font-weight:900; color:var(--neon-cyan); letter-spacing:2px; text-shadow:0 0 5px rgba(0,240,255,0.3)">VS</div>
        <button class="btn" style="height:auto; display:flex; align-items:center; gap:20px; padding:15px; text-transform:none; letter-spacing:0; text-align:left;" onclick="vote(1)"><div class="img-container" style="width:60px; height:85px;"><img src="${esc(b.img || FALLBACK_IMG)}" class="img-thumb" alt="" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';"></div><span style="flex-grow:1; font-size:1.05rem; font-weight:600;">${esc(b.name)}</span></button>
    `;
}

function vote(winnerIndex) {
    state.pool[winnerIndex].elo += 50; const a = state.pool.shift(), b = state.pool.shift();
    state.pool.push(winnerIndex === 0 ? b : a); state.pool.push(winnerIndex === 0 ? a : b); state.duelsDone++; save(); renderDuel();
}


window.onload = () => {
    if (state.songs.length > 0) {
        if (state.pool && state.pool.length > 0) { goToStep(4); renderDuel(); }
        else if (state.songs.some(s => s.stars > 0) || state.songs.some(s => s.img !== null)) { goToStep(3); renderRating(); }
        else { goToStep(2); renderDiscard(); }
    }
};
