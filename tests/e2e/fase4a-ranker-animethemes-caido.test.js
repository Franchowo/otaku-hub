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
    .listen(8779);
(async () => {
    const b = await chromium.launch();
    const page = await b.newPage();
    await page.route(/fonts\.|cdnjs/, r => r.fulfill({ status: 200, body: '' }));
    await page.route(/script\.google\.com/, r => {
        const cb = new URL(r.request().url()).searchParams.get('callback');
        r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}({"status":"success","data":[]})` });
    });
    await page.route(/graphql\.anilist/, r =>
        r.fulfill({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            contentType: 'application/json',
            body: '{"data":{"q0":{"media":[{"id":154587,"coverImage":{"large":""}}]}}}'
        })
    );
    await page.route(/api\.animethemes\.moe/, r =>
        r.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'down' })
    );
    await page.addInitScript(() => {
        try {
            localStorage.setItem('otaku_hub_access_key', 'k');
        } catch (e) {}
    });
    await page.goto('http://localhost:8779/#/opening-ranker');
    await page.waitForTimeout(500);
    await page.fill('#input', 'Frieren');
    await page.click('#btn-start-ranker');
    await page.waitForSelector('#step-2.active', { timeout: 20000 });
    const txt = await page.textContent('#discard-list');
    console.log(
        (txt.includes('AnimeThemes no respondió') && txt.includes('YouTube')) || (await page.$('#discard-list a[href*="youtube"]'))
            ? '✅ AnimeThemes caído (503): avisa "no respondió" y ofrece YouTube'
            : '❌ ' + txt.trim().slice(0, 120)
    );
    await b.close();
    server.close();
})();
