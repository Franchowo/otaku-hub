// =====================================================================
// ALMACÉN LOCAL (IndexedDB)
// ---------------------------------------------------------------------
// Guarda en el dispositivo la última copia de cada hoja y la cola de
// escrituras pendientes. IndexedDB admite mucho más que localStorage
// (que ya usan las URLs de portadas) y no bloquea la página.
// Si IndexedDB no está disponible (modo privado antiguo), todo sigue
// funcionando sin copia local.
// =====================================================================

const LOCAL_DB_NAME = 'otaku-hub';
const LOCAL_DB_VERSION = 1;
let _localDbPromise = null;

function openLocalDb() {
    if (!_localDbPromise) {
        _localDbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) return reject(new Error('IndexedDB no disponible'));
            const req = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('sheets')) db.createObjectStore('sheets'); // copia de cada hoja
                if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { autoIncrement: true }); // escrituras pendientes
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }).catch(err => {
            _localDbPromise = null;
            throw err;
        });
    }
    return _localDbPromise;
}

function localTx(store, mode, fn) {
    return openLocalDb().then(
        db =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(store, mode);
                const result = fn(tx.objectStore(store));
                tx.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            })
    );
}

// --- Copia de las hojas ---
function saveSheetSnapshot(key, data) {
    return localTx('sheets', 'readwrite', s => s.put({ data, savedAt: Date.now() }, key)).catch(() => {});
}

// Devuelve { data, savedAt } o null.
function loadSheetSnapshot(key) {
    return localTx('sheets', 'readonly', s => s.get(key))
        .then(r => r || null)
        .catch(() => null);
}

function clearSheetSnapshots() {
    return localTx('sheets', 'readwrite', s => s.clear()).catch(() => {});
}

// --- Cola de escrituras sin conexión ---
function outboxAdd(entry) {
    return localTx('outbox', 'readwrite', s => s.add({ ...entry, queuedAt: Date.now() }));
}

// Devuelve [{ id, payload, minVersion, label, queuedAt }] en orden de llegada.
function outboxList() {
    return openLocalDb()
        .then(
            db =>
                new Promise((resolve, reject) => {
                    const items = [];
                    const req = db.transaction('outbox', 'readonly').objectStore('outbox').openCursor();
                    req.onsuccess = () => {
                        const cursor = req.result;
                        if (cursor) {
                            items.push({ id: cursor.key, ...cursor.value });
                            cursor.continue();
                        } else resolve(items);
                    };
                    req.onerror = () => reject(req.error);
                })
        )
        .catch(() => []);
}

function outboxRemove(id) {
    return localTx('outbox', 'readwrite', s => s.delete(id)).catch(() => {});
}

// Fecha legible de una copia ("hoy a las 18:05", "el 3 de marzo").
function formatSnapshotDate(ts) {
    const d = new Date(ts);
    const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return `hoy a las ${time}`;
    return `el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} a las ${time}`;
}
