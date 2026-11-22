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
    .listen(8775);
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
const MASTER = [
    { anime: 'Frieren', season: 'Fall', year: 2023, studio: 'Madhouse', score: 10, anilistid: 154587, _row: 3 },
    { anime: 'Bocchi the Rock!', season: 'Fall', year: 2022, studio: 'CloverWorks', score: 9, anilistid: 130003, _row: 4 },
    { anime: 'Mob Psycho 100', season: 'Summer', year: 2016, studio: 'Bones', score: 9, anilistid: 21507, _row: 5 }
];
const tabs = { RANKING_ANUAL_2024: [{ id: 'x', name: 'Bocchi the Rock!', score: 9 }] };

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const posts = [],
        anilistBodies = [];
    page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
    page.on('dialog', d => {
        results.push('⚠️ diálogo nativo');
        d.accept();
    });
    await context.route(/cdnjs|fonts\./, r => r.fulfill({ status: 200, body: '' }));
    await context.route(/script\.google\.com/, r => {
        const req = r.request();
        const cors = { 'Access-Control-Allow-Origin': '*' };
        if (req.method() === 'POST') {
            const body = JSON.parse(req.postData());
            posts.push(body);
            if (body.action === 'read')
                return r.fulfill({
                    status: 200,
                    headers: cors,
                    contentType: 'application/json',
                    body: JSON.stringify({ status: 'success', data: !body.sheet ? MASTER : tabs[body.sheet] || [] })
                });
            if (body.action === 'list_tabs')
                return r.fulfill({
                    status: 200,
                    headers: cors,
                    contentType: 'application/json',
                    body: JSON.stringify({ status: 'success', data: Object.keys(tabs).sort().reverse() })
                });
            if (body.action === 'updateTab') tabs[body.tabName] = body.payload;
            return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"status":"success"}' });
        }
        const u = new URL(req.url());
        const cb = u.searchParams.get('callback');
        r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}({"status":"success","auth":"ok","version":4})` });
    });
    await context.route(/graphql\.anilist/, r => {
        const { query, variables } = JSON.parse(r.request().postData());
        anilistBodies.push({ query, variables });
        let data = {};
        const rec = (id, t, rating) => ({
            rating,
            mediaRecommendation: {
                id,
                title: { romaji: t },
                coverImage: { large: '' },
                season: 'SPRING',
                seasonYear: 2024,
                startDate: { year: 2024, month: 4 }
            }
        });
        if (query.includes('recommendations')) {
            Object.keys(variables).forEach(k => {
                const i = k.slice(1);
                data[`q${i}`] = {
                    media: [
                        {
                            recommendations: {
                                nodes: [
                                    rec(130003, 'Bocchi the Rock!', 500),
                                    rec(777, 'Recomendada Por Varios', 50),
                                    rec(800 + Number(i), 'Solo de uno ' + i, 60),
                                    rec(999, 'Oculta', 900)
                                ]
                            }
                        }
                    ]
                };
            });
        } else if (query.includes('POPULARITY_DESC')) {
            data = {
                Page: {
                    media: [
                        {
                            id: 154587,
                            title: { romaji: 'Sousou no Frieren' },
                            coverImage: {},
                            genres: ['Adventure'],
                            startDate: { year: 2023 }
                        },
                        {
                            id: 555,
                            siteUrl: 'https://anilist.co/anime/555',
                            title: { romaji: 'Gacha Nueva' },
                            coverImage: { large: '' },
                            genres: ['Drama'],
                            season: 'WINTER',
                            seasonYear: 2025,
                            startDate: { year: 2025, month: 1 },
                            description: 'x'
                        }
                    ]
                }
            };
        } else if (query.includes('nextAiringEpisode')) {
            data = {
                Page: {
                    media: [
                        {
                            id: 4242,
                            title: { romaji: 'En Emisión' },
                            episodes: null,
                            status: 'RELEASING',
                            nextAiringEpisode: { episode: 8 },
                            coverImage: { large: '' }
                        }
                    ]
                }
            };
        } else if (query.includes('Media(id: $id, type: ANIME)')) {
            data = {
                Media: {
                    id: 4242,
                    title: { romaji: 'En Emisión' },
                    season: 'FALL',
                    seasonYear: 2026,
                    startDate: { year: 2026, month: 10 },
                    studios: { nodes: [{ name: 'MAPPA' }] }
                }
            };
        }
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
            localStorage.setItem('discover_hidden', '[999]');
        } catch (e) {}
    });

    // ===== Ranking Anual: archivar y consultar años =====
    await page.goto('http://localhost:8775/#/ranking-anual');
    await page.waitForSelector('#annualYearSelect option[value="2024"]', { state: 'attached' });
    check(
        'El selector muestra los años archivados en Sheets',
        (await page.$$eval('#annualYearSelect option', o => o.map(x => x.textContent))).join('|') === 'En curso|2024 (archivado)'
    );
    await page.selectOption('#annualYearSelect', '2024');
    await page.waitForTimeout(600);
    check(
        'Ver 2024: lista en solo lectura',
        (await page.textContent('#annualRankingList')).includes('Bocchi') &&
            !(await page.isVisible('#annualSearchInput')) &&
            !(await page.$('#annualRankingList .drag-handle'))
    );
    await page.click('button:has-text("Exportar Tierlist")');
    await page.waitForTimeout(200);
    check(
        'La tierlist del año archivado lleva su año',
        (await page.textContent('.tierlist-canvas-header')) === 'ANIMES COMPLETADOS EN 2024'
    );
    await page.evaluate(() => closeTierlistModal());
    await page.selectOption('#annualYearSelect', 'current');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
        _annualRanking = [
            { id: 1, name: 'Frieren', score: 10 },
            { id: 2, name: 'Mob Psycho 100', score: 9 }
        ];
        saveAnnualLocal();
        renderAnnualRankingList();
    });
    await page.click('#btnArchiveAnnual');
    await page.waitForSelector('#dialogNumber');
    await page.fill('#dialogNumber', '2025');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    const arch = posts.find(p => p.action === 'updateTab');
    check('Archivar envía la lista a RANKING_ANUAL_2025', arch && arch.tabName === 'RANKING_ANUAL_2025' && arch.payload.length === 2);
    check(
        '…y empieza una lista nueva (también en Sheets)',
        (await page.evaluate(() => _annualRanking.length)) === 0 && posts.some(p => p.action === 'save_annual' && p.payload.length === 0)
    );
    check('2025 aparece en el selector', (await page.$$eval('#annualYearSelect option', o => o.map(x => x.value))).includes('2025'));
    await page.screenshot({ path: `${SHOTS}/4a-anual.png` });

    // ===== Gacha =====
    await page.evaluate(() => {
        location.hash = '#/gacha';
    });
    await page.waitForTimeout(600);
    check(
        'Gacha tiene filtro de género en español',
        (await page.$$eval('#gachaGenre option', o => o.map(x => x.textContent))).includes('Ciencia ficción')
    );
    await page.selectOption('#gachaGenre', 'Drama');
    await page.click('.gacha-btn');
    await page.waitForSelector('.gacha-title');
    const gq = anilistBodies.filter(b => b.query.includes('POPULARITY_DESC')).pop();
    check('El género se envía a AniList (genre_in)', gq.query.includes('genre_in: [$genre]') && gq.variables.genre === 'Drama');
    check('No propone lo que ya tienes (Frieren por ID)', (await page.textContent('.gacha-title')) === 'Gacha Nueva');
    posts.length = 0;
    await page.click('button:has-text("Me interesa")');
    await page.waitForTimeout(500);
    const up = posts.find(p => p.action === 'upsert_rows');
    check(
        '"Me interesa" lo añade al Planificador con su temporada',
        up &&
            up.sheet === 'PLANIFICADOR_STATE' &&
            up.items[0].id === '555' &&
            up.items[0].season === 'Winter' &&
            up.items[0].year === 2025 &&
            up.items[0].status === 'interesa',
        JSON.stringify(up && up.items[0])
    );
    await page.click('button:has-text("No me interesa")');
    await page.waitForTimeout(400);
    check('"No me interesa" la oculta para siempre', await page.evaluate(() => hiddenDiscoveries().has(555)));

    // ===== Recomendaciones =====
    await page.evaluate(() => {
        location.hash = '#/recomendaciones';
    });
    await page.waitForSelector('#recomAnimeGrid .recom-card', { timeout: 15000 });
    const recTitles = await page.$$eval('#recomAnimeGrid .recom-card-title', e => e.map(x => x.textContent));
    const rq = anilistBodies.find(b => b.query.includes('recommendations') && b.query.includes('ANIME'));
    check(
        'Usa varios favoritos por ID en una sola consulta',
        rq && Object.keys(rq.variables).filter(k => k.startsWith('i')).length === 3,
        JSON.stringify(rq && rq.variables)
    );
    check('Lo recomendado por varios favoritos sale primero', recTitles[0] === 'Recomendada Por Varios', recTitles.join(' | '));
    check('Excluye lo que ya tienes y lo oculto', !recTitles.includes('Bocchi the Rock!') && !recTitles.includes('Oculta'));
    check('Explica por qué ("Por …")', (await page.textContent('#recomAnimeGrid .recom-card >> nth=0')).includes('Por '));
    await page.screenshot({ path: `${SHOTS}/4a-recom.png` });

    // ===== Calificador: anime en emisión y registro =====
    await page.evaluate(() => {
        location.hash = '#/calificador';
    });
    await page.waitForTimeout(500);
    await page.fill('#calificadorSearchInput', 'emision');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#calificadorResultsGrid .recom-card');
    check('Muestra que está en emisión', (await page.textContent('#calificadorResultsGrid')).includes('En emisión (van 7)'));
    await page.click('#calificadorResultsGrid .recom-card');
    await page.waitForSelector('#dialogNumber');
    check('Pregunta el total de episodios (no asume 12)', (await page.inputValue('#dialogNumber')) === '12');
    await page.fill('#dialogNumber', '6');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check(
        'Crea los hitos para 6 episodios (2 hitos)',
        await page.evaluate(() => _calificadorCurrentScores.length === 2 && _calificadorCurrentId === 'al-4242')
    );
    await page.evaluate(() => {
        [0, 1].forEach(i => {
            openCalificadorForm(i);
            _tempCalificadorAnswers = [10, 7.5, 7.5, 10];
            submitCalificadorForm();
        });
    });
    check(
        'Con el hito final hecho, propone la nota (9)',
        (await page.textContent('#calificadorFinalProposal')).includes('9/10') && (await page.isVisible('#calificadorFinalProposal'))
    );
    await page.screenshot({ path: `${SHOTS}/4a-calificador.png` });
    // Cambiar episodios conserva lo hecho
    await page.evaluate(() => {
        promptNumberDialog = async () => 9;
    });
    await page.evaluate(() => changeCalificadorEpisodes());
    await page.waitForTimeout(200);
    const ch = await page.evaluate(() =>
        _calificadorCurrentScores.map(c => `${c.ep}${c.isFinal ? 'F' : ''}${c.completed ? '✓' : ''}`).join(',')
    );
    check('Cambiar a 9 episodios conserva el hito 3 y rehace el final', ch === '3✓,6,9F', ch);
    await page.evaluate(() => {
        openCalificadorForm(2);
        _tempCalificadorAnswers = [10, 7.5, 7.5, 10];
        submitCalificadorForm();
    });
    posts.length = 0;
    await page.click('button:has-text("Registrar en mi lista")');
    await page.waitForTimeout(800);
    check(
        'Registrar guarda antes el progreso del Calificador',
        posts.some(p => p.action === 'upsert_rows' && p.sheet === 'CALIFICADOR_STATE')
    );
    const form = await page.evaluate(() => {
        const v = id => document.getElementById(id).value;
        return {
            title: v('anime'),
            score: v('score'),
            season: v('season'),
            year: v('year'),
            studio: v('studio'),
            sel: _selectedAnimeMedia
        };
    });
    check(
        'Formulario relleno con datos de AniList y su ID',
        form.title === 'En Emisión' &&
            form.season === 'Fall' &&
            form.year === '2026' &&
            form.studio === 'MAPPA' &&
            form.sel &&
            form.sel.id === 4242,
        JSON.stringify(form)
    );

    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
