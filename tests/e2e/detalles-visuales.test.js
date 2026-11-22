// Detalles visuales: ficha teñida con el color de la portada, portada que
// "vuela" de la tarjeta a la ficha (y vuelve), dirección de la transición
// entre pantallas y pantallas vacías con ilustración y acción.
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
    .listen(8783);

const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
const COVER_PNG = fs.readFileSync(path.join(ROOT, 'assets/icons/icon-512.png'));
const MASTER = [
    { anime: 'Frieren', season: 'Fall', year: 2023, studio: 'Madhouse', score: 10, anilistid: 154587, _row: 3 },
    { anime: 'Bocchi the Rock!', season: 'Fall', year: 2022, studio: 'CloverWorks', score: 9, anilistid: 130003, _row: 4 }
];

async function setup(browser, opts = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    const page = await context.newPage();
    page.on('pageerror', e => results.push(`⚠️ pageerror: ${e.message}`));
    await page.route(/fonts\.|cdnjs/, r => r.fulfill({ status: 200, body: '' }));
    await page.route(/img\.test/, r =>
        r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: COVER_PNG })
    );
    await page.route(/graphql\.anilist/, r => {
        const { query } = JSON.parse(r.request().postData());
        const data = query.includes('Media(id: $id, search: $search')
            ? {
                  Media: {
                      id: 154587,
                      siteUrl: 'https://anilist.co/anime/154587',
                      episodes: 28,
                      averageScore: 91,
                      genres: ['Adventure'],
                      coverImage: { large: 'https://img.test/frieren.png', color: '#e4a15d' },
                      description: 'Una elfa maga.',
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
            const data = body.sheet ? [] : opts.emptyCollection ? [] : MASTER;
            return r.fulfill({
                status: 200,
                headers: cors,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'success', data })
            });
        }
        const u = new URL(req.url());
        const cb = u.searchParams.get('callback');
        r.fulfill({
            status: 200,
            contentType: 'text/javascript',
            body: `${cb}(${JSON.stringify({ status: 'success', auth: 'ok', version: 5 })})`
        });
    });
    await page.addInitScript(() => {
        localStorage.setItem('otaku_hub_access_key', 'k');
        localStorage.setItem('cover_id_154587', 'https://img.test/frieren.png');
        localStorage.setItem('cover_id_130003', 'https://img.test/bocchi.png');
    });
    await page.goto('http://localhost:8783/');
    await page.waitForTimeout(600);
    return { page, context };
}

// Abre la colección y espera a que la portada de Frieren esté cargada.
async function openCollection(page) {
    await page.evaluate(() => switchView('detailView'));
    await page.waitForFunction(() => {
        const img = document.querySelector('#detailGridContainer .detail-card img');
        return img && img.complete && img.naturalWidth > 0 && img.src.startsWith('https://img.test');
    });
}

(async () => {
    const browser = await chromium.launch();

    // --- Ficha: color de portada y animaciones ---------------------------
    for (const theme of ['dark', 'light']) {
        const { page, context } = await setup(browser, { colorScheme: theme });
        await openCollection(page);
        if (theme === 'dark') {
            await page.click('#detailGridContainer .detail-card');
            const opening = await page.evaluate(() => ({
                ghost: !!document.querySelector('.fly-ghost'),
                targetHidden: document.getElementById('workSheetCover').style.opacity === '0',
                cardHidden: document.querySelector('#detailGridContainer .detail-card img').style.visibility === 'hidden',
                coverNow: document.getElementById('workSheetCover').src
            }));
            check('Al abrir la ficha, la portada vuela desde la tarjeta', opening.ghost && opening.targetHidden && opening.cardHidden);
            // A mitad de vuelo: se anima tamaño y posición (sin escalar), así la portada no se deforma
            await page.waitForTimeout(200);
            const mid = await page.evaluate(() => {
                const g = document.querySelector('.fly-ghost');
                const cs = g && getComputedStyle(g);
                return g && { transform: cs.transform, fit: cs.objectFit, w: g.getBoundingClientRect().width };
            });
            check(
                'La portada vuela sin deformarse (cambia de tamaño, no se estira)',
                mid && mid.transform === 'none' && mid.fit === 'cover' && mid.w > 70,
                JSON.stringify(mid)
            );
            check(
                'La ficha muestra ya la portada de la tarjeta (sin esperar a AniList)',
                opening.coverNow.startsWith('https://img.test'),
                opening.coverNow
            );
            await page.waitForTimeout(600);
            const settled = await page.evaluate(() => ({
                ghost: !!document.querySelector('.fly-ghost'),
                opacity: document.getElementById('workSheetCover').style.opacity
            }));
            check('Al terminar, la copia desaparece y se ve la portada real', !settled.ghost && settled.opacity === '');
            check(
                'La tarjeta vuelve a mostrar su portada tras el vuelo',
                await page.evaluate(() => document.querySelector('#detailGridContainer .detail-card img').style.visibility === '')
            );
        } else {
            await page.evaluate(() => openWorkSheet('anime', 'row:3'));
            await page.waitForTimeout(600);
        }

        await page.waitForFunction(() => document.querySelector('.work-sheet--tinted'));
        const tint = await page.evaluate(() => ({
            value: document.querySelector('.work-sheet').style.getPropertyValue('--work-tint'),
            saved: localStorage.getItem('cover_color_154587'),
            border: getComputedStyle(document.querySelector('.work-sheet')).borderTopColor
        }));
        check(
            `Tema ${theme}: la ficha toma el color de la portada de AniList`,
            tint.value === '228, 161, 93' && tint.border.startsWith('rgba(228, 161, 93'),
            `${tint.value} · ${tint.border}`
        );
        check(`Tema ${theme}: el color se guarda para la próxima vez`, tint.saved === '#e4a15d');
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SHOTS}/visual-ficha-${theme}.png` });

        if (theme === 'dark') {
            await page.keyboard.press('Escape');
            const closing = await page.evaluate(() => ({
                real: !!document.getElementById('workSheetOverlay'),
                ghostOverlay: !!document.querySelector('.sheet-overlay--closing'),
                flying: !!document.querySelector('.fly-ghost')
            }));
            check('Al cerrar, la ficha se quita al momento y se desvanece una copia', !closing.real && closing.ghostOverlay);
            check('Al cerrar, la portada vuelve volando a su tarjeta', closing.flying);
            await page.waitForTimeout(600);
            const after = await page.evaluate(() => ({
                leftovers: document.querySelectorAll('.sheet-overlay, .fly-ghost').length,
                cardVisible: document.querySelector('#detailGridContainer .detail-card img').style.visibility === ''
            }));
            check('Tras cerrar no queda nada encima y la tarjeta se ve', after.leftovers === 0 && after.cardVisible);

            // Segunda apertura: el color sale al instante (guardado)
            await page.route(/graphql\.anilist/, () => {}); // AniList no responde
            await page.evaluate(() => openWorkSheet('anime', 'row:3'));
            const instant = await page.evaluate(() => !!document.querySelector('.work-sheet--tinted'));
            check('Al volver a abrirla, el color sale al instante aunque AniList no responda', instant);
            await page.evaluate(() => closeWorkSheet());

            // Dirección de las transiciones entre pantallas
            const dirs = await page.evaluate(async () => {
                const out = [];
                const wait = () => new Promise(r => setTimeout(r, 150));
                switchView('statsView');
                await wait();
                out.push(document.getElementById('mainContainer').dataset.navDir);
                switchView('detailView');
                await wait();
                out.push(document.getElementById('mainContainer').dataset.navDir);
                return out;
            });
            check(
                'Avanzar en el menú entra por la derecha y volver por la izquierda',
                dirs[0] === 'forward' && dirs[1] === 'back',
                dirs.join(' / ')
            );

            // Cascada de tarjetas: solo al entrar en la pantalla, no al filtrar
            const entering = await page.evaluate(() => document.getElementById('mainContainer').classList.contains('view-entering'));
            await page.fill('#detailFilterText', 'fri');
            const afterTyping = await page.evaluate(() => document.getElementById('mainContainer').classList.contains('view-entering'));
            check('Las tarjetas entran en cascada al llegar, y no se repite al escribir un filtro', entering && !afterTyping);

            // Cambio de tema animado (círculo desde el botón 🌓)
            await page.evaluate(() => {
                localStorage.removeItem('otaku_theme');
                applyTheme('auto');
            });
            await page.click('#themeToggle');
            await page.waitForTimeout(800);
            const themeNow = await page.evaluate(() => ({ mode: currentThemeMode(), attr: document.documentElement.dataset.theme }));
            check(
                'El botón de tema cambia de tema con su animación sin errores',
                themeNow.mode === 'light' && themeNow.attr === 'light',
                JSON.stringify(themeNow)
            );
        }
        await context.close();
    }

    // --- Movimiento reducido: sin animaciones de vuelo ---------------------
    {
        const { page, context } = await setup(browser, { reducedMotion: 'reduce' });
        await openCollection(page);
        await page.click('#detailGridContainer .detail-card');
        const r = await page.evaluate(() => ({
            ghost: !!document.querySelector('.fly-ghost'),
            opacity: document.getElementById('workSheetCover').style.opacity
        }));
        check('Con "reducir movimiento" la portada no vuela (aparece directamente)', !r.ghost && r.opacity === '');
        await page.keyboard.press('Escape');
        const leftovers = await page.evaluate(() => document.querySelectorAll('.sheet-overlay, .fly-ghost').length);
        check('Con "reducir movimiento" la ficha se cierra sin copias animadas', leftovers === 0);
        await context.close();
    }

    // --- Pantallas vacías -------------------------------------------------
    {
        const { page, context } = await setup(browser);
        await page.evaluate(() => switchView('detailView'));
        await page.waitForSelector('#detailGridContainer .detail-card');
        await page.fill('#detailFilterText', 'zzzz');
        await page.evaluate(() => applyDetailFilters());
        const empty = await page.evaluate(() => {
            const es = document.querySelector('#detailGridContainer .empty-state');
            return (
                es && {
                    title: es.querySelector('.empty-title').textContent,
                    art: !!es.querySelector('svg[aria-hidden="true"]'),
                    btn: es.querySelector('button')?.textContent
                }
            );
        });
        check(
            'Colección sin coincidencias: ilustración, título y botón "Quitar filtros"',
            empty && empty.art && /coincide/.test(empty.title) && /Quitar filtros/.test(empty.btn),
            JSON.stringify(empty)
        );
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SHOTS}/visual-vacio-filtros.png` });
        await page.click('#detailGridContainer .empty-state button');
        const restored = await page.evaluate(() => ({
            cards: document.querySelectorAll('#detailGridContainer .detail-card').length,
            text: document.getElementById('detailFilterText').value
        }));
        check(
            '"Quitar filtros" vuelve a mostrar toda la colección',
            restored.cards === 2 && restored.text === '',
            JSON.stringify(restored)
        );

        await page.evaluate(() => {
            localStorage.setItem('annual_ranking_data', '[]');
            switchView('annualRankingView');
        });
        await page.waitForSelector('#annualRankingList .empty-state');
        await page.click('#annualRankingList .empty-state button');
        await page.waitForTimeout(400);
        const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
        check('Ranking Anual vacío: el botón lleva al buscador', focused === 'annualSearchInput', focused);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SHOTS}/visual-vacio-anual.png` });
        await context.close();
    }
    {
        const { page, context } = await setup(browser, { emptyCollection: true, colorScheme: 'light' });
        await page.evaluate(() => switchView('detailView'));
        await page.waitForSelector('#detailGridContainer .empty-state');
        const first = await page.evaluate(() => document.querySelector('#detailGridContainer .empty-state button').textContent);
        check('Colección vacía: invita a añadir el primer anime', /primer anime/.test(first), first);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SHOTS}/visual-vacio-coleccion-claro.png` });
        await page.click('#detailGridContainer .empty-state button');
        await page.waitForTimeout(300);
        const view = await page.evaluate(() => document.querySelector('.view.active').id);
        check('…y el botón abre el formulario de registro', view === 'formView', view);
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
