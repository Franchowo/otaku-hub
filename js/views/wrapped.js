// =====================================================================
// WRAPPED ANUAL
// Imagen vertical 1080×1920 (formato historia) con el resumen de un año:
// cuántos animes y mangas, tu media, tu top 5 con portadas, tu género y
// estudio del año y tu opinión más "impopular". Se descarga o se comparte.
// El año es el de emisión, igual que en la Cápsula del tiempo.
//
// Se dibuja directamente en un <canvas> (antes era HTML + html2canvas):
// - La composición se calcula para que todo quepa siempre (antes, con 5
//   obras y 3 datos, el contenido medía más que la tarjeta y se cortaba).
// - Las portadas se descargan en modo CORS y sin pasar por la caché del
//   navegador: el CDN de AniList solo envía la cabecera CORS cuando la
//   petición la pide (Vary: origin), así que las portadas ya cacheadas por
//   la app no servían para dibujarlas y salían vacías. Si una falla, se
//   dibuja un hueco y la imagen sigue siendo exportable.
// =====================================================================

const WRAPPED_W = 1080,
    WRAPPED_H = 1920,
    WRAPPED_PAD = 80;
const WRAPPED_FONT = 'Inter, "Segoe UI", Roboto, Arial, sans-serif';

// Portadas grandes (extraLarge) por ID; las no vinculadas, de la caché de portadas.
async function wrappedCoverUrls(animes) {
    const ids = animes.map(a => a.anilistId).filter(Boolean);
    const byId = {};
    if (ids.length) {
        try {
            const json = await fetchAnilist(
                `query($ids: [Int]) { Page(page: 1, perPage: 10) { media(id_in: $ids, type: ANIME) { id coverImage { extraLarge large } } } }`,
                { ids }
            );
            (json?.data?.Page?.media || []).forEach(m => {
                byId[m.id] = m.coverImage?.extraLarge || m.coverImage?.large;
            });
        } catch (e) {
            /* sin conexión: caché */
        }
    }
    return animes.map(a => {
        if (a.anilistId && byId[a.anilistId]) return byId[a.anilistId];
        const cached = a.anilistId && localStorage.getItem(`cover_id_${a.anilistId}`);
        if (cached) return cached;
        const safe = String(a.anime)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        const key = Object.keys(localStorage).find(k => k.startsWith(`anime_cover_v5_${safe}_`));
        return (key && localStorage.getItem(key)) || null;
    });
}

// Descarga una imagen apta para dibujar en el canvas sin "contaminarlo".
// Devuelve un ImageBitmap o null.
async function loadDrawableImage(url) {
    if (!url || !/^https?:/.test(url)) return null;
    const bust = url + (url.includes('?') ? '&' : '?') + 'nocache=' + Date.now(); // "nocache": el Service Worker no la intercepta
    try {
        const res = await fetch(bust, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
        if (!res.ok) return null;
        return await createImageBitmap(await res.blob());
    } catch (e) {
        return null;
    }
}

function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Recorta el texto con "…" para que quepa en maxWidth.
function fitText(ctx, text, maxWidth) {
    text = String(text ?? '');
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0,
        hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(text.slice(0, mid).trimEnd() + '…').width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + '…';
}

// Dibuja la imagen recortada para cubrir el rectángulo (como object-fit: cover).
function drawCover(ctx, img, x, y, w, h, r) {
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
    if (img) {
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale,
            dh = img.height * scale;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
        ctx.fillStyle = '#16172a';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#00f0ff';
        ctx.font = `700 ${Math.round(h / 3)}px ${WRAPPED_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + w / 2, y + h / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
}

// Textos de la imagen en cada idioma (la interfaz de la app sigue en español).
const WRAPPED_TEXT = {
    es: {
        subtitle: 'MI AÑO EN ANIME Y MANGA',
        anime: n => (n === 1 ? 'anime' : 'animes'),
        manga: n => (n === 1 ? 'manga' : 'mangas'),
        avg: 'nota media',
        top: n => `MI TOP ${n}`,
        genre: 'Género del año',
        studio: 'Estudio del año',
        take: d => `Mi opinión más ${d > 0 ? 'generosa' : 'dura'}`,
        genreName: g => (typeof GENRE_LABELS !== 'undefined' && GENRE_LABELS[g]) || g
    },
    en: {
        subtitle: 'MY YEAR IN ANIME & MANGA',
        anime: () => 'anime',
        manga: () => 'manga',
        avg: 'avg. score',
        top: n => `MY TOP ${n}`,
        genre: 'Genre of the year',
        studio: 'Studio of the year',
        take: d => (d > 0 ? 'My most generous take' : 'My harshest take'),
        genreName: g => g // AniList da los géneros en inglés
    }
};

// data: { year, animes, mangas, avg, top: [{ title, score, img }], genre, studio, hot: { title, d } }
function drawWrapped(data, lang = 'es') {
    const T = WRAPPED_TEXT[lang] || WRAPPED_TEXT.es;
    const facts = [];
    if (data.genre) facts.push({ label: T.genre, value: T.genreName(data.genre), half: true });
    if (data.studio) facts.push({ label: T.studio, value: data.studio, half: true });
    if (data.hot)
        facts.push({
            label: T.take(data.hot.d),
            value: data.hot.title,
            extra: `${signed(data.hot.d)} vs AniList`,
            extraColor: data.hot.d > 0 ? '#86b6ef' : '#f19a9a'
        });
    const canvas = document.createElement('canvas');
    canvas.width = WRAPPED_W;
    canvas.height = WRAPPED_H;
    const ctx = canvas.getContext('2d');
    const P = WRAPPED_PAD,
        inner = WRAPPED_W - P * 2;
    const font = (weight, size) => `${weight} ${size}px ${WRAPPED_FONT}`;

    // Fondo
    ctx.fillStyle = '#05050c';
    ctx.fillRect(0, 0, WRAPPED_W, WRAPPED_H);
    const glow = (x, y, r, color) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, WRAPPED_W, WRAPPED_H);
    };
    glow(200, 180, 900, 'rgba(189, 0, 255, 0.38)');
    glow(980, 1650, 1000, 'rgba(0, 240, 255, 0.22)');

    // Cabecera
    let y = 130;
    ctx.fillStyle = '#00f0ff';
    ctx.font = font(900, 40);
    ctx.fillText('W R A P P E D', P, y);
    y += 230;
    ctx.fillStyle = '#ffffff';
    ctx.font = font(900, 230);
    ctx.fillText(String(data.year), P - 8, y);
    y += 70;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = font(600, 38);
    ctx.fillText(T.subtitle, P, y);

    // Cifras
    y += 50;
    const boxW = (inner - 2 * 28) / 3,
        boxH = 180;
    [
        [data.animes, T.anime(data.animes)],
        [data.mangas, T.manga(data.mangas)],
        [data.avg, T.avg]
    ].forEach(([value, label], i) => {
        const x = P + i * (boxW + 28);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        roundRectPath(ctx, x, y, boxW, boxH, 28);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = font(900, 92);
        ctx.fillText(fitText(ctx, value, boxW - 60), x + 30, y + 108);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = font(500, 32);
        ctx.fillText(label, x + 30, y + 150);
    });
    y += boxH + 80;

    // Datos del año, anclados abajo. Género y estudio comparten fila; la
    // opinión ocupa todo el ancho (su diferencia de nota siempre se ve).
    const factH = 118,
        factGap = 18;
    const half = facts.filter(f => f.half),
        full = facts.filter(f => !f.half);
    const factRows = (half.length ? 1 : 0) + full.length;
    const factsTop = WRAPPED_H - P - factRows * factH - Math.max(0, factRows - 1) * factGap;

    // Top: la altura de fila sale del espacio libre, así nunca pisa los datos de abajo.
    ctx.fillStyle = '#ff4fa3';
    ctx.font = font(800, 36);
    ctx.fillText(T.top(data.top.length), P, y);
    y += 28;
    const gap = 14,
        n = Math.max(1, data.top.length);
    const rowH = Math.max(84, Math.min(140, Math.floor((factsTop - 48 - y - gap * (n - 1)) / n)));
    const coverH = rowH - 12,
        coverW = Math.round(coverH * 0.7);
    data.top.forEach((item, i) => {
        const ry = y + i * (rowH + gap);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundRectPath(ctx, P, ry, inner, rowH, 22);
        ctx.fill();
        drawCover(ctx, item.img, P + 6, ry + 6, coverW, coverH, 14);
        ctx.fillStyle = '#00f0ff';
        ctx.font = font(900, 54);
        ctx.fillText(String(i + 1), P + coverW + 34, ry + rowH / 2 + 19);
        ctx.font = font(700, 30);
        const scoreText = `${item.score} ★`;
        const scoreW = ctx.measureText(scoreText).width;
        ctx.fillStyle = '#ffd34d';
        ctx.fillText(scoreText, P + inner - 28 - scoreW, ry + rowH / 2 + 11);
        ctx.fillStyle = '#ffffff';
        ctx.font = font(700, 40);
        const titleX = P + coverW + 100;
        ctx.fillText(fitText(ctx, item.title, P + inner - 56 - scoreW - titleX), titleX, ry + rowH / 2 + 14);
    });
    const topBottom = y + n * rowH + (n - 1) * gap;

    const drawFact = (fact, x, fy, w) => {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        roundRectPath(ctx, x, fy, w, factH, 24);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = font(600, 28);
        ctx.fillText(fitText(ctx, fact.label.toUpperCase(), w - 64), x + 32, fy + 44);
        let extraW = 0;
        if (fact.extra) {
            ctx.font = font(700, 34);
            extraW = ctx.measureText(fact.extra).width + 24;
            ctx.fillStyle = fact.extraColor || 'rgba(255,255,255,0.85)';
            ctx.fillText(fact.extra, x + w - 32 - ctx.measureText(fact.extra).width, fy + 94);
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = font(800, 42);
        ctx.fillText(fitText(ctx, fact.value, w - 64 - extraW), x + 32, fy + 94);
    };
    let fy = factsTop;
    if (half.length) {
        const w = half.length === 2 ? (inner - factGap) / 2 : inner;
        half.forEach((f, i) => drawFact(f, P + i * (w + factGap), fy, w));
        fy += factH + factGap;
    }
    full.forEach(f => {
        drawFact(f, P, fy, inner);
        fy += factH + factGap;
    });

    // Para las pruebas: zonas ocupadas (no deben solaparse).
    canvas.dataset.layout = JSON.stringify({ topBottom, factsTop, rowH });
    return canvas;
}

async function createWrapped(yearValue) {
    const year = parseInt(yearValue, 10);
    if (!year) return;
    const btn = document.getElementById('btnWrapped');
    btn.disabled = true;
    btn.textContent = 'Preparando tu Wrapped… ⏳';
    try {
        const animes = _masterData.filter(a => parseInt(a.year, 10) === year);
        const mangas = _mangaData.filter(m => parseInt(m.year, 10) === year);
        if (!animes.length && !mangas.length) return toast(`No hay nada registrado de ${year}.`, { type: 'info' });

        const top = animes
            .slice()
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        const avg = animes.length ? animes.reduce((s, a) => s + (parseFloat(a.score) || 0), 0) / animes.length : null;
        const studios = {};
        animes.forEach(a =>
            String(a.studio || '')
                .split(/,|\s+&\s+|\s+and\s+/i)
                .map(s => s.trim())
                .filter(s => s && s !== 'Desconocido')
                .forEach(s => {
                    studios[s] = (studios[s] || 0) + 1;
                })
        );
        const topStudio = Object.entries(studios).sort((a, b) => b[1] - a[1])[0];

        const meta = await loadMediaMeta('ANIME', animes.map(a => a.anilistId).filter(Boolean));
        const genres = {};
        animes.forEach(a =>
            ((meta[a.anilistId] && meta[a.anilistId].genres) || []).forEach(g => {
                genres[g] = (genres[g] || 0) + 1;
            })
        );
        const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];
        const diffs = animes
            .filter(a => meta[a.anilistId] && meta[a.anilistId].averageScore)
            .map(a => ({ a, d: parseFloat(a.score) - meta[a.anilistId].averageScore }));
        const hot = diffs.sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];

        btn.textContent = 'Descargando portadas… ⏳';
        const urls = await wrappedCoverUrls(top);
        const images = await Promise.all(urls.map(loadDrawableImage));
        if (document.fonts && document.fonts.load) {
            try {
                await Promise.all([document.fonts.load(`900 100px Inter`), document.fonts.load(`700 40px Inter`)]);
            } catch (e) {
                /* fuente del sistema */
            }
        }

        // Datos neutros: el texto de cada idioma se pone al dibujar (cambiar de idioma no vuelve a descargar nada).
        const data = {
            year,
            animes: animes.length,
            mangas: mangas.length,
            avg: avg !== null ? fmt1(avg) : '–',
            top: top.map((a, i) => ({ title: a.anime, score: a.score, img: images[i] })),
            genre: topGenre ? topGenre[0] : null,
            studio: topStudio ? topStudio[0] : null,
            hot: hot ? { title: hot.a.anime, d: hot.d } : null
        };
        const missing = images.filter(img => !img).length;
        if (missing && top.length)
            toast(`${missing} de ${top.length} portadas no se pudieron descargar (se muestra un hueco).`, { type: 'info' });
        showWrappedPreview(data);
    } catch (err) {
        toast(`No se pudo crear el Wrapped: ${err.message}`, { type: 'error' });
    } finally {
        btn.disabled = false;
        btn.textContent = `🎁 Crear mi Wrapped ${year}`;
    }
}

const WRAPPED_LANG_KEY = 'wrapped_lang';

function showWrappedPreview(data) {
    closeWorkSheet();
    const year = data.year;
    const overlay = document.createElement('div');
    overlay.className = 'wrapped-overlay';
    overlay.id = 'workSheetOverlay';
    overlay.innerHTML = `
        <div class="wrapped-preview" role="dialog" aria-modal="true" aria-label="Tu Wrapped ${year}">
            <div class="wrapped-lang" role="group" aria-label="Idioma de la imagen">
                <button type="button" data-lang="es">Español</button>
                <button type="button" data-lang="en">English</button>
            </div>
            <img alt="Tu Wrapped de ${year}">
            <div class="wrapped-actions">
                <a class="chip-btn accent-cyan" id="wrappedDownload">💾 Descargar</a>
                <button type="button" class="chip-btn accent-magenta" id="wrappedShare" hidden>📤 Compartir</button>
                <button type="button" class="chip-btn accent-red" onclick="closeWorkSheet()">✕ Cerrar</button>
            </div>
        </div>`;
    let url = null,
        file = null;
    // Escape se escucha en todo el documento (el foco puede no estar dentro de la ventana).
    const onKey = e => {
        if (e.key === 'Escape') closeWorkSheet();
    };
    document.addEventListener('keydown', onKey);
    overlay._cleanup = () => {
        if (url) URL.revokeObjectURL(url);
        document.removeEventListener('keydown', onKey);
    };
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeWorkSheet();
    });

    const share = overlay.querySelector('#wrappedShare');
    share.onclick = () => file && navigator.share({ files: [file], title: `Wrapped ${year}` }).catch(() => {});

    const render = lang => {
        overlay.querySelectorAll('.wrapped-lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
        try {
            localStorage.setItem(WRAPPED_LANG_KEY, lang);
        } catch (e) {}
        const canvas = drawWrapped(data, lang);
        window._lastWrappedLayout = JSON.parse(canvas.dataset.layout);
        canvas.toBlob(blob => {
            if (!document.body.contains(overlay)) return;
            if (url) URL.revokeObjectURL(url);
            const name = `OtakuHub_Wrapped_${year}${lang === 'en' ? '_en' : ''}.png`;
            url = URL.createObjectURL(blob);
            file = new File([blob], name, { type: 'image/png' });
            overlay.querySelector('img').src = url;
            overlay.querySelector('img').alt = lang === 'en' ? `Your ${year} Wrapped` : `Tu Wrapped de ${year}`;
            const dl = overlay.querySelector('#wrappedDownload');
            dl.href = url;
            dl.download = name;
            share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
            overlay.dataset.lang = lang;
        }, 'image/png');
    };
    overlay.querySelectorAll('.wrapped-lang button').forEach(b => b.addEventListener('click', () => render(b.dataset.lang)));
    let saved = null;
    try {
        saved = localStorage.getItem(WRAPPED_LANG_KEY);
    } catch (e) {
        /* almacenamiento bloqueado */
    }
    render(saved === 'en' ? 'en' : 'es'); // el último idioma que usaste
    overlay.querySelector('.wrapped-lang button[aria-pressed="true"]').focus();
}
