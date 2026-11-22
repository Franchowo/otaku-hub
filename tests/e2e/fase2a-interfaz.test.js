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
    .listen(8768);
const MASTER = [
    { anime: 'Frieren', season: 'Fall', year: 2023, studio: 'Madhouse', score: 10 },
    { anime: 'Bocchi', season: 'Winter', year: 2022, studio: 'CloverWorks', score: 9 }
];
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
    const browser = await chromium.launch();
    for (const vp of [
        { name: 'movil', width: 390, height: 844 },
        { name: 'escritorio', width: 1280, height: 860 }
    ]) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        const dialogs = [];
        page.on('dialog', d => {
            dialogs.push(d.message());
            d.accept();
        });
        page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
        await page.route(/cdnjs/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
        await page.route(/graphql\.anilist/, r =>
            r.fulfill({
                status: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                contentType: 'application/json',
                body: '{"data":{}}'
            })
        );
        await page.route(/script\.google\.com/, r => {
            const u = new URL(r.request().url());
            const cb = u.searchParams.get('callback');
            if (r.request().method() === 'POST')
                return r.fulfill({
                    status: 200,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    contentType: 'application/json',
                    body: '{"status":"success"}'
                });
            r.fulfill({
                status: 200,
                contentType: 'text/javascript',
                body: `${cb}(${JSON.stringify({ status: 'success', data: u.searchParams.get('sheet') ? [] : MASTER })})`
            });
        });
        await page.addInitScript(() => localStorage.setItem('otaku_hub_access_key', 'k'));
        await page.goto('http://localhost:8768/');
        await page.screenshot({ path: `${SHOTS}/2a-hub-${vp.name}.png` });

        if (vp.name === 'movil') {
            const y = new Date().getFullYear(),
                season = ['Winter', 'Spring', 'Summer', 'Fall'][Math.floor(new Date().getMonth() / 3)];
            check(
                'Año por defecto = año actual',
                (await page.inputValue('#year')) === String(y) && (await page.inputValue('#planYearSelect')) === String(y)
            );
            check('Temporada por defecto = temporada actual', (await page.inputValue('#season')) === season, season);
            await page.evaluate(() => document.getElementById('animeForm').reset());
            check('Tras reset del formulario sigue el año actual', (await page.inputValue('#year')) === String(y));
            await page.waitForSelector('.hub-card');
            await page.focus('.hub-card');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(300);
            check(
                'Tarjeta del hub se abre con Enter',
                await page.evaluate(() => document.getElementById('detailView').classList.contains('active'))
            );
            await page.evaluate(() => switchView('formView'));
            await page.waitForTimeout(300);
            check(
                'Etiquetas en español',
                (await page.textContent('label[for="anime"]')).includes('Título') &&
                    (await page.textContent('#season option[value="Fall"]')) === 'Otoño'
            );
            await page.click('#searchBtn');
            check('Validación muestra un aviso (no alert)', (await page.textContent('#toastRegion')).includes('3 letras'));
            await page.waitForTimeout(300);
            await page.screenshot({ path: `${SHOTS}/2a-toast-movil.png` });
            await page.evaluate(() => {
                _annualRanking = [
                    { id: 1, name: 'A', score: 9 },
                    { id: 2, name: 'B', score: 8 }
                ];
                switchView('annualRankingView');
            });
            await page.waitForSelector('.draggable-item');
            await page.click('.draggable-item .btn-remove-item');
            check('Quitar del ranking deja 1', (await page.evaluate(() => _annualRanking.length)) === 1);
            await page.click('.toast-action >> nth=-1');
            check('"Deshacer" lo restaura en su sitio', (await page.evaluate(() => _annualRanking.map(a => a.name).join())) === 'A,B');
            await page.click('button[onclick="resetAnnualRanking()"]');
            await page.waitForSelector('.dialog');
            check('Diálogo peligroso enfoca "Cancelar"', (await page.evaluate(() => document.activeElement.dataset.answer)) === 'no');
            await page.waitForTimeout(450);
            await page.screenshot({ path: `${SHOTS}/2a-dialog-movil.png` });
            await page.keyboard.press('Escape');
            check('Escape cancela sin borrar', !(await page.$('.dialog')) && (await page.evaluate(() => _annualRanking.length)) === 2);
            await page.click('button[onclick="resetAnnualRanking()"]');
            await page.click('.dialog [data-answer="yes"]');
            check('Confirmar reinicia', (await page.evaluate(() => _annualRanking.length)) === 0);
            await page.click('.toast-action >> nth=-1');
            check('…y se puede deshacer', (await page.evaluate(() => _annualRanking.length)) === 2);
            await page.evaluate(() => switchView('detailView'));
            await page.waitForSelector('.detail-card');
            check('Temporada mostrada en español', (await page.textContent('.detail-card')).includes('Otoño'));
            check('Sin alert()/confirm() nativos', dialogs.length === 0, dialogs.join('|'));
        } else {
            await page.evaluate(() => switchView('statsView'));
            await page.waitForSelector('#statsContent', { state: 'visible' });
            await page.screenshot({ path: `${SHOTS}/2a-stats-escritorio.png` });
        }
        await page.close();
    }
    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
