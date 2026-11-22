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
    .listen(8776);
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
// 10 animes: ids 1..9 vinculados, 1 sin vincular
const MASTER = [
    ['Frieren', 'Fall', 2023, 'Madhouse', 10, 1],
    ['Bocchi', 'Fall', 2022, 'CloverWorks', 9, 2],
    ['Mob Psycho', 'Summer', 2016, 'Bones', 9, 3],
    ['Anime Flojo', 'Spring', 2023, 'Madhouse', 4, 4],
    ['Dandadan', 'Fall', 2024, 'Science SARU', 9, 5],
    ['Sobrevalorado', 'Winter', 2024, 'MAPPA', 5, 6],
    ['Kaiju', 'Spring', 2024, 'Production I.G', 7, 7],
    ['Madhouse 3', 'Winter', 2023, 'Madhouse', 8, 8],
    ['Madhouse 4', 'Summer', 2022, 'Madhouse', 7, 9],
    ['Sin Vincular', 'Fall', 2024, 'X', 6, null]
].map(([anime, season, year, studio, score, id], i) => ({ anime, season, year, studio, score, anilistid: id || '', _row: i + 3 }));
const META = {
    1: [9.1, ['Adventure', 'Drama', 'Fantasy']],
    2: [8.8, ['Comedy', 'Music']],
    3: [8.5, ['Action', 'Comedy']],
    4: [7.9, ['Drama']],
    5: [8.4, ['Action', 'Comedy']],
    6: [8.6, ['Action', 'Drama']],
    7: [7.2, ['Action', 'Sci-Fi']],
    8: [7.5, ['Drama']],
    9: [7.0, ['Comedy']]
};

(async () => {
    const browser = await chromium.launch();
    for (const vp of [
        { n: 'movil', width: 390, height: 844 },
        { n: 'escritorio', width: 1280, height: 900 }
    ]) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
        await context.route(/fonts\./, r => r.fulfill({ status: 200, body: '' }));
        await context.route(/cdnjs/, r =>
            r.fulfill({
                status: 200,
                contentType: 'text/javascript',
                body: 'window.html2canvas = (el) => { window.__wrappedHTML = el.outerHTML; const c = document.createElement("canvas"); c.width = 36; c.height = 64; return Promise.resolve(c); };'
            })
        );
        await context.route(/script\.google\.com/, r => {
            const u = new URL(r.request().url());
            const cb = u.searchParams.get('callback');
            const sh = u.searchParams.get('sheet');
            r.fulfill({
                status: 200,
                contentType: 'text/javascript',
                body: `${cb}(${JSON.stringify(u.searchParams.get('action') === 'ping' ? { status: 'success', auth: 'ok' } : { status: 'success', data: sh === 'FULL LIST MANGA' ? [{ 'Manga Title': 'Berserk', Year: 2023, Author: 'Miura', Score: 10 }] : sh ? [] : MASTER })})`
            });
        });
        let metaCalls = 0;
        await context.route(/graphql\.anilist/, r => {
            const { query, variables } = JSON.parse(r.request().postData());
            let data = {};
            if (query.includes('averageScore genres format')) {
                metaCalls++;
                data = {
                    Page: { media: variables.ids.map(id => ({ id, averageScore: META[id][0] * 10, genres: META[id][1], format: 'TV' })) }
                };
            } else if (query.includes('coverImage { large } } } }'))
                data = { Page: { media: (variables.ids || []).map(id => ({ id, coverImage: { large: '' } })) } };
            r.fulfill({
                status: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                contentType: 'application/json',
                body: JSON.stringify({ data })
            });
        });
        await context.addInitScript(() => {
            try {
                localStorage.setItem('otaku_hub_access_key', 'k');
            } catch (e) {}
        });
        await page.goto('http://localhost:8776/#/perfil');
        await page.waitForSelector('#insightsContent:not([hidden]) .stat-tile', { timeout: 15000 });

        if (vp.n === 'movil') {
            const tiles = await page.$$eval('#insightsContent .insights-section >> nth=0 >> .stat-value', e => e.map(x => x.textContent));
            // media tuya (9 vinculados): (10+9+9+4+9+5+7+8+7)/9 = 7.56 ; mundo: (9.1+8.8+8.5+7.9+8.4+8.6+7.2+7.5+7.0)/9 = 8.11
            check('Tú frente al mundo: medias y diferencia correctas', tiles.join('|') === '7.6|8.1|−0.6|78%', tiles.join(' | '));
            const div = await page.$$eval('.viz-div-label', e => e.map(x => x.textContent));
            check(
                'Donde más discrepas: primero tu opinión más generosa, al final la más dura',
                div[0] === 'Frieren' && div[div.length - 1] === 'Anime Flojo' && div.includes('Sobrevalorado'),
                div.join(', ')
            );
            check(
                'Aviso: 1 anime sin vincular, con botón para vincular',
                (await page.textContent('.insights-note')).includes('9 de tus 10')
            );
            const genres = await page.$$eval('.viz-ranked-label', e => e.map(x => x.textContent));
            check(
                'Géneros ordenados por cantidad (en español; Drama, Comedia y Acción empatan a 4)',
                ['Drama', 'Comedia', 'Acción'].includes(genres[0]) && (await page.textContent('.viz-ranked-value')).startsWith('4 ·'),
                genres.join(', ')
            );
            check('Evolución: línea con un punto por año (2016, 2022-2024)', (await page.$$('.viz-svg .viz-dot')).length === 4);
            check('Evolución: columnas aparte (sin doble eje)', (await page.$$('.viz-cols .viz-col')).length === 4);
            check('Mapa de calor: casillas con datos', (await page.$$('.viz-heat-cell[tabindex]')).length === 9);
            // Tooltip con teclado
            await page.focus('.viz-heat-cell[tabindex] >> nth=0');
            await page.waitForTimeout(150);
            check(
                'Tooltip también con teclado (foco)',
                !(await page.$eval('.viz-tooltip', t => t.hidden)) && (await page.textContent('.viz-tooltip')).includes('Media')
            );
            await page.click('.viz-table summary >> nth=0');
            check(
                'Cada gráfico tiene su tabla equivalente',
                (await page.$$('.viz-table')).length >= 5 && (await page.textContent('.viz-table table >> nth=0')).includes('Frieren')
            );
            check('Los datos de AniList se piden una vez (9 IDs, 1 consulta)', metaCalls === 1, `${metaCalls}`);
            await page.screenshot({ path: `${SHOTS}/4b-perfil-movil.png`, fullPage: true });
            // Overflow
            check(
                'Tu perfil no desborda en horizontal en móvil',
                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
            );
            await page.click('.viz-div-row >> nth=0');
            await page.waitForSelector('.work-sheet');
            check('Tocar una barra abre la ficha de la obra', (await page.textContent('.work-sheet-title')) === 'Frieren');
            await page.keyboard.press('Escape');

            // Página de estudio
            check(
                'La tarjeta de estudio abre su página',
                fs.readFileSync(ROOT + '/js/views/studios.js', 'utf8').includes('onclick="openStudioSheet(${jsArg(studio.name)})"')
            );
            await page.evaluate(() => openStudioSheet('Madhouse'));
            await page.waitForSelector('#studioSheetTitle');
            const st = (await page.textContent('#workSheetOverlay .work-sheet')).replace(/\s+/g, ' ');
            check(
                'Página de estudio: Madhouse, 4 animes, mejor y peor',
                st.includes('Madhouse') &&
                    st.includes('4animes vistos') &&
                    st.includes('Mejor: Frieren') &&
                    st.includes('Peor: Anime Flojo'),
                st.slice(0, 160)
            );
            await page.screenshot({ path: `${SHOTS}/4b-estudio-movil.png` });
            await page.click('.studio-work >> nth=1');
            await page.waitForSelector('#workSheetTitle');
            check('Desde el estudio se abre la ficha de una obra', (await page.textContent('#workSheetTitle')).length > 0);
            await page.keyboard.press('Escape');

            // Wrapped
            await page.evaluate(() => {
                location.hash = '#/capsula';
            });
            await page.waitForSelector('#tmYearSelect option[value="2023"]', { state: 'attached' });
            await page.selectOption('#tmYearSelect', '2023');
            await page.click('#btnWrapped');
            await page.waitForSelector('.wrapped-preview', { timeout: 10000 });
            check(
                'Wrapped: se genera y se puede descargar',
                (await page.getAttribute('.wrapped-preview a[download]', 'download')) === 'OtakuHub_Wrapped_2023.png'
            );
            await page.waitForFunction(() => document.querySelector('.wrapped-preview img').naturalWidth > 0);
            const wr = await page.evaluate(() => ({
                w: document.querySelector('.wrapped-preview img').naturalWidth,
                h: document.querySelector('.wrapped-preview img').naturalHeight,
                L: window._lastWrappedLayout
            }));
            check(
                'Wrapped: imagen 1080×1920 dibujada en canvas, sin solapes',
                wr.w === 1080 && wr.h === 1920 && wr.L.topBottom + 30 <= wr.L.factsTop,
                JSON.stringify(wr)
            );
            check(
                'Wrapped: si las portadas no se descargan, avisa (y dibuja huecos)',
                (await page.textContent('#toastRegion')).includes('no se pudieron descargar')
            );
            await page.keyboard.press('Escape');
            check('Escape cierra la vista previa', !(await page.$('.wrapped-overlay')));
        } else {
            await page.screenshot({ path: `${SHOTS}/4b-perfil-escritorio.png`, fullPage: true });
        }
        await context.close();
    }
    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
