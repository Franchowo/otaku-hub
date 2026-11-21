if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').then(reg => console.log('OTAKU HUB App instalada correctamente.', reg.scope)).catch(err => console.log('Error al instalar la app:', err)); });
}
