// --- SERVICE WORKER: instalación y aviso de nueva versión ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const hadController = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('No se pudo instalar el Service Worker:', err));

        // Una versión nueva de la app ha tomado el control: proponer recargar
        // para que todos los archivos sean de la misma versión.
        let notified = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController || notified) return;
            notified = true;
            toast('OTAKU HUB se ha actualizado.', {
                type: 'info', duration: 15000,
                action: { label: 'Recargar', onClick: () => { if (!hasUnsavedChanges()) location.reload(); else toast('Guarda tus cambios antes de recargar.', { type: 'error' }); } }
            });
        });
    });
}
