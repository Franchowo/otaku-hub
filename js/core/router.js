// --- ENRUTADOR DE VISTAS ---
function switchView(viewId) {
    const container = document.getElementById('mainContainer');
    clearViewErrors();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(viewId).classList.add('active');
    container.classList.remove('form-mode', 'hub-mode');
    
    const targetTab = document.getElementById(`tabBtn-${viewId}`);
    if(targetTab) targetTab.classList.add('active');
    
    if(viewId === 'hubView') {
        container.classList.add('hub-mode');
    } else if(viewId === 'formView' || viewId === 'mangaFormView') {
        container.classList.add('form-mode');
    } else if(viewId === 'statsView') {
        initMasterDataFetch(); 
    } else if(viewId === 'detailView') {
        initMasterDataFetch(() => renderDetailView());
    } else if(viewId === 'mangaLibraryView') {
        initMangaDataFetch();
    } else if(viewId === 'studiosView') {
        initMasterDataFetch(() => renderTopStudiosView());
    } else if(viewId === 'annualRankingView') {
        initMasterDataFetch(() => initAnnualRankingFetch(() => renderAnnualRankingView()));
    } else if(viewId === 'favoritesView') {
        initFavoritesDataFetch(false);
    } else if(viewId === 'top150View') {
        document.getElementById('top150ClosedState').style.display = 'block';
        document.getElementById('top150OpenState').style.display = 'none';
        initMasterDataFetch(() => initTop150Fetch());
    } else if(viewId === 'timeMachineView') {
        initTimeMachineDataFetch();
    } else if(viewId === 'recommendationsView') {
        initRecommendationsFetch();
    } else if(viewId === 'calificadorView') {
        initCalificadorFetch();
    } else if(viewId === 'planificadorView') {
        initMasterDataFetch(() => initPlanificadorFetch());
    } else if(viewId === 'gachaView') {
        initMasterDataFetch(() => initMangaDataFetch(false, () => {}));
    }
}
