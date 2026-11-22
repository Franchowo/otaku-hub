const { chromium } = require('playwright');
const http = require('http'),
    fs = require('fs'),
    path = require('path');
const { ROOT, OUTPUT: SHOTS } = require('../helpers');
const server = http
    .createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        fs.readFile(path.join(ROOT, p), (e, d) => {
            if (e) {
                res.writeHead(404);
                return res.end();
            }
            const t = {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png'
            };
            res.writeHead(200, { 'Content-Type': t[path.extname(p)] || 'application/octet-stream' });
            res.end(d);
        });
    })
    .listen(8770);
const Y = new Date().getFullYear();
const MASTER = [
    { anime: 'Frieren', season: 'Fall', year: 2023, studio: 'Madhouse', score: 10 },
    { anime: 'Bocchi the Rock!', season: 'Fall', year: 2022, studio: 'CloverWorks', score: 9 },
    { anime: 'Dandadan', season: 'Fall', year: Y, studio: 'Science SARU', score: 9 },
    { anime: 'Kaiju', season: 'Spring', year: Y, studio: 'Production I.G', score: 7 }
];
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
const isActive = (page, id) => page.evaluate(id => document.getElementById(id).classList.contains('active'), id);

async function setup(browser, vp, withKey = true) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
    page.on('dialog', d => {
        results.push('⚠️ diálogo nativo: ' + d.message());
        d.accept();
    });
    await page.route(/cdnjs/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.route(/graphql\.anilist/, r =>
        r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"data":{}}' })
    );
    await page.route(/script\.google\.com/, r => {
        const u = new URL(r.request().url());
        const cb = u.searchParams.get('callback');
        const sh = u.searchParams.get('sheet');
        if (u.searchParams.get('action') === 'ping')
            return r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}({"status":"success","auth":"ok"})` });
        const data =
            sh === 'FULL LIST MANGA' ? [{ 'Manga Title': 'Berserk', Year: 1989, Author: 'Kentaro Miura', Score: 10 }] : sh ? [] : MASTER;
        r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}(${JSON.stringify({ status: 'success', data })})` });
    });
    if (withKey) await page.addInitScript(() => localStorage.setItem('otaku_hub_access_key', 'k'));
    return page;
}

(async () => {
    const browser = await chromium.launch();
    // --- MÓVIL ---
    let page = await setup(browser, { width: 390, height: 844 });
    await page.goto('http://localhost:8770/');
    await page.waitForFunction(() => document.querySelector('#hubSummary .summary-num'));
    await page.waitForFunction(
        () =>
            document.getElementById('hubSummary').textContent.includes('mangas') &&
            !document.getElementById('hubSummary').textContent.includes('–mangas')
    );
    const summary = (await page.innerText('#hubSummary')).replace(/\s+/g, ' ');
    check(
        'Hub muestra resumen (4 animes, 2 este año, lo mejor del año)',
        summary.includes('4 animes registrados') && summary.includes(`2 animes en ${Y}`) && summary.includes('Dandadan'),
        summary.slice(0, 170)
    );
    check('Barra inferior visible en móvil', await page.isVisible('#bottomNav'));
    check('Grupos de la cabecera ocultos en móvil', !(await page.isVisible('#groupNav')));
    await page.screenshot({ path: `${SHOTS}/2b-hub-movil.png` });

    await page.click('#bottomNav [data-group="coleccion"]');
    await page.waitForSelector('#detailView.active .detail-card');
    check('Grupo Colección abre #/anime', (await page.evaluate(() => location.hash)) === '#/anime');
    const pills = await page.$$eval('#subNav .subnav-link', a => a.map(x => x.textContent.trim()).join(' / '));
    check(
        'Pestañas del grupo: Anime, Manga, Favoritos',
        ['Anime', 'Manga', 'Favoritos'].every(t => pills.includes(t)),
        pills
    );
    await page.screenshot({ path: `${SHOTS}/2b-coleccion-movil.png` });

    await page.click('#subNav .subnav-link >> text=Manga');
    await page.waitForSelector('#mangaLibraryView.active .manga-book');
    await page.goBack();
    await page.waitForTimeout(300);
    check('Botón atrás vuelve a la vista anterior', await isActive(page, 'detailView'));
    await page.goBack();
    await page.waitForTimeout(300);
    check('…y otra vez atrás al hub', await isActive(page, 'hubView'));

    await page.click('#bottomNav [data-group="coleccion"]');
    await page.waitForTimeout(200);
    await page.click('#subNav .subnav-link >> text=Favoritos');
    await page.waitForTimeout(200);
    await page.click('#bottomNav [data-group="inicio"]');
    await page.waitForTimeout(200);
    await page.click('#bottomNav [data-group="coleccion"]');
    await page.waitForTimeout(300);
    check('El grupo recuerda la última pestaña (Favoritos)', (await page.evaluate(() => location.hash)) === '#/favoritos');

    await page.click('#bottomNav [data-group="registrar"]');
    await page.waitForTimeout(200);
    check('Botón + abre Registrar anime', await isActive(page, 'formView'));

    // Aviso de cambios sin guardar en el Calificador
    await page.evaluate(() => {
        location.hash = '#/calificador';
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        loadCalificadorTracker('X', 6, 'c');
        openCalificadorForm(0);
        submitCalificadorForm();
    });
    await page.click('#bottomNav [data-group="inicio"]');
    await page.waitForSelector('.dialog');
    check('Salir con cambios sin guardar pide confirmación', (await page.textContent('.dialog')).includes('Cambios sin guardar'));
    await page.click('.dialog [data-answer="no"]');
    await page.waitForTimeout(300);
    check(
        '"Seguir editando" se queda en el Calificador',
        (await page.evaluate(() => location.hash)) === '#/calificador' && (await isActive(page, 'calificadorView'))
    );
    await page.click('#bottomNav [data-group="inicio"]');
    await page.waitForSelector('.dialog');
    await page.click('.dialog [data-answer="yes"]');
    await page.waitForTimeout(300);
    check('"Salir sin guardar" navega', await isActive(page, 'hubView'));

    // Rutas con filtros
    await page.evaluate(() => {
        location.hash = '#/estadisticas?estudio=Madhouse';
    });
    await page.waitForTimeout(500);
    check(
        'Enlace #/estadisticas?estudio=Madhouse filtra',
        (await page.textContent('#kpiFilteredCount')) === '1' && (await page.inputValue('#filterStudio')) === 'Madhouse'
    );
    await page.evaluate(() => filterByStudioDirect('CloverWorks'));
    await page.waitForTimeout(500);
    check(
        'filterByStudioDirect usa la URL',
        (await page.evaluate(() => decodeURIComponent(location.hash))) === '#/estadisticas?estudio=CloverWorks' &&
            (await page.textContent('#kpiFilteredCount')) === '1'
    );

    // Búsqueda global
    await page.click('.header-actions .icon-btn[aria-label="Buscar en tu colección"]');
    await page.fill('#globalSearchInput', 'frie');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/2b-busqueda-movil.png` });
    const first = (await page.textContent('.search-result')).replace(/\s+/g, ' ').trim();
    check('La búsqueda encuentra Frieren primero', first.includes('Frieren'), first);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    check(
        'Enter abre Anime filtrado por el título',
        (await page.evaluate(() => decodeURIComponent(location.hash))) === '#/anime?q=Frieren' &&
            (await page.$$('#detailGridContainer .detail-card')).length === 1
    );
    await page.keyboard.press('Control+k');
    await page.fill('#globalSearchInput', 'berserk');
    await page.waitForTimeout(200);
    check('Ctrl+K abre la búsqueda y encuentra mangas', (await page.textContent('#globalSearchResults')).includes('Berserk'));
    await page.keyboard.press('Escape');
    check('Escape cierra la búsqueda', !(await page.$('#searchOverlay')));
    await page.close();

    // --- ESCRITORIO ---
    page = await setup(browser, { width: 1280, height: 860 });
    await page.goto('http://localhost:8770/#/ranking-anual');
    await page.waitForTimeout(800);
    check('Abrir la app en #/ranking-anual va directo a esa vista', await isActive(page, 'annualRankingView'));
    check(
        'Cabecera con grupos en escritorio; sin barra inferior',
        (await page.isVisible('#groupNav')) && !(await page.isVisible('#bottomNav'))
    );
    await page.screenshot({ path: `${SHOTS}/2b-rankings-escritorio.png` });
    await page.goto('http://localhost:8770/#/');
    await page.waitForFunction(() => document.querySelector('#hubSummary .summary-num'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/2b-hub-escritorio.png`, fullPage: true });
    await page.close();

    // --- Sin clave: login y carga ---
    page = await setup(browser, { width: 390, height: 844 }, false);
    await page.goto('http://localhost:8770/');
    await page.fill('#authKeyInput', 'clave');
    await page.click('#authSubmit');
    const loaded = await page
        .waitForFunction(() => document.querySelector('#hubSummary .summary-num'), null, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
    check('Tras introducir la clave, el hub carga los datos', loaded);
    await page.close();

    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
