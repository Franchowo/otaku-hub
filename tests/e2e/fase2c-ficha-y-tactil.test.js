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
    .listen(8771);
const MASTER = () => [
    { anime: 'Frieren', season: 'Fall', year: 2023, studio: 'Madhouse', score: 10, anilistid: 154587, _row: 3 },
    { anime: '86', season: 'Spring', year: 2021, studio: 'A-1 Pictures', score: 8, _row: 4 }
];
const MANGA = () => [{ 'Manga Title': 'Berserk', Year: 1989, Author: 'Kentaro Miura', Score: 10, _row: 3 }];
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);

async function setup(browser, version, opts = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...opts });
    const page = await context.newPage();
    const posts = [];
    page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
    page.on('dialog', d => {
        results.push('⚠️ diálogo nativo: ' + d.message());
        d.accept();
    });
    await page.route(/cdnjs/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.route(/graphql\.anilist/, r => {
        const { query } = JSON.parse(r.request().postData());
        const data = query.includes('Media(id: $id, search: $search')
            ? {
                  Media: {
                      id: 154587,
                      siteUrl: 'https://anilist.co/anime/154587',
                      format: 'TV',
                      episodes: 28,
                      averageScore: 91,
                      genres: ['Adventure', 'Drama'],
                      coverImage: { large: 'https://img/f.jpg' },
                      description: 'Una elfa <i>maga</i>.<br>Viaja.',
                      title: { romaji: 'Sousou no Frieren' }
                  }
              }
            : {};
        r.fulfill({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            contentType: 'application/json',
            body: JSON.stringify({ data })
        });
    });
    await page.route(/script\.google\.com/, r => {
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
                        data: body.sheet === 'FULL LIST MANGA' ? MANGA() : body.sheet ? [] : MASTER()
                    })
                });
            return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"status":"success"}' });
        }
        const u = new URL(req.url());
        const cb = u.searchParams.get('callback');
        const sh = u.searchParams.get('sheet');
        if (u.searchParams.get('action') === 'ping')
            return r.fulfill({
                status: 200,
                contentType: 'text/javascript',
                body: `${cb}(${JSON.stringify({ status: 'success', auth: 'ok', ...(version > 1 ? { version } : {}) })})`
            });
        const strip = l =>
            l.map(x => {
                delete x._row;
                delete x.anilistid;
                return x;
            });
        r.fulfill({
            status: 200,
            contentType: 'text/javascript',
            body: `${cb}(${JSON.stringify({ status: 'success', data: sh === 'FULL LIST MANGA' ? strip(MANGA()) : sh ? [] : strip(MASTER()) })})`
        });
    });
    await page.addInitScript(() => localStorage.setItem('otaku_hub_access_key', 'k'));
    return { page, posts, context };
}

async function touchDrag(page, from, to) {
    const cdp = await page.context().newCDPSession(page);
    const steps = 12;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]
        });
        await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const center = async loc => {
    const b = await loc.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

(async () => {
    const browser = await chromium.launch();
    // ===== v3 =====
    let { page, posts, context } = await setup(browser, 3);
    await page.goto('http://localhost:8771/#/anime');
    await page.waitForSelector('.detail-card');
    await page.click('.detail-card >> nth=0');
    await page.waitForSelector('.work-sheet');
    await page.waitForSelector('.work-sheet-stats');
    const sheet = (await page.textContent('.work-sheet')).replace(/\s+/g, ' ');
    check(
        'Ficha: título, tu nota y datos de AniList',
        sheet.includes('Frieren') &&
            sheet.includes('Tu nota: 10') &&
            sheet.includes('9.1') &&
            sheet.includes('28') &&
            sheet.includes('Adventure'),
        sheet.slice(0, 150)
    );
    check('Ficha: tu nota frente a la media (+0.9)', sheet.includes('+0.9'));
    check('Ficha: sinopsis sin HTML', sheet.includes('Una elfa maga.') && !sheet.includes('<i>'));
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/2c-ficha-movil.png` });
    await page.keyboard.press('Escape');
    check('Escape cierra la ficha', !(await page.$('.work-sheet')));

    // Título "86": la clave por fila no se confunde
    await page.click('.detail-card >> nth=1');
    await page.waitForSelector('.work-sheet');
    check('Ficha del anime "86" (no la fila 86)', (await page.textContent('.work-sheet-title')) === '86');
    await page.click('button:has-text("Editar")');
    await page.waitForSelector('#workEditForm');
    await page.fill('#weTitle', '86 Eighty-Six');
    await page.fill('#weAnilist', '116589');
    await page.evaluate(() => {
        const r = document.getElementById('weScore');
        r.value = 9;
        r.dispatchEvent(new Event('input'));
    });
    await page.screenshot({ path: `${SHOTS}/2c-editar-movil.png` });
    await page.click('#weSave');
    await page.waitForTimeout(600);
    const upd = posts.find(p => p.action === 'update_entry');
    check(
        'Editar envía update_entry con fila y título original',
        upd &&
            upd.row === 4 &&
            upd.title === '86' &&
            upd.fields.anime === '86 Eighty-Six' &&
            upd.fields.score === 9 &&
            upd.fields.anilistId === 116589 &&
            upd.fields.season === 'Spring',
        JSON.stringify(upd)
    );
    check(
        'Tras editar se cierra la ficha y avisa',
        !(await page.$('.work-sheet')) && (await page.textContent('#toastRegion')).includes('actualizado')
    );

    await page.waitForSelector('.detail-card');
    await page.click('.detail-card >> nth=0');
    await page.waitForSelector('.work-sheet');
    await page.click('.work-sheet button:has-text("Borrar")');
    await page.waitForSelector('.dialog');
    await page.click('.dialog [data-answer="yes"]');
    await page.waitForTimeout(600);
    const del = posts.find(p => p.action === 'delete_entry');
    check('Borrar pide confirmación y envía delete_entry', del && del.row === 3 && del.title === 'Frieren', JSON.stringify(del));

    // Manga: tocar el libro abre la ficha
    await page.evaluate(() => {
        location.hash = '#/manga';
    });
    await page.waitForSelector('.manga-book');
    await page.tap('.manga-book');
    await page.waitForSelector('.work-sheet');
    check(
        'Tocar un manga abre su ficha',
        (await page.textContent('.work-sheet-title')) === 'Berserk' && (await page.textContent('.work-sheet')).includes('Kentaro Miura')
    );
    await page.keyboard.press('Escape');

    // ===== Reordenar Ranking Anual =====
    await page.evaluate(() => {
        _annualRanking = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ id: i + 1, name: n, score: 9 }));
        saveAnnualLocal();
        location.hash = '#/ranking-anual';
    });
    await page.waitForSelector('.draggable-item >> nth=4');
    const order = () => page.evaluate(() => _annualRanking.map(a => a.name).join(''));
    // Táctil: arrastrar A (1º) hasta debajo de C (3º)
    await page.evaluate(() => document.querySelector('#annualRankingList .draggable-item').scrollIntoView({ block: 'start' }));
    const h0 = await center(page.locator('#annualRankingList .drag-handle').nth(0));
    const c3 = await center(page.locator('#annualRankingList .draggable-item').nth(2));
    await touchDrag(page, h0, { x: h0.x, y: c3.y + 10 });
    await page.waitForTimeout(200);
    check('Arrastrar con el dedo reordena (A → 3ª posición)', (await order()) === 'BCADE', await order());
    check(
        '…y se guarda en el dispositivo',
        (await page.evaluate(() =>
            JSON.parse(localStorage.getItem('annual_ranking_data'))
                .map(a => a.name)
                .join('')
        )) === 'BCADE'
    );
    // Teclado
    await page.focus('#annualRankingList .drag-handle >> nth=0');
    await page.keyboard.press('ArrowDown');
    check('Flecha ↓ en el asa baja una posición', (await order()) === 'CBADE', await order());
    check(
        'El foco sigue en el elemento movido (B)',
        await page.evaluate(() => document.activeElement.closest('.draggable-item').textContent.includes('B'))
    );
    // Mover a posición
    await page.click('#annualRankingList .rank-pos-badge >> nth=4');
    await page.waitForSelector('#dialogNumber');
    await page.fill('#dialogNumber', '1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check('"Mover a posición 1" funciona', (await order()) === 'ECBAD', await order());
    await context.close();

    // ===== Ratón en escritorio (TOP 150) =====
    ({ page, posts, context } = await setup(browser, 3, { viewport: { width: 1280, height: 860 }, hasTouch: false }));
    await page.goto('http://localhost:8771/#/top-150');
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        localStorage.setItem('saved_top150_data', JSON.stringify(['A', 'B', 'C'].map((n, i) => ({ id: i, name: n, score: 9 }))));
        openTop150();
    });
    const t0 = await center(page.locator('#top150ListContainer .drag-handle').nth(0));
    const t2 = await center(page.locator('#top150ListContainer .top150-item').nth(2));
    await page.mouse.move(t0.x, t0.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(t0.x + ((t2.x - t0.x) * i) / 10, t0.y + ((t2.y + 5 - t0.y) * i) / 10);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const top = await page.evaluate(() => _currentTop150.map(a => a.name).join(''));
    check('Arrastrar con el ratón reordena el TOP 150', top === 'BCA', top);
    await context.close();

    // ===== Backend v2: editar no disponible =====
    ({ page, posts, context } = await setup(browser, 2));
    await page.goto('http://localhost:8771/#/anime');
    await page.waitForSelector('.detail-card');
    await page.click('.detail-card >> nth=0');
    await page.waitForSelector('.work-sheet');
    await page.click('button:has-text("Editar")');
    await page.waitForTimeout(300);
    check(
        'Con backend v2, Editar avisa de actualizar a v3 y no envía nada',
        (await page.textContent('#toastRegion')).includes('versión 3') &&
            !posts.some(p => p.action === 'update_entry' || p.action === 'delete_entry')
    );
    await context.close();

    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
