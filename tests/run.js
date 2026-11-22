#!/usr/bin/env node
// =====================================================================
// Ejecutor de pruebas de OTAKU HUB
//   npm test             → pruebas unitarias (backend) + de navegador (e2e)
//   npm run test:online  → pruebas contra AniList real (necesitan internet)
//   node tests/run.js fase2b   → solo las suites cuyo nombre contenga "fase2b"
//
// Cada suite es un script que imprime una línea por comprobación:
//   ✅ … (bien)   ❌ … (fallo)   ⚠️ … (error de JavaScript en la página)
// Una suite falla si: sale con error, tiene alguna ❌ o ⚠️, o no imprime
// ninguna ✅ (se interrumpió antes de comprobar nada).
// =====================================================================
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const online = args.includes('--online');
const filter = args.find(a => !a.startsWith('--'));
const dirs = online ? ['online'] : ['unit', 'e2e'];
const CONCURRENCY = Number(process.env.TEST_CONCURRENCY) || 3;
const TIMEOUT_MS = 5 * 60 * 1000;

const suites = dirs
    .flatMap(d =>
        fs
            .readdirSync(path.join(__dirname, d))
            .filter(f => f.endsWith('.test.js'))
            .map(f => path.join(d, f))
    )
    .filter(f => !filter || f.includes(filter));

if (!suites.length) {
    console.error('No hay suites que coincidan.');
    process.exit(1);
}

function runSuite(rel) {
    return new Promise(resolve => {
        const started = Date.now();
        const child = spawn(process.execPath, [path.join(__dirname, rel)], { cwd: path.resolve(__dirname, '..') });
        let out = '';
        child.stdout.on('data', d => {
            out += d;
        });
        child.stderr.on('data', d => {
            out += d;
        });
        const timer = setTimeout(() => {
            out += '\n⚠️ Tiempo agotado (5 min)';
            child.kill('SIGKILL');
        }, TIMEOUT_MS);
        child.on('close', code => {
            clearTimeout(timer);
            const lines = out.split('\n');
            const ok = lines.filter(l => l.startsWith('✅')).length;
            const bad = lines.filter(l => l.startsWith('❌') || l.startsWith('⚠️'));
            const failed = code !== 0 || bad.length > 0 || ok === 0;
            resolve({ rel, ok, bad, failed, code, out, seconds: ((Date.now() - started) / 1000).toFixed(1) });
        });
    });
}

(async () => {
    console.log(`Ejecutando ${suites.length} suites (${CONCURRENCY} a la vez)…\n`);
    const queue = [...suites],
        results = [];
    await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
            while (queue.length) {
                const r = await runSuite(queue.shift());
                results.push(r);
                console.log(`${r.failed ? '❌' : '✅'} ${r.rel}  (${r.ok} comprobaciones, ${r.seconds} s)`);
                if (r.failed) {
                    r.bad.forEach(l => console.log(`     ${l}`));
                    if (!r.bad.length) {
                        console.log(`     Salió con código ${r.code} y ${r.ok} comprobaciones. Últimas líneas:`);
                        r.out
                            .trim()
                            .split('\n')
                            .slice(-8)
                            .forEach(l => console.log(`     | ${l}`));
                    }
                }
            }
        })
    );
    const failed = results.filter(r => r.failed);
    const total = results.reduce((s, r) => s + r.ok, 0);
    console.log(
        `\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} suites bien · ${total} comprobaciones superadas`
    );
    process.exit(failed.length ? 1 : 0);
})();
