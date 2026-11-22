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
    .listen(8772);
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
let MASTER = [
    { anime: 'Frieren', season: 'Fall', year: 2023, studio: 'Madhouse', score: 10, _row: 3 },
    { anime: 'Bocchi', season: 'Fall', year: 2022, studio: 'CloverWorks', score: 9, _row: 4 }
];
let sheetsDelay = 0;
const cdnRequests = [];

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const posts = [];
    context.on('weberror', e => results.push(`⚠️ error: ${e.error().message}`));
    await context.route(/cdnjs|fonts\.(googleapis|gstatic)/, r => {
        cdnRequests.push(r.request().url());
        r.fulfill({
            status: 200,
            contentType: r.request().url().includes('cdnjs') ? 'text/javascript' : 'text/css',
            body: r.request().url().includes('cdnjs') ? 'window.html2canvas = () => Promise.resolve({ toDataURL: () => "data:," });' : ''
        });
    });
    await context.route(/graphql\.anilist/, r =>
        r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"data":{}}' })
    );
    await context.route(/script\.google\.com/, async r => {
        const req = r.request();
        const cors = { 'Access-Control-Allow-Origin': '*' };
        if (sheetsDelay) await new Promise(res => setTimeout(res, sheetsDelay));
        if (req.method() === 'POST') {
            const body = JSON.parse(req.postData());
            posts.push(body);
            if (body.action === 'read')
                return r.fulfill({
                    status: 200,
                    headers: cors,
                    contentType: 'application/json',
                    body: JSON.stringify({ status: 'success', data: body.sheet ? [] : MASTER })
                });
            return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"status":"success"}' });
        }
        const u = new URL(req.url());
        const cb = u.searchParams.get('callback');
        if (u.searchParams.get('action') === 'ping')
            return r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}({"status":"success","auth":"ok","version":3})` });
        r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}(${JSON.stringify({ status: 'success', data: [] })})` });
    });
    await context.addInitScript(() => {
        try {
            localStorage.setItem('otaku_hub_access_key', 'k');
        } catch (e) {}
    });
    const page = await context.newPage();
    page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
    page.on('dialog', d => {
        results.push('⚠️ diálogo nativo: ' + d.message());
        d.accept();
    });

    // 1ª visita: red normal
    await page.goto('http://localhost:8772/#/anime');
    await page.waitForSelector('.detail-card');
    check('html2canvas NO se descarga al arrancar', !cdnRequests.some(u => u.includes('html2canvas')));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(500);
    // El nombre de la caché se lee de sw.js (cambia en cada versión).
    const CACHE = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/CACHE_NAME = '([^']+)'/)[1];
    const caches = await page.evaluate(async name => {
        const keys = await caches.keys();
        const shell = await (await caches.open(name)).keys();
        return { keys, shell: shell.length };
    }, CACHE);
    check(
        `Service Worker instalado con la app precargada (${CACHE})`,
        caches.keys.includes(CACHE) && caches.shell >= 30,
        JSON.stringify(caches)
    );
    const snap = await page.evaluate(() => loadSheetSnapshot('master'));
    check('La lista se guarda en el dispositivo (IndexedDB)', snap && snap.data.length === 2);

    // 2ª visita con Sheets lento (4 s): la copia se pinta al instante y luego se actualiza
    sheetsDelay = 4000;
    MASTER = [...MASTER, { anime: 'Dandadan', season: 'Fall', year: 2024, studio: 'Science SARU', score: 9, _row: 5 }];
    const t0 = Date.now();
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('.detail-card');
    const firstPaint = Date.now() - t0;
    check(
        'Con Sheets lento, la copia local se pinta al instante',
        firstPaint < 2500 && (await page.$$('.detail-card')).length === 2,
        `${firstPaint} ms`
    );
    await page.waitForFunction(() => document.querySelectorAll('.detail-card').length === 3, null, { timeout: 15000 });
    check('Cuando responde Sheets, la vista se actualiza sola (3 animes)', true);
    sheetsDelay = 0;

    // Sin conexión
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.detail-card', { timeout: 15000 });
    check('Sin conexión la app abre (Service Worker) y muestra tus datos', (await page.$$('.detail-card')).length === 3);
    await page.waitForTimeout(500);
    const offlineToast = await page.textContent('#toastRegion').catch(() => '');
    check('Avisa de que son datos guardados', (offlineToast || '').includes('Sin conexión'), (offlineToast || '').trim().slice(0, 80));
    await page.screenshot({ path: `${SHOTS}/3-offline-movil.png` });

    // Registrar sin conexión -> cola
    await page.evaluate(() => {
        location.hash = '#/registrar-anime';
    });
    await page.waitForTimeout(300);
    await page.fill('#anime', 'Anime Offline');
    await page.fill('#studio', 'MAPPA');
    await page.click('#submitBtn');
    await page.waitForTimeout(500);
    check(
        'Registrar sin conexión queda en cola',
        (await page.textContent('#statusMsg')).includes('en cola') &&
            (await page.textContent('#outboxBadge')).includes('1') &&
            (await page.isVisible('#outboxBadge'))
    );
    await page.screenshot({ path: `${SHOTS}/3-cola-movil.png` });
    check('…y no se envió nada', !posts.some(p => p.anime === 'Anime Offline'));
    await page.reload();
    await page.waitForTimeout(800);
    check('La cola sobrevive a recargar la app', (await page.textContent('#outboxBadge')).includes('1'));

    // Vuelve la conexión
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => document.getElementById('outboxBadge').hidden, null, { timeout: 15000 });
    check(
        'Al volver la red se envía solo',
        posts.some(p => p.anime === 'Anime Offline' && p.key === 'k')
    );
    check('Avisa de que se envió', (await page.textContent('#toastRegion')).includes('Se enviaron 1'));

    // Tras registrar, la siguiente carga no enseña la copia antigua
    await page.evaluate(() => {
        invalidateList('master');
    });
    sheetsDelay = 2500;
    await page.evaluate(() => {
        location.hash = '#/anime';
    });
    await page.waitForTimeout(1200);
    check(
        'Tras un cambio no se muestra la copia antigua (espera a Sheets)',
        (await page.$$('#detailGridContainer .detail-card')).length === 0 || !(await page.isVisible('#detailContent'))
    );
    sheetsDelay = 0;
    await page.waitForSelector('.detail-card');

    // Exportar descarga html2canvas en ese momento
    await page.evaluate(() => loadHtml2Canvas());
    check(
        'html2canvas se descarga al exportar',
        cdnRequests.some(u => u.includes('html2canvas'))
    );

    // Cerrar sesión borra la copia
    await page.evaluate(() => {
        otakuLogout();
    });
    await page.waitForSelector('.dialog');
    await page.click('.dialog [data-answer="yes"]');
    await page.waitForTimeout(500);
    check('Cerrar sesión borra la copia local', (await page.evaluate(() => loadSheetSnapshot('master'))) === null);

    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
