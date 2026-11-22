let _masterData = []; 
let _favsRawData = [];
let _mangaData = []; 
let _activeFilters = { year: 'all', season: 'all', studio: 'all', score: 'all', query: '' };
let _sortConfig = { key: 'score', direction: 'desc' }; 
// Lee JSON de localStorage sin romper la app si está corrupto o bloqueado.
function readStoredJSON(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch (e) { return fallback; }
}

let _annualRanking = readStoredJSON('annual_ranking_data', []);
let _favoritesRanking = [];

// TOP 150: último guardado (para calcular subidas/bajadas) y lista en edición.
let _savedTop150 = readStoredJSON('saved_top150_data', []);
let _currentTop150 = [];

let _calificadorCurrentScores = [];
let _calificadorEpisodesCount = 0;
let _calificadorCurrentId = null;
let _calificadorSavedProgress = [];

let _planificadorSavedProgress = [];
let _currentSeasonData = [];

// Comillas codificadas (%27): esta URL se inserta dentro de onerror="this.src='...'".
const FALLBACK_IMG = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2760%27 height=%2785%27%3E%3Crect width=%2760%27 height=%2785%27 fill=%27%23111122%27 rx=%278%27/%3E%3Ctext x=%2750%25%27 y=%2750%25%27 dominant-baseline=%27middle%27 text-anchor=%27middle%27 fill=%27%2300f0ff%27 font-family=%27sans-serif%27 font-size=%2720%27 font-weight=%27bold%27%3E?%3C/text%3E%3C/svg%3E";
