// Comprueba que el Service Worker precarga todo lo que usa la página.
// Si un script o estilo de index.html no está en APP_SHELL (sw.js), la app
// funciona con conexión pero falla SIN ella; y si APP_SHELL nombra un archivo
// que no existe, el Service Worker no llega a instalarse.
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../helpers');

const results = [];
const check = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const shellBlock = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
check('sw.js define APP_SHELL', !!shellBlock);
const shell = shellBlock ? [...shellBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, '')) : [];

// Recursos locales de la página (scripts, estilos, manifest, icono)
const local = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|json|png))"/g)].map(m => m[1].replace(/^\.\//, ''));
const missingInShell = local.filter(f => !shell.includes(f));
check(`Todo lo que carga index.html está en APP_SHELL (${local.length} archivos)`, missingInShell.length === 0, missingInShell.join(', '));

// Iconos del manifest
const icons = manifest.icons.map(i => i.src.replace(/^\.\//, ''));
const iconsMissing = icons.filter(f => !shell.includes(f));
check('Los iconos del manifest están en APP_SHELL', iconsMissing.length === 0, iconsMissing.join(', '));

// Todo lo de APP_SHELL existe
const notFound = shell.filter(f => f !== '' && !fs.existsSync(path.join(ROOT, f)));
check(`Todos los archivos de APP_SHELL existen (${shell.length})`, notFound.length === 0, notFound.join(', '));

// Ningún script de js/ se queda fuera de la página (se habría olvidado añadirlo)
const listJs = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? listJs(p) : p.endsWith('.js') ? [path.relative(ROOT, p)] : [];
    });
const orphan = listJs(path.join(ROOT, 'js')).filter(f => !local.includes(f));
check('Todos los scripts de js/ se cargan en index.html', orphan.length === 0, orphan.join(', '));

console.log(results.join('\n'));
