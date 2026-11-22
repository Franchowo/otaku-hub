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
            const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
            res.writeHead(200, { 'Content-Type': t[path.extname(p)] || 'application/octet-stream' });
            res.end(d);
        });
    })
    .listen(8781);
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
const lum = ([r, g, b]) => {
    const f = c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
const rgb = s => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1160, height: 900 }, colorScheme: 'dark' });
    page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
    await page.route(/fonts\.|cdnjs|graphql\.anilist/, r =>
        r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"data":{}}' })
    );
    await page.route(/script\.google\.com/, async r => {
        const u = new URL(r.request().url());
        const cb = u.searchParams.get('callback');
        if (u.searchParams.get('action') === 'ping') await new Promise(res => setTimeout(res, 6000)); // servidor lento
        r.fulfill({
            status: 200,
            contentType: 'text/javascript',
            body: `${cb}(${JSON.stringify(u.searchParams.get('action') === 'ping' ? { status: 'success', auth: 'ok' } : { status: 'success', data: [] })})`
        });
    });
    await page.addInitScript(() => {
        try {
            localStorage.setItem('otaku_hub_access_key', 'k');
            localStorage.setItem(
                'annual_ranking_data',
                JSON.stringify(
                    Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Anime número ${i + 1}`, score: 10 - Math.floor(i / 3) }))
                )
            );
            localStorage.setItem('annual_archive', JSON.stringify({ 2025: [{ id: 1, name: 'X', score: 9 }] }));
        } catch (e) {}
    });
    await page.goto('http://localhost:8781/#/ranking-anual');
    await page.waitForSelector('.draggable-item >> nth=11', { timeout: 20000 });
    const opts = await page.$$eval('#annualYearSelect option', o => o.map(x => x.textContent));
    check(
        'El selector de año muestra "En curso" y los años guardados sin esperar al servidor',
        opts.join('|') === 'En curso|2025 (archivado)',
        opts.join(' | ')
    );

    const badge = async i =>
        page
            .$eval(`#annualRankingList .rank-pos-badge >> nth=${i}`, el => {
                const s = getComputedStyle(el);
                return { bg: s.backgroundColor, fg: s.color, text: el.textContent.trim() };
            })
            .catch(() => null);
    const top = await page.evaluate(() => {
        const el = document.querySelectorAll('#annualRankingList .rank-pos-badge')[0];
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, fg: s.color, text: el.textContent.trim() };
    });
    const out = await page.evaluate(() => {
        const el = document.querySelectorAll('#annualRankingList .rank-pos-badge')[10];
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, fg: s.color, text: el.textContent.trim() };
    });
    const cTop = contrast(rgb(top.bg), rgb(top.fg)),
        cOut = contrast(rgb(out.bg), rgb(out.fg));
    check(
        'Posición 1 (TOP 10): fondo verde y número legible',
        top.text === '1' && rgb(top.bg)[1] > 200 && cTop >= 4.5,
        `${top.bg} / ${top.fg} → ${cTop.toFixed(1)}:1`
    );
    check(
        'Posición 11 (OUT): fondo rojo y texto legible',
        out.text === 'OUT' && rgb(out.bg)[0] > 180 && cOut >= 4.5,
        `${out.bg} / ${out.fg} → ${cOut.toFixed(1)}:1`
    );
    await page.screenshot({ path: `${SHOTS}/anual-badges.png`, clip: { x: 0, y: 0, width: 1160, height: 900 } });
    await page.evaluate(() => document.querySelectorAll('#annualRankingList .draggable-item')[8].scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${SHOTS}/anual-badges-out.png` });
    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
