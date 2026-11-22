// =====================================================================
// BÚSQUEDA GLOBAL (🔍 en la cabecera, Ctrl+K o "/")
// Busca a la vez secciones de la app, tus animes y tus mangas.
// =====================================================================

let _searchSelected = 0;

function normalizeForSearch(str) {
    return String(str || '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

function openGlobalSearch() {
    if (document.getElementById('searchOverlay')) return;
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.id = 'searchOverlay';
    overlay.className = 'search-overlay';
    overlay.innerHTML = `
        <div class="search-panel" role="dialog" aria-modal="true" aria-label="Buscar">
            <input type="search" id="globalSearchInput" placeholder="Busca un anime, un manga o una sección…" autocomplete="off"
                   role="combobox" aria-expanded="true" aria-controls="globalSearchResults" aria-autocomplete="list">
            <ul id="globalSearchResults" class="search-results-list" role="listbox"></ul>
            <p class="search-hint">↑↓ para moverte · Enter para abrir · Esc para cerrar</p>
        </div>`;
    document.body.appendChild(overlay);

    const input = document.getElementById('globalSearchInput');
    const close = () => {
        overlay.remove();
        if (previousFocus && previousFocus.focus) previousFocus.focus();
    };
    overlay.addEventListener('click', e => {
        if (e.target === overlay) close();
    });
    overlay.addEventListener('keydown', e => {
        const items = [...overlay.querySelectorAll('.search-result')];
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!items.length) return;
            _searchSelected = (_searchSelected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            highlightSearchResult(items);
        } else if (e.key === 'Enter' && items[_searchSelected]) {
            e.preventDefault();
            items[_searchSelected].click();
        }
    });
    overlay.addEventListener('click', e => {
        if (e.target.closest('.search-result')) close();
    });
    input.addEventListener('input', () => renderSearchResults(input.value));
    input.focus();
    renderSearchResults('');

    // Cargar las listas si aún no están (la búsqueda se refresca al llegar).
    if (getAccessKey()) {
        initMasterDataFetch(() => {
            renderSearchResults(input.value);
            initMangaDataFetch(false, () => renderSearchResults(input.value));
        });
    }
}

function highlightSearchResult(items) {
    items.forEach((el, i) => el.setAttribute('aria-selected', i === _searchSelected ? 'true' : 'false'));
    if (items[_searchSelected]) items[_searchSelected].scrollIntoView({ block: 'nearest' });
}

function renderSearchResults(query) {
    const list = document.getElementById('globalSearchResults');
    if (!list) return;
    const q = normalizeForSearch(query.trim());
    const results = [];

    Object.entries(VIEW_META).forEach(([id, meta]) => {
        if (id === 'hubView') return;
        const label = id === 'formView' || id === 'mangaFormView' ? `Registrar ${meta.label.toLowerCase()}` : meta.label;
        if (!q || normalizeForSearch(label + ' ' + meta.desc).includes(q)) {
            results.push({ kind: 'Sección', icon: meta.icon, title: label, sub: meta.desc, href: buildHash(id) });
        }
    });

    if (q.length >= 2) {
        const animes = _masterData.filter(a => normalizeForSearch(a.anime).includes(q)).slice(0, 8);
        animes.forEach(a =>
            results.push({
                kind: 'Anime',
                icon: '📺',
                title: a.anime,
                sub: `${seasonLabel(a.season)} ${a.year} · ${a.studio || ''} · ${a.score}⭐`,
                href: buildHash('detailView', { q: a.anime })
            })
        );
        const mangas = _mangaData.filter(m => normalizeForSearch(m.manga).includes(q)).slice(0, 8);
        mangas.forEach(m =>
            results.push({
                kind: 'Manga',
                icon: '📖',
                title: m.manga,
                sub: `${m.year} · ${m.author} · ${m.score}⭐`,
                href: buildHash('mangaLibraryView', { q: m.manga })
            })
        );
    }

    // Con texto, primero tus obras y luego las secciones.
    if (q) results.sort((a, b) => (a.kind === 'Sección') - (b.kind === 'Sección'));
    const shown = results.slice(0, q ? 14 : 8);
    _searchSelected = 0;
    list.innerHTML = shown.length
        ? shown
              .map(
                  (r, i) => `
        <li><a class="search-result" role="option" aria-selected="${i === 0}" href="${r.href}">
            <span class="search-result-icon" aria-hidden="true">${r.icon}</span>
            <span class="search-result-text"><span class="search-result-title">${esc(r.title)}</span><span class="search-result-sub">${esc(r.sub)}</span></span>
            <span class="search-result-kind">${r.kind}</span>
        </a></li>`
              )
              .join('')
        : `<li class="search-empty">Sin resultados para "${esc(query)}"${_masterData.length ? '' : ' (cargando tus listas…)'}</li>`;
}

document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        if (document.body.classList.contains('auth-locked')) return;
        e.preventDefault();
        openGlobalSearch();
    }
});
