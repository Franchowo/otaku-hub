// Prueba del Wrapped contra AniList REAL (API + portadas), con el Service Worker activo
// y las portadas ya cargadas antes por la app (el caso que fallaba).
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
    .listen(8778);
const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
const MASTER = [
    ['Sousou no Frieren', 'Fall', 2023, 'Madhouse', 10, 154587],
    ['[Oshi no Ko]', 'Spring', 2023, 'Doga Kobo', 9, 150672],
    ['Tengoku Daimakyou', 'Spring', 2023, 'Production I.G', 9, 155783],
    ['Jigokuraku', 'Spring', 2023, 'MAPPA', 8, 128893],
    ['Kimetsu no Yaiba: Katanakaji no Sato-hen, un título larguísimo para probar el recorte', 'Spring', 2023, 'ufotable', 7, 145139],
    ['MASHLE', 'Spring', 2023, 'A-1 Pictures', 6, 151801],
    ['Yamada-kun to Lv999 no Koi wo Suru', 'Spring', 2023, 'Madhouse', 5, 154965]
].map(([anime, season, year, studio, score, id], i) => ({ anime, season, year, studio, score, anilistid: id, _row: i + 3 }));

(async () => {
    const browser = await chromium.launch();
    for (const vp of [
        { n: 'movil', width: 390, height: 844 },
        { n: 'escritorio', width: 1280, height: 800 }
    ]) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
        await context.route(/fonts\.(googleapis|gstatic)|cdnjs/, r => r.fulfill({ status: 200, body: '' }));
        await context.route(/script\.google\.com/, r => {
            const u = new URL(r.request().url());
            const cb = u.searchParams.get('callback');
            const sh = u.searchParams.get('sheet');
            r.fulfill({
                status: 200,
                contentType: 'text/javascript',
                body: `${cb}(${JSON.stringify(u.searchParams.get('action') === 'ping' ? { status: 'success', auth: 'ok' } : { status: 'success', data: sh === 'FULL LIST MANGA' ? [{ 'Manga Title': 'Chainsaw Man', Year: 2023, Author: 'Fujimoto', Score: 9 }] : sh ? [] : MASTER })})`
            });
        });
        await context.addInitScript(() => {
            try {
                localStorage.setItem('otaku_hub_access_key', 'k');
            } catch (e) {}
        });

        // 1) Como en la app real: se ven las portadas en la cuadrícula (caché del navegador + Service Worker)
        await page.goto('http://localhost:8778/#/anime');
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(
            () =>
                [...document.querySelectorAll('.detail-card img')].filter(
                    i => i.src.includes('anilist.co') && i.complete && i.naturalWidth > 0
                ).length >= 5,
            null,
            { timeout: 60000 }
        );
        if (vp.n === 'movil') check('Las portadas reales se ven en la cuadrícula (y quedan en caché)', true);
        await page.reload();
        await page.waitForSelector('.detail-card'); // ahora el Service Worker controla la página

        // 2) Wrapped
        await page.evaluate(() => {
            location.hash = '#/capsula';
        });
        await page.waitForSelector('#tmYearSelect option[value="2023"]', { state: 'attached', timeout: 30000 });
        await page.selectOption('#tmYearSelect', '2023');
        const t0 = Date.now();
        await page.click('#btnWrapped');
        await page.waitForSelector('.wrapped-preview img', { timeout: 60000 });
        await page.waitForFunction(() => document.querySelector('.wrapped-preview img').naturalWidth > 0);
        const info = await page.evaluate(async () => {
            const img = document.querySelector('.wrapped-preview img');
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            // Centro de cada portada del top, a partir de las medidas reales de la composición
            const L = window._lastWrappedLayout,
                gap = 14,
                n = 5;
            const startY = L.topBottom - n * L.rowH - (n - 1) * gap;
            const coverW = Math.round((L.rowH - 12) * 0.7);
            const covers = [0, 1, 2, 3, 4].map(i => {
                const y = startY + i * (L.rowH + gap) + L.rowH / 2,
                    x = Math.round(80 + 6 + coverW / 2);
                const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
                const isPlaceholder = Math.abs(r - 0x16) < 4 && Math.abs(g - 0x17) < 4 && Math.abs(b - 0x2a) < 4;
                // Varianza en un bloque 20×20: una portada real tiene detalle; el hueco es plano.
                const block = ctx.getImageData(x - 10, y - 10, 20, 20).data;
                let min = 255,
                    max = 0;
                for (let k = 0; k < block.length; k += 4) {
                    const v = block[k] + block[k + 1] + block[k + 2];
                    min = Math.min(min, v);
                    max = Math.max(max, v);
                }
                return { isPlaceholder, contrast: max - min };
            });
            const r = img.getBoundingClientRect();
            return {
                w: img.naturalWidth,
                h: img.naturalHeight,
                covers,
                layout: L,
                fits: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
                toasts: document.getElementById('toastRegion')?.textContent || ''
            };
        });
        const realCovers = info.covers.filter(c => !c.isPlaceholder && c.contrast > 30).length;
        if (vp.n === 'movil') {
            check('Imagen de 1080×1920', info.w === 1080 && info.h === 1920, `${info.w}×${info.h}`);
            check('Las 5 portadas del top se dibujan de verdad (no huecos)', realCovers === 5, JSON.stringify(info.covers));
            check(
                'El top y los datos de abajo no se solapan (5 obras + 3 datos)',
                info.layout.topBottom + 30 <= info.layout.factsTop,
                JSON.stringify(info.layout)
            );
            check('Sin aviso de portadas fallidas', !info.toasts.includes('no se pudieron'), info.toasts.slice(0, 80));
            check('Generado en un tiempo razonable', Date.now() - t0 < 30000, `${Date.now() - t0} ms`);
        }
        check(`La vista previa entera cabe en pantalla (${vp.n})`, info.fits);
        await page.screenshot({ path: `${SHOTS}/wrapped-preview-${vp.n}.png` });
        if (vp.n === 'movil') {
            const b64 = await page.evaluate(async () => {
                const img = document.querySelector('.wrapped-preview img');
                const r = await fetch(img.src);
                const bl = await r.blob();
                return await new Promise(res => {
                    const fr = new FileReader();
                    fr.onload = () => res(fr.result.split(',')[1]);
                    fr.readAsDataURL(bl);
                });
            });
            fs.writeFileSync(`${SHOTS}/wrapped-real-2023.png`, Buffer.from(b64, 'base64'));

            // Inglés
            check(
                'Por defecto en español (nombre de archivo sin sufijo)',
                (await page.getAttribute('#wrappedDownload', 'download')) === 'OtakuHub_Wrapped_2023.png'
            );
            const coverRequests = [];
            page.on('request', r => {
                if (r.url().includes('s4.anilist.co')) coverRequests.push(r.url());
            });
            const esSrc = await page.getAttribute('.wrapped-preview img', 'src');
            await page.click('.wrapped-lang button[data-lang="en"]');
            await page.waitForFunction(
                src =>
                    document.querySelector('.wrapped-preview img').src !== src &&
                    document.querySelector('.wrapped-preview img').naturalWidth > 0,
                esSrc
            );
            check(
                'English: se vuelve a dibujar sin descargar otra vez las portadas',
                coverRequests.length === 0,
                `${coverRequests.length} peticiones`
            );
            check(
                'English: archivo con sufijo _en y botón marcado',
                (await page.getAttribute('#wrappedDownload', 'download')) === 'OtakuHub_Wrapped_2023_en.png' &&
                    (await page.getAttribute('.wrapped-lang button[data-lang="en"]', 'aria-pressed')) === 'true'
            );
            const L = await page.evaluate(() => window._lastWrappedLayout);
            check('English: tampoco se solapa', L.topBottom + 30 <= L.factsTop, JSON.stringify(L));
            const b64en = await page.evaluate(async () => {
                const img = document.querySelector('.wrapped-preview img');
                const r = await fetch(img.src);
                const bl = await r.blob();
                return await new Promise(res => {
                    const fr = new FileReader();
                    fr.onload = () => res(fr.result.split(',')[1]);
                    fr.readAsDataURL(bl);
                });
            });
            fs.writeFileSync(`${SHOTS}/wrapped-real-2023-en.png`, Buffer.from(b64en, 'base64'));
            await page.screenshot({ path: `${SHOTS}/wrapped-preview-movil-en.png` });
            // Recordar el idioma
            await page.keyboard.press('Escape');
            await page.click('#btnWrapped');
            await page.waitForFunction(() => document.querySelector('.wrapped-overlay')?.dataset.lang, null, { timeout: 60000 });
            check(
                'Recuerda el último idioma al volver a crear el Wrapped',
                (await page.evaluate(() => document.querySelector('.wrapped-overlay').dataset.lang)) === 'en'
            );
        }
        await context.close();
    }
    console.log(results.join('\n'));
    await browser.close();
    server.close();
})().catch(e => {
    console.error(e);
    console.log(results.join('\n'));
    process.exit(1);
});
