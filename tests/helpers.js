// Utilidades compartidas por las pruebas.
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
// Capturas y archivos generados por las pruebas (ignorado por git).
const OUTPUT = path.join(__dirname, 'output');
fs.mkdirSync(OUTPUT, { recursive: true });

module.exports = { ROOT, OUTPUT };
