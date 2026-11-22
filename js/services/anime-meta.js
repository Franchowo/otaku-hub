// =====================================================================
// DATOS DE ANILIST DE TU COLECCIÓN (géneros, media mundial, formato)
// ---------------------------------------------------------------------
// Para las obras vinculadas (columna "AniList ID") se piden 50 por consulta
// y se guardan en el dispositivo 7 días. Las no vinculadas no entran en
// los análisis que dependen de AniList (se indica cuántas faltan).
// =====================================================================

const META_TTL_MS = 7 * 24 * 3600 * 1000;
const META_BATCH = 50;

async function loadMediaMeta(type, ids, onProgress) {
    const key = `meta_${type.toLowerCase()}`;
    const snapshot = await loadSheetSnapshot(key);
    const fresh = snapshot && Date.now() - snapshot.savedAt < META_TTL_MS;
    const meta = fresh ? { ...snapshot.data } : {};
    const missing = [...new Set(ids)].filter(id => id && !meta[id]);

    for (let i = 0; i < missing.length; i += META_BATCH) {
        const batch = missing.slice(i, i + META_BATCH);
        if (onProgress) onProgress(Math.min(i + META_BATCH, missing.length), missing.length);
        try {
            const json = await fetchAnilist(
                `query($ids: [Int]) { Page(page: 1, perPage: 50) { media(id_in: $ids, type: ${type}) { id averageScore genres format } } }`,
                { ids: batch });
            (json?.data?.Page?.media || []).forEach(m => {
                meta[m.id] = { averageScore: m.averageScore ? m.averageScore / 10 : null, genres: m.genres || [], format: m.format };
            });
        } catch (err) {
            if (err.message === 'RATE_LIMIT') { await new Promise(r => setTimeout(r, 60000)); i -= META_BATCH; continue; }
            break;   // sin conexión: se usa lo que haya
        }
        if (i + META_BATCH < missing.length) await new Promise(r => setTimeout(r, 800));
    }
    if (missing.length || !fresh) saveSheetSnapshot(key, meta);
    return meta;
}
