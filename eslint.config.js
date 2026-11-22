// Configuración de ESLint (formato "flat", ESLint 9).
//
// La app usa scripts clásicos que comparten el ámbito global (ver README):
// una función declarada en un archivo se usa en otros y en los onclick del
// HTML. Para que "no-undef" sea útil sin dar falsos avisos, se leen las
// declaraciones de nivel superior de todos los scripts de la app y se dan
// por conocidas. Así sigue detectando lo importante: usar una variable que
// NADIE declara (p. ej. el antiguo _savedTop150, que provocaba ReferenceError).
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const js = require('@eslint/js');
const globals = require('globals');

function listFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? listFiles(p) : p.endsWith('.js') ? [p] : [];
    });
}

// Nombres declarados en el nivel superior de los scripts de la app.
function appGlobals() {
    const names = {};
    for (const file of listFiles(path.join(__dirname, 'js'))) {
        const ast = espree.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
        for (const node of ast.body) {
            if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') names[node.id.name] = 'writable';
            if (node.type === 'VariableDeclaration')
                node.declarations.forEach(d => {
                    if (d.id.type === 'Identifier') names[d.id.name] = 'writable';
                });
        }
    }
    return names;
}

const sharedRules = {
    // Las funciones de nivel superior se usan desde otros archivos o desde el HTML.
    'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
    'no-empty': ['error', { allowEmptyCatch: true }]
};

module.exports = [
    { ignores: ['node_modules/**', 'tests/output/**'] },
    js.configs.recommended,
    {
        // Scripts de la app (navegador, ámbito global compartido)
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: { ...globals.browser, ...appGlobals() }
        },
        rules: { ...sharedRules, 'no-redeclare': 'off' }
    },
    {
        files: ['sw.js'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: globals.serviceworker },
        rules: sharedRules
    },
    {
        // Backend: Google Apps Script (V8). Funciones globales entre archivos .gs.
        files: ['apps-script/**/*.gs'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',
            globals: {
                SpreadsheetApp: 'readonly',
                ContentService: 'readonly',
                LockService: 'readonly',
                PropertiesService: 'readonly',
                Utilities: 'readonly',
                handleGet: 'readonly',
                handlePost: 'readonly',
                OTAKU_API_VERSION: 'readonly'
            }
        },
        // doGet/doPost y las funciones auxiliares las llama Apps Script, no este código.
        // Las reglas de solo estilo se desactivan aquí para no obligar a volver a
        // desplegar el backend por cambios que no alteran su comportamiento.
        rules: {
            ...sharedRules,
            'no-unused-vars': 'off',
            'no-redeclare': ['error', { builtinGlobals: false }],
            'no-prototype-builtins': 'off',
            'no-useless-escape': 'off'
        }
    },
    {
        files: ['tests/**/*.js', 'eslint.config.js'],
        // Las pruebas usan funciones de la app dentro de page.evaluate(...).
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.browser, ...appGlobals() }
        },
        rules: { ...sharedRules, 'no-unused-vars': 'off' }
    }
];
