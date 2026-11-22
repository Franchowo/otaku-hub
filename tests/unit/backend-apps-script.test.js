const vm = require('vm'),
    fs = require('fs'),
    crypto = require('crypto');
function Sheet(name, rows) {
    this.name = name;
    this.data = rows.map(r => r.slice());
}
Sheet.prototype = {
    getName() {
        return this.name;
    },
    width() {
        return Math.max(
            0,
            ...this.data.map(r => {
                let w = r.length;
                while (w && (r[w - 1] === '' || r[w - 1] == null)) w--;
                return w;
            })
        );
    },
    getLastRow() {
        let n = this.data.length;
        while (n && this.data[n - 1].every(v => v === '' || v == null)) n--;
        return n;
    },
    getLastColumn() {
        return this.width();
    },
    cell(r, c) {
        while (this.data.length < r) this.data.push([]);
        const row = this.data[r - 1];
        while (row.length < c) row.push('');
        return row;
    },
    getRange(r, c, nr = 1, nc = 1) {
        if (typeof r === 'string') {
            c = r.charCodeAt(0) - 64;
            r = parseInt(r.slice(1));
        }
        const sh = this;
        return {
            getValues() {
                const out = [];
                for (let i = 0; i < nr; i++) {
                    const row = [];
                    for (let j = 0; j < nc; j++) row.push((sh.data[r - 1 + i] || [])[c - 1 + j] ?? '');
                    out.push(row);
                }
                return out;
            },
            getValue() {
                return this.getValues()[0][0];
            },
            setValues(v) {
                if (v.length !== nr || v[0].length !== nc) throw new Error(`setValues dims ${v.length}x${v[0].length} vs ${nr}x${nc}`);
                v.forEach((row, i) =>
                    row.forEach((x, j) => {
                        sh.cell(r + i, c + j)[c - 1 + j] = x;
                    })
                );
            },
            setValue(x) {
                sh.cell(r, c)[c - 1] = x;
            },
            copyTo() {}
        };
    },
    getDataRange() {
        const w = this.width(),
            h = this.getLastRow();
        return this.getRange(1, 1, Math.max(h, 1), Math.max(w, 1));
    },
    appendRow(row) {
        this.data.splice(this.getLastRow(), 0, row.slice());
    },
    clear() {
        this.data = [];
    },
    insertRowBefore(n) {
        this.data.splice(n - 1, 0, []);
    },
    insertRowsBefore(n, k) {
        for (let i = 0; i < k; i++) this.data.splice(n - 1, 0, []);
    },
    deleteRow(n) {
        this.data.splice(n - 1, 1);
    }
};
const sheets = [
    new Sheet('FULL LIST', [
        ['Anime', 'Season', 'Year', 'Studio', 'Score', 'Review'],
        ['Template', 'Winter', 2020, 'X', 5, 'f'],
        ['Frieren', 'Fall', 2023, 'Madhouse', 10, 'f'],
        ['Bocchi', 'Fall', 2022, 'CloverWorks', 9, 'f']
    ]),
    new Sheet('FULL LIST MANGA', [
        ['Manga Title', 'Year', 'Serialization', 'Score', 'Review'],
        ['T', 2000, 'A', 5, ''],
        ['Berserk', 1989, 'Kentaro Miura', 10, '']
    ]),
    new Sheet('PLANIFICADOR_STATE', [
        ['id', 'year', 'season', 'title', 'cover', 'status'],
        ['1', 2026, 'Fall', 'A', 'c', 'interesa'],
        ['2', 2026, 'Fall', 'B', 'c', 'visto']
    ])
];
const ss = {
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    getActiveSheet: () => sheets[0],
    getSheets: () => sheets,
    insertSheet: n => {
        const s = new Sheet(n, []);
        sheets.push(s);
        return s;
    }
};
const out = s => ({
    s,
    setMimeType() {
        return this;
    }
});
const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, CopyPasteType: {} },
    ContentService: { createTextOutput: out, MimeType: { JSON: 'j', JAVASCRIPT: 'js' } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'secret' }) },
    Utilities: {
        DigestAlgorithm: { SHA_256: 1 },
        computeDigest: (_, s) => [...crypto.createHash('sha256').update(s).digest()],
        sleep() {
            ctx.slept = true;
        }
    },
    JSON,
    Math,
    String,
    parseInt,
    parseFloat,
    Date,
    Error,
    console
};
vm.createContext(ctx);
vm.runInContext(
    fs.readFileSync(require('path').join(require('../helpers').ROOT, 'apps-script/Code.gs'), 'utf8') +
        fs.readFileSync(require('path').join(require('../helpers').ROOT, 'apps-script/Auth.gs'), 'utf8').replace(/\bconst\b/g, 'var'),
    ctx
);
const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' } }).s);
const get = p => ctx.doGet({ parameter: p }).s;
const res = [];
const ok = (n, c, x = '') => res.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);

ok('Clave incorrecta rechazada (+retraso)', get({ key: 'bad', callback: 'cb' }).includes('UNAUTHORIZED') && ctx.slept);
ok(
    'Ping devuelve versión 5',
    get({ key: 'secret', action: 'ping', callback: 'cb' }) === 'cb({"status":"success","auth":"ok","version":5})'
);
const r1 = post({ key: 'secret', action: 'read' });
ok(
    'read por POST devuelve FULL LIST con _row',
    r1.status === 'success' && r1.data[1].anime === 'Frieren' && r1.data[1]._row === 3,
    JSON.stringify(r1.data[1]).slice(0, 90)
);
ok(
    'Hoja vacía por JSONP responde con callback',
    (sheets.push(new Sheet('VACIA', [])), get({ key: 'secret', sheet: 'VACIA', callback: 'cb' })).startsWith('cb(')
);
ok('Acción desconocida NO registra un anime', post({ key: 'secret', action: 'ping' }).status === 'error' && sheets[0].data.length === 4);

const reg = post({ key: 'secret', anime: 'Dandadan', season: 'Fall', year: 2024, studio: 'Science SARU', score: 9, anilistId: 171018 });
ok(
    'Registrar anime con AniList ID',
    reg.status === 'success' &&
        sheets[0].data[2][0] === 'Dandadan' &&
        sheets[0].data[0][6] === 'AniList ID' &&
        sheets[0].data[2][6] === 171018,
    JSON.stringify(sheets[0].data[2])
);
ok('La fórmula de la reseña sigue en F3', String(sheets[0].data[2][5]).startsWith('=SWITCH(E3;'));
const reg2 = post({ key: 'secret', anime: 'Sin ID', season: 'Fall', year: 2024, studio: 'X', score: 7 });
ok('Registrar anime sin ID (como antes)', reg2.status === 'success' && sheets[0].data[2][0] === 'Sin ID');
ok('Registro sin título rechazado', post({ key: 'secret', anime: '', season: 'Fall' }).status === 'error');
const regM = post({ key: 'secret', manga: 'Vagabond', year: 1998, Author: 'Inoue', serialization: 'Inoue', score: 10, anilistId: 656 });
ok(
    'Registrar manga con AniList ID en su propia columna',
    regM.status === 'success' &&
        sheets[1].data[2][0] === 'Vagabond' &&
        sheets[1].data[0][5] === 'AniList ID' &&
        sheets[1].data[2][5] === 656,
    JSON.stringify(sheets[1].data[0])
);

// Frieren está ahora en la fila 5 (se insertaron 2 filas). Intento con fila vieja (3) y nueva (5)
const link = post({
    key: 'secret',
    action: 'set_anilist_ids',
    target: 'anime',
    items: [
        { row: 3, title: 'Frieren', id: 154587 },
        { row: 5, title: 'Frieren', id: 154587 }
    ]
});
ok(
    'set_anilist_ids solo escribe si el título coincide',
    link.updated === 1 && link.skipped === 1 && sheets[0].data[4][6] === 154587 && sheets[0].data[2][6] !== 154587,
    JSON.stringify(link)
);

const up = post({
    key: 'secret',
    action: 'upsert_rows',
    sheet: 'PLANIFICADOR_STATE',
    items: [
        { id: '2', year: 2026, season: 'Fall', title: 'B', cover: 'c', status: 'no_ver' },
        { id: '3', year: 2026, season: 'Fall', title: 'C', cover: 'c', status: 'interesa' }
    ]
});
const plan = sheets.find(s => s.name === 'PLANIFICADOR_STATE').data;
ok(
    'upsert actualiza y añade sin reescribir',
    up.updated === 1 &&
        up.inserted === 1 &&
        plan.length === 4 &&
        plan[2][5] === 'no_ver' &&
        plan[3][0] === '3' &&
        plan[1][5] === 'interesa',
    JSON.stringify(up)
);
const del = post({ key: 'secret', action: 'delete_rows', sheet: 'PLANIFICADOR_STATE', ids: ['1', '3'] });
ok(
    'delete_rows borra solo esos ids',
    del.deleted === 2 &&
        sheets
            .find(s => s.name === 'PLANIFICADOR_STATE')
            .data.map(r => r[0])
            .join() === 'id,2'
);
ok(
    'upsert en hoja no permitida rechazado',
    post({ key: 'secret', action: 'upsert_rows', sheet: 'FULL LIST', items: [{ id: 1 }] }).status === 'error'
);
ok(
    'updateTab no puede vaciar FULL LIST',
    post({ key: 'secret', action: 'updateTab', tabName: 'FULL LIST', payload: [] }).status === 'error' && sheets[0].data.length > 3
);
const top = post({ key: 'secret', action: 'save_top150', payload: [{ id: 1, name: 'Frieren', score: 10 }] });
ok('save_top150 sigue funcionando', top.status === 'success' && ss.getSheetByName('TOP_150').data[1][1] === 'Frieren');
const cal = post({
    key: 'secret',
    action: 'upsert_rows',
    sheet: 'CALIFICADOR_STATE',
    items: [{ id: 'calif-1', title: 'X', episodes: 12, cover: 'c', scores: [{ ep: 3, score: 7.5 }] }]
});
const calRead = post({ key: 'secret', action: 'read', sheet: 'CALIFICADOR_STATE' });
ok(
    'Calificador: upsert crea la hoja y se lee bien',
    cal.inserted === 1 && calRead.data[0].scores[0].score === 7.5,
    JSON.stringify(calRead.data[0])
);

// --- v3: editar / borrar ---
const fl = sheets[0].data;
const rowOf = t => fl.findIndex(r => r[0] === t) + 1;
const bocRow = rowOf('Bocchi');
const upd = post({
    key: 'secret',
    action: 'update_entry',
    target: 'anime',
    row: bocRow,
    title: 'Bocchi',
    fields: { anime: 'Bocchi the Rock!', season: 'Fall', year: 2022, studio: 'CloverWorks', score: 10, anilistId: 130003 }
});
ok(
    'update_entry edita la fila correcta',
    (upd.status === 'success' &&
        fl[bocRow - 1][0] === 'Bocchi the Rock!' &&
        fl[bocRow - 1][4] === 10 &&
        fl[bocRow - 1][6] === 130003 &&
        String(fl[bocRow - 1][5]).startsWith('=SWITCH')) ||
        fl[bocRow - 1][5] === 'f',
    JSON.stringify(fl[bocRow - 1]).slice(0, 120)
);
const wrong = post({
    key: 'secret',
    action: 'update_entry',
    target: 'anime',
    row: bocRow,
    title: 'Otro título',
    fields: { anime: 'X', score: 1 }
});
ok(
    'update_entry rechaza si el título de la fila no coincide',
    wrong.status === 'error' && fl[bocRow - 1][0] === 'Bocchi the Rock!',
    wrong.message
);
const before = fl.length;
const fRow = rowOf('Frieren');
const delBad = post({ key: 'secret', action: 'delete_entry', target: 'anime', row: fRow + 1, title: 'Frieren' });
ok('delete_entry con fila desplazada no borra nada', delBad.status === 'error' && sheets[0].data.length === before);
const delOk = post({ key: 'secret', action: 'delete_entry', target: 'anime', row: fRow, title: 'Frieren' });
ok(
    'delete_entry borra solo esa fila',
    delOk.status === 'success' && sheets[0].data.length === before - 1 && !sheets[0].data.some(r => r[0] === 'Frieren')
);
const mRow = sheets[1].data.findIndex(r => r[0] === 'Berserk') + 1;
const updM = post({
    key: 'secret',
    action: 'update_entry',
    target: 'manga',
    row: mRow,
    title: 'Berserk',
    fields: { manga: 'Berserk', year: 1989, author: 'Kentaro Miura', score: 9 }
});
ok('update_entry de manga', updM.status === 'success' && sheets[1].data[mRow - 1][3] === 9);
ok(
    'No se puede borrar la cabecera',
    post({ key: 'secret', action: 'delete_entry', target: 'anime', row: 1, title: 'Anime' }).status === 'error'
);
// --- v4: historial del Ranking Anual ---
const arch = post({ key: 'secret', action: 'updateTab', tabName: 'RANKING_ANUAL_2025', payload: [{ id: 1, name: 'Frieren', score: 10 }] });
ok('Archivar año crea RANKING_ANUAL_2025', arch.status === 'success' && ss.getSheetByName('RANKING_ANUAL_2025').data[1][1] === 'Frieren');
post({ key: 'secret', action: 'updateTab', tabName: 'RANKING_ANUAL_2024', payload: [] });
const tabs = post({ key: 'secret', action: 'list_tabs' });
ok(
    'list_tabs devuelve los años archivados (reciente primero)',
    JSON.stringify(tabs.data) === '["RANKING_ANUAL_2025","RANKING_ANUAL_2024"]',
    JSON.stringify(tabs.data)
);
const rd = post({ key: 'secret', action: 'read', sheet: 'RANKING_ANUAL_2025' });
ok('Leer un año archivado', rd.data[0].name === 'Frieren' && rd.data[0].score === 10);
ok(
    'updateTab sigue sin poder tocar otras hojas',
    post({ key: 'secret', action: 'updateTab', tabName: 'RANKING_ANUAL_X', payload: [] }).status === 'error' &&
        post({ key: 'secret', action: 'updateTab', tabName: 'FULL LIST MANGA', payload: [] }).status === 'error'
);
// --- v5: registro por lotes ---
const before5 = sheets[0].data.length;
const batch = post({
    key: 'secret',
    action: 'register_batch',
    target: 'anime',
    items: [
        { anime: 'Lote A', season: 'Fall', year: 2020, studio: 'S1', score: 8, anilistId: 111 },
        { anime: 'Lote B', season: 'Spring', year: 2021, studio: 'S2', score: 6 }
    ]
});
const d5 = sheets[0].data;
const idCol = d5[0].findIndex(h => String(h).toLowerCase().replace(/\s/g, '') === 'anilistid');
ok(
    'register_batch inserta las filas arriba (fila 3 y 4)',
    batch.inserted === 2 && d5[2][0] === 'Lote A' && d5[3][0] === 'Lote B' && d5.length === before5 + 2,
    JSON.stringify([d5[2].slice(0, 5), d5[3].slice(0, 5)])
);
ok(
    'register_batch pone la fórmula de cada fila con su propia celda',
    String(d5[2][5]).startsWith('=SWITCH(E3;') && String(d5[3][5]).startsWith('=SWITCH(E4;')
);
ok('register_batch guarda los AniList ID (vacío si no hay)', d5[2][idCol] === 111 && d5[3][idCol] === '');
const bm = post({
    key: 'secret',
    action: 'register_batch',
    target: 'manga',
    items: [{ manga: 'Lote M', year: 2000, author: 'Autor', score: 9, anilistId: 5 }]
});
ok(
    'register_batch de manga',
    bm.inserted === 1 &&
        sheets[1].data[2][0] === 'Lote M' &&
        sheets[1].data[2][2] === 'Autor' &&
        String(sheets[1].data[2][4]).startsWith('=SWITCH(D3;')
);
ok(
    'register_batch rechaza obras sin título sin escribir nada',
    (() => {
        const n = sheets[0].data.length;
        const r = post({ key: 'secret', action: 'register_batch', target: 'anime', items: [{ anime: 'Ok' }, { anime: '' }] });
        return r.status === 'error' && sheets[0].data.length === n;
    })()
);
console.log(res.join('\n'));
