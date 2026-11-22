const { chromium } = require('playwright');
const http = require('http'),
    fs = require('fs'),
    path = require('path');
const { ROOT } = require('../helpers');
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
    .listen(8767);

const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
const MASTER = () => [
    { anime: 'Frieren', season: 'Fall', year: 2023, studio: 'Madhouse', score: 10, anilistid: 154587, _row: 3 },
    { anime: 'Bocchi the Rock!', season: 'Fall', year: 2022, studio: 'CloverWorks', score: 9, _row: 4 },
    { anime: 'Titulo Rarisimo', season: 'Fall', year: 2022, studio: 'X', score: 6, _row: 5 }
];

async function scenario(version) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const posts = [],
        jsonpUrls = [],
        anilistQueries = [],
        dialogs = [];
    page.on('dialog', d => {
        dialogs.push(d.message());
        d.accept();
    });
    page.on('pageerror', e => results.push(`⚠️ [v${version}] pageerror: ${e.message}`));
    await page.route(/cdnjs/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.route(/script\.google\.com/, async route => {
        const req = route.request();
        const cors = { 'Access-Control-Allow-Origin': '*' };
        if (req.method() === 'POST') {
            const body = JSON.parse(req.postData());
            posts.push(body);
            if (body.action === 'read')
                return route.fulfill({
                    status: 200,
                    headers: cors,
                    contentType: 'application/json',
                    body: JSON.stringify({ status: 'success', data: body.sheet ? [] : MASTER() })
                });
            const extra = body.action === 'set_anilist_ids' ? { updated: body.items.length, skipped: 0 } : {};
            return route.fulfill({
                status: 200,
                headers: cors,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'success', ...extra })
            });
        }
        const u = new URL(req.url());
        jsonpUrls.push(u.search);
        const cb = u.searchParams.get('callback');
        let resp;
        if (u.searchParams.get('action') === 'ping')
            resp = version >= 2 ? { status: 'success', auth: 'ok', version } : { status: 'success', auth: 'ok' };
        else
            resp = {
                status: 'success',
                data: u.searchParams.get('sheet')
                    ? []
                    : MASTER().map(m => {
                          if (version < 2) {
                              delete m._row;
                              delete m.anilistid;
                          }
                          return m;
                      })
            };
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}(${JSON.stringify(resp)})` });
    });
    await page.route(/graphql\.anilist\.co/, async route => {
        const { query, variables } = JSON.parse(route.request().postData());
        anilistQueries.push(query);
        let data = {};
        if (query.includes('id_in'))
            data = { Page: { media: variables.ids.map(id => ({ id, coverImage: { large: `https://img/${id}.jpg` } })) } };
        else if (query.includes('synonyms')) {
            Object.keys(variables).forEach((k, i) => {
                const t = variables[k];
                data[`q${i}`] = {
                    media:
                        t === 'Bocchi the Rock!'
                            ? [
                                  {
                                      id: 999,
                                      title: { romaji: 'Bocchi the Rock! Movie' },
                                      synonyms: [],
                                      startDate: { year: 2024 },
                                      seasonYear: 2024,
                                      season: 'SUMMER',
                                      studios: { nodes: [{ name: 'CloverWorks' }] }
                                  },
                                  {
                                      id: 130003,
                                      title: { romaji: 'Bocchi the Rock!' },
                                      synonyms: [],
                                      startDate: { year: 2022 },
                                      seasonYear: 2022,
                                      season: 'FALL',
                                      studios: { nodes: [{ name: 'CloverWorks' }] }
                                  }
                              ]
                            : [
                                  {
                                      id: 1,
                                      title: { romaji: 'Otra cosa' },
                                      synonyms: [],
                                      startDate: { year: 1999 },
                                      seasonYear: 1999,
                                      studios: { nodes: [] }
                                  }
                              ]
                };
            });
        } else if (query.includes('POPULARITY_DESC'))
            data = {
                Page: {
                    media: [
                        { id: 154587, title: { romaji: 'Sousou no Frieren' }, coverImage: {}, genres: [], startDate: {} },
                        { id: 777, title: { romaji: 'Nueva Serie' }, coverImage: {}, genres: [], startDate: {}, description: 'x' }
                    ]
                }
            };
        else if (query.includes('Page(page:') || query.includes('Page(page: $page'))
            data = {
                Page: {
                    pageInfo: { hasNextPage: false },
                    media: [
                        {
                            id: 154587,
                            title: { romaji: 'Sousou no Frieren', english: 'Frieren' },
                            coverImage: { large: 'c' },
                            relations: { edges: [] }
                        },
                        { id: 5555, title: { romaji: 'Otra de Temporada' }, coverImage: { large: 'c' }, relations: { edges: [] } }
                    ]
                }
            };
        else data = { Page: { media: [] } };
        return route.fulfill({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            contentType: 'application/json',
            body: JSON.stringify({ data })
        });
    });
    await page.addInitScript(() => localStorage.setItem('otaku_hub_access_key', 'test-key'));
    await page.goto('http://localhost:8767/');
    const V = `[v${version}]`;

    await page.evaluate(() => switchView('detailView'));
    await page.waitForSelector('.detail-card');
    await page.waitForTimeout(1500);

    if (version >= 2) {
        check(
            `${V} Lecturas por POST (action read)`,
            posts.some(p => p.action === 'read')
        );
        check(
            `${V} La clave solo va en la URL del ping`,
            jsonpUrls.every(q => q.includes('action=ping')),
            jsonpUrls.join(' | ')
        );
        check(
            `${V} anilistId leído de la hoja`,
            await page.evaluate(() => _masterData[0].anilistId === 154587 && _masterData[1].anilistId === null)
        );
        check(
            `${V} Portada de Frieren pedida por ID (id_in)`,
            anilistQueries.some(q => q.includes('id_in'))
        );
        check(
            `${V} La imagen usa la portada por ID`,
            await page.evaluate(() => [...document.querySelectorAll('.detail-card img')].some(i => i.src === 'https://img/154587.jpg'))
        );
    } else {
        check(
            `${V} Lecturas por JSONP como antes`,
            jsonpUrls.some(q => !q.includes('action=ping')) && !posts.some(p => p.action === 'read')
        );
    }

    // Registrar anime eligiendo de la búsqueda -> lleva anilistId
    await page.evaluate(() => {
        switchView('formView');
        _selectedAnimeMedia = { id: 171018, title: 'Dandadan' };
        document.getElementById('anime').value = 'Dandadan';
        document.getElementById('studio').value = 'Science SARU';
    });
    await page.click('#submitBtn');
    await page.waitForFunction(() => document.getElementById('statusMsg').innerText.length > 0);
    const reg = posts.find(p => p.anime === 'Dandadan');
    check(`${V} Registro envía anilistId`, reg && reg.anilistId === 171018 && reg.action === undefined);
    await page.evaluate(() => {
        _selectedAnimeMedia = { id: 1, title: 'A' };
        const i = document.getElementById('anime');
        i.value = 'B';
        i.dispatchEvent(new Event('input'));
    });
    check(`${V} Editar el título a mano descarta el ID`, await page.evaluate(() => _selectedAnimeMedia === null));

    // Planificador
    await page.evaluate(() => switchView('planificadorView'));
    await page.waitForFunction(() => document.getElementById('planificadorContent').style.display === 'block');
    await page.evaluate(() => loadSeasonPlanificador());
    await page.waitForSelector('.plan-card');
    await page.waitForTimeout(1600); // auto-visto de Frieren (por ID: el título romaji no coincide)
    const autoVisto = await page.evaluate(() => _planificadorSavedProgress.some(p => p.id === '154587' && p.status === 'visto'));
    check(`${V} Planificador marca "visto" por ID aunque el título difiera`, version >= 2 ? autoVisto : true);
    posts.length = 0;
    await page.evaluate(() => updateSeasonPlanStatus('5555', 'interesa'));
    await page.waitForTimeout(1700);
    await page.evaluate(() => updateSeasonPlanStatus('5555', 'default'));
    await page.waitForTimeout(1700);
    if (version >= 2) {
        const up = posts.find(p => p.action === 'upsert_rows');
        check(
            `${V} Cambio de estado = upsert de 1 fila`,
            up && up.items.length === 1 && up.items[0].id === '5555' && up.sheet === 'PLANIFICADOR_STATE',
            JSON.stringify(up && up.items)
        );
        check(
            `${V} Desmarcar = delete_rows`,
            posts.some(p => p.action === 'delete_rows' && p.ids[0] === '5555')
        );
        check(`${V} Ya no reescribe la hoja entera`, !posts.some(p => p.action === 'save_planificador'));
    } else {
        check(
            `${V} Planificador usa save_planificador (compatible)`,
            posts.filter(p => p.action === 'save_planificador').length >= 2 &&
                !posts.some(p => p.action === 'upsert_rows' || p.action === 'delete_rows')
        );
    }

    // Calificador
    posts.length = 0;
    await page.evaluate(() => {
        switchView('calificadorView');
        loadCalificadorTracker('X', 6, 'c');
        saveCurrentCalificadorToCloud();
    });
    await page.waitForTimeout(800);
    check(
        `${V} Calificador guarda con ${version >= 2 ? 'upsert_rows' : 'save_calificador'}`,
        posts.some(p => p.action === (version >= 2 ? 'upsert_rows' : 'save_calificador'))
    );

    // Gacha excluye lo que ya tienes (por ID en v2)
    await page.evaluate(() => {
        switchView('gachaView');
    });
    await page.waitForTimeout(500);
    const picks = new Set();
    for (let i = 0; i < 6; i++) {
        await page.evaluate(() => pullGacha());
        await page.waitForSelector('.gacha-title');
        picks.add(await page.textContent('.gacha-title'));
    }
    if (version >= 2)
        check(`${V} Gacha nunca propone Frieren (ya registrado, título distinto)`, !picks.has('Sousou no Frieren'), [...picks].join(','));

    // Vincular
    posts.length = 0;
    dialogs.length = 0;
    await page.evaluate(() => {
        switchView('statsView');
    });
    await page.evaluate(() => startAnilistLinking());
    if (version >= 2) {
        await page.waitForFunction(() => document.getElementById('linkOverlay')?.dataset.finished === '1', null, { timeout: 30000 });
        const link = posts.find(p => p.action === 'set_anilist_ids');
        check(
            `${V} Vincular elige el candidato correcto (no la película)`,
            link && link.items.length === 1 && link.items[0].id === 130003 && link.items[0].row === 4,
            JSON.stringify(link && link.items)
        );
        const txt = await page.textContent('#linkResult');
        check(
            `${V} Lo dudoso queda listado, no se adivina`,
            txt.includes('Titulo Rarisimo') && txt.includes('Vinculados: 1'),
            txt.replace(/\s+/g, ' ').slice(0, 120)
        );
    } else {
        await page.waitForTimeout(500);
        check(`${V} Vincular avisa de actualizar el Apps Script`, (await page.textContent('#toastRegion')).includes('docs/APPS-SCRIPT.md'));
    }

    if (version < 2) {
        const NEW = ['read', 'upsert_rows', 'delete_rows', 'set_anilist_ids'];
        check(`${V} NUNCA se envía una acción nueva a un backend antiguo`, !posts.some(p => NEW.includes(p.action)));
    }
    await browser.close();
}

async function lockoutTest() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route(/cdnjs/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.route(/script\.google\.com/, r => {
        const cb = new URL(r.request().url()).searchParams.get('callback');
        r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}({"status":"error","message":"UNAUTHORIZED"})` });
    });
    await page.addInitScript(() => {
        if (!sessionStorage.getItem('init')) {
            sessionStorage.setItem('init', 1);
            localStorage.setItem('otaku_hub_auth_lock_until', String(Date.now() + 25 * 86400e3));
        }
    });
    await page.goto('http://localhost:8767/');
    const lockedUntil = await page.evaluate(() => parseInt(localStorage.getItem('otaku_hub_auth_lock_until')) - Date.now());
    check(
        'Bloqueo antiguo de 30 días se reduce a 24 h como máximo',
        lockedUntil <= 24 * 3600e3 + 1000,
        `${Math.round(lockedUntil / 3600e3)} h`
    );
    await page.evaluate(() => {
        localStorage.clear();
    });
    await page.reload();
    for (let i = 0; i < 3; i++) {
        await page.fill('#authKeyInput', 'mala');
        await page.click('#authSubmit');
        await page.waitForTimeout(300);
    }
    const msg = await page.textContent('#authMsg');
    const wait = await page.evaluate(() => parseInt(localStorage.getItem('otaku_hub_auth_lock_until')) - Date.now());
    check('3 fallos → espera de 1 minuto (no 30 días)', wait > 50e3 && wait <= 60e3 && (await page.isDisabled('#authKeyInput')), msg);
    await page.evaluate(() => localStorage.setItem('otaku_hub_auth_lock_until', String(Date.now() - 1)));
    await page.reload();
    await page.fill('#authKeyInput', 'mala');
    await page.click('#authSubmit');
    await page.waitForTimeout(300);
    const wait2 = await page.evaluate(() => parseInt(localStorage.getItem('otaku_hub_auth_lock_until')) - Date.now());
    check('Siguiente fallo tras la espera → 5 minutos', wait2 > 4 * 60e3 && wait2 <= 5 * 60e3, `${Math.round(wait2 / 1000)} s`);
    await browser.close();
}

(async () => {
    await scenario(1);
    await scenario(2);
    await lockoutTest();
    console.log(results.join('\n'));
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
