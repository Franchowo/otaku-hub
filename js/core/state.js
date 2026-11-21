let _masterData = []; 
let _favsRawData = [];
let _mangaData = []; 
let _activeFilters = { year: 'all', season: 'all', studio: 'all', score: 'all', query: '' };
let _sortConfig = { key: 'score', direction: 'desc' }; 
let _annualRanking = JSON.parse(localStorage.getItem('annual_ranking_data')) || [];
let _favoritesRanking = []; 
let dragSrcIndex = null;

let _calificadorCurrentScores = [];
let _calificadorEpisodesCount = 0;
let _calificadorCurrentId = null;
let _calificadorSavedProgress = [];

let _planificadorSavedProgress = [];
let _currentSeasonData = [];

const FALLBACK_IMG = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='85'%3E%3Crect width='60' height='85' fill='%23111122' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2300f0ff' font-family='sans-serif' font-size='20' font-weight='bold'%3E?%3C/text%3E%3C/svg%3E";
