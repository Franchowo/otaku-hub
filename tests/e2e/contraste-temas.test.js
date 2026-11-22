// Auditoría de contraste en los temas claro y oscuro.
// Recorre las vistas con datos simulados y, para cada texto visible, calcula
// el contraste real entre su color y el fondo que tiene detrás (combinando
// las capas semitransparentes). Exige 4,5:1 al texto normal y 3:1 al grande
// (WCAG AA). No mide texto sobre degradados o imágenes (no se puede calcular
// con fiabilidad) ni la imagen del Wrapped o la tierlist (diseño propio).
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
    .listen(8782);

const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
const Y = new Date().getFullYear();
const MASTER = [
    ['Frieren', 'Fall', 2023, 'Madhouse', 10],
    ['Bocchi the Rock!', 'Fall', 2022, 'CloverWorks', 9],
    ['Dandadan', 'Fall', Y, 'Science SARU', 8],
    ['Kaiju', 'Spring', Y, 'Production I.G', 6],
    ['Flojo', 'Winter', 2021, 'Madhouse', 3]
].map(([anime, season, year, studio, score], i) => ({ anime, season, year, studio, score, _row: i + 3 }));
const VIEWS = [
    'hubView',
    'dataView',
    'formView',
    'mangaFormView',
    'detailView',
    'mangaLibraryView',
    'favoritesView',
    'statsView',
    'insightsView',
    'timeMachineView',
    'studiosView',
    'top150View',
    'annualRankingView',
    'rankerView',
    'planificadorView',
    'recommendationsView',
    'gachaView',
    'calificadorView'
];

// Se ejecuta en la página: devuelve los textos con contraste insuficiente de la vista activa.
function audit() {
    const parse = s => {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b, a = 1] = m[1].split(',').map(Number);
        return { r, g, b, a };
    };
    const over = (top, bottom) => ({
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1
    });
    const lum = c => {
        const f = v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
    };
    const pageBg = parse(getComputedStyle(document.body).backgroundColor);
    const failures = [];
    let measured = 0,
        skipped = 0;
    const view = document.querySelector('.view.active');
    const scope = [document.querySelector('.app-header'), document.getElementById('subNav'), document.getElementById('bottomNav'), view];
    for (const root of scope) {
        if (!root) continue;
        for (const el of root.querySelectorAll('*')) {
            const own = [...el.childNodes]
                .filter(n => n.nodeType === 3)
                .map(n => n.textContent.trim())
                .join(' ');
            // Solo texto con letras o cifras (los emoji no tienen color propio)
            if (!/[\p{L}\p{N}]/u.test(own)) continue;
            if (el.closest('[aria-hidden="true"], .wrapped-overlay, .tierlist-modal-overlay, svg, option, .skeleton')) continue;
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') continue;
            if (el.closest('[hidden]') || el.offsetParent === null) continue;
            if (style.webkitTextFillColor && style.webkitTextFillColor.includes('rgba(0, 0, 0, 0)')) continue; // texto con degradado
            // Pila de fondos hasta uno opaco; si hay un degradado/imagen en medio, no se puede medir.
            const layers = [];
            let node = el,
                unmeasurable = false;
            while (node && node.nodeType === 1) {
                const cs = getComputedStyle(node);
                if (cs.backgroundImage && cs.backgroundImage !== 'none') {
                    unmeasurable = true;
                    break;
                }
                const bg = parse(cs.backgroundColor);
                if (bg && bg.a > 0) {
                    layers.push(bg);
                    if (bg.a >= 1) break;
                }
                node = node.parentElement;
            }
            if (unmeasurable) {
                skipped++;
                continue;
            }
            measured++;
            let bg = pageBg;
            for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
            const fg = over(parse(style.color), bg);
            const size = parseFloat(style.fontSize),
                bold = parseInt(style.fontWeight, 10) >= 700;
            const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
            const r = ratio(fg, bg);
            if (r < need)
                failures.push({
                    text: own.slice(0, 40),
                    ratio: Math.round(r * 100) / 100,
                    need,
                    cls: (el.className || el.tagName).toString().slice(0, 40),
                    color: style.color
                });
        }
    }
    return { failures, measured, skipped };
}

(async () => {
    const browser = await chromium.launch();
    for (const theme of ['dark', 'light']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
        page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
        await page.route(/fonts\.|cdnjs/, r => r.fulfill({ status: 200, body: '' }));
        await page.route(/graphql\.anilist|animethemes/, r =>
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
            const sh = u.searchParams.get('sheet');
            const data =
                u.searchParams.get('action') === 'ping'
                    ? { status: 'success', auth: 'ok' }
                    : {
                          status: 'success',
                          data:
                              sh === 'FULL LIST MANGA'
                                  ? [{ 'Manga Title': 'Berserk', Year: 1989, Author: 'Kentaro Miura', Score: 10 }]
                                  : sh
                                    ? []
                                    : MASTER
                      };
            r.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}(${JSON.stringify(data)})` });
        });
        await page.addInitScript(() => {
            try {
                localStorage.setItem('otaku_hub_access_key', 'k');
                localStorage.setItem('annual_ranking_data', JSON.stringify([{ id: 1, name: 'Frieren', score: 10 }]));
            } catch (e) {}
        });
        await page.goto('http://localhost:8782/');
        await page.waitForTimeout(800);
        const effective = await page.evaluate(() => effectiveTheme());
        check(`Tema ${theme}: la app sigue al sistema en modo automático`, effective === theme, effective);
        let total = 0,
            totalMeasured = 0,
            totalSkipped = 0;
        const samples = [];
        for (const v of VIEWS) {
            await page.evaluate(id => switchView(id), v);
            await page.waitForTimeout(700);
            if (v === 'top150View') await page.evaluate(() => openTop150());
            const { failures: fails, measured, skipped } = await page.evaluate(audit);
            totalMeasured += measured;
            totalSkipped += skipped;
            total += fails.length;
            if (process.env.CONTRAST_DUMP)
                fails.forEach(f => console.log(`DUMP ${theme}\t${v}\t${f.color}\t${f.cls}\t${f.ratio}\t${f.text}`));
            fails.slice(0, 3).forEach(f => samples.push(`${v}: "${f.text}" ${f.ratio}:1 (<${f.need}) .${f.cls} ${f.color}`));
            if (v === 'hubView' || v === 'statsView' || v === 'insightsView' || v === 'annualRankingView')
                await page.screenshot({ path: `${SHOTS}/tema-${theme}-${v}.png` });
        }
        check(
            `Tema ${theme}: la auditoría mide la gran mayoría de textos`,
            totalMeasured > 300 && totalSkipped < totalMeasured * 0.15,
            `${totalMeasured} medidos, ${totalSkipped} sobre degradado/imagen`
        );
        check(
            `Tema ${theme}: todos los textos medidos cumplen el contraste WCAG AA (${VIEWS.length} vistas)`,
            total === 0,
            total ? `${total} textos: ${samples.slice(0, 12).join(' | ')}` : ''
        );
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
