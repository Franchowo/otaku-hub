// --- SISTEMA DE ROTACIÓN Y PANTALLA COMPLETA ---
async function toggleLandscape() {
    try {
        if (!document.fullscreenElement) {
            // 1. Solicitamos entrar en pantalla completa (requisito de seguridad de los navegadores)
            await document.documentElement.requestFullscreen();

            // 2. Intentamos bloquear la pantalla en modo horizontal
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
            }
        } else {
            // Si ya estamos en pantalla completa, salimos y liberamos la orientación
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            }
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        }
    } catch (err) {
        console.warn('Rotación forzada no soportada:', err);
        toast('Tu navegador (p. ej. Safari en iPhone) no permite girar la pantalla automáticamente. Gira el dispositivo a mano.', {
            type: 'info',
            duration: 6000
        });
    }
}
