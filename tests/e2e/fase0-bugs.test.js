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
            const types = {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png'
            };
            res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
            res.end(d);
        });
    })
    .listen(8765);

const MASTER = [
    { anime: `Kaguya-sama "Love" <img src=x onerror="window.__xss=1">`, season: 'Winter', year: 2022, studio: 'A-1 Pictures', score: 9 },
    ...Array.from({ length: 5 }, (_, i) => ({
        anime: `Show ${i}`,
        season: 'Fall',
        year: 2021,
        studio: "Studio O'Hara",
        score: 7 + (i % 3)
    }))
];
let mode = { sheets: 'ok', post: 'ok' };
const results = [];
const check = (name, cond, extra = '') => {
    results.push(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
};

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const dialogs = [];
    page.on('dialog', d => {
        dialogs.push(d.message());
        d.accept();
    });
    page.on('pageerror', e =>
        results.push('⚠️ pageerror: ' + e.message + ' @ ' + results.length + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' / '))
    );
    page.on('requestfinished', r => {
        if (r.resourceType() === 'script' && !r.url().includes('localhost')) results.push('   script: ' + r.url().slice(0, 140));
    });

    await page.route(/script\.google\.com/, async route => {
        const req = route.request();
        if (req.method() === 'POST') {
            const body = mode.post === 'unauth' ? { status: 'error', message: 'UNAUTHORIZED' } : { status: 'success' };
            return route.fulfill({
                status: 200,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        }
        const u = new URL(req.url());
        const cb = u.searchParams.get('callback');
        const sheet = u.searchParams.get('sheet');
        if (mode.sheets === 'down') return route.abort();
        const data = sheet ? [] : MASTER;
        return route.fulfill({
            status: 200,
            contentType: 'text/javascript',
            body: `${cb}(${JSON.stringify({ status: 'success', data })})`
        });
    });
    await page.route(/graphql\.anilist\.co|corsproxy/, r =>
        r.fulfill({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            contentType: 'application/json',
            body: JSON.stringify({ data: {} })
        })
    );

    await page.route(/cdnjs/, r =>
        r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.html2canvas=()=>Promise.resolve()' })
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.exceptionThrown', e => {
        const d = e.exceptionDetails;
        results.push(
            '   EXC ' +
                d.url +
                ':' +
                d.lineNumber +
                ':' +
                d.columnNumber +
                ' ' +
                ((d.exception && d.exception.description) || '').slice(0, 80)
        );
    });
    await page.addInitScript(() => {
        localStorage.setItem('otaku_hub_access_key', 'test-key');
    });
    await page.goto('http://localhost:8765/');

    // 1. Detalle con título malicioso -> escapado, sin ejecución
    await page.evaluate(() => switchView('detailView'));
    await page.waitForSelector('.detail-card');
    const title = await page.locator('.detail-title').first().textContent();
    check('Título con <img onerror> se muestra como texto', title.includes('<img src=x'), title.slice(0, 40));
    check('No se ejecutó código inyectado', !(await page.evaluate(() => window.__xss)));

    // 2. Estudio con apóstrofo -> el clic filtra correctamente
    await page.evaluate(() => switchView('studiosView'));
    await page.waitForSelector('.studio-card');
    await page.locator('.studio-card', { hasText: "O'Hara" }).click();
    await page.waitForSelector('#studioSheetTitle');
    check('Clic en estudio con apóstrofo abre su página', (await page.textContent('#studioSheetTitle')) === "Studio O'Hara");
    await page.click('.work-sheet button:has-text("Ver en estadísticas")');
    await page.waitForTimeout(400);
    check('…y desde ella se filtra el panel por ese estudio', (await page.evaluate(() => _activeFilters.studio)) === "Studio O'Hara");

    // 3. Sheets caído -> error visible con Reintentar, no spinner infinito
    mode.sheets = 'down';
    // Con copia local: se muestran los datos guardados (Fase 3)
    await page.evaluate(() => {
        _masterData = [];
        switchView('detailView');
    });
    await page.waitForTimeout(1500);
    check(
        'Sheets caído CON copia local: muestra los datos guardados',
        (await page.locator('.detail-card').count()) === MASTER.length && (await page.textContent('#toastRegion')).includes('Sin conexión')
    );
    // Sin copia local: error con Reintentar
    await page.evaluate(async () => {
        await clearSheetSnapshots();
        invalidateList('master');
        switchView('detailView');
    });
    await page.waitForSelector('#detailView .load-error', { timeout: 5000 });
    check('Sheets caído muestra error con botón Reintentar', await page.locator('#detailView .load-error button').isVisible());
    check('El spinner se oculta', !(await page.locator('#detailLoader').isVisible()));
    mode.sheets = 'ok';
    await page.click('#detailView .load-error button');
    await page.waitForSelector('.detail-card');
    check('Reintentar recarga los datos', (await page.locator('.detail-card').count()) === MASTER.length);

    // 4. Peticiones simultáneas no se pisan
    const counts = await page.evaluate(async () => {
        _masterData = [];
        let a = 0,
            b = 0;
        await new Promise(res => {
            let n = 0;
            const done = () => ++n === 2 && res();
            initMasterDataFetch(() => {
                a++;
                done();
            });
            initMasterDataFetch(() => {
                b++;
                done();
            });
        });
        return [a, b];
    });
    check('Dos cargas simultáneas ejecutan ambos callbacks', counts[0] === 1 && counts[1] === 1);

    // 5. Escritura rechazada (UNAUTHORIZED) -> NO dice guardado, pide clave
    await page.evaluate(() => switchView('formView'));
    await page.fill('#anime', 'Test Anime');
    await page.fill('#studio', 'MAPPA');
    mode.post = 'unauth';
    await page.click('#submitBtn');
    await page.waitForSelector('#authOverlay', { timeout: 5000 });
    const msg = await page.textContent('#statusMsg');
    check('Clave rechazada: no muestra "guardado"', !msg.includes('guardado perfectamente'), msg);
    check('Clave rechazada: aparece la pantalla de bloqueo', await page.locator('#authOverlay').isVisible());
    check('Clave rechazada: el formulario conserva los datos', (await page.inputValue('#anime')) === 'Test Anime');
    await page.evaluate(() => {
        document.getElementById('authOverlay').remove();
        document.body.classList.remove('auth-locked');
        localStorage.setItem('otaku_hub_access_key', 'test-key');
    });

    // 6. Escritura correcta -> confirmada
    mode.post = 'ok';
    await page.click('#submitBtn');
    await page.waitForFunction(() => document.getElementById('statusMsg').innerText.includes('guardado perfectamente'));
    check('Escritura correcta confirmada', true);

    // 7. Manga: invalida la caché de manga, no la de anime
    const mangaRes = await page.evaluate(async () => {
        _mangaData = [{ manga: 'x' }];
        _masterData = [{ anime: 'y' }];
        switchView('mangaFormView');
        document.getElementById('manga').value = 'M';
        document.getElementById('author').value = 'A';
        document.getElementById('mangaSubmitBtn').click();
        await new Promise(r => setTimeout(r, 800));
        return [_mangaData.length, _masterData.length];
    });
    check('Registrar manga vacía la caché de manga y no la de anime', mangaRes[0] === 0 && mangaRes[1] === 1, JSON.stringify(mangaRes));

    // 8. Calificador: "Meh"/"Mal" ya no se duplican; datos antiguos sí se convierten; corruptos se reparan
    const calif = await page.evaluate(() => {
        _calificadorCurrentScores = [{ ep: 3, isFinal: false, completed: true, score: 5, answers: [5, 2.5, 7.5, 5], scale: 10 }];
        openCalificadorForm(0);
        const nuevo = [..._tempCalificadorAnswers];
        closeCalificadorForm();
        _calificadorCurrentScores = [{ ep: 3, isFinal: false, completed: true, score: 0, answers: [5, 2.5, 7.5, 5] }];
        openCalificadorForm(0);
        const sinMarca = [..._tempCalificadorAnswers];
        closeCalificadorForm();
        _calificadorCurrentScores = [{ ep: 3, isFinal: false, completed: true, score: 3, answers: [3, 4, 5, 2] }];
        openCalificadorForm(0);
        const antiguo = [..._tempCalificadorAnswers];
        closeCalificadorForm();
        const reparado = normalizeCalificadorCheckpoint({ isFinal: false, completed: true, score: 15, answers: [15, 20, 10, 15] });
        return { nuevo, sinMarca, antiguo, reparado };
    });
    check('Hito con Meh/Mal se abre sin duplicar', JSON.stringify(calif.nuevo) === '[5,2.5,7.5,5]', JSON.stringify(calif.nuevo));
    check('Hito actual sin marca de escala tampoco se duplica', JSON.stringify(calif.sinMarca) === '[5,2.5,7.5,5]');
    check('Hito antiguo (escala 1-5) se convierte a /10', JSON.stringify(calif.antiguo) === '[6,8,10,4]', JSON.stringify(calif.antiguo));
    check(
        'Hito corrompido (>10) se repara',
        JSON.stringify(calif.reparado.answers) === '[7.5,10,5,7.5]' && calif.reparado.score === 7.5,
        JSON.stringify(calif.reparado)
    );

    // 9. TOP 150 con datos locales no rompe (antes ReferenceError)
    await page.evaluate(() => {
        localStorage.setItem('saved_top150_data', JSON.stringify([{ id: 1, name: 'A "b"', score: 9 }]));
        switchView('top150View');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => openTop150());
    check('TOP 150 se pinta con badges', (await page.locator('.top150-item').count()) === 1);

    // 10. Gacha: la sinopsis con HTML queda como texto
    check(
        'htmlToText limpia la sinopsis',
        (await page.evaluate(() => htmlToText('Hola<br>mundo <i>x</i> &amp; <script>y</script>'))) === 'Hola\nmundo x & y'
    );

    check('Sin alert() inesperados', dialogs.length === 0, dialogs.join(' | '));
    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
