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
    .listen(8777);
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
const MASTER = [
    { anime: 'Frieren', season: 'Fall', year: 2023, studio: 'Madhouse', score: 10, anilistid: 154587, _row: 3 },
    { anime: 'Ya "Registrado"; con;', season: 'Fall', year: 2022, studio: 'X', score: 8, _row: 4 }
];
const PLAN = [
    { id: '171018', year: 2026, season: 'Fall', title: 'Dandadan 2', cover: '', status: 'viendo' },
    { id: '999', year: 2026, season: 'Fall', title: 'No', cover: '', status: 'no_ver' }
];

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await context.newPage();
    const posts = [],
        anilist = [];
    page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
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
                    body: JSON.stringify({
                        status: 'success',
                        data: !body.sheet ? MASTER : body.sheet === 'PLANIFICADOR_STATE' ? PLAN : []
                    })
                });
            return r.fulfill({
                status: 200,
                headers: cors,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'success', inserted: (body.items || []).length })
            });
        }
        const u = new URL(req.url());
        const cb = u.searchParams.get('callback');
        r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}({"status":"success","auth":"ok","version":5})` });
    });
    await context.route(/graphql\.anilist/, r => {
        const { query, variables } = JSON.parse(r.request().postData());
        anilist.push({ query, variables });
        let data = {};
        if (query.includes('airingSchedules')) {
            const now = Math.floor(Date.now() / 1000);
            data = {
                Page: {
                    airingSchedules: [
                        {
                            episode: 5,
                            airingAt: now + 3600 * 3,
                            media: { id: 171018, title: { romaji: 'Dandadan 2' }, coverImage: { large: '' } }
                        },
                        { episode: 6, airingAt: now + 86400 * 7, media: { id: 171018, title: { romaji: 'Dandadan 2' }, coverImage: {} } }
                    ]
                }
            };
        } else if (query.includes('MediaListCollection')) {
            data =
                variables.user === 'nadie'
                    ? null
                    : {
                          MediaListCollection: {
                              lists: [
                                  {
                                      entries: [
                                          {
                                              score: 9,
                                              media: {
                                                  id: 154587,
                                                  title: { romaji: 'Sousou no Frieren' },
                                                  startDate: { year: 2023, month: 9 },
                                                  season: 'FALL',
                                                  seasonYear: 2023,
                                                  studios: { nodes: [{ name: 'Madhouse' }] }
                                              }
                                          },
                                          {
                                              score: 8.5,
                                              media: {
                                                  id: 21,
                                                  title: { romaji: 'One Piece' },
                                                  startDate: { year: 1999, month: 10 },
                                                  season: 'FALL',
                                                  seasonYear: 1999,
                                                  studios: { nodes: [{ name: 'Toei Animation' }] }
                                              }
                                          },
                                          {
                                              score: 0,
                                              media: {
                                                  id: 22,
                                                  title: { romaji: 'Sin Nota' },
                                                  startDate: { year: 2010, month: 2 },
                                                  season: null,
                                                  seasonYear: null,
                                                  studios: { nodes: [] }
                                              }
                                          }
                                      ]
                                  }
                              ]
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
            localStorage.setItem('discover_hidden', '[1,2,3]');
        } catch (e) {}
    });

    // ===== Hub: próximos episodios =====
    await page.goto('http://localhost:8777/');
    await page.waitForSelector('#hubUpcoming:not([hidden]) .upcoming-item', { timeout: 15000 });
    const up = await page.textContent('#hubUpcoming');
    check(
        'Próximos episodios: solo lo que estás viendo / te interesa',
        up.includes('Dandadan 2') && !up.includes('No'),
        up.replace(/\s+/g, ' ').slice(0, 100)
    );
    check(
        'Un episodio por anime, con "hoy" y la hora',
        (await page.$$('.upcoming-item')).length === 1 && /Episodio 5 · hoy \d\d:\d\d/.test(up)
    );
    check(
        'Se consulta AniList solo con los ids marcados',
        JSON.stringify(anilist.find(a => a.query.includes('airingSchedules')).variables.ids) === '[171018]'
    );
    await page.screenshot({ path: `${SHOTS}/4c-hub.png` });

    // ===== Tus datos =====
    await page.click('#subNav .subnav-link >> text=Tus datos');
    await page.waitForSelector('#dataView.active');
    check(
        'Tus datos muestra las obras ocultas y permite restablecerlas',
        (await page.textContent('#hiddenCount')).includes('3 obras ocultas')
    );
    await page.click('#btnResetHidden');
    check(
        'Restablecer ocultas (con deshacer)',
        (await page.evaluate(() => hiddenDiscoveries().size === 0)) && (await page.textContent('#toastRegion')).includes('Deshacer')
    );

    // CSV
    const [csvDl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Anime (CSV)")')]);
    const csv = fs.readFileSync(await csvDl.path(), 'utf8');
    check(
        'CSV de anime: BOM, ";" y comillas escapadas',
        csv.charCodeAt(0) === 0xfeff &&
            csv.includes('Anime;Temporada;Año;Estudio;Nota;AniList ID') &&
            csv.includes('"Ya ""Registrado""; con;";Otoño;2022'),
        csv.split('\r\n')[2]
    );
    // JSON
    const [jsonDl] = await Promise.all([page.waitForEvent('download'), page.click('#btnBackupJson')]);
    const backup = JSON.parse(fs.readFileSync(await jsonDl.path(), 'utf8'));
    check(
        'Copia completa JSON con todas las hojas',
        ['anime', 'manga', 'favoritos', 'top150', 'rankingAnual', 'planificador', 'calificador'].every(k => k in backup.sheets) &&
            backup.sheets.anime.length === 2 &&
            backup.sheets.planificador.length === 2,
        Object.keys(backup.sheets).join(',')
    );

    // Importar
    await page.fill('#importUser', 'nadie');
    await page.click('.import-form button[type="submit"]');
    await page.waitForTimeout(500);
    check('Usuario inexistente: mensaje claro', (await page.textContent('#importResults')).includes('No se encontró'));
    await page.fill('#importUser', 'franchowo');
    await page.click('.import-form button[type="submit"]');
    await page.waitForSelector('.import-row');
    const rows = await page.$$eval('.import-title', e => e.map(x => x.textContent));
    check('Importar: excluye lo que ya tienes (Frieren por ID)', rows.join('|') === 'One Piece|Sin Nota', rows.join(' | '));
    check(
        'Sin nota: desmarcada hasta que le pongas una',
        !(await page.isChecked('#imp1')) && (await page.textContent('#btnDoImport')).includes('Importar 1')
    );
    await page.fill('.import-score >> nth=1', '7');
    check(
        'Al poner nota se marca y suma',
        (await page.isChecked('#imp1')) && (await page.textContent('#btnDoImport')).includes('Importar 2')
    );
    await page.screenshot({ path: `${SHOTS}/4c-importar.png` });
    posts.length = 0;
    await page.click('#btnDoImport');
    await page.click('.dialog [data-answer="yes"]');
    await page.waitForTimeout(800);
    const batch = posts.find(p => p.action === 'register_batch');
    check(
        'register_batch con nota redondeada, temporada, estudio e ID',
        batch &&
            batch.target === 'anime' &&
            batch.items.length === 2 &&
            batch.items[0].anime === 'One Piece' &&
            batch.items[0].score === 9 &&
            batch.items[0].season === 'Fall' &&
            batch.items[0].year === 1999 &&
            batch.items[0].studio === 'Toei Animation' &&
            batch.items[0].anilistId === 21 &&
            batch.items[1].score === 7 &&
            batch.items[1].season === 'Winter',
        JSON.stringify(batch && batch.items)
    );
    check(
        'Tras importar, la lista queda vacía y avisa',
        (await page.textContent('#importResults')).includes('Ya tienes todo') &&
            (await page.textContent('#toastRegion')).includes('2 obras importadas')
    );

    // ===== Planificador: estados nuevos =====
    check(
        'Planificador: estados Viéndolo, En pausa y Abandonado en el filtro',
        (await page.$$eval('#planStatusFilter option', o => o.map(x => x.value))).join(',').includes('viendo,pausa,visto,abandonado')
    );

    // ===== Logros =====
    await page.evaluate(() => {
        location.hash = '#/perfil';
    });
    await page.waitForSelector('.achv', { timeout: 15000 });
    const achv = await page.$$eval('.achv-name', e => e.map(x => x.textContent));
    check(
        'Logros: 23 logros en 4 categorías (21 con barra de progreso)',
        achv.length === 23 &&
            (await page.$$('.achv-meter')).length === 21 &&
            (await page.$$eval('#insightsContent section:last-of-type h4', e => e.map(x => x.textContent.split(' ')[0]).join(','))) ===
                'Colección,Constancia,Criterio,Herramientas'
    );
    check(
        'Barra de progreso accesible (role=meter con valores)',
        (await page.getAttribute('.achv-meter >> nth=0', 'aria-valuenow')) === '2'
    );
    await page
        .locator('#insightsContent section')
        .last()
        .screenshot({ path: `${SHOTS}/4c-logros.png` });

    // Valores de los logros nuevos con datos sintéticos
    const v = await page.evaluate(() => {
        const Y = new Date().getFullYear();
        const mk = (anime, season, year, studio, score) => ({ anime, season, year, studio, score });
        _masterData = [
            mk('A', 'Fall', 2023, 'S1', 2),
            mk('B', 'Winter', 2024, 'S2', 3),
            mk('C', 'Spring', 2024, 'S3', 10),
            mk('D', 'Summer', 2024, 'S1, S4', 9),
            mk('E', 'Winter', 1995, 'S5', 8),
            mk('F', 'Spring', 1998, 'S5', 7),
            mk('G', 'Winter', Y, 'S6', 6),
            mk('H', 'Winter', Y, 'S6', 6),
            mk('I', 'Winter', Y, 'S6', 6)
        ];
        _mangaData = [];
        const items = [
            { score: 10, meta: { averageScore: 7.5, genres: [] } },
            { score: 9, meta: { averageScore: 7.0, genres: [] } },
            { score: 4, meta: { averageScore: 8.0, genres: [] } },
            { score: 6, meta: { averageScore: 7.0, genres: [] } }
        ];
        localStorage.setItem('ranker_data_v2', JSON.stringify({ items: [], result: ['x', 'y'] }));
        localStorage.setItem('annual_archive', JSON.stringify({ 2023: [], 2024: [] }));
        const extras = {
            calificador: [
                {
                    scores: JSON.stringify([
                        { isFinal: false, completed: true },
                        { isFinal: true, completed: true }
                    ])
                },
                { scores: [{ isFinal: true, completed: false }] },
                { scores: [{ isFinal: true, completed: true }] }
            ],
            planificador: [{ status: 'interesa' }, { status: 'visto' }, { status: 'default' }, { status: 'viendo' }]
        };
        return Object.fromEntries(computeAchievements(items, extras).map(a => [a.name, a.value]));
    });
    // Racha: Otoño 2023 → Invierno, Primavera, Verano 2024 = 4 (cruza de año). Coproducción "S1, S4" cuenta para ambos: 6 estudios.
    const expected = {
        'Coleccionista de estudios': 6,
        Arqueólogo: 2,
        'Al día': 3,
        'Racha de temporadas': 4,
        'Año completo': 1,
        'Mano dura': 2,
        Defensor: 2,
        Contracorriente: 1,
        Melómano: 1,
        Analista: 2,
        Archivero: 2,
        'Planificador nato': 3
    };
    const wrong = Object.entries(expected)
        .filter(([k, val]) => v[k] !== val)
        .map(([k, val]) => `${k}: ${v[k]} (esperado ${val})`);
    check(
        'Logros nuevos: cada valor se calcula bien (racha que cruza de año, coproducciones, hojas en texto JSON…)',
        wrong.length === 0,
        wrong.join('; ')
    );

    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
