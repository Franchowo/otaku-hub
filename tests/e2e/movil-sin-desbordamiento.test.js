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
            const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
            res.writeHead(200, { 'Content-Type': t[path.extname(p)] || 'application/octet-stream' });
            res.end(d);
        });
    })
    .listen(8769);
const MASTER = Array.from({ length: 8 }, (_, i) => ({
    anime: 'Un título de anime bastante largo número ' + i,
    season: 'Fall',
    year: 2020 + (i % 3),
    studio: 'Studio Muy Largo ' + (i % 2),
    score: 5 + (i % 6)
}));
(async () => {
    const b = await chromium.launch();
    const page = await b.newPage({ viewport: { width: 390, height: 844 } });
    await page.route(/cdnjs/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.route(/graphql\.anilist/, r =>
        r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"data":{}}' })
    );
    await page.route(/script\.google\.com/, r => {
        const u = new URL(r.request().url());
        const cb = u.searchParams.get('callback');
        const sh = u.searchParams.get('sheet');
        const data =
            sh === 'FULL LIST MANGA' ? [{ 'Manga Title': 'Berserk', Year: 1989, Author: 'Kentaro Miura', Score: 10 }] : sh ? [] : MASTER;
        r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}(${JSON.stringify({ status: 'success', data })})` });
    });
    await page.addInitScript(() => {
        localStorage.setItem('otaku_hub_access_key', 'k');
        localStorage.setItem('annual_ranking_data', JSON.stringify([{ id: 1, name: 'Un título larguísimo de prueba', score: 9 }]));
    });
    await page.goto('http://localhost:8769/');
    const views = [
        'hubView',
        'formView',
        'mangaFormView',
        'detailView',
        'mangaLibraryView',
        'statsView',
        'insightsView',
        'timeMachineView',
        'studiosView',
        'top150View',
        'annualRankingView',
        'favoritesView',
        'rankerView',
        'recommendationsView',
        'calificadorView',
        'planificadorView',
        'gachaView'
    ];
    for (const v of views) {
        await page.evaluate(v => switchView(v), v);
        await page.waitForTimeout(700);
        if (v === 'top150View') {
            await page.evaluate(() => openTop150());
        }
        const r = await page.evaluate(() => {
            const W = document.documentElement.clientWidth;
            const offenders = [];
            document.querySelectorAll('.view.active *').forEach(el => {
                const rc = el.getBoundingClientRect();
                if (rc.width && rc.right > W + 1 && getComputedStyle(el).position !== 'fixed')
                    offenders.push((el.id ? '#' + el.id : el.className || el.tagName).toString().slice(0, 40) + ':' + Math.round(rc.right));
            });
            return { sw: document.documentElement.scrollWidth, W, offenders: [...new Set(offenders)].slice(0, 5) };
        });
        console.log(`${r.sw > r.W ? '❌' : '✅'} ${v} scrollWidth=${r.sw} ${r.offenders.join(' | ')}`);
    }
    await b.close();
    server.close();
})();
