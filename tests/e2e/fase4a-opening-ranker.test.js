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
    .listen(8774);
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
const MASTER = [{ anime: 'Frieren', season: 'Fall', year: 2023, studio: 'Madhouse', score: 10, anilistid: 154587, _row: 3 }];
const themesRequests = [];

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
    await context.route(/cdnjs|fonts\./, r => r.fulfill({ status: 200, body: '' }));
    await context.route(/script\.google\.com/, r => {
        const u = new URL(r.request().url());
        const cb = u.searchParams.get('callback');
        r.fulfill({
            status: 200,
            contentType: 'text/javascript',
            body: `${cb}(${JSON.stringify(u.searchParams.get('action') === 'ping' ? { status: 'success', auth: 'ok' } : { status: 'success', data: u.searchParams.get('sheet') ? [] : MASTER })})`
        });
    });
    await context.route(/graphql\.anilist/, r => {
        const { variables } = JSON.parse(r.request().postData());
        const data = {};
        Object.keys(variables).forEach((k, i) => {
            data[`q${i}`] = { media: variables[k] === 'Anime Fantasma' ? [] : [{ id: 1000 + i, coverImage: { large: '' } }] };
        });
        r.fulfill({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            contentType: 'application/json',
            body: JSON.stringify({ data })
        });
    });
    await context.route(/api\.animethemes\.moe/, r => {
        const url = decodeURIComponent(r.request().url());
        themesRequests.push(url);
        const id = (url.match(/external_id\]=(\d+)/) || [])[1];
        const anime =
            id === '154587'
                ? [
                      {
                          animethemes: [
                              {
                                  type: 'OP',
                                  sequence: 1,
                                  slug: 'OP1',
                                  song: { title: 'Yuusha', artists: [{ name: 'YOASOBI' }] },
                                  animethemeentries: [
                                      {
                                          videos: [
                                              { link: 'https://v.example/F-OP1-1080.webm', resolution: 1080 },
                                              { link: 'https://v.example/F-OP1-480.webm', resolution: 480 },
                                              { link: 'https://v.example/F-OP1-360.webm', resolution: 360 }
                                          ]
                                      }
                                  ]
                              },
                              { type: 'ED', sequence: 1, slug: 'ED1', song: { title: 'Anytime Anywhere' }, animethemeentries: [] },
                              {
                                  type: 'OP',
                                  sequence: 2,
                                  slug: 'OP2',
                                  song: { title: 'Haru', artists: [] },
                                  animethemeentries: [{ videos: [{ link: 'https://v.example/F-OP2.webm', resolution: 720 }] }]
                              }
                          ]
                      }
                  ]
                : id === '1000'
                  ? [
                        {
                            animethemes: [
                                {
                                    type: 'OP',
                                    sequence: 1,
                                    slug: 'OP1',
                                    song: { title: 'Seishun Complex' },
                                    animethemeentries: [{ videos: [{ link: 'https://v.example/B.webm', resolution: 720 }] }]
                                }
                            ]
                        }
                    ]
                  : [];
        r.fulfill({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            contentType: 'application/json',
            body: JSON.stringify({ anime })
        });
    });
    await context.addInitScript(() => {
        try {
            localStorage.setItem('otaku_hub_access_key', 'k');
        } catch (e) {}
    });

    await page.goto('http://localhost:8774/#/opening-ranker');
    await page.waitForTimeout(800);
    await page.fill('#input', 'Frieren\nBocchi the Rock!\nAnime Fantasma');
    await page.click('#btn-start-ranker');
    await page.waitForSelector('#step-2.active', { timeout: 20000 });
    const labels = await page.$$eval('#discard-list .ranker-title', e => e.map(x => x.textContent));
    check(
        'Encuentra OP1 y OP2 de Frieren (ignora el ED) y el OP de Bocchi',
        labels.join('|') === 'Frieren — OP1|Frieren — OP2|Bocchi the Rock! — OP1|Anime Fantasma',
        labels.join(' | ')
    );
    check(
        'Usa el ID de AniList de tu lista (Frieren 154587) y prueba la grafía "AniList"',
        themesRequests.some(u => u.includes('filter[site]=AniList&filter[external_id]=154587'))
    );
    const song = await page.textContent('#discard-list .ranker-card >> nth=0');
    check('Muestra canción y artista', song.includes('Yuusha') && song.includes('YOASOBI'));
    check(
        'Elige el vídeo de 480p (no 1080p) para ahorrar datos',
        (await page.evaluate(() => state.items[0].video)) === 'https://v.example/F-OP1-480.webm'
    );
    check(
        'Sin openings: enlace de búsqueda en YouTube',
        (await page.getAttribute('#discard-list .ranker-card >> nth=3 >> a', 'href')).includes(
            'youtube.com/results?search_query=Anime%20Fantasma'
        )
    );
    await page.click('#discard-list .ranker-card >> nth=0 >> text=▶ Escuchar');
    check(
        '▶ Escuchar inserta el vídeo',
        (await page.$eval('#discard-list video.opening-video', v => v.getAttribute('src'))) === 'https://v.example/F-OP1-480.webm'
    );
    await page.screenshot({ path: `${SHOTS}/4a-ranker-paso2.png` });

    // Algoritmo: 9 elementos con estrellas, oráculo con orden secreto
    const outcome = await page.evaluate(() => {
        state = emptyRankerState();
        const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
        const stars = { A: 3, B: 3, C: 3, D: 3, E: 3, F: 2, G: 2, H: 2, I: 1 };
        state.items = names.map(n => ({ id: n, anime: n, label: n, keep: true, stars: stars[n] }));
        const secret = ['D', 'A', 'E', 'C', 'B', 'H', 'F', 'G', 'I']; // orden "real"
        startDuels();
        let duels = 0,
            guard = 0;
        while (state.current && guard++ < 200) {
            const c = state.current,
                b = state.sorted[c.tier][Math.floor((c.lo + c.hi) / 2)];
            vote(secret.indexOf(c.id) < secret.indexOf(b));
            duels++;
        }
        return { result: state.result.join(''), duels, max: state.totalDuels };
    });
    check('Duelos: el ranking final coincide con el orden real', outcome.result === 'DAECBHFGI', outcome.result);
    check(
        'Duelos: no supera el máximo de n·log₂n por nivel',
        outcome.duels <= outcome.max,
        `${outcome.duels} duelos (máx. ${outcome.max})`
    );

    // Deshacer
    const undo = await page.evaluate(() => {
        state.items = ['A', 'B', 'C'].map(n => ({ id: n, anime: n, label: n, keep: true, stars: 3 }));
        startDuels();
        const before = JSON.stringify(state.current);
        vote(true);
        undoDuel();
        return before === JSON.stringify(state.current) && state.duelsDone === 0;
    });
    check('Deshacer devuelve el duelo anterior', undo);
    await page.evaluate(() => {
        state.items = [
            {
                id: 'X',
                anime: 'Frieren',
                label: 'Frieren — OP1',
                song: 'Yuusha',
                artists: 'YOASOBI',
                video: 'https://v.example/x.webm',
                keep: true,
                stars: 3
            },
            { id: 'Y', anime: 'Bocchi', label: 'Bocchi — OP1', song: 'Seishun Complex', keep: true, stars: 3 }
        ];
        startDuels();
    });
    await page.waitForSelector('.ranker-pick');
    await page.screenshot({ path: `${SHOTS}/4a-ranker-duelo.png` });
    await page.keyboard.press('1');
    check('Tecla 1 elige la tarjeta 1 (Bocchi) y termina', await page.evaluate(() => state.result && state.result.join('') === 'YX'));

    // Migración del formato antiguo
    const migrated = await page.evaluate(() => {
        localStorage.removeItem('ranker_data_v2');
        localStorage.setItem(
            'ranker_data',
            JSON.stringify({
                songs: [{ id: 1, name: 'Viejo', img: null, stars: 2, action: 'keep' }],
                pool: [],
                duelsTotal: 0,
                duelsDone: 0
            })
        );
        const s = loadRankerState();
        return s.step === 3 && s.items[0].label === 'Viejo' && s.items[0].stars === 2;
    });
    check('Migra el progreso del formato anterior', migrated);
    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
