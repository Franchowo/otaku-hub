#!/usr/bin/env node
// Versión automática de la caché del Service Worker.
// CACHE_NAME se calcula a partir del contenido de todos los archivos de
// APP_SHELL (más el propio sw.js sin la línea de CACHE_NAME). Si cambias
// cualquiera de ellos, la versión cambia y los navegadores descargan la app
// nueva; si no cambias nada, la versión se queda igual.
//   npm run sw:version          → actualiza CACHE_NAME en sw.js
//   node scripts/sw-version.js --check   → solo comprueba (sale con 1 si no coincide)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');
const CACHE_LINE = /^const CACHE_NAME = '([^']*)';$/m;

function computeCacheName(swSource = fs.readFileSync(SW, 'utf8')) {
    const block = swSource.match(/const APP_SHELL = \[([\s\S]*?)\];/);
    if (!block) throw new Error('sw.js no define APP_SHELL');
    const files = [...block[1].matchAll(/'([^']+)'/g)]
        .map(m => m[1].replace(/^\.\//, ''))
        .filter(f => f && f !== '')
        .sort();
    const hash = crypto.createHash('sha256');
    hash.update(swSource.replace(CACHE_LINE, ''));
    for (const f of files) {
        hash.update(`\0${f}\0`);
        // Los finales de línea no deben cambiar la versión (Windows/Linux)
        hash.update(fs.readFileSync(path.join(ROOT, f)).toString('utf8').replace(/\r\n/g, '\n'));
    }
    return `otaku-hub-${hash.digest('hex').slice(0, 8)}`;
}

function currentCacheName(swSource = fs.readFileSync(SW, 'utf8')) {
    const m = swSource.match(CACHE_LINE);
    return m ? m[1] : null;
}

module.exports = { computeCacheName, currentCacheName };

if (require.main === module) {
    const src = fs.readFileSync(SW, 'utf8');
    const want = computeCacheName(src);
    const have = currentCacheName(src);
    if (process.argv.includes('--check')) {
        if (want !== have) {
            console.error(`CACHE_NAME es '${have}' y debería ser '${want}'. Ejecuta: npm run sw:version`);
            process.exit(1);
        }
        console.log(`CACHE_NAME al día (${have})`);
    } else if (want === have) {
        console.log(`CACHE_NAME ya estaba al día (${have})`);
    } else {
        fs.writeFileSync(SW, src.replace(CACHE_LINE, `const CACHE_NAME = '${want}';`));
        console.log(`CACHE_NAME: ${have} → ${want}`);
    }
}
